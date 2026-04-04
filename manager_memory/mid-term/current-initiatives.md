# Current Initiatives (Mid-term)

## Polite Message Rewriter v1 완료 (due: 2026-04-05)
- objective: 무료 버전 기준 출시 가능한 Chrome Extension + 관리자 대시보드 + 고객 문의/답장 시스템 완성
- KPI: Google 로그인, rewrite, 고객 문의 저장, 관리자 답장, Railway Volume 영구 저장, v1 최종 QA까지 완료
- owner: implementer-agent
- status: completed (free launch 기준 기능 개발, QA, 운영 문서화 완료)
- next-milestone: 현재 저장소 기준 추가 실행 과제 없음

## 결제 파이프라인 완성 (due: 2026-04-10)
- objective: 무료→유료 전환 자동화 (Toss webhook → DB plan 업데이트 → 팝업 제한 해제)
- KPI: Free 사용자 결제 성공 1건 + Pro 플랜 기능 정상 활성화 확인
- owner: implementer-agent
- status: parked (현재 범위 밖 장기 backlog)
- next-milestone: 결제 수단 재선정이 필요해질 때 재정의

## Chrome Web Store 정식 제출 (due: 2026-04-15)
- objective: CWS 심사 통과 및 정식 배포
- KPI: CWS 심사 제출 완료 (cws-submission-checklist.md 30개 항목 전원 pass)
- owner: qa-agent
- status: parked (현재 범위 밖 장기 backlog)
- next-milestone: 결제/운영 정책 재개 시 제출 패키지 재정비

## 수익화 지표 수집 체계 구축 (due: 2026-04-30)
- objective: 실사용 데이터로 가격 정책/전환 퍼널 검증
- KPI: 무료 사용자 10명 이상 / 무료→유료 전환율 첫 관측값 확보
- owner: manager
- status: parked (정식 배포 재개 전까지 보류)
- next-milestone: CWS 정식 배포 완료 후 data/monthly_usage_finance.csv 추적 시작

## Cross-team Risks

- risk: 향후 수익화 재개 시 결제 수단 재선정이 늦어지면 유료 출시 일정이 다시 밀릴 수 있음
  - impact: 중간 (현재 v1 free launch 범위에는 영향 없음)
  - mitigation: 결제 재개 시점에 요구사항부터 다시 정의

- risk: Stripe SDK 설치되어 있지만 Toss 사용 → 혼선 유발
  - impact: 낮음 (코드 이해도 저하)
  - mitigation: 수익화 재개 시점에 미사용 결제 코드/문구 일괄 정리
