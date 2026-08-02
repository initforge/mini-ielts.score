import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, FileText, Headphones, Mic, Play, History } from 'lucide-react';
import api from '../../api';
import { AnishFooter, AnishHeader } from '../../components/AnishShell';
import ExamModeDialog from '../../modules/mock-exam/components/ExamModeDialog';
import { Exam, ExamMode, Section } from '../../types/exam';

interface ExamDetail extends Exam {
  sections: Section[];
}

interface AttemptRow {
  id: number;
  exam_id: number;
  status: string;
  created_at: string;
}

/** Map an axios error to a numeric status (404/403/...). */
function httpStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  return (err as { response?: { status?: number } }).response?.status ?? null;
}

const ExamDetailPage = () => {
  const { examSlug } = useParams<{ examSlug: string }>();

  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ExamMode>('exam');

  const detailQuery = useQuery<ExamDetail>({
    queryKey: ['toeic-exam-detail', examSlug],
    queryFn: async () => {
      const { data } = await api.get<ExamDetail>(`/toeic-exams/${examSlug}`);
      return data;
    },
    enabled: !!examSlug,
    retry: false,
  });

  const exam = detailQuery.data;

  // Previous attempt for this exam (cookie session auth). Used for the
  // "Review"/"Tiếp tục" link on the detail page (reference desktop/04, 20, 27).
  // 401/403 simply means the visitor isn't signed in — treated as no attempt.
  const attemptsQuery = useQuery<AttemptRow[]>({
    queryKey: ['toeic-attempts', 'for-exam', exam?.id],
    queryFn: async () => {
      const { data } = await api.get<AttemptRow[]>('/toeic-attempts');
      return (data ?? []).filter((a) => a.exam_id === exam?.id);
    },
    enabled: !!exam,
    retry: false,
  });

  const latestAttempt = attemptsQuery.data
    ? [...attemptsQuery.data].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : undefined;
  const attemptsDenied = attemptsQuery.isError;

  const status = detailQuery.isError ? httpStatus(detailQuery.error) : null;

  if (detailQuery.isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <AnishHeader />
        <main className="flex-1 flex items-center justify-center py-24">
          <div className="text-muted-foreground text-sm">Đang tải đề thi...</div>
        </main>
        <AnishFooter />
      </div>
    );
  }

  if (detailQuery.isError || !exam) {
    const notFound = status === 404;
    const forbidden = status === 403;
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <AnishHeader />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
          <div className="text-4xl">{notFound ? '🔍' : '⚠️'}</div>
          <h1 className="text-xl font-bold">
            {notFound ? 'Không tìm thấy đề thi' : forbidden ? 'Không có quyền truy cập' : 'Lỗi tải đề thi'}
          </h1>
          <p className="text-muted-foreground text-sm max-w-md">
            {notFound
              ? 'Đề thi không tồn tại hoặc đã bị gỡ xuống.'
              : forbidden
                ? 'Bạn không có quyền xem đề thi này.'
                : 'Không thể tải đề thi. Vui lòng thử lại sau.'}
          </p>
          <div className="flex gap-3">
            <Link
              to="/thi-thu"
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              <ArrowLeft className="w-4 h-4" /> Về danh sách đề
            </Link>
            <button
              onClick={() => void detailQuery.refetch()}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Thử lại
            </button>
          </div>
        </main>
        <AnishFooter />
      </div>
    );
  }

  const isLR = exam.skill_type === 'LR';
  const sections = exam.sections ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <AnishHeader />

      <main className="flex-1">
        <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/thi-thu"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Danh sách đề
          </Link>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              {/* Header card */}
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        isLR ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isLR ? <Headphones className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {isLR ? 'Listening & Reading' : 'Speaking & Writing'}
                    </span>
                    <h1 className="text-2xl md:text-3xl font-bold mt-3">{exam.title}</h1>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" /> {exam.duration_minutes} phút
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="w-4 h-4" /> {exam.question_count} câu hỏi
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        {isLR ? '7' : '2'} phần thi
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      setDialogMode('exam');
                      setIsModeDialogOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-6 py-2.5 text-sm font-bold hover:bg-primary/90"
                  >
                    <Play className="w-4 h-4" /> Bắt đầu
                  </button>

                  {latestAttempt ? (
                    <Link
                      to={
                        latestAttempt.status === 'COMPLETED'
                          ? `/thi-thu/ket-qua/${latestAttempt.id}`
                          : latestAttempt.status === 'IN_PROGRESS'
                            ? isLR
                              ? `/thi-thu/${exam.slug}/lam-bai/${latestAttempt.id}`
                              : `/thi-thu/${exam.slug}/lam-bai-sw/${latestAttempt.id}`
                            : `/thi-thu/dang-xu-ly/${latestAttempt.id}`
                      }
                      className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
                    >
                      <History className="w-4 h-4" />
                      {latestAttempt.status === 'COMPLETED'
                        ? 'Xem kết quả lần trước'
                        : latestAttempt.status === 'IN_PROGRESS'
                          ? 'Tiếp tục bài làm'
                          : 'Xem trạng thái chấm điểm'}
                    </Link>
                  ) : attemptsDenied ? (
                    <p className="text-xs text-muted-foreground">
                      Bạn hãy{' '}
                      <Link to="/dang-nhap" className="text-primary underline underline-offset-2">
                        đăng nhập
                      </Link>{' '}
                      để lưu lại kết quả và thống kê.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Chưa có kết quả lần thi trước cho đề này.
                    </p>
                  )}
                </div>
              </div>

              {/* Instructions panel */}
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <h2 className="text-lg font-bold mb-4">Hướng dẫn làm bài</h2>
                {sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có hướng dẫn cho đề thi này.</p>
                ) : (
                  <ol className="space-y-4">
                    {sections.map((s) => (
                      <li key={s.id} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {s.order_index}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{s.title ?? `Part ${s.order_index}`}</p>
                          {s.instructions && (
                            <p className="text-sm text-muted-foreground mt-0.5">{s.instructions}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="group relative overflow-hidden rounded-xl p-4 text-white shadow-md cursor-pointer bg-gradient-to-br from-blue-800 to-blue-900">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition-colors">
                    <span className="font-extrabold text-lg leading-none">990</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug text-[15px]">Dự đoán điểm TOEIC</p>
                    <p className="text-[11px] opacity-80 mt-0.5">Nhanh chóng – Chính xác</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <AnishFooter />

      <ExamModeDialog
        isOpen={isModeDialogOpen}
        onClose={() => setIsModeDialogOpen(false)}
        exam={exam}
        defaultMode={dialogMode}
      />
    </div>
  );
};

export default ExamDetailPage;
