# Reviewer Test Instructions

## 1) 기본 정보
- Extension name: Polite Message Rewriter
- Target: Chrome Extension (MV3)
- Core feature: Rewrite a user-entered Korean message into a more polite tone based on selected context.

## 2) Test setup
1. Install extension from submitted package.
2. Open extension popup.
3. Input values:
   - API Base URL: `<REVIEW_SERVER_URL>`
   - API Key: `<REVIEW_API_KEY>`
4. Set:
   - Tone: `정중하게`
   - Recipient: `학부모`
   - Sender Role: `선생님`

## 3) Scenario A (main flow)
- Paste this source text in "원본 문자":
  - `안녕하쇼 담임임 님 애가 시험을 망해서 ... 숙제를 하게`
- Click `변환하기`.
- Expected:
  - Rewritten text appears in output area.
  - Output should be polite, coherent Korean, keeping original intent while reducing offensive expressions.

## 4) Scenario B (validation)
- Leave source text empty.
- Click `변환하기`.
- Expected: UI shows validation error message.

## 5) Scenario C (copy)
- After successful rewrite, click `복사`.
- Expected: Rewritten text is copied to clipboard.

## 6) Notes
- The extension does not read browsing history or page content.
- It only sends user-entered text and selected tone/context to backend for rewriting.
