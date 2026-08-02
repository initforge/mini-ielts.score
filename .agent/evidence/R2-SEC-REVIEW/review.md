# R2-SEC-REVIEW — Independent Security Review

- Reviewer: qwencoder/deepseek-v4-flash (independent; not the implementers)
- Repo: /home/linhnx/Projects/mini-toeic.score — HEAD `620c111686534899fb980dfb481c9927cb2596bd`, worktree dirty (untouched by this review)
- Implementers under review: R2-S2-BE / R2-BE-TZ / R2-FE-LOGOUT / R2-CSP-SEED2
- Method: read-only. Reviewed all cited evidence files + current source (file:line cited below), ran `npm audit --omit=dev` on both workspaces, greps for the mandated patterns. No files modified; no claim trusted without code/evidence corroboration.
- Evidence read: `.agent/evidence/R2-BE/{auth-cookie,rate-limit,env-validation,deps-removed}.txt`, `R2-FE-LOGOUT/verify.txt`, `R2-CSP-SEED2/*.txt`, `R2-BE-TZ/*.txt`, `R2-FAILURE/matrix-summary.txt`.

---

## 1. Auth — cookie session (VERIFY #1)

**Verdict: PASS** (2 informational notes)

| Check | Evidence |
|---|---|
| No token in login/register JSON body | `auth.routes.ts:73-75` (register), `:121-123` (login) return only `{user}`; live curl confirmed no `token` field (`R2-BE/auth-cookie.txt:14,32`), Set-Cookie present |
| HttpOnly cookie, SameSite=Lax, Secure prod-only | `auth.routes.ts:48-56`: `httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production'`; live header `HttpOnly; SameSite=Lax` (`auth-cookie.txt:11`) |
| FE withCredentials, no localStorage token | `api.ts:3-8` `withCredentials: true`, no interceptor. `rg localStorage` in `web-app/src`: only `PassagePane.tsx:31,43` (stroke annotations) and `attemptStorage.ts:93,102` (IndexedDB fallback for exam drafts, header comment says no auth data). No `token`/`setItem('token')` anywhere. LoginPage.tsx:22-26 navigates on `data.user`; no storage write |
| Logout wired + API works | `HistoryPage.tsx:42-49` handleLogout → `api.post('/auth/logout')` → `navigate('/thi-thu')`; button `:228-230` (antd danger + LogOut). Server: `auth.routes.ts:135-138` `res.clearCookie('token', {path:'/'})`. Playwright trace (`R2-FE-LOGOUT/verify.txt:59-65`): logout 200 → redirect → subsequent `GET /toeic-attempts` 401 |
| No client-supplied identity | Controllers read `req.user.id` from verified JWT only (`toeic.controller.ts:11-15`); no x-user-id header (`auth.middleware.ts:7`). Bearer accepted defensively (`auth.middleware.ts:31-40`) |

Notes:
- N3 (LOW): logout clears the cookie but the JWT is stateless — a stolen cookie value remains valid up to 7d (`JWT_EXPIRES_IN` default). Accept or add token-version/revocation (owner decision).
- `clearCookie` doesn't mirror `secure/sameSite` attributes (`auth.routes.ts:136`) — harmless (path+name match is what clears), cosmetic.
- Login timing-safe: dummy scrypt hash for unknown emails (`auth.routes.ts:26,111`) — good.

## 2. Trust proxy + rate limiting (VERIFY #2)

**Verdict: PASS with one MEDIUM gap (N1)**

- Trust proxy gated: `server.ts:21-23` — `app.set('trust proxy', 1)` only when `env.TRUST_PROXY === 'true'` (default false, `.env` has no TRUST_PROXY).
- `clientIp()` `server.ts:30-36`: validates `cf-connecting-ip` via `net.isIP`, else `req.ip`.
- Limiters mounted `server.ts:68-85`: auth 20/15min, attempts-create 30, responses 120, presign 60, submit 30, grading-status 120 — all `keyGenerator: clientIp`. Live headers verified (`R2-BE/rate-limit.txt`). nginx adds coarse global `limit_req 10r/s burst=20` (`nginx.conf:30,78`).

**N1 (MEDIUM) — spoofable `cf-connecting-ip` bypasses all Express limiters.**
`clientIp()` (`server.ts:30-36`) honors a client-supplied `cf-connecting-ip` **regardless of `TRUST_PROXY`**. The flag only gates `req.ip`. If the origin is reachable without Cloudflare (dev; or the VPS IP `165.22.246.35` in `nginx.conf:36` hit directly, firewall permitting), any attacker sends `cf-connecting-ip: <random-ip>` per request → rate-limit key rotates → auth brute-force limiter (20/15min) and all others neutered. Safe only when CF is actually in front (CF overwrites the header). Recommend: trust `cf-connecting-ip` only when `TRUST_PROXY=true`, or restrict origin access to Cloudflare IP ranges.

## 3. CSP + headers (VERIFY #3)

**Verdict: GAP — one MEDIUM finding (N2)**

- CSP policy correct: `nginx.conf:71` + `vite.config.ts:8` — `connect-src 'self' https://*.amazonaws.com https://*.s3.*.amazonaws.com https://*.cloudinary.com`; `img-src`/`media-src` keep `data: blob:`; `object-src 'none'`, `frame-ancestors 'self'`, `base-uri`, `form-action`. Live header verified via vite preview (`R2-CSP-SEED2/csp-verify.txt:20`).
- Server-level headers present: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, HSTS (`nginx.conf:62-66`).

**N2 (MEDIUM) — nginx `add_header` inheritance drops CSP/HSTS/XFO/nosniff on `index.html`.**
`nginx.conf:119-121`: nested `location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }` — any `add_header` at a level disables inheritance from the parent. Every SPA navigation serves the document via `try_files ... /index.html` internal redirect → hits the nested location → the **document response carries no CSP, no HSTS, no X-Frame-Options, no nosniff** (only Cache-Control). Same effect for `/assets/` (`nginx.conf:97-103`, gets only Cache-Control). The R2-CSP agent could not run `nginx -t` and only curl-verified vite preview, so this was missed. The app currently ships no inline scripts (`index.html` clean) and sanitizes XSS, so no direct exploit today — but the CSP control the R2-FE/R2-CSP work was meant to enforce is absent on the main document in production. Fix: repeat security headers in the nested location or move the cache header up.

## 4. Env validation (VERIFY #4)

**Verdict: PASS**

- Zod schema `env.ts:3-28`: DB_HOST/USER/NAME required, DB_PORT numeric, JWT_SECRET min 32 + placeholder rejected, REDIS_URL default, CLOUDFLARE_AI_WORKER_URL/TOKEN optional, AI_GRADING_TEST_MODE + TRUST_PROXY enums, S3 vars optional. Production defaults force DB/JWT to fail-closed (`env.ts:39-56`).
- Prod guard: `env.ts:69-73` throws on `production + AI_GRADING_TEST_MODE=true`; live-verified exit 1 (`R2-BE/env-validation.txt:9-12`).
- Called at startup: `server.ts:12`, `grading.worker.ts:22` (before touching Redis/DB).
- Seed production guard with `--force`: `migrations/seed.ts:717-720`.
- Fail-closed behavior confirmed: prod without AWS creds → `media.adapter.ts:123-131` throws; without CF worker config → `ai-grading.adapter.ts:270-289` throws (job FAILED, never fake scores).

## 5. No direct Gemini path, no audio base64 logging (VERIFY #5)

**Verdict: PASS**

- `rg -i 'generative|gemini' anish-toeic-web-services/src` → no matches. Only hit repo-wide is monorepo root `package.json: @google/generative-ai` (outside services; deps-removed evidence shows lockfile clean of multer/cloudinary/@types/multer).
- `rg 'base64'` in `src/services`, `src/workers` → single comment `media.adapter.ts:5`. No base64 anywhere in the request path; `toeic.validation.ts:54-71` actively rejects base64-like payloads on presign.
- Audio never transits Express: presigned PUT direct to S3; worker forwards only `s3Key` metadata (`ai-grading.adapter.ts:9-11,204-208`).
- Log hygiene: `grading.worker.ts:58,63` truncate to 200 chars; `ai-grading.adapter.ts:170-176` redacts Bearer/token/key; `grading.service.ts:65-74` strips stack traces; FE `ProcessingPage.tsx:47` redacts Bearer in error UI.

## 6. Ownership checks (VERIFY #6)

**Verdict: PASS** — all seven listed endpoints scope by `user_id`:

| Endpoint | File:line |
|---|---|
| getAttempt | `toeic.service.ts:95-99` `WHERE id = ? AND user_id = ?` |
| updateResponse | `toeic.service.ts:130-136` + question-must-belong-to-exam `:139-145` + option-belong check `:149-155` |
| presignMedia | `toeic.service.ts:192-198` (+ IN_PROGRESS gate, question check) |
| submitAttempt | `toeic.service.ts:242-246` `WHERE a.id = ? AND a.user_id = ? FOR UPDATE` |
| getGradingStatus | `toeic.service.ts:295-301` JOIN on `a.user_id` |
| getResult | `toeic.service.ts:304-311` JOIN on `a.user_id` |
| getReview | `toeic.service.ts:333-338` (+ COMPLETED-only gate `:341`) |
| getAttemptHistory | `toeic.service.ts:355-361` `WHERE user_id = ?` |

Corroborated by live probes: 401 unauth, 404 anti-oracle on non-owner GET, 403 on non-owner PATCH (`R2-FAILURE/matrix-summary.txt:6-8`).

## 7. XSS (VERIFY #7)

**Verdict: PASS**

- `rg dangerouslySetInnerHTML` → 21 occurrences in `web-app/src`, **all** wrapped in `DOMPurify.sanitize(...)` at the render boundary, including the only multi-line one `MockExamRunnerPage.tsx:363-365`. DOM probe confirms: `onerror` stripped, `<script>` tag removed, zero dialogs (`R2-FAILURE/09-xss-dom-probe.txt`, matrix row 9).
- Quill `WritingView.tsx:60-65` persists **plain text** (`quill.getText()`) — no HTML ever stored; re-rendered content (`ResultPage.tsx:281`, `ErrorMapPage.tsx:601`) also sanitized.

## 8. Dependency audit (VERIFY #8) — run on HEAD tree

`anish-toeic-web-services && npm audit --omit=dev` → **0 vulnerabilities**.
`anish-toeic-web-app && npm audit --omit=dev` → **3 vulnerabilities (1 low, 2 high)**:

| Severity | Package | Installed | Advisory | Exploitability in THIS app | Verdict |
|---|---|---|---|---|---|
| high | react-router | 7.18.2 (affected 7.12.0–8.2.0) | GHSA-qwww-vcr4-c8h2 — RSC-mode CSRF bypass, action execution before 400 | App is client-only: `App.tsx:18` `BrowserRouter` + `<Routes>`; zero `createBrowserRouter`/`loader`/`action`/`useLoaderData`/`HydrateFallback` (grep verified). No RSC, no data routers. CSRF vector requires server-side loaders/actions | NOT-EXPLOITABLE |
| high | react-router-dom | 7.18.2 | same (transitive) | same | NOT-EXPLOITABLE |
| low | quill | 2.0.3 | GHSA-v3m3-f69x-jf25 — XSS via HTML export (`getSemanticHTML`) | App never calls HTML export; only `getText`/`setText` (`WritingView.tsx:54,60`); user content re-rendered through DOMPurify only | NOT-EXPLOITABLE |

No fix for react-router short of breaking downgrade to 7.11.0 (`npm audit fix --force`) or an upstream 7.x/8.x patch; quill has a non-breaking fix (`npm audit fix`).

## 9. Gate verdicts (VERIFY #9)

- **G10 (auth/ownership/CORS/CSP/proxy-IP/rate-limit/env/secret): GAP**
  Auth, ownership, CORS (`CORS_ORIGIN=http://localhost:5173` in `.env`, not wildcard; `server.ts:39-51`), env, secret handling all PASS. GAP = N1 (cf-connecting-ip trusted without TRUST_PROXY gate → limiter bypass under direct-origin access) + N2 (CSP/security headers not served on index.html).
- **G11 (no direct Gemini + no audio-base64 logging): PASS**
  Zero matches; base64 only in comments; presigned-only media path; sanitized error logging.
- **G12 (no unhandled production vulnerability): GAP**
  No CVE is exploitable in current usage (section 8), but N1/N2 are unhandled production weaknesses requiring owner action; both are configuration/trust-boundary defects, not application-data exposure.

## 10. New issues found (fresh-eyes)

- **N1 — MEDIUM**: spoofable `cf-connecting-ip` rate-limit bypass (`server.ts:30-36`), see §2.
- **N2 — MEDIUM**: nginx header inheritance strips CSP/HSTS/XFO/nosniff from `index.html` (`nginx.conf:119-121`), see §3.
- **N3 — LOW**: no server-side JWT revocation; logout only clears cookie (`auth.routes.ts:135-138`). Stolen cookie valid ≤7d.
- **N4 — LOW/INFO**: `/result`, `/review`, `/toeic-attempts/:id` and `/toeic-attempts` have no per-endpoint limiters (only grading-status does); HistoryPage fetches `/result` per COMPLETED attempt (N+1, `HistoryPage.tsx:60-78`). Abuse surface (per-IP scraping), low impact.
- **N5 — INFO**: email not case-normalized on register/login (`auth.routes.ts:60-66,99-103`) — duplicate-case accounts possible; login is exact-match.
- **N6 — INFO**: nginx `limit_req` zones key on `$binary_remote_addr` — in CF-proxied mode that's the Cloudflare edge IP, so all users behind one PoP share 10r/s (ops/availability, not security).
- **N7 — INFO**: scrypt uses default params (N=16384) — acceptable; consider raising if threat model includes offline hash cracking of leaked DB.

## 11. Open items (owner decision)

1. **N1**: gate `cf-connecting-ip` behind `TRUST_PROXY` vs. firewall-restricting origin to Cloudflare IP ranges (decides N1 exploitability).
2. **N2**: restructure nginx so the document response carries CSP + security headers (repeat headers in `location = /index.html` / `/assets/`).
3. **react-router GHSA-qwww-vcr4-c8h2**: accept NOT-EXPLOITABLE (client-only usage, recommended) vs. pin 7.11.0 vs. wait for patched 7.18.x.
4. **quill low**: apply `npm audit fix` (non-breaking) at next opportunity.
5. **N3**: accept 7d token window or add revocation/token versioning.
6. **N4**: decide whether read endpoints need limiters.

## 12. Overall security verdict

**PARTIAL — G11 PASS, G10 GAP, G12 GAP.** No exploitable application or dependency vulnerability found in the current code; auth, ownership, env validation, XSS sanitization, and media handling are solid and evidence-backed. Two configuration/trust-boundary gaps (spoofable rate-limit identity, CSP absent on the production document) plus the stateless-JWT and minor items must be dispositioned by the owner before the app is production-ready. No critical or high data-exposure issue open.
