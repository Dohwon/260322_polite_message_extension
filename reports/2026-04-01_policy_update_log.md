# 2026-04-01 Policy / UX Update Log

## Scope

- Free / Pro / Business policy update
- Popup UX update
- Landing page pricing / contact / cancel copy update
- Feedback email destination update
- Payment option research notes

## Applied

- `backend/src/config.js`
  - Free: daily 3, monthly 15, 300 chars
  - Pro: 3900 KRW, daily 30, monthly 50, 500 chars
  - Business: 9900 KRW, monthly 300, 2000 chars
  - feedback notify default changed to `politemsg.support@gmail.com`
  - business-oriented tone options added

- `backend/src/prompt.js`
  - added `backgroundNote` (max 100 chars)
  - added `harshFilterEnabled`
  - added instruction that background note is reference-only and must not be copied directly

- `backend/src/server.js`
  - usage summary normalized to new plan IDs
  - free quota moved to account-based daily limit logic
  - daily limit logic generalized by plan
  - checkout IDs updated to `pro`, `business`, `topup10`
  - top-up success grants 10 bonus requests
  - contact/privacy/terms copy updated to new email and cancellation/refund policy

- `backend/src/plans-landing.html`
  - rewritten to 3-card pricing layout
  - session check via `sessionToken` query param
  - checkout button wiring to `/api/billing/create-checkout`
  - cute cancellation block added
  - feedback board retained

- `extension/popup.html`
  - removed old free-plan intro copy
  - account chip layout added
  - background note toggle field added
  - harsh filter checkbox added
  - copy / rewrite labels updated

- `extension/popup.css`
  - status warning pulse style added
  - account chip / background section styles added

- `extension/popup.js`
  - current plan summary changed
  - low balance warning thresholds added
  - background note persisted
  - top-up / plan change button flow updated

## Still Needs Verification

- `node --check` on `backend/src/server.js`
- `node --check` on `extension/popup.js`
- live pricing page render
- popup manual QA
- payment flow requires PG keys / billing enablement

## External Blockers

- `RESEND_API_KEY` and valid `RESEND_FROM_EMAIL` still need real production values
- recurring billing / cancel-at-period-end semantics are policy-level only unless final PG strategy is chosen

[2026-04-05] free-10/admin-dashboard/gmail-support/coming-soon-ui aligned cards and buttons

[2026-04-05] landing overlay/admin ip dashboard/popup preview overlay/admin usage split/status text updated

[2026-04-05] admin feedback reply mail/db history + summary plan column + single triangle sort + bonus independent usage
