# Merge Handoff — slice S7 close

> Work package: `anish-thi-thu-xoamutoeic-20260730`
> Prepared at S7 close. NO commit / push / deploy was performed by the S7 executor
> (verified: working tree left untouched by any git write — `git status` shows only the
> work produced by slices S1–S7, see §6).
> Source of truth for slice statuses/receipts/findings: `.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json` (read-only).

## 1. Base commit

```
620c111686534899fb980dfb481c9927cb2596bd  feat(toeic): build learner mock-exam workflow
branch: master   (repo remote: origin https://github.com/initforge/mini-toeic.score.git)
```
Matches checkpoint `HANDOFF-20260731` in the ledger. Baseline (older) commits for
context: `b4aab14` (S1 monorepo), `11a327a` (S2 schema/core API), `6d27afa`, `fb1be38`,
`ccd6ee5`, `70fab91`.

## 2. What changed per slice S0–S7

| Slice | Ledger status | Changes | Where |
|---|---|---|---|
| S0 | passed | XoaMu production-source capture (desktop/mobile MHTML) + parity matrix (56 rows) + offline verification | committed in history (`references/xoamutoeic`, `.agent/evidence/S0/*`) |
| S1 | passed | Monorepo scaffold (two npm workspaces), /api proxy contract, env zod validation, clean-build proof | committed (`b4aab14`, `620c111`) |
| S2 | passed | MySQL schema + migrations, seed, catalog/auth/attempt API, ownership, idempotency | working tree — **`seed.ts` is UNTRACKED** (must be added, see §3) |
| S3 | passed | Catalog UI (tabs/search/filters), mode dialog, login-return flow | working tree — **`examCatalog.ts` UNTRACKED** |
| S4 | passed | LR scoring BE + LR runner FE (parts 1–7, autosave, palette, error map) | working tree — **`ErrorMapPage.tsx` UNTRACKED** |
| S5 | passed | Media presign BE + SW runner FE (mic, speaking record, writing editor) | working tree — **`WritingView.tsx` UNTRACKED** |
| S6 | passed | Grading worker (Redis/MySQL, idempotent), ProcessingPage/results/history FE | working tree (`grading.worker.ts`, `ProcessingPage.tsx`, `ResultPage.tsx`, …) |
| S7 | running → close | nginx configs fixed, PM2 validated, builds+typecheck+lint green, synthetic LR/SW journeys PASS, runbook + merge docs | working tree (`nginx/*`, `env.example`, `env.production.example`, `docs/04…05…06`, `.agent/evidence/S7/*`) |

## 3. Dirty / untracked paths — merge guidance

Modified tracked files (20) — ALL of these belong in the merge commit:
```
.agent/work/anish-thi-thu-xoamutoeic-20260730/ledger.json   (work ledger — harness owner decides;
                                                              recommended: keep out of app history or commit
                                                              as ops artifact, per existing repo practice)
anish-toeic-web-app/src/App.tsx
anish-toeic-web-app/src/modules/mock-exam/pages/MockExamRunnerPage.tsx
anish-toeic-web-app/src/modules/mock-exam/runner/lr/PassageView.tsx
anish-toeic-web-app/src/modules/mock-exam/runner/sw/MicrophoneSetup.tsx
anish-toeic-web-app/src/modules/mock-exam/runner/sw/SpeakingView.tsx
anish-toeic-web-app/src/modules/mock-exam/runner/sw/swStore.ts
anish-toeic-web-app/src/modules/mock-exam/store/attemptStore.ts
anish-toeic-web-app/src/pages/user/HistoryPage.tsx
anish-toeic-web-app/src/pages/user/LoginPage.tsx
anish-toeic-web-app/src/pages/user/ProcessingPage.tsx
anish-toeic-web-app/src/pages/user/ResultPage.tsx
anish-toeic-web-app/src/pages/user/SWRunnerPage.tsx
anish-toeic-web-services/src/workers/grading.worker.ts
ecosystem.config.cjs
env.example                         (S7: added AI_GRADING_TEST_MODE, REDIS_URL)
env.production.example              (S7: added AI_GRADING_TEST_MODE, REDIS_URL)
nginx/nginx.conf                    (S7: fixed — see docs/04 §2)
nginx/audio-config.conf             (S7: fixed shadowing regex, legacy-flagged)
docs/04-infra-nginx-pm2-validation.md   (S7 refresh)
docs/05-runbook.md                      (NEW, S7)
docs/06-merge-handoff.md                (NEW, S7)
references/audit/findings.md            (S7: appended ledger F-11..F-16 + F-RECON-20260731)
```
UNTRACKED files that MUST be added (tracked code imports them — omitting them breaks the build):
```
anish-toeic-web-app/src/modules/mock-exam/lib/examCatalog.ts      (imported by ResultPage.tsx)
anish-toeic-web-app/src/pages/user/ErrorMapPage.tsx               (imported by App.tsx, route /chi-tiet)
anish-toeic-web-app/src/modules/mock-exam/runner/sw/WritingView.tsx (imported by SWRunnerPage.tsx)
anish-toeic-web-services/src/migrations/seed.ts                    (seed step of the runbook)
anish-toeic-web-services/.env.example                              (env template; no secrets)
```
UNTRACKED that SHOULD be added (proofs + dev infra):
```
.agent/evidence/S1..S7/   (all slice evidence — see §5)
.agent/work/…/legacy-receipts-v3.json, legacy-reviews-v3.json
scripts/integration/      (dev docker-compose: MySQL/Redis)
```
UNTRACKED that MUST NOT be committed:
```
anish-toeic-web-app/s4fe-debug4.mjs   (F-14 debug artifact — DELETE, never commit)
scratch/xoamutoeic/                   (scratch research — do not commit)
```
NOTE: two stash entries exist (`68b51a8` WIP, `16ce1a2` index on master). They predate S7;
do not rely on them for the merge — verify against the working tree directly.

## 4. F-RECON-20260731 — reconciliation summary

Reconciled ledger findings F-11..F-16 against the S7-verified repo state. All six were
recorded as "Non-blocking (low), resolved, verified by independent reviewer PASS" in the
ledger; S7 re-verified each:

| Finding | Ledger status | S7 re-verification |
|---|---|---|
| F-11 S4-FE screenshot gap Parts 3/4/6 | resolved (low) | Confirmed closed: S7 full-journey screenshots cover part 1, palette, submit, result, errormap, review, history; S4-FE evidence retains part-by-part answered assertions. |
| F-12 S5-FE benign 409 autosave race | resolved (low) | Confirmed: S7 SW journeys submit cleanly after autosave (no data loss; console-network.txt shows no unhandled 409). |
| F-13 S4-FE console noise (Router/Spin warnings) | resolved (low) | Confirmed cosmetic: S7 console-network.txt shows only expected dev noise; no pageerrors. |
| F-14 repo hygiene (s4fe-debug4.mjs, scratch/, scripts/integration/) | resolved (low) | scripts/integration/ intentionally retained (dev infra, runbook uses it); s4fe-debug4.mjs + scratch/ flagged to NOT commit (§3). |
| F-15 full suite needs DB_NAME=anish_toeic_test | resolved (low) | Confirmed: runbook documents `DB_NAME=anish_toeic_test npm test`; S7 ran typecheck+lint on the default env (exit 0). |
| F-16 ecosystem.config.cjs empty env values | resolved (low) | Confirmed: values are deploy-time fill; no secret material (pm2.txt validator). |

Verdict: F-RECON-20260731 = CLOSED (no open findings). External-proof items remain
UNAVAILABLE (see §6).

## 5. External dependencies — UNAVAILABLE (no live proof, nothing fabricated)

- Cloudflare AI Worker (grading endpoint): env vars empty → production grading uses the
  HTTP adapter contract (INJ-002); S&W verified with `AI_GRADING_TEST_MODE=true`
  deterministic scoring. Live proof deferred until credentials.
- S3 / presigned uploads (AWS_* / S3_BUCKET): env empty → media.adapter returns 503 in
  prod without creds; dev uses mock. Live proof deferred.
- Cloudflare edge live configuration (proxy mode, SSL, cache rules): no CF credentials;
  contract documented in `.agent/evidence/S7/infra-20260731/cloudflare-edge.txt`.

## 6. Git commands to verify (no commit made)

```bash
git status --short                    # 20 modified tracked files + untracked additions (§3)
git diff --stat                       # code changes on top of 620c111
git rev-parse HEAD                    # 620c111686534899fb980dfb481c9927cb2596bd (unchanged)
git diff origin/master --stat         # same as above (master == 620c111; no new commits)
git log --oneline -3                  # no S7 commit exists
```
S7 executor performed NO `git commit`, NO `git push`, NO deploy/restart of production
services. Working tree changes are the deliverable.

## 7. Acceptance proof pointers

- AC20 (nginx, pm2, cloudflare-edge, env): `.agent/evidence/S7/infra-20260731/{nginx,pm2,cloudflare-edge,env,build}.txt` + `docs/04`
- AC21 (lr, sw, result, history): `.agent/evidence/S7/synthetic-{lr,sw}-{desktop,mobile}.txt`, `console-network.txt`, screenshots
- AC22 (clean-checkout, merge-contract, runbook): `docs/05-runbook.md`, this file, `runbook-docs.txt`, `manifest.txt`
