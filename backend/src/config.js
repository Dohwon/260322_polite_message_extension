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
  mailProvider: String(process.env.MAIL_PROVIDER || "emailjs").toLowerCase(),
  feedbackNotifyEmail: process.env.FEEDBACK_NOTIFY_EMAIL || "politemsg.support@gmail.com",
  emailjsServiceId: process.env.EMAILJS_SERVICE_ID || "service_rlh0xic",
  emailjsTemplateFeedbackId: process.env.EMAILJS_TEMPLATE_FEEDBACK_ID || "template_m0b38lo",
  emailjsTemplateReplyId: process.env.EMAILJS_TEMPLATE_REPLY_ID || "template_64r2siq",
  emailjsPublicKey: process.env.EMAILJS_PUBLIC_KEY || "PeQjkuhx_7X2HlgSr",
  brevoApiKey: process.env.BREVO_API_KEY || "",
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || "",
  brevoSenderName: process.env.BREVO_SENDER_NAME || "Polite Message",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL || "Polite Message <onboarding@resend.dev>",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || "true").toLowerCase() === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpTimeoutMs: Number(process.env.SMTP_TIMEOUT_MS || 10000),
  dbPath: process.env.DB_PATH || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  adminViewKey: process.env.ADMIN_VIEW_KEY || "",
  adminDashboardPassword: process.env.ADMIN_DASHBOARD_PASSWORD || "",
  adminAllowedIps: process.env.ADMIN_ALLOWED_IPS || "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "",
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
    dailyRequestLimit: 3,
    maxMonthlyRequests: 10,
    maxMonthlyInputTokens: 12000,
    maxMonthlyOutputTokens: 12000,
    maxCharsPerRequest: 300,
    model: env.openaiFreeModel
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceKrw: 3900,
    yearlyPriceKrw: null,
    billingCycle: "monthly",
    dailyRequestLimit: 30,
    maxMonthlyRequests: 50,
    maxMonthlyInputTokens: 90000,
    maxMonthlyOutputTokens: 65000,
    maxCharsPerRequest: 500,
    model: env.openaiDefaultModel
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPriceKrw: 9900,
    yearlyPriceKrw: null,
    billingCycle: "monthly",
    dailyRequestLimit: null,
    maxMonthlyRequests: 300,
    maxMonthlyInputTokens: 900000,
    maxMonthlyOutputTokens: 700000,
    maxCharsPerRequest: 2000,
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
  "사랑함",
  "보고 요청",
  "제안서",
  "일정 변경",
  "회식 제안",
  "업무 변경"
];

export const RECIPIENTS = ["상사", "동료", "친구", "학부모", "고객", "거래처", "연인", "가족", "기타"];

export const OUTPUT_LANGUAGES = ["ko", "en"];
