# EmailJS 고객 문의 / 관리자 답장 메일 시스템

업데이트: 2026-04-05

## 목적
Railway 환경에서 Gmail SMTP가 반복적으로 타임아웃되어, 고객 문의 알림과 관리자 답장 메일을 브라우저 기반 EmailJS 전송으로 전환했다.

## 현재 구조
- 서버: 고객 문의 저장, 관리자 답장 기록 저장
- 브라우저: EmailJS로 실제 메일 발송
- 저장소: SQLite (`/data/data.sqlite` 권장)

## 고객 문의 흐름
1. 사용자가 랜딩 페이지의 고객 문의 폼 제출
2. 서버가 문의를 DB에 저장
3. 프론트가 EmailJS로 운영자 메일 전송
4. 메일 실패 여부와 무관하게 문의 내용은 관리자 대시보드에 남음

## 관리자 답장 흐름
1. 관리자가 고객 문의 게시판에서 문의 선택
2. 브라우저가 EmailJS로 고객 메일 주소에 답장 발송
3. 성공 시 서버가 답장 이력을 DB에 저장
4. 이후 같은 문의에 추가 답장 가능

## 필수 환경변수
- `MAIL_PROVIDER=emailjs`
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_FEEDBACK_ID`
- `EMAILJS_TEMPLATE_REPLY_ID`
- `EMAILJS_PUBLIC_KEY`

## 운영 템플릿 ID
- 고객 문의 알림: `template_m0b38lo`
- 관리자 답장: `template_64r2siq`

## 템플릿 설정 핵심
### 고객 문의 알림 템플릿
- To Email: 운영자 메일 주소 고정
- Subject: `{{subject}}` 또는 `[Polite 문의] {{topic}}`
- 본문: `{{message}}`, `{{reply_to}}`, `{{topic}}`

### 관리자 답장 템플릿
- To Email: `{{email}}`
- Subject: `{{subject}}`
- 본문: `{{message}}`

## 자주 나는 오류
### 1. 관리자 답장 메일이 안 옴
가장 흔한 원인:
- `EMAILJS_TEMPLATE_REPLY_ID` 오타
- reply 템플릿 `To Email`이 `{{email}}`로 안 되어 있음

### 2. 고객 문의 메일에 회신 이메일/문의 주제가 비어 있음
원인:
- feedback 템플릿에서 `{{reply_to}}`, `{{topic}}`, `{{subject}}` 중 실제 사용 변수명이 코드와 안 맞음

현재 코드는 아래 별칭들을 함께 보낸다.
- 문의: `topic`, `feedback_topic`, `inquiry_topic`, `subject`, `reply_to`, `reply_email`, `email`, `message`, `full_message`
- 답장: `email`, `to_email`, `recipient_email`, `to`, `subject`, `message`

## 관련 파일
- `backend/src/plans-landing.html`
- `backend/src/admin-feedback.html`
- `backend/src/server.js`
- `backend/src/config.js`
