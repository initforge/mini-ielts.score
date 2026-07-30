# Anish TOEIC `/thi-thu` — full XoaMu parity on the target monorepo

## 1. Intent and boundaries

- **Observable outcome:** a merge-ready monorepo containing an Anish-branded
  `/thi-thu` feature with the full XoaMu L&R and S&W experience: catalog,
  exam/practice modes, attempt runners, async grading, result, error map,
  detailed review and history.
- **Risk classification:** resumable/high. The work crosses frontend, backend,
  auth, MySQL migrations, Redis coordination, media lifecycle, Gemini,
  responsive UI parity and VPS deployment configuration.
- **In scope:**
  - Literal production-reference capture with Chrome
    `Ctrl+S -> Webpage, Complete`.
  - New `anish-toeic-web-app` and `anish-toeic-web-services` applications.
  - Full L&R and S&W feature behavior and all observed route branches.
  - Public catalog with login required before attempt creation.
  - Empty production database plus synthetic dev/test fixtures.
  - VPS/Nginx/PM2 configuration compatible with Cloudflare DNS/CDN/TLS.
  - Merge contract, OpenAPI contract, migrations, tests and browser evidence.
- **Non-goals:**
  - Importing real XoaMu exam content, users, results, API keys or Supabase data.
  - Reusing the old root prototype as architecture or runtime dependency.
  - Copying XoaMu minified bundles into the production application.
  - Reproducing observed XoaMu defects: anonymous grading failure, missing
    storage objects, answer leakage or accessibility errors.
  - Production deployment. A separate owner authorization is required.
- **Scope lock:** edit, test, commit and push only inside
  `initforge/mini-toeic.score`. Work on a feature branch created from the
  harness baseline on `origin/master`; do not rewrite or force-push history.
- **Owner decisions:**
  - Everything inside the `/thi-thu` product surface follows XoaMu except
    Anish color/brand tokens and the shared Anish application shell.
  - Implement both L&R and S&W completely, but do not seed production data.
  - Anyone may browse/search the catalog; login is required before creating an
    attempt.
  - Runtime is the supplied VPS architecture: Vite `5173`, Express `7000`,
    `/api` proxy, MySQL, Redis, S3/Cloudinary and Gemini.
  - Cloudflare is an edge layer in front of VPS, not a Workers backend.
- **Meaningful open questions:** none. Missing service credentials are runtime
  prerequisites and must not block implementation with mocks/adapters.

## 2. Repository truth and reference contract

- Remote primary branch is `master`.
- The pre-handoff repository is a Vite 5/Tailwind 3 S&W prototype. It does not
  match the requested Anish monorepo and must not determine the new design.
- Existing `references/` contains screenshots, accessibility snapshots, a few
  DOM captures and an audit. It is useful but **not source-complete**.
- The target architecture is:

```text
Browser / React + Vite :5173
    -> /api/*
    -> Express + TypeScript :7000
    -> MySQL / Redis / S3 / Cloudinary / Google Generative AI
```

- Frontend technology contract: React 18, TypeScript, Vite with SWC, Router v6,
  TanStack Query, Zustand, React Hook Form with Zod, Tailwind 4, Ant Design,
  Lucide, Framer Motion, Recharts, Quill, Axios and DOMPurify.
- Backend technology contract: Node 18+, Express 4, TypeScript, mysql2,
  ioredis, JWT/cookie auth adapter, Multer, S3/Cloudinary, Google Generative AI,
  Helmet, CORS allowlist, rate limiting, Zod and Jest.

### Production-reference rule

S0 is a hard gate for UI slices. For each route and interactive state, use
Chrome `Ctrl+S`, choose `Webpage, Complete`, preserve the generated HTML plus
`_files` directory, write a manifest with URL/viewport/state/hash, and reopen
the saved page offline. Screenshots or DOM `outerHTML` alone do not satisfy the
acceptance criterion.

Authenticated result/history captures must use an owner-provided signed-in
browser session without writing cookies, local storage, auth headers or tokens
to the repository.

## 3. Change map

| Area | Exact implementation | Compatibility boundary |
|---|---|---|
| Root | npm workspaces and common `dev/build/typecheck/lint/test` scripts | No Nx/Turbo; two applications remain independently mergeable |
| Frontend shell | `anish-toeic-web-app`, Vite SWC, port 5173, `/api` proxy to 7000 | Shared Anish navbar/footer are adapters, not duplicated Xoa components |
| Frontend feature | `src/modules/mock-exam` with thin route pages under `src/pages/user` | Server state in Query; transient runner state in Zustand |
| Backend shell | `anish-toeic-web-services`, Express 4 TS, port 7000 | Route/controller/service/validation structure matches supplied Anish layout |
| Persistence | MySQL migrations for catalog, questions, attempts, responses, media, jobs and results | Production seed is empty; fixtures are test/dev only |
| Async grading | Redis-backed idempotent worker for S&W; deterministic L&R scorer | Gemini key remains server-side and output is Zod validated |
| Media | S3 presigned upload for recordings; local adapter for tests | Never send base64 audio or provider keys in JSON bodies |
| Deployment | Nginx static frontend + `/api` proxy, PM2 API/worker, Cloudflare edge notes | No Workers conversion and no production deployment |

## 4. Product behavior contract

### Frontend routes

- `/thi-thu`: public catalog with L&R/S&W tabs, chips, search, card grid,
  utility rail and previous-attempt state.
- `/thi-thu/:examSlug`: metadata, instructions and exam/practice mode dialog.
- `/thi-thu/:examSlug/lam-bai`: unified attempt runner.
- `/thi-thu/dang-xu-ly/:attemptId`: S&W grading progress and retry state.
- `/thi-thu/ket-qua/:attemptId`: certificate and score table.
- `/thi-thu/ket-qua/:attemptId/chi-tiet`: error map and per-question review.
- `/thi-thu/lich-su`: attempt history, filters, resume and result links.

Unauthenticated attempt creation redirects to
`/dang-nhap?returnUrl=<encoded destination>`. After successful login the user
returns to the selected exam/mode without losing intent.

### L&R

- Intro/directions, section timer, controlled audio, question palette,
  answered/review indicators and Parts 1–7.
- Reading split layout, bilingual toggle, notes and annotation tools.
- Debounced autosave, flush on navigation, IndexedDB offline queue and resume.
- Exam/practice behavior is controlled by server capabilities; exam payload
  never includes protected review data.
- Submit is idempotent, warns about unanswered questions, and auto-submits on
  expiry.
- Result contains Listening, Reading, total score, per-part metrics, error map
  and detailed review.

### S&W

- Microphone test is required before Speaking.
- Handle permission denied, no device, empty recording, unsupported codec and
  device disconnect.
- Speaking uses directions/preparation/recording timers and auto-advance.
- Recordings upload to S3 with short-lived presigned URLs and metadata.
- Writing uses restricted Quill controls, word count, DOMPurify and autosave.
- Submit creates a durable grading job; processing polls with backoff and
  exposes queued/processing/completed/partial/failed states.

### Result and history

- L&R is scored deterministically using exam answer key and scoring profile.
- S&W rubric and sample content remain server-only until review is authorized.
- Review is available only after submission and ownership check.
- History includes in-progress, submitted, grading, completed and failed
  attempts.

## 5. Public contracts

### Core response types

- `ExamSummary`: card metadata, skill type, collection, duration, question
  count, supported modes and last attempt.
- `ExamSession`: attempt, sections and safe question payload; no answer key,
  explanation, sample response or hidden rubric.
- `AttemptResponseInput`: answer payload, marked flag, note, annotations,
  media object key and client revision.
- `GradingStatus`: state, progress, retryability and sanitized error.
- `AttemptResult`: total/per-part score, metrics and provisional/final state.
- `ReviewQuestion`: protected review content returned only after authorization.

### HTTP API

| Method and path | Access | Contract |
|---|---|---|
| `GET /api/toeic-exams` | Public | Search/filter/paginate catalog |
| `GET /api/toeic-exams/:slug` | Public | Exam metadata and instructions |
| `POST /api/toeic-exams/:id/attempts` | Login | Create exam/practice attempt |
| `GET /api/toeic-attempts/:id` | Owner | Resume attempt and safe session |
| `PATCH /api/toeic-attempts/:id/responses/:questionId` | Owner | Autosave response with revision |
| `POST /api/toeic-attempts/:id/media/presign` | Owner | Presign bounded S3 upload |
| `POST /api/toeic-attempts/:id/submit` | Owner | Idempotent submit and grading enqueue |
| `GET /api/toeic-attempts/:id/grading-status` | Owner | Poll grading progress |
| `GET /api/toeic-attempts/:id/result` | Owner | Score summary/certificate |
| `GET /api/toeic-attempts/:id/review` | Owner | Protected post-submit review |
| `GET /api/toeic-attempts` | Login | History and resumable attempts |

### MySQL migrations

- `toeic_exam_collections`
- `toeic_exams`
- `toeic_exam_sections`
- `toeic_questions`
- `toeic_question_options`
- `toeic_question_review_content`
- `toeic_attempts`
- `toeic_attempt_responses`
- `toeic_attempt_media`
- `toeic_grading_jobs`
- `toeic_attempt_results`
- `toeic_question_scores`

Protected answer/review fields are stored separately so a catalog/session query
cannot accidentally expose them.

## 6. Acceptance and proof contract

| AC | Claim | Required fresh proof | Negative invariant |
|---|---|---|---|
| AC1 | Literal production-source reference is complete for the route/state matrix | Artifact hashes, manifest, Chrome save evidence and offline reopen | Screenshot/outerHTML alone cannot pass |
| AC2 | Reference-to-component parity map covers desktop/mobile and every branch | Static matrix plus independent UI reviewer | No uncatalogued reference state |
| AC3 | Fresh clone installs and both apps build/typecheck/lint | Runner output from clean install | Old prototype is not imported |
| AC4 | Dev topology is exactly 5173 -> `/api` -> 7000 | Live API and proxy smoke | No direct browser provider key |
| AC5 | Migrations and rollback-safe schema pass | MySQL integration test and schema inspection | Production seed contains no real exam data |
| AC6 | Public/session/review API contracts enforce data separation | API/security tests | Exam payload contains no protected review fields |
| AC7 | Auth, ownership, revision and idempotency rules hold | Integration tests for 401/403/409/replay | No cross-user access or duplicate submit |
| AC8 | Catalog and mode dialog match Xoa layout with Anish tokens | Desktop/mobile visual diff and interaction recording | Xoa branding/global shell is not copied |
| AC9 | Public browse and login-return flow preserve selected intent | Browser E2E | Anonymous attempt is never created |
| AC10 | Catalog states are complete | Browser loading/empty/error/search/filter evidence | Empty DB does not crash |
| AC11 | Attempt lifecycle autosaves, resumes and expires safely | Integration plus browser reload/offline tests | No lost acknowledged answer |
| AC12 | L&R Parts 1–7 and practice/exam controls work | Full browser journey and score assertions | No answer leakage during exam |
| AC13 | L&R result/error map/review are correct and authorized | API/browser/visual evidence | Result cannot be read by another user |
| AC14 | Microphone test and Speaking timers/recording work | Real/fake-device browser matrix | Permission failure does not strand attempt |
| AC15 | Audio upload lifecycle is bounded and recoverable | S3 adapter integration and browser retry | No base64 audio in grading JSON/logs |
| AC16 | Writing editor sanitizes, counts and restores content | Unit/browser XSS and reload tests | Unsafe HTML is not persisted/rendered |
| AC17 | S&W job is durable, idempotent and retryable | Redis/MySQL/Gemini-mock integration | Duplicate worker execution cannot duplicate result |
| AC18 | Processing/result/error map/review/history match reference flow | Desktop/mobile browser journey and visual evidence | Failed grading is not shown as completed |
| AC19 | Secrets, logs, rate limits and ownership pass security review | Independent security review and negative API tests | No key/audio/transcript/token leakage |
| AC20 | VPS build, Nginx and PM2 configuration are coherent | Local config validation and production build smoke | No Workers-only assumption |
| AC21 | Full synthetic fixture journey passes L&R and S&W | E2E from catalog through history | Production fixture flag defaults off |
| AC22 | Merge and operations documentation is sufficient for AI integration | Independent verifier follows docs on clean checkout | No undocumented manual source edit |

A build is not proof of UI parity, auth, migration safety or runtime behavior.
All UI claims require browser, console and network evidence at desktop and mobile
viewports.

## 7. Task graph

| Slice | Work | Depends on | Exclusive writer area | Review |
|---|---|---|---|---|
| S0 | Ctrl+S source capture, manifests and parity map | none | `references/xoamutoeic/production-source`, manifests and S0 evidence | UI parity reviewer |
| S1 | Monorepo shells, toolchain, env validation and contracts | none | root/app/service config files | architecture reviewer |
| S2 | MySQL schema, catalog/attempt API, auth and data isolation | S1 | backend core exam/attempt files and migrations | security/API reviewer |
| S3 | Catalog, search/filter, mode dialog and login return flow | S0,S1,S2 | frontend catalog/auth/query areas | UI reviewer |
| S4 | Attempt core and complete L&R runner/scoring/review | S0,S2 | frontend core/L&R and backend L&R scorer | UI/business reviewer |
| S5 | Complete S&W runner, editor, recorder and media upload | S0,S2 | frontend S&W and backend media adapter | UI/security reviewer |
| S6 | Grading worker, processing, result, error map and history | S2,S4,S5 | grading/result/history files | distributed/security reviewer |
| S7 | Route integration, E2E, VPS configuration and merge docs | S3,S4,S5,S6 | app mounts, deploy, integrated tests and runbooks | independent verifier |

S0 and S1 may run in parallel. No frontend parity slice may start until S0 has
passed. S4 and S5 may run in parallel after S0/S2.

## 8. Automatic execution contract

- Work shape: resumable.
- Ledger: required, stored at
  `.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json`.
- Coordinator: Antigravity main session.
- Native roles: `agent-rules-implementer`, `agent-rules-reviewer`,
  `agent-rules-verifier`; use `agent-rules-researcher` only for bounded
  read-only discovery.
- Model route: `inherit`, standard/medium-or-higher. Do not use a denied Gemini
  3.6 Flash route. Missing host telemetry is recorded as unobserved and must
  not be fabricated.
- Maximum active agents including main: 4.
- Maximum delegation depth: 1.
- Each worker must acknowledge its assignment before the coordinator calls
  `workctl start`.
- Risk-triggered independent review is mandatory for S0 and S2–S7.
- Antigravity continues dependency-ready work automatically; it does not ask
  the owner to relay phases.
- Authorized actions: edit, test, commit and push a feature branch.
- Unauthorized actions: production deploy, force-push, rewriting `master`,
  importing real XoaMu data or storing credentials.
- Stop only for a genuine credential/permission prerequisite, unsafe scope
  divergence, failed mandatory proof after recovery, or an unresolved high
  reviewer finding.

## 9. Risks and recovery

| Risk | Early signal | Prevention | Recovery |
|---|---|---|---|
| Incomplete reference | Only PNG/DOM exists for a state | S0 hard gate with offline reopen | Recapture literal Webpage Complete before UI work |
| UI drift | Geometry differs despite matching colors | Component-state parity matrix and visual diff | Fix smallest responsible component, rerun desktop/mobile |
| Answer leakage | Review fields appear in session payload | Separate schema/service projection | Block release, remove field, add negative contract test |
| Attempt data loss | Reload loses acknowledged answer/audio | Revisioned autosave plus IndexedDB queue | Reconcile server revision and retry queued media |
| Duplicate grading | Multiple results/jobs for one submit | Idempotency key, DB uniqueness and Redis lock | Reclaim job, keep one canonical result |
| Provider outage | Gemini/S3/Redis timeout | Adapters, retry policy and durable job state | Mark retryable/partial without losing attempt |
| Merge conflict | Feature touches broad shared shell | Thin route adapters and prefixed backend files | Rebase feature branch; preserve module boundary |
| Secret leakage | Key/base64/transcript appears in logs | Redaction and negative security tests | Rotate exposed secret, purge log, block PASS |

## 10. Resume and completion

- Read `source-coverage.md` before allocating work.
- Use `context-capsules.md` as the minimum assignment packet; do not dump the
  whole transcript into workers.
- Record runner-backed receipts with workctl for every AC.
- A reviewer cannot review its own implementation assignment.
- Commit after a slice passes its proof and review gate; push the feature
  branch at stable checkpoints.
- Final status is:
  - `PASS` only when all required slices and ACs pass with fresh evidence and
    no open review finding.
  - `PARTIAL` when useful verified work remains but an external prerequisite
    prevents full completion.
  - `BLOCKED` only for a decisive owner/credential/permission dependency.
