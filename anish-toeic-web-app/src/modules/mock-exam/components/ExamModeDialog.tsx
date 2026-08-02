import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { X, FileText, ListChecks, Play, Clock } from 'lucide-react';
import { useCreateAttempt } from '../catalogApi';
import { Exam, ExamMode } from '../../../types/exam';

interface ExamModeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam | null;
  defaultMode?: ExamMode;
}

const ExamModeDialog = ({ isOpen, onClose, exam, defaultMode = 'exam' }: ExamModeDialogProps) => {
  const [mode, setMode] = useState<ExamMode>(defaultMode);
  const navigate = useNavigate();
  const createAttempt = useCreateAttempt();

  useEffect(() => {
    if (isOpen) setMode(defaultMode);
  }, [isOpen, defaultMode, exam?.id]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !exam) return null;

  const handleStart = async () => {
    try {
      const { attemptId } = await createAttempt.mutateAsync({ examId: exam.id, mode });
      if (exam.skill_type === 'SW') {
        navigate(`/thi-thu/${exam.slug}/lam-bai-sw/${attemptId}`);
      } else {
        navigate(`/thi-thu/${exam.slug}/lam-bai/${attemptId}`);
      }
    } catch (error) {
      // INJ-003: session is cookie-based; a 401 means the visitor isn't signed
      // in — redirect to login preserving the exam/mode intent (AC9).
      const status =
        typeof error === 'object' && error !== null
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 401) {
        const tabParam = exam.skill_type === 'SW' ? '&tab=sw' : '';
        const returnUrl = encodeURIComponent(`/thi-thu?exam=${exam.id}&mode=${mode}${tabParam}`);
        navigate(`/dang-nhap?returnUrl=${returnUrl}`);
        return;
      }
      console.error('Failed to create attempt:', error);
      alert('Có lỗi xảy ra khi bắt đầu bài thi. Vui lòng thử lại!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80 transition-opacity" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={exam.title}
        className="relative z-50 grid w-full bg-background shadow-lg duration-200 sm:rounded-lg max-w-md p-0 overflow-hidden border-0 text-white gap-0"
        style={{ background: 'linear-gradient(135deg, rgb(30, 64, 175) 0%, rgb(67, 56, 202) 60%, rgb(109, 40, 217) 100%)' }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <h2 className="text-white text-xl font-extrabold tracking-wide truncate">{exam.title}</h2>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4">
          <div className="grid grid-cols-2 rounded-2xl bg-white/95 p-1.5 gap-1 shadow-lg">
            <button
              onClick={() => setMode('exam')}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all"
              style={
                mode === 'exam'
                  ? { background: 'rgb(255, 255, 255)', color: 'rgb(255, 122, 26)', boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px', border: '1.5px solid rgb(255, 122, 26)' }
                  : { background: 'transparent', color: 'rgb(100, 116, 139)', boxShadow: 'none', border: '1.5px solid transparent' }
              }
            >
              <FileText className="w-4 h-4" />
              Thi thử
            </button>
            <button
              onClick={() => setMode('practice')}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all"
              style={
                mode === 'practice'
                  ? { background: 'rgb(255, 255, 255)', color: 'rgb(255, 122, 26)', boxShadow: 'rgba(0, 0, 0, 0.06) 0px 2px 8px', border: '1.5px solid rgb(255, 122, 26)' }
                  : { background: 'transparent', color: 'rgb(100, 116, 139)', boxShadow: 'none', border: '1.5px solid transparent' }
              }
            >
              <ListChecks className="w-4 h-4" />
              Luyện tập
            </button>
          </div>
        </div>

        <div className="px-4 pb-5 pt-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="rounded-2xl bg-white p-4 shadow-lg text-slate-900">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgb(238, 242, 255)' }}>
                {mode === 'exam' ? <FileText className="w-6 h-6 text-indigo-600" /> : <ListChecks className="w-6 h-6 text-indigo-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-slate-900 text-[15px] leading-tight">
                  {mode === 'exam' ? `Đề thi đầy đủ ${exam.question_count} câu` : 'Luyện tập từng phần'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mode === 'exam'
                    ? `Mô phỏng bài thi hoàn chỉnh trong ${exam.duration_minutes} phút`
                    : 'Luyện tập không áp lực thời gian, có thể xem đáp án'}
                </p>
              </div>
              <button
                onClick={handleStart}
                disabled={createAttempt.isPending}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 py-2 rounded-xl px-4 h-10 font-bold text-white shrink-0 hover:opacity-90"
                style={{ background: 'rgb(255, 122, 26)' }}
              >
                <Play className="w-4 h-4 mr-1 fill-white" />
                Bắt đầu
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                <Clock className="w-3.5 h-3.5" /> Thời gian: {exam.duration_minutes} phút
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                <ListChecks className="w-3.5 h-3.5" /> Tổng: {exam.question_count} câu
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamModeDialog;
