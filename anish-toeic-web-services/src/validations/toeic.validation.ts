import { z } from 'zod';

export const createAttemptSchema = z.object({
  mode: z.enum(['EXAM', 'PRACTICE']),
});

export const updateResponseSchema = z.object({
  selectedOptionId: z.number().nullable().optional(),
  textResponse: z.string().nullable().optional(),
  markedForReview: z.boolean().optional(),
  note: z.string().nullable().optional(),
  clientRevision: z.number().optional(),
});

export const presignMediaSchema = z.object({
  questionId: z.number(),
  fileName: z.string(),
  fileType: z.string(),
});
