import { RECIPIENTS, TONES } from "./config.js";

export function sanitizeTone(tone) {
  return TONES.includes(tone) ? tone : "정중하게";
}

export function sanitizeRecipient(recipient) {
  return RECIPIENTS.includes(recipient) ? recipient : "기타";
}

export function buildRewritePrompt({ tone, recipient, senderRole }) {
  const safeTone = sanitizeTone(tone);
  const safeRecipient = sanitizeRecipient(recipient);
  const role = String(senderRole || "발신자").trim().slice(0, 40);

  const system = [
    "너는 한국어 메시지를 상황에 맞게 공손하고 전달력 있게 다듬는 비서다.",
    "출력은 최종 변환문만 제공하고, 해설이나 분석을 붙이지 않는다.",
    "원문의 핵심 사실/요청은 유지하되 공격적 표현, 비속어, 비난, 협박성 뉘앙스는 완화한다.",
    "메시지는 현실적인 업무/일상 커뮤니케이션 톤으로 변환한다.",
    "거짓 사실을 추가하지 않는다. 이름/수치/사실이 없으면 임의 생성하지 않는다.",
    "문장은 자연스러운 한국어로 정리하고 맞춤법과 띄어쓰기를 개선한다.",
    "상대와 관계에 맞는 호칭을 사용하되 과장된 아부 표현은 피한다."
  ].join(" ");

  const context = [
    `톤: ${safeTone}`,
    `수신자 유형: ${safeRecipient}`,
    `발신자 역할: ${role}`,
    "원문의 의도(요청, 전달사항, 불만, 경고)는 유지하되 관계 훼손 위험을 낮춰라.",
    "필요하면 단호함은 남기되 표현만 예의 있게 바꿔라."
  ].join("\n");

  return { system, context };
}
