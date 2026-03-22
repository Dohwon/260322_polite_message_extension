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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  stripePriceBusinessMonthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || "",
  stripePriceTopup10: process.env.STRIPE_PRICE_TOPUP_10 || process.env.STRIPE_PRICE_TOPUP_500 || "",
  billingCurrency: process.env.BILLING_CURRENCY || "krw"
};

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceKrw: 0,
    maxMonthlyRequests: 40,
    maxMonthlyInputTokens: 30000,
    maxMonthlyOutputTokens: 22000,
    maxCharsPerRequest: 1200,
    model: env.openaiFreeModel
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceKrw: 6900,
    maxMonthlyRequests: 900,
    maxMonthlyInputTokens: 600000,
    maxMonthlyOutputTokens: 360000,
    maxCharsPerRequest: 3200,
    model: env.openaiDefaultModel
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPriceKrw: 19900,
    maxMonthlyRequests: 4000,
    maxMonthlyInputTokens: 2800000,
    maxMonthlyOutputTokens: 1600000,
    maxCharsPerRequest: 5000,
    model: env.openaiDefaultModel
  }
};

export const TOPUP = {
  id: "topup10",
  name: "추가 10회",
  requests: 10,
  priceKrw: 1000,
  stripePriceId: env.stripePriceTopup10
};

export const TONES = ["친근하게", "정중하게", "아주 정중하게", "캐주얼하게", "공손하지만 단호하게"];

export const RECIPIENTS = ["상사", "동료", "친구", "학부모", "고객", "거래처", "연인", "가족", "기타"];
