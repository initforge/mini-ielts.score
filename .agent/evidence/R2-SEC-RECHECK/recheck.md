# R2-SEC-RECHECK — Security Re-verification (read-only)

- Reviewer: qwencoder/deepseek-v4-flash (independent; not the implementers)
- Repo: /home/linhnx/Projects/mini-toeic.score — HEAD `620c111686534899fb980dfb481c9927cb2596bd`, worktree dirty (fixes live in working tree, uncommitted; nothing modified by this review)
- Prior review: `.agent/evidence/R2-SEC-REVIEW/review.md` (N1 MEDIUM cf-connecting-ip spoof, N2 MEDIUM nginx header inheritance, N3 LOW JWT revocation, N4-N7 INFO)
- Fixes claimed: `.agent/evidence/R2-SEC-FIX/{fixes.txt,test-results.txt,health.txt,env-schema.txt,nginx.txt,ecosystem.txt}`, `.agent/evidence/R2-ECOSYSTEM-FIX/{diff.txt,verify.txt}`
- Method: read-only. Re-verified each claim against current on-disk code (file:line below), re-ran `npm audit --omit=dev` on both workspaces, re-grepped G11 + router-usage patterns. No claim trusted without code corroboration; evidence files treated as claims, not facts.

---

## 1. N1 — cf-connecting-ip spoof gate (server.ts)

**Verdict: CLOSED.** `server.ts:33-41`:

```ts
function clientIp(req: express.Request): string {
  if (env.TRUST_PROXY === 'true') {
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && net.isIP(cfIp) > 0) return cfIp;
  }
  return req.ip || 'unknown';
}
```

- Header read ONLY inside `env.TRUST_PROXY === 'true'` gate; `net.isIP(cfIp) > 0` still required; fallback `req.ip || 'unknown'` (`server.ts:40`).
- When `TRUST_PROXY !== 'true'`, spoofed `cf-connecting-ip` is ignored; limiters key on `req.ip` → single shared bucket. Matches `fixes.txt:9-17`.
- Live proof (`health.txt`): 3 logins with spoofed `cf-connecting-ip` 1.2.3.4/5.6.7.8/9.9.9.9 under TRUST_PROXY=false → `RateLimit-Remaining` 18→17→16 (shared bucket). Consistent with code.
- Residual (operational, not a code gap): prod config has `TRUST_PROXY=true`, which re-opens the gate — closure then depends on Cloudflare actually overwriting the header in front of nginx (`nginx.conf:3` topology). Direct-origin access to `165.22.246.35:443` with CF bypassed would reintroduce spoofability. Flag to owner (item 8 below).

## 2. N2 — nginx header inheritance (nginx.conf)

**Verdict: CLOSED (structural).**

- Nested `location = /index.html { add_header Cache-Control ... }` REMOVED — no such block exists; the only occurrence is a comment (`nginx.conf:73`).
- `add_header Cache-Control "no-cache, no-store, must-revalidate"` moved to server level (`nginx.conf:78`), directly after security headers.
- Security headers at server level, all with `always`: X-Frame-Options (`:62`), nosniff (`:63`), X-XSS-Protection (`:64`), Referrer-Policy (`:65`), HSTS (`:66`), CSP (`:71`).
- `location /` (`nginx.conf:120-125`, `try_files ... /index.html`) has NO own `add_header` → document response inherits full security set + no-cache. ✓
- `/assets/` (`:104-110`) keeps own `add_header "public, immutable"` → suppresses inheritance there by design (hashed immutable assets, not a security-document boundary). Consistent with `fixes.txt:26`, `nginx.txt:15-16`.
- `location /api/` (`:84-101`), `location = /health` (`:113-117`), `location = /api` (`:81`): no own `add_header` → inherit. ✓
- `nginx` binary absent on this machine (`which nginx` → empty) → `nginx -t` + live header curl remain VPS-only checks (item 7).
- INFO: `Cache-Control` (`:78`) lacks `always` → not sent on 4xx/5xx; harmless for the SPA document (200).

## 3. Env schema — CLOUDFLARE_AI_TIMEOUT_MS + zod coverage (config/env.ts)

**Verdict: PASS.**

- `env.ts:23`: `CLOUDFLARE_AI_TIMEOUT_MS: z.string().regex(/^\d+$/, ...).default('60000')`; default also at `env.ts:52`. Matches `ai-grading.adapter.ts` default 60000 (clamp 5000–300000 there).
- Re-verified key-by-key: all 20 keys in `env.production.example` (root, lines 8,9,12,13,14,17,20,24,25,26,27,28,31,35,38,39,40,41,44,48) are covered by the zod schema (`env.ts:4-30`). No uncovered key, no schema key missing from example. Matches `env-schema.txt:12-31`.
- Prod guards unchanged and intact: fail-closed DB/JWT (`env.ts:6,11-16`, defaults `:41-45`), prod AI_GRADING_TEST_MODE ban (`env.ts:72-76`).

## 4. Ecosystem / PM2 consistency

**Verdict: PASS — discrepancy resolved.**

- `ecosystem.config.cjs:31` `TRUST_PROXY: 'true'` == `env.production.example:48` `TRUST_PROXY=true`. The false-vs-true mismatch flagged in `fixes.txt:45` and `ecosystem.txt` is now closed (see `R2-ECOSYSTEM-FIX/diff.txt`).
- `AI_GRADING_TEST_MODE: 'false'` (`ecosystem.config.cjs:29`) consistent with example `:17`.
- `CLOUDFLARE_AI_TIMEOUT_MS: '60000'` present in both apps (`:16`, `:60`).
- N3 documentation comment present in both `ecosystem.config.cjs:23-25` and `env.production.example:32-34`.
- `CORS_ORIGIN: https://webinprogress.click` (`ecosystem.config.cjs:38`) == example `:44`.
- Verification mismatch: `verify.txt` prints `anish-toeic-web-services true / toeic-grading-worker undefined` for TRUST_PROXY — the worker app never declares it and does not need it (no HTTP limiter in the worker). Cosmetic; no action required.

## 5. Tests (test-results.txt + code)

**Verdict: CONFIRMED.**

- `test-results.txt:279-280`: 11 suites, **135/135 PASS**.
- `migrations.test.ts:1,67-70,86`: asserts against `listMigrationFiles('up')` (runner's own discovery; exported `runner.ts:19`) — no hardcoded count. Real-DB test skips loudly when MySQL unavailable (`:46-49`).
- `server.test.ts:13-15`: `jest.mock('../services/db.service', ...)` with mocked `pool.query` → DB-independent; fixture login asserts real scrypt hash + `Set-Cookie: token=` (`:50-65`).

## 6. Dependencies (audit re-run, both workspaces, --omit=dev)

**Verdict: CONFIRMED — no new findings.**

- `anish-toeic-web-services`: **0 vulnerabilities**.
- `anish-toeic-web-app`: **3 vulnerabilities, unchanged** — identical set to prior review:

| Severity | Package | Installed | Advisory | Exploitability here | Verdict |
|---|---|---|---|---|---|
| high | react-router | 7.18.2 | GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF, action-before-400) | App is declarative client-only: `App.tsx:18-19` `BrowserRouter` + `<Routes>`; no `createBrowserRouter`/`RouterProvider`/`loader`/`useLoaderData`/`HydrateFallback`. Only `action=` hit is antd `Alert` prop (`HistoryPage.tsx:202`), not router. No RSC, no data routers → vector unreachable | NOT-EXPLOITABLE |
| high | react-router-dom | 7.18.2 | same (transitive) | same | NOT-EXPLOITABLE |
| low | quill | 2.0.3 | GHSA-v3m3-f69x-jf25 (XSS via `getSemanticHTML` HTML export) | `WritingView.tsx:54,55,60` uses only `getText`/`setText`; no `getSemanticHTML`/`getHTML`; content persisted as plain text | NOT-EXPLOITABLE |

- No fix for react-router without breaking downgrade to 7.11.0 (`audit fix --force`); quill has non-breaking `npm audit fix`. Owner disposition (item 6 below).

## 7. G11 re-grep

**Verdict: PASS (unchanged).**

- `rg -i 'generative|gemini' anish-toeic-web-services/src` → zero matches. No direct-Gemini Express path.
- `rg 'base64' src/services src/workers` → single hit, comment only (`media.adapter.ts:5`: "never accepts or returns base64 audio content"). No audio base64 logging.

---

## Gate verdicts

- **G10 (auth/cookie, ownership, CORS, CSP+headers incl. N2, proxy-IP/rate-limit incl. N1, env validation, secrets/redaction): PASS**
  N1 and N2 closed in code with corroborating live/structural evidence. Auth, ownership scoping, CORS allowlist (`server.ts:44-56`, `CORS_ORIGIN` non-wildcard), env validation, secret handling: unchanged from prior PASS and re-spot-checked.
- **G11 (no active direct-Gemini Express path, no audio-base64 logging): PASS** — re-grepped, §7.
- **G12 (no exploitable unhandled production vuln): PASS** — both remaining advisories NOT-EXPLOITABLE with code-level rationale (§6); no exploitable CVE reachable in current usage. Owner disposition recommended for strictness (accept NOT-EXPLOITABLE for react-router/quill; `npm audit fix` for quill at next opportunity).

## Remaining open items (owner decision — none block data exposure)

1. **N3 (LOW)** — stateless JWT, no revocation: documented 7d TTL + cookie clear (`env.production.example:32-34`, `ecosystem.config.cjs:23-25`). Decision: accept window vs implement token-version/jti deny-list.
2. **react-router GHSA-qwww-vcr4-c8h2** — accept NOT-EXPLOITABLE (client-only; recommended) vs pin 7.11.0 (breaking) vs wait for patched 7.18.x.
3. **quill LOW** — apply non-breaking `npm audit fix` at next opportunity.
4. **N4 (LOW/INFO)** — `/result`, `/review`, `/toeic-attempts/:id`, `/toeic-attempts` still without per-endpoint limiters; decide if needed.
5. **N5 (INFO)** — email case-normalization on register/login.
6. **N6 (INFO)** — nginx `limit_req` keys on CF edge IP behind Cloudflare PoP (ops/availability).
7. **N7 (INFO)** — scrypt default params (N=16384).
8. **nginx -t + live header check on VPS** (N2 runtime confirmation): `nginx -t && curl -sI https://webinprogress.click/ | grep -iE "content-security|strict-transport|x-frame"` — expect CSP/HSTS/XFO/nosniff + `Cache-Control: no-cache`.
9. **TRUST_PROXY=true operational precondition** — closure of the spoof vector now depends on Cloudflare being in front and overwriting `cf-connecting-ip`; ensure the VPS origin (`165.22.246.35:443`) is not directly reachable (firewall / CF-only).

## Overall security verdict

**PASS** — all three gates now PASS. Both MEDIUM findings (N1, N2) verified closed in current code with live/structural evidence; both residual dependency advisories are NOT-EXPLOITABLE with code-level rationale; G11 clean. Nine owner-decision items above remain open, all LOW/INFO/operational or policy choices — none is an exploitable production vulnerability. Recommend quill `npm audit fix` and the VPS `nginx -t`/header check before/at next deploy, and an explicit owner disposition record for items 1-3.
