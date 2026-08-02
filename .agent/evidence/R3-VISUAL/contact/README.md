# R3-VISUAL — Contact Sheet Review Guide (human owner)

The agent running this run has **no vision** (host limitation, owner rule P5).
No visual PASS is claimed anywhere in this evidence. All 35 states are filed
`NEEDS-HUMAN` / `EXCEPTION` and the verdict is **yours** (owner), not the tool's.

## How to review

1. Open `index.html` in a browser (double-click, or `python3 -m http.server` in
   this directory if any image fails to load from `file://`).
2. One card per state, 4 panels each:
   - **reference** — survey capture of live `xoamutoeic.com` (light theme)
   - **actual** — app capture from R3-LR / R3-SW / R3-FE-FIX journeys
   - **overlay** — 50% blend of both (where they agree, it looks "average"; where
     they differ, color shifts)
   - **diff** — per-pixel grayscale magnitude (black = identical, white = max
     difference; white also marks out-of-bounds pixels where dims differ)
3. Metric row per card: `rmse`, `diffPixels%`, `dims equal`, route.
4. Full-resolution tiles are in `../states-r3/<refid-with-dash>/{overlay,diff}.png`.
   Per-state PNG contact sheets: `<refid-with-dash>.png` in this directory.

## What PASS means (criteria)

A state PASSES when it satisfies all 7:

1. **Correct state** — same screen/modal/dialog as the reference (route, tab,
   exam part, question index).
2. **Correct hierarchy** — same sections, headings, ordering; nothing missing or
   reordered.
3. **Content type preserved** — text renders as text; question images/media load
   where the reference has them.
4. **Controls present** — buttons, inputs, tabs, palette, modals interactive as
   in the reference; no missing affordances.
5. **Media present** — photos, audio players, images load (network receipt clean).
6. **No overflow** — no horizontal scroll, clipped dialogs, or content cut at the
   viewport edge; mobile usable at 390px.
7. **No severe regression** — no blank screens, empty dialogs, frozen states,
   layout collapse.

Design deviations (spacing, fonts, color, 1–2px offsets, device pixel ratio) are
**allowed with written rationale** — see "Anish token allowance" below. The diff
is evidence, not a verdict; you are the verdict.

## Anish-token allowance (REQ-001)

Plan REQ-001: *"XoaMu is the complete behavioral/layout blueprint for Anish
`/thi-thu`; only color/branding and shared Anish shell differ."* So:

- Different palette (dark Anish vs light XoaMu), typography, spacing → **NOT a
  failure**; note it in `visual_status` and pass the state if criteria 1–7 hold.
- Different structure/behavior (missing sections, wrong question, broken
  controls, missing media) → **failure**.

## Exceptions (3) — do not compare pixel-for-pixel

| refid | class | reason |
|---|---|---|
| desktop/10-exam-lr-reading-bilingual-marked | live-drift | current production renders "Song ngữ" as an **empty dialog**; the reference state is a survey artifact of a feature that no longer exists (manifest `s0_close_final`) |
| desktop/11-exam-lr-annotation-tools | live-drift | current production renders "Công cụ" as the same **empty dialog**; toolbar never renders |
| desktop/14-exam-lr-submit-confirm | historical-exception | no submit-confirm dialog has ever existed in production (survey + current site both navigate straight to the result certificate) |

The `actual` panel for 10/11/14 is the app's own working implementation — it is
informational, not a mismatch. Reference these to manifest
`summary.s0_close_final.unavailable_breakdown`.

## Owner-flagged mapping fixes applied (verify visually)

- `desktop/15` → result **certificate**, viewport capture
  (`R3-LR/screenshots/desktop15-result-certificate.png`)
- `desktop/19` → **history auth gate** (`R3-FE-FIX/history-gate.png`, anonymous
  `/lich-su` redirect)
- `desktop/27` → **writing directions** (`R3-SW/desktop27-WRITING-DIRECTIONS.png`)
- `desktop/31` → **processing queued state** (`R3-SW/desktop31-processing.png`)

## How to record your verdict

Edit `../matrix-r3.csv`: set `visual_status` to `PASS`/`FAIL`/`EXCEPTION`,
`reviewer` to your name, `final_verdict` to `pass`/`fail`/`exception`, and add a
written rationale for any design deviation. Update `final_verdict` on all 35
rows. Counts to confirm: 32 NEEDS-HUMAN + 3 EXCEPTION, 0 states without actuals.
