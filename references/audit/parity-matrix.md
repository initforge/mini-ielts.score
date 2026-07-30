# Parity Matrix: Anish TOEIC `/thi-thu` vs XoaMu Reference

## 1. Catalog & Auth
| Route / State | Reference File (Desktop) | Target Component / Module | Parity Notes |
|---|---|---|---|
| `/thi-thu` (S&W Tab) | `01-exams-sw-list-full.png` | `CatalogList`, `ExamCard`, `FilterTabs` | Match XoaMu layout but apply Anish brand tokens. Handle loading/empty/error states. |
| `/thi-thu` (L&R Tab) | `02-exams-lr-list-full.png` | `CatalogList`, `ExamCard` | Search, filter, and pagination or load-more required. |
| Auth Gate | `anishtoeic/.../01-thi-thu-auth-gate.png` | `AuthRedirect`, `AnishGlobalNav` | Unauthenticated attempt creation redirects here, preserving `returnUrl`. |

## 2. Pre-exam
| Route / State | Reference File (Desktop) | Target Component / Module | Parity Notes |
|---|---|---|---|
| `/thi-thu/:examSlug` | `03-exam-start-mode-modal.png` | `ExamInstructions`, `ModeSelectionModal` | Must support "Exam" and "Practice" capabilities provided by the server. |

## 3. Attempt Runner (L&R)
| Route / State | Reference File (Desktop/Mobile) | Target Component / Module | Parity Notes |
|---|---|---|---|
| Active Question (Part 1) | `07-exam-lr-part1-question1.png` / `mobile/03-exam-lr-q1.png` | `RunnerLayout`, `QuestionView`, `AudioPlayer` | Mobile requires sticky controls and safe-area adjustments. Debounced autosave. |
| Question Palette | `08-exam-lr-question-palette.png` | `QuestionPalette`, `StatusIndicators` | Answered/Review indicators must update seamlessly. |
| Reading & Tools | `11-exam-lr-annotation-tools.png` | `AnnotationToolbar`, `SplitLayout` | Bilingual toggle, notes, and highlighter. |

## 4. Attempt Runner (S&W)
| Route / State | Reference File (Desktop/Mobile) | Target Component / Module | Parity Notes |
|---|---|---|---|
| Speaking Preparation | `23-exam-sw-speaking-q1-preparation.png` | `SpeakingRecorder`, `TimerControl` | Mic test required prior to start. Handle permission denials and empty audio. |
| Writing Active | `28-exam-sw-writing-q1-picture.png` / `mobile/04-exam-sw-writing-q1.png` | `WritingEditor` (Quill), `WordCount` | Mobile must handle virtual keyboard safely. Autosave and DOMPurify required. |

## 5. Processing & Results
| Route / State | Reference File (Desktop) | Target Component / Module | Parity Notes |
|---|---|---|---|
| Grading Progress (`/dang-xu-ly`) | `31-exam-sw-ai-processing.png` (Failed ref) | `GradingStatusPoller`, `RetryAction` | Expose queued/processing/success/failed states. Allow retry for failures. |
| Result (`/ket-qua`) | `15-exam-lr-result-certificate.png` | `ResultCertificate`, `ScoreTable` | L&R scored instantly. S&W shown upon completion. |
| Error Map (`/chi-tiet`) | `17-exam-lr-error-map.png` | `ErrorMap`, `PartMetrics` | |
| Review Detail (`/chi-tiet`) | `18-exam-lr-review-detail.png` | `ProtectedReviewView`, `QuestionReview` | Cannot expose sample responses/rubrics in initial exam payload; requires authorized fetch. |
