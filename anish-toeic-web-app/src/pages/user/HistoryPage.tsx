import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Table, Typography, Button, Spin, Alert, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Play, FileText, ArrowRight, RefreshCw, LogOut } from 'lucide-react';
import api from '../../api';
import { useExamCatalog } from '../../modules/mock-exam/lib/examCatalog';

const { Title, Text } = Typography;

interface AttemptRow {
  id: number;
  user_id: number;
  exam_id: number;
  status: string;
  mode: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

interface ResultRow {
  listeningScore: number;
  readingScore: number;
  totalScore: number;
  status: string;
}

type HistoryRow = AttemptRow & {
  exam: import('../../types/exam').Exam | undefined;
  isSW: boolean;
  result: ResultRow | null | undefined;
  displayTotal: number;
  max: number;
};

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: exams } = useExamCatalog();
  const examById = new Map((exams ?? []).map((e) => [e.id, e]));

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore server errors; the cookie is cleared server-side, navigate regardless.
    }
    navigate('/thi-thu');
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['attempts-history'],
    queryFn: async () => {
      const res = await api.get('/toeic-attempts');
      return (res.data ?? []) as AttemptRow[];
    },
    retry: false,
  });

  // ANON-GATE: session is cookie-based; a 401 means the visitor isn't signed
  // in — redirect to login preserving the history intent.
  useEffect(() => {
    const status =
      typeof error === 'object' && error !== null
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 401) {
      navigate(`/dang-nhap?returnUrl=${encodeURIComponent('/thi-thu/lich-su')}`);
    }
  }, [error, navigate]);

  // Enrich COMPLETED attempts with their result (LR /990, SW /400).
  const { data: results } = useQuery({
    queryKey: ['attempts-history-results', data?.map((a) => a.id) ?? []],
    queryFn: async () => {
      const completed = (data ?? []).filter((a) => a.status === 'COMPLETED');
      const rows = await Promise.all(
        completed.map(async (a) => {
          try {
            const res = await api.get<ResultRow>(`/toeic-attempts/${a.id}/result`);
            return [a.id, res.data] as const;
          } catch {
            return [a.id, null] as const;
          }
        }),
      );
      return new Map<number, ResultRow | null>(rows);
    },
    enabled: !!data && data.some((a) => a.status === 'COMPLETED'),
    staleTime: 30 * 1000,
  });

  const rows: HistoryRow[] = (data ?? []).map((a) => {
    const exam = examById.get(a.exam_id);
    const isSW = exam?.skill_type === 'SW';
    const result = results?.get(a.id);
    const displayTotal = result?.totalScore ?? 0;
    const max = isSW ? 400 : 990;
    return { ...a, exam, isSW, result, displayTotal, max };
  });

  const renderAction = (record: HistoryRow) => {
    if (record.status === 'COMPLETED') {
      return (
        <Link to={`/thi-thu/ket-qua/${record.id}`}>
          <Button type="primary" ghost icon={<FileText size={16} />} className="flex items-center rounded-full">
            Xem kết quả
          </Button>
        </Link>
      );
    }
    if (record.status === 'IN_PROGRESS') {
      return (
        <Link to={record.isSW ? `/thi-thu/lam-bai-sw/${record.id}` : `/thi-thu/lam-bai/${record.id}`}>
          <Button type="primary" icon={<Play size={16} />} className="flex items-center rounded-full">
            Làm tiếp
          </Button>
        </Link>
      );
    }
    if (record.status === 'SUBMITTED' || record.status === 'GRADING') {
      return (
        <Link to={`/thi-thu/dang-xu-ly/${record.id}`}>
          <Button icon={<ArrowRight size={16} />} className="flex items-center rounded-full">
            Xem trạng thái
          </Button>
        </Link>
      );
    }
    if (record.status === 'FAILED') {
      return (
        <Link to={`/thi-thu/dang-xu-ly/${record.id}`}>
          <Button danger icon={<RefreshCw size={16} />} className="flex items-center rounded-full">
            Thử lại
          </Button>
        </Link>
      );
    }
    return null;
  };

  const columns = [
    {
      title: 'Tên Đề',
      key: 'examTitle',
      render: (_: unknown, record: HistoryRow) => (
        <div className="min-w-0">
          <Text strong className="block truncate">
            {record.exam?.title || 'Bài thi TOEIC'}
          </Text>
          <Text type="secondary" className="text-xs">
            ID: {record.id} {record.isSW && '· S&W'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Ngày Thi',
      dataIndex: 'created_at',
      key: 'createdAt',
      render: (date: string) => (
        <span className="whitespace-nowrap">
          {new Date(date).toLocaleDateString('vi-VN')}{' '}
          {new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      title: 'Điểm',
      key: 'score',
      render: (_: unknown, record: HistoryRow) =>
        record.status === 'COMPLETED' ? (
          <Tag color="green" className="font-bold text-sm px-3 py-1">
            {record.displayTotal} / {record.max}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'COMPLETED') return <Tag color="blue">Hoàn thành</Tag>;
        if (status === 'IN_PROGRESS') return <Tag color="orange">Đang làm</Tag>;
        if (status === 'SUBMITTED' || status === 'GRADING') return <Tag color="cyan">Đang chấm</Tag>;
        if (status === 'FAILED') return <Tag color="red">Thất bại</Tag>;
        return <Tag color="gray">Khác</Tag>;
      },
    },
    {
      title: 'Hành Động',
      key: 'action',
      render: (_: unknown, record: HistoryRow) => renderAction(record),
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Alert
          message="Không thể tải lịch sử"
          description="Vui lòng thử lại sau."
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <Title level={2} className="!mb-2">
              Lịch Sử Luyện Tập
            </Title>
            <Text type="secondary">Xem lại các bài thi bạn đã làm và theo dõi tiến độ của bản thân.</Text>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/thi-thu">
              <Button size="large" className="rounded-full shadow-sm hover:shadow-md">
                ← Về danh sách đề thi
              </Button>
            </Link>
            <Button danger size="large" icon={<LogOut size={16} />} onClick={() => void handleLogout()}>
              Đăng xuất
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-10">
              <Empty description="Chưa có bài thi nào." />
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={rows}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 640 }}
              className="w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
};

const Tag: React.FC<{ color: string; className?: string; children: React.ReactNode }> = ({
  color,
  className,
  children,
}) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorMap[color] || 'bg-gray-50 text-gray-600 border-gray-200'} ${className ?? ''}`}
    >
      {children}
    </span>
  );
};

export default HistoryPage;
