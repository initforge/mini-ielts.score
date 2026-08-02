import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import api from '../../api';
import { AnishHeader } from '../../components/AnishShell';
import {
  useAdminExams,
  useMixedExam,
  useCreateMixedExam,
  usePublishMixedExam,
} from './lib/mixed-exam-hooks';
import { useAuthRedirect, actionErrorMessage } from './lib/admin-utils';
import type { MixedExam } from './types/mixed-exam';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PUBLISHED: 'bg-green-100 text-green-800',
    DRAFT: 'bg-yellow-100 text-yellow-800',
    ARCHIVED: 'bg-slate-200 text-slate-700',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function MixedExamList() {
  const { data: examsData, isLoading, isError, error } = useQuery<{ items: MixedExam[] }>({    queryKey: ['mixed-exams'],
    queryFn: async () => {
      // ponytail: List all mixed exams. Backend doesn't have a list endpoint; filter is_mixed from admin list.
      const { data } = await api.get<{ items: { id: number; title: string; status: string; is_mixed?: boolean }[] }>(
        '/admin/exams',
        { params: { page: 1, pageSize: 200 } }
      );
      // ponytail: filter only mixed exams. Backend should add /admin/mixed-exams list endpoint.
      return { items: data.items.filter((e) => e.is_mixed) as MixedExam[] };
    },
    retry: false,
  });

  useAuthRedirect(error);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Đang tải">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">
        {actionErrorMessage(error)}
      </div>
    );
  }

  if (!examsData?.items.length) {
    return <p className="text-muted-foreground text-sm">Chưa có đề hỗn hợp nào.</p>;
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tiêu đề</th>
            <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Trạng thái</th>
            <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {examsData.items.map((exam) => (
            <tr key={exam.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{exam.title}</td>
              <td className="px-4 py-3"><StatusBadge status={exam.status} /></td>
              <td className="px-4 py-3 text-right">
                <Link
                  to={`/admin/de-hon-hop/${exam.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Chi tiết
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CreateFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function CreateMixedExamForm({ onSuccess, onCancel }: CreateFormProps) {
  const create = useCreateMixedExam();
  const { data: examsData } = useAdminExams();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [skillType, setSkillType] = useState<'LR' | 'SW'>('LR');
  const [durationMinutes, setDurationMinutes] = useState('120');
  const [sourceIds, setSourceIds] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !slug.trim()) {
      setFormError('Tiêu đề và slug là bắt buộc.');
      return;
    }
    const sources = sourceIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id, idx) => ({ sourceExamId: parseInt(id, 10), sourceVersion: 1, orderIndex: idx }));

    if (sources.length === 0) {
      setFormError('Cần chọn ít nhất một đề thi nguồn.');
      return;
    }

    try {
      await create.mutateAsync({
        title: title.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        collectionId: 1,
        skillType,
        durationMinutes: parseInt(durationMinutes, 10) || 120,
        sources,
      });
      onSuccess();
    } catch (err) {
      setFormError(actionErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">Tiêu đề</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
          maxLength={255}
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-1">Slug (URL)</label>
        <input
          id="slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm lowercase"
          required
          maxLength={255}
          pattern="[a-z0-9-]+"
          title="Chỉ chấp nhận chữ thường, số và dấu gạch ngang"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="skillType" className="block text-sm font-medium mb-1">Kỹ năng</label>
          <select
            id="skillType"
            value={skillType}
            onChange={(e) => setSkillType(e.target.value as 'LR' | 'SW')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="LR">Nghe - Đọc (LR)</option>
            <option value="SW">Nói - Viết (SW)</option>
          </select>
        </div>
        <div>
          <label htmlFor="duration" className="block text-sm font-medium mb-1">Thời gian (phút)</label>
          <input
            id="duration"
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            min={1}
            max={300}
          />
        </div>
      </div>
      <div>
        <label htmlFor="sources" className="block text-sm font-medium mb-1">
          ID đề thi nguồn (cách nhau bởi dấu phẩy)
        </label>
        <textarea
          id="sources"
          value={sourceIds}
          onChange={(e) => setSourceIds(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={2}
          placeholder="1, 2, 3"
        />
        {examsData?.items && (
          <p className="mt-1 text-xs text-muted-foreground">
            Các đề thi khả dụng (PUBLISHED):{' '}
            {examsData.items.filter((e) => e.status === 'PUBLISHED').map((e) => `${e.id} (${e.title})`).join(', ')}
          </p>
        )}
      </div>
      {formError && (
        <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {formError}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {create.isPending ? 'Đang tạo...' : 'Tạo đề hỗn hợp'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}

function MixedExamDetail({ examId }: { examId: number }) {
  const { data: exam, isLoading, isError, error } = useMixedExam(examId);
  const publish = usePublishMixedExam();
  const [actionError, setActionError] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useAuthRedirect(error);

  if (isLoading) {
    return <div className="h-32 bg-muted rounded animate-pulse" />;
  }

  if (isError || !exam) {
    return (
      <div role="alert" className="text-destructive text-sm p-3 rounded bg-destructive/10">
        {actionErrorMessage(error)}
      </div>
    );
  }

  const handlePublish = async () => {
    setActionError(null);
    try {
      await publish.mutateAsync(examId);
      await qc.invalidateQueries({ queryKey: ['mixed-exam', examId] });
      await qc.invalidateQueries({ queryKey: ['mixed-exams'] });
    } catch (err) {
      setActionError(actionErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{exam.title}</h2>
          <p className="text-sm text-muted-foreground">Slug: {exam.slug}</p>
          <p className="text-sm text-muted-foreground">Phiên bản: {exam.version} | Đã xuất bản: {exam.published_version ?? '—'}</p>
        </div>
        <StatusBadge status={exam.status} />
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Nguồn đề thi</h3>
        {!exam.sources?.length ? (
          <p className="text-muted-foreground text-sm">Chưa có nguồn nào.</p>
        ) : (
          <ul className="space-y-1">
            {exam.sources.map((src, idx) => (
              <li key={idx} className="text-sm border rounded px-3 py-2">
                <span className="font-medium">#{idx + 1}</span> — ID {src.sourceExamId} (v{src.sourceVersion})
                {src.sourceTitle && <span className="ml-2 text-muted-foreground">({src.sourceTitle})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {actionError && (
        <div role="alert" className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-3 underline">Đóng</button>
        </div>
      )}

      <div className="flex gap-2">
        {exam.status === 'DRAFT' && (
          <button
            onClick={() => void handlePublish()}
            disabled={publish.isPending}
            className="inline-flex items-center justify-center rounded-md bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {publish.isPending ? 'Đang xuất bản...' : 'Xuất bản'}
          </button>
        )}
        <button
          onClick={() => navigate('/admin/de-hon-hop')}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}

export default function MixedExamPage() {
  const [showCreate, setShowCreate] = useState(false);

  // ponytail: Route /admin/de-hon-hop shows list; /admin/de-hon-hop/:id shows detail.
  // Parse from URL.
  const pathParts = window.location.pathname.split('/');
  const idPart = pathParts[pathParts.length - 1];
  const detailId = idPart && idPart !== 'de-hon-hop' ? parseInt(idPart, 10) : null;

  return (
    <>
      <AnishHeader />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Đề hỗn hợp</h1>
            <p className="text-muted-foreground text-sm">Tạo và quản lý đề thi hỗn hợp từ nhiều nguồn.</p>
          </div>
          {!detailId && !showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
            >
              + Tạo mới
            </button>
          )}
        </div>

        {showCreate && (
          <div className="mb-6 p-4 border rounded-lg bg-card">
            <h2 className="font-semibold mb-4">Tạo đề hỗn hợp mới</h2>
            <CreateMixedExamForm
              onSuccess={() => {
                setShowCreate(false);
              }}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        )}

        {detailId ? <MixedExamDetail examId={detailId} /> : <MixedExamList />}
      </div>
    </>
  );
}
