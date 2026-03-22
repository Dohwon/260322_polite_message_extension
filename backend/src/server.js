import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, PLANS, TONES, RECIPIENTS } from "./config.js";
import {
  addUsage,
  clearUserSession,
  consumeFreeCredit,
  createTossOrder,
  createOrGetUser,
  dbHealth,
  ensureMonthlyUsage,
  getTossOrdersByUser,
  getTossOrderByOrderId,
  getCurrentMonthlyUsage,
  getUserByGoogleSub,
  getUserBySessionToken,
  linkGoogleAccount,
  markTossOrderPaid,
  setUserSession,
  updatePlan
} from "./db.js";
import { buildRewritePrompt, sanitizeRecipient, sanitizeTone } from "./prompt.js";

const app = express();
app.set("trust proxy", 1);

const openai = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: env.openaiTimeoutMs })
  : null;

const tossEnabled = Boolean(env.tossClientKey && env.tossSecretKey);
const googleAuthEnabled = Boolean(env.googleClientId && env.googleClientSecret);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const plansLandingPath = path.join(__dirname, "plans-landing.html");
const oauthPendingStates = new Map();
const oauthDeviceResults = new Map();

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

function createSession(userId, rememberMe) {
  return {
    token: `st_${crypto.randomBytes(24).toString("hex")}_${userId}`,
    expiresAt: nowPlusDays(rememberMe ? 30 : 1)
  };
}

function createNonce(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

function safeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSimplePage(title, body) {
  return `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeHtml(title)}</title>
      <style>
        body { font-family: Pretendard, 'Noto Sans KR', sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #1a1d2a; line-height: 1.65; }
        h1 { margin-bottom: 12px; }
        .card { border: 1px solid #d6dcef; border-radius: 12px; padding: 18px; background: #fff; }
      </style>
    </head>
    <body>
      <h1>${safeHtml(title)}</h1>
      <div class="card">${body}</div>
    </body>
  </html>`;
}

function usageSummary(user, monthly) {
  const plan = pickPlan(user.plan_id);
  return {
    planId: user.plan_id,
    planName: plan.name,
    monthlyPriceKrw: plan.monthlyPriceKrw,
    yearlyPriceKrw: plan.yearlyPriceKrw ?? null,
    billingCycle: plan.billingCycle || "monthly",
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
      freeCreditsRemaining: user.free_credits_remaining ?? 0,
      freeCreditsTotal: PLANS.free.maxMonthlyRequests
    },
    member: {
      isRegistered: Boolean(user.id),
      authProvider: user.auth_provider || null,
      hasGoogleAuth: Boolean(user.google_sub)
    }
  };
}

function cleanupOauthCache() {
  const now = Date.now();
  for (const [state, row] of oauthPendingStates.entries()) {
    if (row.expiresAtMs < now) oauthPendingStates.delete(state);
  }
  for (const [deviceId, row] of oauthDeviceResults.entries()) {
    if (row.expiresAtMs < now) oauthDeviceResults.delete(deviceId);
  }
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
    allowedHeaders: ["Content-Type", "x-session-token"]
  })
);

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
      yearlyPriceKrw: p.yearlyPriceKrw ?? null,
      billingCycle: p.billingCycle || "monthly",
      limits: {
        maxMonthlyRequests: p.maxMonthlyRequests,
        maxMonthlyInputTokens: p.maxMonthlyInputTokens,
        maxMonthlyOutputTokens: p.maxMonthlyOutputTokens,
        maxCharsPerRequest: p.maxCharsPerRequest
      }
    })),
    billing: {
      enabled: tossEnabled,
      provider: tossEnabled ? "toss" : "disabled",
      hasPlanPrices: true,
      hasTopupPrice: false
    },
    auth: {
      provider: "google",
      passwordLoginEnabled: false,
      googleEnabled: googleAuthEnabled
    }
  });
});

app.post("/api/auth/signup", (_req, res) => {
  return res.status(410).json({ error: "이메일 회원가입은 중단되었습니다. Google 로그인만 지원합니다." });
});

app.post("/api/auth/login", (_req, res) => {
  return res.status(410).json({ error: "이메일 로그인은 중단되었습니다. Google 로그인만 지원합니다." });
});

app.post("/api/auth/register", (_req, res) => {
  return res.status(410).json({ error: "이메일 가입은 중단되었습니다. Google 로그인만 지원합니다." });
});

app.get("/api/auth/google/start", (req, res) => {
  if (!googleAuthEnabled) {
    return res.status(500).send("Google OAuth 환경변수가 설정되지 않았습니다.");
  }

  cleanupOauthCache();
  const deviceId = String(req.query.deviceId || "").trim();
  if (!/^[a-zA-Z0-9_-]{12,120}$/.test(deviceId)) {
    return res.status(400).send("유효하지 않은 로그인 요청입니다. 익스텐션에서 다시 시도해 주세요.");
  }

  const state = createNonce("go");
  oauthPendingStates.set(state, { deviceId, expiresAtMs: Date.now() + 10 * 60 * 1000 });

  const redirectUri = env.googleRedirectUri || `${env.appBaseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account"
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/auth/google/config", (_req, res) => {
  const missing = [];
  if (!env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!env.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!env.googleRedirectUri && !env.appBaseUrl) missing.push("GOOGLE_REDIRECT_URI");
  return res.json({
    enabled: googleAuthEnabled,
    redirectUri: env.googleRedirectUri || `${env.appBaseUrl}/api/auth/google/callback`,
    missing
  });
});

app.get("/api/auth/google/callback", async (req, res) => {
  if (!googleAuthEnabled) {
    return res.status(500).send("Google OAuth 환경변수가 설정되지 않았습니다.");
  }

  cleanupOauthCache();
  const state = String(req.query.state || "").trim();
  const code = String(req.query.code || "").trim();
  const pending = oauthPendingStates.get(state);
  oauthPendingStates.delete(state);
  if (!pending || !code) {
    return res.status(400).send("로그인 세션이 만료되었거나 잘못된 요청입니다. 다시 로그인해 주세요.");
  }

  try {
    const redirectUri = env.googleRedirectUri || `${env.appBaseUrl}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.id_token) {
      return res.status(400).send("Google 토큰 발급에 실패했습니다.");
    }

    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenJson.id_token)}`
    );
    const profile = await verifyRes.json();
    if (!verifyRes.ok || profile.aud !== env.googleClientId || profile.email_verified !== "true") {
      return res.status(401).send("Google 계정 검증에 실패했습니다.");
    }

    const email = String(profile.email || "").trim().toLowerCase();
    const googleSub = String(profile.sub || "").trim();
    if (!email || !googleSub) {
      return res.status(400).send("Google 계정 정보가 올바르지 않습니다.");
    }

    let user = getUserByGoogleSub(googleSub);
    if (!user) {
      user = createOrGetUser(email);
      user = linkGoogleAccount(user.id, {
        googleSub,
        googleName: profile.name || "",
        googlePicture: profile.picture || ""
      });
    }

    const session = createSession(user.id, true);
    const updatedUser = setUserSession(user.id, session.token, session.expiresAt);
    const monthly = ensureMonthlyUsage(updatedUser.id);
    oauthDeviceResults.set(pending.deviceId, {
      expiresAtMs: Date.now() + 5 * 60 * 1000,
      payload: {
        sessionToken: session.token,
        email: updatedUser.email,
        ...usageSummary(updatedUser, monthly)
      }
    });

    return res.type("html").send(
      renderSimplePage(
        "Google 로그인 완료",
        "<p>로그인이 완료되었습니다. 확장 프로그램으로 돌아가면 자동으로 연결됩니다.</p><p>이 창은 닫으셔도 됩니다.</p>"
      )
    );
  } catch (err) {
    return res.status(500).send(`Google 로그인 처리 중 오류가 발생했습니다: ${safeHtml(err?.message || "unknown")}`);
  }
});

app.get("/api/auth/google/poll", (req, res) => {
  cleanupOauthCache();
  const deviceId = String(req.query.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: "deviceId가 필요합니다." });
  const item = oauthDeviceResults.get(deviceId);
  if (!item) return res.status(202).json({ status: "pending" });
  oauthDeviceResults.delete(deviceId);
  return res.json({ ok: true, ...item.payload });
});

function auth(req, res, next) {
  const sessionToken = String(req.header("x-session-token") || "").trim();
  if (sessionToken) {
    const userBySession = getUserBySessionToken(sessionToken);
    if (!userBySession) return res.status(401).json({ error: "세션이 만료되었습니다. 다시 로그인해 주세요." });
    req.user = userBySession;
    return next();
  }
  return res.status(401).json({ error: "Google 로그인이 필요합니다." });
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
        error: "무료 3회를 모두 사용했습니다. Pro 플랜으로 업그레이드해 주세요."
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
      return res.status(402).json({
        error: "이번 달 사용 한도를 모두 사용했습니다. 다음 달 리셋을 기다리거나 Annual 플랜을 이용해 주세요."
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
    if (user.plan_id === "free") {
      consumeFreeCredit(user.id);
    }
    const refreshedUser = req.user;

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
  if (!["pro_monthly", "pro_annual"].includes(planId)) {
    return res.status(400).json({ error: "지원하지 않는 플랜입니다." });
  }
  if (!tossEnabled) {
    return res.status(500).json({ error: "토스 결제가 아직 설정되지 않았습니다." });
  }
  const plan = pickPlan(planId);
  const orderId = createNonce("toss");
  createTossOrder({
    orderId,
    userId: req.user.id,
    kind: "plan",
    planId,
    amount: plan.billingCycle === "annual" ? plan.yearlyPriceKrw : plan.monthlyPriceKrw
  });
  return res.json({
    checkoutUrl: `${env.appBaseUrl}/billing/toss/checkout?orderId=${encodeURIComponent(orderId)}`,
    orderId
  });
});

app.get("/billing/toss/checkout", (req, res) => {
  const orderId = String(req.query.orderId || "").trim();
  const order = getTossOrderByOrderId(orderId);
  if (!order) {
    return res.status(404).send("유효하지 않은 주문입니다.");
  }

  const isPlan = order.kind === "plan";
  const title = isPlan
    ? order.plan_id === "pro_annual"
      ? "Pro Annual 이용권"
      : "Pro Monthly 이용권"
    : "Polite Message Rewriter 이용권";

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
      <p><b>포함 내용</b></p>
      <ul>
        <li>Free: 총 3회 체험, 1회 2,000자</li>
        <li>Pro Monthly: 월 50회, 1회 4,000자</li>
        <li>Pro Annual: 매달 100회, 1회 4,000자</li>
        <li>로그인은 Google 계정만 지원합니다.</li>
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

    if (order.kind === "plan" && ["pro_monthly", "pro_annual"].includes(order.plan_id || "")) {
      updatePlan({
        userId: order.user_id,
        planId: order.plan_id,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: "active"
      });
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

app.get("/legal/privacy", (_req, res) => {
  res.type("html").send(
    renderSimplePage(
      "Privacy Policy",
      `
      <p>Polite Message Rewriter는 서비스 제공을 위해 최소한의 정보(로그인 식별자, 사용량 정보, 결제 기록)를 처리합니다.</p>
      <p>메시지 변환 요청 내용은 품질 개선 목적의 장기 저장을 기본으로 하지 않으며, 운영 안정성 목적의 제한적 로그만 보관할 수 있습니다.</p>
      <p>문의: support@polite-message.app</p>
      <p>시행일: 2026-03-23</p>
      `
    )
  );
});

app.get("/legal/terms", (_req, res) => {
  res.type("html").send(
    renderSimplePage(
      "Terms of Service",
      `
      <p>본 서비스는 사용자가 입력한 문장을 선택한 톤으로 재작성하는 도구입니다.</p>
      <p>서비스 악용, 불법 콘텐츠 생성, 타인 권리 침해 행위는 금지됩니다.</p>
      <p>요금제는 Free/Pro/Business 정책에 따르며, 결제 조건은 결제 페이지 안내를 우선합니다.</p>
      <p>시행일: 2026-03-23</p>
      `
    )
  );
});

app.get("/legal/contact", (_req, res) => {
  res.type("html").send(
    renderSimplePage(
      "Contact Us",
      `
      <p>서비스 문의 및 제휴 문의는 아래 채널로 접수해 주세요.</p>
      <p>Email: support@polite-message.app</p>
      <p>운영시간: 평일 10:00 ~ 18:00 (KST)</p>
      `
    )
  );
});

app.get("/legal/cookies", (_req, res) => {
  res.type("html").send(
    renderSimplePage(
      "Cookie Settings",
      `
      <p>본 서비스는 로그인 세션 유지를 위한 필수 쿠키(또는 동등 기술)를 사용할 수 있습니다.</p>
      <p>광고 추적 목적의 제3자 쿠키는 기본 활성화하지 않습니다.</p>
      <p>브라우저 설정에서 쿠키를 차단할 경우 일부 기능이 제한될 수 있습니다.</p>
      `
    )
  );
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Polite Message backend listening on ${env.port}`);
});
