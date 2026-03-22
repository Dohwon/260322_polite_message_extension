# Polite Message Rewriter (Chrome Extension + API)

크롬 익스텐션에서 거친 문장을 입력하면, 선택한 톤/대상/발신자 역할에 맞춰 정중한 한국어로 변환해 주는 서비스입니다.

## 포함 범위
- Chrome Extension (Manifest V3)
- Node.js API 서버
- OpenAI Responses API 연동
- Stripe 구독/충전 결제 연동
- 월간 사용량 제한(요청 수 + 토큰 + 글자 수)

## 기술 스택
- Extension: Vanilla JS, Chrome Storage API
- Backend: Node.js + Express + SQLite(better-sqlite3)
- LLM: OpenAI `gpt-5-mini` / `gpt-5-nano`
- Billing: Stripe Checkout + Billing Portal + Webhook

## 빠른 시작

### 1) 백엔드 실행
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

필수 환경변수:
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_TOPUP_10`

### 2) 테스트 사용자 생성 (API 키 발급)
```bash
curl -X POST http://localhost:4310/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

응답의 `apiKey`를 익스텐션에 입력합니다.

### 3) 크롬 익스텐션 로드
1. Chrome 주소창에 `chrome://extensions` 이동
2. `개발자 모드` ON
3. `압축해제된 확장 프로그램을 로드` 클릭
4. `extension` 폴더 선택

## API 요약
- `POST /api/auth/register`: 이메일로 사용자/API 키 생성
- `GET /api/me`: 사용량/한도 조회
- `POST /api/rewrite`: 문장 변환
- `POST /api/billing/create-checkout`: Pro/Business 구독 결제
- `POST /api/billing/create-topup`: 10회 충전
- `POST /api/billing/create-portal`: Stripe 포털 이동
- `POST /api/billing/webhook`: Stripe webhook 수신

## 크롬 웹스토어 등록 준비

### 1) 프로덕션 API 도메인 반영
- `extension/popup`에서 `API Base URL`을 배포 도메인으로 입력해 사용.
- 제출용 ZIP은 아래 릴리즈 스크립트로 API 도메인을 고정해서 생성:
```bash
python3 scripts_prepare_release.py api.yourdomain.com
```
생성물:
- `dist/manifest.release.json`
- `dist/polite-message-extension-api.yourdomain.com.zip`

### 2) 패키징
```bash
cd extension
zip -r ../polite-message-extension.zip .
```

### 3) 웹스토어 업로드
- Chrome Web Store Developer Dashboard에서 ZIP 업로드
- 스토어 설명에 "사용자 입력 문장/결제 정보 처리"를 명시
- 개인정보처리방침 URL 연결

## 정책/가격 근거
- [docs/pricing-policy.md](docs/pricing-policy.md)
- [docs/cws-submission-checklist.md](docs/cws-submission-checklist.md)
- [docs/cws-store-listing-ko.md](docs/cws-store-listing-ko.md)
- [docs/reviewer-test-instructions.md](docs/reviewer-test-instructions.md)
- [docs/privacy-policy-ko.md](docs/privacy-policy-ko.md)

## 운영 권장
- 결제/사용량 모니터링 대시보드 추가
- abuse 방지용 IP + API 키 이중 rate-limit 적용
- 사용자별 프롬프트 템플릿 커스터마이징 기능 추가
