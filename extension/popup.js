const LIVE_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";
const DEFAULT_API_BASE_URL = LIVE_API_BASE_URL;
const GOOGLE_LOGIN_POLL_INTERVAL_MS = 800;
const GOOGLE_LOGIN_MAX_ATTEMPTS = 150;

const STORAGE_KEYS = {
  sessionToken: "sessionToken",
  pendingGoogleDeviceId: "pendingGoogleDeviceId",
  pendingGoogleStartedAt: "pendingGoogleStartedAt",
  outputLanguage: "outputLanguage",
  tone: "tone",
  recipient: "recipient",
  senderRole: "senderRole",
  backgroundNote: "backgroundNote",
  backgroundExpanded: "backgroundExpanded",
  harshFilterEnabled: "harshFilterEnabled",
  draftOriginalText: "draftOriginalText",
  draftRewrittenText: "draftRewrittenText"
};

const els = {
  accountSummary: document.getElementById("accountSummary"),
  authStatus: document.getElementById("authStatus"),
  googleLoginBtn: document.getElementById("googleLoginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  plansInfoBtn: document.getElementById("plansInfoBtn"),
  planSummary: document.getElementById("planSummary"),
  managePlanBtn: document.getElementById("managePlanBtn"),
  topupBtn: document.getElementById("topupBtn"),
  planPreviewOverlayBtn: document.getElementById("planPreviewOverlayBtn"),
  outputLanguage: document.getElementById("outputLanguage"),
  tone: document.getElementById("tone"),
  recipient: document.getElementById("recipient"),
  senderRole: document.getElementById("senderRole"),
  backgroundToggleBtn: document.getElementById("backgroundToggleBtn"),
  backgroundWrap: document.getElementById("backgroundWrap"),
  backgroundNote: document.getElementById("backgroundNote"),
  backgroundNoteMeta: document.getElementById("backgroundNoteMeta"),
  harshFilterEnabled: document.getElementById("harshFilterEnabled"),
  originalText: document.getElementById("originalText"),
  originalTextError: document.getElementById("originalTextError"),
  rewrittenText: document.getElementById("rewrittenText"),
  rewriteBtn: document.getElementById("rewriteBtn"),
  resetBtn: document.getElementById("resetBtn"),
  copyBtn: document.getElementById("copyBtn"),
  status: document.getElementById("status")
};

const state = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  sessionToken: "",
  user: null,
  isPollingGoogleLogin: false,
  autoReloginTriggered: false
};

function setButtonLabel(element, primary, secondary = "") {
  if (!element) return;
  const safePrimary = primary || "";
  const safeSecondary = secondary || "";
  element.innerHTML = safeSecondary
    ? `${safePrimary}<span class="btn-sub">${safeSecondary}</span>`
    : safePrimary;
}

function setStatus(message, variant = "info") {
  if (!els.status) return;
  els.status.textContent = message || "";
  els.status.classList.remove("error", "success", "warning");
  if (variant === "error") els.status.classList.add("error");
  if (variant === "success") els.status.classList.add("success");
  if (variant === "warning") els.status.classList.add("warning");
}

function setAuthStatus(message, variant = "info") {
  if (!els.authStatus) return;
  els.authStatus.textContent = message || "";
  els.authStatus.classList.remove("error", "success");
  if (variant === "error") els.authStatus.classList.add("error");
  if (variant === "success") els.authStatus.classList.add("success");
}

function setFieldError(inputEl, errorEl, message) {
  if (!inputEl || !errorEl) return;
  errorEl.textContent = message || "";
  inputEl.classList.toggle("invalid", Boolean(message));
}

function validateOriginalText() {
  const text = els.originalText?.value?.trim() || "";
  const limit = state.user?.limits?.maxCharsPerRequest || 2000;

  if (!text) {
    setFieldError(els.originalText, els.originalTextError, "원본 문장을 입력해 주세요.");
    return false;
  }

  if (text.length > limit) {
    setFieldError(
      els.originalText,
      els.originalTextError,
      `현재 플랜은 1회 ${limit}자까지 입력할 수 있습니다.`
    );
    return false;
  }

  setFieldError(els.originalText, els.originalTextError, "");
  return true;
}

function normalizeFetchError(err) {
  const msg = String(err?.message || "");
  if (msg.includes("Failed to fetch")) {
    return "서버 연결에 실패했습니다. 백엔드 주소와 CORS 설정을 확인해 주세요.";
  }
  return msg || "요청 처리 중 오류가 발생했습니다.";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remainingMonthlyCount(user) {
  const limit = Number(user?.limits?.maxMonthlyRequests || 0);
  const used = Number(user?.usage?.requestCount || 0);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, limit - used);
}

function lowBalanceVariant(user) {
  const remaining = remainingMonthlyCount(user);
  if (user?.planId === "pro" && remaining !== null && remaining <= 10) return "warning";
  if (user?.planId === "business" && remaining !== null && remaining <= 20) return "warning";
  return "success";
}

function updateBackgroundMeta() {
  if (!els.backgroundNoteMeta || !els.backgroundNote) return;
  const count = (els.backgroundNote.value || "").trim().length;
  els.backgroundNoteMeta.textContent = `${count}/100자. 참고만 하고 결과문에 직접 인용하지 않습니다.`;
}

function setBackgroundExpanded(expanded) {
  if (!els.backgroundWrap || !els.backgroundToggleBtn) return;
  els.backgroundWrap.classList.toggle("hidden", !expanded);
  setButtonLabel(
    els.backgroundToggleBtn,
    expanded ? "상황 설명 접기" : "상황 설명 추가",
    expanded ? "Hide context" : "Add context"
  );
}

function usageText(user) {
  if (!user?.usage || !user?.limits) return "";

  const parts = [];
  const dailyTotal = Number(user.usage.freeCreditsTotal || user.limits.dailyRequestLimit || 0);
  const dailyUsed = Number(user.usage.freeDailyUsedAccount || 0);
  const monthlyUsed = Number(user.usage.monthlyRequestsUsed || user.usage.requestCount || 0);
  const monthlyTotal = Number(user.usage.monthlyRequestsTotal || user.limits.maxMonthlyRequests || 0);
  const bonusRemaining = Number(user.usage.bonusRequestsRemaining || 0);
  const bonusTotal = Number(user.usage.bonusRequestsTotal || 0);

  if (user.planId === "free") {
    if (dailyTotal > 0) {
      parts.push(`일일 무료 ${Math.max(0, dailyTotal - dailyUsed)}/${dailyTotal}회 남음`);
    }
  } else if (Number.isFinite(user.limits.dailyRequestLimit) && user.limits.dailyRequestLimit !== null) {
    const proDailyTotal = Number(user.limits.dailyRequestLimit || 0);
    if (proDailyTotal > 0) {
      parts.push(`오늘 ${dailyUsed}/${proDailyTotal}회 사용`);
    }
  }

  if (monthlyTotal > 0) {
    parts.push(`이번달 ${monthlyUsed}/${monthlyTotal}회 소진`);
  }

  if (bonusTotal > 0) {
    parts.push(`추가 지급 ${bonusRemaining}/${bonusTotal}회 사용중`);
  }

  return parts.join(", ");
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-session-token": state.sessionToken || ""
  };
}

function buildBackgroundNoteForRequest() {
  const userNote = els.backgroundNote?.value?.trim() || "";
  const outputLanguage = els.outputLanguage?.value || "ko";

  if (outputLanguage !== "en") {
    return userNote;
  }

  const englishDirective = "언어 규칙: 최종 결과는 반드시 영어로만 작성. 한국어 금지.";
  if (!userNote) {
    return englishDirective;
  }

  return `${englishDirective} ${userNote}`.slice(0, 100);
}

function updateAuthUI() {
  const isLoggedIn = Boolean(state.user);
  const loginPending = state.isPollingGoogleLogin;

  if (els.googleLoginBtn) {
    els.googleLoginBtn.disabled = isLoggedIn;
    els.googleLoginBtn.classList.toggle("hidden", isLoggedIn);
    setButtonLabel(
      els.googleLoginBtn,
      loginPending ? "Google 다시 열기" : "Google로 시작",
      loginPending ? "Open again" : "Sign in"
    );
  }
  if (els.logoutBtn) {
    els.logoutBtn.disabled = !isLoggedIn;
    els.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  }
  if (els.rewriteBtn) els.rewriteBtn.disabled = !isLoggedIn;
  if (els.topupBtn) els.topupBtn.disabled = true;
  if (els.managePlanBtn) els.managePlanBtn.disabled = true;

  if (!isLoggedIn) {
    if (els.accountSummary) {
      els.accountSummary.textContent = "Google 계정으로 로그인해 주세요.";
    }
    if (els.planSummary) {
      els.planSummary.textContent = loginPending
        ? "Google 로그인 확인 중입니다..."
        : "로그인하면 현재 플랜과 사용 현황을 확인할 수 있습니다.";
    }
    return;
  }

  if (els.accountSummary) {
    els.accountSummary.textContent = state.user.email || "로그인 계정";
  }

  if (els.planSummary) {
    if (state.user.planId === "business") {
      els.planSummary.textContent = "비즈니스 플랜 사용자입니다.";
    } else if (state.user.planId === "pro") {
      els.planSummary.textContent = "프로 플랜 사용자입니다.";
    } else {
      els.planSummary.textContent = "무료 사용 계정입니다.";
    }
  }
}

async function saveLocalState() {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.outputLanguage]: els.outputLanguage?.value || "ko",
    [STORAGE_KEYS.tone]: els.tone?.value || "정중하게",
    [STORAGE_KEYS.recipient]: els.recipient?.value || "기타",
    [STORAGE_KEYS.senderRole]: els.senderRole?.value?.trim() || "",
    [STORAGE_KEYS.backgroundNote]: els.backgroundNote?.value?.trim() || "",
    [STORAGE_KEYS.backgroundExpanded]: !els.backgroundWrap?.classList.contains("hidden"),
    [STORAGE_KEYS.harshFilterEnabled]: Boolean(els.harshFilterEnabled?.checked)
  });

  if (state.sessionToken) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.sessionToken]: state.sessionToken
    });
  } else {
    await chrome.storage.local.remove([STORAGE_KEYS.sessionToken]);
  }
}

async function saveDraftTexts() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.draftOriginalText]: els.originalText?.value || "",
    [STORAGE_KEYS.draftRewrittenText]: els.rewrittenText?.value || ""
  });
}

async function loadLocalState() {
  const sync = await chrome.storage.sync.get([
    STORAGE_KEYS.outputLanguage,
    STORAGE_KEYS.tone,
    STORAGE_KEYS.recipient,
    STORAGE_KEYS.senderRole,
    STORAGE_KEYS.backgroundNote,
    STORAGE_KEYS.backgroundExpanded,
    STORAGE_KEYS.harshFilterEnabled
  ]);

  const local = await chrome.storage.local.get([
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.pendingGoogleDeviceId,
    STORAGE_KEYS.pendingGoogleStartedAt,
    STORAGE_KEYS.draftOriginalText,
    STORAGE_KEYS.draftRewrittenText
  ]);

  if (els.outputLanguage) els.outputLanguage.value = sync[STORAGE_KEYS.outputLanguage] || "ko";
  if (els.tone) els.tone.value = sync[STORAGE_KEYS.tone] || "정중하게";
  if (els.recipient) els.recipient.value = sync[STORAGE_KEYS.recipient] || "기타";
  if (els.senderRole) els.senderRole.value = sync[STORAGE_KEYS.senderRole] || "";
  if (els.backgroundNote) els.backgroundNote.value = sync[STORAGE_KEYS.backgroundNote] || "";
  if (els.harshFilterEnabled) els.harshFilterEnabled.checked = sync[STORAGE_KEYS.harshFilterEnabled] !== false;
  if (els.originalText) els.originalText.value = local[STORAGE_KEYS.draftOriginalText] || "";
  if (els.rewrittenText) els.rewrittenText.value = local[STORAGE_KEYS.draftRewrittenText] || "";
  setBackgroundExpanded(Boolean(sync[STORAGE_KEYS.backgroundExpanded]));
  updateBackgroundMeta();

  state.sessionToken = local[STORAGE_KEYS.sessionToken] || "";
  return {
    pendingGoogleDeviceId: local[STORAGE_KEYS.pendingGoogleDeviceId] || "",
    pendingGoogleStartedAt: Number(local[STORAGE_KEYS.pendingGoogleStartedAt] || 0)
  };
}

async function clearPendingGoogleLogin() {
  state.isPollingGoogleLogin = false;
  await chrome.storage.local.remove([
    STORAGE_KEYS.pendingGoogleDeviceId,
    STORAGE_KEYS.pendingGoogleStartedAt
  ]);
  updateAuthUI();
}

async function refreshSession() {
  if (!state.sessionToken) {
    state.user = null;
    updateAuthUI();
    setAuthStatus("", "info");
    setStatus("Google 로그인 후 사용할 수 있습니다.");
    return;
  }

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/auth/session`, {
      method: "GET",
      headers: {
        "x-session-token": state.sessionToken
      }
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "세션 만료");
    }

    state.user = json;
    state.autoReloginTriggered = false;
    updateAuthUI();
    setAuthStatus("Google 로그인", "success");
    setStatus(usageText(json), lowBalanceVariant(json));
  } catch (err) {
    state.user = null;
    state.sessionToken = "";
    await chrome.storage.local.remove([STORAGE_KEYS.sessionToken]);
    updateAuthUI();
    const msg = String(err?.message || "");
    const isSessionExpired = msg.includes("세션") || msg.includes("401");
    if (!isSessionExpired) {
      setAuthStatus("로그인 상태 확인 실패", "error");
      setStatus(normalizeFetchError(err), "error");
      return;
    }
    setAuthStatus("세션이 만료되었습니다.", "error");
    setStatus("세션 만료로 다시 로그인합니다. Google 창을 확인해 주세요.", "error");
    if (!state.autoReloginTriggered) {
      state.autoReloginTriggered = true;
      loginWithGoogle().catch(() => {});
    }
  }
}

function createDeviceId() {
  return `ext_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

async function pollGoogleLogin(deviceId, { silent = false } = {}) {
  if (!deviceId) return;
  if (state.isPollingGoogleLogin) return;

  state.isPollingGoogleLogin = true;
  updateAuthUI();

  if (!silent) {
    setAuthStatus("Google 로그인 확인 중...", "success");
    setStatus("브라우저 탭에서 Google 로그인을 완료한 뒤, 이 창을 다시 열면 자동 연결됩니다.");
  }

  try {
    for (let attempt = 0; attempt < GOOGLE_LOGIN_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await delay(GOOGLE_LOGIN_POLL_INTERVAL_MS);
      }

      const res = await fetch(
        `${state.apiBaseUrl}/api/auth/google/poll?deviceId=${encodeURIComponent(deviceId)}`
      );

      const json = await res.json();

      if (res.status === 202) {
        continue;
      }

      if (!res.ok) {
        throw new Error(json.error || "Google 로그인 확인에 실패했습니다.");
      }

      state.sessionToken = json.sessionToken || "";
      state.user = json;

      await saveLocalState();
      await clearPendingGoogleLogin();

      updateAuthUI();
      setAuthStatus("Google 로그인 완료", "success");
      setStatus(usageText(json), lowBalanceVariant(json));
      return;
    }

    throw new Error("로그인 확인 시간이 초과되었습니다. 다시 시도해 주세요.");
  } catch (err) {
    await clearPendingGoogleLogin();
    setAuthStatus(normalizeFetchError(err), "error");
    setStatus(normalizeFetchError(err), "error");
  } finally {
    state.isPollingGoogleLogin = false;
    updateAuthUI();
  }
}

async function resumePendingGoogleLoginIfExists(pendingGoogleDeviceId, pendingGoogleStartedAt) {
  if (!pendingGoogleDeviceId) return;

  const isExpired =
    !pendingGoogleStartedAt || Date.now() - pendingGoogleStartedAt > 10 * 60 * 1000;

  if (isExpired) {
    await clearPendingGoogleLogin();
    return;
  }

  pollGoogleLogin(pendingGoogleDeviceId, { silent: true }).catch(() => {});
}

async function loginWithGoogle() {
  try {
    if (state.isPollingGoogleLogin) {
      await clearPendingGoogleLogin();
    }
    const deviceId = createDeviceId();

    await chrome.storage.local.set({
      [STORAGE_KEYS.pendingGoogleDeviceId]: deviceId,
      [STORAGE_KEYS.pendingGoogleStartedAt]: Date.now()
    });

    setAuthStatus("Google 로그인 창을 여는 중...", "success");
    setStatus("브라우저 탭에서 Google 로그인을 완료해 주세요. 창을 닫아도 다시 열면 자동 연결됩니다.");

    const loginUrl = `${state.apiBaseUrl}/api/auth/google/start?deviceId=${encodeURIComponent(deviceId)}`;
    await chrome.tabs.create({ url: loginUrl });

    pollGoogleLogin(deviceId).catch((err) => {
      setAuthStatus(normalizeFetchError(err), "error");
      setStatus(normalizeFetchError(err), "error");
    });
  } catch (err) {
    state.isPollingGoogleLogin = false;
    updateAuthUI();
    setAuthStatus(normalizeFetchError(err), "error");
    setStatus(normalizeFetchError(err), "error");
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
      headers: {
        "x-session-token": state.sessionToken
      }
    });
  } catch {
    // ignore
  }

  state.sessionToken = "";
  state.user = null;

  await chrome.storage.local.remove([
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.pendingGoogleDeviceId,
    STORAGE_KEYS.pendingGoogleStartedAt
  ]);

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

  if (els.rewriteBtn) els.rewriteBtn.disabled = true;
  setStatus("메세지를 다듬는 중...");

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/rewrite`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        originalText: els.originalText?.value?.trim() || "",
        outputLanguage: els.outputLanguage?.value || "ko",
        tone: els.tone?.value || "정중하게",
        recipient: els.recipient?.value || "기타",
        senderRole: els.senderRole?.value?.trim() || "발신자",
        backgroundNote: buildBackgroundNoteForRequest(),
        harshFilterEnabled: Boolean(els.harshFilterEnabled?.checked)
      })
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || "변환 실패");
    }

    if (els.rewrittenText) {
      els.rewrittenText.value = json.rewrittenText || "";
    }
    await saveDraftTexts();

    await refreshSession();
    setStatus(`완료 | ${usageText(state.user)}`, lowBalanceVariant(state.user));
  } catch (err) {
    setStatus(normalizeFetchError(err), "error");
  } finally {
    if (els.rewriteBtn) els.rewriteBtn.disabled = false;
  }
}

async function resetDraft() {
  if (els.originalText) els.originalText.value = "";
  if (els.rewrittenText) els.rewrittenText.value = "";
  if (els.backgroundNote) els.backgroundNote.value = "";
  setFieldError(els.originalText, els.originalTextError, "");
  updateBackgroundMeta();
  await saveLocalState();
  await chrome.storage.local.remove([STORAGE_KEYS.draftOriginalText, STORAGE_KEYS.draftRewrittenText]);
  setStatus("입력/결과를 초기화했습니다.", "success");
}

async function copyResult() {
  const text = els.rewrittenText?.value?.trim() || "";
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

function safeBind(element, eventName, handler, elementName) {
  if (!element) {
    console.warn(`[popup] missing element: ${elementName}`);
    return;
  }
  element.addEventListener(eventName, handler);
}

safeBind(els.originalText, "input", validateOriginalText, "originalText");
safeBind(els.originalText, "input", () => {
  saveDraftTexts().catch(() => {});
}, "originalTextPersist");
safeBind(els.googleLoginBtn, "click", loginWithGoogle, "googleLoginBtn");
safeBind(els.logoutBtn, "click", logout, "logoutBtn");
safeBind(els.rewriteBtn, "click", rewrite, "rewriteBtn");
safeBind(els.resetBtn, "click", resetDraft, "resetBtn");
safeBind(els.copyBtn, "click", copyResult, "copyBtn");
safeBind(els.plansInfoBtn, "click", () => goPlans(""), "plansInfoBtn");
safeBind(els.planPreviewOverlayBtn, "click", () => goPlans(""), "planPreviewOverlayBtn");
safeBind(els.topupBtn, "click", (event) => {
  event.preventDefault();
}, "topupBtn");
safeBind(els.managePlanBtn, "click", (event) => {
  event.preventDefault();
}, "managePlanBtn");
safeBind(els.backgroundToggleBtn, "click", () => {
  const next = els.backgroundWrap?.classList.contains("hidden");
  setBackgroundExpanded(Boolean(next));
  saveLocalState().catch(() => {});
}, "backgroundToggleBtn");
safeBind(els.backgroundNote, "input", () => {
  updateBackgroundMeta();
  saveLocalState().catch(() => {});
}, "backgroundNote");
safeBind(els.outputLanguage, "change", () => saveLocalState().catch(() => {}), "outputLanguage");
safeBind(els.tone, "change", () => saveLocalState().catch(() => {}), "tone");
safeBind(els.recipient, "change", () => saveLocalState().catch(() => {}), "recipient");
safeBind(els.senderRole, "input", () => saveLocalState().catch(() => {}), "senderRole");
safeBind(els.harshFilterEnabled, "change", () => saveLocalState().catch(() => {}), "harshFilterEnabled");

(async function init() {
  const { pendingGoogleDeviceId, pendingGoogleStartedAt } = await loadLocalState();
  updateAuthUI();
  if (state.sessionToken) {
    await refreshSession();
  } else {
    setStatus("Google 로그인 후 사용할 수 있습니다.");
  }
  validateOriginalText();
  await resumePendingGoogleLoginIfExists(pendingGoogleDeviceId, pendingGoogleStartedAt);
})();
