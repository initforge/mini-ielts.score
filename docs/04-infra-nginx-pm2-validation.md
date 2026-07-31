# Nginx / PM2 Infrastructure Validation

> Version: 2.0.0 — updated for S7 infra gap closure (anish-toeic-web-services :7000 + anish frontend static).
> Target suites: `ecosystem.config.cjs`, `nginx/nginx.conf`, `anish-toeic-web-services/dist/server.js`.

## 1. Architecture Map

```
Browser (HTTPS)
  │
  ▼
Nginx :443 (nginx/nginx.conf)
  ├─ /api/*      → upstream node_backend → 127.0.0.1:7000
  ├─ /assets/*   → alias /var/www/mini-ielts-score/anish-toeic-web-app/dist/assets/
  ├─ /audio/speaking/* → alias /var/www/mini-ielts-score/public/audio/speaking/
  ├─ /health     → proxy_pass http://node_backend
  └─ /*          → root /var/www/mini-ielts-score/anish-toeic-web-app/dist (SPA)

PM2 (ecosystem.config.cjs)
  └─ anish-toeic-web-services → node anish-toeic-web-services/dist/server.js :7000

Vite Dev Proxies (development only)
  ├─ root  vite.config.ts      → /api → localhost:4000 (server/dev-server.ts)
  └─ app   vite.config.ts      → /api → 127.0.0.1:7000 (anish-toeic-web-services)
```

## 2. Production Validation Procedure

### 2.1 PM2 Status

```bash
pm2 status
pm2 logs anish-toeic-web-services --lines 20
pm2 monit
```

**Expected:**
- Process `anish-toeic-web-services` is `online`, `exec_mode: fork`, `status` green.
- Logs show `Server running on port 7000`.
- Memory < 512 MB (restart threshold set in ecosystem).

### 2.2 PM2 Config Audit

| Property | Expected Value | Source |
|---|---|---|
| `name` | `anish-toeic-web-services` | `ecosystem.config.cjs` |
| `script` | `node` | `ecosystem.config.cjs` |
| `args` | `anish-toeic-web-services/dist/server.js` | `ecosystem.config.cjs` |
| `instances` | `1` | `ecosystem.config.cjs` |
| `exec_mode` | `fork` | `ecosystem.config.cjs` |
| `PORT` | `7000` | `ecosystem.config.cjs` |
| `max_memory_restart` | `512M` | `ecosystem.config.cjs` |

Check that the PM2 process is actually using the configured script:

```bash
pm2 show anish-toeic-web-services | grep -E 'script|args|exec mode|status'
```

### 2.3 Nginx Syntax & Reload

```bash
nginx -t && systemctl reload nginx
```

**Expected:** `syntax is ok` and `test is successful`.

### 2.4 Nginx Config Audit

| Directive | Expected Value | Rationale |
|---|---|---|
| `listen` | `443 ssl http2` | TLS termination |
| `server_name` | `webinprogress.click` + IP | Known domain |
| `client_max_body_size` | `50M` | Large audio/image uploads |
| `proxy_connect_timeout` | `60s` | Fast connect, long read/send |
| `proxy_read_timeout` | `300s` | Gemini batch processing |
| `proxy_send_timeout` | `300s` | Gemini batch processing |
| `gzip` | `on` | Compression for text assets |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing protection |

### 2.5 Endpoint Smoke (Production)

```bash
# Health
curl -sS https://webinprogress.click/health | jq .
# Expected: {"status":"ok","timestamp":"..."}

# API proxy is alive (catalog public)
curl -sS https://webinprogress.click/api/toeic-exams | jq .
# Expected: {"items":[],"total":0,...} or actual catalog data

# Auth route not swallowed (must NOT return 401 "Missing token")
curl -sS -X POST https://webinprogress.click/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test"}'
# Expected: 401 "Invalid email or password" — NOT "Missing token"

# SPA fallback returns index.html (HTML response, not 404)
curl -sS -o /dev/null -w '%{http_code}' https://webinprogress.click/thi-thu
# Expected: 200

# Audio serving
curl -sS -I https://webinprogress.click/audio/speaking/system/beep.mp3
# Expected: 200, content-type: audio/mpeg

# Asset caching headers
curl -sS -I https://webinprogress.click/assets/index-something.js 2>/dev/null | grep -i cache
# Expected: Cache-Control: public, immutable
```

### 2.6 CORS Verification

```bash
curl -sS -I -H 'Origin: http://localhost:5173' https://webinprogress.click/api/health
# Expected: access-control-allow-origin: http://localhost:5173
```

## 3. Development Proxy Validation

### 3.1 Root App (Port 5173 → Port 4000)

```bash
# In one terminal:
npm run dev:api     # Starts dev-server on :4000

# In another:
npm run dev         # Starts Vite on :5173, proxies /api → :4000
```

Then test:
```bash
curl http://localhost:5173/api/grade-speaking
# Expected: 405 Method Not Allowed (route exists, wrong method) — NOT 404
```

### 3.2 Web App (Port 5173 → Port 7000)

```bash
# In one terminal:
cd anish-toeic-web-services && npm run dev  # Starts on :7000

# In another:
cd anish-toeic-web-app && npm run dev       # Vite on :5173, proxy → :7000
```

Then test:
```bash
curl http://localhost:5173/api/health
# Expected: {"status":"ok","service":"anish-toeic-web-services"}
```

## 4. Route Coverage Matrix

### 4.1 Nginx → Express (anish-toeic-web-services :7000)

| Nginx Location | Express Route | Expected | Verified |
|---|---|---|---|
| `/health` | `GET /api/health` | 200 JSON | ☐ |
| `/api/*` | All anish-toeic-web-services routes | 200/401/etc. | ☐ |
| `/*` | Static SPA fallback | 200 HTML | ☐ |
| `/assets/*` | Static alias | 200 + cache headers | ☐ |
| `/audio/speaking/*` | Static alias | 200 audio/mpeg | ☐ |

### 4.2 Web Services Backend (anish-toeic-web-services on :7000)

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/health` | No | 200 |
| POST | `/api/auth/register` | No | 201 |
| POST | `/api/auth/login` | No | 200/401 |
| POST | `/api/auth/logout` | No | 200 |
| GET | `/api/toeic-exams` | No | 200 |
| GET | `/api/toeic-exams/:slug` | No | 200/404 |
| POST | `/api/toeic-exams/:id/attempts` | Bearer | 201 |
| GET | `/api/toeic-attempts` | Bearer | 200 |
| GET | `/api/toeic-attempts/:id` | Bearer | 200/404 |
| PATCH | `/api/toeic-attempts/:id/responses/:qid` | Bearer | 200/409 |
| POST | `/api/toeic-attempts/:id/media/presign` | Bearer | 200 |
| POST | `/api/toeic-attempts/:id/submit` | Bearer | 200 |
| GET | `/api/toeic-attempts/:id/grading-status` | Bearer | 200/404 |
| GET | `/api/toeic-attempts/:id/result` | Bearer | 200/404 |
| GET | `/api/toeic-attempts/:id/review` | Bearer | 200/403/404 |

## 5. Package Script Validation

| Script | Workspace | Expected Outcome |
|---|---|---|
| `npm run test` (root) | All | Runs Jest suites in web-services, tsc in web-app |
| `npm run typecheck` (root) | All | tsc --noEmit passes in both |
| `npm run build` (root) | All | tsc + vite build; dist directory populated |
| `npm run dev` (root) | All | Both dev servers start (separate terminals) |

```bash
# Validate from workspace root:
npm run test --workspace=anish-toeic-web-services 2>&1 | tail -20
npm run typecheck --workspace=anish-toeic-web-app 2>&1
```

## 6. Known Imbalances (Post-S7)

| Issue | Detail | Mitigation |
|---|---|---|
| ~~**PM2 runs old SW lab server only**~~ | ~~`ecosystem.config.cjs` runs `server/index.ts:3000`~~ | **RESOLVED in S7:** PM2 now runs `anish-toeic-web-services` on `:7000` with the compiled `dist/server.js`. |
| **Dual Vite proxies** | Root vite config proxies to `:4000` while web-app proxies to `:7000`. This is intentional — they serve different features. | No action required; both proxies are validated by proxy-smoke.test.ts. |
| **Nginx timeouts at 300s** | Set for Gemini batch transcription; Vercel plan limits may differ. | VPS path is preferred for long-running grading. |
| **Health check path mismatch** | Nginx proxies `/health` but Express serves on `/api/health`. The old `server/index.ts` had `GET /health`; the new web-services uses `GET /api/health`. | Nginx should proxy `/health` -> rewrite or web-services should add a bare `/health` alias. Currently the nginx health check will 404. **Action:** add `GET /health` redirect to web-services or update nginx location to `/api/health`. |

## 7. Quick Validation Script

Save and run this one-liner to verify the core VPS topology:

```bash
#!/bin/bash
set -e
echo "=== PM2 ==="
pm2 status 2>/dev/null || echo "PM2 not running (expected on dev machine)"
echo "=== Nginx config test ==="
nginx -t 2>/dev/null || echo "Nginx not installed (expected on dev machine)"
echo "=== Backend health (local) ==="
curl -sS http://localhost:7000/api/health 2>/dev/null || echo ":7000 not reachable"
curl -sS http://localhost:4000/health 2>/dev/null || echo ":4000 not reachable"
curl -sS http://localhost:3000/health 2>/dev/null || echo ":3000 not reachable"
echo "=== Jest suites ==="
npx jest --config anish-toeic-web-services/jest.config.js --listTests 2>/dev/null | wc -l
echo "=== Done ==="
```
