# Nginx / PM2 Infrastructure Validation — S7 verified

> Version: 3.0.0 — refreshed at S7 (Integration / VPS readiness) with the VERIFIED final
> configs. Evidence: `.agent/evidence/S7/infra-20260731/{nginx,pm2,env,cloudflare-edge,build}.txt`.
> Target suites: `ecosystem.config.cjs`, `nginx/nginx.conf`, `nginx/audio-config.conf`.

## 1. Architecture Map (verified at S7)

```
Browser (HTTPS)
  │
  ▼
Cloudflare edge (DNS proxy / CDN / TLS)      ← DEC-002: Cloudflare is DNS/CDN/TLS, NOT Workers
  │ origin HTTPS 443 (full-strict)
  ▼
Nginx :443 (nginx/nginx.conf)
  ├─ /api/      → upstream node_backend → 127.0.0.1:7000   (Express, PM2 fork)
  ├─ /assets/*  → alias …/anish-toeic-web-app/dist/assets/ (immutable, 1y)
  ├─ /health    → rewrite → /api/health → node_backend
  └─ /*         → SPA root …/dist; index.html no-cache (nested location)

PM2 (ecosystem.config.cjs) — 2 apps
  ├─ anish-toeic-web-services → node anish-toeic-web-services/dist/server.js  :7000
  └─ toeic-grading-worker     → node anish-toeic-web-services/dist/workers/grading.worker.js

Dev proxies (development only)
  └─ anish-toeic-web-app/vite.config.ts → /api → 127.0.0.1:7000
```

## 2. Verified Nginx Config (nginx/nginx.conf — S7 edits)

S7 fixed the following gaps (in place, NOT deployed):

| Gap (pre-S7) | S7 fix |
|---|---|
| Security headers only on `location /` (missing on /api /assets /health) | Headers moved to server level: `X-Frame-Options SAMEORIGIN`, `X-Content-Type-Options nosniff`, `X-XSS-Protection`, + added `Strict-Transport-Security`, `Referrer-Policy` |
| `proxy_set_header Connection 'upgrade'` always → upstream keepalive inert | `map $http_upgrade $connection_upgrade` — real WebSocket upgrade only |
| `server_tokens` version banner exposed | `server_tokens off` |
| Bare `GET /api` fell into SPA fallback (200 index.html) | `location = /api { return 308 /api/; }` |
| gzip_types missed `image/svg+xml`, `application/wasm` | Extended |
| audio-config.conf regex `location ~` shadowed the serving prefix block | OPTIONS handled inside the prefix location (fragment is now legacy/optional) |

Final block-by-block rationale is in `nginx.txt` (evidence). Key invariants:
- `proxy_pass http://node_backend` in `location /api/` has NO URI part → /api prefix preserved.
- `client_max_body_size 50M` at server level — audio uploads are presigned PUT to S3;
  50M is headroom for any future direct uploads.
- `/assets/*` → `Cache-Control: public, immutable` + `expires 1y` (Vite hashes filenames).
- `/index.html` (nested in `location /`) → `no-cache, no-store, must-revalidate` (fresh deploys).
- API timeouts: connect 60s, send/read 300s (grading/submission can exceed 2 minutes).
- HTTP:80 block → 301 HTTPS (fallback; Cloudflare edge also enforces HTTPS).
- `nginx -t` not runnable on this dev box (nginx is VPS-only) — config validated
  structurally; always run `nginx -t && systemctl reload nginx` on the VPS.

## 3. Verified PM2 Config (ecosystem.config.cjs)

`pm2` CLI is VPS-only; validated via `node require()` + on-disk checks (see `pm2.txt`):

| Property | app[0] anish-toeic-web-services | app[1] toeic-grading-worker |
|---|---|---|
| script/args | `node` `anish-toeic-web-services/dist/server.js` | `node` `anish-toeic-web-services/dist/workers/grading.worker.js` |
| instances / exec_mode | 1 / fork | 1 / fork |
| PORT / NODE_ENV | `7000` / `production` | — / `production` |
| env | DB_*, JWT_SECRET/EXPIRES_IN, CORS_ORIGIN, CLOUDFLARE_AI_*, AWS_*+S3_BUCKET | DB_*, REDIS_URL, CLOUDFLARE_AI_* |
| autorestart / max_memory_restart | true / `512M` | true / `512M` |
| logs | `./logs/err.log` / `out.log` | `./logs/worker-err.log` / `worker-out.log` |

- Secret env values are EMPTY in the config (deploy-time fill — F-16 verified again). No secret material.
- `PORT: 7000` is declared as a number; PM2 stringifies it into `process.env.PORT` at runtime.
- Worker additionally requires `REDIS_URL`; the web-service app does not need Redis directly.
- Live env cross-check (dev box): grading worker runs with `DB_PORT=13306`, `AI_GRADING_TEST_MODE=true`;
  production config ships `DB_PORT=3306` and NO `AI_GRADING_TEST_MODE` (real Cloudflare AI in prod).

## 4. Production Builds (verified — see `build.txt`)

| Command (from repo root) | Exit | Output |
|---|---|---|
| `cd anish-toeic-web-app && npm run build` | 0 | `dist/index.html` + `dist/assets/index-*.{js,css}` (vite 5.4.21, 4455 modules) |
| `cd anish-toeic-web-services && npm run build` | 0 | `dist/server.js`, `dist/workers/grading.worker.js`, `dist/migrations/*.sql` |
| `npm run typecheck` (both workspaces) | 0 | — |
| `npm run lint` (both workspaces) | 0 | — |

Note: FE main bundle ≈ 1.8 MB (Vite chunk-size warning). Non-blocking; post-merge perf
pass (code-splitting) is recommended.

## 5. Environment Variable Table

| Var | Where required | Status |
|---|---|---|
| NODE_ENV, PORT | server boot (env.ts) | required |
| DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME | server + worker | required |
| JWT_SECRET (≥32 chars, not placeholder) | server | required |
| JWT_EXPIRES_IN, CORS_ORIGIN | server | optional (defaults) |
| REDIS_URL | worker queue (grading.service / grading.worker) | required for worker |
| CLOUDFLARE_AI_WORKER_URL / TOKEN / TIMEOUT_MS | grading adapter | UNAVAILABLE-optional (absent ⇒ AI_PROVIDER_NOT_CONFIGURED) |
| AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET | media presign | UNAVAILABLE-optional (absent ⇒ presign 503 in prod) |
| AI_GRADING_TEST_MODE=true | deterministic grading | dev/test ONLY; NEVER true in production |

`.env.example` trio (root `env.example`, root `env.production.example`,
`anish-toeic-web-services/.env.example`) is complete after S7 edits. No FE runtime
env vars (FE has zero `import.meta.env` references). `.env*` (except `.env.example`)
is gitignored — secrets are never committed.

## 6. Docker Compose Dev Infrastructure (scripts/integration/docker-compose.yml)

Dev-only, matches the live environment used by all slice evidence:
- `anish-toeic-mysql` mysql:8.4 → `127.0.0.1:13306` (db `toeic`, user `toeic` / dev pw)
- `anish-toeic-redis` redis:7 → `127.0.0.1:16379`
- Bring up: `docker compose -f scripts/integration/docker-compose.yml up -d`
- NOT for production (dev password, localhost binds).

## 7. Route Coverage (Nginx → Express :7000)

| Nginx location | Express route | Status (S7 live smoke via dev proxy) |
|---|---|---|
| `/api/` → node_backend | all `/api/*` (catalog, auth, attempts, media, result, review) | verified (journeys passed through `/api` proxy) |
| `/health` → rewrite → `/api/health` | `GET /api/health` | verified (`{"status":"ok",…}` on :7000 and via :5173 proxy) |
| `/` SPA fallback | — | verified (browser journeys) |
| `/assets/*` alias | — | config-only (no live nginx) |

## 8. Known Imbalances / Gaps (S7 close)

| Item | Status |
|---|---|
| nginx/nginx.conf + audio-config.conf fixes | DONE in repo (no deploy — task constraint) |
| `nginx -t` on VPS | pending deploy |
| Cloudflare edge live config (proxy mode, SSL, cache rules) | UNAVAILABLE — no CF credentials; contract in `cloudflare-edge.txt` |
| Cloudflare AI Worker + S3 live proof | UNAVAILABLE — env empty; S&W verified with `AI_GRADING_TEST_MODE=true` |
| FE bundle size 1.8 MB | non-blocking; code-splitting later |
| Health path `/health` vs `/api/health` | nginx rewrites; Express serves `/api/health` only — keep the rewrite |
