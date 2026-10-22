// src/services/ai/aiSchema.ts
import { z } from 'zod';

export const aiPlanItemSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  orderIndex: z.number().int().min(1),
  exerciseSlug: z.string().min(1),
  sets: z.number().int().positive(),
  targetReps: z.number().int().positive().nullable().optional(),
  targetDurationSeconds: z.number().int().positive().nullable().optional(),
  restSeconds: z.number().int().min(0).default(45),
  notes: z.string().nullable().optional(),
});

export const aiPlanResponseSchema = z.object({
  items: z.array(aiPlanItemSchema).min(1, 'AI generated plan must contain at least one item'),
});

export type AIPlanItem = z.infer<typeof aiPlanItemSchema>;
export type AIPlanResponse = z.infer<typeof aiPlanResponseSchema>;
