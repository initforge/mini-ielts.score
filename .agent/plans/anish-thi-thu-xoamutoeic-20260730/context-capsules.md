# Antigravity assignment capsules

The coordinator sends only the relevant capsule plus mapped source IDs and ACs.
All workers are forbidden from changing `.git/**`, credentials, remote primary
history or files outside their exclusive write paths.

## S0 — production reference

- Sources: REQ-001, REQ-002, DISC-001.
- Goal: create the literal Chrome Webpage Complete corpus and parity matrix.
- Read: plan sections 2, 4 and 6; `references/README.md`;
  `references/audit/route-flow-matrix.md`.
- Write: `references/xoamutoeic/production-source/**`,
  `references/xoamutoeic/manifests/**`,
  `references/audit/parity-matrix.md`, `.agent/evidence/S0/**`.
- Forbidden: application source, XoaMu credentials/tokens, copying saved
  bundles into application runtime.
- Proof: AC1–AC2 with hashes, offline reopen and independent visual review.

## S1 — monorepo foundation

- Sources: REQ-003, DEC-002, DEC-003, DEC-005, DISC-003.
- Goal: establish clean two-app shells and contract documentation without
  importing the old prototype.
- Read: plan sections 2–3; supplied architecture in plan.
- Write: root workspace/config files, frontend/backend package/config/env
  examples, `docs/thi-thu-integration-contract.md`,
  `docs/toeic-exams.openapi.yaml`.
- Forbidden: product feature behavior, production deployment, source reference.
- Proof: AC3–AC4 and architecture review.

## S2 — schema and core API

- Sources: REQ-003, REQ-004, DEC-001, DEC-004, DISC-002.
- Goal: secure catalog/attempt persistence and API projection.
- Read: plan sections 4–6; S1 OpenAPI contract.
- Write: MySQL migrations (src/migrations) and routes/controllers/services/validations (prefixed `toeic`).
- Forbidden: frontend UI, real exam data, provider secrets.
- Proof: AC5–AC7 and independent security/API review.

## S3 — catalog and auth return

- Sources: REQ-001, REQ-003, REQ-004, DEC-001.
- Goal: Xoa layout parity for catalog and mode selection with Anish tokens.
- Read: S0 parity map and production source; S1/S2 contracts.
- Write: frontend mock-exam catalog/auth/query/type components and thin catalog
  route pages.
- Forbidden: runner/result areas, global shell duplication, Xoa branding.
- Proof: AC8–AC10 with desktop/mobile browser evidence.

## S4-BE — L&R scoring backend

- Sources: REQ-003, REQ-004, DEC-004.
- Goal: implement L&R scorer service logic and backend unit tests.
- Read: S2 core schemas.
- Write: backend L&R scoring services (`toeicLRScoring.service.ts` or similar) and tests.
- Forbidden: frontend UI, media upload.
- Proof: AC13-BE with score assertions and integration tests.

## S4-FE — L&R runner frontend

- Sources: REQ-001, REQ-003, REQ-004, DEC-004.
- Goal: resilient attempt lifecycle and complete L&R runner UI.
- Read: S0 parity map/source; S2 attempt API; S4-BE scoring contract.
- Write: frontend runner core/L&R areas and state stores.
- Forbidden: S&W/grading worker/history areas.
- Proof: AC11, AC12, AC13-FE with browser/API journey.

## S5-BE — Media upload backend

- Sources: REQ-003, REQ-004, DISC-002.
- Goal: implement audio upload presigned URLs and validations.
- Read: S2 schema and API contract.
- Write: backend media routes/controllers/services.
- Forbidden: frontend UI, recording features.
- Proof: AC15-BE presigned integration test.

## S5-FE — S&W runner frontend

- Sources: REQ-001, REQ-003, REQ-004, DEC-004, DISC-002.
- Goal: complete microphone test, Speaking, Writing and audio upload UI.
- Read: S0 parity source; S5-BE media API.
- Write: frontend S&W runner, microphone test, timers, audio recorder, and Writing editor.
- Forbidden: grading backend worker.
- Proof: AC14, AC15-FE, AC16 and independent UI/UX review.

## S6-BE — Grading worker & result backend

- Sources: REQ-003, REQ-004, DEC-004, DISC-002.
- Goal: implement idempotent Redis-backed grading worker and Gemini integration.
- Read: S2 schema, S4-BE, S5-BE output structures.
- Write: backend grading worker, Gemini caller, results services.
- Forbidden: frontend UI pages, mock Gemini in final verification.
- Proof: AC17, AC19-BE security/Distributed review.

## S6-FE — Processing and results frontend

- Sources: REQ-001, REQ-003, REQ-004, DEC-004.
- Goal: implement processing poll state UI, results review sheet, history list.
- Read: S0 visual references, S6-BE results contract.
- Write: frontend processing page, results/review page, history page.
- Forbidden: changing backend database model without re-plan.
- Proof: AC18, AC19-FE visual/UX parity reviews.

## S7 — integration and VPS readiness

- Sources: REQ-001, REQ-003, REQ-004, DEC-001–DEC-005, DISC-002–DISC-003.
- Goal: route mounting, full E2E, deployment configuration and merge handoff.
- Read: all slice receipts, OpenAPI and integration contract.
- Write: app/service entrypoint mounts, integrated E2E tests, `deploy/**`,
  Nginx/PM2 configuration, runbook and merge checklist.
- Forbidden: production deployment and force-push.
- Proof: AC20–AC22 plus independent verifier receipt.
