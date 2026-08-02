// Mixed exam API types mirroring backend contracts.
export interface MixedExamSource {
  sourceExamId: number;
  sourceVersion: number;
  orderIndex: number;
  sourceTitle?: string;
  sourceSlug?: string;
  sourceStatus?: string;
  sectionMapping?: Record<string, unknown>;
}

export interface MixedExam {
  id: number;
  collection_id: number;
  slug: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  published_version: number | null;
  is_mixed: boolean;
  sources: MixedExamSource[];
}

export interface MixedExamCreateInput {
  title: string;
  slug: string;
  collectionId: number;
  skillType: 'LR' | 'SW';
  durationMinutes: number;
  sources: { sourceExamId: number; sourceVersion: number; orderIndex: number }[];
}

export interface CreateMixedExamResponse {
  examId: number;
  version: number;
}

export interface PublishMixedExamResponse {
  version: number;
}
