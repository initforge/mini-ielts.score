import { z } from 'zod';

export const mixedExamSourceSchema = z.object({
  sourceExamId: z.number().int().positive(),
  sourceVersion: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  sectionMapping: z.record(z.unknown()).optional(),
});

export const mixedExamCreateSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  collectionId: z.number().int().positive(),
  skillType: z.enum(['LR', 'SW']),
  durationMinutes: z.number().int().positive(),
  sources: z.array(mixedExamSourceSchema).min(1),
});

export const mixedExamUpdateSourcesSchema = z.object({
  sources: z.array(mixedExamSourceSchema).min(1),
});

export type MixedExamCreateInput = z.infer<typeof mixedExamCreateSchema>;
export type MixedExamUpdateSourcesInput = z.infer<typeof mixedExamUpdateSourcesSchema>;
