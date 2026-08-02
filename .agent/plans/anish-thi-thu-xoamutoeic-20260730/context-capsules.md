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
- Goal: implement the idempotent Redis-backed grading worker and the provider-
  neutral Cloudflare AI Worker HTTP adapter from INJ-002, with a deterministic
  test double.
- Read: S2 schema, S4-BE, S5-BE output structures.
- Write: backend grading worker, Gemini caller, results services.
- Forbidden: frontend UI pages, direct Google Generative AI integration in
  Express, `Math.random`, or presenting the deterministic double as live-
  provider proof.
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

## INJ-004 — resume roles and ownership capsules

These are ten logical roles, including the coordinator. They are not a promise
of ten concurrent processes. The coordinator discovers the runtime cap and
uses at most `total_active_slots - 1` workers, releasing and rotating roles
between dependency waves. Medium effort is the default; high is reserved for
architecture, migrations, authentication, untrusted document/media parsing,
distributed grading and failures that survive one bounded repair. Do not use
extra-high/max mechanically.

For INJ-004 continuation, local Vite/Express/worker/Docker service lifecycle is
authorized for testing; production/VPS restart remains forbidden. A4 may add a
minimal maintained DOCX/ZIP/multipart dependency with lockfile, license,
security and malicious-fixture proof. The 2026-08-02 `PARTIAL` checkpoint is
non-terminal because mixed exams, Admin results, secure import and Admin browser
proof remain locally feasible; reopen only those affected R4 slices in the same
ledger and continue.

### A0 — coordinator/integrator

- Goal: reconcile INJ-004 with the existing ledger, lock paths, schedule waves,
  integrate bounded changes and issue the final Vietnamese gate report.
- Read: all current plan-package files, latest ledger checkpoint and R3 raw
  release/browser/security evidence.
- Write: existing ledger through the harness and new
  `.agent/evidence/INJ-004/**` receipts only; integration source only when no
  writer owns it.
- Forbidden: broad feature implementation, self-approval, a new plan/work ID/
  ledger, destructive Git, commit/push/deploy.
- Proof: assignment/ownership map, peak observed concurrency, gate map and
  reconciled final checkpoint.

### A1 — architect/contract researcher

- Goal: survey/reconcile the customer public shell/auth return and freeze host-
  compatible route, DTO, version, RBAC, media and merge contracts before
  feature writers overlap.
- Write: bounded contract documentation and schemas assigned by A0.
- Forbidden: broad UI/API implementation or final approval.
- Proof: consumer trace from every contract to A2/A3/A4/A5 and explicit
  customer-compatibility decisions.

### A2 — Admin frontend implementer

- Goal: implement thin customer public shell/auth-return adapters for the mock-
  exam routes, then the Admin shell adapter plus online exam, mixed exam,
  results and bulk authoring workflows.
- Write: exclusively assigned frontend Admin routes/pages/components/query
  adapters and tests.
- Forbidden: backend migrations/services, learner runner and unobserved parity
  claims.
- Proof: component tests plus desktop/tablet browser flows for loading, empty,
  validation, conflict, forbidden and success states.

### A3 — Admin backend implementer

- Goal: implement capability checks, version lifecycle, immutable published
  snapshots, audit events and authorized result operations.
- Write: exclusively assigned Admin migrations/routes/controllers/services/
  validations and tests.
- Forbidden: frontend/shared shell, production identity duplication.
- Proof: fresh/upgrade MySQL, Redis where applicable, allow/deny matrix,
  revision conflict and idempotency tests.

### A4 — Word import/media implementer

- Goal: safely import bulk LR Parts 1–7 and SW Speaking/Writing documents, map
  embedded/ZIP/folder/library media and finalize atomically.
- Write: exclusively assigned import/parser/media jobs, fixtures and tests.
- Forbidden: learner UI, unrelated storage, macro/OLE execution or unsafe
  remote hotlinks.
- Proof: valid DOCX/media hash matrix plus corrupt, macro/OLE, zip-slip, bomb,
  MIME mismatch, duplicate and rollback cases.

### A5 — learner media/grading implementer

- Goal: close Speaking upload-to-grading, submit race, authorized playback,
  MIME/container, LR/SW route guard and `min_words` warning gaps.
- Write: exclusively assigned learner FE/BE media and grading paths and tests.
- Forbidden: Admin shell/editor and direct Google AI integration.
- Proof: real MinIO PUT/HEAD/GET, slow/failing upload barrier, reload/resume/
  review playback, deterministic grading payload and LR/SW regressions.

### A6 — browser/visual QA

- Goal: independently exercise end-to-end Admin and affected learner journeys
  through Playwright and real Chrome CDP.
- Write: new `.agent/evidence/INJ-004/browser-visual/**` only.
- Forbidden: product source edits and upgrading unobserved states to parity
  PASS.
- Proof: desktop/mobile-or-tablet screenshots, console/runtime/network logs,
  response/status evidence and reference-limited visual verdicts.

### A7 — security reviewer

- Goal: independently review authorization, document/media threats, PII/media
  access, grading isolation and audit integrity.
- Write: new `.agent/evidence/INJ-004/security-review/**` only.
- Forbidden: implementing the code under review or accepting own findings.
- Proof: final-diff review, denied-path tests, severity/owner/fix/recheck for
  every finding and zero open high/critical finding for local PASS.

### A8 — release verifier

- Goal: independently prove install/build/typecheck/lint/tests, migrations,
  seed, startup and merge handoff after the last fix.
- Write: new `.agent/evidence/INJ-004/release/**` only.
- Forbidden: product edits, risk acceptance or production actions.
- Proof: reproducible commands and exit codes, dependency report, clean
  snapshot manifest, service health and exact external unavailability.

### A9 — debugger

- Goal: reproduce failures that survive an initial writer repair, isolate root
  cause and make the smallest assigned correction.
- Write: only paths transferred explicitly by A0.
- Forbidden: scope expansion, opportunistic refactors or self-review.
- Proof: failing reproduction before the fix, focused regression after it and
  handoff to A6/A7/A8 as appropriate.

### Required assignment packet

Every delegation contains:

```text
assignment_id / role_id:
requested_model_and_effort:
resolved_model_provider_and_effort:
objective:
owned_paths:
forbidden_paths:
inputs_and_dependencies:
acceptance_criteria:
negative_tests:
evidence_destination:
handoff_consumer:
```

If two roles need a shared path, A0 serializes ownership and records the
transfer. Implementers never approve their own work; reviewers inspect the
actual diff and raw evidence, not only summaries.

### Multi-agent fan-out for one product task

One product task may and usually should use several roles. For every large or
high-risk epic, A0 fans out 2–4 agents when capacity permits:

- one read-only investigator/contract analyst;
- one writer per disjoint source boundary;
- one test/fixture author restricted to disjoint test/evidence paths; and
- one independent reviewer or consumer verifier.

Examples: Word import can use A1+A4+A3+A7; Admin online exam can use
A2+A3+A6+A7; Speaking storage-to-grading can use A5+A6+A7. This is parallel
work on one outcome, not concurrent editing of one file. A small atomic fix may
have a single writer, but a different role still verifies it before PASS.

A0 alone appends to the existing ledger. Subagents return raw evidence and a
handoff; A0 records it and immediately launches the next dependency-ready work.
A ledger update, checkpoint or completed wave is never a reason to stop while a
feasible gate or repair remains.
