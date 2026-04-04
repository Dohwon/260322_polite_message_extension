# Current Initiatives (Mid-term)

## Polite Message Rewriter v1 완료 (due: 2026-04-05)
- objective: 무료 버전 기준 출시 가능한 Chrome Extension + 관리자 대시보드 + 고객 문의/답장 시스템 완성
- KPI: Google 로그인, rewrite, 고객 문의 저장, 관리자 답장, Railway Volume 영구 저장까지 운영 확인
- owner: implementer-agent
- status: completed (free launch 기준 기능 개발 및 운영 문서화 완료)
- next-milestone: 유료 결제/정식 CWS 제출은 다음 단계에서 재개

## 결제 파이프라인 완성 (due: 2026-04-10)
- objective: 무료→유료 전환 자동화 (Toss webhook → DB plan 업데이트 → 팝업 제한 해제)
- KPI: Free 사용자 결제 성공 1건 + Pro 플랜 기능 정상 활성화 확인
- owner: implementer-agent
- status: pending (v1 완료 후 별도 단계로 이관)
- next-milestone: 결제 수단 재선정 후 sandbox E2E 재시작

## Chrome Web Store 정식 제출 (due: 2026-04-15)
- objective: CWS 심사 통과 및 정식 배포
- KPI: CWS 심사 제출 완료 (cws-submission-checklist.md 30개 항목 전원 pass)
- owner: qa-agent
- status: pending (결제 파이프라인 완성 후 진행)
- next-milestone: OAuth + Toss E2E 완료 확인 후 checklist 점검 시작

## 수익화 지표 수집 체계 구축 (due: 2026-04-30)
- objective: 실사용 데이터로 가격 정책/전환 퍼널 검증
- KPI: 무료 사용자 10명 이상 / 무료→유료 전환율 첫 관측값 확보
- owner: manager
- status: pending (CWS 배포 이후)
- next-milestone: CWS 정식 배포 완료 후 data/monthly_usage_finance.csv 추적 시작

## Cross-team Risks

- risk: Toss Payments 실결제 플로우 미검증 → 유료 출시 후 결제 오류 가능
  - impact: 높음 (첫 결제 실패 → 브랜드 신뢰 하락)
  - mitigation: sandbox 테스트 통과 필수 조건으로 설정

- risk: Stripe SDK 설치되어 있지만 Toss 사용 → 혼선 유발
  - impact: 낮음 (코드 이해도 저하)
  - mitigation: server.js 상단 Stripe 관련 주석 처리 권장
