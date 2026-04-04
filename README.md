# Polite Message Rewriter Chrome Extension

감정적이거나 거친 한국어 문장을, 실제로 보내기 더 안전한 톤으로 다듬어 주는 Chrome Extension입니다.

## Status
- 프로젝트 상태: 완료 (v1 free launch 기준)
- 운영 주소: `https://polite-message-rewriter-production.up.railway.app`
- 저장소: `https://github.com/Dohwon/260322_polite_message_extension`
- 현재 결제 상태: 준비중 오버레이 유지

## 현재 포함된 기능
- Google OAuth 로그인
- 무료 사용량 제한
- 분위기 / 보내는 대상 / 본인 역할 선택
- 배경 설명(선택) 입력
- 관리자 대시보드
- 고객 문의 저장
- 고객 문의 메일 알림
- 관리자 답장 메일 발송
- SQLite + Railway Volume 영구 저장

## 구조
- `extension/`: Chrome Extension UI
- `backend/`: Express API 서버
- `backend/src/db.js`: SQLite 스키마와 조회/저장 로직
- `backend/src/server.js`: 인증, 사용량, 관리자, 문의, 메일, rewrite API
- `backend/src/plans-landing.html`: 랜딩/요금제/고객 문의 페이지
- `backend/src/admin-dashboard.html`: 관리자 대시보드
- `backend/src/admin-feedback.html`: 고객 문의/답장 화면

## 사용자가 자기 API로 직접 쓰는 방법
이 프로젝트는 기본적으로 서버에 OpenAI API 키를 넣어서 동작합니다.

즉, 최종 사용자가 브라우저 확장 프로그램 안에 OpenAI 키를 직접 입력하는 구조는 아직 아닙니다.
현재 지원하는 방식은 아래입니다.

1. 이 저장소를 포크하거나 내려받습니다.
2. 본인 Railway 또는 로컬 서버에 `backend`를 배포합니다.
3. 본인 OpenAI API 키를 `OPENAI_API_KEY`에 넣습니다.
4. 확장 프로그램이 본인 서버를 보도록 `extension/popup.js`의 API 주소를 바꿉니다.
5. Chrome 개발자 모드로 확장 프로그램을 로드합니다.

즉, "사용자 본인의 API"는 현재 기준으로 `서버 환경변수`에 넣는 방식입니다.

## 가장 먼저 바꿔야 하는 파일
확장 프로그램은 현재 이 주소를 기본 서버로 사용합니다.

파일:
- [popup.js](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/extension/popup.js#L1)

현재 기본값:
```js
const LIVE_API_BASE_URL = "https://polite-message-rewriter-production.up.railway.app";
```

본인 서버를 쓰려면 이 값을 바꾸세요.
예시:
```js
const LIVE_API_BASE_URL = "https://your-app.up.railway.app";
```

로컬 서버로 테스트하려면:
```js
const LIVE_API_BASE_URL = "http://localhost:4310";
```

## 로컬 실행
### 1. 백엔드 실행
```bash
cd backend
npm install
npm run dev
```

### 2. Chrome Extension 로드
1. Chrome에서 `chrome://extensions` 이동
2. `개발자 모드` 켜기
3. `압축해제된 확장 프로그램을 로드` 클릭
4. 이 프로젝트의 `extension` 폴더 선택
5. 확장 팝업 열기

## 필수 환경변수
최소 필수:
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `ADMIN_DASHBOARD_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `IP_QUOTA_SALT`

권장:
- `DB_PATH=/data/data.sqlite`
- `ALLOWED_ORIGINS`
- `ADMIN_ALLOWED_IPS`

예시 파일:
- [backend/.env.example](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/backend/.env.example)

## Google OAuth 설정
Google 로그인은 서버에서 처리합니다.

필수 설정값:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

운영 기준 redirect URI 예시:
```txt
https://your-app.up.railway.app/api/auth/google/callback
```

주의:
- `ALLOWED_ORIGINS=*` 대신 실제 운영 도메인과 확장 프로그램 origin을 명시하는 쪽이 안전합니다.
- Google Cloud Console의 승인된 redirect URI와 서버 환경변수 값이 정확히 같아야 합니다.

## DB 영구 보존
이 프로젝트의 핵심 데이터는 DB에 남습니다.

포함 데이터:
- 사용자 계정
- 세션
- rewrite 로그
- 고객 문의
- 관리자 답장 기록
- 허용 IP 목록

운영에서는 Railway Volume을 붙여야 합니다.

권장값:
```txt
DB_PATH=/data/data.sqlite
```

현재 운영은 `/data` 볼륨 기준으로 저장되도록 맞춰져 있습니다.

## 고객 문의 / 관리자 답장 메일 시스템
2026-04-05 기준으로 메일 시스템은 `EmailJS` 기반입니다.

역할 분리:
- 서버: 문의/답장 내용을 DB에 저장
- 브라우저: EmailJS로 실제 메일 발송

이 구조를 쓴 이유:
- Railway에서 Gmail SMTP 타임아웃이 반복 발생했기 때문
- 임시 무료 구간에서 빠르게 붙이기 쉬웠기 때문

필수 값:
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_FEEDBACK_ID`
- `EMAILJS_TEMPLATE_REPLY_ID`
- `EMAILJS_PUBLIC_KEY`

현재 기본 템플릿 기준:
- 고객 문의 알림 템플릿: `template_m0b38lo`
- 관리자 답장 템플릿: `template_64r2siq`

### EmailJS 템플릿 설정 핵심
고객 문의 알림 템플릿:
- To Email: 운영자가 받을 메일 주소 고정
- Subject: `{{subject}}` 또는 `[Polite 문의] {{topic}}`
- 본문: `{{message}}`, `{{reply_to}}`, `{{topic}}` 등 사용 가능

관리자 답장 템플릿:
- To Email: `{{email}}`
- Subject: `{{subject}}`
- 본문: `{{message}}`

중요:
- 관리자 답장 메일이 안 가면 대부분 `To Email`이 `{{email}}`로 안 되어 있는 경우입니다.
- 코드에서는 `email`, `to_email`, `recipient_email`, `to`를 같이 넘기지만, 템플릿은 `{{email}}`이 가장 안전합니다.

## 오늘 추가된 메일 기능
2026-04-05 작업으로 아래가 들어갔습니다.
- 고객 문의 작성 시 DB 저장 + 운영자 메일 알림
- 관리자 화면에서 고객에게 메일 답장
- 답장 이력 DB 저장
- 이미 답장한 문의에도 추가 답장 가능

관련 주요 파일:
- [plans-landing.html](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/backend/src/plans-landing.html)
- [admin-feedback.html](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/backend/src/admin-feedback.html)
- [server.js](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/backend/src/server.js)

## 관리자 기능
- 관리자 로그인
- 허용 IP 관리
- 사용자별 사용 횟수 조회
- rewrite 상세 로그 조회
- 고객 문의 목록/필터/검색/페이징
- 문의 답장 및 답장 이력 확인
- 사용자별 추가 지급

## 현재 정책 요약
- Free: 일 3회, 월 10회, 1회 최대 300자
- Pro: 3,900원, 일 30회, 월 50회, 1회 최대 500자
- Business: 9,900원, 월 300회, 1회 최대 2,000자
- 추가 지급: 10회 단위, 현재는 관리자 지급 중심
- 배경 설명: 100자 이내, 참고만 하고 직접 인용하지 않음

## 운영/배포 체크리스트
1. Railway 프로젝트 생성
2. Railway Volume 연결
3. `DB_PATH=/data/data.sqlite` 설정
4. OpenAI API 키 설정
5. Google OAuth 설정
6. EmailJS Service / Template / Public Key 설정
7. `extension/popup.js`의 서버 주소를 본인 Railway 주소로 수정
8. Chrome 개발자 모드에서 extension 재로드
9. 고객 문의 1건, 관리자 답장 1건 테스트

## 트러블슈팅 문서
- OAuth/확장 프로그램 이슈: [docs/oauth-and-extension-troubleshooting-ko.md](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/docs/oauth-and-extension-troubleshooting-ko.md)
- EmailJS 문의/답장 메일 시스템: [docs/emailjs-mail-system-ko.md](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/docs/emailjs-mail-system-ko.md)
- 가격 정책: [docs/pricing-policy.md](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/docs/pricing-policy.md)
- CWS 체크리스트: [docs/cws-submission-checklist.md](/home/dowon/securedir/git/codex/projects/260322_polite_message_extension/docs/cws-submission-checklist.md)

## 한계
- 결제는 아직 준비중 오버레이 상태입니다.
- 최종 사용자가 확장 프로그램 안에서 OpenAI 키를 직접 입력하는 UI는 아직 없습니다.
- 지금은 self-host 방식이 가장 명확합니다.

## Last Updated
- 2026-04-05
