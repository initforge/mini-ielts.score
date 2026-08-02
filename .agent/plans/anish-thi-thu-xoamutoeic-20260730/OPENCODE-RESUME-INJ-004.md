# OpenCode master prompt — resume INJ-004 to the maximum feasible completion

You are the coordinator resuming the existing Anish TOEIC work package
`anish-thi-thu-xoamutoeic-20260730`. Work and report in Vietnamese. Continue
automatically through implementation, repair, independent review and fresh
verification until every feasible local gate below has a terminal verdict.

This is a resume, not a bootstrap. Do not scaffold again, replay closed S0–S7,
create another plan/work ID/ledger, or treat a long dirty worktree as failure.

## 1. Mandatory reading and read-only preflight

Before assigning or changing source, read these files completely in order:

1. `.agent/README.md`
2. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/plan.md`
3. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/source-coverage.md`
4. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/customer-merge-contract.md`
5. `.agent/plans/anish-thi-thu-xoamutoeic-20260730/context-capsules.md`
6. `.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json`, especially
   checkpoint `CP-FINAL-R3-20260801`
7. `references/README.md` and `references/audit/parity-matrix.md`
8. Raw R3 release, browser, visual and security reviews named by the latest
   ledger checkpoint; do not rely only on their summaries.

Run informational checks for current directory, HEAD, branch,
`git status --short`, diff name/status, untracked paths, conflict markers and
missing build-imported files. HEAD `620c111686534899fb980dfb481c9927cb2596bd`
is the historical base, but the intended R2/R3 deliverable is dirty.

Classify every dirty path as:

- expected current deliverable/evidence;
- expected legacy deletion; or
- unknown/conflicting overlap.

Expected dirty files are not a blocker and must not be reverted. Pause only the
exact writer whose owned paths overlap an unexplained change or unresolved
conflict; continue every independent task. Never run `git reset`, `git clean`,
`git checkout`, `git restore`, rebase, stash, destructive recovery, branch
creation/switch, commit, push, deploy or production restart. Never overwrite a
user change to make preflight clean.

Starting, stopping or restarting disposable local development services is
explicitly authorized when required for verification: frontend Vite on `:5173`,
Express on `:7000`, the local grading worker, and the project Docker Compose
MySQL/Redis/MinIO services. Inspect existing PIDs/ports first, use only project-
local configuration and synthetic credentials, capture logs, and avoid killing
unrelated processes. This authorization never extends to a VPS, production
PM2/Nginx, Cloudflare edge or any live customer service. A down local port is a
setup action, not an external blocker.

Adding a minimal dependency required to implement a declared local feature is
also authorized. Prefer maintained, narrowly scoped libraries over writing an
unsafe DOCX/ZIP/multipart parser from scratch; verify license, compatible
runtime/version, transitive risk and official API, update the existing package
lock, add focused malicious-input tests and run production plus full dependency
audits. A dependency not already being installed is not a reason to leave Word/
ZIP/media import unimplemented.

Do not create another orchestration tree. Append sources, assignments,
receipts, reviews, findings and checkpoints only to the existing ledger through
the governing harness. Store new raw proof only under
`.agent/evidence/INJ-004/**`; never edit R2/R3 evidence to manufacture a new
PASS.

Ledger bookkeeping is continuous audit, not a phase that ends the run. A0 is
the only ledger writer: append/reconcile the INJ-004 source and assignment,
dispatch its agents immediately, ingest their raw handoffs/receipts, append the
result, then dispatch the next dependency-ready work without asking the owner.
Subagents write raw evidence and handoffs but never edit the ledger concurrently.
Do not stop after a ledger update, checkpoint, wave, review or green focused
test while another feasible gate or repair remains. The final checkpoint is
written only after the last independent verification.

If the latest ledger already contains an INJ-004 `PARTIAL` checkpoint while
mixed-exam composition, Admin result operations, secure DOCX/ZIP/media import,
local Admin browser proof, a Jest teardown leak or another local gate remains,
that checkpoint is non-terminal and superseded by this continuation directive.
Append a reconciliation/amendment to the same ledger, reopen only the affected
R4 slices and continue. Do not create INJ-005 or a second plan/ledger merely to
resume this unfinished INJ-004 scope.

## 2. Authoritative product scope

Complete all feasible work needed for a merge-friendly mock-exam module:

1. Survey the public customer site `https://anishtoeic.vn/` with Playwright and
   real Chrome CDP: shared header, footer, login, registration, auth return and
   the public routes that frame `/thi-thu`. Capture route/state/viewport,
   console and network proof. Adapt the mock-exam pages to the customer shell
   and auth contracts without rebuilding unrelated public modules. Do not
   bypass authentication or claim private Admin states that were not observed.
2. Build only the mock-exam Admin surfaces observed/approved by the owner:
   `Đề thi ONLINE`, `Đề hỗn hợp`, and `Kết quả thi ONLINE`. Match the supplied
   Admin sidebar proportions, hierarchy, active-state pattern and Anish design
   language where evidence exists. Mark unobserved Admin states `UNVERIFIED`,
   not parity PASS.
3. Implement the complete Admin lifecycle step by step: list/filter/search;
   create/import; bulk edit; validate; preview as learner; save draft; handle
   optimistic revision conflict; version; publish immutable snapshot; archive/
   restore where approved; compose mixed exams; inspect results; authorize and
   audit retry/override/regrade operations.
4. Use capability-based server-side RBAC and append-only audit. V1 may use one
   administrator for draft/validate/preview/publish, but the contract must allow
   Author/Reviewer separation later. Production identity/password ownership
   stays with the customer host; do not create a second account system.
5. Support bulk Word authoring for LR Parts 1–7 and SW Speaking/Writing. Support
   embedded images, optional ZIP media, multi-file/folder mapping and existing
   media-library selection. Parsing/import must be bounded, deterministic,
   transactional and safe against macro/OLE, zip-slip, decompression bombs,
   corrupt relationships, duplicate media, MIME/container mismatch and unsafe
   remote hotlinks. Failures must be actionable and must not leave a partial
   exam tree or orphan READY asset.
6. Close all unresolved learner/media gaps with real local storage proof:
   Speaking recording upload reaches grading; submit waits for in-flight media;
   reload/resume/result/review playback uses authorized signed GET; filename,
   container and MIME agree; upload retry/timeout/offline behavior is safe; LR
   and SW wrong-route attempts resolve to the correct runner; `min_words` warns
   and informs grading without blocking timed submission.
7. Prove format/domain separation. Listening media, Speaking recordings,
   Writing prompts/responses and full mock-exam packages must have explicit
   type contracts and server validation. A media or document type accepted for
   one domain must not be silently interpreted as another.
8. Use disposable local MySQL, Redis and MinIO/S3-compatible storage, forward
   migrations and deterministic synthetic fixtures. Run fresh-database and
   upgrade-path migrations and idempotent reseeding. Production S&W grading
   remains the provider-neutral Cloudflare AI Worker HTTP adapter with bounded
   timeout/retry/idempotency and a deterministic test double. Never add direct
   Google Generative AI calls to Express and never use `Math.random`.

Out of scope: dashboard KPIs, XP/GEM, courses/classes, exercises, vocabulary,
theory, payment, email, unrelated user/account administration and copied
licensed production questions/media. Customer React 18/Router v6 and folder/
service conventions are the merge target; use compatible public APIs and thin
ports/adapters instead of coupling this module to the current standalone lock.

Placeholders labelled `UNVERIFIED` are honest interim UI, not completion for a
locally implementable required workflow. Mixed exams, Admin results and secure
bulk import must become functional and independently verified before local G2
can pass. Customer-private SSO proof may remain external, but the local host-
auth adapter seam, return URL and allow/deny behavior must still be implemented
and tested with synthetic fixtures.

## 3. Capacity, model and ownership policy

Use the ten logical roles A0–A9 from `context-capsules.md`. Detect the runtime's
actual active-agent limit instead of inventing one. Aim for 8–10 total active
roles only if the host demonstrably supports it; otherwise set:

```text
worker_cap = max(1, detected_total_active_slots - 1 coordinator)
```

Rotate roles through waves so no review or test is dropped because the host
cap is lower. Do not keep idle agents alive. Use maximum useful parallelism only
for dependency-ready tasks with disjoint write paths. Reduce concurrency during
migrations, shared route/schema integration, service restarts and the final
full suite.

The owner selects the main/coordinator manually as either
`qwencoder/gpt-5.6-sol` or `qwencoder/qwen3.7-max`. Do not attempt to switch the
main model from inside the run.

Subagents are restricted to exactly this pool:

- `qwencoder/deepseek-v4-flash` for routine implementation, repository
  exploration, fixtures, focused tests and ordinary read-only review;
- `qwencoder/qwen3.7-max` for architecture, migrations, auth/security,
  untrusted Word/media parsing, distributed grading, integration review and
  failures that survive one bounded repair.

Do not request any other subagent model, do not translate these IDs to aliases,
and do not synthesize model or effort names. Use standard `medium` reasoning by
default and `high` only for the difficult categories above. Never use
extra-high/max mechanically. Record the actual model/provider/effort honestly;
missing telemetry is not a product blocker and must never be fabricated.

Every assignment must use the packet defined in `context-capsules.md`, name
exact owned and forbidden paths, and have one writer per shared contract.
Workers do not spawn workers. No implementer approves their own work. A0 may
make safe, merge-friendly assumptions and continue; ask the owner only when a
choice would materially change external scope, production state or customer
contract.

Do not equate one product task with one subagent. For every large or high-risk
epic, fan it out to 2–4 agents when slots permit:

1. a read-only investigator/contract analyst;
2. exactly one writer for each disjoint source boundary;
3. a test/fixture author working only in disjoint test/evidence paths; and
4. an independent read-only reviewer/consumer verifier.

For example, “Word import” is one product task but may concurrently use A1 for
contract analysis, A4 for parser implementation, A3 for the import-job/API
boundary and A7 for threat review, provided their write paths do not overlap.
“Admin online exam” may use A2 for UI, A3 for API, A6 for Playwright fixtures
and A7 for security review. “Speaking upload-to-grading” may use A5 as writer,
A6 for slow/failing upload journeys and A7 for storage/auth review. Never assign
two agents to edit the same file concurrently. A small atomic fix may have one
writer, but it still requires a different verifier/reviewer before PASS.

## 4. Execution waves

Finish each dependency-ready wave, release slots and start the next one
automatically. A role may be reactivated for a later wave.

### W0 — repository truth, live survey and contracts

- A1: reconcile customer stack, public shell/auth routes, Admin screenshots,
  current code, API/DTO/version/RBAC/media contracts and merge boundaries.
- A6: capture fresh public-site desktop/mobile route, screenshot, console and
  network inventory via Playwright plus real Chrome CDP; never probe private
  data without authorization.
- A7: produce the import/upload/RBAC/audit threat model.
- A8: reproduce the current local baseline and classify dirty deliverables.
- Exit: contracts, ownership locks, migration strategy, acceptance map and
  survey evidence agree. Unknown visual/auth details remain explicitly
  `UNVERIFIED`.

When resuming from the non-terminal INJ-004 checkpoint dated 2026-08-02, do not
redo already proven Admin lifecycle work unless affected by a new change. Begin
with disjoint assignments for mixed exams, Admin result operations, secure
DOCX/ZIP/media import, local service/browser recovery, Jest teardown diagnosis
and bundle/code-splitting analysis, then feed their results through W4–W6.

### W1 — critical learner/media closure

- A5 owns the bounded learner FE/BE fixes.
- A6 prepares deterministic slow/fail/offline/mic/media browser fixtures.
- A7 reviews the design before integration.
- Exit: Speaking storage-to-grading, upload barrier, playback, MIME/container,
  LR/SW route guard and `min_words` policy pass focused tests against real local
  services.

### W2 — Admin and import foundation

- A3 owns forward migrations, RBAC, version lifecycle, immutable snapshots,
  audit and result-operation API.
- A2 owns only the shared-shell/auth adapters and Admin UI skeleton.
- A4 owns DOCX template, parser, import-job and media mapping contracts plus
  malicious/valid fixtures.
- Exit: consumer contract tests pass and no writer overlaps another's paths.

### W3 — complete feature workflows

- A2 implements online exam, mixed exam, results and bulk-editor UI states.
- A3 implements remaining bounded endpoints and integration behavior.
- A4 completes parsing, media mapping/finalize and atomic rollback.
- Exit: a real administrator can complete every locally testable lifecycle;
  learner preview uses the same canonical exam version and domain guards.

### W4 — fresh independent integration QA

- A6 runs full Playwright/CDP desktop and mobile-or-tablet journeys with raw
  console/runtime/network proof and reference-limited visual comparisons.
- A7 runs independent security/ownership/parser/media/audit review.
- A8 runs fresh release, migration, dependency and clean-snapshot verification.
- Exit: all findings have severity, reproduction, owner and required recheck.

### W5 — bounded repair rotation

- Original writers fix only findings assigned to their owned paths.
- A9 takes a path only after ownership transfer when a failure survives one
  bounded writer repair.
- Original independent reviewer rechecks the diff; A6/A8 rerun affected proof
  after the last fix.
- Repeat W4/W5 as necessary. Do not stop after the first failing run while a
  safe in-scope repair remains.

### W6 — final reconciliation

- A6, A7 and A8 perform final read-only reviews of the actual final diff and
  raw evidence; do not reuse a pre-fix verdict.
- A0 reconciles source coverage, receipts, findings and the existing ledger,
  appends the INJ-004 checkpoint and reports the exact terminal status.

## 5. Required workflow and negative-test matrix

### Public shell and authentication

- Header/footer parity at observed desktop/mobile widths.
- Login and registration success, validation, unauthorized, session expiry,
  logout/revocation and safe return URL to catalog/detail/Admin.
- Open redirect, duplicate identity, cookie/CSRF/CORS and ownership negatives.
- Host auth adapter seam documented; local standalone auth is test support, not
  a second production identity source.

### Admin online exam

- Loading, empty, error, unauthorized/forbidden, search/filter/pagination.
- Create from blank and Word; bulk edit/reorder; per-part rules for LR 1–7 and
  SW; image/audio preview and replacement.
- Draft autosave/resume, stale revision 409/reconcile, validation summary,
  learner preview, publish immutable version, archive/restore.
- Attempt against an old published version remains reproducible after a new
  draft/version exists.

### Mixed exam

- Compose only compatible published sources with deterministic ordering and
  snapshot semantics.
- Reject duplicate/incompatible/stale/unauthorized source items and invalid
  LR/SW combinations.
- Preview, publish, learner attempt, grading and historical review use the same
  resolved snapshot.

### Online results

- Authorized list/filter/detail; processing/completed/failed states; retry and
  idempotency; guarded override/regrade where implemented; append-only audit.
- Ownership isolation, PII minimization, formula/CSV injection if exporting,
  concurrent operation and duplicate-submit negatives.

### Word and media

- Valid LR Parts 1–7 and SW Speaking/Writing DOCX fixtures.
- Embedded images, ZIP mapping, multi-file/folder mapping, library reuse and
  real MinIO hashes through PUT/HEAD/GET.
- Unsupported extension, corrupt DOCX/relationship, macro/OLE, zip-slip,
  decompression bomb, over-size/count, MIME/container mismatch, duplicate
  filename/content, missing/extra asset, timeout/retry/cancel and rollback.
- Verify photo-listening, passage audio, speaking prompt/recording, writing
  image/text and full-exam package types cannot cross domains silently.

### Learner regression

- Catalog → mode → login return → attempt → autosave/resume → submit → grading
  → processing → result → review → history for LR and SW.
- LR Parts 1–7 and all seeded Speaking/Writing prompt types.
- Offline, timeout, media retry, mic ready/denied/unavailable, upload in-flight,
  stale revision, unauthorized, cross-owner and expired session states.
- No token/API key/audio base64/PII leakage in URL, localStorage, console,
  network log or screenshot artifacts.

## 6. Acceptance gates

### G0 — resume and scope

- Existing work ID, plan, ledger and R3 checkpoint found; no duplicate created.
- Dirty paths classified; assigned writers have no unexplained overlap.
- Only public shell/auth integration, three mock-exam Admin surfaces, bulk
  authoring and declared learner fixes are implemented.

### G1 — compatibility and integrity

- Customer-compatible adapters/routes/contracts are documented and consumed.
- Fresh and upgrade-path migrations plus idempotent deterministic seed pass.
- Server capability checks protect every Admin action and signed media path.
- Published versions/history are immutable; stale drafts return revision
  conflict instead of silent overwrite; audit is append-only.

### G2 — Admin and import functionality

- Online exam, mixed exam and result workflows pass step by step with real local
  MySQL/Redis/MinIO.
- Word/media matrix passes valid and malicious fixtures; failed finalize rolls
  back cleanly with no partial exam tree or orphan READY object.
- Public shell/login/register/auth-return adapters match observed customer
  behavior without duplicating unrelated modules.

### G3 — learner integration

- LR and SW complete end to end against the final Admin-published synthetic
  versions.
- Speaking storage reaches deterministic grading; submit cannot outrun upload;
  playback/resume/review is authorized; type/domain guards and `min_words`
  behavior pass.

### G4 — browser, visual, security and release

- Playwright plus real Chrome CDP desktop/mobile-or-tablet journeys have zero
  unexpected page/runtime/console exception, failed request or secret/PII/
  base64 leakage.
- Visual claims are backed by the supplied screenshots or fresh public-site
  capture. Unobserved authenticated/mobile Admin states stay `UNVERIFIED` and
  require human/client evidence; do not invent pixel parity.
- Fresh install/build/typecheck/lint/unit/integration/E2E, migration/seed,
  dependency audit and startup smoke show commands and exit codes after the
  last fix.
- Independent security and release reviews have no unresolved high/critical
  finding.
- Local `:5173`/`:7000` being down must be repaired by starting the dev services
  and rerunning browser proof. Investigate and close the Jest forced-exit/
  teardown leak. Resolve the 1.70 MB application chunk through route/module
  code splitting or record a measured, independently reviewed budget decision;
  a warning alone is not fresh performance proof.

## 7. Evidence, review rotation and terminal behavior

Minimum independent rotation:

| Writer | Consumer verifier | Independent reviewer |
|---|---|---|
| A3 Admin API/RBAC/version | A2 | A7 |
| A4 Word/media | A2 | A7 |
| A5 learner media/grading | A6 | A7 |
| A2 Admin/public adapters | A6 | A7 |
| A0 integration | A6 | A8 |

Reviewers must inspect the actual diff and raw runner output. A writer fixes a
finding, the same independent reviewer rechecks it, and a verifier reruns the
affected evidence after the final fix. Record commands, exit codes, service
versions, attempt/exam/import IDs, object hashes, screenshots, console/network
logs and explicit negative outcomes. Redact secrets and personal data.

Use these terminal meanings honestly:

- `PASS`: every claimed in-repo/local G0–G4 behavior has fresh independent
  runner proof, no open high/critical finding, and no required external/human
  gate is omitted from the claimed scope.
- `PARTIAL`: every feasible local G0–G4 item passed, and only named external
  prerequisites remain, such as authenticated client Admin/SSO evidence, owner
  visual sign-off, live Cloudflare AI, production S3, VPS Nginx/PM2, edge/TLS
  or deployment authority. Missing local implementation, a placeholder page, a
  down dev service, an uninstalled dependency, a teardown leak or unfinished
  browser proof can never justify terminal `PARTIAL`; continue working.
- `BLOCKED`: only a precise missing authority/conflict prevents all remaining
  safe in-scope progress. Expected dirty deliverables, unavailable live-provider
  credentials, a lower agent cap, missing model telemetry or partial full-
  harness enforcement are not blanket blockers. Record any control-plane gap
  honestly and continue product work under the available behavioral harness.

Do not ask for status approval between waves. Continue automatically until
PASS, or until local work is complete and the remaining items are accurately
PARTIAL/UNAVAILABLE. Then append the final existing-ledger checkpoint and give
one Vietnamese report containing:

1. terminal status and exact reason;
2. base/current HEAD and dirty-path classification;
3. logical roles, assignments, requested/resolved models and peak observed
   concurrency;
4. completed waves and changed modules/migrations/contracts;
5. public shell/auth survey and adapter verdict;
6. three Admin workflow verdicts;
7. Word/media valid and malicious-format matrix;
8. LR/SW learner journeys and failure-state matrix;
9. MySQL/Redis/MinIO and deterministic grading evidence;
10. Playwright/CDP console, network and visual evidence;
11. independent security and release verdicts;
12. test/build/typecheck/lint/audit totals and exit codes;
13. open findings and exact external `UNAVAILABLE` items;
14. ledger/checkpoint/evidence paths and merge handoff;
15. confirmation that no branch, commit, push or deploy occurred.
