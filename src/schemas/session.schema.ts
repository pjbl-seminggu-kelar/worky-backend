import { z } from 'zod';

export const startSessionSchema = z.object({
  exerciseId: z.string().uuid('Exercise ID harus berformat UUID'),
  planId: z.string().uuid().optional(),
  sessionName: z.string().optional(),
  modelVersion: z.string().default('v1.0.0'),
});

export const logEventsSchema = z.object({
  events: z.array(
    z.object({
      eventType: z.enum([
        'REP_COMPLETED',
        'VALID_REP',
        'INVALID_REP',
        'FORM_ERROR_START',
        'FORM_ERROR_END',
        'TRACKING_LOST',
        'TRACKING_RECOVERED',
        'SESSION_PAUSED',
        'SESSION_RESUMED',
        'SESSION_COMPLETED',
      ]),
      repIndex: z.number().int().optional(),
      errorCode: z.string().optional(),
      startMs: z.number().int('startMs harus berupa integer milidetik'),
      endMs: z.number().int().optional(),
      durationMs: z.number().int().optional(),
      confidence: z.number().optional(),
      details: z.record(z.string(), z.any()).optional(),
    })
  ),
});

export const completeSessionSchema = z.object({
  activeDurationSeconds: z.number().int(),
  totalAttempts: z.number().int(),
  totalReps: z.number().int(),
  validReps: z.number().int(),
  invalidReps: z.number().int(),
  unassessedAttempts: z.number().int().default(0),
  validHoldSeconds: z.number().int().optional(),
});