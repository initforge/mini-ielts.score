import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button, Spin, Alert, Table, Modal, Empty, Tabs, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Map,
  Search,
  History,
  Calendar,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../../api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartScore {
  correct: number;
  total: number;
  questions?: QuestionResult[];
}

interface ScoreResult {
  listeningScore: number;
  readingScore: number;
  totalScore: number;
  status: string; // 'FINAL' | 'PROVISIONAL'
  parts?: Record<string, PartScore>;
  completedAt?: string;
}

interface QuestionResult {
  questionId: number;
  score: number;
  isCorrect: boolean;
}

interface ReviewContent {
  question_id: number;
  correct_option_id: number | null;
  explanation: string | null;
  sample_response: string | null;
  rubric: string | null;
}

// ---------------------------------------------------------------------------
// Score → TOEIC scaled conversion (LR only; SW scores come from AI directly)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ResultPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading, isError, error } = useQuery<ScoreResult>({
    queryKey: ['attempt-result', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/result`);
      return res.data;
    },
    enabled: !!attemptId,
  });

  const reviewQuery = useQuery<ReviewContent[]>({
    queryKey: ['attempt-review', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/review`);
      return res.data;
    },
    enabled: !!attemptId && !!data && data.status === 'FINAL',
    retry: false,
  });

  const attemptQuery = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}`);
      return res.data;
    },
    enabled: !!attemptId,
  });

  // ── Derived state ────────────────────────────────────────────────────

  const result: Partial<ScoreResult> = data ?? {};
  const listeningScore = result.listeningScore ?? 0;
  const readingScore = result.readingScore ?? 0;
  const totalScore = result.totalScore ?? (listeningScore + readingScore);
  const isProvisional = result.status === 'PROVISIONAL';
  const isFinal = result.status === 'FINAL';
  const date = result.completedAt
    ? new Date(result.completedAt).toLocaleDateString('vi-VN')
    : new Date().toLocaleDateString('vi-VN');

  const isSW = useMemo(() => {
    const exam = attemptQuery.data;
    return exam?.skill_type === 'SW';
  }, [attemptQuery.data]);

  const getPartScore = (part: number) => {
    return result?.parts?.[`part${part}`]?.correct ?? 0;
  };
  const getPartTotal = (part: number) => {
    const totals: Record<number, number> = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
    return result?.parts?.[`part${part}`]?.total ?? totals[part];
  };

  // ── Error-map detail modal ────────────────────────────────────────

  const [detailModalOpen, setDetailModalOpen] = React.useState(false);

  // ── Review detail columns ──────────────────────────────────────────

  const reviewColumns = [
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
      width: 100,
    },
    {
      title: 'Giải thích',
      dataIndex: 'explanation',
      key: 'expl',
      render: (text: string | null) => (
        <span className="text-sm">{text || 'Chưa có giải thích'}</span>
      ),
    },
  ];

  // ── Loading / error states ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 gap-4">
        <Alert
          message="Lỗi tải kết quả"
          description={error instanceof Error ? error.message : 'Không thể tải kết quả. Vui lòng thử lại sau.'}
          type="error"
          showIcon
        />
        <Link to="/thi-thu/lich-su">
          <Button icon={<ArrowLeft className="w-4 h-4" />}>Quay lại lịch sử</Button>
        </Link>
      </div>
    );
  }

  // ── No result (still grading or not yet submitted) ─────────────────

  if (!data || (totalScore === 0 && !isProvisional && !isFinal)) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Empty description="Chưa có kết quả cho bài thi này.">
          <Link to={`/thi-thu/dang-xu-ly/${attemptId}`}>
            <Button type="primary">Kiểm tra trạng thái chấm điểm</Button>
          </Link>
        </Empty>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 flex flex-col items-center font-sans pb-20">
      {/* Top navigation */}
      <div className="w-full max-w-[1000px] flex items-center justify-between mb-4">
        <Link
          to="/thi-thu/lich-su"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Lịch sử luyện tập
        </Link>
        {isProvisional && (
          <Tag color="orange">Kết quả tạm thời — đang chấm tiếp</Tag>
        )}
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center justify-center mt-6 mb-2">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center ml-2">
            <div className="text-3xl font-extrabold text-[#2552c5] flex items-center gap-2 justify-center">
              XÓA MÙ <span className="text-[#f97316]">TOEIC</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center justify-center mt-1">
              <div className="w-12 h-[1px] bg-gray-300 mr-2"></div>
              GIỎI TOEIC, SÁNG TƯƠNG LAI
              <div className="w-12 h-[1px] bg-gray-300 ml-2"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Certificate Section */}
      <div className="max-w-[1000px] w-full mt-4 flex flex-col items-center">
        {/* Trapezoid Header */}
        <div
          className="bg-[#2552c5] text-white text-center py-4 px-16 relative z-10 w-full max-w-[600px]"
          style={{ clipPath: 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)' }}
        >
          {isSW ? (
            <>
              <div className="text-xs font-semibold tracking-[0.2em] mb-1">SPEAKING AND WRITING</div>
              <div className="text-2xl font-black tracking-wide">AI GRADING RESULT</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold tracking-[0.2em] mb-1">LISTENING AND READING</div>
              <div className="text-2xl font-black tracking-wide">UNOFFICIAL SCORE CERTIFICATE</div>
            </>
          )}
        </div>

        {/* Certificate Card */}
        <div className="bg-[#fffdf5] rounded-xl shadow-sm border border-amber-100/50 p-8 w-full relative -mt-[2px] z-0">
          <div className="flex flex-col md:flex-row gap-8 justify-between">
            {/* For SW exams, show a simpler score layout */}
            {isSW ? (
              <>
                {/* Speaking Score */}
                <div className="flex-1 max-w-[240px]">
                  <div className="bg-[#2552c5] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-5 uppercase shadow-sm">
                    Speaking
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full border-2 border-[#2552c5] text-[#2552c5] flex items-center justify-center font-bold text-2xl bg-white shrink-0">
                      {listeningScore}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-500 text-sm font-medium mb-2">Your score</div>
                      <div className="h-[2px] bg-gray-200"></div>
                      <div className="flex justify-between text-gray-400 text-[10px] font-bold mt-1">
                        <span>0</span>
                        <span>200</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Writing Score */}
                <div className="flex-1 max-w-[240px]">
                  <div className="bg-[#f97316] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-5 uppercase shadow-sm">
                    Writing
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full border-2 border-[#f97316] text-[#f97316] flex items-center justify-center font-bold text-2xl bg-white shrink-0">
                      {readingScore}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-500 text-sm font-medium mb-2">Your score</div>
                      <div className="h-[2px] bg-gray-200"></div>
                      <div className="flex justify-between text-gray-400 text-[10px] font-bold mt-1">
                        <span>0</span>
                        <span>200</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block w-[1px] border-l border-dashed border-orange-300/60 mx-2"></div>

                {/* Total Score */}
                <div className="flex-1 flex flex-col items-center justify-center pl-2">
                  <div className="text-gray-800 font-bold tracking-widest mb-6">TOTAL SCORE</div>
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-[6px] border-[#2552c5] flex items-center justify-center bg-white shadow-sm mb-4">
                      <span className="text-[#2552c5] text-5xl font-black">{totalScore}</span>
                    </div>
                  </div>
                  <div className="text-gray-500 font-bold text-sm">/ 400</div>
                  {isProvisional && (
                    <Tag color="orange" className="mt-2">Tạm thời</Tag>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Left: Listening Parts */}
                <div className="flex-1 max-w-[220px]">
                  <div className="bg-[#2552c5] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-6 uppercase shadow-sm">
                    Listening
                  </div>
                  <div className="space-y-6">
                    {[1, 2, 3, 4].map((part) => (
                      <div key={part} className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full border-2 border-[#2552c5] text-[#2552c5] flex items-center justify-center font-bold text-lg bg-white shrink-0">
                          {getPartScore(part)}
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="text-gray-500 text-sm font-medium">Part {part}</div>
                          <div className="h-[2px] bg-gray-200 mt-2"></div>
                        </div>
                        <div className="text-gray-500 font-medium text-sm pt-5">
                          {getPartTotal(part)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Middle: Reading Parts */}
                <div className="flex-1 max-w-[220px]">
                  <div className="bg-[#f97316] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-6 uppercase shadow-sm">
                    Reading
                  </div>
                  <div className="space-y-6 mb-8">
                    {[5, 6, 7].map((part) => (
                      <div key={part} className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-full border-2 border-[#f97316] text-[#f97316] flex items-center justify-center font-bold text-lg bg-white shrink-0">
                          {getPartScore(part)}
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="text-gray-500 text-sm font-medium">Part {part}</div>
                          <div className="h-[2px] bg-gray-200 mt-2"></div>
                        </div>
                        <div className="text-gray-500 font-medium text-sm pt-5">
                          {getPartTotal(part)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border border-blue-200 rounded-lg p-3 flex items-center justify-center gap-4 bg-white shadow-sm">
                    <div className="text-blue-400">
                      <Calendar size={24} />
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                        Ngày thi
                      </div>
                      <div className="text-[#2552c5] font-bold text-[15px]">{date}</div>
                    </div>
                  </div>
                </div>

                {/* Middle-Right: Section Scores */}
                <div className="flex-1 flex flex-col justify-center gap-10 max-w-[240px]">
                  <div>
                    <div className="bg-[#2552c5] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-5 uppercase shadow-sm">
                      Listening
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full border-2 border-[#2552c5] text-[#2552c5] flex items-center justify-center font-bold text-2xl bg-white shrink-0">
                        {listeningScore}
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-500 text-sm font-medium mb-2">Your score</div>
                        <div className="flex items-center">
                          <div className="w-full h-[2px] bg-gray-200"></div>
                        </div>
                        <div className="flex justify-between text-gray-400 text-[10px] font-bold mt-1">
                          <span>5</span>
                          <span>495</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="bg-[#f97316] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-5 uppercase shadow-sm">
                      Reading
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full border-2 border-[#f97316] text-[#f97316] flex items-center justify-center font-bold text-2xl bg-white shrink-0">
                        {readingScore}
                      </div>
                      <div className="flex-1">
                        <div className="text-gray-500 text-sm font-medium mb-2">Your score</div>
                        <div className="flex items-center">
                          <div className="w-full h-[2px] bg-gray-200"></div>
                        </div>
                        <div className="flex justify-between text-gray-400 text-[10px] font-bold mt-1">
                          <span>5</span>
                          <span>495</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block w-[1px] border-l border-dashed border-orange-300/60 mx-2"></div>

                {/* Right: Total Score */}
                <div className="flex-1 flex flex-col items-center justify-center pl-2">
                  <div className="text-gray-800 font-bold tracking-widest mb-6">TOTAL SCORE</div>
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-[6px] border-[#2552c5] flex items-center justify-center bg-white shadow-sm mb-4">
                      <span className="text-[#2552c5] text-5xl font-black">{totalScore}</span>
                    </div>
                  </div>
                  <div className="text-gray-500 font-bold text-sm">/ 990</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Motivation Banner */}
        <div className="w-full bg-[#fffdf5] border border-orange-200/60 p-4 rounded-xl mt-6 flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center text-xl shrink-0 text-white shadow-inner">
            ✨
          </div>
          <div>
            <div className="text-[#d97706] font-bold text-base mb-0.5">
              {isProvisional ? 'Đang hoàn thiện kết quả...' : 'Bắt đầu hành trình!'}
            </div>
            <div className="text-gray-600 text-[13px] font-medium">
              {isProvisional
                ? 'Hệ thống đang tiếp tục chấm các câu còn lại. Bạn có thể xem lại sau.'
                : 'Ai cũng từng bắt đầu từ con số nhỏ. Hãy quay lại làm bài này sau 1 tuần luyện tập — bạn sẽ bất ngờ!'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-wrap gap-3 justify-center mt-8">
          {reviewQuery.data && reviewQuery.data.length > 0 && (
            <Button
              type="primary"
              icon={<Search size={16} />}
              size="large"
              onClick={() => setDetailModalOpen(true)}
              className="rounded-lg !bg-[#0ea5e9] hover:!bg-[#0284c7] border-none font-semibold h-11 px-5 shadow-sm"
            >
              Xem lại chi tiết
            </Button>
          )}

          <Link to={`/thi-thu/chi-tiet/${attemptId}`}>
            <Button
              type="primary"
              icon={<Map size={16} />}
              size="large"
              className="rounded-lg !bg-[#f97316] hover:!bg-[#ea580c] border-none font-semibold h-11 px-5 shadow-sm"
            >
              Bản đồ lỗi sai
            </Button>
          </Link>

          <Link to="/thi-thu/lich-su">
            <Button
              type="primary"
              icon={<History size={16} />}
              size="large"
              className="rounded-lg !bg-[#a855f7] hover:!bg-[#9333ea] border-none font-semibold h-11 px-5 shadow-sm"
            >
              Lịch sử luyện tập
            </Button>
          </Link>

          {isProvisional && (
            <Link to={`/thi-thu/dang-xu-ly/${attemptId}`}>
              <Button
                icon={<BarChart size={16} />}
                size="large"
                className="rounded-lg font-semibold h-11 px-5 shadow-sm"
              >
                Theo dõi tiến độ chấm
              </Button>
            </Link>
          )}
        </div>

        {/* Per-question score table — only when data is available */}
        {result.parts && Object.keys(result.parts).length > 0 && (
          <div className="w-full mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Tabs
              items={Object.entries(result.parts).map(([key, partData]) => {
                const partNum = parseInt(key.replace('part', ''));
                const qData = partData?.questions ?? [];
                return {
                  key,
                  label: `Part ${partNum} (${partData?.correct ?? 0}/${partData?.total ?? 0})`,
                  children: qData.length > 0 ? (
                    <Table
                      dataSource={qData.map((q, i) => ({ ...q, key: i }))}
                      columns={[
                        {
                          title: 'Câu',
                          dataIndex: 'questionId',
                          key: 'qid',
                          width: 60,
                        },
                        {
                          title: 'Kết quả',
                          dataIndex: 'isCorrect',
                          key: 'result',
                          width: 80,
                          render: (val: boolean) =>
                            val ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500 inline" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-500 inline" />
                            ),
                        },
                        {
                          title: 'Điểm',
                          dataIndex: 'score',
                          key: 'score',
                          width: 60,
                        },
                      ]}
                      size="small"
                      pagination={false}
                    />
                  ) : (
                    <Empty description="Chưa có chi tiết từng câu" />
                  ),
                };
              })}
            />
          </div>
        )}
      </div>

      {/* Review Detail Modal */}
      <Modal
        title="Xem lại chi tiết bài thi"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {reviewQuery.isLoading ? (
          <Spin />
        ) : reviewQuery.isError ? (
          <Alert
            message="Không thể tải nội dung xem lại"
            type="warning"
            showIcon
            description="Bạn cần hoàn thành bài thi để xem lại chi tiết."
          />
        ) : (
          <Tabs
            defaultActiveKey="review"
            items={[
              {
                key: 'review',
                label: 'Đáp án & Giải thích',
                children: reviewQuery.data && reviewQuery.data.length > 0 ? (
                  <Table
                    dataSource={reviewQuery.data}
                    columns={reviewColumns}
                    rowKey="question_id"
                    size="small"
                    pagination={{ pageSize: 20 }}
                  />
                ) : (
                  <Empty description="Chưa có nội dung xem lại cho bài thi này." />
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
};

export default ResultPage;
