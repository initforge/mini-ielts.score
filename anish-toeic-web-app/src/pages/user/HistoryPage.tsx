import React from 'react';
import { Link } from 'react-router-dom';
import { Table, Typography, Tag, Button, Spin, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Play, FileText, ArrowRight } from 'lucide-react';
import api from '../../api';

const { Title, Text } = Typography;

interface AttemptRecord {
  id: number;
  status: string;
  createdAt?: string;
  exam?: { title?: string };
  result?: {
    totalScore?: number;
    listeningScore?: number;
    readingScore?: number;
  };
}

const HistoryPage: React.FC = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attempts-history'],
    queryFn: async () => {
      const res = await api.get('/toeic-attempts');
      return res.data;
    },
  });

  const columns = [
    {
      title: 'Tên Đề',
      dataIndex: ['exam', 'title'],
      key: 'examTitle',
      render: (text: string, record: AttemptRecord) => (
        <div>
          <Text strong className="block">{text || 'Bài thi TOEIC'}</Text>
          <Text type="secondary" className="text-xs">ID: {record.id}</Text>
        </div>
      ),
    },
    {
      title: 'Ngày Thi',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('vi-VN') + ' ' + new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
    {
      title: 'Điểm',
      key: 'score',
      render: (_: unknown, record: AttemptRecord) => {
        if (record.status === 'COMPLETED') {
          const total = record.result?.totalScore || ((record.result?.listeningScore || 0) + (record.result?.readingScore || 0));
          return <Tag color="green" className="font-bold text-sm px-3 py-1">{total || 0} / 990</Tag>;
        }
        return <Text type="secondary">-</Text>;
      }
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'COMPLETED') return <Tag color="blue">Hoàn thành</Tag>;
        if (status === 'IN_PROGRESS') return <Tag color="orange">Đang làm</Tag>;
        if (status === 'PROCESSING') return <Tag color="cyan">Đang chấm</Tag>;
        return <Tag color="red">Thất bại / Hủy</Tag>;
      }
    },
    {
      title: 'Hành Động',
      key: 'action',
      render: (_: unknown, record: AttemptRecord) => {
        if (record.status === 'COMPLETED') {
          return (
            <Link to={`/thi-thu/ket-qua/${record.id}`}>
              <Button type="primary" ghost icon={<FileText size={16} />} className="flex items-center rounded-full">
                Xem kết quả
              </Button>
            </Link>
          );
        } else if (record.status === 'IN_PROGRESS') {
          return (
            <Link to={`/lam-bai/${record.id}`}>
              <Button type="primary" icon={<Play size={16} />} className="flex items-center rounded-full">
                Làm tiếp
              </Button>
            </Link>
          );
        } else if (record.status === 'PROCESSING') {
          return (
            <Link to={`/thi-thu/dang-xu-ly/${record.id}`}>
              <Button icon={<ArrowRight size={16} />} className="flex items-center rounded-full">
                Xem trạng thái
              </Button>
            </Link>
          );
        }
        return null;
      }
    }
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
        <Alert message="Lỗi" description={error instanceof Error ? error.message : 'Không thể tải lịch sử'} type="error" showIcon />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Title level={2} className="!mb-2">Lịch Sử Luyện Tập</Title>
            <Text type="secondary">Xem lại các bài thi bạn đã làm và theo dõi tiến độ của bản thân.</Text>
          </div>
          <Link to="/thi-thu">
            <Button size="large" className="rounded-full shadow-sm hover:shadow-md">
              ← Về danh sách đề thi
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <Table 
            columns={columns} 
            dataSource={data || []} 
            rowKey="id" 
            pagination={{ pageSize: 10 }}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
