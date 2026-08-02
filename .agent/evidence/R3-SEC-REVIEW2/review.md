# R3-SEC-REVIEW2 — Independent Full-Repo Security Re-Verification

- Reviewer: independent (read-only), model `deepseek-v4-flash` (qwencoder/deepseek-v4-flash)
- Repo: `/home/linhnx/Projects/mini-toeic.score` HEAD `620c111` (worktree dirty — reviewed the **working tree**, i.e. HEAD + R3-P0-* / R3-FE-FIX uncommitted changes, which is the deployable state)
- Date: 2026-08-01
- Scope: re-verify items 1–10 from R2-SEC-REVIEW / R3-SECURITY against current code, fresh eyes, no mutations (only file written: this review)
- Prior evidence cross-checked: `R2-SEC-REVIEW/review.md`, `R3-SECURITY/{env-schema-split,worker-smoke,jti-revocation,trust-proxy-test,cors-asterisk,seed-guard-note}.txt` — all consistent with current code.

---

## Per-item verdicts

### 1. G11 — no Gemini/Vercel in code, no audio base64 logging: **PASS (doc findings only)**

Full-repo scan (excluding `node_modules/`, `.agent/`, `references/`, `scratch/`):

```
rg -ri 'generative|gemini|vercel' . --glob '!node_modules/**' --glob '!.agent/**' --glob '!references/**' --glob '!scratch/**'
```
Hits — **4 files, all documentation**:

| File | Line | Content |
|---|---|---|
| `README.md` | 126–127, ~131 | env example `GEMINI_API_KEY=your_gemini_api_key`, `GEMINI_MODEL_CHAIN=gemini-3.0-pro,...`; "learner to paste a Gemini key into the modal. That key is stored in `localStorage`..." |
| `README-vi.md` | 127–132 | same env example + claim that the client Gemini key is stored in `localStorage` and sent with grading requests |
| `docs/01-technical-specification.md` | 37, 77, 86 | mermaid diagram + tables referencing legacy `api/lib/gemini.ts`, Vercel functions |
| `docs/03-operations-and-risks.md` | 38–46 | env table `GEMINI_API_KEY`/`GEMINI_MODEL_CHAIN`/... mapped to legacy `api/lib/gemini.ts`; line 46 claims `localStorage.GEMINI_API_KEY` modal |

Code surface — **0 hits**:
- `anish-toeic-web-app/`, `anish-toeic-web-services/`, `ecosystem.config.cjs`, `env.example`, `env.production.example`, `package.json`, `seed.sql`, `scripts/`, `nginx/`, `public/`, `.nvmrc`: zero matches (exit 1).
- `rg -i 'GEMINI_API_KEY|apiKey' anish-toeic-web-app/src anish-toeic-web-services/src` → **0** (exit 1).
- `rg -n 'console' anish-toeic-web-services/src | rg -i 'base64|audio'` → **0** (no audio/base64 payload logging; validation rejections in `toeicMedia.validation.ts` are not logged as payloads).
- Legacy deletion confirmed: no `server/`, no `api/`, no `vercel.json` at repo root (R3-P0-LEGACY / R3-P0-PROTO applied).

**Finding R3-2-DOC-01 (Severity: Low — doc):** README.md/README-vi.md line 126–132 and docs/03:38–46 still describe the deleted prototype: env vars the current code never reads, `api/lib/gemini.ts`, Vercel hosting, and a client `localStorage.GEMINI_API_KEY` modal that no longer exists. Misleading for deployers (they will set a dead `GEMINI_API_KEY`) and contradicts the current INJ-003 no-localStorage design. Fix: delete the Gemini env block + modal paragraph from both READMEs; update docs/01 + docs/03 references to the Cloudflare AI Worker adapter (`CLOUDFLARE_AI_WORKER_URL/TOKEN`) or mark the sections as legacy.

### 2. Auth — no token in JSON body, httpOnly+SameSite cookie, jti + Redis revocation: **PASS**

- Cookie: `auth.routes.ts:54–62` — `httpOnly: true, sameSite: 'lax', secure: NODE_ENV==='production'`, `path:'/'`, 7d maxAge. Token never in JSON body: register `:82–84`, login `:132–134` return only `user`.
- jti in payload: `auth.routes.ts:47–50` (`jwt.sign({ sub, email, jti: randomUUID() }, ...)`).
- Redis session store: `auth.middleware.ts:40–43` `SETEX jti:<jti> userId TTL=JWT_EXPIRES_IN`; `:51–69` middleware `EXISTS` check with 5s in-memory cache; **fail-closed on Redis error** (`:59–63` → 401); logout `auth.routes.ts:146–163` `revokeSessionJti` = `DEL` + cache purge.
- FE: `api.ts:7` `withCredentials: true`, no token in state; `LoginPage.tsx:19–26` posts only email/password, no token capture, open-redirect-safe `returnUrl` (`:25` startsWith `/`). `rg localStorage` → only attempt/catalog/annotation caches (`attemptStorage.ts`, `swStore.ts`, `PassagePane.tsx`), **no auth token**.
- Register-before-redis ordering correct (`auth.routes.ts:79` store jti → `:80` set cookie).

### 3. Trust proxy + CORS: **PASS**

- `server.ts:21–23` `app.set('trust proxy', 1)` only when `TRUST_PROXY==='true'` (default false, `env.ts:67`).
- `clientIp()` `server.ts:33–41`: `cf-connecting-ip` honored only under `TRUST_PROXY=true` **and** `net.isIP(cfIp)>0`; else `req.ip`; never logs the raw header. Exported for the trust test (evidence `R3-SECURITY/trust-proxy-test.txt` re-verified: spoofed headers ignored when gate off, 429 on shared bucket).
- CORS: `env.ts:61–64` `CORS_ORIGIN` schema `.refine(v => v !== '*')` → **boot-time rejection of `'*'` with `credentials:true`** (`server.ts:59`). `server.ts:50–61` origin allowlist exact-match + no-origin pass-through. `env.production.example:57` explicit `https://webinprogress.click`.

### 4. Rate limits (clientIp keyed): **PASS**

`server.ts:71–95`: 6 limiters all keyed by `clientIp` — auth 20/15min (`:78`), attempts 30 (`:79`), responses 120 (`:80`), presign 60 (`:81`), submit 30 (`:82`), grading-status 120 (`:83`), mounted on exact route prefixes (`:87–95`). `standardHeaders: true` (Retry-After honored by FE, `LoginPage.tsx:36`).

### 5. Seed double-gate: **PASS**

`migrations/seed.ts:720–728`: in `NODE_ENV==='production'`, refuse unless `ALLOW_PRODUCTION_SEED==='1'` **AND** `process.argv.includes('--force')`. Fail-closed throw otherwise. (Dev: no gate — correct for a fixture seeder.)

### 6. Worker env fail-closed: **PASS**

- `env.ts:82–91` `workerEnvSchema` (DB, REDIS, JWT_SECRET, AI fields only — no PORT/CORS/TRUST_PROXY); `:163–168` `validateWorkerEnv` throws on any failure (fail-closed); `grading.worker.ts:24` calls it at boot.
- JWT_SECRET fail-closed in both schemas: min 32 chars + rejects `REPLACE_WITH` placeholder + rejects `change-me-please-change-me-please-1234` (`env.ts:19–28`).
- `ecosystem.config.cjs`: worker app `:73–90` carries the worker env incl. placeholder `JWT_SECRET` (`:89`) → both apps refuse to boot until replaced. Server app env `:20–55` mirrors `serverEnvSchema`.

### 7. Dependency audit: **PASS (0/0)**

- `anish-toeic-web-app`: `npm audit --omit=dev` → **found 0 vulnerabilities**
- `anish-toeic-web-services`: `npm audit --omit=dev` → **found 0 vulnerabilities**
- Quill removed (not in `dependencies`; `node_modules/quill` absent); `react-router-dom` not installed (all imports from `react-router`).

### 8. XSS — dangerouslySetInnerHTML: **PASS**

20 `dangerouslySetInnerHTML` sites across 9 files — **every one wrapped in `DOMPurify.sanitize(...)`**: `DirectionsPanel.tsx:19`, `OptionList.tsx:53,58`, `PassagePane.tsx:197`, `QuestionStem.tsx:19,25`, `SpeakingView.tsx:254`, `ErrorMapPage.tsx:395,407,417,587,601,615`, `ResultPage.tsx:268,281,294`, `RunnerPage.tsx:147,171,213`, `MockExamRunnerPage.tsx:363–365`. `dompurify` is a declared dependency. `WritingView.tsx` (SW runner) is a plain `<textarea>` — **no dangerouslySetInnerHTML** (`rg -c` = 0), Quill removed (comment `WritingView.tsx:6–8`).

### 9. Ownership — user_id checks: **PASS**

`toeic.controller.ts:11–15` `getUserId()` derives from `req.user.id` (set by `requireAuth`, `auth.middleware.ts:97`). Every authed route passes it and every service query constrains on `user_id`:

| Endpoint | Service check |
|---|---|
| getAttempt | `toeic.service.ts:97` `WHERE id=? AND user_id=?` |
| updateResponse | `:132` id+user_id |
| presign | `:194` id+user_id + `:203` question∈exam |
| submit | `:243` id+user_id `FOR UPDATE` (tx) |
| grading-status | `:297` join on `a.user_id=?` |
| result | `:309` join on `a.user_id=?` |
| review | `:335` id+user_id + status COMPLETED gate |
| history | `:357` `WHERE user_id=?` |

No IDOR surface found.

### 10. React 19 / react-router 8 upgrade: **PASS (release-ops finding)**

- Versions: react 19.2.8, react-dom 19.2.8, react-router 8.3.0, vite ^5.0.0. `@ant-design/v5-patch-for-react-19` imported (`main.tsx:1`). No removed APIs in use: all imports from `react-router` (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `Link`, `useNavigate`, `useParams`, `useSearchParams`) — all valid v8 surface. react-router-dom correctly not used.
- **Finding R3-2-OPS-01 (Severity: Low — release-ops):** `react-router@8.3.0` declares `engines.node >=22.22.0` (verified in `anish-toeic-web-app/node_modules/react-router/package.json`), but `.nvmrc` = `18`. `npm install` will emit EBADENGINE on node 18; since react-router is bundled client code the production runtime is unaffected, but build/CI tooling on node 18 is out-of-contract and any future v8 minor requiring newer Node will hard-fail. Also `vite@^5.0.0` (engines `^18 || >=20`) vs. react-router 8 both satisfied by **node ≥22.22**. Action: bump `.nvmrc`/CI image to node 22.22+ and pin.

---

## G13-adjacent (deps / owner-decision)

- Deps: audited 0/0 (item 7). No production dependency is vulnerable; Quill surface removed; no new runtime dep added by the upgrade beyond react-router 8/react 19 which audit clean.
- Owner-decision items (none blocking): see Remaining findings — all Low/informational; no Critical/High.

## Overall G11 verdict

**PASS** — 0 Gemini/Vercel/apiKey references in any code, config, seed, or deploy artifact; all remaining mentions are stale documentation (finding R3-2-DOC-01). No audio/base64 logging. Combined with items 2–9 (all PASS) and 0/0 audit, the review surface is clean: no exploitable application or dependency vulnerability found.

## Remaining findings (severity order)

| ID | Severity | Finding |
|---|---|---|
| R3-2-DOC-01 | Low (doc) | README.md/README-vi.md:126–132 + docs/01:37,77,86 + docs/03:38–46 describe deleted prototype (`api/lib/gemini.ts`, Vercel, `localStorage.GEMINI_API_KEY` modal, dead env vars). Misleads deployers; contradicts INJ-003 design. |
| R3-2-OPS-01 | Low (release-ops) | `.nvmrc`=18 vs react-router 8 `engines.node>=22.22.0`. Bump to 22.22+. |
| R3-2-INFO-01 | Low (info) | `auth.middleware.ts:92` — a signature-valid token **without** `jti` skips the revocation lookup (legacy/third-party acceptance). Acceptable while `JWT_SECRET` is a strong secret; revisit if old tokens must be revocable. Owner decision: accept or reject no-jti tokens. |
| R3-2-INFO-02 | Low (info) | Bearer-token channel still accepted alongside the httpOnly cookie (`auth.middleware.ts:104–109`). FE uses cookies only; Bearer is a second, non-httpOnly exposure path if any future client uses it. Owner decision: keep (API convenience) or disable. |
| R3-2-INFO-03 | Low (ops) | Seed fixture accounts `seed.owner@example.com` / `seed.other@example.com` with known password `seed-password-123` and fixed salt (`seed.ts:29–30,97–100,600`) — intentional dev fixture, but in production these are known-credential accounts if an operator ever double-gates (`ALLOW_PRODUCTION_SEED=1 --force`). Ensure gate is never used on prod, or document expected scope. |
| R3-2-INFO-04 | Low (ops) | Redis client constructed at module import from `REDIS_URL` (`auth.middleware.ts:14`); unreachable Redis ⇒ all jti checks fail closed to 401 and login/register throw 500 (`storeSessionJti`). Fail-closed by design — availability impact only if Redis is down. Ensure PM2 monitor covers Redis. |
| R3-2-INFO-05 | Low (hygiene) | Junk root file `dummy` (empty ipynb JSON, 130 B). Delete. |

## Summary

10/10 items re-verified. All security controls — jti revocation, trust-proxy gating, CORS `'*'` rejection, rate limiting, seed double-gate, fail-closed env validation, XSS sanitization, ownership checks, dep hygiene — hold in the current tree. G11: **PASS** with a stale-docs finding only. No Critical/High/Medium issues. Remaining: 1 doc finding, 1 release-ops finding, 5 Low/informational owner-decision notes.

**Verdict: MATCH — no blocking security findings; ship after doc/README cleanup and .nvmrc bump.**
