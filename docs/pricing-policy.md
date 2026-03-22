# Pricing & Limit Policy (2026-03-23)

## 1) 제품 구조
- 무료 기능: 정중한 메시지 재작성 체험
- 유료 기능: 반복 사용 가능한 월간/연간 Pro
- 로그인 방식: `Google OAuth`만 지원

이 구조를 택한 이유:
- 이메일/비밀번호 회원가입보다 운영 복잡도가 낮음
- Google 계정 기준으로 백엔드 회원 여부를 식별 가능
- 익명 API 키 발급 구조보다 무한 계정 생성 난이도가 높음

## 2) 모델 전략
- Free: `gpt-5-nano`
- Pro Monthly / Pro Annual: `gpt-5-mini`

선정 이유:
- Free는 체험 원가를 최대한 낮춰야 함
- 유료 플랜은 톤 안정성과 자연스러운 한국어 문장이 중요함

## 3) 요금제
- Free: 0원, 총 3회, 1회 2,000자
- Pro Monthly: 4,900원/월, 월 50회, 1회 4,000자
- Pro Annual: 39,000원/년, 매달 100회, 1회 4,000자

## 4) 운영 제한
- Free는 총 3회 체험 후 더 이상 호출 불가
- Pro Monthly는 월 50회 초과 시 다음 달까지 대기
- Pro Annual은 매달 100회 초과 시 다음 달까지 대기
- 모든 플랜은 서버에서 사용량을 체크한 뒤 OpenAI 호출
- 확장 프로그램에는 비밀키를 넣지 않음

## 5) 회원 정책
- 회원가입은 Google OAuth 콜백 성공 시 자동 완료
- 백엔드 `users` 테이블에 회원 레코드 생성
- 세션 응답에서 `member.isRegistered`, `member.authProvider`, `member.hasGoogleAuth` 확인 가능
- 아이디/비밀번호 찾기 기능은 제공하지 않음

## 6) 수익성 관점
- 요청당 원가는 낮지만, 진짜 리스크는 abuse와 무제한 사용
- 그래서 `횟수는 제한`하고 `1회 글자 수는 충분히 크게` 잡음
- Monthly는 가벼운 반복 사용자용
- Annual은 반복 사용이 확실한 사용자용

## 7) 현재 결제 방향
- Chrome Web Store 내부 결제 대신 외부 결제 사용
- 결제 랜딩: `/billing/plans`
- 실제 결제 수단: TossPayments
