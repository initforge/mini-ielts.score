import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import type {
  ImportJob,
  ImportJobListResponse,
  ImportJobStatusType,
  CreateJobResponse,
  ConfirmUploadResponse,
  InspectionResult,
  FinalizeJobResponse,
  CancelJobResponse,
} from '../types/import-job';

// GET /api/admin/import/jobs
export function useImportJobs(filters: { page?: number; pageSize?: number; status?: ImportJobStatusType } = {}) {
  return useQuery<ImportJobListResponse>({
    queryKey: ['import-jobs', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.page) params.page = filters.page;
      if (filters.pageSize) params.pageSize = filters.pageSize;
      if (filters.status) params.status = filters.status;
      const { data } = await api.get<ImportJobListResponse>('/admin/import/jobs', { params });
      return data;
    },
    retry: false,
  });
}

// GET /api/admin/import/jobs/:id
export function useImportJob(jobId: number | null) {
  return useQuery<ImportJob>({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      const { data } = await api.get<ImportJob>(`/admin/import/jobs/${jobId}`);
      return data;
    },
    enabled: jobId !== null,
    retry: false,
  });
}

// POST /api/admin/import/jobs
export function useCreateImportJob() {
  const qc = useQueryClient();
  return useMutation<CreateJobResponse, Error, {
    title: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  }>({
    mutationFn: async (input) => {
      const { data } = await api.post<CreateJobResponse>('/admin/import/jobs', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
  });
}

// POST /api/admin/import/jobs/:id/confirm-upload
export function useConfirmUpload() {
  const qc = useQueryClient();
  return useMutation<ConfirmUploadResponse, Error, { jobId: number; sha256Hash: string }>({
    mutationFn: async ({ jobId, sha256Hash }) => {
      const { data } = await api.post<ConfirmUploadResponse>(`/admin/import/jobs/${jobId}/confirm-upload`, {
        jobId,
        sha256Hash,
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['import-job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
  });
}

// POST /api/admin/import/jobs/:id/inspect
export function useInspectJob() {
  const qc = useQueryClient();
  return useMutation<InspectionResult, Error, number>({
    mutationFn: async (jobId) => {
      const { data } = await api.post<InspectionResult>(`/admin/import/jobs/${jobId}/inspect`);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['import-job', vars] });
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
  });
}

// POST /api/admin/import/jobs/:id/finalize
export function useFinalizeJob() {
  const qc = useQueryClient();
  return useMutation<FinalizeJobResponse, Error, {
    jobId: number;
    collectionId: number;
    skillType: 'LR' | 'SW';
    durationMinutes: number;
  }>({
    mutationFn: async ({ jobId, collectionId, skillType, durationMinutes }) => {
      const { data } = await api.post<FinalizeJobResponse>(`/admin/import/jobs/${jobId}/finalize`, {
        jobId,
        collectionId,
        skillType,
        durationMinutes,
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['import-job', vars.jobId] });
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
  });
}

// DELETE /api/admin/import/jobs/:id
export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation<CancelJobResponse, Error, number>({
    mutationFn: async (jobId) => {
      const { data } = await api.delete<CancelJobResponse>(`/admin/import/jobs/${jobId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-jobs'] });
    },
  });
}
