import { z } from 'zod';

export const updatePlanItemSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7).optional(), // 1: Senin ... 7: Minggu
  orderIndex: z.number().int().min(1).optional(),
  sets: z.number().int().positive('Set harus lebih dari 0').optional(),
  targetReps: z.number().int().positive().nullable().optional(),
  targetDurationSeconds: z.number().int().positive().nullable().optional(),
  restSeconds: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

export const generatePlanSchema = z.object({
  name: z.string().optional(),
  goal: z.enum([
    'WEIGHT_LOSS',
    'MUSCLE_BUILDING',
    'STRENGTH',
    'GENERAL_FITNESS',
  ]).optional(),
});