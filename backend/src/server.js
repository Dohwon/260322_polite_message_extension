import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, PLANS, TONES, RECIPIENTS } from "./config.js";
import {
  addAdminAllowedIp,
  addBonusRequests,
  addUsage,
  clearUserSession,
  consumeFreeDailyUsage,
  consumeBonusRequest,
  createFeedback,
  createFeedbackReply,
  createRewriteLog,
  createTossOrder,
  createOrGetUser,
  dbHealth,
  ensureMonthlyUsage,
  getFreeDailyUsage,
  getTossOrdersByUser,
  getTossOrderByOrderId,
  getCurrentMonthlyUsage,
  getUserByEmail,
  getUserById,
  listAdminAllowedIps,
  getUserByGoogleSub,
  getUserBySessionToken,
  linkGoogleAccount,
  listFeedback,
  listFeedbackReplies,
  listRewriteLogs,
  removeAdminAllowedIp,
  markTossOrderPaid,
  setFreeCredits,
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
const adminDashboardPath = path.join(__dirname, "admin-dashboard.html");
const adminCreditsPath = path.join(__dirname, "admin-credits.html");
const adminFeedbackPath = path.join(__dirname, "admin-feedback.html");
const oauthPendingStates = new Map();
const oauthDeviceResults = new Map();
const adminSessions = new Map();
const TOPUP_10_PLAN_ID = "topup10";
const TOPUP_10_REQUESTS = 10;
const TOPUP_10_PRICE_KRW = 1000;
let smtpTransport = null;

function normalizeEmailForBypass(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw || !raw.includes("@")) return raw;
  const [localRaw, domainRaw] = raw.split("@");
  const domain = domainRaw || "";
  let local = localRaw || "";
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    return `${local}@gmail.com`;
  }
  return `${local}@${domain}`;
}

const unlimitedBypassEmailSet = new Set(
  [
    "dowonkim0612@gmail.com",
    ...String(env.unlimitedBypassEmails || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  ].map((email) => normalizeEmailForBypass(email))
);

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
  const normalized = String(planId || "").trim();
  if (normalized === "pro_monthly") return PLANS.pro;
  if (normalized === "pro_annual") return PLANS.business;
  return PLANS[normalized] || PLANS.free;
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

function isUnlimitedBypassUser(user) {
  const email = normalizeEmailForBypass(user?.email || "");
  return Boolean(email) && unlimitedBypassEmailSet.has(email);
}

function requestBaseUrl(req) {
  const appBase = String(env.appBaseUrl || "").trim();
  if (appBase && !appBase.includes("localhost")) {
    return appBase.replace(/\/+$/, "");
  }
  const forwardedProto = String(req.header("x-forwarded-proto") || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = String(req.header("x-forwarded-host") || req.header("host") || "").split(",")[0].trim();
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }
  return "http://localhost:4310";
}

function normalizeClientIp(rawIp) {
  const raw = String(rawIp || "").split(",")[0].trim();
  if (!raw) return "";
  if (raw === "::1") return "127.0.0.1";
  if (raw.startsWith("::ffff:")) return raw.slice(7);
  return raw;
}

function getRequestIpHash(req) {
  const normalizedIp = normalizeClientIp(req.ip || req.socket?.remoteAddress);
  if (!normalizedIp) return "";
  return crypto.createHash("sha256").update(`${env.ipQuotaSalt}:${normalizedIp}`).digest("hex");
}

function googleRedirectUri(req) {
  return env.googleRedirectUri || `${requestBaseUrl(req)}/api/auth/google/callback`;
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

async function notifyFeedbackByEmail({ email, topic, message }) {
  const subject = `[Polite 문의] ${topic}`;
  const text = [
    "새 고객 문의가 접수되었습니다.",
    "",
    `회신 이메일: ${email}`,
    `문의 주제: ${topic}`,
    "",
    "문의 내용:",
    message
  ].join("\n");

  if (env.smtpHost && env.smtpUser && env.smtpPass && env.feedbackNotifyEmail) {
    await getSmtpTransport().sendMail({
      from: env.smtpUser,
      to: env.feedbackNotifyEmail,
      replyTo: email,
      subject,
      text
    });
    return { delivered: true, provider: "smtp" };
  }

  if (!env.resendApiKey || !env.feedbackNotifyEmail) {
    return { delivered: false, reason: "email_not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.resendFromEmail,
      to: [env.feedbackNotifyEmail],
      reply_to: email,
      subject,
      text
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`feedback email delivery failed: ${res.status} ${errBody}`);
  }

  return { delivered: true, provider: "resend" };
}

async function sendFeedbackReplyEmail({ to, subject, message }) {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    return { delivered: false, reason: "email_not_configured" };
  }

  await getSmtpTransport().sendMail({
    from: env.smtpUser,
    to,
    subject,
    text: message
  });

  return { delivered: true, provider: "smtp" };
}

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      },
      connectionTimeout: env.smtpTimeoutMs,
      greetingTimeout: env.smtpTimeoutMs,
      socketTimeout: env.smtpTimeoutMs
    });
  }
  return smtpTransport;
}

function sendFeedbackNotifyInBackground(payload) {
  setTimeout(async () => {
    try {
      await notifyFeedbackByEmail(payload);
    } catch (err) {
      console.error("feedback notify failed", err?.message || err);
    }
  }, 0);
}

const FEEDBACK_TOPICS = new Set([
  "메시지 생성 문의",
  "추가 유형 문의",
  "로그인 문의",
  "충전 문의",
  "기타 문의"
]);

function usageSummary(user, monthly, freeDailyUsedAccount = 0) {
  const plan = pickPlan(user.plan_id);
  const isUnlimited = isUnlimitedBypassUser(user);
  const safeDailyUsedAccount = Number(freeDailyUsedAccount || 0);
  const dailyLimit = Number.isFinite(plan.dailyRequestLimit) ? Number(plan.dailyRequestLimit) : null;
  const dailyRemaining = isUnlimited
    ? dailyLimit
    : dailyLimit === null
      ? null
      : Math.max(0, dailyLimit - safeDailyUsedAccount);
  const monthlyRemaining =
    isUnlimited || !Number.isFinite(plan.maxMonthlyRequests)
      ? null
      : Math.max(0, Number(plan.maxMonthlyRequests) - Number(monthly.request_count || 0));
  return {
    planId: plan.id,
    planName: plan.name,
    monthlyPriceKrw: plan.monthlyPriceKrw,
    yearlyPriceKrw: plan.yearlyPriceKrw ?? null,
    billingCycle: plan.billingCycle || "monthly",
    limits: {
      dailyRequestLimit: dailyLimit,
      maxMonthlyRequests: plan.maxMonthlyRequests,
      maxMonthlyInputTokens: plan.maxMonthlyInputTokens,
      maxMonthlyOutputTokens: plan.maxMonthlyOutputTokens,
      maxCharsPerRequest: plan.maxCharsPerRequest
    },
    usage: {
      requestCount: monthly.request_count,
      inputTokens: monthly.input_tokens,
      outputTokens: monthly.output_tokens,
      freeCreditsRemaining: dailyRemaining,
      freeCreditsTotal: dailyLimit,
      freeDailyLimit: dailyLimit,
      freeDailyUsedAccount: safeDailyUsedAccount,
      monthlyRequestsRemaining: monthlyRemaining,
      monthlyRequestsUsed: Number(monthly.request_count || 0),
      monthlyRequestsTotal: Number(plan.maxMonthlyRequests || 0) || null,
      isUnlimited,
      bonusRequestsRemaining: Number(user.bonus_requests_remaining || 0),
      bonusRequestsTotal: Number(user.bonus_requests_total || 0)
    },
    member: {
      isRegistered: Boolean(user.id),
      authProvider: user.auth_provider || null,
      hasGoogleAuth: Boolean(user.google_sub),
      isUnlimited
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

function hasAdminAccess(req) {
  const key = String(req.header("x-admin-key") || req.query.key || "").trim();
  return Boolean(env.adminViewKey) && key === env.adminViewKey;
}

function parseCookies(req) {
  const raw = String(req.header("cookie") || "");
  const result = {};
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    result[key] = decodeURIComponent(rest.join("="));
  }
  return result;
}

function getClientIp(req) {
  return normalizeClientIp(req.ip || req.socket?.remoteAddress);
}

function getConfiguredAdminAllowedIps() {
  const dbAllowed = listAdminAllowedIps().map((row) => String(row.ip_address || "").trim()).filter(Boolean);
  if (dbAllowed.length > 0) return dbAllowed;
  return String(env.adminAllowedIps || "").split(",").map((v) => v.trim()).filter(Boolean);
}

function isAllowedAdminIp(req) {
  const allowed = getConfiguredAdminAllowedIps();
  if (allowed.length === 0) return true;
  const ip = getClientIp(req);
  return Boolean(ip) && allowed.includes(ip);
}

function createAdminSession(req) {
  const token = crypto.createHash("sha256").update(`${env.adminSessionSecret || env.ipQuotaSalt}:${Date.now()}:${Math.random()}`).digest("hex");
  adminSessions.set(token, { expiresAtMs: Date.now() + 12 * 60 * 60 * 1000 });
  return token;
}

function cleanupAdminSessions() {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (session.expiresAtMs < now) adminSessions.delete(token);
  }
}

function requireAdminDashboard(req, res, next) {
  cleanupAdminSessions();
  if (!isAllowedAdminIp(req)) {
    return res.status(403).send("관리자 허용 IP가 아닙니다.");
  }
  const cookies = parseCookies(req);
  const token = String(cookies.pm_admin_session || "").trim();
  const session = token ? adminSessions.get(token) : null;
  if (!session) {
    return res.status(401).send("관리자 로그인이 필요합니다.");
  }
  return next();
}

const rewriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }
});

const allowedOrigins =
  env.allowedOrigins === "*"
    ? []
    : env.allowedOrigins
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.allowedOrigins === "*") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-session-token"],
    credentials: true
  })
);

app.options(
  "*",
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.allowedOrigins === "*") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-session-token"],
    credentials: true
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
      hasTopupPrice: true
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

  const redirectUri = googleRedirectUri(req);
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

app.get("/api/auth/google/config", (req, res) => {
  const missing = [];
  if (!env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!env.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!env.googleRedirectUri && !requestBaseUrl(req)) missing.push("GOOGLE_REDIRECT_URI");
  return res.json({
    enabled: googleAuthEnabled,
    redirectUri: googleRedirectUri(req),
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
    const redirectUri = googleRedirectUri(req);
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
    const freeDaily = getFreeDailyUsage(updatedUser.id);
    oauthDeviceResults.set(pending.deviceId, {
      expiresAtMs: Date.now() + 5 * 60 * 1000,
      payload: {
        sessionToken: session.token,
        email: updatedUser.email,
        ...usageSummary(updatedUser, monthly, freeDaily?.used_count || 0)
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
  const freeDaily = getFreeDailyUsage(req.user.id);
  const monthly = getCurrentMonthlyUsage(req.user.id);
  res.json({
    email: req.user.email,
    ...usageSummary(req.user, monthly, freeDaily?.used_count || 0)
  });
});

app.get("/api/auth/session", auth, (req, res) => {
  const freeDaily = getFreeDailyUsage(req.user.id);
  const monthly = getCurrentMonthlyUsage(req.user.id);
  return res.json({
    ok: true,
    email: req.user.email,
    ...usageSummary(req.user, monthly, freeDaily?.used_count || 0)
  });
});

app.post("/api/auth/logout", auth, (req, res) => {
  clearUserSession(req.user.id);
  return res.json({ ok: true });
});

app.get("/api/payments", auth, (req, res) => {
  return res.json({ items: getTossOrdersByUser(req.user.id) });
});

app.post("/api/feedback", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const topic = String(req.body?.topic || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "유효한 이메일을 입력해 주세요." });
  }
  if (!FEEDBACK_TOPICS.has(topic)) {
    return res.status(400).json({ error: "문의 주제를 목록에서 선택해 주세요." });
  }
  if (!message || message.length < 3) {
    return res.status(400).json({ error: "문의 내용을 3자 이상 입력해 주세요." });
  }

  createFeedback({ email, topic, message });
  sendFeedbackNotifyInBackground({ email, topic, message });
  return res.json({
    ok: true,
    emailDelivered: null,
    message: "문의가 정상 접수되었습니다. 확인 후 답장을 보내드릴게요."
  });
});

app.post("/admin/login", (req, res) => {
  const password = String(req.body?.password || "").trim();
  if (!isAllowedAdminIp(req)) {
    return res.status(403).json({ error: "허용된 IP에서만 접근할 수 있습니다." });
  }
  if (!env.adminDashboardPassword) {
    return res.status(503).json({ error: "관리자 비밀번호가 아직 설정되지 않았습니다." });
  }
  if (password !== env.adminDashboardPassword) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  const token = createAdminSession(req);
  const secureSuffix = requestBaseUrl(req).startsWith("https://") ? "; Secure" : "";
  res.setHeader("Set-Cookie", "pm_admin_session=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200" + secureSuffix);
  return res.json({ ok: true, redirectUrl: "/admin/dashboard" });
});

app.post("/admin/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = String(cookies.pm_admin_session || "").trim();
  if (token) adminSessions.delete(token);
  res.setHeader("Set-Cookie", "pm_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return res.json({ ok: true });
});

app.get("/admin/dashboard-data", requireAdminDashboard, (req, res) => {
  const logs = listRewriteLogs(3000);
  const summaryMap = new Map();
  for (const row of logs) {
    const user = getUserByEmail(row.user_email);
    const planName = pickPlan(user?.plan_id || "free").name;
    const current = summaryMap.get(row.user_email) || { email: row.user_email, planName, count: 0, lastUsedAt: row.created_at };
    current.count += 1;
    if (row.created_at > current.lastUsedAt) current.lastUsedAt = row.created_at;
    summaryMap.set(row.user_email, current);
  }
  const summaryRows = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));
  return res.json({
    ok: true,
    currentIp: getClientIp(req) || "",
    allowedIps: getConfiguredAdminAllowedIps(),
    summaryRows,
    logRows: logs
  });
});

app.post("/admin/allowed-ips", requireAdminDashboard, (req, res) => {
  const ipAddress = normalizeClientIp(req.body?.ipAddress || "");
  if (!ipAddress) {
    return res.status(400).json({ error: "유효한 IP를 입력해 주세요." });
  }
  const allowedIps = addAdminAllowedIp(ipAddress).map((row) => row.ip_address);
  return res.json({ ok: true, allowedIps });
});

app.delete("/admin/allowed-ips", requireAdminDashboard, (req, res) => {
  const ipAddress = normalizeClientIp(req.body?.ipAddress || "");
  if (!ipAddress) {
    return res.status(400).json({ error: "삭제할 IP가 필요합니다." });
  }
  const allowedIps = removeAdminAllowedIp(ipAddress).map((row) => row.ip_address);
  return res.json({ ok: true, allowedIps });
});

app.get("/admin/dashboard", requireAdminDashboard, (_req, res) => {
  return res.sendFile(adminDashboardPath);
});

app.get("/admin/feedback", requireAdminDashboard, (_req, res) => {
  return res.sendFile(adminFeedbackPath);
});

app.get("/admin/feedback-data", requireAdminDashboard, (_req, res) => {
  const rows = listFeedback(1000);
  const replies = listFeedbackReplies();
  const repliesByFeedbackId = new Map();
  for (const reply of replies) {
    const key = Number(reply.feedback_id);
    const bucket = repliesByFeedbackId.get(key) || [];
    bucket.push(reply);
    repliesByFeedbackId.set(key, bucket);
  }

  const items = rows.map((row) => {
    const replyItems = repliesByFeedbackId.get(Number(row.id)) || [];
    const latestReplyAt = replyItems.length > 0 ? replyItems[0].created_at : "";
    return {
      id: Number(row.id),
      email: row.email,
      topic: row.topic,
      message: row.message,
      created_at: row.created_at,
      replied: replyItems.length > 0,
      reply_count: replyItems.length,
      latest_reply_at: latestReplyAt,
      replies: replyItems
    };
  });

  return res.json({
    ok: true,
    topics: Array.from(FEEDBACK_TOPICS),
    items
  });
});

app.post("/admin/feedback/reply", requireAdminDashboard, async (req, res) => {
  const feedbackId = Number(req.body?.feedbackId || 0);
  const to = String(req.body?.to || "").trim().toLowerCase();
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
    return res.status(400).json({ error: "유효한 문의 ID가 필요합니다." });
  }
  if (!to || !to.includes("@")) {
    return res.status(400).json({ error: "답장 받을 이메일이 올바르지 않습니다." });
  }
  if (!subject || subject.length < 2) {
    return res.status(400).json({ error: "제목을 2자 이상 입력해 주세요." });
  }
  if (!message || message.length < 3) {
    return res.status(400).json({ error: "답장 내용을 3자 이상 입력해 주세요." });
  }

  const feedback = listFeedback(5000).find((row) => Number(row.id) === feedbackId);
  if (!feedback) {
    return res.status(404).json({ error: "원본 문의를 찾을 수 없습니다." });
  }

  const mail = await sendFeedbackReplyEmail({ to, subject, message });
  if (!mail.delivered) {
    return res.status(503).json({ error: "SMTP 메일 설정이 아직 완료되지 않았습니다. Gmail 앱 비밀번호(SMTP_PASS)를 먼저 넣어 주세요." });
  }

  createFeedbackReply({ feedbackId, recipientEmail: to, subject, message });
  return res.json({ ok: true, message: "답장을 보냈습니다." });
});

app.post("/admin/credits/grant", requireAdminDashboard, (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const amount = Number(req.body?.amount || 10);
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "유효한 이메일이 필요합니다." });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return res.status(400).json({ error: "충전 횟수는 1~1000 범위로 입력해 주세요." });
  }
  const user = getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: "해당 이메일 사용자를 찾을 수 없습니다." });
  }
  const updated = addBonusRequests(user.id, amount);
  const monthly = getCurrentMonthlyUsage(updated.id);
  const freeDaily = getFreeDailyUsage(updated.id);
  return res.json({
    ok: true,
    email: updated.email,
    planId: pickPlan(updated.plan_id).id,
    usage: usageSummary(updated, monthly, freeDaily?.used_count || 0).usage
  });
});

app.get("/admin/credits", requireAdminDashboard, (_req, res) => {
  return res.sendFile(adminCreditsPath);
});

app.post("/admin/test/bootstrap-user", (req, res) => {
  if (!hasAdminAccess(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const planId = String(req.body?.planId || "free").trim();
  const rememberMe = Boolean(req.body?.rememberMe ?? true);
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "유효한 이메일이 필요합니다." });
  }
  if (!PLANS[planId]) {
    return res.status(400).json({ error: "유효한 planId가 아닙니다." });
  }

  let user = createOrGetUser(email);
  const current = getUserByEmail(email);
  const nextPlan = PLANS[planId];
  user = updatePlan({
    userId: user.id,
    planId,
    stripeCustomerId: current?.stripe_customer_id || null,
    stripeSubscriptionId: current?.stripe_subscription_id || null,
    subscriptionStatus: planId === "free" ? null : "active"
  });

  if (planId === "free") {
    user = setFreeCredits(user.id, nextPlan.maxMonthlyRequests);
  }

  const session = createSession(user.id, rememberMe);
  user = setUserSession(user.id, session.token, session.expiresAt);
  const monthly = ensureMonthlyUsage(user.id);
  const freeDaily = getFreeDailyUsage(user.id);

  return res.json({
    ok: true,
    email: user.email,
    sessionToken: session.token,
    ...usageSummary(user, monthly, freeDaily?.used_count || 0)
  });
});

app.post("/api/rewrite", rewriteLimiter, auth, async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." });
  }

  const user = req.user;
  const isUnlimited = isUnlimitedBypassUser(user);
  const plan = pickPlan(user.plan_id);
  const monthly = getCurrentMonthlyUsage(user.id);

  const originalText = String(req.body?.originalText || "").trim();
  const tone = sanitizeTone(req.body?.tone);
  const recipient = sanitizeRecipient(req.body?.recipient);
  const senderRole = String(req.body?.senderRole || "발신자").trim();
  const backgroundNote = String(req.body?.backgroundNote || "").trim().slice(0, 100);
  const harshFilterEnabled = Boolean(req.body?.harshFilterEnabled ?? true);

  if (!originalText) {
    return res.status(400).json({ error: "원본 문자를 입력해 주세요." });
  }

  if (originalText.length > plan.maxCharsPerRequest) {
    return res.status(400).json({
      error: `현재 플랜의 1회 최대 글자 수(${plan.maxCharsPerRequest}자)를 초과했습니다.`
    });
  }

  const hasBonus = Number(user.bonus_requests_remaining || 0) > 0;
  const dailyLimit = Number.isFinite(plan.dailyRequestLimit) ? Number(plan.dailyRequestLimit) : null;
  const currentDailyUsage = getFreeDailyUsage(user.id);
  const dailyUsedCount = Number(currentDailyUsage?.used_count || 0);

  if (!isUnlimited && dailyLimit !== null && !hasBonus && dailyUsedCount >= dailyLimit) {
    return res.status(402).json({
      error: `오늘 사용 가능한 ${dailyLimit}회를 모두 사용했습니다. 내일 다시 초기화됩니다.`
    });
  }

  if (!isUnlimited) {
    const hasRequestLimit = Number.isFinite(plan.maxMonthlyRequests);
    const requestLimitExceeded = hasRequestLimit && monthly.request_count >= plan.maxMonthlyRequests;
    const hasInputTokenLimit = Number.isFinite(plan.maxMonthlyInputTokens);
    const hasOutputTokenLimit = Number.isFinite(plan.maxMonthlyOutputTokens);
    const tokenLimitExceeded =
      (hasInputTokenLimit && monthly.input_tokens >= plan.maxMonthlyInputTokens) ||
      (hasOutputTokenLimit && monthly.output_tokens >= plan.maxMonthlyOutputTokens);
    if ((requestLimitExceeded || tokenLimitExceeded) && !hasBonus) {
      return res.status(402).json({
        error: "이번 달 사용 한도를 모두 사용했습니다. 10회 추가 충전 후 계속 사용할 수 있습니다."
      });
    }
  }

  const { system, context } = buildRewritePrompt({
    tone,
    recipient,
    senderRole,
    backgroundNote,
    harshFilterEnabled
  });

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

    createRewriteLog({
      userId: user.id,
      userEmail: user.email,
      originalText,
      rewrittenText: rewritten,
      tone,
      recipient,
      senderRole,
      backgroundNote,
      harshFilterEnabled
    });

    let updatedMonthly = monthly;
    if (isUnlimited) {
      updatedMonthly = addUsage(user.id, inputTokens, outputTokens);
    } else if (hasBonus) {
      consumeBonusRequest(user.id);
    } else if (dailyLimit !== null) {
      updatedMonthly = addUsage(user.id, inputTokens, outputTokens);
      const consumedAccount = consumeFreeDailyUsage(user.id, dailyLimit);
      if (!consumedAccount) {
        return res.status(402).json({ error: "오늘 사용 가능한 횟수가 이미 소진되었습니다." });
      }
    } else {
      updatedMonthly = addUsage(user.id, inputTokens, outputTokens);
    }
    const refreshedUser = getUserById(user.id) || req.user;
    const freeDailyAfter = getFreeDailyUsage(user.id);

    if (!rewritten) {
      return res.status(502).json({ error: "변환 결과를 생성하지 못했습니다. 다시 시도해 주세요." });
    }

    return res.json({
      rewrittenText: rewritten,
      usage: {
        inputTokens,
        outputTokens,
        monthly: usageSummary(
          refreshedUser,
          updatedMonthly,
          freeDailyAfter?.used_count || 0
        ).usage
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "문장 변환에 실패했습니다." });
  }
});

app.post("/api/billing/create-checkout", auth, async (req, res) => {
  if (!env.billingCheckoutEnabled) {
    return res.status(503).json({
      error: "결제 기능은 현재 준비중입니다. 무료 버전만 먼저 운영 중입니다."
    });
  }
  const planId = String(req.body?.planId || "").trim();
  if (!["pro", "business", TOPUP_10_PLAN_ID].includes(planId)) {
    return res.status(400).json({ error: "지원하지 않는 플랜입니다." });
  }
  if (!tossEnabled) {
    return res.status(500).json({ error: "토스 결제가 아직 설정되지 않았습니다." });
  }
  const orderId = createNonce("toss");
  const isTopup = planId === TOPUP_10_PLAN_ID;
  const plan = isTopup ? null : pickPlan(planId);
  createTossOrder({
    orderId,
    userId: req.user.id,
    kind: isTopup ? "topup" : "plan",
    planId,
    amount: isTopup ? TOPUP_10_PRICE_KRW : plan.monthlyPriceKrw
  });
  return res.json({
    checkoutUrl: `${requestBaseUrl(req)}/billing/toss/checkout?orderId=${encodeURIComponent(orderId)}`,
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
  const title =
    order.kind === "topup"
      ? "10회 추가 충전"
      : isPlan
        ? pickPlan(order.plan_id).name + " 이용권"
        : "Polite Message Rewriter 이용권";

  const customerKey = `user_${order.user_id}`;
  const baseUrl = requestBaseUrl(req);
  const successUrl = `${baseUrl}/billing/toss/success?orderId=${encodeURIComponent(order.order_id)}`;
  const failUrl = `${baseUrl}/billing/toss/fail?orderId=${encodeURIComponent(order.order_id)}`;

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
        <li>Free: 하루 3회, 월 최대 10회, 1회 300자</li>
        <li>Pro: 월 50회, 일 30회, 1회 500자</li>
        <li>Business: 월 300회, 1회 2,000자</li>
        <li>추가 충전: 10회 1,000원</li>
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

    if (order.kind === "plan" && ["pro", "business"].includes(order.plan_id || "")) {
      updatePlan({
        userId: order.user_id,
        planId: order.plan_id,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: "active"
      });
    }

    if (order.kind === "topup" && order.plan_id === TOPUP_10_PLAN_ID) {
      addBonusRequests(order.user_id, TOPUP_10_REQUESTS);
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
      <p>문의: <a href="mailto:politemsg.support@gmail.com">politemsg.support@gmail.com</a></p>
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
      <p>구독은 1개월 단위로 운영되며, 중도 해지해도 다음 결제일 전까지 현재 플랜을 유지합니다. 이후 무료 플랜으로 전환되며 재가입할 수 있습니다.</p>
      <p>부분 환불은 기본 제공하지 않으며, 사용하지 않은 경우에만 환불 가능합니다.</p>
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
      <p>Email: <a href="mailto:politemsg.support@gmail.com">politemsg.support@gmail.com</a></p>
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
