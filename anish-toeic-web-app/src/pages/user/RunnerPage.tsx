import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Spin, message } from 'antd';
import { 
  ArrowLeft, 
  Clock, 
  Menu,
  Maximize,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { useExamStore } from '../../stores/examStore';
import { Section, Option } from '../../types/exam';
import { QuestionPaletteDrawer } from './QuestionPaletteDrawer';

const RunnerPage = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  
  const {
    attempt,
    questions,
    options,
    sections,
    responses,
    currentQuestionIndex,
    isLoading,
    isSubmitting,
    fetchAttempt,
    updateResponse,
    setCurrentQuestionIndex,
    submitAttempt
  } = useExamStore();

  const [timeLeft, setTimeLeft] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (attemptId) {
      fetchAttempt(attemptId);
    }
  }, [attemptId, fetchAttempt]);

  useEffect(() => {
    if (attempt?.started_at && attempt?.session?.sections) {
      const durationMs = 120 * 60 * 1000; 
      const start = new Date(attempt.started_at).getTime();
      const end = start + durationMs;
      
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const diff = Math.max(0, Math.floor((end - now) / 1000));
        setTimeLeft(diff);
        if (diff === 0) {
          clearInterval(interval);
          handleSubmit();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const handleSubmit = async () => {
    if (!attemptId) return;
    try {
      await submitAttempt(attemptId);
      message.success('Đã nộp bài thành công!');
      navigate(`/thi-thu/ket-qua/${attemptId}`);
    } catch (err) {
      message.error('Có lỗi xảy ra khi nộp bài');
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading || !attempt) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Spin size="large" tip="Đang tải đề thi..." />
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentOptions = options[currentQuestion?.id] || [];
  const currentSection = sections.find((s: Section) => s.id === currentQuestion?.section_id);
  const currentResponse = responses[currentQuestion?.id];

  const handleOptionChange = (optionId: string) => {
    if (attemptId && currentQuestion) {
      updateResponse(attemptId, currentQuestion.id, optionId);
      // Auto move to next question if it's not the last one, after a short delay
      // Actually we let them click NEXT.
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans">
      {/* TOP BAR */}
      <header 
        className="h-[60px] px-4 flex items-center justify-between shrink-0 shadow-md relative z-10"
        style={{ background: 'linear-gradient(90deg, rgb(29, 78, 216) 0%, rgb(37, 99, 235) 50%, rgb(59, 130, 246) 100%)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/thi-thu" className="text-white/90 hover:text-white text-sm font-medium flex items-center gap-1 shrink-0">
            <ArrowLeft className="w-4 h-4" /> Danh sách đề
          </Link>
          <div className="text-white font-extrabold text-lg tracking-tight truncate ml-4 hidden sm:block">
            Xoá<span className="text-white">Mù</span><span className="text-orange-400">TOEIC</span>
          </div>
        </div>

        {/* Center Timer Pill */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
          <div className="bg-white rounded-full px-4 py-1.5 flex items-center gap-2 shadow-sm border border-slate-200">
            <Clock className="w-5 h-5 text-slate-700" />
            <span className="text-slate-800 font-bold text-lg leading-none font-mono tracking-wider">
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2 font-bold transition-colors shadow-sm flex items-center gap-2"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spin size="small" /> : 'NỘP BÀI'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        {/* Instructions Bar */}
        {currentSection?.instructions && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 text-slate-700 font-medium text-[14px] shadow-sm z-0">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentSection.instructions) }} />
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Pane for Media/Passage */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white border-r border-slate-200 flex flex-col items-center">
            {currentQuestion?.audio_url && (
              <div className="w-full max-w-2xl bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex justify-center sticky top-0 z-10">
                <audio controls src={currentQuestion.audio_url} className="w-full">
                  Trình duyệt của bạn không hỗ trợ thẻ audio.
                </audio>
              </div>
            )}
            
            {currentQuestion?.image_url && (
              <div className="w-full max-w-2xl bg-white p-2 rounded-xl mb-6">
                <img src={currentQuestion.image_url} alt="Question media" className="w-full h-auto object-contain rounded-lg shadow-sm border border-slate-100" />
              </div>
            )}

            {currentQuestion?.content && !currentQuestion?.content.match(/^[\s\n]*$/) && (
              <div 
                className="w-full max-w-3xl prose prose-lg prose-slate"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentQuestion.content) }}
              />
            )}
            
            {/* If there's no media and no passage, it's a standalone question (like part 2) or part 5 */}
            {!currentQuestion?.image_url && !currentQuestion?.audio_url && !currentQuestion?.content?.trim() && (
              <div className="flex items-center justify-center h-full text-slate-400 font-medium italic">
                (Hãy nghe audio để trả lời câu hỏi)
              </div>
            )}
          </div>

          {/* Right Pane for Question Options */}
          <div className="w-full md:w-[500px] bg-slate-50 overflow-y-auto">
            <div className="p-6 md:p-8">
              <div className="flex items-start mb-6">
                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mr-4 shadow-sm">
                  {currentQuestion?.displayNumber}
                </div>
                <div className="flex-1">
                  <div className="flex flex-col gap-3">
                    {currentOptions.map((opt: Option) => {
                      const isSelected = currentResponse?.selected_option_id === opt.id;
                      return (
                        <div 
                          key={opt.id} 
                          onClick={() => handleOptionChange(opt.id)}
                          className={`flex items-center p-3 rounded-xl cursor-pointer border-2 transition-all ${
                            isSelected 
                              ? 'border-blue-600 bg-blue-50/50 shadow-sm' 
                              : 'border-transparent bg-white hover:border-blue-200 hover:bg-slate-50 shadow-sm'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mr-3 text-xs font-bold transition-colors ${
                            isSelected 
                              ? 'border-blue-600 bg-blue-600 text-white' 
                              : 'border-slate-300 text-slate-500'
                          }`}>
                            {opt.label}
                          </div>
                          <div 
                            className={`text-[15px] ${isSelected ? 'text-blue-900 font-medium' : 'text-slate-700'}`}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(opt.content) }} 
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* BOTTOM BAR */}
      <footer 
        className="h-[60px] flex items-center justify-between shrink-0 px-4 relative z-20"
        style={{ background: 'linear-gradient(90deg, rgb(30, 64, 175) 0%, rgb(30, 58, 138) 100%)' }}
      >
        <div className="flex items-center gap-3">
          <button 
            className="flex items-center gap-2 text-white/90 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                setIsFullscreen(true);
              } else {
                document.exitFullscreen();
                setIsFullscreen(false);
              }
            }}
          >
            <Maximize className="w-4 h-4" /> {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            className="flex items-center gap-2 text-white/90 hover:text-white bg-white/10 hover:bg-white/20 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="w-5 h-5" /> Bảng câu hỏi
          </button>
          
          <button 
            className="flex items-center gap-1 text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
            onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="w-5 h-5" /> PREV
          </button>

          <button 
            className="flex items-center gap-1 text-white bg-orange-500 hover:bg-orange-600 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
            onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
            disabled={currentQuestionIndex === questions.length - 1}
          >
            NEXT <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </footer>

      {/* Question Palette Drawer */}
      <QuestionPaletteDrawer 
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        questions={questions}
        sections={sections}
        responses={responses}
        currentQuestionIndex={currentQuestionIndex}
        onSelectQuestion={(idx) => {
          setCurrentQuestionIndex(idx);
        }}
      />
    </div>
  );
};

export default RunnerPage;
