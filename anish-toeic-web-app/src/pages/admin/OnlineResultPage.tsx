import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { AnishHeader } from '../../components/AnishShell';
import { useAdminResults, useAdminResultDetail, useRegradeResult, useOverrideResult, useRestoreResult } from './lib/result-hooks';
import { useAuthRedirect, actionErrorMessage } from './lib/admin-utils';
import type { AdminResultItem, ResultFilters } from './types/result';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PROVISIONAL: 'bg-yellow-100 text-yellow-800',
    FINAL: 'bg-green-100 text-green-800',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

function ResultList() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'PROVISIONAL' | 'FINAL' | ''>((searchParams.get('status') as 'PROVISIONAL' | 'FINAL' | '') ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const filters: ResultFilters = { page, pageSize: 20, status: status || undefined };
  const { data, isLoading, isError, error } = useAdminResults(filters);
  useAuthRedirect(error);

  if (isError) return <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">{actionErrorMessage(error)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => setShowFilters((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground">{showFilters ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'}</button>
      </div>
      {showFilters && (
        <div className="flex gap-3 items-end flex-wrap border rounded-lg p-3 bg-card">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Trạng thái</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value as '' | 'PROVISIONAL' | 'FINAL'); setPage(1); }} className="rounded border border-input bg-background px-2 py-1.5 text-sm">
              <option value="">Tất cả</option>
              <option value="PROVISIONAL">PROVISIONAL</option>
              <option value="FINAL">FINAL</option>
            </select>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">{[1,2,3,4,5].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : !data?.items.length ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Không có kết quả nào.</p>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Attempt ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Đề thi</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Người dùng</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Nghe</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Đọc</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Tổng</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Trạng thái</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">{data.items.map((item) => <ResultRow key={item.attemptId} item={item} />)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tổng: {data.total} | Trang {data.page}/{data.totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-input bg-background px-3 py-1 text-sm disabled:opacity-50 hover:bg-accent">← Trước</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-input bg-background px-3 py-1 text-sm disabled:opacity-50 hover:bg-accent">Sau →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResultRow({ item }: { item: AdminResultItem }) {
  const navigate = useNavigate();
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 font-mono text-xs">{item.attemptId}</td>
      <td className="px-4 py-3">{item.examTitle}</td>
      <td className="px-4 py-3 font-mono text-xs">{item.userId}</td>
      <td className="px-4 py-3 text-right font-medium">{item.listeningScore}</td>
      <td className="px-4 py-3 text-right font-medium">{item.readingScore}</td>
      <td className="px-4 py-3 text-right font-bold">{item.totalScore}</td>
      <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => navigate(`/admin/ket-qua-thi-online?id=${item.attemptId}`)} className="text-xs font-medium text-primary hover:underline">Chi tiết</button>
      </td>
    </tr>
  );
}

function ActionForm({ children }: { children: React.ReactNode }) {
  return <div className="border-t pt-3 space-y-3">{children}</div>;
}

function RegradeForm({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const regrade = useRegradeResult();
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!reason.trim()) { setActionError('Lý do là bắt buộc.'); return; }
    try {
      await regrade.mutateAsync({ attemptId, reason: reason.trim(), idempotencyKey: idempotencyKey.trim() || undefined });
      setSuccess(true);
    } catch (err) { setActionError(actionErrorMessage(err)); }
  };

  if (success) return <div className="p-3 bg-green-50 rounded text-sm"><p className="font-medium text-green-800">Đã chấm lại thành công.</p><button onClick={onClose} className="mt-2 underline text-green-700">Đóng</button></div>;
  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div><label className="block text-sm font-medium mb-1">Lý do <span className="text-destructive">*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" rows={2} maxLength={1000} required placeholder="Lý do chấm lại (bắt buộc)" /></div>
      <div><label className="block text-sm font-medium mb-1">Khóa Idempotency (tùy chọn)</label><input type="text" value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" maxLength={255} placeholder="Tránh chạy lại nhiều lần" /></div>
      {actionError && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{actionError}</div>}
      <div className="flex gap-2"><button type="submit" disabled={regrade.isPending} className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700">{regrade.isPending ? 'Đang xử lý...' : 'Chấm lại'}</button><button type="button" onClick={onClose} className="rounded border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">Hủy</button></div>
    </form>
  );
}

function OverrideForm({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const override = useOverrideResult();
  const [listeningScore, setListeningScore] = useState('');
  const [readingScore, setReadingScore] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!reason.trim()) { setActionError('Lý do là bắt buộc.'); return; }
    if (!listeningScore && !readingScore) { setActionError('Cần nhập ít nhất một điểm.'); return; }
    try {
      await override.mutateAsync({ attemptId, listeningScore: listeningScore ? parseInt(listeningScore, 10) : undefined, readingScore: readingScore ? parseInt(readingScore, 10) : undefined, reason: reason.trim(), idempotencyKey: idempotencyKey.trim() || undefined });
      setSuccess(true);
    } catch (err) { setActionError(actionErrorMessage(err)); }
  };

  if (success) return <div className="p-3 bg-green-50 rounded text-sm"><p className="font-medium text-green-800">Đã ghi đè điểm thành công.</p><button onClick={onClose} className="mt-2 underline text-green-700">Đóng</button></div>;
  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-sm font-medium mb-1">Điểm Nghe (0-495)</label><input type="number" value={listeningScore} onChange={(e) => setListeningScore(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" min={0} max={495} placeholder="Tùy chọn" /></div>
        <div><label className="block text-sm font-medium mb-1">Điểm Đọc (0-495)</label><input type="number" value={readingScore} onChange={(e) => setReadingScore(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" min={0} max={495} placeholder="Tùy chọn" /></div>
      </div>
      <div><label className="block text-sm font-medium mb-1">Lý do <span className="text-destructive">*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" rows={2} maxLength={1000} required placeholder="Lý do ghi đè (bắt buộc)" /></div>
      <div><label className="block text-sm font-medium mb-1">Khóa Idempotency (tùy chọn)</label><input type="text" value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" maxLength={255} placeholder="Tránh chạy lại nhiều lần" /></div>
      {actionError && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{actionError}</div>}
      <div className="flex gap-2"><button type="submit" disabled={override.isPending} className="rounded bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-amber-700">{override.isPending ? 'Đang xử lý...' : 'Ghi đè'}</button><button type="button" onClick={onClose} className="rounded border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">Hủy</button></div>
    </form>
  );
}

function RestoreForm({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const restore = useRestoreResult();
  const [version, setVersion] = useState('');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!reason.trim()) { setActionError('Lý do là bắt buộc.'); return; }
    if (!version || parseInt(version, 10) <= 0) { setActionError('Phiên bản snapshot không hợp lệ.'); return; }
    try {
      await restore.mutateAsync({ attemptId, targetSnapshotVersion: parseInt(version, 10), reason: reason.trim() });
      setSuccess(true);
    } catch (err) { setActionError(actionErrorMessage(err)); }
  };

  if (success) return <div className="p-3 bg-green-50 rounded text-sm"><p className="font-medium text-green-800">Đã khôi phục thành công.</p><button onClick={onClose} className="mt-2 underline text-green-700">Đóng</button></div>;
  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div><label className="block text-sm font-medium mb-1">Phiên bản Snapshot đích <span className="text-destructive">*</span></label><input type="number" value={version} onChange={(e) => setVersion(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" min={1} required placeholder="VD: 1, 2, 3" /></div>
      <div><label className="block text-sm font-medium mb-1">Lý do <span className="text-destructive">*</span></label><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-input bg-background px-3 py-2 text-sm" rows={2} maxLength={1000} required placeholder="Lý do khôi phục (bắt buộc)" /></div>
      {actionError && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{actionError}</div>}
      <div className="flex gap-2"><button type="submit" disabled={restore.isPending} className="rounded bg-purple-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-purple-700">{restore.isPending ? 'Đang xử lý...' : 'Khôi phục'}</button><button type="button" onClick={onClose} className="rounded border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">Hủy</button></div>
    </form>
  );
}

function ResultDetail({ attemptId }: { attemptId: number }) {
  const { data: result, isLoading, isError, error } = useAdminResultDetail(attemptId);
  const [activeForm, setActiveForm] = useState<'regrade' | 'override' | 'restore' | null>(null);
  const navigate = useNavigate();
  useAuthRedirect(error);

  if (isLoading) return <div className="h-32 bg-muted rounded animate-pulse" />;
  if (isError || !result) return <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">{actionErrorMessage(error)}</div>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/admin/ket-qua-thi-online')} className="text-sm text-muted-foreground hover:text-foreground">← Quay lại danh sách</button>
      <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-card">
        <div><p className="text-xs text-muted-foreground">Attempt ID</p><p className="font-mono font-medium">{result.attemptId}</p></div>
        <div><p className="text-xs text-muted-foreground">Đề thi</p><p className="font-medium">{result.examTitle}</p></div>
        <div><p className="text-xs text-muted-foreground">Người dùng</p><p className="font-mono text-sm">{result.userId}</p></div>
        <div><p className="text-xs text-muted-foreground">Trạng thái</p><StatusBadge status={result.status} /></div>
        <div><p className="text-xs text-muted-foreground">Điểm Nghe</p><p className="text-xl font-bold">{result.listeningScore}</p></div>
        <div><p className="text-xs text-muted-foreground">Điểm Đọc</p><p className="text-xl font-bold">{result.readingScore}</p></div>
        <div className="col-span-2"><p className="text-xs text-muted-foreground">Tổng điểm</p><p className="text-3xl font-bold text-primary">{result.totalScore}</p></div>
        <div><p className="text-xs text-muted-foreground">Grading Version</p><p className="font-mono text-sm">{result.gradingSnapshotVersion ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">Pinned Version</p><p className="font-mono text-sm">{result.pinnedSnapshotVersion ?? '—'}</p></div>
        <div className="col-span-2"><p className="text-xs text-muted-foreground">Thời gian</p><p className="text-sm">{new Date(result.createdAt).toLocaleString('vi-VN')}</p></div>
      </div>
      {(result.attemptStatus === 'COMPLETED' || result.attemptStatus === 'SUBMITTED') ? (
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-sm">Thao tác</h3>
          {!activeForm ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setActiveForm('regrade')} className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700">Chấm lại</button>
              <button onClick={() => setActiveForm('override')} className="rounded bg-amber-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-700">Ghi đè điểm</button>
              <button onClick={() => setActiveForm('restore')} className="rounded bg-purple-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-purple-700">Khôi phục phiên bản</button>
            </div>
          ) : (
            <ActionForm>
              {activeForm === 'regrade' && <RegradeForm attemptId={attemptId} onClose={() => setActiveForm(null)} />}
              {activeForm === 'override' && <OverrideForm attemptId={attemptId} onClose={() => setActiveForm(null)} />}
              {activeForm === 'restore' && <RestoreForm attemptId={attemptId} onClose={() => setActiveForm(null)} />}
            </ActionForm>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Thao tác không khả dụng cho trạng thái: {result.attemptStatus}</p>
      )}
    </div>
  );
}

export default function OnlineResultPage() {
  const [searchParams] = useSearchParams();
  const detailId = searchParams.get('id');
  return (
    <>
      <AnishHeader />
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Kết quả thi trực tuyến</h1>
          <p className="text-muted-foreground text-sm">Xem và quản lý kết quả thi của người dùng.</p>
        </div>
        {detailId ? <ResultDetail attemptId={parseInt(detailId, 10)} /> : <ResultList />}
      </div>
    </>
  );
}
