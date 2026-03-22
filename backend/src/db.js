import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "data.sqlite");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  bonus_requests_remaining INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monthly_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month_key),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS billing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT UNIQUE,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS toss_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  plan_id TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS feedback_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeAddColumn(sql) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!String(err?.message || "").includes("duplicate column name")) {
      throw err;
    }
  }
}

safeAddColumn(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN session_token TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN session_expires_at TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN free_credits_remaining INTEGER NOT NULL DEFAULT 5`);
safeAddColumn(`ALTER TABLE users ADD COLUMN last_login_at TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN auth_provider TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN google_sub TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN google_name TEXT`);
safeAddColumn(`ALTER TABLE users ADD COLUMN google_picture TEXT`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (email, api_key)
  VALUES (?, ?)
`);

const getUserByEmailStmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
const getUserByApiKeyStmt = db.prepare(`SELECT * FROM users WHERE api_key = ?`);
const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const getUserBySessionTokenStmt = db.prepare(`
  SELECT * FROM users
  WHERE session_token = ?
    AND (session_expires_at IS NULL OR session_expires_at > CURRENT_TIMESTAMP)
`);
const getUserByGoogleSubStmt = db.prepare(`
  SELECT * FROM users WHERE google_sub = ?
`);

const upsertMonthlyStmt = db.prepare(`
  INSERT INTO monthly_usage (user_id, month_key)
  VALUES (?, ?)
  ON CONFLICT(user_id, month_key) DO NOTHING
`);

const getMonthlyStmt = db.prepare(`
  SELECT * FROM monthly_usage
  WHERE user_id = ? AND month_key = ?
`);

const addUsageStmt = db.prepare(`
  UPDATE monthly_usage
  SET request_count = request_count + 1,
      input_tokens = input_tokens + ?,
      output_tokens = output_tokens + ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ? AND month_key = ?
`);

const decBonusStmt = db.prepare(`
  UPDATE users
  SET bonus_requests_remaining = bonus_requests_remaining - 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND bonus_requests_remaining > 0
`);

const addBonusStmt = db.prepare(`
  UPDATE users
  SET bonus_requests_remaining = bonus_requests_remaining + ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updatePlanStmt = db.prepare(`
  UPDATE users
  SET plan_id = ?,
      stripe_customer_id = ?,
      stripe_subscription_id = ?,
      subscription_status = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updateStripeCustomerStmt = db.prepare(`
  UPDATE users
  SET stripe_customer_id = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const getUserByStripeCustomerStmt = db.prepare(`
  SELECT * FROM users WHERE stripe_customer_id = ?
`);

const insertBillingEventStmt = db.prepare(`
  INSERT INTO billing_events (stripe_event_id, user_id, event_type, payload)
  VALUES (?, ?, ?, ?)
`);

const hasBillingEventStmt = db.prepare(`SELECT id FROM billing_events WHERE stripe_event_id = ?`);
const insertTossOrderStmt = db.prepare(`
  INSERT INTO toss_orders (order_id, user_id, kind, plan_id, amount)
  VALUES (?, ?, ?, ?, ?)
`);
const getTossOrderByOrderIdStmt = db.prepare(`
  SELECT * FROM toss_orders WHERE order_id = ?
`);
const markTossOrderPaidStmt = db.prepare(`
  UPDATE toss_orders
  SET status = 'paid',
      payment_key = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE order_id = ?
`);
const getTossOrdersByUserStmt = db.prepare(`
  SELECT order_id, kind, plan_id, amount, status, created_at
  FROM toss_orders
  WHERE user_id = ?
  ORDER BY id DESC
  LIMIT 100
`);
const setPasswordHashStmt = db.prepare(`
  UPDATE users
  SET password_hash = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const insertFeedbackStmt = db.prepare(`
  INSERT INTO feedback_posts (email, topic, message)
  VALUES (?, ?, ?)
`);
const listFeedbackStmt = db.prepare(`
  SELECT id, email, topic, message, created_at
  FROM feedback_posts
  ORDER BY id DESC
  LIMIT ?
`);
const setSessionStmt = db.prepare(`
  UPDATE users
  SET session_token = ?,
      session_expires_at = ?,
      last_login_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const clearSessionStmt = db.prepare(`
  UPDATE users
  SET session_token = NULL,
      session_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const consumeFreeCreditStmt = db.prepare(`
  UPDATE users
  SET free_credits_remaining = free_credits_remaining - 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND free_credits_remaining > 0
`);
const linkGoogleAccountStmt = db.prepare(`
  UPDATE users
  SET auth_provider = 'google',
      google_sub = ?,
      google_name = ?,
      google_picture = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const normalizeLegacyFreeCreditsStmt = db.prepare(`
  UPDATE users
  SET free_credits_remaining = 5,
      updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = 'free' AND free_credits_remaining > 5
`);
const upliftLegacyFreeCreditsStmt = db.prepare(`
  UPDATE users
  SET free_credits_remaining = 5,
      updated_at = CURRENT_TIMESTAMP
  WHERE plan_id = 'free' AND free_credits_remaining < 5
`);

function createApiKey() {
  return `pm_${crypto.randomBytes(20).toString("hex")}`;
}

function monthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

normalizeLegacyFreeCreditsStmt.run();
upliftLegacyFreeCreditsStmt.run();

export function createOrGetUser(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("유효한 이메일이 필요합니다.");
  }
  const found = getUserByEmailStmt.get(normalized);
  if (found) return found;
  const apiKey = createApiKey();
  const info = insertUserStmt.run(normalized, apiKey);
  return getUserByIdStmt.get(info.lastInsertRowid);
}

export function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  return getUserByApiKeyStmt.get(apiKey);
}

export function getUserById(id) {
  return getUserByIdStmt.get(id);
}

export function getUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return getUserByEmailStmt.get(normalized);
}

export function getUserBySessionToken(token) {
  if (!token) return null;
  return getUserBySessionTokenStmt.get(token);
}

export function getUserByGoogleSub(googleSub) {
  if (!googleSub) return null;
  return getUserByGoogleSubStmt.get(googleSub);
}

export function ensureMonthlyUsage(userId, key = monthKey()) {
  upsertMonthlyStmt.run(userId, key);
  return getMonthlyStmt.get(userId, key);
}

export function getCurrentMonthlyUsage(userId) {
  return ensureMonthlyUsage(userId, monthKey());
}

export function addUsage(userId, inputTokens, outputTokens) {
  const key = monthKey();
  upsertMonthlyStmt.run(userId, key);
  addUsageStmt.run(inputTokens, outputTokens, userId, key);
  return getMonthlyStmt.get(userId, key);
}

export function consumeBonusRequest(userId) {
  const info = decBonusStmt.run(userId);
  return info.changes > 0;
}

export function addBonusRequests(userId, amount) {
  addBonusStmt.run(amount, userId);
  return getUserByIdStmt.get(userId);
}

export function updatePlan({ userId, planId, stripeCustomerId, stripeSubscriptionId, subscriptionStatus }) {
  updatePlanStmt.run(planId, stripeCustomerId || null, stripeSubscriptionId || null, subscriptionStatus || null, userId);
  return getUserByIdStmt.get(userId);
}

export function updateStripeCustomer(userId, stripeCustomerId) {
  updateStripeCustomerStmt.run(stripeCustomerId, userId);
  return getUserByIdStmt.get(userId);
}

export function getUserByStripeCustomer(customerId) {
  return getUserByStripeCustomerStmt.get(customerId);
}

export function hasBillingEvent(stripeEventId) {
  return Boolean(hasBillingEventStmt.get(stripeEventId));
}

export function insertBillingEvent({ stripeEventId, userId, eventType, payload }) {
  insertBillingEventStmt.run(stripeEventId, userId || null, eventType, JSON.stringify(payload || {}));
}

export function dbHealth() {
  return { ok: true, path: dbPath };
}

export function createTossOrder({ orderId, userId, kind, planId, amount }) {
  insertTossOrderStmt.run(orderId, userId, kind, planId || null, amount);
  return getTossOrderByOrderIdStmt.get(orderId);
}

export function getTossOrderByOrderId(orderId) {
  return getTossOrderByOrderIdStmt.get(orderId);
}

export function markTossOrderPaid(orderId, paymentKey) {
  markTossOrderPaidStmt.run(paymentKey, orderId);
  return getTossOrderByOrderIdStmt.get(orderId);
}

export function getTossOrdersByUser(userId) {
  return getTossOrdersByUserStmt.all(userId);
}

export function setPasswordHash(userId, passwordHash) {
  setPasswordHashStmt.run(passwordHash, userId);
  return getUserByIdStmt.get(userId);
}

export function setUserSession(userId, token, expiresAt) {
  setSessionStmt.run(token, expiresAt, userId);
  return getUserByIdStmt.get(userId);
}

export function clearUserSession(userId) {
  clearSessionStmt.run(userId);
  return getUserByIdStmt.get(userId);
}

export function consumeFreeCredit(userId) {
  const info = consumeFreeCreditStmt.run(userId);
  return info.changes > 0;
}

export function linkGoogleAccount(userId, { googleSub, googleName, googlePicture }) {
  linkGoogleAccountStmt.run(googleSub, googleName || null, googlePicture || null, userId);
  return getUserByIdStmt.get(userId);
}


export function createFeedback({ email, topic, message }) {
  insertFeedbackStmt.run(String(email || "").trim().toLowerCase(), String(topic || "").trim(), String(message || "").trim());
}

export function listFeedback(limit = 200) {
  return listFeedbackStmt.all(Number(limit) || 200);
}
