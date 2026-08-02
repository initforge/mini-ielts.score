import React, { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Alert, Spin, Empty, Tag, Modal, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Map as MapIcon,
  Search,
  Target,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import DOMPurify from 'dompurify';
import api from '../../api';
import { Attempt, Option } from '../../types/exam';
import { sortSessionQuestions } from '../../modules/mock-exam/store/attemptStore';
import { useExamById } from '../../modules/mock-exam/lib/examCatalog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewContent {
  question_id: number;
  correct_option_id: number | null;
  explanation: string | null;
  sample_response: string | null;
  rubric: string | null;
}

interface ScoreResult {
  listeningScore: number;
  readingScore: number;
  totalScore: number;
  status: string;
}

interface QuestionRow {
  questionId: number;
  displayNumber: number;
  part: number;
  partTitle: string;
  correctOptionId: number | null;
  userOptionId: number | null;
  answered: boolean;
  isCorrect: boolean;
  explanation: string | null;
}

const PART_TITLES: Record<number, string> = {
  1: 'Photographs',
  2: 'Question–Response',
  3: 'Conversations',
  4: 'Talks',
  5: 'Incomplete Sentences',
  6: 'Text Completion',
  7: 'Reading Comprehension',
};

function isForbidden(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { response?: { status?: number } }).response?.status === 403;
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { response?: { status?: number } }).response?.status === 404;
}

function buildRows(
  attempt: Attempt,
  review: ReviewContent[],
): QuestionRow[] {
  const correctById = new Map(review.map((r) => [r.question_id, r.correct_option_id]));
  const explanationById = new Map(review.map((r) => [r.question_id, r.explanation]));
  const responseByQuestion = new Map(attempt.responses.map((r) => [r.question_id, r]));
  const partBySection = new Map<number, number>(attempt.session.sections.map((s) => [s.id, s.order_index]));

  return sortSessionQuestions(attempt.session.sections, attempt.session.questions).map((q, i) => {
    const part = partBySection.get(q.section_id) ?? 0;
    const correctOptionId = correctById.get(q.id) ?? null;
    const userOptionId = responseByQuestion.get(q.id)?.selected_option_id ?? null;
    const answered = userOptionId != null;
    return {
      questionId: q.id,
      displayNumber: i + 1,
      part,
      partTitle: PART_TITLES[part] ?? `Part ${part}`,
      correctOptionId,
      userOptionId,
      answered,
      isCorrect: answered && userOptionId === correctOptionId,
      explanation: explanationById.get(q.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ErrorMapPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();

  const attemptQuery = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      const res = await api.get<Attempt>(`/toeic-attempts/${attemptId}`);
      return res.data;
    },
    enabled: !!attemptId,
    retry: false,
  });

  const reviewQuery = useQuery<ReviewContent[]>({
    queryKey: ['attempt-review', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/review`);
      return res.data;
    },
    enabled: !!attemptId && !!attemptQuery.data && attemptQuery.data.status === 'COMPLETED',
    retry: false,
  });

  const resultQuery = useQuery<ScoreResult>({
    queryKey: ['attempt-result', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/result`);
      return res.data;
    },
    enabled: !!attemptId && !!attemptQuery.data && attemptQuery.data.status === 'COMPLETED',
    retry: false,
  });

  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // `toeic_attempts` rows don't carry skill_type — resolve via catalog.
  const exam = useExamById(attemptQuery.data?.exam_id ?? null);
  const isSW = exam?.skill_type === 'SW';

  const rows = useMemo(
    () => (attemptQuery.data && reviewQuery.data ? buildRows(attemptQuery.data, reviewQuery.data) : []),
    [attemptQuery.data, reviewQuery.data],
  );

  const answered = rows.filter((r) => r.answered);
  const correct = rows.filter((r) => r.isCorrect);
  const wrong = rows.filter((r) => r.answered && !r.isCorrect);
  const unanswered = rows.filter((r) => !r.answered);
  const accuracy = answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0;

  const parts: { part: number; title: string; correct: number; wrong: number; total: number }[] = useMemo(() => {
    const byPart = new Map<number, QuestionRow[]>();
    for (const r of rows) {
      if (!byPart.has(r.part)) byPart.set(r.part, []);
      byPart.get(r.part)?.push(r);
    }
    return [...byPart.entries()].map(([part, qs]) => ({
      part,
      title: PART_TITLES[part] ?? `Part ${part}`,
      correct: qs.filter((q) => q.isCorrect).length,
      wrong: qs.filter((q) => q.answered && !q.isCorrect).length,
      total: qs.length,
    }));
  }, [rows]);

  const chartData = useMemo(() => parts.map((p) => ({ part: `Part ${p.part}`, wrong: p.wrong })), [parts]);

  // ── Loading / errors ──────────────────────────────────────────────────

  if (attemptQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Spin size="large" />
      </div>
    );
  }

  if (attemptQuery.isError) {
    const forbidden = isForbidden(attemptQuery.error);
    const notFound = isNotFound(attemptQuery.error);
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 gap-4">
        <Alert
          message={notFound ? 'Không tìm thấy bài thi' : forbidden ? 'Không có quyền truy cập' : 'Lỗi tải bài thi'}
          description={notFound ? 'Bài thi không tồn tại hoặc đã bị xóa.' : forbidden ? 'Bạn không có quyền xem bài thi này.' : attemptQuery.error instanceof Error ? attemptQuery.error.message : 'Vui lòng thử lại sau.'}
          type="error"
          showIcon
        />
        <Link to="/thi-thu/lich-su">
          <button className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100">
            Quay lại lịch sử
          </button>
        </Link>
      </div>
    );
  }

  if (reviewQuery.isLoading || reviewQuery.isError) {
    const forbidden = isForbidden(reviewQuery.error);
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 gap-4">
        <Alert
          message={forbidden ? (isSW ? 'Bài làm chưa sẵn sàng' : 'Bản đồ lỗi sai chưa sẵn sàng') : 'Không thể tải nội dung'}
          description={forbidden ? 'Bạn cần hoàn thành bài thi để xem lại chi tiết.' : 'Vui lòng thử lại sau.'}
          type="warning"
          showIcon
        />
        <Link to={`/thi-thu/ket-qua/${attemptId}`}>
          <button className="px-4 py-2 rounded-lg bg-[#2552c5] text-white text-sm font-semibold hover:bg-[#1e40af]">
            Quay lại kết quả
          </button>
        </Link>
      </div>
    );
  }

  // ── S&W review (AC18: per-question prompt + user answer vs sample) ──────
  if (isSW) {
    return (
      <SWReviewView
        attempt={attemptQuery.data}
        review={reviewQuery.data ?? []}
        result={resultQuery.data}
        attemptId={attemptId}
      />
    );
  }

  const result = resultQuery.data;

  // ── Main render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-16">
      {/* Top nav */}
      <div className="max-w-[1000px] mx-auto px-4 pt-4 flex items-center justify-between">
        <Link
          to={`/thi-thu/ket-qua/${attemptId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Kết quả
        </Link>
        <Link
          to="/thi-thu/lich-su"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Lịch sử luyện tập
        </Link>
      </div>

      {/* Header */}
      <div className="max-w-[1000px] mx-auto px-4 mt-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-[#f97316] text-white flex items-center justify-center shadow-sm">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">Bản đồ lỗi sai TOEIC</h1>
            <p className="text-sm text-slate-500">
              Theo dõi lỗi sai, hiểu điểm yếu và cải thiện đúng trọng tâm
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Tag color="blue">Listening {result?.listeningScore ?? 0}</Tag>
          <Tag color="orange">Reading {result?.readingScore ?? 0}</Tag>
          <Tag color="green" className="font-bold">Tổng {result?.totalScore ?? 0} / 990</Tag>
        </div>
      </div>

      {/* Summary cards */}
      <div className="max-w-[1000px] mx-auto px-4 grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Tổng câu', value: rows.length, icon: Target, color: 'text-blue-600 bg-blue-50' },
          { label: 'Đã trả lời', value: answered.length, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Đúng', value: correct.length, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
          { label: 'Sai', value: wrong.length, icon: XCircle, color: 'text-red-500 bg-red-50' },
          { label: 'Tỷ lệ đúng', value: `${accuracy}%`, icon: Target, color: 'text-indigo-600 bg-indigo-50' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black text-slate-900 leading-none">{c.value}</div>
              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Error-by-part chart + part breakdown */}
      <div className="max-w-[1000px] mx-auto px-4 grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-1">Lỗi sai theo Part</h2>
          <p className="text-xs text-slate-400 mb-4">Số lần sai trong bài thi này</p>
          {chartData.some((d) => d.wrong > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="part" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="wrong" name="Số lần sai" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-[220px] text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
              <p className="text-sm font-medium">Tuyệt vời — bạn không sai câu nào!</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-slate-800 mb-4">Chi tiết theo Part</h2>
          <div className="space-y-3">
            {parts.map((p) => (
              <div key={p.part} className="flex items-center gap-3">
                <div className="w-16 shrink-0">
                  <div className="text-sm font-bold text-slate-800">Part {p.part}</div>
                  <div className="text-[11px] text-slate-400 truncate">{p.title}</div>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-500"
                      style={{ width: `${p.total > 0 ? (p.correct / p.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 font-medium w-16 text-right">
                    {p.correct}/{p.total}
                  </span>
                </div>
                {p.wrong > 0 && (
                  <span className="text-[11px] text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded-full">
                    {p.wrong} sai
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wrong questions + review detail */}
      <div className="max-w-[1000px] mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-slate-900">Câu sai cần ôn lại</h2>
          <button
            onClick={() => setReviewModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#0ea5e9] hover:bg-[#0284c7] px-4 py-2 rounded-lg transition-colors"
          >
            <Search className="w-4 h-4" /> Xem lại chi tiết
          </button>
        </div>

        {wrong.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10">
            <Empty description={answered.length === 0 ? 'Chưa trả lời câu nào trong bài thi này.' : 'Tuyệt vời — bạn không sai câu nào!'} />
          </div>
        ) : (
          <div className="space-y-3">
            {wrong.map((r) => {
              const userOption = userOptionContent(attemptQuery.data!, r.userOptionId);
              const correctOption = userOptionContent(attemptQuery.data!, r.correctOptionId);
              return (
                <div key={r.questionId} className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-50">
                    <span className="text-sm font-black text-slate-900 bg-slate-100 rounded-lg px-2.5 py-1">Câu {r.displayNumber}</span>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-50 rounded-full px-2.5 py-1">
                      Part {r.part} — {r.partTitle}
                    </span>
                    {r.explanation && (
                      <span className="text-xs text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">Có giải thích</span>
                    )}
                  </div>
                  <div className="px-5 py-4 grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-500 mb-1.5">
                        <XCircle className="w-3.5 h-3.5" /> BẠN CHỌN
                      </div>
                      <div className="text-sm text-slate-700">
                        {userOption ? (
                          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userOption) }} />
                        ) : (
                          <span className="italic text-slate-400">Chưa trả lời</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ĐÁP ÁN ĐÚNG
                      </div>
                      <div className="text-sm text-slate-700">
                        {correctOption ? (
                          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(correctOption) }} />
                        ) : (
                          <span className="italic text-slate-400">Chưa có</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {r.explanation && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-gray-100">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Giải thích</div>
                      <div className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.explanation) }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unanswered.length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-2">
              Chưa trả lời: {unanswered.length} câu
            </h3>
            <p className="text-xs text-slate-500">
              Câu {unanswered.map((u) => u.displayNumber).join(', ')} — các câu này được tính là sai trong bản đồ lỗi.
            </p>
          </div>
        )}
      </div>

      {/* Full review modal */}
      <Modal
        title="Xem lại chi tiết bài thi"
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={reviewQuery.data ?? []}
          rowKey="question_id"
          size="small"
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'Câu',
              dataIndex: 'question_id',
              key: 'qid',
              width: 60,
            },
            {
              title: 'Đáp án đúng',
              key: 'correct',
              render: (_: unknown, record: ReviewContent) => (
                <span className="font-mono text-green-600 font-bold">
                  {record.correct_option_id ?? '—'}
                </span>
              ),
              width: 110,
            },
            {
              title: 'Giải thích',
              dataIndex: 'explanation',
              key: 'expl',
              render: (text: string | null) => (
                <span className="text-sm">{text || 'Chưa có giải thích'}</span>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

/** Renders an option as "A — content" when found; falls back to the id. */
function userOptionContent(attempt: Attempt, optionId: number | null): string | null {
  if (optionId === null) return null;
  const all: Option[] = attempt.session.options ?? [];
  const opt = all.find((o) => o.id === optionId);
  if (!opt) return String(optionId);
  return opt.content && opt.content.trim() ? `${opt.label}. ${opt.content}` : opt.label;
}

// ---------------------------------------------------------------------------
// S&W review view — per-question prompt + user answer (text) vs sample.
// Speaking answers are audio; there is no playback GET endpoint in dev, so a
// note is shown instead (AC18: "audio playback if available").
// ---------------------------------------------------------------------------

interface SWReviewProps {
  attempt: Attempt | undefined;
  review: ReviewContent[];
  result: ScoreResult | undefined;
  attemptId: string | undefined;
}

function SWReviewView({ attempt, review, result, attemptId }: SWReviewProps) {
  const questions = (attempt?.session?.questions ?? []).slice().sort((a, b) => {
    const order = (t: string) => (t === 'SPEAKING' ? 0 : 1);
    return order(a.type) - order(b.type) || a.order_index - b.order_index;
  });
  const responseByQ = new Map((attempt?.responses ?? []).map((r) => [r.question_id, r]));
  const sampleByQ = new Map(review.map((r) => [r.question_id, r.sample_response]));

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-16">
      {/* Top nav */}
      <div className="max-w-[1000px] mx-auto px-4 pt-4 flex items-center justify-between">
        <Link
          to={`/thi-thu/ket-qua/${attemptId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Kết quả
        </Link>
        <Link
          to="/thi-thu/lich-su"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Lịch sử luyện tập
        </Link>
      </div>

      {/* Header */}
      <div className="max-w-[1000px] mx-auto px-4 mt-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-[#0ea5e9] text-white flex items-center justify-center shadow-sm">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
              Xem lại bài thi — Speaking &amp; Writing
            </h1>
            <p className="text-sm text-slate-500">Câu hỏi, bài làm của bạn và đáp án mẫu</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Tag color="blue">Speaking {result?.listeningScore ?? 0}</Tag>
          <Tag color="orange">Writing {result?.readingScore ?? 0}</Tag>
          <Tag color="green" className="font-bold">
            Tổng {result?.totalScore ?? 0} / 400
          </Tag>
          <Tag color="green">FINAL</Tag>
        </div>
      </div>

      {/* Question list */}
      <div className="max-w-[1000px] mx-auto px-4 space-y-3">
        {questions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10">
            <Empty description="Chưa có câu hỏi cho bài thi này." />
          </div>
        ) : (
          questions.map((q, i) => {
            const resp = responseByQ.get(q.id);
            const isSpeaking = q.type === 'SPEAKING';
            const userAnswer = resp?.text_response ?? null;
            const sample = sampleByQ.get(q.id) ?? null;
            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-gray-50">
                  <span className="text-sm font-black text-slate-900 bg-slate-100 rounded-lg px-2.5 py-1">
                    Câu {i + 1}
                  </span>
                  <span
                    className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                      isSpeaking ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                    }`}
                  >
                    {isSpeaking ? 'SPEAKING' : 'WRITING'}
                  </span>
                </div>
                <div className="px-5 py-4 grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5">
                      <Search className="w-3.5 h-3.5" /> CÂU HỎI
                    </div>
                    <div
                      className="text-sm text-slate-700"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(q.content ?? '') }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1.5">
                      <Target className="w-3.5 h-3.5" /> BÀI LÀM CỦA BẠN
                    </div>
                    {isSpeaking ? (
                      <span className="text-sm text-slate-500">
                        Bản ghi âm đã được nộp. Không có URL phát lại trong môi trường dev.
                      </span>
                    ) : userAnswer ? (
                      <div
                        className="text-sm text-slate-700"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userAnswer) }}
                      />
                    ) : (
                      <span className="text-sm italic text-slate-400">Chưa trả lời</span>
                    )}
                  </div>
                </div>
                {sample && (
                  <div className="px-5 py-3 bg-slate-50 border-t border-gray-100">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Đáp án mẫu
                    </div>
                    <div
                      className="text-sm text-slate-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sample) }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ErrorMapPage;
