import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { AnishHeader } from '../../components/AnishShell';
import { useImportJobs, useImportJob, useCreateImportJob, useInspectJob, useFinalizeJob, useCancelJob } from './lib/import-hooks';
import { useAuthRedirect, actionErrorMessage } from './lib/admin-utils';
import { ImportJobStatus, type ImportJobStatusType } from './types/import-job';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

function statusLabel(s: ImportJobStatusType): string {
  const map: Record<ImportJobStatusType, string> = {
    UPLOADING: 'Đang tải lên',
    INSPECTING: 'Đang kiểm tra',
    INSPECT_FAILED: 'Kiểm tra thất bại',
    FINALIZING: 'Đang hoàn tất',
    READY: 'Sẵn sàng',
    FAILED: 'Thất bại',
    CANCELLED: 'Đã hủy',
  };
  return map[s] ?? s;
}

function statusColor(s: ImportJobStatusType): string {
  const map: Record<string, string> = {
    UPLOADING: 'bg-blue-100 text-blue-800',
    INSPECTING: 'bg-purple-100 text-purple-800',
    INSPECT_FAILED: 'bg-red-100 text-red-800',
    FINALIZING: 'bg-amber-100 text-amber-800',
    READY: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-slate-200 text-slate-700',
  };
  return map[s] ?? 'bg-gray-100 text-gray-700';
}

function JobBadge({ status }: { status: ImportJobStatusType }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(status)}`}>{statusLabel(status)}</span>;
}

function CreateJobForm({ onSuccess }: { onSuccess: (jobId: number) => void }) {
  const create = useCreateImportJob();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_FILE_SIZE) {
      setFormError('File vượt quá 100MB.');
      setFile(null);
      return;
    }
    setFile(f);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) { setFormError('Tiêu đề là bắt buộc.'); return; }
    if (!file) { setFormError('Chọn file DOCX hoặc ZIP.'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const fileType = ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/zip';
    try {
      const result = await create.mutateAsync({ title: title.trim(), fileName: file.name, fileType, fileSizeBytes: file.size });
      onSuccess(result.jobId);
    } catch (err) { setFormError(actionErrorMessage(err)); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div><label className="block text-sm font-medium mb-1">Tiêu đề công việc</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required maxLength={255} /></div>
      <div><label className="block text-sm font-medium mb-1">File DOCX/ZIP (tối đa 100MB)</label><input type="file" accept=".docx,.zip" onChange={handleFileChange} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" /></div>
      {formError && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{formError}</div>}
      <button type="submit" disabled={create.isPending} className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">{create.isPending ? 'Đang tạo...' : 'Tạo công việc'}</button>
    </form>
  );
}

function JobList() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ImportJobStatusType | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useImportJobs({ page, pageSize: 20, status: statusFilter || undefined });
  useAuthRedirect(error);

  if (isError) return <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">{actionErrorMessage(error)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-muted-foreground">Lọc:</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ImportJobStatusType | ''); setPage(1); }} className="rounded border border-input bg-background px-2 py-1.5 text-sm">
            <option value="">Tất cả</option>
            {Object.values(ImportJobStatus).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
          {showCreate ? 'Hủy' : '+ Tạo công việc nhập'}
        </button>
      </div>

      {showCreate && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <h3 className="font-semibold text-sm">Tạo công việc nhập mới</h3>
          <CreateJobForm onSuccess={(jobId) => { setShowCreate(false); navigate(`/admin/nhap-de-thi-online?id=${jobId}`); }} />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">{[1,2,3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
      ) : !data?.items.length ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Chưa có công việc nhập nào.</p>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tiêu đề</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">File</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tạo lúc</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{job.id}</td>
                    <td className="px-4 py-3 font-medium">{job.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{job.fileName}</td>
                    <td className="px-4 py-3"><JobBadge status={job.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(job.createdAt).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => navigate(`/admin/nhap-de-thi-online?id=${job.id}`)} className="text-xs font-medium text-primary hover:underline">Xem / Quản lý</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Tổng: {data.total}</p>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-input bg-background px-3 py-1 text-sm disabled:opacity-50 hover:bg-accent">←</button>
              <button disabled={(data.total / 20) <= page} onClick={() => setPage((p) => p + 1)} className="rounded border border-input bg-background px-3 py-1 text-sm disabled:opacity-50 hover:bg-accent">→</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function JobDetail({ jobId }: { jobId: number }) {
  const { data: job, isLoading, isError, error } = useImportJob(jobId);
  const inspect = useInspectJob();
  const finalize = useFinalizeJob();
  const cancel = useCancelJob();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Finalize form state
  const [collectionId, setCollectionId] = useState('1');
  const [skillType, setSkillType] = useState<'LR' | 'SW'>('LR');
  const [durationMinutes, setDurationMinutes] = useState('60');

  useAuthRedirect(error);

  const handleInspect = async () => {
    setFormError(null);
    try {
      await inspect.mutateAsync(jobId);
      setSuccessMsg('Đã kiểm tra xong.');
    } catch (err) { setFormError(actionErrorMessage(err)); }
  };

  const handleFinalize = async () => {
    setFormError(null);
    try {
      const result = await finalize.mutateAsync({ jobId, collectionId: parseInt(collectionId, 10), skillType, durationMinutes: parseInt(durationMinutes, 10) });
      setSuccessMsg(`Hoàn tất! Exam ID: ${result.examId}`);
    } catch (err) { setFormError(actionErrorMessage(err)); }
  };

  const handleCancel = async () => {
    if (!confirm('Hủy công việc nhập này?')) return;
    setFormError(null);
    try {
      await cancel.mutateAsync(jobId);
      navigate('/admin/nhap-de-thi-online');
    } catch (err) { setFormError(actionErrorMessage(err)); }
  };

  if (isLoading) return <div className="h-32 bg-muted rounded animate-pulse" />;
  if (isError || !job) return <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">{actionErrorMessage(error)}</div>;

  const TERMINAL_STATUSES: ImportJobStatusType[] = [ImportJobStatus.READY, ImportJobStatus.CANCELLED];
  const canInspect = job.status === ImportJobStatus.INSPECTING;
  const canFinalize = job.status === ImportJobStatus.INSPECTING && job.inspectionResult?.valid === true;
  const canCancel = !TERMINAL_STATUSES.includes(job.status);

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/admin/nhap-de-thi-online')} className="text-sm text-muted-foreground hover:text-foreground">← Quay lại danh sách</button>

      <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-card">
        <div><p className="text-xs text-muted-foreground">Job ID</p><p className="font-mono font-medium">{job.id}</p></div>
        <div><p className="text-xs text-muted-foreground">Trạng thái</p><JobBadge status={job.status} /></div>
        <div><p className="text-xs text-muted-foreground">Tiêu đề</p><p className="font-medium">{job.title}</p></div>
        <div><p className="text-xs text-muted-foreground">File</p><p className="text-sm">{job.fileName}</p></div>
        <div><p className="text-xs text-muted-foreground">Kích thước</p><p className="text-sm">{(job.fileSizeBytes / 1024).toFixed(1)} KB</p></div>
        <div><p className="text-xs text-muted-foreground">Tạo lúc</p><p className="text-sm">{new Date(job.createdAt).toLocaleString('vi-VN')}</p></div>
        {job.producedExamId && <div><p className="text-xs text-muted-foreground">Exam ID đã tạo</p><p className="font-mono text-sm">{job.producedExamId}</p></div>}
        {job.statusMessage && <div className="col-span-2"><p className="text-xs text-muted-foreground">Thông báo</p><p className="text-sm text-destructive">{job.statusMessage}</p></div>}
      </div>

      {/* Inspection result */}
      {job.inspectionResult && (
        <div className="border rounded-lg p-4 bg-card space-y-2">
          <h3 className="font-semibold text-sm">Kết quả kiểm tra</h3>
          <p className="text-sm">Hợp lệ: <span className={job.inspectionResult.valid ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{job.inspectionResult.valid ? 'Có' : 'Không'}</span></p>
          <p className="text-sm">Media: {job.inspectionResult.mediaCount} file(s)</p>
          {job.inspectionResult.warnings.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 rounded p-2">
              {job.inspectionResult.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}
          {job.inspectionResult.errors.length > 0 && (
            <div className="text-sm text-red-700 bg-red-50 rounded p-2">
              {job.inspectionResult.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          {job.inspectionResult.examPreview && (
            <p className="text-sm text-muted-foreground">Preview: {job.inspectionResult.examPreview.sections} phần, {job.inspectionResult.examPreview.questions} câu</p>
          )}
        </div>
      )}

      {formError && <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{formError}<button onClick={() => setFormError(null)} className="ml-3 underline">Đóng</button></div>}
      {successMsg && <div className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded">{successMsg}<button onClick={() => setSuccessMsg(null)} className="ml-3 underline">Đóng</button></div>}

      {/* Action controls */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-sm">Quản lý công việc</h3>
        <div className="flex gap-2 flex-wrap">
          {canInspect && (
            <button onClick={() => void handleInspect()} disabled={inspect.isPending} className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
              {inspect.isPending ? 'Đang kiểm tra...' : 'Kiểm tra file'}
            </button>
          )}
          {canCancel && (
            <button onClick={() => void handleCancel()} disabled={cancel.isPending} className="rounded border border-red-300 text-red-700 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-red-50">
              {cancel.isPending ? 'Đang hủy...' : 'Hủy công việc'}
            </button>
          )}
        </div>

        {canFinalize && (
          <div className="border-t pt-3 space-y-3">
            <h4 className="text-sm font-medium">Hoàn tất nhập đề thi</h4>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-muted-foreground mb-1">Collection ID</label><input type="number" value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" min={1} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Kỹ năng</label><select value={skillType} onChange={(e) => setSkillType(e.target.value as 'LR' | 'SW')} className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm"><option value="LR">LR</option><option value="SW">SW</option></select></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Thời gian (phút)</label><input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" min={1} max={300} /></div>
            </div>
            <button onClick={() => void handleFinalize()} disabled={finalize.isPending} className="rounded bg-green-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-green-700">
              {finalize.isPending ? 'Đang hoàn tất...' : 'Hoàn tất nhập đề thi'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnlineImportPage() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('id');
  return (
    <>
      <AnishHeader />
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Nhập đề thi online</h1>
          <p className="text-muted-foreground text-sm">Tạo và quản lý công việc nhập đề thi từ file DOCX/ZIP.</p>
        </div>
        {jobId ? <JobDetail jobId={parseInt(jobId, 10)} /> : <JobList />}
      </div>
    </>
  );
}
