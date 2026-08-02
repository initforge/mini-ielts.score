# Operations & Risk Register

> Updated: 2026-08-01 (R3-DOCS-FIX — legacy third-party grading surface removed)
> Scope: local setup, deployment, AI grading adapter, media, verification, and current risks.

## 1. Local Development

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run API only:

```bash
npm run dev:api
```

Run both:

```bash
npm run dev:full
```

Vite proxies `/api` to `http://localhost:4000` through `vite.config.ts`, so `npm run dev:full` is the most complete local workflow.

## 2. Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `NODE_ENV`, `PORT` | `config/env.ts` (server boot) | Runtime mode; Express port (`7000` in prod, defaults enforced by zod). |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | server + grading worker | MySQL — exams, users, attempts, results, grading jobs. |
| `JWT_SECRET` | server | ≥32 chars, placeholder rejected at boot (fail closed). |
| `JWT_EXPIRES_IN` | server | Session TTL; also the `jti` TTL in Redis. |
| `REDIS_URL` | grading worker | Grading queue, job locks, and `jti` session store. |
| `CLOUDFLARE_AI_WORKER_URL` | grading worker (`adapters/ai-grading.adapter.ts`) | Cloudflare AI Worker endpoint (optional; absent ⇒ `AI_PROVIDER_NOT_CONFIGURED`). |
| `CLOUDFLARE_AI_WORKER_TOKEN` | grading worker | Bearer token for the worker endpoint. |
| `CLOUDFLARE_AI_TIMEOUT_MS` | grading worker | Request timeout to the AI worker; default `60000`. |
| `AI_GRADING_TEST_MODE` | grading worker | `true` ⇒ deterministic test double, no network AI. Dev/test ONLY; `NODE_ENV=production` fails fast. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | server (`media.adapter.ts`) | S3-compatible presigned media uploads (MinIO dev / AWS prod). Absent ⇒ presign 503. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | server | AWS S3 fallback when `S3_*` are empty. |
| `CORS_ORIGIN` | server | Explicit origin list; `*` rejected because credentials are always sent. |
| `TRUST_PROXY` | server | `true` only behind nginx/Cloudflare so rate-limit identity resolves to the real client IP. |

Auth is cookie-based: the session token lives in an HttpOnly cookie (JWT with `jti`), `jti` is stored in Redis, and logout revokes it. No API key or token is stored in `localStorage` or sent in JSON bodies.

## 3. AI Grading (Cloudflare AI Worker)

Grading is asynchronous and never calls an AI model directly from Express. The grading worker (`dist/workers/grading.worker.js`) polls `grading_jobs` (`QUEUED`/`RETRY`) and POSTs submissions to a Cloudflare AI Worker over HTTP via the provider-neutral adapter:

- **Production**: `CLOUDFLARE_AI_WORKER_URL` + `CLOUDFLARE_AI_WORKER_TOKEN` (endpoint contract `POST /api/grade`), bounded by `CLOUDFLARE_AI_TIMEOUT_MS`.
- **Dev/test**: `AI_GRADING_TEST_MODE=true` substitutes a deterministic test double — fixed rubric scores, no network, no randomness. Forbidden in production (zod guard fails fast).
- **Missing config**: absent URL/token + test mode off ⇒ `AiProviderNotConfiguredError` ⇒ job fails with `AI_PROVIDER_NOT_CONFIGURED`.

Because grading is queued, long-running AI calls do not block API request handlers; Nginx API timeouts are set to 300s for submission and grading-related traffic.

## 4. VPS Deployment

The VPS path lives in:

- `anish-toeic-web-services` (`dist/server.js`, `dist/workers/grading.worker.js`)
- `ecosystem.config.cjs` (PM2: API + grading worker)
- `nginx/nginx.conf`, `nginx/audio-config.conf`
- `anish-toeic-web-app/dist` (Vite build served as SPA)

The Express server serves:

```text
GET    /api/health
POST   /api/auth/login | register | logout
GET    /api/toeic-exams | /api/toeic-exams/:slug
POST   /api/toeic-exams/:id/attempts
GET    /api/toeic-attempts | /api/toeic-attempts/:id
PATCH  /api/toeic-attempts/:id/responses/:questionId
POST   /api/toeic-attempts/:id/media/presign
POST   /api/toeic-attempts/:id/submit
GET    /api/toeic-attempts/:id/grading-status | /result
GET    /* -> SPA fallback (dist/index.html)
```

Nginx is configured for:

- HTTPS termination (Cloudflare edge + origin certs);
- `/api/` proxy to `127.0.0.1:7000`;
- `/assets/` static alias to `anish-toeic-web-app/dist/assets`;
- server-level security headers (CSP, HSTS, XFO, nosniff) and `server_tokens off`;
- long API read/send timeouts of 300 seconds (submission and grading traffic).

## 5. Media Serving

Learner media (speaking audio, prompt images) is not proxied through Nginx. It lives in S3-compatible storage and is uploaded directly via presigned URLs (`POST /api/toeic-attempts/:id/media/presign`). Local dev uses MinIO (`127.0.0.1:19000`, from `scripts/integration/docker-compose.yml`); production uses MinIO-on-VPS or AWS S3 (`S3_ENDPOINT`/`S3_*` or AWS vars).

The old static `/audio/speaking/` Nginx fragment (`nginx/audio-config.conf`) and `scripts/setup-audio-vps.sh` are **legacy**: the current app has no `VITE_AUDIO_BASE_URL` or `src/lib/speakingAudio.ts` references. Kept for reference only — not part of the media path.

Verification:

```bash
curl -I https://your-domain.com/api/health
```

Expected:

- health returns JSON from Express;
- presign returns `200` with a PUT URL when S3/MinIO is configured (503 otherwise);
- microphone works only on `https://` or `localhost`.

## 6. Verification Status

Refreshed at R3 (source basis: R3-RELEASE2 clean-snapshot, R3-SECURITY, R3-SW evidence):

| Check | Result |
|---|---|
| Source audit | Passed: FE runner/state, BE auth, attempt/media routes, grading worker + adapter, nginx, PM2 config were read. |
| `npm ci` (root, workspaces) | Passed from a clean snapshot. |
| `npm run build` (FE + BE) | Passed; Vite warns main bundle ≈ 1.8 MB (non-blocking). |
| `npm run typecheck`, `npm run lint` | Passed (both workspaces). |
| BE test suite | Passed against real MySQL (`DB_NAME=anish_toeic_test`). |
| `npm audit --omit=dev` | 0/0 findings (both workspaces). |

## 7. Risk Register

| Risk | Severity | Evidence | Recommended fix |
|---|---|---|---|
| External AI/S3 not live-proven | Medium | Cloudflare AI Worker and AWS S3 never exercised against live accounts; dev uses `AI_GRADING_TEST_MODE` + MinIO | First prod deploy must smoke-test the real adapter and presign path. |
| Media provisioning | Medium | Prompt images and instruction audio must exist in MinIO/S3 | Provision bucket objects at deploy; verify presigned GET/PUT E2E. |
| Source encoding corruption | Medium | Vietnamese text in TS/MD/scripts contains mojibake | Separate UI text cleanup pass; verify screenshots after changing strings. |
| FE bundle size | Low/Medium | Main bundle ≈ 1.8 MB (Vite chunk warning) | Code-splitting pass post-merge. |
| Product naming drift | Low | Repo name says IELTS, source says TOEIC | README now clarifies; rename repo only if public branding matters. |
| `TRUST_PROXY` misconfiguration | Medium | If false in prod, rate-limit identity collapses to 127.0.0.1 | Keep `TRUST_PROXY=true` behind nginx/Cloudflare; never enable when origin is directly reachable. |

Resolved in prior passes: localStorage API key (replaced by HttpOnly cookie + `jti` revocation), lockfile drift (`npm ci` passes), static audio split (legacy), no submission persistence (MySQL attempts/results).

## 8. Cleanup Decisions

Removed or superseded:

- `docs/screenshot.png`: stale single screenshot replaced by current Playwright captures.
- `docs/HTTPS_AUDIO_FIX.md`: merged into this operations doc.
- `assets/c__Users_Lenovo_...png`: editor workspace artifacts, not app assets.

Kept:

- `audio-temp/*.mp3`: operational input for VPS audio setup scripts.
- `nginx/*` and `scripts/*`: still useful because the repo contains a real VPS deployment path.
