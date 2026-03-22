import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4310),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:4310",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "*",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiDefaultModel: process.env.OPENAI_DEFAULT_MODEL || "gpt-5-mini",
  openaiFreeModel: process.env.OPENAI_FREE_MODEL || "gpt-5-nano",
  openaiChatFallbackModel: process.env.OPENAI_CHAT_FALLBACK_MODEL || "",
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 20000),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
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
    maxMonthlyRequests: 3,
    maxMonthlyInputTokens: 24000,
    maxMonthlyOutputTokens: 18000,
    maxCharsPerRequest: 2000,
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

export const TONES = ["친근하게", "정중하게", "아주 정중하게", "캐주얼하게", "공손하지만 단호하게"];

export const RECIPIENTS = ["상사", "동료", "친구", "학부모", "고객", "거래처", "연인", "가족", "기타"];
