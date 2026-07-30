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
- Write: MySQL migrations and prefixed backend routes/controllers/services/
  validations for exam and attempt core.
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

## S4 — attempt core and L&R

- Sources: REQ-001, REQ-003, REQ-004, DEC-004.
- Goal: resilient attempt lifecycle and complete L&R journey.
- Read: S0 parity map/source; S2 attempt API.
- Write: frontend runner core/L&R areas and backend L&R scoring service.
- Forbidden: S&W/grading worker/history areas.
- Proof: AC11–AC13 with full browser/API journey.

## S5 — S&W and media

- Sources: REQ-001, REQ-003, REQ-004, DEC-004, DISC-002.
- Goal: complete microphone, Speaking, Writing and media upload behavior.
- Read: S0 parity source; S2 API and media contract.
- Write: frontend S&W runner plus backend media controller/service/validation.
- Forbidden: result worker/history, raw key/base64/transcript logging.
- Proof: AC14–AC16 and independent UI/security review.

## S6 — grading, result and history

- Sources: REQ-001, REQ-003, REQ-004, DEC-004, DISC-002.
- Goal: durable grading plus complete processing/result/review/history flow.
- Read: S2 schema/API, S4/S5 outputs and S0 result references.
- Write: backend grading/result worker/services and frontend
  processing/result/history areas.
- Forbidden: changing core attempt semantics without re-plan, real Gemini calls
  in CI.
- Proof: AC17–AC19 and independent distributed/security review.

## S7 — integration and VPS readiness

- Sources: REQ-001, REQ-003, REQ-004, DEC-001–DEC-005, DISC-002–DISC-003.
- Goal: route mounting, full E2E, deployment configuration and merge handoff.
- Read: all slice receipts, OpenAPI and integration contract.
- Write: app/service entrypoint mounts, integrated E2E tests, `deploy/**`,
  Nginx/PM2 configuration, runbook and merge checklist.
- Forbidden: production deployment and force-push.
- Proof: AC20–AC22 plus independent verifier receipt.
