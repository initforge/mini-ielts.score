import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button, Spin, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Download, Map, Search, History, Calendar } from 'lucide-react';
import api from '../../api';

const ResultPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['attempt-result', attemptId],
    queryFn: async () => {
      const res = await api.get(`/toeic-attempts/${attemptId}/result`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <Alert message="Lỗi" description={error instanceof Error ? error.message : 'Không thể tải kết quả'} type="error" showIcon />
      </div>
    );
  }

  const result = data || {};
  const listeningScore = result.listeningScore || 0;
  const readingScore = result.readingScore || 0;
  const totalScore = result.totalScore || (listeningScore + readingScore);
  const date = result.completedAt ? new Date(result.completedAt).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');

  // Mocks for parts if not available
  const getPartScore = (part: number) => {
    return result?.parts?.[`part${part}`]?.correct || 0;
  };
  const getPartTotal = (part: number) => {
    const totals: Record<number, number> = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
    return result?.parts?.[`part${part}`]?.total || totals[part];
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 flex flex-col items-center font-sans pb-20">
        {/* The top logo - using a mock version that looks like the image */}
        <div className="flex flex-col items-center justify-center mt-10 mb-2">
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
            
            {/* The Trapezoid Header */}
            <div className="bg-[#2552c5] text-white text-center py-4 px-16 relative z-10 w-full max-w-[600px]" style={{
                clipPath: 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
            }}>
                <div className="text-xs font-semibold tracking-[0.2em] mb-1">LISTENING AND READING</div>
                <div className="text-2xl font-black tracking-wide">UNOFFICIAL SCORE CERTIFICATE</div>
            </div>

            {/* The Main Certificate Card */}
            <div className="bg-[#fffdf5] rounded-xl shadow-sm border border-amber-100/50 p-8 w-full relative -mt-[2px] z-0">
                <div className="flex flex-col md:flex-row gap-8 justify-between">
                    
                    {/* Left Column: Listening */}
                    <div className="flex-1 max-w-[220px]">
                        <div className="bg-[#2552c5] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-6 uppercase shadow-sm">
                            Listening
                        </div>
                        <div className="space-y-6">
                            {[1, 2, 3, 4].map(part => (
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

                    {/* Middle Column: Reading & Date */}
                    <div className="flex-1 max-w-[220px]">
                        <div className="bg-[#f97316] text-white text-sm font-bold py-1.5 px-6 rounded-full inline-block mb-6 uppercase shadow-sm">
                            Reading
                        </div>
                        <div className="space-y-6 mb-8">
                            {[5, 6, 7].map(part => (
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
                        {/* Date */}
                        <div className="border border-blue-200 rounded-lg p-3 flex items-center justify-center gap-4 bg-white shadow-sm">
                            <div className="text-blue-400">
                                <Calendar size={24} />
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Ngày thi</div>
                                <div className="text-[#2552c5] font-bold text-[15px]">{date}</div>
                            </div>
                        </div>
                    </div>

                    {/* Middle-Right Column: Section Scores */}
                    <div className="flex-1 flex flex-col justify-center gap-10 max-w-[240px]">
                        {/* Listening Score */}
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
                        {/* Reading Score */}
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

                    {/* Divider */}
                    <div className="hidden md:block w-[1px] border-l border-dashed border-orange-300/60 mx-2"></div>

                    {/* Right Column: Total Score */}
                    <div className="flex-1 flex flex-col items-center justify-center pl-2">
                        <div className="text-gray-800 font-bold tracking-widest mb-6">TOTAL SCORE</div>
                        <div className="relative">
                            <div className="w-32 h-32 rounded-full border-[6px] border-[#2552c5] flex items-center justify-center bg-white shadow-sm mb-4">
                                <span className="text-[#2552c5] text-5xl font-black">{totalScore}</span>
                            </div>
                        </div>
                        <div className="text-gray-500 font-bold text-sm">/ 990</div>
                    </div>
                </div>
            </div>

            {/* Motivation Banner */}
            <div className="w-full bg-[#fffdf5] border border-orange-200/60 p-4 rounded-xl mt-6 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center text-xl shrink-0 text-white shadow-inner">
                    🚀
                </div>
                <div>
                    <div className="text-[#d97706] font-bold text-base mb-0.5">Bắt đầu hành trình!</div>
                    <div className="text-gray-600 text-[13px] font-medium">Ai cũng từng bắt đầu từ con số nhỏ. Hãy quay lại làm bài này sau 1 tuần luyện tập — bạn sẽ bất ngờ!</div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-wrap gap-3 justify-center mt-8">
                <Button 
                    type="primary" 
                    icon={<BarChart size={16} />} 
                    size="large" 
                    className="rounded-lg !bg-[#3b82f6] hover:!bg-[#2563eb] border-none font-semibold h-11 px-5 shadow-sm"
                >
                    Bảng kết quả
                </Button>
                <Button 
                    type="primary" 
                    icon={<Download size={16} />} 
                    size="large" 
                    className="rounded-lg !bg-[#22c55e] hover:!bg-[#16a34a] border-none font-semibold h-11 px-5 shadow-sm"
                >
                    Tải bảng điểm
                </Button>
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
                <Button 
                    type="primary" 
                    icon={<Search size={16} />} 
                    size="large" 
                    className="rounded-lg !bg-[#0ea5e9] hover:!bg-[#0284c7] border-none font-semibold h-11 px-5 shadow-sm"
                >
                    Xem lại chi tiết
                </Button>
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
            </div>
        </div>
    </div>
  );
};

export default ResultPage;
