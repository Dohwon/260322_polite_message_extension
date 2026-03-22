const DEFAULT_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";

const els = {
  email: document.getElementById("email"),
  emailError: document.getElementById("emailError"),
  password: document.getElementById("password"),
  passwordError: document.getElementById("passwordError"),
  authStatus: document.getElementById("authStatus"),
  rememberMe: document.getElementById("rememberMe"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn"),
  logoutWrap: document.getElementById("logoutWrap"),
  logoutBtn: document.getElementById("logoutBtn"),
  tone: document.getElementById("tone"),
  recipient: document.getElementById("recipient"),
  senderRole: document.getElementById("senderRole"),
  originalText: document.getElementById("originalText"),
  originalTextError: document.getElementById("originalTextError"),
  rewrittenText: document.getElementById("rewrittenText"),
  rewriteBtn: document.getElementById("rewriteBtn"),
  copyBtn: document.getElementById("copyBtn"),
  proBtn: document.getElementById("proBtn"),
  businessBtn: document.getElementById("businessBtn"),
  topupBtn: document.getElementById("topupBtn"),
  status: document.getElementById("status")
};

const state = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  sessionToken: "",
  rememberMe: false,
  user: null
};

function setStatus(message, variant = "info") {
  els.status.textContent = message;
  els.status.classList.remove("error", "success");
  if (variant === "error") els.status.classList.add("error");
  if (variant === "success") els.status.classList.add("success");
}

function setAuthStatus(message, variant = "info") {
  if (!els.authStatus) return;
  els.authStatus.textContent = message;
  els.authStatus.classList.remove("error", "success");
  if (variant === "error") els.authStatus.classList.add("error");
  if (variant === "success") els.authStatus.classList.add("success");
}

function setFieldError(inputEl, errorEl, message) {
  errorEl.textContent = message || "";
  inputEl.classList.toggle("invalid", Boolean(message));
}

function validateEmail() {
  const email = els.email.value.trim();
  if (!email) {
    setFieldError(els.email, els.emailError, "이메일을 입력해 주세요.");
    return false;
  }
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFieldError(els.email, els.emailError, ok ? "" : "올바른 이메일 형식을 입력해 주세요.");
  return ok;
}

function validatePassword() {
  const password = els.password.value;
  const ok = password.length >= 6;
  setFieldError(els.password, els.passwordError, ok ? "" : "비밀번호는 6자 이상이어야 합니다.");
  return ok;
}

function validateOriginalText() {
  const text = els.originalText.value.trim();
  const ok = text.length > 0;
  setFieldError(els.originalText, els.originalTextError, ok ? "" : "원본 문장을 입력해 주세요.");
  return ok;
}

function validateAuthForm() {
  const emailOk = validateEmail();
  const passwordOk = validatePassword();
  return emailOk && passwordOk;
}

function normalizeFetchError(err) {
  const msg = String(err?.message || "");
  if (msg.includes("Failed to fetch")) {
    return "서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return msg || "요청 처리 중 오류가 발생했습니다.";
}

async function postJsonWithTimeout(url, payload, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("서버 응답이 지연되고 있습니다. 다시 시도해 주세요.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-session-token": state.sessionToken
  };
}

function updateAuthUI() {
  const isLoggedIn = Boolean(state.user);
  els.rewriteBtn.disabled = !isLoggedIn;
  els.proBtn.disabled = !isLoggedIn;
  els.businessBtn.disabled = !isLoggedIn;
  els.topupBtn.disabled = !isLoggedIn;
  els.logoutBtn.disabled = !isLoggedIn;
  els.logoutWrap.style.display = isLoggedIn ? "flex" : "none";
}

function usageText(user) {
  if (!user?.usage) return "";
  const u = user.usage;
  return `무료 잔여 ${u.freeCreditsRemaining}/${u.freeCreditsTotal} | 이번달 ${u.requestCount}회`;
}

async function saveLocalState() {
  await chrome.storage.sync.set({
    tone: els.tone.value,
    recipient: els.recipient.value,
    senderRole: els.senderRole.value.trim(),
    email: els.email.value.trim(),
    rememberMe: els.rememberMe.checked
  });

  if (state.rememberMe && state.sessionToken) {
    await chrome.storage.local.set({ sessionToken: state.sessionToken });
  } else {
    await chrome.storage.local.remove(["sessionToken"]);
  }
}

async function loadLocalState() {
  const sync = await chrome.storage.sync.get(["tone", "recipient", "senderRole", "email", "rememberMe"]);
  const local = await chrome.storage.local.get(["sessionToken"]);

  els.tone.value = sync.tone || "정중하게";
  els.recipient.value = sync.recipient || "기타";
  els.senderRole.value = sync.senderRole || "";
  els.email.value = sync.email || "";
  els.rememberMe.checked = Boolean(sync.rememberMe);

  state.rememberMe = Boolean(sync.rememberMe);
  state.sessionToken = state.rememberMe ? local.sessionToken || "" : "";
}

async function refreshSession() {
  if (!state.sessionToken) {
    state.user = null;
    updateAuthUI();
    setStatus("로그인 후 사용해 주세요. 처음 계정은 무료 5회 제공됩니다.");
    return;
  }

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/auth/session`, {
      method: "GET",
      headers: { "x-session-token": state.sessionToken }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "세션 만료");

    state.user = json;
    updateAuthUI();
    setStatus(`로그인됨 | ${usageText(json)}`, "success");
  } catch (err) {
    state.user = null;
    state.sessionToken = "";
    await chrome.storage.local.remove(["sessionToken"]);
    updateAuthUI();
    setStatus(err.message || "로그인이 필요합니다.", "error");
  }
}

async function signup() {
  if (!validateAuthForm()) {
    setAuthStatus("입력값을 확인해 주세요.", "error");
    setStatus("입력값을 확인해 주세요.", "error");
    return;
  }

  const email = els.email.value.trim().toLowerCase();
  const password = els.password.value;
  const rememberMe = els.rememberMe.checked;

  try {
    els.signupBtn.disabled = true;
    els.loginBtn.disabled = true;
    setAuthStatus("회원가입 진행 중...", "success");
    setStatus("회원가입 중...");
    const json = await postJsonWithTimeout(`${state.apiBaseUrl}/api/auth/signup`, {
      email,
      password,
      rememberMe
    });

    state.sessionToken = json.sessionToken;
    state.user = json;
    state.rememberMe = rememberMe;
    await saveLocalState();
    updateAuthUI();
    setAuthStatus("회원가입 성공", "success");
    setStatus(`가입 완료 | ${usageText(json)}`, "success");
  } catch (err) {
    const message = normalizeFetchError(err);
    setAuthStatus(message, "error");
    setStatus(message, "error");
  } finally {
    els.signupBtn.disabled = false;
    els.loginBtn.disabled = false;
  }
}

async function login() {
  if (!validateAuthForm()) {
    setAuthStatus("입력값을 확인해 주세요.", "error");
    setStatus("입력값을 확인해 주세요.", "error");
    return;
  }

  const email = els.email.value.trim().toLowerCase();
  const password = els.password.value;
  const rememberMe = els.rememberMe.checked;

  try {
    els.loginBtn.disabled = true;
    els.signupBtn.disabled = true;
    setAuthStatus("로그인 진행 중...", "success");
    setStatus("로그인 중...");
    const json = await postJsonWithTimeout(`${state.apiBaseUrl}/api/auth/login`, {
      email,
      password,
      rememberMe
    });

    state.sessionToken = json.sessionToken;
    state.user = json;
    state.rememberMe = rememberMe;
    await saveLocalState();
    updateAuthUI();
    setAuthStatus("로그인 성공", "success");
    setStatus(`로그인 완료 | ${usageText(json)}`, "success");
  } catch (err) {
    const message = normalizeFetchError(err);
    setAuthStatus(message, "error");
    setStatus(message, "error");
  } finally {
    els.loginBtn.disabled = false;
    els.signupBtn.disabled = false;
  }
}

async function logout() {
  if (!state.sessionToken) {
    setStatus("이미 로그아웃 상태입니다.");
    return;
  }

  try {
    await fetch(`${state.apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "x-session-token": state.sessionToken }
    });
  } catch {
    // ignore
  }

  state.sessionToken = "";
  state.user = null;
  state.rememberMe = false;
  els.rememberMe.checked = false;
  await chrome.storage.local.remove(["sessionToken"]);
  await chrome.storage.sync.set({ rememberMe: false });
  updateAuthUI();
  setAuthStatus("");
  setStatus("로그아웃 되었습니다.", "success");
}

async function rewrite() {
  if (!state.sessionToken) {
    setStatus("로그인 정보가 없습니다. 먼저 로그인해 주세요.", "error");
    return;
  }

  if (!validateOriginalText()) {
    setStatus("원본 문장을 입력해 주세요.", "error");
    return;
  }

  const originalText = els.originalText.value.trim();

  setStatus("변환 중...");
  els.rewriteBtn.disabled = true;

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/rewrite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        originalText,
        tone: els.tone.value,
        recipient: els.recipient.value,
        senderRole: els.senderRole.value.trim() || "발신자"
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "변환 실패");

    els.rewrittenText.value = json.rewrittenText || "";

    const meRes = await fetch(`${state.apiBaseUrl}/api/auth/session`, {
      headers: { "x-session-token": state.sessionToken }
    });
    const me = await meRes.json();
    if (meRes.ok) state.user = me;

    setStatus(`완료 | ${usageText(state.user || me)}`, "success");
  } catch (err) {
    setStatus(err.message || "변환 중 오류가 발생했습니다.", "error");
  } finally {
    els.rewriteBtn.disabled = false;
  }
}

async function copyResult() {
  const text = els.rewrittenText.value.trim();
  if (!text) {
    setStatus("복사할 변환 결과가 없습니다.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("변환된 문장을 복사했습니다.", "success");
  } catch {
    setStatus("복사에 실패했습니다. 다시 시도해 주세요.", "error");
  }
}

async function goPlans(target) {
  if (!state.sessionToken) {
    setStatus("로그인 정보가 없습니다. 먼저 로그인해 주세요.", "error");
    return;
  }
  const url = `${state.apiBaseUrl}/billing/plans?target=${encodeURIComponent(target)}`;
  await chrome.tabs.create({ url });
}

els.email.addEventListener("input", validateEmail);
els.password.addEventListener("input", validatePassword);
els.originalText.addEventListener("input", validateOriginalText);
els.email.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
els.password.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

els.loginBtn.addEventListener("click", login);
els.signupBtn.addEventListener("click", signup);
els.logoutBtn.addEventListener("click", logout);
els.rewriteBtn.addEventListener("click", rewrite);
els.copyBtn.addEventListener("click", copyResult);
els.proBtn.addEventListener("click", () => goPlans("pro"));
els.businessBtn.addEventListener("click", () => goPlans("business"));
els.topupBtn.addEventListener("click", () => goPlans("topup10"));

[els.tone, els.recipient, els.senderRole, els.email, els.rememberMe].forEach((el) => {
  el.addEventListener("change", saveLocalState);
});

(async () => {
  try {
    await loadLocalState();
    updateAuthUI();
    await refreshSession();
    validateEmail();
    validatePassword();
  } catch (err) {
    setStatus(`초기화 오류: ${err?.message || "unknown"}`, "error");
  }
})();
