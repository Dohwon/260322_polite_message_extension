import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4310),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:4310",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "*",
  billingCheckoutEnabled: String(process.env.BILLING_CHECKOUT_ENABLED || "false").toLowerCase() === "true",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiDefaultModel: process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini",
  openaiFreeModel: process.env.OPENAI_FREE_MODEL || "gpt-5-nano",
  openaiChatFallbackModel: process.env.OPENAI_CHAT_FALLBACK_MODEL || "",
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
  ipQuotaSalt: process.env.IP_QUOTA_SALT || "local-dev-ip-quota-salt-change-me",
  unlimitedBypassEmails:
    process.env.UNLIMITED_BYPASS_EMAILS || "dowonkim0612@gmail.com",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  adminViewKey: process.env.ADMIN_VIEW_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  billingCurrency: process.env.BILLING_CURRENCY || "krw"
};

env.tossClientKey = process.env.TOSS_CLIENT_KEY || "";
env.tossSecretKey = process.env.TOSS_SECRET_KEY || "";

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceKrw: 0,
    yearlyPriceKrw: 0,
    billingCycle: "trial",
    maxMonthlyRequests: 5,
    maxMonthlyInputTokens: 100,
    maxMonthlyOutputTokens: 100,
    maxCharsPerRequest: 1000,
    model: env.openaiFreeModel
  },
  pro_monthly: {
    id: "pro_monthly",
    name: "Pro Monthly",
    monthlyPriceKrw: 4900,
    yearlyPriceKrw: null,
    billingCycle: "monthly",
    maxMonthlyRequests: 50,
    maxMonthlyInputTokens: 320000,
    maxMonthlyOutputTokens: 220000,
    maxCharsPerRequest: 4000,
    model: env.openaiDefaultModel
  },
  pro_annual: {
    id: "pro_annual",
    name: "Pro Annual",
    monthlyPriceKrw: 3250,
    yearlyPriceKrw: 39000,
    billingCycle: "annual",
    maxMonthlyRequests: 100,
    maxMonthlyInputTokens: 640000,
    maxMonthlyOutputTokens: 440000,
    maxCharsPerRequest: 4000,
    model: env.openaiDefaultModel
  }
};

export const TONES = [
  "보통",
  "친근하게",
  "정중하게",
  "아주 정중하게",
  "캐주얼하게",
  "공손하지만 단호하게",
  "미안함",
  "제안함",
  "사랑함"
];

export const RECIPIENTS = ["상사", "동료", "친구", "학부모", "고객", "거래처", "연인", "가족", "기타"];
