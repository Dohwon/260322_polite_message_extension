import { OUTPUT_LANGUAGES, RECIPIENTS, TONES } from "./config.js";

export function sanitizeTone(tone) {
  return TONES.includes(tone) ? tone : "정중하게";
}

export function sanitizeRecipient(recipient) {
  return RECIPIENTS.includes(recipient) ? recipient : "기타";
}

export function sanitizeOutputLanguage(outputLanguage) {
  return OUTPUT_LANGUAGES.includes(outputLanguage) ? outputLanguage : "ko";
}

function translateTone(tone, outputLanguage) {
  if (outputLanguage !== "en") return tone;

  const map = {
    보통: "neutral",
    친근하게: "friendly",
    정중하게: "polite",
    "아주 정중하게": "very polite",
    캐주얼하게: "casual",
    "공손하지만 단호하게": "firm but polite",
    미안함: "apologetic",
    제안함: "suggestive",
    사랑함: "affectionate",
    "보고 요청": "requesting an update",
    제안서: "proposal-like",
    "일정 변경": "schedule change",
    "회식 제안": "team outing invitation",
    "업무 변경": "work change notice"
  };

  return map[tone] || "polite";
}

function translateRecipient(recipient, outputLanguage) {
  if (outputLanguage !== "en") return recipient;

  const map = {
    상사: "manager or supervisor",
    동료: "coworker",
    친구: "friend",
    학부모: "parent",
    고객: "customer",
    거래처: "business partner",
    연인: "partner",
    가족: "family member",
    기타: "other"
  };

  return map[recipient] || "other";
}

function buildLanguageGuide(outputLanguage) {
  if (outputLanguage === "en") {
    return [
      "Language rule: the final output must be written only in natural English.",
      "Do not include Korean or any other language.",
      "If the source text is in Korean, rewrite and translate it into polished English while preserving the original intent."
    ].join(" ");
  }

  return [
    "언어 규칙: 최종 결과문은 반드시 자연스러운 한국어로만 작성한다.",
    "영어 또는 다른 언어를 섞지 마라.",
    "원문이 영어여도 의도를 유지한 자연스러운 한국어로 다듬어 번역한다."
  ].join(" ");
}

export function buildRewritePrompt({ outputLanguage, tone, recipient, senderRole, backgroundNote, harshFilterEnabled }) {
  const safeTone = sanitizeTone(tone);
  const safeRecipient = sanitizeRecipient(recipient);
  const safeOutputLanguage = sanitizeOutputLanguage(outputLanguage);
  const role = String(senderRole || "발신자").trim().slice(0, 40);
  const safeBackground = String(backgroundNote || "").trim().slice(0, 100);
  const languageGuide = buildLanguageGuide(safeOutputLanguage);
  const localizedTone = translateTone(safeTone, safeOutputLanguage);
  const localizedRecipient = translateRecipient(safeRecipient, safeOutputLanguage);

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
  const toneGuideByToneEn = {
    보통: "Keep the original meaning and emotional balance intact. Only improve clarity, grammar, spelling, and politeness where needed. Do not over-soften it.",
    친근하게: "Make it warm and friendly without sounding rude, childish, or careless.",
    정중하게: "Rewrite it in polite English suitable for work or respectful everyday communication.",
    "아주 정중하게": "Use formal and highly respectful English without sounding exaggerated or submissive.",
    캐주얼하게: "Make it natural and casual while keeping it considerate and not offensive.",
    "공손하지만 단호하게": "Keep the message polite but clearly firm about boundaries, requests, or expectations.",
    미안함: "Make the apology clear and sincere without self-deprecation or excessive excuses.",
    제안함: "Frame it as a respectful suggestion, not as pressure or a command.",
    사랑함: "Make it warm and affectionate without becoming awkward or overly dramatic.",
    "보고 요청": "Rewrite it as a clear and practical request for an update or report.",
    제안서: "Rewrite it with a structured, persuasive, businesslike tone.",
    "일정 변경": "Make the scheduling change calm, clear, and easy to understand.",
    "회식 제안": "Make it a light, low-pressure invitation for a team meal or outing.",
    "업무 변경": "State the work change clearly so there is little room for misunderstanding."
  };
  const toneGuide =
    safeOutputLanguage === "en"
      ? toneGuideByToneEn[safeTone] || toneGuideByToneEn["정중하게"]
      : toneGuideByTone[safeTone] || toneGuideByTone["정중하게"];
  const harshFilterGuide =
    safeOutputLanguage === "en"
      ? harshFilterEnabled
        ? "Remove profanity, ridicule, insults, and overtly aggressive phrasing, but preserve the core request and factual meaning."
        : "Do not automatically erase strong wording. Only soften it where needed for the context."
      : harshFilterEnabled
        ? "욕설, 비하, 조롱, 공격적 표현은 제거하되 핵심 요구와 사실관계는 유지한다."
        : "원문의 거친 표현을 무조건 삭제하지 말고 맥락에 맞게만 완화한다.";

  const system =
    safeOutputLanguage === "en"
      ? [
          "You rewrite user-written messages so they are tactful, polished, and realistic to send.",
          "Return only the final rewritten message. Do not add analysis, labels, or commentary.",
          "Preserve the user's core facts, requests, complaints, or warnings, but reduce profanity, hostility, insults, or threatening tones.",
          "Keep the message realistic for work and everyday communication.",
          "Do not invent names, numbers, or facts that were not in the source.",
          "Improve grammar, punctuation, readability, and tone.",
          "Use forms of address appropriate to the relationship, but avoid exaggerated flattery.",
          "Background notes are only for context. Do not directly quote them or add new facts, events, emotions, or honorifics from them unless already supported by the source text.",
          languageGuide
        ].join(" ")
      : [
          "너는 사용자가 쓴 메시지를 상황에 맞게 공손하고 전달력 있게 다듬는 비서다.",
          "출력은 최종 변환문만 제공하고, 해설이나 분석을 붙이지 않는다.",
          "원문의 핵심 사실/요청은 유지하되 공격적 표현, 비속어, 비난, 협박성 뉘앙스는 완화한다.",
          "메시지는 현실적인 업무/일상 커뮤니케이션 톤으로 변환한다.",
          "거짓 사실을 추가하지 않는다. 이름/수치/사실이 없으면 임의 생성하지 않는다.",
          "문장은 자연스럽고 실제로 전송 가능한 표현으로 정리하고 맞춤법/문장부호/띄어쓰기 오류를 개선한다.",
          "상대와 관계에 맞는 호칭을 사용하되 과장된 아부 표현은 피한다.",
          "배경 설명은 맥락 이해를 위한 참고 자료일 뿐이다. 배경 설명에 적힌 호칭, 사실, 감정, 사건을 결과문에 새로 추가하거나 직접 인용하지 마라.",
          languageGuide
        ].join(" ");

  const context =
    safeOutputLanguage === "en"
      ? [
          `Target language: English`,
          `Tone: ${localizedTone}`,
          `Recipient type: ${localizedRecipient}`,
          `Sender role: ${role || "sender"}`,
          `Language rule: ${languageGuide}`,
          `Tone rule: ${toneGuide}`,
          `Expression filter: ${harshFilterGuide}`,
          `Background note: ${safeBackground || "none"}`,
          "Preserve the original intent while reducing the risk of relationship damage.",
          "Keep necessary firmness if needed, but make the wording respectful."
        ].join("\n")
      : [
          `톤: ${safeTone}`,
          `수신자 유형: ${safeRecipient}`,
          `발신자 역할: ${role}`,
          `언어 규칙: ${languageGuide}`,
          `톤 규칙: ${toneGuide}`,
          `금지 표현 필터: ${harshFilterGuide}`,
          `배경 설명: ${safeBackground || "없음"}`,
          "원문의 의도(요청, 전달사항, 불만, 경고)는 유지하되 관계 훼손 위험을 낮춰라.",
          "필요하면 단호함은 남기되 표현만 예의 있게 바꿔라."
        ].join("\n");

  return { system, context };
}
