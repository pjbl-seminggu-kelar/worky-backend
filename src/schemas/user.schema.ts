import { z } from 'zod';

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).optional(),
  age: z.number().int().positive().optional(),
  weightKg: z.number().positive().optional(),
  goal: z.enum([
    'WEIGHT_LOSS',
    'MUSCLE_BUILDING',
    'STRENGTH',
    'GENERAL_FITNESS',
  ]).optional(),
  experienceLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  sessionDurationMinutes: z.number().int().positive().optional(),
  equipment: z.array(z.string()).optional(),
  reminderTime: z.string().optional(),
});