# Chrome Web Store 제출 체크리스트 (2026-03-22)

## A. 패키지/기능
- [ ] `manifest_version: 3` 확인
- [ ] `manifest.json`의 아이콘 경로가 실제 파일과 일치
- [ ] 기능이 실제로 동작 (원문 입력 -> 변환 결과 출력)
- [ ] 서버 장애 시 사용자에게 오류 메시지 표시
- [ ] HTTPS API 도메인 사용 (운영 환경)

## B. 권한 최소화
- [ ] `permissions` 최소화 (`storage`, `clipboardWrite`만 사용)
- [ ] `host_permissions`를 실제 API 도메인으로 한정
- [ ] 미사용 permission/host 제거

## C. 스토어 리스팅
- [ ] 설명/아이콘/스크린샷 누락 없음
- [ ] 설명이 실제 기능과 정확히 일치
- [ ] 과장/허위/키워드 스팸 문구 없음
- [ ] 최소 1장 이상 실제 동작 스크린샷 첨부 (권장 5장)

## D. 개인정보/데이터 공개
- [ ] Privacy Policy URL 입력
- [ ] Dashboard privacy fields를 실제 동작과 일치하게 선택
- [ ] 수집 데이터/사용 목적/제3자 제공(OpenAI, TossPayments)/보관 기간 기재
- [ ] Limited Use 준수 문구 반영

## E. 심사용 테스트 안내
- [ ] reviewer가 바로 실행 가능한 테스트 계정/절차 제공
- [ ] 테스트용 API 서버 가동 상태 유지
- [ ] 테스트 시나리오 3개 이상 제공

## F. 결제/비즈니스
- [ ] 유료 기능/가격/환불 정책 문구 표시
- [ ] 결제 실패/구독 해지 시 동작 확인
- [ ] 무료/유료 제한값 명확히 고지

## G. 업로드 직전
- [ ] 제출 ZIP은 `extension` 폴더 빌드 결과만 포함
- [ ] .env / 키 / 내부 문서 제외
- [ ] 업로드 후 Developer Dashboard 경고 0개 확인
