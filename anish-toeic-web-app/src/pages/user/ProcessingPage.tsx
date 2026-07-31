import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Typography, Progress, Button, Alert, Space } from 'antd';
import { Loader2, AlertTriangle, RefreshCw, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types — mirrors toeic_grading_jobs row + attempt status
// ---------------------------------------------------------------------------

type GradingJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'RETRY';

interface GradingStatus {
  id: number;
  attempt_id: number;
  status: GradingJobStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Polling backoff: 2s → 4s → 8s → 16s (max)
// ---------------------------------------------------------------------------

const BASE_POLL_MS = 2000;
const MAX_POLL_MS = 16000;
const MAX_RETRIES = 3;
const RETRYABLE_ERRORS: GradingJobStatus[] = ['FAILED', 'RETRY', 'PARTIAL'];

function pollInterval(attempt: number): number {
  return Math.min(BASE_POLL_MS * 2 ** attempt, MAX_POLL_MS);
}

// ---------------------------------------------------------------------------
// Task descriptions per progress band (approximate)
// ---------------------------------------------------------------------------

const TASK_LABELS: Array<{ pct: number; label: string; detail: string }> = [
  { pct: 0, label: 'Đang vào hàng đợi', detail: 'Bài của bạn đang được xếp vào hàng đợi chấm điểm.' },
  { pct: 10, label: 'Đang tải câu trả lời', detail: 'Đang tải câu trả lời của bạn để phân tích.' },
  { pct: 30, label: 'Phân tích ngữ pháp', detail: 'Đang kiểm tra cấu trúc ngữ pháp và độ chính xác.' },
  { pct: 50, label: 'Phân tích từ vựng', detail: 'Đang đánh giá vốn từ vựng và cách dùng từ.' },
  { pct: 70, label: 'Tính điểm TOEIC', detail: 'Đang quy đổi kết quả sang thang điểm TOEIC.' },
  { pct: 90, label: 'Tạo báo cáo', detail: 'Đang tổng hợp điểm số và nhận xét chi tiết.' },
];

function getTaskForProgress(progressPct: number): { label: string; detail: string } {
  for (let i = TASK_LABELS.length - 1; i >= 0; i--) {
    if (progressPct >= TASK_LABELS[i].pct) return TASK_LABELS[i];
  }
  return TASK_LABELS[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessingPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [pollCount, setPollCount] = useState(0);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Query: grading-status ──────────────────────────────────────────────

  const { data, isError, error, refetch, dataUpdatedAt } = useQuery<GradingStatus>({
    queryKey: ['grading-status', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/grading-status`);
      return res.data;
    },
    enabled: !!attemptId,
    refetchInterval: false, // we manage polling manually for backoff
    retry: false,
    staleTime: 0,
  });

  // ── Mutation: retry (resubmit attempt) ─────────────────────────────────

  const retryMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/toeic-attempts/${attemptId}/submit`);
    },
    onSuccess: () => {
      setPollCount(0);
      refetch();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Không thể thử lại';
      setLastErrorMessage(msg);
    },
  });

  // ── Polling with backoff ───────────────────────────────────────────────

  useEffect(() => {
    if (!data) return;

    const status = data.status;

    // Terminal states — stop polling
    if (status === 'COMPLETED') {
      // Navigate to result on next tick
      const id = attemptId;
      if (id) {
        // Small delay so user sees "Complete!" briefly
        setTimeout(() => navigate(`/thi-thu/ket-qua/${id}`), 800);
      }
      return;
    }

    // Non-retryable FAILED or server error (no data returned) — stop
    if (isError && !RETRYABLE_ERRORS.includes(data?.status as GradingJobStatus)) {
      return;
    }

    // Keep polling for active / retryable states
    const currentStatus = data.status as GradingJobStatus;
    const shouldPoll =
      currentStatus === 'QUEUED' ||
      currentStatus === 'PROCESSING' ||
      currentStatus === 'PARTIAL' ||
      currentStatus === 'RETRY' ||
      (currentStatus === 'FAILED' && (data.retry_count ?? 0) < MAX_RETRIES);

    if (!shouldPoll) return;

    const interval = pollInterval(pollCount);
    pollTimerRef.current = setTimeout(() => {
      setPollCount((c) => c + 1);
      refetch();
    }, interval);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [data, dataUpdatedAt, isError, pollCount, refetch, navigate, attemptId]);

  // ── Derived state ─────────────────────────────────────────────────────

  const status: GradingJobStatus | null = data?.status ?? null;
  const retryCount: number = data?.retry_count ?? 0;
  const isTerminalFailed = status === 'FAILED' && retryCount >= MAX_RETRIES;
  const isRetryable =
    status === 'FAILED' && retryCount < MAX_RETRIES;
  const isQueued = status === 'QUEUED';
  const isProcessing = status === 'PROCESSING';
  const isPartial = status === 'PARTIAL';
  const isRetrying = status === 'RETRY';
  const isCompleted = status === 'COMPLETED';

  // Progress: QUEUED=5%, PROCESSING/PARTIAL use pollCount to simulate,
  // RETRY resets somewhat. In production the backend could return a real
  // progress field; for now use naive map.
  const progressPct = (() => {
    if (isCompleted) return 100;
    if (isQueued) return 5;
    if (isRetrying) return Math.min(10 + retryCount * 3, 25);
    if (isProcessing || isPartial) {
      // Simulate: each poll tick adds 1% up to 95%
      return Math.min(10 + pollCount, 95);
    }
    return 0;
  })();

  const task = getTaskForProgress(progressPct);
  const activeError = data?.error_message || (error instanceof Error ? error.message : null) || lastErrorMessage;

  // ── Render helpers ────────────────────────────────────────────────────

  const statusIcon = () => {
    if (isCompleted) return <CheckCircle2 className="w-16 h-16 text-green-500" />;
    if (isTerminalFailed) return <XCircle className="w-16 h-16 text-red-500" />;
    if (isQueued || isProcessing || isPartial || isRetrying) {
      return <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />;
    }
    if (status === 'FAILED') return <AlertTriangle className="w-16 h-16 text-amber-500" />;
    return <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />;
  };

  const statusTitle = () => {
    if (isCompleted) return 'Hoàn tất chấm bài!';
    if (isTerminalFailed) return 'Không thể hoàn tất chấm bài';
    if (isRetryable) return 'Đang thử chấm lại...';
    if (isQueued) return 'Đang chờ xếp hàng...';
    if (isProcessing) return 'AI đang chấm bài của bạn...';
    if (isPartial) return 'Đang chấm lại phần còn thiếu...';
    if (isRetrying) return `Đang thử chấm lại (lần ${retryCount}/${MAX_RETRIES})...`;
    return 'Đang xử lý...';
  };

  const statusSubtitle = () => {
    if (isTerminalFailed) return 'Đã thử chấm nhiều lần nhưng không thành công. Vui lòng thử lại sau.';
    if (activeError) return activeError;
    if (isQueued) return 'Bài của bạn đang trong hàng đợi. Sẽ được chấm trong giây lát.';
    return task.detail;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-4 shadow-sm">
        <Link
          to="/thi-thu/lich-su"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Lịch sử luyện tập
        </Link>
        <div className="flex-1" />
        <Text type="secondary" className="text-xs">
          ID: {attemptId}
        </Text>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center text-center">
          {/* Icon */}
          <div className="mb-6">{statusIcon()}</div>

          {/* Title */}
          <Title level={3} className="!mb-2">
            {statusTitle()}
          </Title>

          {/* Subtitle / error */}
          <Text
            type={isTerminalFailed || activeError ? 'danger' : 'secondary'}
            className="block mb-6"
          >
            {statusSubtitle()}
          </Text>

          {/* Progress bar — only when active */}
          {(isQueued || isProcessing || isPartial || isRetrying) && (
            <div className="w-full mb-8 text-left">
              <div className="flex justify-between mb-2">
                <Text strong>{task.label}</Text>
                <Text>{progressPct}%</Text>
              </div>
              <Progress
                percent={progressPct}
                showInfo={false}
                status={progressPct >= 95 ? 'success' : 'active'}
                strokeColor={progressPct >= 95 ? '#22c55e' : '#3b82f6'}
              />
            </div>
          )}

          {/* Step indicators */}
          {(isQueued || isProcessing || isPartial || isRetrying) && (
            <div className="text-left w-full space-y-3 mb-8">
              {TASK_LABELS.map((step) => (
                <div key={step.label} className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      progressPct >= step.pct
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    {progressPct >= step.pct && (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <Text
                    className={`text-sm ${
                      progressPct >= step.pct ? 'text-gray-900 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </Text>
                </div>
              ))}
            </div>
          )}

          {/* Retry badge */}
          {retryCount > 0 && !isTerminalFailed && (
            <div className="mb-4">
              <Tag color="orange">Lần thử thứ {retryCount}/{MAX_RETRIES}</Tag>
            </div>
          )}

          {/* Error alert for terminal failure */}
          {isTerminalFailed && (
            <Alert
              message="Chấm điểm thất bại"
              description={
                <div className="space-y-2">
                  <p>{activeError || 'Đã xảy ra lỗi không khắc phục được trong quá trình chấm điểm.'}</p>
                  <p className="text-xs text-gray-500">
                    Đã thử {MAX_RETRIES} lần. Vui lòng thử làm lại bài thi hoặc liên hệ hỗ trợ.
                  </p>
                </div>
              }
              type="error"
              showIcon
              className="mb-6 text-left"
            />
          )}

          {/* Action buttons */}
          <Space direction="vertical" size="middle" className="w-full">
            {isRetryable && (
              <Button
                type="primary"
                onClick={() => retryMutation.mutate()}
                loading={retryMutation.isPending}
                icon={<RefreshCw size={16} />}
                size="large"
                block
              >
                Thử chấm lại
              </Button>
            )}

            {isTerminalFailed && (
              <>
                <Button
                  type="primary"
                  onClick={() => retryMutation.mutate()}
                  loading={retryMutation.isPending}
                  icon={<RefreshCw size={16} />}
                  size="large"
                  block
                  danger
                >
                  Thử chấm lại lần cuối
                </Button>
                <Link to="/thi-thu/lich-su">
                  <Button size="large" block>
                    Quay lại lịch sử
                  </Button>
                </Link>
              </>
            )}

            {isPartial && (
              <Link to={`/thi-thu/ket-qua/${attemptId}`}>
                <Button type="default" size="large" block>
                  Xem kết quả tạm thời
                </Button>
              </Link>
            )}
          </Space>

          {/* Footer note */}
          {!isTerminalFailed && !isCompleted && (
            <Text type="secondary" className="text-xs mt-6">
              {isQueued
                ? 'Quá trình này thường diễn ra trong vài giây.'
                : 'Vui lòng không đóng trang. Quá trình này có thể mất vài giây đến vài phút.'}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tiny Tag inline component (avoids importing full antd Tag just for badges)
// ---------------------------------------------------------------------------

const Tag: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => {
  const colorMap: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorMap[color] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
    >
      {children}
    </span>
  );
};

export default ProcessingPage;
