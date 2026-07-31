# S0 capture report — XoaMu TOEIC production reference

- **Slice:** S0 — Production reference and parity map
- **Date:** 2026-07-31
- **Target:** `https://www.xoamutoeic.com`
- **Method:** real Chrome via CDP (`--remote-debugging-port=9222`) driven by Playwright-core; every state captured with the browser-native `Page.captureSnapshot({format:'mhtml'})`. No wget, no `outerHTML`, no DOM mutation, no requests library.
- **Output:** `references/xoamutoeic/production-source/{desktop,mobile}/*.mhtml`, `references/xoamutoeic/manifests/manifest.json`

## 1. Result

| Metric | Value |
|---|---|
| Screenshots inventoried (source of truth) | **35** (31 desktop + 4 mobile) |
| MHTML captured | **32 / 35** |
| Blocked | **3** (see §3) |

Every captured MHTML was reopened in Chrome with the network forced offline
(`Network.emulateNetworkConditions offline:true`) and every SHA-256 matches the
manifest — **32 PASS / 0 FAIL** (`.agent/evidence/S0/offline-verification.txt`).

## 2. State mapping (1:1 with `references/xoamutoeic/screenshots`)

### Desktop (31)

| # | Screenshot | Route / state | Status |
|---|---|---|---|
| 01 | `01-exams-sw-list-full.png` | `/exams?tab=sw` S&W catalog | ✔ |
| 02 | `02-exams-lr-list-full.png` | `/exams?tab=lr` L&R catalog | ✔ |
| 03 | `03-exam-start-mode-modal.png` | mode modal on first card | ✔ |
| 04 | `04-exam-lr-detail-start.png` | `/exams/ets-2026-test-1-mq1tovav` Start page | ✔ |
| 05 | `05-exam-lr-active-part1.png` | Listening directions | ✔ |
| 06 | `06-exam-lr-part1-directions.png` | Part 1 directions | ✔ |
| 07 | `07-exam-lr-part1-question1.png` | Part 1 Q1 | ✔ |
| 08 | `08-exam-lr-question-palette.png` | question palette open | ✔ |
| 09 | `09-exam-lr-reading-part5-question101.png` | Reading Part 5 Q101 | ✔ |
| 10 | `10-exam-lr-reading-bilingual-marked.png` | Reading bilingual | **BLOCKED** |
| 11 | `11-exam-lr-annotation-tools.png` | Reading annotation tools | **BLOCKED** |
| 12 | `12-exam-lr-reading-part6-question131.png` | Reading Part 6 Q131 | ✔ |
| 13 | `13-exam-lr-reading-part7-question147.png` | Reading Part 7 Q147 | ✔ |
| 14 | `14-exam-lr-submit-confirm.png` | submit confirm | **BLOCKED** |
| 15 | `15-exam-lr-result-certificate.png` | result certificate | ✔ |
| 16 | `16-exam-lr-result-table.png` | score table modal | ✔ |
| 17 | `17-exam-lr-error-map.png` | error map modal | ✔ |
| 18 | `18-exam-lr-review-detail.png` | review detail modal | ✔ |
| 19 | `19-history-auth-gate.png` | `/history` -> `/auth` gate | ✔ |
| 20 | `20-exam-sw-detail-start.png` | `/speaking-writing/Test1` Start | ✔ |
| 21 | `21-exam-sw-speaking-part1-intro.png` | RECORD TEST (mic test) | ✔ |
| 22 | `22-exam-sw-speaking-directions.png` | speaking directions | ✔ |
| 23 | `23-exam-sw-speaking-q1-preparation.png` | Q1 preparation | ✔ |
| 24 | `24-exam-sw-speaking-q3-describe-picture.png` | Q3 describe picture | ✔ |
| 25 | `25-exam-sw-speaking-q5-respond.png` | Q5 respond | ✔ |
| 26 | `26-exam-sw-speaking-q8-information.png` | Q8 information | ✔ |
| 27 | `27-exam-sw-writing-start.png` | `/writing/Test1` directions | ✔ |
| 28 | `28-exam-sw-writing-q1-picture.png` | Writing Q1 picture | ✔ |
| 29 | `29-exam-sw-writing-q6-email.png` | Writing Q6 email | ✔ |
| 30 | `30-exam-sw-writing-q8-essay.png` | Writing Q8 essay | ✔ |
| 31 | `31-exam-sw-ai-processing.png` | AI feedback no-data (`/ai-processing` -> `/ai-feedback`) | ✔ |

### Mobile (4)

| # | Screenshot | Route / state | Status |
|---|---|---|---|
| 01 | `mobile/01-exams-sw-list-full.png` | `/exams?tab=sw` | ✔ |
| 02 | `mobile/02-exams-lr-list-full.png` | `/exams?tab=lr` | ✔ |
| 03 | `mobile/03-exam-lr-q1.png` | L&R runner Q1 | ✔ |
| 04 | `mobile/04-exam-sw-writing-q1.png` | Writing Q1 picture | ✔ |

## 3. Blockers per state (3)

| State | Blocker (specific) |
|---|---|
| `desktop/10-exam-lr-reading-bilingual-marked` | Live site defect: Reading **"Song ngữ"** button opens an empty fullscreen dialog (`fixed inset-0 z-50`, 0 chars) that never loads; bilingual never activates (header stays "Song ngữ"). Survey's inline-bilingual reference state is not reproducible. Recheck after site fix; script already blocks cleanly via `verifyBilingual`. |
| `desktop/11-exam-lr-annotation-tools` | Live site defect: Reading **"Công cụ"** button opens the same empty fullscreen dialog (no "Browse Mode"/"Draw Mode"); annotation toolbar never renders. Not reproducible. Recheck after site fix; script blocks via `verifyAnnotation`. |
| `desktop/14-exam-lr-submit-confirm` | Non-reproducible by design: no submit-confirmation dialog exists. `references/README.md` documents the survey submit navigated straight to the result; live site does the same (verified: clicking "Nộp bài" renders the result certificate directly). |

## 4. Deviations and notes

- `desktop/31`: route `/ai-processing?type=sw` now redirects to `/ai-feedback?type=sw`; anonymous session renders the no-data state (survey captured anonymous Unauthorized at 5%). Captured the current honest live state.
- Speaking states 22-26 required the microphone test; Chrome launched with `--use-fake-device-for-media-stream` / `--use-fake-ui-for-media-stream` (launch flags only, no DOM change, no media device dependency).
- States 15-18 require an L&R submit; each captured state performs one anonymous zero-score submit on the production site — the same process the survey used to capture the result screenshots. 4 submits total across the run (15, 16, 17, 18 are self-contained).
- Result sub-views (16/17/18) are modals opened from the certificate; they do not close on `Escape` (site behavior) and were closed via their "×" button during the flow.
- Site layout/timing drifts from the survey: `Question 31-34 of 100` header while content is Q131 (site bug, preserved as-is); Reading nav buttons render text "Câu tiếp" instead of the survey's aria "Câu sau".

## 5. Files changed (S0 only)

| File | Purpose |
|---|---|
| `scripts/capture-xoamutoeic.mjs` | Capture script (CDP + `Page.captureSnapshot` mhtml) |
| `references/xoamutoeic/production-source/desktop/*.mhtml` (28) | Desktop MHTML corpus |
| `references/xoamutoeic/production-source/mobile/*.mhtml` (4) | Mobile MHTML corpus |
| `references/xoamutoeic/manifests/manifest.json` | URL/viewport/state/SHA-256 manifest |
| `references/audit/parity-matrix.md` | Parity matrix (updated: MHTML references, AC2) |
| `.agent/evidence/S0/verify-offline.mjs` | Offline-verification harness |
| `.agent/evidence/S0/offline-verification.txt` | 32 PASS / 0 FAIL result log |
| `.agent/evidence/S0/capture-report.md` | This report |

No application source (S1-S7), plan, ledger, or `.git` was modified.

## 6. Verification commands

```powershell
# Re-capture (requires Chrome on CDP :9222 with fake-media flags):
node scripts/capture-xoamutoeic.mjs
node scripts/capture-xoamutoeic.mjs --only desktop/15-exam-lr-result-certificate

# Offline reopen + SHA-256 verification:
node .agent/evidence/S0/verify-offline.mjs

# Inspect manifest:
Get-Content references/xoamutoeic/manifests/manifest.json
```

## 7. Implementer receipt

- Assignment: S0 (AC1, AC2) — production reference corpus + parity matrix.
- Scope honored: only S0 write paths touched; no commit/push; no app-code, plan, or ledger edits.
- Model: `qwencoder/qwen3.7-max` (requested `inherit` per ledger I-S0).
- Result: **32/35 captured**, 3 blocked with specific, reproducible reasons (2 site defects + 1 non-reproducible). Parity matrix updated; offline reopen of all 32 MHTML files verified with matching hashes.
