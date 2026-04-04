# Active Tasks (Short-term)

## Project Status

- [x] (2026-04-05) Polite Message Rewriter v1 완료
  - result: Google OAuth, 무료 사용량, 관리자 대시보드, 고객 문의 저장, 관리자 답장, Railway Volume 영구 저장, EmailJS 메일 연동까지 완료
  - note: 결제와 CWS 정식 제출은 다음 단계 backlog로 유지

## In Progress
- 현재 진행중인 단기 작업 없음

## Pending

- [ ] (2026-03-29) Toss Payments 환경변수 Railway 등록
  - next-action: TOSS_CLIENT_KEY / TOSS_SECRET_KEY 등록 → Toss sandbox 결제 시뮬레이터로 Pro Monthly 결제 시나리오 테스트
  - due: 2026-04-07
  - depends: Google OAuth 테스트 통과 후

- [ ] (2026-03-29) 무료→유료 플랜 전환 자동화 연결
  - next-action: Toss 결제 성공 webhook → DB plan 업데이트 → 팝업 제한 해제 전 플로우 E2E 테스트
  - due: 2026-04-10
  - depends: Toss 환경변수 등록

- [ ] (2026-03-29) CWS 제출 전 최종 QA 체크리스트 실행
  - next-action: docs/cws-submission-checklist.md 30개 항목 순서대로 점검
  - due: 2026-04-15
  - depends: OAuth + 결제 E2E 완료

## Blocked

- [ ] Pro/Business/Top-up 버튼 활성화 (overlay 제거)
  - blocked-by: Toss 결제 자동화 완성 전까지 "준비중" 유지

## Done (Recent)

- [x] (2026-04-05) EmailJS 기반 고객 문의 메일 알림 + 관리자 답장 메일 발송 연결
- [x] (2026-04-05) 관리자 문의함 탭/필터/페이징/추가 답장 UX 정리
- [x] (2026-04-05) Railway Volume 기반 DB 영구 저장 전환
- [x] (2026-04-05) Google OAuth 환경변수 등록 및 실사용 로그인 검증
- [x] (2026-03-23) Google OAuth only 방식 전환 (email/password 제거)
- [x] (2026-03-23) 랜딩 페이지 메뉴/법적 링크 실제 라우트 연결
- [x] (2026-03-23) Tone 팔레트 6→9개 확장
- [x] (2026-03-23) 팝업 드래프트 영속성 (팝업 닫아도 원문/변환문 유지)
- [x] (2026-03-23) Railway 프로덕션 배포 완료
- [x] (2026-03-23) 무료 사용량 일일 리셋 방식으로 변경 (5회/일)
