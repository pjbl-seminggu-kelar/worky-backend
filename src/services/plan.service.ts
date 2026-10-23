// src/services/plan.service.ts
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { Exercise, Prisma } from '../app/generated/prisma';
import { StreakService } from './streak.service';

// 1. Mapping Normalisasi Input Equipment dari Frontend
const EQUIPMENT_MAP: Record<string, string> = {
  'Kursi / bangku': 'chair',
  'Pull-up bar': 'pull_up_bar',
  'Matras': 'exercise_mat',
  'Matras latihan': 'exercise_mat',
  'Tanpa alat': 'none',
  'chair': 'chair',
  'pull_up_bar': 'pull_up_bar',
  'exercise_mat': 'exercise_mat',
};

// 2. Mapping Distribusi Hari Latihan Dalam Seminggu
const DAY_SCHEDULES: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

// 3. Pola Rotasi Fokus Sesi Harian
type SplitFocus = 'UPPER' | 'LOWER' | 'CORE' | 'FULL_BODY';
const SPLIT_ROTATION: SplitFocus[] = ['UPPER', 'LOWER', 'FULL_BODY', 'CORE'];

export class PlanService {
  static async generatePlan(userId: string, customName?: string, customGoal?: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const goal = customGoal || user.goal || 'GENERAL_FITNESS';
    const name = customName || `Plan ${goal.replace(/_/g, ' ')}`;
    const sessionsPerWeek = user.sessionsPerWeek || 3;
    const rawEquipment = (user.equipment as string[]) || [];

    const normalizedEquipment = rawEquipment.map((item) => EQUIPMENT_MAP[item] || item);

    // Nonaktifkan plan aktif sebelumnya
    await prisma.workoutPlan.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });

    const allExercises = await prisma.exercise.findMany({ where: { isActive: true } });
    if (allExercises.length === 0) throw new AppError(400, 'Katalog latihan belum tersedia');

    // Filter latihan sesuai ketersediaan alat pengguna
    const availableExercises = allExercises.filter((ex: Exercise) => {
      const required = (ex.equipmentRequired as string[]) || [];
      if (required.length === 0) return true;
      return required.every((reqItem) => normalizedEquipment.includes(reqItem));
    });

    const validPool = availableExercises.length > 0 
      ? availableExercises 
      : allExercises.filter((ex: Exercise) => !ex.equipmentRequired || (ex.equipmentRequired as string[]).length === 0);

    const newPlan = await prisma.workoutPlan.create({
      data: { userId, name, goal, status: 'ACTIVE' },
    });

    const daysToSchedule = DAY_SCHEDULES[sessionsPerWeek] || [1, 3, 5];
    const itemsData: Prisma.WorkoutPlanItemCreateManyInput[] = [];

    // Kelompokkan pool latihan berdasarkan kategori
    const upperPool = validPool.filter((ex) => ex.category === 'UPPER');
    const lowerPool = validPool.filter((ex) => ex.category === 'LOWER');
    const corePool = validPool.filter((ex) => ex.category === 'CORE');

    // Loop pembuatan jadwal per hari latihan
    for (let i = 0; i < daysToSchedule.length; i++) {
      const dayOfWeek = daysToSchedule[i];
      const targetFocus = SPLIT_ROTATION[i % SPLIT_ROTATION.length];
      
      // Ambil daftar gerakan yang sesuai dengan fokus hari tersebut
      const chosenExercises = this.pickExercisesForFocus(
        targetFocus,
        upperPool,
        lowerPool,
        corePool,
        validPool
      );

      // Masukkan gerakan-gerakan terpilih ke dalam hari yang sama dengan orderIndex berurutan
      chosenExercises.forEach((exercise, idx) => {
        let sets = exercise.defaultSets || 3;
        let targetReps = exercise.defaultTargetReps || 10;
        let targetDurationSeconds = exercise.defaultTargetDurationSeconds;
        let restSeconds = exercise.defaultRestSeconds || 45;

        switch (goal) {
          case 'STRENGTH':
            sets = 4;
            if (targetReps) targetReps = 8;
            restSeconds = 60;
            break;

          case 'MUSCLE_BUILDING':
            sets = 4;
            if (targetReps) targetReps = 12;
            restSeconds = 45;
            break;

          case 'WEIGHT_LOSS':
            sets = 3;
            if (targetReps) targetReps = 15;
            if (targetDurationSeconds) targetDurationSeconds = Math.max(targetDurationSeconds, 45);
            restSeconds = 30;
            break;

          case 'GENERAL_FITNESS':
          default:
            sets = 3;
            if (targetReps) targetReps = 10;
            restSeconds = 45;
            break;
        }

        itemsData.push({
          planId: newPlan.id,
          exerciseId: exercise.id,
          dayOfWeek,
          orderIndex: idx + 1, // 1, 2, 3 untuk membedakan urutan gerakan
          sets,
          targetReps,
          targetDurationSeconds,
          restSeconds,
        });
      });
    }

    await prisma.workoutPlanItem.createMany({ data: itemsData });

    return this.getActivePlan(userId);
  }

  // Helper untuk memilih kombinasi 2–3 gerakan sesuai tema sesi
  private static pickExercisesForFocus(
    focus: SplitFocus,
    upperPool: Exercise[],
    lowerPool: Exercise[],
    corePool: Exercise[],
    fallbackPool: Exercise[]
  ): Exercise[] {
    const selected: Exercise[] = [];

    switch (focus) {
      case 'UPPER':
        if (upperPool.length > 0) selected.push(upperPool[0]);
        if (upperPool.length > 1) selected.push(upperPool[1]);
        if (corePool.length > 0) selected.push(corePool[0]); // Variasi pemungkas dengan Core
        break;

      case 'LOWER':
        if (lowerPool.length > 0) selected.push(lowerPool[0]);
        if (corePool.length > 0) selected.push(corePool[0]);
        break;

      case 'CORE':
        if (corePool.length > 0) selected.push(corePool[0]);
        if (corePool.length > 1) selected.push(corePool[1]);
        break;

      case 'FULL_BODY':
      default:
        if (upperPool.length > 0) selected.push(upperPool[0]);
        if (lowerPool.length > 0) selected.push(lowerPool[0]);
        if (corePool.length > 0) selected.push(corePool[0]);
        break;
    }

    // Fallback jika ada kategori yang kosong karena pembatasan alat
    if (selected.length === 0) {
      return fallbackPool.slice(0, 2);
    }

    return selected;
  }

  static async getActivePlan(userId: string) {
    await StreakService.evaluateAndGetStreak(userId);
    return prisma.workoutPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        workoutPlanItems: {
          include: { exercise: true },
          orderBy: [{ dayOfWeek: 'asc' }, { orderIndex: 'asc' }],
        },
        user: {
          select: {
            currentStreakDays: true,
            lastCompletedDate: true,
          },
        },
      },
    });
  }

  static async updatePlanItem(userId: string, itemId: string, data: Record<string, any>) {
    const item = await prisma.workoutPlanItem.findUnique({
      where: { id: itemId },
      include: { plan: true },
    });

    if (!item || item.plan.userId !== userId) {
      throw new AppError(404, 'Item latihan tidak ditemukan');
    }

    return prisma.workoutPlanItem.update({
      where: { id: itemId },
      data,
      include: { exercise: true },
    });
  }
}