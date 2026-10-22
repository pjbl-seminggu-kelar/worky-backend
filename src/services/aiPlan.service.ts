// src/services/aiPlan.service.ts
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { Exercise, WorkoutGoal } from '../app/generated/prisma';
import { aiClient } from './ai/aiClient';
import { buildWorkoutPlanPrompt, AvailableExerciseInfo } from './ai/aiPrompt';
import { aiPlanResponseSchema } from './ai/aiSchema';
import { transformAIPlanItems } from './ai/aiTransform';
import { PlanService } from './plan.service';

const EQUIPMENT_MAP: Record<string, string> = {
  'Kursi / bangku': 'chair',
  'Pull-up bar': 'pull_up_bar',
  'Matras': 'exercise_mat',
  'Matras latihan': 'exercise_mat',
  'Tanpa alat': 'none',
  chair: 'chair',
  pull_up_bar: 'pull_up_bar',
  exercise_mat: 'exercise_mat',
};

export class AIPlanService {
  static async generatePlanFromAI(
    userId: string,
    customName?: string,
    customGoal?: WorkoutGoal
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const goal = (customGoal || user.goal || 'GENERAL_FITNESS') as WorkoutGoal;
    const name = customName || `Plan ${goal.replace(/_/g, ' ')}`;
    const sessionsPerWeek = user.sessionsPerWeek || 3;
    const sessionDurationMinutes = user.sessionDurationMinutes || 20;
    const rawEquipment = (user.equipment as string[]) || [];

    const normalizedEquipment = rawEquipment.map((item) => EQUIPMENT_MAP[item] || item);

    // Ambil katalog latihan yang aktif
    const allExercises = await prisma.exercise.findMany({ where: { isActive: true } });
    if (allExercises.length === 0) throw new AppError(400, 'Katalog latihan belum tersedia');

    // Filter latihan yang sesuai dengan alat milik pengguna
    const availableExercises = allExercises.filter((ex: Exercise) => {
      const required = (ex.equipmentRequired as string[]) || [];
      if (required.length === 0) return true;
      return required.every((reqItem) => normalizedEquipment.includes(reqItem));
    });

    const validPool =
      availableExercises.length > 0
        ? availableExercises
        : allExercises.filter(
            (ex: Exercise) =>
              !ex.equipmentRequired || (ex.equipmentRequired as string[]).length === 0
          );

    // Format list latihan untuk prompt
    const exercisesForPrompt: AvailableExerciseInfo[] = validPool.map((ex) => ({
      slug: ex.slug,
      name: ex.name,
      category: ex.category,
      equipmentRequired: (ex.equipmentRequired as string[]) || [],
      defaultSets: ex.defaultSets,
      defaultTargetReps: ex.defaultTargetReps,
      defaultTargetDurationSeconds: ex.defaultTargetDurationSeconds,
      defaultRestSeconds: ex.defaultRestSeconds,
    }));

    // Bangun prompt untuk Gemini
    const prompt = buildWorkoutPlanPrompt(
      {
        goal,
        age: user.age,
        weightKg: user.weightKg,
        experienceLevel: user.experienceLevel,
        equipment: normalizedEquipment,
        sessionsPerWeek,
        sessionDurationMinutes,
      },
      exercisesForPrompt
    );

    // Panggil Gemini AI
    const rawAiResponse = await aiClient.callGemini(prompt);

    // Parse dan validasi JSON dari Gemini dengan Zod
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawAiResponse);
    } catch (parseError: any) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }

    const validatedAiPlan = aiPlanResponseSchema.parse(parsedJson);

    // Jalankan seluruh mutasi database dalam satu Prisma Transaction
    await prisma.$transaction(async (tx) => {
      // 1. Nonaktifkan plan aktif sebelumnya
      await tx.workoutPlan.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      });

      // 2. Buat record WorkoutPlan baru
      const newPlan = await tx.workoutPlan.create({
        data: {
          userId,
          name,
          goal,
          status: 'ACTIVE',
        },
      });

      // 3. Transform item latihan ke format DB & validasi keberadaan slug
      const itemsData = transformAIPlanItems(newPlan.id, validatedAiPlan.items, validPool);

      // 4. Bulk insert WorkoutPlanItem
      await tx.workoutPlanItem.createMany({
        data: itemsData,
      });
    });

    // Kembalikan plan aktif lengkap dengan relasi exercise
    return PlanService.getActivePlan(userId);
  }
}
