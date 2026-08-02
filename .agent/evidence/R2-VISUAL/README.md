# R2-VISUAL — Visual Parity Evidence

Slice S0 parity tooling: pixel-diff any reference screenshot against an app run.
Zero npm dependencies — pure Node (`node:zlib` PNG decode/encode, no image libs
found in repo `node_modules` as of 2026-08-01).

## Tool

```
node .agent/tools/visual-diff.mjs <reference.png> <actual.png> --outdir <dir>
```

Writes into `<dir>`:
- `overlay.png` — reference at 50% alpha over actual (per-channel 0.5 blend; RGBA PNG)
- `diff.png`    — per-pixel difference map, grayscale magnitude (0 = identical, 255 = max diff / out-of-bounds pixel)
- `metric.json` — `{ reference, actual, rmse, diffPixelsPct, dims, outputs }`

Metrics:
- `rmse` — root mean square per-channel difference over the overlapping region.
- `diffPixelsPct` — % of the union bounding box where max channel diff > 0; pixels outside either image count as differing (255).
- `dims` — `{ equal, reference: "WxH", actual: "WxH" }`.

Exit codes: `0` success, `1` decode/IO error, `2` usage error.
Supported input: 8-bit RGB (color type 2) or RGBA (color type 6), non-interlaced. All 35 S0 reference screenshots satisfy this (verified 35/35).

Matrix regeneration (canonical source = `references/xoamutoeic/manifests/manifest.json`):

```
node .agent/tools/gen-matrix.mjs
```

## How matrix rows get filled

`matrix.csv` is the canonical 35-row tracking table. Columns are filled in this
order across the R2 workflow:

| Column | Filled by | When |
|---|---|---|
| reference_id, kind, viewport, route | `gen-matrix.mjs` (from manifest) | build time |
| reference_render | `gen-matrix.mjs` (source_screenshot path) | build time |
| exception_rationale | `gen-matrix.mjs` (S0 close breakdown) for desktop/10, 11, 14 | build time |
| actual_screenshot | capture run | after app is deployed + screenshotted at the same route/viewport |
| diff_png, overlay_png, metric | `visual-diff.mjs` run on reference vs actual | after capture |
| console_receipt, network_receipt | app run logging (console errors, failed network requests) | after capture |
| impl_status | implementer | per state implemented |
| visual_status | reviewer comparing overlay/diff against PASS criteria | after impl |
| reviewer, final_verdict | reviewer sign-off | end of R2 |

Anything not yet filled stays `pending`. The 3 documented exceptions
(desktop/10 live-drift bilingual, desktop/11 live-drift annotation,
desktop/14 historical-exception direct-result) are not runnable against
production today; their `exception_rationale` records why and they default to
`final_verdict = exception` at review.

## Visual PASS criteria

A state PASSES when the reviewer confirms against `overlay.png` + `diff.png`:

1. **Correct state** — same screen/modal/dialog the reference shows (route, tab, quiz part, question index).
2. **Correct hierarchy** — same sections, headings, ordering; nothing missing or reordered.
3. **Content type preserved** — text renders as text (no images-as-text), questions show images/media where the reference does.
4. **Controls present** — buttons, inputs, tabs, palette, modals interactive as in reference; no missing affordances.
5. **Media present** — photos, audio players, images load (network receipt clean, no broken `file:image`).
6. **No overflow** — no horizontal scroll, clipped dialogs, or content cut at viewport edge; mobile usable at 390px (tap targets, readable).
7. **No severe regression** — no blank screens, empty dialogs, frozen states, or layout collapse.

Design deviations (spacing, fonts, color, 1–2px offsets, device pixel ratios)
are allowed with a written rationale in `visual_status` — the reference is a
survey of a live production site, not a pixel-perfect spec. Diff is evidence,
not verdict; the human reviewer + this criteria list is the verdict.

## Smoke evidence (2026-08-01)

| Run | Reference | Actual | rmse | diffPixelsPct | dims.equal |
|---|---|---|---|---|---|
| `smoke/01-vs-self` | desktop/01 | desktop/01 | 0 | 0 | true |
| `smoke/m01-vs-self` | mobile/01 | mobile/01 | 0 | 0 | true |
| `smoke/01-vs-02` | desktop/01 | desktop/02 | 22.451 | 57.27 | false |

Same-image runs → identical (rmse 0, 0% diff) — decoder/encoder round-trip exact.
Different states → large diff, `dims.equal=false` (1280x2130 vs 1280x1088). Tool behaves as specified.

## R2-VISUAL-RUN run summary (2026-08-01)

Full 35-state diff run complete — see `run-summary.txt` (this section mirrors it).

```
R2-VISUAL — visual parity diff evidence (Assignment R2-VISUAL-RUN)
date: 2026-08-01  repo HEAD: 620c111686534899fb980dfb481c9927cb2596bd (worktree dirty — untouched)
tool: .agent/tools/visual-diff.mjs  states: references/xoamutoeic/manifests/manifest.json (35)
actuals: .agent/evidence/R2-LR/*.png + .agent/evidence/R2-SW/*.png (journey screenshot-manifests)

METHOD / LIMITATION: model cannot view images (no vision). Verdicts are quantitative only:
  diffPixelsPct from visual-diff.mjs + overlap-region recomputation + manifest matching of the actual file used.
  Human reviewer must confirm state/hierarchy/controls on overlay.png/diff.png (see criteria above).
DIMS MISMATCH IS EXPECTED: reference PNGs are full-page scrolls (e.g. 1280x2130, 431x6001); actuals are viewport
  shots (1280x800, 375x812). visual-diff.mjs diffPixelsPct counts out-of-bounds union pixels as differing, so the
  raw % is inflated by dims-mismatch. overlap-diff% = recomputed diff % over the shared region only, and is still
  >25% for every state: the app is a re-implementation whose pixels differ from the live-site reference (dark theme,
  different layout/typography). dims-mismatch is NOT an implementation failure; these HIGH-DIFF verdicts are
  quantitative evidence only, not a state-verification failure (journeys already PASSed all state assertions:
  R2-LR PASS=62/62 desktop+mobile, R2-SW PASS=56/56 desktop+mobile).

COUNTS: PASS=0 LOW-DIFF=0 HIGH-DIFF=32 EXCEPTION=3 NONE=0 (of 35)
  HIGH-DIFF 32: desktop/01-09,12-13,15-31, mobile/01-04
  EXCEPTION 3: desktop/10 (live-drift bilingual), desktop/11 (live-drift annotation),
               desktop/14 (historical-exception direct-result)
STATES WITH NO ACTUAL SCREENSHOT: none — all 35 reference states mapped to an R2-LR/R2-SW capture.

TOOL PROBLEMS: none. All 35 diffs ran clean (exit 0); decode verified against smoke evidence.
  smoke/01-vs-02/diff.png is stale (decodes to all-0 despite metric.json 57.3%) — pre-existing smoke artifact,
  not produced by this run; fresh per-state diff.png values match metric.json exactly.
RESULT: PASS (evidence complete, 35/35 diffs + matrix + summary produced); visual parity per quantitative
  metric is HIGH-DIFF, reviewer sign-off required.
```

Artifacts: `matrix.csv` (35 rows filled), `states/<refid-with-dash>/{overlay,diff}.png` + `metric.json`,
`diffs.json`, `summary-data.json`, `run-summary.txt`.
