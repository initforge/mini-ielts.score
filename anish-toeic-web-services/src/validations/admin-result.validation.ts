import { z } from 'zod';

export const resultFiltersSchema = z.object({
  examId: z.number().int().positive().optional(),
  userId: z.string().optional(),
  status: z.enum(['PROVISIONAL', 'FINAL']).optional(),
  minScore: z.number().int().min(0).max(990).optional(),
  maxScore: z.number().int().min(0).max(990).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const regradeSchema = z.object({
  reason: z.string().min(1).max(1000),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export const overrideSchema = z.object({
  listeningScore: z.number().int().min(0).max(495).optional(),
  readingScore: z.number().int().min(0).max(495).optional(),
  reason: z.string().min(1).max(1000),
  idempotencyKey: z.string().min(1).max(255).optional(),
}).refine(data => data.listeningScore !== undefined || data.readingScore !== undefined, {
  message: 'At least one of listeningScore or readingScore must be provided',
}).refine(data => {
  const listening = data.listeningScore ?? 0;
  const reading = data.readingScore ?? 0;
  return listening + reading <= 990;
}, {
  message: 'Total score (listening + reading) cannot exceed 990',
});

export const restoreSchema = z.object({
  targetSnapshotVersion: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
});

export type ResultFiltersInput = z.infer<typeof resultFiltersSchema>;
export type RegradeInput = z.infer<typeof regradeSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;
export type RestoreInput = z.infer<typeof restoreSchema>;
