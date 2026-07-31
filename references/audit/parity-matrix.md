# Parity Matrix: Anish TOEIC `/thi-thu` vs XoaMu Reference

> S0 production-source capture: 2026-07-31.
> Reference corpus: `references/xoamutoeic/production-source/{desktop,mobile}/*.mhtml`
> (Chrome `Page.captureSnapshot format=mhtml`, offline-reopen verified — see
> `.agent/evidence/S0/offline-verification.txt` and `manifests/manifest.json`).
> Manifest/hash: `references/xoamutoeic/manifests/manifest.json`.

## Status legend (v2 — per INJ-001 S0 close)

| Status | Meaning |
|---|---|
| `D` | desktop MHTML captured + SHA-256 verified |
| `M` | mobile MHTML captured + SHA-256 verified |
| `DRIFT` | live-drift: site defect in current production; feature broken, survey reference preserved |
| `HIST-EXC` | historical-exception: state never existed in production; canonical behavior documented |

## 1. Catalog & Auth (desktop + mobile)

| Route / State | Reference (Desktop) | Reference (Mobile) | Target Component / Module | Parity Notes |
|---|---|---|---|---|
| `/exams?tab=sw` S&W catalog | `D 01-exams-sw-list-full.mhtml` | `M 01-exams-sw-list-full.mhtml` | `CatalogList`, `ExamCard`, `FilterTabs`, `SearchBox` | Match XoaMu layout; apply Anish tokens. Handle loading/empty/error/no-result. |
| `/exams?tab=lr` L&R catalog | `D 02-exams-lr-list-full.mhtml` | `M 02-exams-lr-list-full.mhtml` | `CatalogList`, `YearChips`, `ExamCard` | Search, filter chips, pagination or load-more. |
| Exam mode dialog | `D 03-exam-start-mode-modal.mhtml` | — | `ModeSelectionModal` | Thi thử / Luyện tập modes; server capability flags. |
| History auth gate | `D 19-history-auth-gate.mhtml` | — | `AuthRedirect` | `/history` -> `/auth`; returnUrl intent preserved. |

## 2. Pre-exam (L&R detail)

| Route / State | Reference | Target Component / Module | Parity Notes |
|---|---|---|---|
| `/exams/:slug` Start page | `D 04-exam-lr-detail-start.mhtml` | `ExamDetailPage`, `StartPanel` | "Start test", Review link, login prompt, Full screen. |

## 3. Attempt Runner — L&R

| Route / State | Reference (Desktop) | Reference (Mobile) | Target Component / Module | Parity Notes |
|---|---|---|---|---|
| Listening directions | `D 05-exam-lr-active-part1.mhtml` | — | `DirectionsPanel`, `AudioPlayer` | Bilingual directions. |
| Part 1 directions | `D 06-exam-lr-part1-directions.mhtml` | — | `PartDirections` | |
| Part 1 Q1 | `D 07-exam-lr-part1-question1.mhtml` | `M 03-exam-lr-q1.mhtml` | `RunnerLayout`, `QuestionView`, `AudioPlayer`, `OptionList` | Mobile sticky controls/safe area. Debounced autosave. |
| Question palette | `D 08-exam-lr-question-palette.mhtml` | — | `QuestionPalette`, `StatusIndicators` | Answered/Review markers; click-to-jump. |
| Reading Part 5 Q101 | `D 09-exam-lr-reading-part5-question101.mhtml` | — | `ReadingView`, `SplitLayout` | "Sang Reading" skip, section timer, Nộp bài. |
| Reading bilingual | `D 10-exam-lr-reading-bilingual-marked.mhtml` `DRIFT` | — | `BilingualToggle` | Current site opens an empty fullscreen dialog for Song ngữ (site defect); survey's inline-bilingual state not reproducible. Preserved as live-drift per INJ-001. |
| Reading annotation tools | `D 11-exam-lr-annotation-tools.mhtml` `DRIFT` | — | `AnnotationToolbar`, `SplitLayout` | Current site opens an empty dialog for Công cụ (site defect). Preserved as live-drift per INJ-001. |
| Reading Part 6 Q131 | `D 12-exam-lr-reading-part6-question131.mhtml` | — | `ReadingView`, `PassageLayout` | Palette jump; passage + question split. |
| Reading Part 7 Q147 | `D 13-exam-lr-reading-part7-question147.mhtml` | — | `ReadingView`, `PassageLayout` | |

## 4. L&R Submit & Result

| Route / State | Reference | Target Component / Module | Parity Notes |
|---|---|---|---|
| Submit confirm | `D 14-exam-lr-submit-confirm.mhtml` `HIST-EXC` | — | Non-reproducible: no confirm dialog exists (survey README confirms submit goes straight to result). Direct-result is canonical behavior per INJ-001. |
| Result certificate | `D 15-exam-lr-result-certificate.mhtml` | — | `ResultCertificate`, `ScoreTable` | 0-score anonymous submit (same process as survey). |
| Result table | `D 16-exam-lr-result-table.mhtml` | — | `ScoreTableModal` | Per-question answer table modal. |
| Error map | `D 17-exam-lr-error-map.mhtml` | — | `ErrorMap`, `PartMetrics` | |
| Review detail | `D 18-exam-lr-review-detail.mhtml` | — | `ProtectedReviewView`, `QuestionReview` | Protected content; authorized fetch only. |

## 5. Attempt Runner — S&W (Speaking)

| Route / State | Reference | Target Component / Module | Parity Notes |
|---|---|---|---|
| `/speaking-writing/:slug` Start | `D 20-exam-sw-detail-start.mhtml` | — | `ExamDetailPage`, `StartPanel` |
| RECORD TEST (mic test) | `D 21-exam-sw-speaking-part1-intro.mhtml` | — | `MicTest`, `MediaPermissionGate` | Capture used `--use-fake-device-for-media-stream`. Handle permission/device/codec failures in target. |
| Speaking directions | `D 22-exam-sw-speaking-directions.mhtml` | — | `DirectionsPanel` | |
| Speaking Q1 preparation | `D 23-exam-sw-speaking-q1-preparation.mhtml` | — | `PrepTimer`, `PromptView` | 45s preparation. |
| Speaking Q3 describe picture | `D 24-exam-sw-speaking-q3-describe-picture.mhtml` | — | `PicturePrompt`, `Recorder` | |
| Speaking Q5 respond | `D 25-exam-sw-speaking-q5-respond.mhtml` | — | `SituationPrompt`, `Recorder` | |
| Speaking Q8 information | `D 26-exam-sw-speaking-q8-information.mhtml` | — | `InformationPrompt`, `Recorder` | |

## 6. Attempt Runner — S&W (Writing)

| Route / State | Reference (Desktop) | Reference (Mobile) | Target Component / Module | Parity Notes |
|---|---|---|---|---|
| `/writing/:slug` directions | `D 27-exam-sw-writing-start.mhtml` | — | `WritingDirections` | |
| Writing Q1 picture | `D 28-exam-sw-writing-q1-picture.mhtml` | `M 04-exam-sw-writing-q1.mhtml` | `QuillEditor`, `WordCount`, `PromptImage` | DOMPurify, autosave, keyboard safe area. |
| Writing Q6 email | `D 29-exam-sw-writing-q6-email.mhtml` | — | `EmailPrompt`, `QuillEditor` | |
| Writing Q8 essay | `D 30-exam-sw-writing-q8-essay.mhtml` | — | `EssayPrompt`, `QuillEditor` | |

## 7. AI Grading

| Route / State | Reference | Target Component / Module | Parity Notes |
|---|---|---|---|
| AI feedback no-data | `D 31-exam-sw-ai-processing.mhtml` | — | `GradingStatusPoller`, `ResultEmptyState` | Route `/ai-processing` now redirects to `/ai-feedback?type=sw`; anonymous shows no-data state (survey: anonymous grading 401 at 5%). Do not reproduce anonymous grading failure. |

## BLOCKED → Reclassified per S0 close (INJ-001)

| State | Original Status | New Classification | Reason |
|---|---|---|---|
| `10-exam-lr-reading-bilingual-marked` | blocked | **live-drift** | Reading "Song ngữ" opens empty fullscreen dialog (site defect); inline bilingual reference state not reproducible. |
| `11-exam-lr-annotation-tools` | blocked | **live-drift** | Reading "Công cụ" opens empty fullscreen dialog (site defect); annotation toolbar reference state not reproducible. |
| `14-exam-lr-submit-confirm` | blocked | **historical-exception** | Non-reproducible: no submit-confirm dialog exists (survey README: submit goes straight to result). Direct-result is the canonical behavior. |

Authenticated result/history states are outside S0 public capture scope (plan:
owner-provided signed-in session required; no credentials may be stored).
