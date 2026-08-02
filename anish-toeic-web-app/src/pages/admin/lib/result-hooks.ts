import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import type {
  AdminResultDetail,
  AdminResultListResponse,
  ResultFilters,
  RegradeResponse,
  OverrideResponse,
  RestoreResponse,
} from '../types/result';

// GET /api/admin/results
export function useAdminResults(filters: ResultFilters = {}) {
  return useQuery<AdminResultListResponse>({
    queryKey: ['admin-results', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.examId) params.examId = filters.examId;
      if (filters.userId) params.userId = filters.userId;
      if (filters.status) params.status = filters.status;
      if (filters.minScore !== undefined) params.minScore = filters.minScore;
      if (filters.maxScore !== undefined) params.maxScore = filters.maxScore;
      if (filters.page) params.page = filters.page;
      if (filters.pageSize) params.pageSize = filters.pageSize;
      const { data } = await api.get<AdminResultListResponse>('/admin/results', { params });
      return data;
    },
    retry: false,
  });
}

// GET /api/admin/results/:attemptId
export function useAdminResultDetail(attemptId: number | null) {
  return useQuery<AdminResultDetail>({
    queryKey: ['admin-result-detail', attemptId],
    queryFn: async () => {
      const { data } = await api.get<AdminResultDetail>(`/admin/results/${attemptId}`);
      return data;
    },
    enabled: attemptId !== null,
    retry: false,
  });
}

// POST /api/admin/results/:attemptId/regrade
export function useRegradeResult() {
  const qc = useQueryClient();
  return useMutation<RegradeResponse, Error, { attemptId: number; reason: string; idempotencyKey?: string }>({
    mutationFn: async ({ attemptId, reason, idempotencyKey }) => {
      const body: Record<string, string> = { reason };
      if (idempotencyKey) body.idempotencyKey = idempotencyKey;
      const { data } = await api.post<RegradeResponse>(`/admin/results/${attemptId}/regrade`, body);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-results'] });
      qc.invalidateQueries({ queryKey: ['admin-result-detail', vars.attemptId] });
    },
  });
}

// POST /api/admin/results/:attemptId/override
export function useOverrideResult() {
  const qc = useQueryClient();
  return useMutation<OverrideResponse, Error, {
    attemptId: number;
    listeningScore?: number;
    readingScore?: number;
    reason: string;
    idempotencyKey?: string;
  }>({
    mutationFn: async ({ attemptId, listeningScore, readingScore, reason, idempotencyKey }) => {
      const body: Record<string, string | number> = { reason };
      if (listeningScore !== undefined) body.listeningScore = listeningScore;
      if (readingScore !== undefined) body.readingScore = readingScore;
      if (idempotencyKey) body.idempotencyKey = idempotencyKey;
      const { data } = await api.post<OverrideResponse>(`/admin/results/${attemptId}/override`, body);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-results'] });
      qc.invalidateQueries({ queryKey: ['admin-result-detail', vars.attemptId] });
    },
  });
}

// POST /api/admin/results/:attemptId/restore
export function useRestoreResult() {
  const qc = useQueryClient();
  return useMutation<RestoreResponse, Error, { attemptId: number; targetSnapshotVersion: number; reason: string }>({
    mutationFn: async ({ attemptId, targetSnapshotVersion, reason }) => {
      const { data } = await api.post<RestoreResponse>(`/admin/results/${attemptId}/restore`, {
        targetSnapshotVersion,
        reason,
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-results'] });
      qc.invalidateQueries({ queryKey: ['admin-result-detail', vars.attemptId] });
    },
  });
}
