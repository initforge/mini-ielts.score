import axios from 'axios';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import api from '../../api';
import { Exam } from '../../types/exam';
import { AnishHeader } from '../../components/AnishShell';

export interface AdminExam extends Exam {
  status: string;
  version: number;
}

export interface LifecycleResult {
  success: boolean;
  examId: number;
  status: string;
}

function useCatalogQuery() {
  return useQuery<AdminExam[]>({
    queryKey: ['admin-exams'],
    queryFn: async () => {
      // A7: protected admin list — A3 owns GET /api/admin/exams.
      // Contract shape mirrors the catalog: { items, ... }.
      const { data } = await api.get<{ items: AdminExam[] }>('/admin/exams', {
        params: { page: 1, pageSize: 100 },
      });
      return data.items;
    },
    retry: false,
  });
}

function useLifecycleMutation() {
  const qc = useQueryClient();
  return useMutation<LifecycleResult, Error, { examId: number; status: string }>({
    mutationFn: async ({ examId, status }) => {
      const { data } = await api.patch<LifecycleResult>(`/admin/exams/${examId}/lifecycle`, { status });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-exams'] });
    },
  });
}

function getHttpStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

function actionErrorMessage(err: unknown): string {
  const status = getHttpStatus(err);
  switch (status) {
    case 401:
    case 403:
      return 'Không được phép. Vui lòng đăng nhập với tư cách quản trị viên.';
    case 400:
      return 'Dữ liệu yêu cầu không hợp lệ.';
    case 404:
      return 'Không tìm thấy đề thi.';
    case 409:
      return 'Thao tác không hợp lệ với trạng thái hiện tại của đề thi.';
    default:
      return 'Đã xảy ra lỗi. Vui lòng thử lại.';
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PUBLISHED: 'bg-green-100 text-green-800',
    ARCHIVED: 'bg-slate-200 text-slate-700',
    DRAFT: 'bg-yellow-100 text-yellow-800',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export default function OnlineExamPage() {
  const { data: exams, isLoading, isError, error, refetch } = useCatalogQuery();
  const lifecycle = useLifecycleMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // A7 access error handling:
  // 401 -> no data, redirect to login preserving the current admin URL.
  // 403 -> no data, static "forbidden" message (no retry, no raw details).
  const errorStatus = getHttpStatus(error);

  useEffect(() => {
    if (errorStatus === 401) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      navigate(`/dang-nhap?returnUrl=${returnUrl}`);
    }
  }, [errorStatus, navigate, location]);

  const handleAction = async (examId: number, status: string) => {
    setActionError(null);
    try {
      await lifecycle.mutateAsync({ examId, status });
    } catch (err: unknown) {
      if (getHttpStatus(err) === 401) {
        // A7 L4: lifecycle 401 -> redirect to login preserving current URL (same as list).
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        navigate(`/dang-nhap?returnUrl=${returnUrl}`);
        return;
      }
      setActionError(actionErrorMessage(err));
    }
  };

  const isBusy = lifecycle.isPending;

  return (
    <>
      <AnishHeader />
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Đề thi trực tuyến</h1>
        <p className="text-muted-foreground text-sm mb-4">Quản lý trạng thái xuất bản và lưu trữ đề thi.</p>

        {actionError && (
          <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-3 underline text-destructive/80 hover:text-destructive">
              Đóng
            </button>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Đang tải danh sách đề thi">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
                <div className="h-4 w-3/4 bg-muted rounded mb-3" />
                <div className="h-3 w-1/2 bg-muted rounded mb-2" />
                <div className="h-8 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            {errorStatus === 403 ? (
              <>
                <p className="text-destructive font-medium">Bạn không có quyền truy cập trang quản trị.</p>
                <p className="text-muted-foreground text-sm">Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.</p>
              </>
            ) : errorStatus === 401 ? (
              <p className="text-muted-foreground text-sm">Phiên đăng nhập hết hạn. Đang chuyển hướng đến trang đăng nhập...</p>
            ) : (
              <>
                <p className="text-destructive font-medium">Không thể tải danh sách đề thi.</p>
                <p className="text-muted-foreground text-sm">Đã xảy ra lỗi. Vui lòng thử lại sau.</p>
                <button
                  onClick={() => void refetch()}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Tải lại
                </button>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && (!exams || exams.length === 0) && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">Chưa có đề thi nào trong hệ thống.</p>
          </div>
        )}

        {!isLoading && !isError && exams && exams.length > 0 && (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]" aria-label="Danh sách đề thi">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">Đề thi</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">Kỹ năng</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">Trạng thái</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {exams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{exam.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{exam.skill_type}</td>
                    <td className="px-4 py-3"><StatusBadge status={exam.status} /></td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => void handleAction(exam.id, 'PUBLISHED')}
                        disabled={isBusy || exam.status === 'PUBLISHED'}
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3"
                        aria-label={`Xuất bản ${exam.title}`}
                      >
                        Xuất bản
                      </button>
                      <button
                        onClick={() => void handleAction(exam.id, 'ARCHIVED')}
                        disabled={isBusy || exam.status === 'ARCHIVED'}
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3"
                        aria-label={`Lưu trữ ${exam.title}`}
                      >
                        Lưu trữ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
