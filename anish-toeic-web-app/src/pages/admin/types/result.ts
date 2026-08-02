// Admin result API types mirroring backend contracts.
export interface AdminResultItem {
  attemptId: number;
  userId: string;
  examId: number;
  examTitle: string;
  examSlug: string;
  listeningScore: number;
  readingScore: number;
  totalScore: number;
  status: 'PROVISIONAL' | 'FINAL';
  gradingSnapshotVersion: number | null;
  attemptStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminResultDetail extends AdminResultItem {
  pinnedSnapshotVersion: number | null;
  questionScores: Record<string, unknown>[];
  metrics: Record<string, unknown> | null;
}

export interface AdminResultListResponse {
  items: AdminResultItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RegradeResponse {
  success: boolean;
  attemptId: number;
  previousScores: { listening: number; reading: number; total: number };
  newScores: { listening: number; reading: number; total: number };
  replayed?: boolean;
  message?: string;
}

export interface OverrideResponse {
  success: boolean;
  attemptId: number;
  previousScores: { listening: number; reading: number; total: number };
  newScores: { listening: number; reading: number; total: number };
  replayed?: boolean;
  message?: string;
}

export interface RestoreResponse {
  success: boolean;
  attemptId: number;
  restoredToVersion: number;
  previousScores: { listening: number; reading: number; total: number };
}

export interface ResultFilters {
  examId?: number;
  userId?: string;
  status?: 'PROVISIONAL' | 'FINAL';
  minScore?: number;
  maxScore?: number;
  page?: number;
  pageSize?: number;
}
