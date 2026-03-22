import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import Stripe from "stripe";
import { env, PLANS, TOPUP, TONES, RECIPIENTS } from "./config.js";
import {
  addBonusRequests,
  addUsage,
  consumeBonusRequest,
  createOrGetUser,
  dbHealth,
  ensureMonthlyUsage,
  getCurrentMonthlyUsage,
  getUserByApiKey,
  getUserByStripeCustomer,
  hasBillingEvent,
  insertBillingEvent,
  updatePlan,
  updateStripeCustomer
} from "./db.js";
import { buildRewritePrompt, sanitizeRecipient, sanitizeTone } from "./prompt.js";

const app = express();

const openai = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: env.openaiTimeoutMs })
  : null;

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const parts = [];

  for (const item of output) {
    const contents = Array.isArray(item?.content) ? item.content : [];
    for (const content of contents) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      } else if (typeof content?.output_text === "string" && content.output_text.trim()) {
        parts.push(content.output_text.trim());
      } else if (typeof content?.value === "string" && content.value.trim()) {
        parts.push(content.value.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function pickPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

function usageSummary(user, monthly) {
  const plan = pickPlan(user.plan_id);
  return {
    planId: user.plan_id,
    planName: plan.name,
    monthlyPriceKrw: plan.monthlyPriceKrw,
    limits: {
      maxMonthlyRequests: plan.maxMonthlyRequests,
      maxMonthlyInputTokens: plan.maxMonthlyInputTokens,
      maxMonthlyOutputTokens: plan.maxMonthlyOutputTokens,
      maxCharsPerRequest: plan.maxCharsPerRequest
    },
    usage: {
      requestCount: monthly.request_count,
      inputTokens: monthly.input_tokens,
      outputTokens: monthly.output_tokens,
      bonusRequestsRemaining: user.bonus_requests_remaining
    }
  };
}

const rewriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
});

app.use(
  cors({
    origin: env.allowedOrigins === "*" ? true : env.allowedOrigins.split(",").map((v) => v.trim()),
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key", "stripe-signature"]
  })
);

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !env.stripeWebhookSecret) {
    return res.status(500).send("Stripe webhook not configured");
  }

  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (hasBillingEvent(event.id)) {
    return res.json({ received: true, duplicated: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = Number(session.metadata?.userId || 0);
      const kind = session.metadata?.kind;
      if (userId > 0) {
        if (kind === "plan") {
          const planId = session.metadata?.planId;
          updatePlan({
            userId,
            planId,
            stripeCustomerId: String(session.customer || ""),
            stripeSubscriptionId: String(session.subscription || ""),
            subscriptionStatus: "active"
          });
        } else if (kind === "topup") {
          addBonusRequests(userId, TOPUP.requests);
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = String(subscription.customer || "");
      const user = getUserByStripeCustomer(customerId);
      if (user) {
        updatePlan({
          userId: user.id,
          planId: "free",
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
          subscriptionStatus: "canceled"
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = String(invoice.customer || "");
      const user = getUserByStripeCustomer(customerId);
      if (user) {
        updatePlan({
          userId: user.id,
          planId: "free",
          stripeCustomerId: customerId,
          stripeSubscriptionId: user.stripe_subscription_id,
          subscriptionStatus: "past_due"
        });
      }
    }

    insertBillingEvent({
      stripeEventId: event.id,
      userId: null,
      eventType: event.type,
      payload: { id: event.id, type: event.type }
    });

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Webhook 처리 실패" });
  }
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: dbHealth(), now: new Date().toISOString() });
});

app.get("/api/meta", (_req, res) => {
  res.json({
    tones: TONES,
    recipients: RECIPIENTS,
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      monthlyPriceKrw: p.monthlyPriceKrw,
      limits: {
        maxMonthlyRequests: p.maxMonthlyRequests,
        maxMonthlyInputTokens: p.maxMonthlyInputTokens,
        maxMonthlyOutputTokens: p.maxMonthlyOutputTokens,
        maxCharsPerRequest: p.maxCharsPerRequest
      }
    })),
    topup: TOPUP,
    billing: {
      enabled: Boolean(stripe),
      hasPlanPrices: Boolean(env.stripePriceProMonthly && env.stripePriceBusinessMonthly),
      hasTopupPrice: Boolean(TOPUP.stripePriceId)
    }
  });
});

app.post("/api/auth/register", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "유효한 이메일을 입력해 주세요." });
  }

  const user = createOrGetUser(email);
  const monthly = ensureMonthlyUsage(user.id);
  return res.json({
    apiKey: user.api_key,
    email: user.email,
    ...usageSummary(user, monthly)
  });
});

function auth(req, res, next) {
  const apiKey = String(req.header("x-api-key") || "").trim();
  if (!apiKey) return res.status(401).json({ error: "API 키가 필요합니다." });
  const user = getUserByApiKey(apiKey);
  if (!user) return res.status(401).json({ error: "유효하지 않은 API 키입니다." });
  req.user = user;
  next();
}

app.get("/api/me", auth, (req, res) => {
  const monthly = getCurrentMonthlyUsage(req.user.id);
  res.json({ email: req.user.email, ...usageSummary(req.user, monthly) });
});

app.post("/api/rewrite", rewriteLimiter, auth, async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
  }

  const user = req.user;
  const plan = pickPlan(user.plan_id);
  const monthly = getCurrentMonthlyUsage(user.id);

  const originalText = String(req.body?.originalText || "").trim();
  const tone = sanitizeTone(req.body?.tone);
  const recipient = sanitizeRecipient(req.body?.recipient);
  const senderRole = String(req.body?.senderRole || "발신자").trim();

  if (!originalText) {
    return res.status(400).json({ error: "원본 문자를 입력해 주세요." });
  }

  if (originalText.length > plan.maxCharsPerRequest) {
    return res.status(400).json({
      error: `현재 플랜의 1회 최대 글자 수(${plan.maxCharsPerRequest}자)를 초과했습니다.`
    });
  }

  const requestLimitExceeded = monthly.request_count >= plan.maxMonthlyRequests;
  const tokenLimitExceeded =
    monthly.input_tokens >= plan.maxMonthlyInputTokens || monthly.output_tokens >= plan.maxMonthlyOutputTokens;

  if (requestLimitExceeded || tokenLimitExceeded) {
    const usedBonus = consumeBonusRequest(user.id);
    if (!usedBonus) {
      return res.status(402).json({
        error: "월 사용량 한도를 초과했습니다. 플랜 업그레이드 또는 추가 10회 충전이 필요합니다."
      });
    }
  }

  const { system, context } = buildRewritePrompt({ tone, recipient, senderRole });

  try {
    let inputTokens = 0;
    let outputTokens = 0;

    const response = await openai.responses.create({
      model: plan.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: `${context}\n\n원본 문자:\n${originalText}` }]
        }
      ],
      max_output_tokens: 700
    });

    let rewritten = extractResponseText(response);
    const usage = response.usage || {};
    inputTokens += Number(usage.input_tokens || 0);
    outputTokens += Number(usage.output_tokens || 0);

    if (!rewritten) {
      const fallbackModel = env.openaiChatFallbackModel || plan.model;
      const chat = await openai.chat.completions.create({
        model: fallbackModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${context}\n\n원본 문자:\n${originalText}` }
        ],
        max_completion_tokens: 700
      });

      rewritten = String(chat.choices?.[0]?.message?.content || "").trim();
      inputTokens += Number(chat.usage?.prompt_tokens || 0);
      outputTokens += Number(chat.usage?.completion_tokens || 0);
    }

    const updated = addUsage(user.id, inputTokens, outputTokens);

    if (!rewritten) {
      return res.status(502).json({ error: "변환 결과를 생성하지 못했습니다. 다시 시도해 주세요." });
    }

    return res.json({
      rewrittenText: rewritten,
      usage: {
        inputTokens,
        outputTokens,
        monthly: usageSummary(getUserByApiKey(user.api_key), updated).usage
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "문장 변환에 실패했습니다." });
  }
});

app.post("/api/billing/create-checkout", auth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe가 설정되지 않았습니다." });

  const user = req.user;
  const planId = String(req.body?.planId || "").trim();
  if (!["pro", "business"].includes(planId)) {
    return res.status(400).json({ error: "지원하지 않는 플랜입니다." });
  }

  const priceId = planId === "pro" ? env.stripePriceProMonthly : env.stripePriceBusinessMonthly;
  if (!priceId) return res.status(500).json({ error: "Stripe Price ID가 설정되지 않았습니다." });

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      updateStripeCustomer(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appBaseUrl}/billing/cancel`,
      metadata: {
        kind: "plan",
        userId: String(user.id),
        planId
      }
    });

    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "결제 세션 생성 실패" });
  }
});

app.post("/api/billing/create-topup", auth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe가 설정되지 않았습니다." });
  if (!TOPUP.stripePriceId) return res.status(500).json({ error: "Topup Price ID가 설정되지 않았습니다." });

  const user = req.user;

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      updateStripeCustomer(user.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: TOPUP.stripePriceId, quantity: 1 }],
      success_url: `${env.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appBaseUrl}/billing/cancel`,
      metadata: {
        kind: "topup",
        userId: String(user.id)
      }
    });

    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "충전 세션 생성 실패" });
  }
});

app.post("/api/billing/create-portal", auth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe가 설정되지 않았습니다." });
  if (!req.user.stripe_customer_id) return res.status(400).json({ error: "결제 고객 정보가 없습니다." });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${env.appBaseUrl}/billing/return`
    });
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "포털 세션 생성 실패" });
  }
});

app.get("/billing/success", (_req, res) => {
  res.send("결제가 완료되었습니다. 익스텐션으로 돌아가 상태를 새로고침하세요.");
});

app.get("/billing/cancel", (_req, res) => {
  res.send("결제가 취소되었습니다.");
});

app.get("/billing/return", (_req, res) => {
  res.send("결제 포털에서 돌아왔습니다.");
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Polite Message backend listening on ${env.port}`);
});
