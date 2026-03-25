# Chrome Extension OAuth/배포 트러블슈팅 기록 (2026-03-26)

이 문서는 다음 프로젝트에서도 그대로 재사용하기 위한 운영 기록이다.

## 1) Google OAuth 로그인 안 됐던 원인/해결

### 증상
- 로그인 버튼 클릭 시: `Google OAuth 환경변수가 설정되지 않았습니다.`
- `/api/auth/google/config` 응답에서 `enabled=false` 또는 `missing` 배열에 값 존재

### 실제 원인
1. `backend/.env` 파일이 없거나 값이 비어 있었음
2. Railway Variables에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` 누락
3. CORS를 `ALLOWED_ORIGINS=*`로 두고 `credentials: true`를 같이 쓰면 브라우저 정책 충돌 가능

### 해결
1. 로컬 `backend/.env` 생성
2. Railway Variables에 동일 키 등록
3. `ALLOWED_ORIGINS`를 실제 도메인 목록으로 명시
- 예시:
  - `https://polite-message-rewriter-production.up.railway.app,chrome-extension://<EXTENSION_ID>,http://localhost:4310`

### 즉시 점검 API
- `GET /api/auth/google/config`
  - 기대값: `enabled: true`, `missing: []`

## 2) server.js / popup.js 수정 포인트 (재발 방지용)

### server.js 원칙
- `res.cookie` 기반 세션 공유에 기대지 말고, 확장에서 명시 헤더로 전달
- 확장 인증은 `x-session-token` 헤더로 통일
- OAuth 완료 후 확장 폴링으로 세션 전달:
  - `GET /api/auth/google/start?deviceId=...`
  - `GET /api/auth/google/poll?deviceId=...`

### popup.js 원칙
- OAuth 시작 URL: `/api/auth/google/start`
- OAuth 완료 폴링: `/api/auth/google/poll`
- 세션 저장 키: `sessionToken` (chrome.storage.local)
- 인증 헤더 이름은 반드시 `x-session-token`
- 세션 조회 API: `GET /api/auth/session`
- 실제 기능 API: `POST /api/rewrite`

### 이번에 확인한 대표 실수
- 헤더 오타: `x-sessing-token` (X) -> `x-session-token` (O)
- 로그인 완료 전 `sessionToken` 미저장
- 팝업이 예전 캐시 HTML/JS를 바라봐서 버튼/ID 불일치

## 3) Google Cloud OAuth 설정 체크리스트

1. OAuth Client 생성 (Web Application)
2. Authorized redirect URI 등록
- 로컬: `http://localhost:4310/api/auth/google/callback`
- 운영: `https://<railway-domain>/api/auth/google/callback`
3. 동의 화면(Consent Screen) 퍼블리싱 상태 확인
4. 테스트 사용자 제한이 있는 경우 본인 계정이 포함됐는지 확인

## 4) Chrome Extension 설정 체크리스트

1. `manifest_version: 3` 유지
2. `host_permissions`에 실제 API 도메인 포함
3. `chrome://extensions`에서 확장 새로고침 후 재테스트
4. 팝업 열고 다음 순서 확인
- Google 로그인
- `/api/auth/session` 성공
- `/api/rewrite` 성공

## 5) Railway 배포 체크리스트

### 자주 난 문제
- 루트 디렉토리 기준으로 `railway up` 하면 빌드 감지 실패 가능

### 권장 배포 방식
- 백엔드 디렉토리를 루트로 지정:
```bash
railway up backend --path-as-root --ci --service <SERVICE_NAME>
```

### 배포 후 검증
1. `GET /api/health` -> `ok:true`
2. `GET /api/auth/google/config` -> `enabled:true`, `missing:[]`
3. `POST /api/rewrite` (비로그인) -> `Google 로그인이 필요합니다.` 응답이면 인증 미들웨어 정상

## 6) 무료 제한 정책 관련 기록

- Free는 누적 5회가 아니라 **일일 5회(계정/IP 각각)** 로 운영
- 자정(KST) 기준으로 자동 초기화되도록 일자 키 기반 집계 사용
- UI 문구도 `일일 제한`으로 고정 표시
