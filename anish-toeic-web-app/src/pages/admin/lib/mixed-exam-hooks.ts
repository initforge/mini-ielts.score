import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import type { MixedExam, MixedExamCreateInput, CreateMixedExamResponse, PublishMixedExamResponse } from '../types/mixed-exam';

// GET /api/admin/exams (reuse existing endpoint to list all exams for source selection).
export function useAdminExams() {
  return useQuery<{ items: { id: number; title: string; status: string; version: number }[] }>({
    queryKey: ['admin-exams-all'],
    queryFn: async () => {
      const { data } = await api.get('/admin/exams', { params: { page: 1, pageSize: 100 } });
      return data;
    },
    retry: false,
  });
}

// GET /api/admin/mixed-exams/:id
export function useMixedExam(examId: number | null) {
  return useQuery<MixedExam>({
    queryKey: ['mixed-exam', examId],
    queryFn: async () => {
      const { data } = await api.get<MixedExam>(`/admin/mixed-exams/${examId}`);
      return data;
    },
    enabled: examId !== null,
    retry: false,
  });
}

// POST /api/admin/mixed-exams
export function useCreateMixedExam() {
  const qc = useQueryClient();
  return useMutation<CreateMixedExamResponse, Error, MixedExamCreateInput>({
    mutationFn: async (input) => {
      const { data } = await api.post<CreateMixedExamResponse>('/admin/mixed-exams', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mixed-exams'] });
    },
  });
}

// PATCH /api/admin/mixed-exams/:id/sources
export function useUpdateMixedExamSources() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { examId: number; sources: MixedExamCreateInput['sources'] }>({
    mutationFn: async ({ examId, sources }) => {
      const { data } = await api.patch<{ success: boolean }>(`/admin/mixed-exams/${examId}/sources`, { sources });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mixed-exam', vars.examId] });
      qc.invalidateQueries({ queryKey: ['mixed-exams'] });
    },
  });
}

// POST /api/admin/mixed-exams/:id/publish
export function usePublishMixedExam() {
  const qc = useQueryClient();
  return useMutation<PublishMixedExamResponse, Error, number>({
    mutationFn: async (examId) => {
      const { data } = await api.post<PublishMixedExamResponse>(`/admin/mixed-exams/${examId}/publish`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mixed-exams'] });
      qc.invalidateQueries({ queryKey: ['admin-exams'] });
    },
  });
}
