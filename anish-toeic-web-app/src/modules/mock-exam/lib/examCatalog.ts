/**
 * Shared catalog lookups for result/review/history pages (S6-FE).
 *
 * `toeic_attempts` rows carry only exam_id (no skill_type, no title), so the
 * pages map exam_id → exam via the public catalog. One shared query avoids an
 * N+1 fetch per page and keeps the SW/LR branching in one place.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '../../../api';
import { Exam } from '../../../types/exam';

interface CatalogResponse {
  items: Exam[];
}

/** All exams (both skill types) from the public catalog. */
export function useExamCatalog() {
  return useQuery<Exam[]>({
    queryKey: ['toeic-exams', 'all'],
    queryFn: async () => {
      const { data } = await api.get<CatalogResponse>('/toeic-exams', {
        params: { page: 1, pageSize: 100 },
      });
      return data.items ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Resolve an exam by id from the catalog (undefined while loading/unknown). */
export function useExamById(examId: number | null | undefined): Exam | undefined {
  const { data: exams } = useExamCatalog();
  if (!examId || !exams) return undefined;
  return exams.find((e) => e.id === examId);
}

/* ---- P3 offline catalog UX ---- */

/** True when the device reports offline or the query failed as a network error. */
export function isNetworkOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return error instanceof AxiosError && !error.response;
}

/** Reactive `navigator.onLine`, updated via online/offline events. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** localStorage cache key matching the current catalog filters. */
export function catalogCacheKey(skillType: string, collectionId: string, search: string): string {
  return encodeURIComponent(`${skillType}:${collectionId || '-'}:${search || '-'}`);
}
