import { RECIPIENTS, TONES } from "./config.js";

export function sanitizeTone(tone) {
  return TONES.includes(tone) ? tone : "정중하게";
}

export function sanitizeRecipient(recipient) {
  return RECIPIENTS.includes(recipient) ? recipient : "기타";
}

export function buildRewritePrompt({ tone, recipient, senderRole, backgroundNote, harshFilterEnabled }) {
  const safeTone = sanitizeTone(tone);
  const safeRecipient = sanitizeRecipient(recipient);
  const role = String(senderRole || "발신자").trim().slice(0, 40);
  const safeBackground = String(backgroundNote || "").trim().slice(0, 100);

  const toneGuideByTone = {
    보통: "원문의 의미와 결은 최대한 유지하고 문법/맞춤법/띄어쓰기와 말투만 자연스럽게 다듬어라. 과도한 공손화나 감정 톤 추가는 금지한다.",
    친근하게: "부담 없는 친근한 한국어로 바꾸되 무례하거나 가벼워 보이지 않게 한다.",
    정중하게: "업무/공식 대화에 맞는 정중한 한국어로 다듬는다.",
    "아주 정중하게": "공손하고 격식 있는 표현으로 다듬되 과장된 아부 표현은 피한다.",
    캐주얼하게: "일상 대화에서 자연스러운 캐주얼 톤으로 바꾸되 상대를 불쾌하게 하지 않게 한다.",
    "공손하지만 단호하게": "예의를 지키면서도 경계와 요구사항이 분명하게 전달되도록 쓴다.",
    미안함: "사과의 의도와 책임 인식을 분명히 하되 자기비하/과도한 변명은 피한다.",
    제안함: "상대를 존중하며 선택 가능한 제안 형태로 작성한다. 강요처럼 보이지 않게 한다.",
    사랑함: "따뜻하고 애정 어린 표현을 사용하되 과한 표현이나 오해 소지가 있는 문장은 피한다.",
    "보고 요청": "업무 보고를 요청하거나 공유받을 때 쓰는 또렷하고 실무적인 톤으로 다듬는다.",
    제안서: "정리된 비즈니스 문장처럼 구조적이고 설득력 있게 다듬는다.",
    "일정 변경": "일정 변경 사유와 요청사항이 명확하게 보이도록 차분하게 정리한다.",
    "회식 제안": "부담스럽지 않고 참여 의사를 묻는 팀 커뮤니케이션 톤으로 다듬는다.",
    "업무 변경": "업무 범위나 방식의 변경사항이 오해 없이 전달되도록 분명하게 작성한다."
  };
  const toneGuide = toneGuideByTone[safeTone] || toneGuideByTone["정중하게"];
  const harshFilterGuide = harshFilterEnabled
    ? "욕설, 비하, 조롱, 공격적 표현은 제거하되 핵심 요구와 사실관계는 유지한다."
    : "원문의 거친 표현을 무조건 삭제하지 말고 맥락에 맞게만 완화한다.";

  const system = [
    "너는 한국어 메시지를 상황에 맞게 공손하고 전달력 있게 다듬는 비서다.",
    "출력은 최종 변환문만 제공하고, 해설이나 분석을 붙이지 않는다.",
    "원문의 핵심 사실/요청은 유지하되 공격적 표현, 비속어, 비난, 협박성 뉘앙스는 완화한다.",
    "메시지는 현실적인 업무/일상 커뮤니케이션 톤으로 변환한다.",
    "거짓 사실을 추가하지 않는다. 이름/수치/사실이 없으면 임의 생성하지 않는다.",
    "문장은 자연스러운 한국어로 정리하고 맞춤법과 띄어쓰기를 개선한다.",
    "상대와 관계에 맞는 호칭을 사용하되 과장된 아부 표현은 피한다.",
    "배경 설명은 맥락 이해를 위한 참고 자료일 뿐이다. 배경 설명에 적힌 호칭, 사실, 감정, 사건을 결과문에 새로 추가하거나 직접 인용하지 마라."
  ].join(" ");

  const context = [
    `톤: ${safeTone}`,
    `수신자 유형: ${safeRecipient}`,
    `발신자 역할: ${role}`,
    `톤 규칙: ${toneGuide}`,
    `금지 표현 필터: ${harshFilterGuide}`,
    `배경 설명: ${safeBackground || "없음"}`,
    "원문의 의도(요청, 전달사항, 불만, 경고)는 유지하되 관계 훼손 위험을 낮춰라.",
    "필요하면 단호함은 남기되 표현만 예의 있게 바꿔라."
  ].join("\n");

  return { system, context };
}
