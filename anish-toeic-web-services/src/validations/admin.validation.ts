import { z } from 'zod';

export const lifecycleSchema = z.object({
  status: z.enum(['PUBLISHED', 'ARCHIVED', 'RESTORE']),
  expectedVersion: z.number().int().positive().optional(),
});

export type LifecycleInput = z.infer<typeof lifecycleSchema>;
