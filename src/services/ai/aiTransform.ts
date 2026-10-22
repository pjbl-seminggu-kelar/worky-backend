// src/services/ai/aiTransform.ts
import { Prisma, Exercise } from '../../app/generated/prisma';
import { AIPlanItem } from './aiSchema';

export function transformAIPlanItems(
  planId: string,
  items: AIPlanItem[],
  exercises: Exercise[]
): Prisma.WorkoutPlanItemCreateManyInput[] {
  const exerciseBySlug = new Map<string, Exercise>();
  for (const ex of exercises) {
    exerciseBySlug.set(ex.slug, ex);
  }

  return items.map((item) => {
    const exercise = exerciseBySlug.get(item.exerciseSlug);
    if (!exercise) {
      throw new Error(`Exercise with slug '${item.exerciseSlug}' not found in available exercises`);
    }

    return {
      planId,
      exerciseId: exercise.id,
      dayOfWeek: item.dayOfWeek,
      orderIndex: item.orderIndex,
      sets: item.sets,
      targetReps: item.targetReps ?? null,
      targetDurationSeconds: item.targetDurationSeconds ?? null,
      restSeconds: item.restSeconds ?? 45,
      notes: item.notes ?? null,
    };
  });
}
