import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../api';
import { CatalogResponse, ExamMode } from '../../types/exam';

export interface CatalogFilters {
  skillType: 'LR' | 'SW';
  collectionId?: string;
  search?: string;
}

export interface StartAttemptResult {
  attemptId: number;
  status: string;
  mode: string;
}

export function useExamsQuery(filters: CatalogFilters) {
  return useQuery({
    queryKey: ['toeic-exams', filters],
    queryFn: async () => {
      const { data } = await api.get<CatalogResponse>('/toeic-exams', {
        params: {
          skillType: filters.skillType,
          collectionId: filters.collectionId || undefined,
          search: filters.search || undefined,
          page: 1,
          // ponytail: load-more/pagination UI when the catalog exceeds 100 exams
          pageSize: 100,
        },
      });
      return data;
    },
  });
}

export function useCreateAttempt() {
  return useMutation({
    mutationFn: async ({ examId, mode }: { examId: number; mode: ExamMode }) => {
      const { data } = await api.post<StartAttemptResult>(`/toeic-exams/${examId}/attempts`, {
        mode: mode.toUpperCase(),
      });
      return data;
    },
  });
}
