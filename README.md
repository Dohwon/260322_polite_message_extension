# Polite Message Rewriter

거친 문장을 상황에 맞는 정중한 한국어 문장으로 다듬는 Chrome Extension + API 서비스입니다.

## 현재 제품 정책
- 로그인/회원가입: `Google OAuth`만 지원
- Free: 총 `3회` 체험, `1회 2,000자`
- Pro Monthly: `4,900원/월`, 월 `50회`, `1회 4,000자`
- Pro Annual: `39,000원/년`, 매달 `100회`, `1회 4,000자`
- 결제: `TossPayments`

Google 로그인에 성공하면 백엔드 `users` 테이블에 회원 레코드가 생성되므로, 서버에서 해당 사용자가 회원인지, 어떤 플랜인지, 이번 달에 얼마나 썼는지 모두 식별할 수 있습니다.

## 기술 스택
- Extension: Vanilla JS, Chrome Storage API
- Backend: Node.js + Express + SQLite
- LLM: OpenAI `gpt-5-mini` / `gpt-5-nano`
- Billing: TossPayments

## 빠른 시작

### 1) 백엔드 실행
```bash
cd backend
npm install
npm run dev
```

필수 환경변수:
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`

권장 값:
- `APP_BASE_URL=http://localhost:4310`
- `ALLOWED_ORIGINS=*`

### 2) Chrome 개발자 모드 테스트
1. `chrome://extensions` 이동
2. `개발자 모드` 켜기
3. `압축해제된 확장 프로그램을 로드` 클릭
4. 이 프로젝트의 `extension` 폴더 선택
5. 확장 팝업에서 `Google로 시작` 클릭
6. 브라우저 탭에서 Google 로그인 완료
7. 팝업으로 돌아와 문장 다듬기 테스트

개발자 모드에서는 `extension/popup.js`가 자동으로 `http://localhost:4310`을 사용합니다. 웹스토어 배포본에서는 `https://polite-message-rewriter-production.up.railway.app`를 사용합니다.

### 3) 결제 테스트
- 팝업에서 `Pro Monthly` 또는 `Pro Annual` 클릭
- `https://polite-message-rewriter-production.up.railway.app/billing/plans` 또는 로컬 `/billing/plans` 페이지로 이동
- 해당 페이지가 세션을 확인한 뒤 Toss 결제를 시작

## 주요 API
- `GET /api/auth/google/start?deviceId=...`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/poll?deviceId=...`
- `GET /api/auth/session`
- `POST /api/rewrite`
- `POST /api/billing/create-checkout`
- `GET /billing/plans`
- `GET /billing/toss/checkout`
- `GET /billing/toss/success`

## 참고 문서
- [docs/pricing-policy.md](docs/pricing-policy.md)
- [docs/cws-submission-checklist.md](docs/cws-submission-checklist.md)
- [docs/cws-store-listing-ko.md](docs/cws-store-listing-ko.md)
- [docs/reviewer-test-instructions.md](docs/reviewer-test-instructions.md)
- [docs/privacy-policy-ko.md](docs/privacy-policy-ko.md)
