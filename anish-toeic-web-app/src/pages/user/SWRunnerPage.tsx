/**
 * SWRunnerPage — real S&W runner wired to the full-feature sw module:
 * swStore (attempt lifecycle, mic, prep/record timers, presigned upload +
 * retry, writing autosave with clientRevision), MicrophoneSetup, SpeakingView
 * and WritingView (Quill + DOMPurify + word count + autosave/restore).
 *
 * Covers AC14 (mic + speaking timers/recording), AC15 (bounded upload
 * lifecycle, presign, no base64) and AC16 (writing sanitize/count/restore).
 */
import { useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { useSWStore } from '../../modules/mock-exam/runner/sw/swStore';
import { MicrophoneSetup } from '../../modules/mock-exam/runner/sw/MicrophoneSetup';
import { SpeakingView } from '../../modules/mock-exam/runner/sw/SpeakingView';
import { WritingView } from '../../modules/mock-exam/runner/sw/WritingView';

export default function SWRunnerPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const questions = useSWStore((s) => s.questions);
  const phase = useSWStore((s) => s.phase);
  const loading = useSWStore((s) => s.loading);
  const error = useSWStore((s) => s.error);
  const submitting = useSWStore((s) => s.submitting);
  const submitted = useSWStore((s) => s.submitted);
  const currentQuestionIndex = useSWStore((s) => s.currentQuestionIndex);
  const loadAttempt = useSWStore((s) => s.loadAttempt);
  const nextQuestion = useSWStore((s) => s.nextQuestion);
  const prevQuestion = useSWStore((s) => s.prevQuestion);
  const setPhase = useSWStore((s) => s.setPhase);
  const submit = useSWStore((s) => s.submit);
  const reset = useSWStore((s) => s.reset);

  // Load attempt once.
  useEffect(() => {
    if (attemptId) void loadAttempt(attemptId);
  }, [attemptId, loadAttempt]);

  // Flush pending autosaves when the tab is hidden/closed; reset store on exit.
  useEffect(() => {
    const flush = () => {
      void useSWStore.getState().flushAllAutosaves();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      reset();
    };
  }, [reset]);

  // Submission done → processing page (AC6).
  useEffect(() => {
    if (submitted && attemptId) {
      navigate(`/thi-thu/dang-xu-ly/${attemptId}`, { replace: true });
    }
  }, [submitted, attemptId, navigate]);

  const current = questions[currentQuestionIndex];
  const isLast = currentQuestionIndex === questions.length - 1;
  const isFirst = currentQuestionIndex === 0;

  const handleNext = useCallback(() => {
    nextQuestion();
  }, [nextQuestion]);

  const handlePrev = useCallback(() => {
    prevQuestion();
  }, [prevQuestion]);

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    try {
      // Ensure no dirty writing text is left behind.
      await useSWStore.getState().flushAllAutosaves();
      await submit();
    } catch {
      // error surfaced via store.error; keep user on the runner to retry.
    }
  }, [submit, submitting, submitted]);

  // ── loading / error ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="font-medium">Đang tải bài thi...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-4 p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <p className="text-slate-700 font-medium">Không thể tải bài thi.</p>
        <p className="text-slate-500 text-sm max-w-md">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => attemptId && void loadAttempt(attemptId)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Thử lại
          </button>
          <Link
            to="/thi-thu"
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100"
          >
            Về danh sách đề
          </Link>
        </div>
      </div>
    );
  }

  const skillLabel = current?.skill === 'speaking' ? 'SPEAKING' : 'WRITING';
  const isWritingPhase = phase === 'writing';

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* TOP BAR */}
      <header
        className="h-[60px] px-4 flex items-center justify-between shrink-0 shadow-md relative z-10"
        style={{
          background:
            'linear-gradient(90deg, rgb(29, 78, 216) 0%, rgb(37, 99, 235) 50%, rgb(59, 130, 246) 100%)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/thi-thu"
            className="text-white/90 hover:text-white text-sm font-medium flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Danh sách đề
          </Link>
          <span className="hidden sm:block text-white/90 text-sm font-semibold truncate ml-2">
            Speaking &amp; Writing
          </span>
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 hidden md:flex flex-col items-center leading-none">
          <span className="text-white font-bold text-[13px]">{skillLabel}</span>
          {current && (
            <span className="text-white/80 text-[10px]">
              Question {current.questionNumber} of {questions.length}
            </span>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || submitted}
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2 font-bold transition-colors shadow-sm disabled:opacity-60"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Đang nộp...' : 'NỘP BÀI'}
        </button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex items-start justify-center py-8 px-4">
          {phase === 'mic_check' && <MicrophoneSetup />}

          {phase === 'directions' && (
            <div className="w-full max-w-3xl bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center">
              <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-slate-900 mb-4">DIRECTIONS</h1>
              <p className="text-lg text-slate-700 leading-relaxed">
                Bài thi Speaking &amp; Writing gồm các câu hỏi Speaking (ghi âm câu trả lời)
                và Writing (soạn câu trả lời). Bạn sẽ có thời gian chuẩn bị và ghi âm cho
                từng câu Speaking, và câu trả lời Writing được tự động lưu khi bạn gõ.
              </p>
              <div className="text-center mt-10">
                <button
                  onClick={() => setPhase('speaking_prep')}
                  className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors"
                >
                  BẮT ĐẦU
                </button>
              </div>
            </div>
          )}

          {current && phase !== 'writing' && phase !== 'mic_check' && phase !== 'directions' && (
            <SpeakingView key={current.id} question={current} />
          )}

          {phase === 'writing' && current && (
            <WritingView key={current.id} question={current} />
          )}
        </div>
      </main>

      {/* BOTTOM BAR */}
      <footer
        className="h-[60px] flex items-center justify-between shrink-0 px-4 relative z-20"
        style={{ background: 'linear-gradient(90deg, rgb(30, 64, 175) 0%, rgb(30, 58, 138) 100%)' }}
      >
        <button
          onClick={handlePrev}
          disabled={isFirst || submitting}
          className="flex items-center gap-1 text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
        >
          <ChevronLeft className="w-5 h-5" /> Câu trước
        </button>

        <div className="text-white/80 text-sm font-medium">
          {current && !isWritingPhase ? (
            <span>
              {current.questionNumber}/{questions.length}
            </span>
          ) : (
            <span className="hidden sm:inline">Tự động lưu mọi thay đổi</span>
          )}
        </div>

        <button
          onClick={handleNext}
          disabled={isLast || submitting}
          className="flex items-center gap-1 text-white bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
        >
          Câu tiếp <ChevronRight className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
}
