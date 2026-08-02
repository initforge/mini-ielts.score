# R3-BROWSER-REVIEW — Independent CDP / Network / Console Evidence Audit

Auditor: independent read-only reviewer (qwencoder/deepseek-v4-flash). Did NOT run the journeys.
Audited RAW evidence only. Repo HEAD `620c111686534899fb980dfb481c9927cb2596bd`, worktree dirty (208 modified/deleted files — FE-FIX changes present but uncommitted). No files mutated.
Limitation: auditor model cannot render PNGs — visual claims rest on receipt text + file existence/size; DOM assertions in R3-FE-FIX verified at source-diff + receipt level only.

## 1. CDP REALITY VERDICT: VALID (PASS)

- R3-LR `cdp-browser-proof.txt`: real binary launch `--remote-debugging-port=9222` (`/opt/coccoc/browser/browser --headless=new ...`), endpoint verified via `/json/version`, connection via `connectOverCDP('http://127.0.0.1:9222')`, domains `Network.enable, Runtime.enable, Log.enable, Security.enable` + `Security.setIgnoreCertificateErrors`. Owner rule ("playwright.launch is NOT CDP proof") NOT triggered — the launch is the real binary with a debugging port; `connectOverCDP` attaches to that port (raw CDP), not a Playwright-spawned browser.
- R3-SW: no separate proof file, but `cdp-desktop.json`/`cdp-mobile.json` embed `meta`: `cdpEndpoint 127.0.0.1:9223`, `connect: connectOverCDP`, `launchArgs` incl. `--remote-debugging-port=9223`, `domainsEnabled [Network, Runtime, Log, Security]`, browser `147.0.7727.150`. The SW JSON holds a RAW CDP event stream: `network.requestWillBeSent` (388/390), `network.responseReceived` (386/389), `log.entryAdded` (14/14), `runtime.consoleAPICalled` (15/15), `network.loadingFailed` (8/8), with CDP-shaped requestIds and UTC timestamps. Genuine protocol events.
- Caveat: R3-LR `cdp-*.json` are PROCESSED summaries (no raw method names — grep `Network.responseReceived` = 0); provenance of LR numbers rests on `cdp-browser-proof.txt`. SW JSON is raw. Both accepted; LR noted as derived-record.

## 2. PER-JOURNEY COUNTS (from raw data)

| Journey | Runtime.exceptionThrown | Log.entryAdded (error) | ConsoleAPI error/warn | loadingFailed | Non-2xx responses | Unexpected (unclassified) |
|---|---|---|---|---|---|---|
| LR desktop (267) | 0 | 11 = 3 CSP + 2×401 + 6×404 | — (not persisted; see §5) | 0 | 8 = 2×401 gate + 6×404 SW-result | 0 |
| LR mobile (268) | 0 | 11 = same split | — | 0 | 8 = same | 0 |
| SW desktop (246) | 0 | 14 = 4 CSP + 2×401 + 2×409 + 6×404 | 3 = 1 error (antd-compat) + 2 warn (SWStore 409 reconcile) | 8 (all `net::ERR_ABORTED` `canceled=true`) | 10 = 2×401 + 2×409 + 6×404 | 0 |
| SW mobile (247) | 0 | 14 = same split | 3 = same | 8 (same) | 10 = same | 0 |
| FAILURE2 (23 states) | 0 pageerror, 0 unhandled, 0 dialogs | CSP artifact + offline `ERR_FAILED` + timeout `ERR_ABORTED` classified | — | intended (route.abort / timeout) | 404 anti-oracle, 429 rate-limit intended | 0 |

Classification checks against raw events:
- LR: statuses exactly `200×275, 201×1, 401×2, 404×6` (desktop), `200×271, 201×1, 401×2, 404×6, None×1` (mobile). All non-2xx listed as EXPECTED in receipts with reasons (anonymous 401 gate; SW attempts w/o result rows because grading worker not on stack).
- SW: statuses exactly `200:359/362, 201:1, 204:8 (OPTIONS preflight), 206:8 (audio range), 401:2, 404:6, 409:2`. 8× PUT `127.0.0.1:19000/toeic-media/uploads/attempts/{246|247}/q{22..29}/q{22..29}.webm` → HTTP 200, and each of the 8 `loadingFailed` requestIds is the SAME id that returned 200 (e.g. `3066674.155` PUT q22 → 200 AND `ERR_ABORTED` `canceled=true`). Chromium blob-body teardown artifact — labeling is honest and backed by MinIO persistence (§4). Classified EXPECTED with reason — acceptable.
- SW `PATCH` responses `23×200 + 2×409` per viewport — writing autosave race reconciled (console warn `[SWStore] conflict on autosave q37 — reconciling revision` present in raw events). Honest.

## 3. LEAKAGE VERDICT: PASS

- `Authorization` header: LR requests carry no headers at all; SW headers present but nulled/scrubbed (`"authorization": null`) — no value anywhere. grep `Authorization` in SW files = 0 hits; LR `requests w/ Authorization: 0`.
- `token=` in URLs: 0 hits across LR + SW cdp/receipts/journeys/summary/minio-listing.
- `GEMINI` / `api-key` / `AIza...` strings: 0 hits.
- Audio base64 blobs: 0 (`data:audio` = 0). Only `data:image/svg+xml;base64,...` (antd icons, question-prompt images) — flagged as benign in receipts. Consistent.
- localStorage (Runtime dump): keys are catalog caches only — LR desktop `[anish-toeic-catalog:LR…, anish-toeic-catalog:SW…]`, LR mobile `[LR…]`, SW `[LR…, SW…]`; `token`/`jwt` absent in all (grep + `localStorageHasJwt: false`).
- Cookie: `token` — `httpOnly:true, sameSite:Lax, secure:false` (LR + SW identical). `secure=false` expected on localhost HTTP dev (recorded as such in summaries).
- By-design note: SW presigned PUT URLs embed `X-Amz-Credential=minioadmin&X-Amz-Signature=...` — standard S3 presign (dev MinIO creds), not a token leak.

## 4. MEDIA (MinIO) CROSS-CHECK: PASS

- `minio-listing.txt`: 16 objects (8/attempt) `uploads/attempts/{246|247}/q{22..29}/q{22..29}.webm`, all 37004 bytes, `audio/webm;codecs=opus`, per-object sha256 + ETag recorded.
- CDP cross-check: 8× PUT → 200 per viewport (desktop q22..q29 requestIds `3066674.155..177`; mobile `3080370.155..177`); `X-Amz-Date=20260801T060536Z..` (desktop), `T060717Z..` (mobile) matches MinIO `LastModified` 06:05:36–06:06:03Z / 06:07:17–06:07:44Z exactly. Transport proven end-to-end.

## 5. DISCREPANCIES (receipt vs raw data) — none hide errors

1. R3-SW `summary.txt` line 45 claims CSP warnings `3 / 3`; raw CDP shows **4 per viewport** (2× `/thi-thu`, 1× detail, 1× `/thi-thu/lich-su`). The `console-network-*.txt` receipts correctly list all 4 (grep = 4). Under-count in summary only. Minor.
2. R3-LR `console-network-*.txt` header "CONSOLE total=15" vs CDP `logEntries=11`; the 4 extra consoleAPI messages (incl. antd Spin + antd-compatible warnings, which the receipts classify) are NOT persisted in the LR cdp JSON (grep `consoleAPICalled` = 0) — provenance of those two classified lines rests on the receipt itself. All 11 persisted error entries are covered by the receipt's patterns. No misclassification; minor provenance gap.
3. R3-FAILURE2 `matrix-summary.txt` row 21-xss says "0 console errors" while its receipt shows 1 CSP error for `xss-result` — CSP is an environment artifact classified EXPECTED, so "0" = 0 app errors. Wording tension only.
4. R3-FAILURE2 receipts captured via Playwright listeners (console/pageerror/dialog/response/requestfailed) — honestly stated in header; that set is a UI-state matrix, not CDP-journey evidence.
5. LR mobile has one `PATCH /api/toeic-attempts/268/responses/19` with `status:null` (id `.94`, no loadingFailed recorded; retried 817ms later → 200 id `.159`). Not flagged in receipt. Benign (no CDP failure event), but unmentioned in raw-record → note.
6. R3-LR `summary.txt` reports a 3rd "gate" context (Log.entryAdded=5, CSP=1) with no corresponding cdp JSON file; the gate evidence is screenshot `desktop19-HISTORY-AUTH-GATE.png` + summary text only.

## 6. R3-FE-FIX (verify.txt) — PASS

- Bug 1 antd Modal.confirm under React 19: `main.tsx` first import `@ant-design/v5-patch-for-react-19` (confirmed in worktree diff + antd-patch.txt, dep `^1.0.3`); receipts assert `.ant-modal-confirm` rendered for "Sang phần Reading?" (`skip-rendered.png`) and "Nộp bài?" (`submit-confirm-rendered.png`); screenshots exist (1440×900, ~118KB). Matches the R3-LR blocker's root cause.
- Bug 3 SW returnUrl `&tab=sw`: `ExamModeDialog.tsx` diff — 401 branch adds `tabParam='&tab=sw'` for SW; `CatalogPage.tsx` consumes `tab='sw'` → SW tab + dialog auto-open; `sw-returnurl-after-login.png` exists. Matches R3-SW blocker's root cause.
- Bug 4 history auth gate: `HistoryPage.tsx` diff — 401 → `navigate('/dang-nhap?returnUrl=%2Fthi-thu%2Flich-su')`; `history-gate.png` exists.
- Bug 2 react hoist: `npm-ls.txt` shows single `react@19.2.8 / react-dom@19.2.8 overridden`; build/typecheck/lint exit 0 (`build.txt`).
- Note: FE-FIX uses Playwright (chromium 1.62.0 headless) — declared in verify.txt header; not CDP-journey evidence, does not affect the CDP-validity question.

## 7. G8 VERDICT (normal console/network clean): PASS

All journeys: 0 uncaught exceptions; every persisted console error and every non-2xx / loadingFailed carries an explicit EXPECTED classification with reason (CSP dev diagnostic, anonymous 401 gate, SW-result 404 w/ grading-worker absence, 409 autosave reconcile, ERR_ABORTED-on-200-PUT, anti-oracle 404, rate-limit 429, offline/timeout simulation). No receipt claims "clean" while containing an unclassified error. Real defects found during journeys (antd React-19 static modal; SW returnUrl missing `tab=sw`; history gate) are reported as FAILs in summaries and now covered by R3-FE-FIX — not hidden.

## 8. OVERALL: PASS (evidence integrity) — with notes

Raw evidence is genuine CDP, leakage-free, cross-verifiable (PUT 200 ↔ MinIO LastModified/sha256), and honestly classified. Journey verdicts (LR FAIL-blocker, SW FAIL-intent bug, FAILURE2 23/23, FE-FIX 4/4 PASS) are consistent between receipts and raw data.

Notes for record: (a) SW summary CSP count 3 vs raw 4; (b) LR "CONSOLE total=15" includes 4 non-persisted consoleAPI lines; (c) LR mobile 1 status-null PATCH retried→200 unmentioned; (d) LR cdp JSON is derived, SW is raw; (e) PNGs not renderable by this auditor model.

Report summary: CDP-validity=PASS, G8=PASS, leakage=PASS, media=PASS, FE-FIX=PASS, discrepancies=5 minor (none error-hiding), overall evidence integrity=PASS.
