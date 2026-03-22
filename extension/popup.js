const DEFAULT_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";

const els = {
  connectBtn: document.getElementById("connectBtn"),
  tone: document.getElementById("tone"),
  recipient: document.getElementById("recipient"),
  senderRole: document.getElementById("senderRole"),
  originalText: document.getElementById("originalText"),
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
  apiKey: "",
  deviceId: "",
  billingEnabled: false,
  hasPlanPrices: false,
  hasTopupPrice: false
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "#c82222" : "#2b3f8d";
}

function setBillingButtons() {
  const planEnabled = state.billingEnabled && state.hasPlanPrices;
  const topupEnabled = state.billingEnabled && state.hasTopupPrice;

  els.proBtn.disabled = !planEnabled;
  els.businessBtn.disabled = !planEnabled;
  els.topupBtn.disabled = !topupEnabled;
}

function createDeviceId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `d_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getPseudoEmail(deviceId) {
  return `user-${deviceId.replace(/[^a-zA-Z0-9]/g, "")}@pm.local`;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    tone: els.tone.value,
    recipient: els.recipient.value,
    senderRole: els.senderRole.value.trim()
  });

  await chrome.storage.local.set({
    apiKey: state.apiKey,
    deviceId: state.deviceId
  });
}

async function loadSettings() {
  const saved = await chrome.storage.sync.get(["tone", "recipient", "senderRole"]);
  const local = await chrome.storage.local.get(["apiKey", "deviceId"]);

  els.tone.value = saved.tone || "정중하게";
  els.recipient.value = saved.recipient || "기타";
  els.senderRole.value = saved.senderRole || "";

  state.apiKey = local.apiKey || "";
  state.deviceId = local.deviceId || createDeviceId();
}

async function fetchMeta() {
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/meta`);
    const json = await res.json();
    state.billingEnabled = Boolean(json?.billing?.enabled);
    state.hasPlanPrices = Boolean(json?.billing?.hasPlanPrices);
    state.hasTopupPrice = Boolean(json?.billing?.hasTopupPrice);
    setBillingButtons();

    if (!state.billingEnabled) {
      setStatus("현재 결제 기능이 비활성화되어 있습니다. (서버 Stripe 미설정)");
    }
  } catch (err) {
    setStatus(`서버 연결 실패: ${err.message}`, true);
  }
}

async function ensureConnected() {
  if (state.apiKey) return true;

  const pseudoEmail = getPseudoEmail(state.deviceId);

  try {
    setStatus("계정 준비 중...");
    const res = await fetch(`${state.apiBaseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pseudoEmail })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "계정 생성 실패");

    state.apiKey = json.apiKey || "";
    await saveSettings();
    setStatus("시작 준비 완료");
    return Boolean(state.apiKey);
  } catch (err) {
    setStatus(err.message, true);
    return false;
  }
}

async function connectAccount() {
  const ok = await ensureConnected();
  if (ok) {
    await fetchMeta();
  }
}

async function openCheckout(path, body = {}) {
  const connected = await ensureConnected();
  if (!connected) return;

  try {
    const res = await fetch(`${state.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": state.apiKey
      },
      body: JSON.stringify(body)
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "결제 세션 생성에 실패했습니다.");
    }

    if (json.url) {
      await chrome.tabs.create({ url: json.url });
      setStatus("결제 페이지를 열었습니다.");
    } else {
      setStatus("결제 URL을 받지 못했습니다.", true);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function rewrite() {
  await saveSettings();

  const originalText = els.originalText.value.trim();
  if (!originalText) {
    setStatus("원본 문자를 입력해 주세요.", true);
    return;
  }

  const connected = await ensureConnected();
  if (!connected) return;

  setStatus("변환 중...");
  els.rewriteBtn.disabled = true;

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/rewrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": state.apiKey
      },
      body: JSON.stringify({
        originalText,
        tone: els.tone.value,
        recipient: els.recipient.value,
        senderRole: els.senderRole.value.trim() || "발신자"
      })
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "변환 실패");
    }

    els.rewrittenText.value = json.rewrittenText || "";
    const monthly = json.usage?.monthly;
    if (monthly) {
      setStatus(
        `완료 | 이번 달 사용: ${monthly.requestCount}회 / 입력 ${monthly.inputTokens}t / 출력 ${monthly.outputTokens}t`
      );
    } else {
      setStatus("완료");
    }
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    els.rewriteBtn.disabled = false;
  }
}

async function copyResult() {
  const text = els.rewrittenText.value.trim();
  if (!text) {
    setStatus("복사할 변환 결과가 없습니다.", true);
    return;
  }

  await navigator.clipboard.writeText(text);
  setStatus("변환 문장을 복사했습니다.");
}

els.connectBtn.addEventListener("click", connectAccount);
els.rewriteBtn.addEventListener("click", rewrite);
els.copyBtn.addEventListener("click", copyResult);
els.proBtn.addEventListener("click", () => openCheckout("/api/billing/create-checkout", { planId: "pro" }));
els.businessBtn.addEventListener("click", () => openCheckout("/api/billing/create-checkout", { planId: "business" }));
els.topupBtn.addEventListener("click", () => openCheckout("/api/billing/create-topup"));

[els.tone, els.recipient, els.senderRole].forEach((el) => {
  el.addEventListener("change", saveSettings);
});

(async () => {
  await loadSettings();
  setBillingButtons();
  await fetchMeta();
  if (state.apiKey) {
    setStatus("바로 사용 가능");
  } else {
    setStatus("'시작하기'를 누르면 바로 사용 가능합니다.");
  }
})();
