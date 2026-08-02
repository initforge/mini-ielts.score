# Runbook — clean-checkout reproduce & proof replay

> Target: a verifier who clones the merged repo fresh and reproduces the S7 setup and evidence.
> All commands below were executed/verified during slice S7 against the live dev environment
> (MySQL `127.0.0.1:13306`, Redis `127.0.0.1:16379`, FE `:5173`, BE `:7000`), unless marked [VPS].

## 0. Prerequisites

- Node.js 20 (`.nvmrc` = 20) + npm 10
- Docker (MySQL 8.4 + Redis 7 dev infra)
- Optional (live browser proof): `npx playwright install chromium` (or the `playwright` CLI that
  is already present at repo root `node_modules/.bin/playwright`, version 1.62.1)

## 1. Clean clone + install

```bash
git clone <repo-url> mini-toeic.score && cd mini-toeic.score
npm ci                     # installs both workspaces (npm workspaces monorepo)
```
Fresh-install proof: `.agent/evidence/S1/ac3-clean-build-fresh.txt`.

## 2. Dev infrastructure (MySQL + Redis)

```bash
docker compose -f scripts/integration/docker-compose.yml up -d
# anish-toeic-mysql  → 127.0.0.1:13306 (db toeic, user toeic, dev pw toeic_dev_pw)
# anish-toeic-redis  → 127.0.0.1:16379
```

## 3. Environment setup

No dotenv is loaded by the code — env is injected into the process (PM2 `env:` blocks in prod,
`export`/`set -a` in dev). For dev runs:

```bash
export DB_HOST=127.0.0.1 DB_PORT=13306 DB_USER=toeic DB_PASSWORD=toeic_dev_pw DB_NAME=toeic
export JWT_SECRET='local-dev-secret-20260731-anish-thi-thu-32chars!!'
export REDIS_URL=redis://127.0.0.1:16379
export AI_GRADING_TEST_MODE=true        # deterministic grading (no network AI)
# Optional: CLOUDFLARE_AI_WORKER_URL / TOKEN, AWS_* / S3_BUCKET (UNAVAILABLE → skip)
```
Copy templates: `cp env.example .env` (root) and `cp anish-toeic-web-services/.env.example
anish-toeic-web-services/.env`. `.env*` is gitignored — never commit it.

## 4. Migrate + seed (verified, idempotent)

```bash
cd anish-toeic-web-services
npm run build                          # compile + copy migrations into dist/
node dist/migrations/runner.js up      # applies 001_schema.up.sql, records schema_migrations
npx ts-node src/migrations/seed.ts     # idempotent seed → users, 2 exams, 26 questions
```
Verification during S7: both exit 0; seed prints `Seed completed.`; re-run is no-op
(see `.agent/evidence/S2/seed-rows.txt` for row counts: users 2, exams 2, questions 26, options 84).

## 4.1 Admin lifecycle (A7): seed behavior + production admin provisioning

Dev/test seed (`npx ts-node src/migrations/seed.ts`) now does two A7-required things:

1. **Exams are published, not left DRAFT.** The schema default is `DRAFT`, so the
   seed explicitly inserts fixture exams with `status = 'PUBLISHED'` and
   re-publishes (`UPDATE ... SET status = 'PUBLISHED'`) any already-seeded row on
   re-run. Public list/detail serve `PUBLISHED` rows only, and `createAttempt`
   rejects everything else atomically (single
   `INSERT ... SELECT ... WHERE status = 'PUBLISHED'`).
2. **Known admin is dev/test-only.** The seed owner
   (`seed.owner@example.com`, dev fixture password `seed-password-123`) is granted
   `admin_users` membership **only when `NODE_ENV != production`** — never in
   production, even if the `ALLOW_PRODUCTION_SEED=1 --force` double gate is
   engaged. The seed account credential is a documented dev fixture and must
   never be used in production.

### Production admin provisioning (least privilege, no known credentials)

Production admins are granted manually by a DBA on the production DB — never by
running the seed, and never by copying the dev credential:

```sql
-- One-time DBA action on the production DB: pick the real human's users row.
INSERT INTO admin_users (user_id, role)
SELECT id, 'ADMIN' FROM users WHERE email = '<real-admin-email>';

-- Verify:
SELECT u.email, a.role, a.created_at
FROM admin_users a JOIN users u ON u.id = a.user_id;

-- Revoke:
DELETE FROM admin_users WHERE user_id = <id>;   -- append-only audit log is untouched
```

Least-privilege notes:

- `admin_users` only gates the admin API. Do **not** grant the application DB
  user `SUPER`, `GRANT OPTION`, or write access to `admin_users` — the row
  insert above is a one-time DBA action, so the app account stays read-only on
  the admin/audit tables.
- Re-running the seed against production (double gate `ALLOW_PRODUCTION_SEED=1`
  + `--force`) creates fixture users but **never grants admin** — production
  admin membership exists only via the SQL above.

## 5. Build (production artifacts)

```bash
cd anish-toeic-web-app && npm run build      # → dist/ (verified exit 0)
cd ../anish-toeic-web-services && npm run build
```

## 6. Run dev servers (for browser journeys / API smoke)

```bash
# Terminal A — backend :7000
cd anish-toeic-web-services && npm run dev
# Terminal B — grading worker (test mode uses deterministic double)
cd anish-toeic-web-services && node dist/workers/grading.worker.js   # or npx ts-node src/workers/grading.worker.ts
# Terminal C — frontend :5173
cd anish-toeic-web-app && npm run dev
# Smoke:
curl http://localhost:7000/api/health        # {"status":"ok","service":"anish-toeic-web-services"}
```

## 7. Tests + static gates

```bash
cd anish-toeic-web-services && DB_NAME=anish_toeic_test npm test    # jest 134/134 (F-15: needs test DB name)
cd anish-toeic-web-app   && npm run typecheck && npm run lint
cd anish-toeic-web-services && npm run typecheck && npm run lint
```
S7 verification: typecheck + lint exit 0 in both workspaces (`.agent/evidence/S7/infra-20260731/build.txt`).

## 8. VPS deployment notes [VPS]

```bash
# One-time: bash scripts/deploy.sh            # apt, node 20, pm2, nginx, ufw (as root)
cp nginx/nginx.conf /etc/nginx/sites-available/webinprogress.click
ln -s /etc/nginx/sites-available/webinprogress.click /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
# Fill secret env values in ecosystem.config.cjs (empty by design — F-16), then:
pm2 restart all
```
Cloudflare edge contract (proxy mode, SSL full-strict, /api no-cache): see
`.agent/evidence/S7/infra-20260731/cloudflare-edge.txt`. Live CF/Cloudflare AI/S3 remain
UNAVAILABLE until credentials are provided.

## 9. How to replay the evidence

Work ledger (source of truth, read-only): `.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json`
— slice statuses, receipts, findings F-01..F-16.

Evidence layout:
```
.agent/evidence/S1..S6-FE/     slice proofs (S0 source capture, S1 clean build, S2 schema/auth,
                               S3 catalog, S4 LR, S5 media+SW runner, S6 grading+results)
.agent/evidence/S7/            AC21 synthetic journeys:
                                 synthetic-lr-{desktop,mobile}.txt   (35/35 PASS each, 14/990 FINAL)
                                 synthetic-sw-{desktop,mobile}.txt   (19/19 PASS each, 400 FINAL)
                                 console-network.txt                 (API traffic + console)
                                 *.png                              (catalog/runner/palette/submit/
                                                                    result/errormap/review/history/
                                                                    processing/notfound)
                               AC22: runbook-docs.txt
.agent/evidence/S7/infra-20260731/  AC20 proofs: build/nginx/pm2/env/cloudflare-edge.txt
.agent/evidence/S7/manifest.txt     sha256 of every S7 evidence file (verifier: sha256sum -c)
```
To replay a journey: `node .agent/evidence/S7/journey-lr.mjs` / `journey-sw.mjs` with the dev
stack up (sections 2–6). Scripts are deterministic given the seeded data (21 Q LR, 5 Q SW).

## 10. Merge contract pointer

Base commit `620c111686534899fb980dfb481c9927cb2596bd`. What changed per slice S0–S7,
dirty/untracked paths, findings F-11..F-16 resolutions and the NO-commit constraint are in
`docs/06-merge-handoff.md`.
