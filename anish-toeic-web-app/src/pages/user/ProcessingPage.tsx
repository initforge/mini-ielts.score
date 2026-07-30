import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Progress, Button } from 'antd';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api';

const { Title, Text } = Typography;

const ProcessingPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const { data, isError, error, refetch } = useQuery({
    queryKey: ['grading-status', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/grading-status`);
      return res.data;
    },
    refetchInterval: (query) => {
      const status = query.state?.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') {
        return false;
      }
      return 3000;
    },
  });

  useEffect(() => {
    if (data?.status === 'COMPLETED') {
      navigate(`/thi-thu/ket-qua/${attemptId}`);
    }
  }, [data?.status, attemptId, navigate]);

  const progress = data?.progress ?? 0;
  const currentTask = data?.currentTask ?? 'Đang phân tích phát âm, ngữ pháp và nội dung để đưa ra điểm số và nhận xét chi tiết.';
  const isFailed = data?.status === 'FAILED' || isError;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center text-center">
        {!isFailed ? (
          <>
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" />
            <Title level={3} className="!mb-2">AI đang chấm bài của bạn...</Title>
            <Text type="secondary" className="block mb-8">{currentTask}</Text>
            
            <div className="w-full mb-8 text-left">
              <div className="flex justify-between mb-2">
                <Text strong>Overall progress</Text>
                <Text>{progress}%</Text>
              </div>
              <Progress percent={progress} showInfo={false} status="active" strokeColor="#3b82f6" />
            </div>

            <div className="text-left w-full space-y-3 mb-8">
              <Text className={`block ${progress > 10 ? 'text-gray-900' : 'text-gray-400'}`}>Uploading answer</Text>
              <Text className={`block ${progress > 30 ? 'text-gray-900' : 'text-gray-400'}`}>Speech-to-text & transcription</Text>
              <Text className={`block ${progress > 50 ? 'text-gray-900' : 'text-gray-400'}`}>Grammar analysis</Text>
              <Text className={`block ${progress > 70 ? 'text-gray-900' : 'text-gray-400'}`}>Vocabulary analysis</Text>
              <Text className={`block ${progress > 90 ? 'text-gray-900' : 'text-gray-400'}`}>TOEIC scoring calculation</Text>
              <Text className={`block ${progress >= 100 ? 'text-gray-900' : 'text-gray-400'}`}>Generating score report</Text>
            </div>

            <Text type="secondary" className="text-xs">Quá trình này thường mất vài giây. Vui lòng không đóng trang.</Text>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
              <Text className="text-red-500 text-2xl">!</Text>
            </div>
            <Title level={3} className="!mb-2">Chưa thể hoàn tất chấm bài</Title>
            <Text type="danger" className="block mb-8">
              {error instanceof Error ? error.message : data?.error ?? 'Đã xảy ra lỗi trong quá trình chấm điểm.'}
            </Text>
            <Button type="primary" onClick={() => refetch()} size="large">
              Thử chấm lại
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProcessingPage;
