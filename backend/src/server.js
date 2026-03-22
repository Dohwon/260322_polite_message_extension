import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import Stripe from "stripe";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, PLANS, TOPUP, TONES, RECIPIENTS } from "./config.js";
import {
  addBonusRequests,
  addUsage,
  clearUserSession,
  consumeFreeCredit,
  createTossOrder,
  consumeBonusRequest,
  createOrGetUser,
  dbHealth,
  ensureMonthlyUsage,
  getTossOrdersByUser,
  getTossOrderByOrderId,
  getUserByEmail,
  getCurrentMonthlyUsage,
  getUserByApiKey,
  getUserBySessionToken,
  getUserByStripeCustomer,
  hasBillingEvent,
  insertBillingEvent,
  markTossOrderPaid,
  setPasswordHash,
  setUserSession,
  updatePlan,
  updateStripeCustomer
} from "./db.js";
import { buildRewritePrompt, sanitizeRecipient, sanitizeTone } from "./prompt.js";

const app = express();
app.set("trust proxy", 1);

const openai = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: env.openaiTimeoutMs })
  : null;

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
const tossEnabled = Boolean(env.tossClientKey && env.tossSecretKey);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const plansLandingPath = path.join(__dirname, "plans-landing.html");

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

function nowPlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, oldHash] = stored.split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(oldHash, "hex"), Buffer.from(hash, "hex"));
}

function createSession(userId, rememberMe) {
  return {
    token: `st_${crypto.randomBytes(24).toString("hex")}_${userId}`,
    expiresAt: nowPlusDays(rememberMe ? 30 : 1)
  };
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
      bonusRequestsRemaining: user.bonus_requests_remaining,
      freeCreditsRemaining: user.free_credits_remaining ?? 0,
      freeCreditsTotal: 5
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
    allowedHeaders: ["Content-Type", "x-api-key", "x-session-token", "stripe-signature"]
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
      enabled: true,
      provider: tossEnabled ? "toss" : "plans-only",
      hasPlanPrices: true,
      hasTopupPrice: true
    }
  });
});

app.post("/api/auth/signup", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const rememberMe = Boolean(req.body?.rememberMe);
  if (!email || !email.includes("@") || password.length < 6) {
    return res.status(400).json({ error: "이메일/비밀번호(6자 이상)를 확인해 주세요." });
  }

  const user = createOrGetUser(email);
  if (user.password_hash) {
    return res.status(409).json({ error: "이미 가입된 이메일입니다. 로그인해 주세요." });
  }
  setPasswordHash(user.id, hashPassword(password));
  const session = createSession(user.id, rememberMe);
  const updatedUser = setUserSession(user.id, session.token, session.expiresAt);
  const monthly = ensureMonthlyUsage(updatedUser.id);
  return res.json({
    sessionToken: session.token,
    email: updatedUser.email,
    ...usageSummary(updatedUser, monthly)
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const rememberMe = Boolean(req.body?.rememberMe);
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash || "")) {
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }
  const session = createSession(user.id, rememberMe);
  const updatedUser = setUserSession(user.id, session.token, session.expiresAt);
  const monthly = ensureMonthlyUsage(updatedUser.id);
  return res.json({
    sessionToken: session.token,
    email: updatedUser.email,
    ...usageSummary(updatedUser, monthly)
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
    apiKey: user.api_key, // legacy fallback
    email: user.email,
    ...usageSummary(user, monthly)
  });
});

function auth(req, res, next) {
  const sessionToken = String(req.header("x-session-token") || "").trim();
  if (sessionToken) {
    const userBySession = getUserBySessionToken(sessionToken);
    if (!userBySession) return res.status(401).json({ error: "세션이 만료되었습니다. 다시 로그인해 주세요." });
    req.user = userBySession;
    return next();
  }

  const apiKey = String(req.header("x-api-key") || "").trim();
  if (!apiKey) return res.status(401).json({ error: "로그인이 필요합니다." });
  const user = getUserByApiKey(apiKey);
  if (!user) return res.status(401).json({ error: "유효하지 않은 API 키입니다." });
  req.user = user;
  return next();
}

app.get("/api/me", auth, (req, res) => {
  const monthly = getCurrentMonthlyUsage(req.user.id);
  res.json({ email: req.user.email, ...usageSummary(req.user, monthly) });
});

app.get("/api/auth/session", auth, (req, res) => {
  const monthly = getCurrentMonthlyUsage(req.user.id);
  return res.json({ ok: true, email: req.user.email, ...usageSummary(req.user, monthly) });
});

app.post("/api/auth/logout", auth, (req, res) => {
  clearUserSession(req.user.id);
  return res.json({ ok: true });
});

app.get("/api/payments", auth, (req, res) => {
  return res.json({ items: getTossOrdersByUser(req.user.id) });
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

  if (user.plan_id === "free") {
    if ((user.free_credits_remaining ?? 0) <= 0) {
      return res.status(402).json({
        error: "무료 5회를 모두 사용했습니다. 요금제를 선택해 주세요."
      });
    }
  } else {
    const hasRequestLimit = Number.isFinite(plan.maxMonthlyRequests);
    const requestLimitExceeded = hasRequestLimit && monthly.request_count >= plan.maxMonthlyRequests;
    const hasInputTokenLimit = Number.isFinite(plan.maxMonthlyInputTokens);
    const hasOutputTokenLimit = Number.isFinite(plan.maxMonthlyOutputTokens);
    const tokenLimitExceeded =
      (hasInputTokenLimit && monthly.input_tokens >= plan.maxMonthlyInputTokens) ||
      (hasOutputTokenLimit && monthly.output_tokens >= plan.maxMonthlyOutputTokens);
    if (requestLimitExceeded || tokenLimitExceeded) {
      const usedBonus = consumeBonusRequest(user.id);
      if (!usedBonus) {
        return res.status(402).json({
          error: "월 사용량 한도를 초과했습니다. 플랜 업그레이드 또는 추가 10회 충전이 필요합니다."
        });
      }
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
    if (user.plan_id === "free") {
      consumeFreeCredit(user.id);
    }
    const refreshedUser = getUserByApiKey(user.api_key) || req.user;

    if (!rewritten) {
      return res.status(502).json({ error: "변환 결과를 생성하지 못했습니다. 다시 시도해 주세요." });
    }

    return res.json({
      rewrittenText: rewritten,
      usage: {
        inputTokens,
        outputTokens,
        monthly: usageSummary(refreshedUser, updated).usage
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "문장 변환에 실패했습니다." });
  }
});

app.post("/api/billing/create-checkout", auth, async (req, res) => {
  const planId = String(req.body?.planId || "").trim();
  if (!["pro", "business"].includes(planId)) {
    return res.status(400).json({ error: "지원하지 않는 플랜입니다." });
  }
  const url = `${env.appBaseUrl}/billing/plans?target=${encodeURIComponent(planId)}`;
  return res.json({ url });
});

app.post("/api/billing/create-topup", auth, async (req, res) => {
  const url = `${env.appBaseUrl}/billing/plans?target=topup10`;
  return res.json({ url });
});

app.get("/billing/toss/checkout", (req, res) => {
  const orderId = String(req.query.orderId || "").trim();
  const order = getTossOrderByOrderId(orderId);
  if (!order) {
    return res.status(404).send("유효하지 않은 주문입니다.");
  }

  const isPlan = order.kind === "plan";
  const title = isPlan
    ? order.plan_id === "pro"
      ? "Pro 월 이용권"
      : "Business 월 이용권"
    : "10회 충전권";

  const customerKey = `user_${order.user_id}`;
  const successUrl = `${env.appBaseUrl}/billing/toss/success?orderId=${encodeURIComponent(order.order_id)}`;
  const failUrl = `${env.appBaseUrl}/billing/toss/fail?orderId=${encodeURIComponent(order.order_id)}`;

  const html = `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>결제 진행 - Polite Message Rewriter</title>
    <style>
      body { font-family: Pretendard, 'Noto Sans KR', sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #20253a; }
      .card { border: 1px solid #d9ddf8; border-radius: 12px; padding: 20px; background: #fff; }
      button { width: 100%; border: 0; border-radius: 10px; padding: 12px; background: #2a62f4; color: #fff; font-size: 15px; cursor: pointer; }
      h1 { margin-top: 0; }
      ul { line-height: 1.6; }
    </style>
    <script src="https://js.tosspayments.com/v1"></script>
  </head>
  <body>
    <h1>Polite Message Rewriter 요금 안내</h1>
    <div class="card">
      <h2>${title}</h2>
      <p><b>결제금액:</b> ${order.amount.toLocaleString("ko-KR")}원</p>
      <p><b>Pro vs Business</b></p>
      <ul>
        <li>Pro: 개인/소규모 사용, 월 100회</li>
        <li>Business: 팀 사용, 요청/월 토큰 무제한(1회 5,000자 제한)</li>
      </ul>
      <button id="payBtn">토스 결제하기</button>
    </div>
    <script>
      const tossPayments = TossPayments("${env.tossClientKey}");
      document.getElementById("payBtn").addEventListener("click", function () {
        tossPayments.requestPayment("카드", {
          amount: ${order.amount},
          orderId: "${order.order_id}",
          orderName: "${title}",
          customerName: "Polite User",
          customerEmail: "user${order.user_id}@pm.local",
          successUrl: "${successUrl}",
          failUrl: "${failUrl}"
        });
      });
    </script>
  </body>
  </html>`;

  return res.type("html").send(html);
});

app.get("/billing/toss/success", async (req, res) => {
  const orderId = String(req.query.orderId || req.query.orderId || "").trim();
  const paymentKey = String(req.query.paymentKey || "").trim();
  const amount = Number(req.query.amount || 0);

  if (!orderId || !paymentKey || !amount) {
    return res.status(400).send("결제 확인 파라미터가 누락되었습니다.");
  }

  const order = getTossOrderByOrderId(orderId);
  if (!order) return res.status(404).send("주문 정보를 찾을 수 없습니다.");
  if (order.status === "paid") return res.send("이미 처리된 결제입니다.");
  if (order.amount !== amount) return res.status(400).send("결제 금액이 일치하지 않습니다.");

  try {
    const auth = Buffer.from(`${env.tossSecretKey}:`).toString("base64");
    const confirmRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    if (!confirmRes.ok) {
      const txt = await confirmRes.text();
      return res.status(400).send(`결제 승인 실패: ${txt}`);
    }

    markTossOrderPaid(orderId, paymentKey);

    if (order.kind === "plan" && ["pro", "business"].includes(order.plan_id || "")) {
      updatePlan({
        userId: order.user_id,
        planId: order.plan_id,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: "active"
      });
    }
    if (order.kind === "topup") {
      addBonusRequests(order.user_id, TOPUP.requests);
    }

    return res.send("결제가 완료되었습니다. 익스텐션으로 돌아가 다시 시도해 주세요.");
  } catch (err) {
    return res.status(500).send(`결제 승인 처리 중 오류: ${err?.message || "unknown"}`);
  }
});

app.post("/api/billing/create-portal", auth, async (req, res) => {
  return res.status(400).json({ error: "Toss 결제는 포털이 없습니다. 결제 페이지에서 다시 구매해 주세요." });
});

app.get("/billing/toss/fail", (req, res) => {
  const code = String(req.query.code || "");
  const message = String(req.query.message || "결제가 취소되었거나 실패했습니다.");
  res.status(400).send(`결제 실패 [${code}]: ${message}`);
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

app.get("/billing/plans", (_req, res) => {
  res.sendFile(plansLandingPath);
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Polite Message backend listening on ${env.port}`);
});
