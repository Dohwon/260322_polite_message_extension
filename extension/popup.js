const DEFAULT_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";

const els = {
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  authStatus: document.getElementById("authStatus"),
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
  user: null,
  oauthBusy: false
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

function validateOriginalText() {
  const text = els.originalText.value.trim();
  const ok = text.length > 0;
  setFieldError(els.originalText, els.originalTextError, ok ? "" : "원본 문장을 입력해 주세요.");
  return ok;
}

function normalizeFetchError(err) {
  const msg = String(err?.message || "");
  if (msg.includes("Failed to fetch")) return "서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  return msg || "요청 처리 중 오류가 발생했습니다.";
}

function usageText(user) {
  if (!user?.usage) return "";
  const u = user.usage;
  return `무료 잔여 ${u.freeCreditsRemaining}/${u.freeCreditsTotal} | 이번달 ${u.requestCount}회`;
}

function createDeviceId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `ext_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function saveLocalState() {
  await chrome.storage.sync.set({
    tone: els.tone.value,
    recipient: els.recipient.value,
    senderRole: els.senderRole.value.trim()
  });
  if (state.sessionToken) {
    await chrome.storage.local.set({ sessionToken: state.sessionToken });
  } else {
    await chrome.storage.local.remove(["sessionToken"]);
  }
}

async function loadLocalState() {
  const sync = await chrome.storage.sync.get(["tone", "recipient", "senderRole"]);
  const local = await chrome.storage.local.get(["sessionToken"]);
  els.tone.value = sync.tone || "정중하게";
  els.recipient.value = sync.recipient || "기타";
  els.senderRole.value = sync.senderRole || "";
  state.sessionToken = local.sessionToken || "";
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
  els.googleLoginBtn.disabled = state.oauthBusy;
  els.logoutWrap.style.display = isLoggedIn ? "flex" : "none";
}

async function refreshSession() {
  if (!state.sessionToken) {
    state.user = null;
    updateAuthUI();
    setAuthStatus("Google 로그인이 필요합니다.");
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
    setAuthStatus("로그인됨", "success");
    setStatus(`로그인됨 | ${usageText(json)}`, "success");
  } catch (err) {
    state.user = null;
    state.sessionToken = "";
    await chrome.storage.local.remove(["sessionToken"]);
    updateAuthUI();
    setAuthStatus("Google 로그인이 필요합니다.", "error");
    setStatus(normalizeFetchError(err), "error");
  }
}

async function pollGoogleLogin(deviceId, tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(`${state.apiBaseUrl}/api/auth/google/poll?deviceId=${encodeURIComponent(deviceId)}`);
    const json = await res.json();
    if (res.status === 202) continue;
    if (!res.ok) throw new Error(json.error || "Google 로그인 확인 실패");

    state.sessionToken = json.sessionToken;
    state.user = json;
    await saveLocalState();
    updateAuthUI();
    setAuthStatus("Google 로그인 성공", "success");
    setStatus(`로그인 완료 | ${usageText(json)}`, "success");

    if (Number.isInteger(tabId)) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // ignore close failure
      }
    }
    return;
  }
  throw new Error("로그인 대기 시간이 초과되었습니다. 다시 시도해 주세요.");
}

async function loginWithGoogle() {
  if (state.oauthBusy) return;
  state.oauthBusy = true;
  updateAuthUI();

  try {
    const deviceId = createDeviceId();
    const loginUrl = `${state.apiBaseUrl}/api/auth/google/start?deviceId=${encodeURIComponent(deviceId)}`;
    setAuthStatus("Google 로그인 창을 여는 중...", "success");
    const tab = await chrome.tabs.create({ url: loginUrl });
    await pollGoogleLogin(deviceId, tab?.id);
  } catch (err) {
    const message = normalizeFetchError(err);
    setAuthStatus(message, "error");
    setStatus(message, "error");
  } finally {
    state.oauthBusy = false;
    updateAuthUI();
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
  await chrome.storage.local.remove(["sessionToken"]);
  updateAuthUI();
  setAuthStatus("로그아웃 되었습니다.");
  setStatus("로그아웃 되었습니다.", "success");
}

async function rewrite() {
  if (!state.sessionToken) {
    setStatus("Google 로그인이 필요합니다.", "error");
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
    setStatus(normalizeFetchError(err), "error");
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
    setStatus("먼저 Google 로그인해 주세요.", "error");
    return;
  }
  const url = `${state.apiBaseUrl}/billing/plans?target=${encodeURIComponent(target)}`;
  await chrome.tabs.create({ url });
}

els.googleLoginBtn.addEventListener("click", loginWithGoogle);
els.logoutBtn.addEventListener("click", logout);
els.rewriteBtn.addEventListener("click", rewrite);
els.copyBtn.addEventListener("click", copyResult);
els.proBtn.addEventListener("click", () => goPlans("pro"));
els.businessBtn.addEventListener("click", () => goPlans("business"));
els.topupBtn.addEventListener("click", () => goPlans("topup10"));
els.originalText.addEventListener("input", validateOriginalText);

[els.tone, els.recipient, els.senderRole].forEach((el) => {
  el.addEventListener("change", saveLocalState);
});

(async () => {
  try {
    await loadLocalState();
    updateAuthUI();
    await refreshSession();
  } catch (err) {
    setStatus(`초기화 오류: ${normalizeFetchError(err)}`, "error");
  }
})();
