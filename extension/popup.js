const LIVE_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";
const DEFAULT_API_BASE_URL = LIVE_API_BASE_URL;

const els = {
  accountSummary: document.getElementById("accountSummary"),
  authStatus: document.getElementById("authStatus"),
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  plansInfoBtn: document.getElementById("plansInfoBtn"),
  planSummary: document.getElementById("planSummary"),
  tone: document.getElementById("tone"),
  recipient: document.getElementById("recipient"),
  senderRole: document.getElementById("senderRole"),
  originalText: document.getElementById("originalText"),
  originalTextError: document.getElementById("originalTextError"),
  rewrittenText: document.getElementById("rewrittenText"),
  rewriteBtn: document.getElementById("rewriteBtn"),
  copyBtn: document.getElementById("copyBtn"),
  monthlyBtn: document.getElementById("monthlyBtn"),
  annualBtn: document.getElementById("annualBtn"),
  status: document.getElementById("status")
};

const state = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  sessionToken: "",
  user: null
};

function setStatus(message, variant = "info") {
  els.status.textContent = message;
  els.status.classList.remove("error", "success");
  if (variant === "error") els.status.classList.add("error");
  if (variant === "success") els.status.classList.add("success");
}

function setAuthStatus(message, variant = "info") {
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
  const limit = state.user?.limits?.maxCharsPerRequest || 2000;
  if (!text) {
    setFieldError(els.originalText, els.originalTextError, "원본 문장을 입력해 주세요.");
    return false;
  }
  if (text.length > limit) {
    setFieldError(els.originalText, els.originalTextError, `현재 플랜은 1회 ${limit}자까지 입력할 수 있습니다.`);
    return false;
  }
  setFieldError(els.originalText, els.originalTextError, "");
  return true;
}

function normalizeFetchError(err) {
  const msg = String(err?.message || "");
  if (msg.includes("Failed to fetch")) {
    return "서버 연결에 실패했습니다. 개발자 모드면 백엔드를 먼저 켜 주세요.";
  }
  return msg || "요청 처리 중 오류가 발생했습니다.";
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

function usageText(user) {
  if (!user?.usage || !user?.limits) return "";
  const used = Number(user.usage.requestCount || 0);
  const limit = Number(user.limits.maxMonthlyRequests || 0);
  if (user.planId === "free") {
    return `무료 ${user.usage.freeCreditsRemaining}/${user.usage.freeCreditsTotal}회 남음 · 월 토큰 ${user.limits.maxMonthlyInputTokens} 제한`;
  }
  return `${user.planName} · 이번 달 ${used}/${limit}회 사용 · 1회 ${user.limits.maxCharsPerRequest}자`;
}

function updateAuthUI() {
  const isLoggedIn = Boolean(state.user);
  els.googleLoginBtn.disabled = isLoggedIn;
  els.logoutBtn.disabled = !isLoggedIn;
  els.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  els.rewriteBtn.disabled = !isLoggedIn;
  els.monthlyBtn.disabled = !isLoggedIn;
  els.annualBtn.disabled = !isLoggedIn;

  if (!isLoggedIn) {
    els.accountSummary.textContent = "Google 계정으로 로그인하면 백엔드에 회원으로 등록되고 Free 5회가 자동 지급됩니다.";
    els.planSummary.textContent = "Free: 총 5회 + 월 100토큰 / Pro Monthly: 월 50회 / Pro Annual: 월 100회";
    return;
  }

  els.accountSummary.textContent = `${state.user.email} · ${state.user.member?.authProvider || "google"} 로그인 · ${state.user.member?.isRegistered ? "회원 등록 완료" : "미등록"}`;
  els.planSummary.textContent = usageText(state.user);
}

async function refreshSession() {
  if (!state.sessionToken) {
    state.user = null;
    updateAuthUI();
    setStatus("Google 로그인 후 사용할 수 있습니다. Free 5회 체험이 먼저 제공됩니다.");
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
    setAuthStatus("Google 로그인 연결됨", "success");
    setStatus(`로그인됨 | ${usageText(json)}`, "success");
  } catch (err) {
    state.user = null;
    state.sessionToken = "";
    await chrome.storage.local.remove(["sessionToken"]);
    updateAuthUI();
    setAuthStatus("세션이 만료되었습니다.", "error");
    setStatus(normalizeFetchError(err), "error");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginWithGoogle() {
  try {
    els.googleLoginBtn.disabled = true;
    setAuthStatus("Google 로그인 창을 여는 중...", "success");
    setStatus("브라우저 탭에서 Google 로그인을 완료해 주세요.");

    const deviceId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    const loginUrl = `${state.apiBaseUrl}/api/auth/google/start?deviceId=${encodeURIComponent(deviceId)}`;
    await chrome.tabs.create({ url: loginUrl });

    for (let attempt = 0; attempt < 90; attempt += 1) {
      await delay(2000);
      const res = await fetch(`${state.apiBaseUrl}/api/auth/google/poll?deviceId=${encodeURIComponent(deviceId)}`);
      const json = await res.json();
      if (res.status === 202) continue;
      if (!res.ok) throw new Error(json.error || "Google 로그인 확인에 실패했습니다.");

      state.sessionToken = json.sessionToken || "";
      state.user = json;
      await saveLocalState();
      updateAuthUI();
      setAuthStatus("Google 로그인 완료", "success");
      setStatus(`로그인 완료 | ${usageText(json)}`, "success");
      return;
    }

    throw new Error("로그인 확인 시간이 초과되었습니다. 다시 시도해 주세요.");
  } catch (err) {
    setAuthStatus(normalizeFetchError(err), "error");
    setStatus(normalizeFetchError(err), "error");
  } finally {
    els.googleLoginBtn.disabled = Boolean(state.user);
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
  setAuthStatus("");
  setStatus("로그아웃 되었습니다.", "success");
}

async function rewrite() {
  if (!state.sessionToken) {
    setStatus("Google 로그인 후 사용할 수 있습니다.", "error");
    return;
  }
  if (!validateOriginalText()) {
    setStatus("입력 내용을 확인해 주세요.", "error");
    return;
  }

  els.rewriteBtn.disabled = true;
  setStatus("정중한 문장으로 다듬는 중...");

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/rewrite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        originalText: els.originalText.value.trim(),
        tone: els.tone.value,
        recipient: els.recipient.value,
        senderRole: els.senderRole.value.trim() || "발신자"
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "변환 실패");

    els.rewrittenText.value = json.rewrittenText || "";
    await refreshSession();
    setStatus(`완료 | ${usageText(state.user)}`, "success");
  } catch (err) {
    setStatus(normalizeFetchError(err), "error");
  } finally {
    els.rewriteBtn.disabled = false;
  }
}

async function copyResult() {
  const text = els.rewrittenText.value.trim();
  if (!text) {
    setStatus("복사할 결과가 없습니다.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("변환 결과를 복사했습니다.", "success");
  } catch {
    setStatus("복사에 실패했습니다.", "error");
  }
}

async function goPlans(target) {
  const params = new URLSearchParams();
  if (target) params.set("target", target);
  if (state.sessionToken) params.set("sessionToken", state.sessionToken);
  const qs = params.toString();
  const url = `${state.apiBaseUrl}/billing/plans${qs ? `?${qs}` : ""}`;
  await chrome.tabs.create({ url });
}

els.originalText.addEventListener("input", validateOriginalText);
els.googleLoginBtn.addEventListener("click", loginWithGoogle);
els.logoutBtn.addEventListener("click", logout);
els.rewriteBtn.addEventListener("click", rewrite);
els.copyBtn.addEventListener("click", copyResult);
els.plansInfoBtn.addEventListener("click", () => goPlans(""));
els.monthlyBtn.addEventListener("click", () => goPlans("pro_monthly"));
els.annualBtn.addEventListener("click", () => goPlans("pro_annual"));

[els.tone, els.recipient, els.senderRole].forEach((el) => {
  el.addEventListener("change", saveLocalState);
});

(async () => {
  try {
    await loadLocalState();
    updateAuthUI();
    await refreshSession();
    validateOriginalText();
  } catch (err) {
    setStatus(`초기화 오류: ${err?.message || "unknown"}`, "error");
  }
})();
