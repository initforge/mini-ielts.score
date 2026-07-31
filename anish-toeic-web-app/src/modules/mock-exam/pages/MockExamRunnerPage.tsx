import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal, Spin, message } from 'antd';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Clock,
  Menu,
  Maximize,
  ChevronRight,
  ChevronLeft,
  Flag,
  PenLine,
  Languages,
  WifiOff,
  UploadCloud,
} from 'lucide-react';
import { useAttemptStore } from '../store/attemptStore';
import { formatTime, isReadingSection, currentSkillLabel } from '../runner/core/format';
import { DirectionsPanel } from '../runner/lr/DirectionsPanel';
import { ListeningView } from '../runner/lr/ListeningView';
import { PartFiveView } from '../runner/lr/PartFiveView';
import { PassageView } from '../runner/lr/PassageView';
import { QuestionPalette } from '../runner/lr/QuestionPalette';

const LISTENING_INTRO_HTML = [
  '<p>In the Listening test, you will be asked to demonstrate how well you understand spoken English. The entire Listening test will last approximately 45 minutes. There are four parts, and directions are given for each part. You must mark your answers on the separate answer sheet. Do not write your answers in your test book.</p>',
  '<p class="text-blue-700">Trong bài thi Nghe, bạn sẽ thể hiện khả năng hiểu tiếng Anh nói. Toàn bộ bài thi Nghe kéo dài khoảng 45 phút, gồm 4 phần và mỗi phần có hướng dẫn riêng. Hãy đánh dấu đáp án vào phiếu trả lời, không ghi vào đề.</p>',
].join('');

export function MockExamRunnerPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const store = useAttemptStore();
  const [showIntro, setShowIntro] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load attempt + network listeners + flush on unload (AC11).
  useEffect(() => {
    if (!attemptId) return;
    void store.loadAttempt(attemptId);
    const handleOnline = () => {
      store.setOnline(true);
      void store.flushOfflineQueue();
    };
    const handleOffline = () => store.setOnline(false);
    const flush = () => {
      void store.flushAutosaves();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      store.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // Countdown ticker.
  const deadline = useAttemptStore((s) => s.deadline);
  const tick = useAttemptStore((s) => s.tick);
  useEffect(() => {
    if (deadline === null) return;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline, tick]);

  const expired = deadline !== null && store.remainingSeconds <= 0;

  const doSubmit = async () => {
    if (!attemptId) return;
    try {
      const result = await store.submit();
      if (result === null) return; // another submit is in flight; it navigates
      navigate(`/thi-thu/ket-qua/${attemptId}`);
    } catch {
      message.error('Có lỗi khi nộp bài. Vui lòng thử lại.');
    }
  };

  // Auto-submit on expiry (AC11 expiry + AC12 exam controls).
  useEffect(() => {
    if (!expired || store.stage !== 'ready' || store.submitted || store.isSubmitting) return;
    void doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, store.stage, store.submitted, store.isSubmitting]);

  // A completed/submitted attempt cannot be resumed inside the runner.
  useEffect(() => {
    if (store.attempt && store.attempt.status !== 'IN_PROGRESS' && attemptId) {
      navigate(`/thi-thu/ket-qua/${attemptId}`, { replace: true });
    }
  }, [store.attempt, attemptId, navigate]);

  // Open the section directions once per listening part (skipped while the
  // exam intro panel is still on screen; practice mode has no intro panel).
  useEffect(() => {
    if (store.stage !== 'ready') return;
    const isPractice =
      (store.attempt as unknown as { mode?: string } | null)?.mode === 'PRACTICE';
    if (showIntro && !isPractice && !store.resumed) return;
    store.maybeShowDirections(store.currentQuestionIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.stage, showIntro, store.attempt, store.currentQuestionIndex]);

  const handleSubmit = (auto: boolean) => {
    if (store.submitted) {
      if (attemptId) navigate(`/thi-thu/ket-qua/${attemptId}`);
      return;
    }
    if (!auto) {
      const unanswered = store.questions.filter((q) => {
        const draft = store.responses[q.id];
        return draft === undefined || draft.selected_option_id === null;
      }).length;
      Modal.confirm({
        title: 'Nộp bài?',
        content:
          unanswered > 0
            ? `Bạn còn ${unanswered} câu chưa trả lời. Nộp bài ngay?`
            : 'Bạn đã trả lời tất cả câu hỏi. Nộp bài ngay?',
        okText: 'Nộp bài',
        cancelText: 'Tiếp tục làm bài',
        onOk: () => doSubmit(),
      });
      return;
    }
    void doSubmit();
  };

  const handleSkipToReading = () => {
    Modal.confirm({
      title: 'Sang phần Reading?',
      content:
        'Bạn có thể quay lại phần Listening bất cứ lúc nào qua bảng câu hỏi. Tiếp tục sang Reading?',
      okText: 'Sang Reading',
      cancelText: 'Hủy',
      onOk: () => store.skipToReading(),
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleVolumeChange = (value: number) => {
    document.querySelectorAll('audio').forEach((audio) => {
      (audio as HTMLAudioElement).volume = value;
    });
  };

  if (store.stage === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Spin size="large" tip="Đang tải đề thi..." />
      </div>
    );
  }

  if (store.stage === 'error') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-4 p-6 text-center">
        <p className="text-slate-700 font-medium">Không thể tải bài thi.</p>
        <p className="text-slate-500 text-sm max-w-md">
          {store.error ?? 'Vui lòng kiểm tra kết nối mạng.'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => attemptId && void store.loadAttempt(attemptId)}
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

  const currentQuestion = store.questions[store.currentQuestionIndex];
  const currentSection = currentQuestion
    ? store.sections.find((s) => s.id === currentQuestion.section_id)
    : undefined;
  const isReading = currentSection ? isReadingSection(currentSection) : false;
  const practiceMode = (store.attempt as unknown as { mode?: string } | null)?.mode === 'PRACTICE';

  const sectionQuestions = currentSection
    ? store.questions.filter((q) => q.section_id === currentSection.id)
    : [];
  const readingHasPassage =
    isReading &&
    ((currentSection?.instructions?.trim().length ?? 0) > 20 ||
      sectionQuestions.some((q) => (store.options[q.id]?.length ?? 0) === 0));
  const hasReading = store.sections.some(isReadingSection);
  const reviewCount = store.questions.filter((q) => store.responses[q.id]?.marked_for_review === true).length;
  const currentMarked = currentQuestion ? store.responses[currentQuestion.id]?.marked_for_review === true : false;
  const sectionFirstLast =
    sectionQuestions.length > 0
      ? `${sectionQuestions[0].displayNumber}-${sectionQuestions[sectionQuestions.length - 1].displayNumber}`
      : '';
  const counterLabel = isReading && sectionQuestions.length > 1
    ? `Questions ${sectionFirstLast} of ${store.questions.length}`
    : `Question ${currentQuestion?.displayNumber ?? 1} of ${store.questions.length}`;

  const showDirections = store.directionsForSection === currentSection?.id;
  const showIntroPanel = showIntro && !practiceMode && store.stage === 'ready' && !store.resumed;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans">
      {store.stage === 'offline' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-amber-800 text-xs font-medium z-30">
          <WifiOff className="w-3.5 h-3.5" />
          Đang ngoại tuyến — câu trả lời được lưu cục bộ và sẽ đồng bộ khi có mạng.
        </div>
      )}
      {store.pendingCount > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center gap-2 text-blue-800 text-xs font-medium z-30">
          <UploadCloud className="w-3.5 h-3.5" />
          Đang chờ đồng bộ {store.pendingCount} thay đổi...
        </div>
      )}

      {/* TOP BAR */}
      <header
        className="h-[60px] px-4 flex items-center justify-between shrink-0 shadow-md relative z-10"
        style={{
          background:
            'linear-gradient(90deg, rgb(29, 78, 216) 0%, rgb(37, 99, 235) 50%, rgb(59, 130, 246) 100%)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/thi-thu"
            className="text-white/90 hover:text-white text-sm font-medium flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Danh sách đề
          </Link>
          <div className="text-white font-extrabold text-lg tracking-tight truncate ml-4 hidden sm:block">
            Xoá<span className="text-white">Mù</span>
            <span className="text-orange-400">TOEIC</span>
          </div>
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-3">
          <div className="hidden md:flex flex-col items-center leading-none">
            <span className="text-white font-bold text-[13px]">{currentSkillLabel(currentSection)}</span>
            <span className="text-white/80 text-[10px]">{counterLabel}</span>
          </div>
          <div className="bg-white rounded-full px-4 py-1.5 flex items-center gap-2 shadow-sm border border-slate-200">
            <Clock className="w-5 h-5 text-slate-700" />
            {store.deadline === null ? (
              <span className="text-slate-800 font-bold text-lg leading-none">Luyện tập</span>
            ) : (
              <span className="text-slate-800 font-bold text-lg leading-none font-mono tracking-wider">
                {formatTime(store.remainingSeconds)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isReading && !showDirections && !showIntroPanel && (
            <div className="hidden md:flex items-center gap-1.5 text-white/90" title="Âm lượng">
              <span className="text-[10px] uppercase tracking-wide font-semibold">Âm lượng</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={0.7}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 accent-white"
                aria-label="Âm lượng"
              />
            </div>
          )}
          {isReading && !showDirections && !showIntroPanel && (
            <button
              onClick={() => store.setAnnotationOpen(!store.annotationOpen)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                store.annotationOpen ? 'bg-white text-blue-700' : 'text-white bg-white/15 hover:bg-white/25'
              }`}
              title="Công cụ chú thích"
            >
              <PenLine className="w-4 h-4" /> Công cụ
            </button>
          )}
          <button
            onClick={() => store.setBilingual(!store.bilingualOn)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              store.bilingualOn ? 'bg-white text-blue-700' : 'text-white bg-white/15 hover:bg-white/25'
            }`}
          >
            <Languages className="w-4 h-4" /> {store.bilingualOn ? 'Ẩn song ngữ' : 'Song ngữ'}
          </button>

          {!isReading && !showDirections && !showIntroPanel && (
            <button
              onClick={handleSkipToReading}
              className="text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
            >
              Sang Reading →
            </button>
          )}
          {isReading && !showDirections && !showIntroPanel && (
            <button
              onClick={() => handleSubmit(false)}
              disabled={store.isSubmitting}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2 font-bold transition-colors shadow-sm disabled:opacity-60"
            >
              {store.isSubmitting ? <Spin size="small" /> : 'NỘP BÀI'}
            </button>
          )}
          {!hasReading && !isReading && (
            <button
              onClick={() => handleSubmit(false)}
              disabled={store.isSubmitting}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2 font-bold transition-colors shadow-sm disabled:opacity-60"
            >
              {store.isSubmitting ? <Spin size="small" /> : 'NỘP BÀI'}
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {showIntroPanel ? (
          <DirectionsPanel
            heading="DIRECTIONS"
            html={LISTENING_INTRO_HTML}
            onNext={() => {
              setShowIntro(false);
              store.maybeShowDirections(store.currentQuestionIndex);
            }}
          />
        ) : showDirections ? (
          <DirectionsPanel
            heading={`PART ${currentSection?.order_index ?? ''} — ${currentSection?.title ?? ''}`.trim()}
            html={currentSection?.instructions ?? ''}
            onNext={() => store.dismissDirections()}
          />
        ) : (
          <>
            {currentSection?.instructions && !readingHasPassage && (
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 text-slate-700 font-medium text-[14px] shadow-sm z-0">
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(currentSection.instructions),
                  }}
                />
              </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-col">
              {isReading && readingHasPassage && currentSection ? (
                <PassageView
                  section={currentSection}
                  sectionQuestions={sectionQuestions}
                  options={store.options}
                  responses={store.responses}
                  currentQuestionIndex={store.currentQuestionIndex}
                  questions={store.questions}
                  bilingual={store.bilingualOn}
                  annotationOpen={store.annotationOpen}
                  annotationKey={store.attemptId ? `${store.attemptId}:${currentSection.id}` : `lr:${currentSection.id}`}
                  onSelect={(qid) =>
                    store.jumpTo(store.questions.findIndex((q) => q.id === qid))
                  }
                />
              ) : isReading && currentQuestion ? (
                <PartFiveView
                  question={currentQuestion}
                  options={store.options[currentQuestion.id] ?? []}
                  selectedOptionId={store.responses[currentQuestion.id]?.selected_option_id ?? null}
                  bilingual={store.bilingualOn}
                  onSelect={(oid) => store.selectOption(currentQuestion.id, oid)}
                />
              ) : currentQuestion ? (
                <ListeningView
                  question={currentQuestion}
                  options={store.options[currentQuestion.id] ?? []}
                  selectedOptionId={store.responses[currentQuestion.id]?.selected_option_id ?? null}
                  bilingual={store.bilingualOn}
                  onSelect={(oid) => store.selectOption(currentQuestion.id, oid)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 italic">
                  Chưa có câu hỏi.
                </div>
              )}
            </div>
          </>
        )}

        {/* Floating palette button */}
        <button
          onClick={() => store.setPaletteOpen(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-blue-600 text-white p-2.5 rounded-l-xl shadow-lg hover:bg-blue-700 transition-colors"
          aria-label="Mở bảng câu hỏi"
          title="Mở bảng câu hỏi"
        >
          <Menu className="w-5 h-5" />
        </button>
      </main>

      {/* BOTTOM BAR */}
      <footer
        className="h-[60px] flex items-center justify-between shrink-0 px-4 relative z-20"
        style={{
          background:
            'linear-gradient(90deg, rgb(30, 64, 175) 0%, rgb(30, 58, 138) 100%)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 text-white/90 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Maximize className="w-4 h-4" />
            <span className="hidden md:inline">{isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
          </button>
          <button
            onClick={() => currentQuestion && store.markCurrentReviewed()}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentMarked
                ? 'bg-amber-400 text-amber-950'
                : 'text-white/90 hover:text-white bg-white/10 hover:bg-white/20'
            }`}
            title="Mark items for review"
          >
            <Flag className="w-4 h-4" />
            <span className="hidden md:inline">Mark items for review</span>
            <span className="md:hidden">Đánh dấu</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => store.jumpToNextReview()}
            disabled={reviewCount === 0}
            className="flex items-center gap-1.5 text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
            title="Nhảy tới câu đã đánh dấu"
          >
            Review
            {reviewCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black flex items-center justify-center">
                {reviewCount}
              </span>
            )}
          </button>
          <button
            onClick={() => store.prevQuestion()}
            disabled={store.currentQuestionIndex === 0}
            className="flex items-center gap-1 text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5" /> Câu trước
          </button>
          <button
            onClick={() => store.nextQuestion()}
            disabled={store.currentQuestionIndex === store.questions.length - 1}
            className="flex items-center gap-1 text-white bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
          >
            Câu tiếp <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </footer>

      {/* Question palette */}
      <QuestionPalette
        open={store.paletteOpen}
        onClose={() => store.setPaletteOpen(false)}
        questions={store.questions}
        sections={store.sections}
        responses={store.responses}
        currentQuestionIndex={store.currentQuestionIndex}
        practiceMode={practiceMode}
        onSelect={store.jumpTo}
      />
    </div>
  );
}

export default MockExamRunnerPage;
