// src/services/plan.service.ts
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { Exercise } from '../app/generated/prisma';

// 1. Mapping Normalisasi: Label UI -> Slug DB Internal
const EQUIPMENT_MAP: Record<string, string> = {
  'Kursi / bangku': 'chair',
  'Pull-up bar': 'pull_up_bar',
  'Matras': 'exercise_mat',
  'Matras latihan': 'exercise_mat',
  'Tanpa alat': 'none',
  // Menjaga kompatibilitas jika dikirim langsung berbentuk slug
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

export class PlanService {
  static async generatePlan(userId: string, customName?: string, customGoal?: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const goal = customGoal || user.goal || 'GENERAL_FITNESS';
    const name = customName || `Plan ${goal.replace(/_/g, ' ')}`;
    const sessionsPerWeek = user.sessionsPerWeek || 3;
    const rawEquipment = (user.equipment as string[]) || [];

    // FIX 1: Normalisasikan input equipment ke bentuk Slug Internal
    const normalizedEquipment = rawEquipment.map(
      (item) => EQUIPMENT_MAP[item] || item
    );

    // Arsipkan plan aktif sebelumnya
    await prisma.workoutPlan.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });

    const allExercises = await prisma.exercise.findMany({ where: { isActive: true } });
    if (allExercises.length === 0) throw new AppError(400, 'Katalog latihan belum tersedia');

    // FIX 2: Filter latihan menggunakan normalizedEquipment
    const availableExercises = allExercises.filter((ex: Exercise) => {
      const required = (ex.equipmentRequired as string[]) || [];
      if (required.length === 0) return true; // Latihan tanpa alat
      return required.every((reqItem) => normalizedEquipment.includes(reqItem));
    });

    // Fallback jika tidak ada alat yang cocok
    const validPool = availableExercises.length > 0 
      ? availableExercises 
      : allExercises.filter((ex: Exercise) => !ex.equipmentRequired || (ex.equipmentRequired as string[]).length === 0);

    const newPlan = await prisma.workoutPlan.create({
      data: { userId, name, goal, status: 'ACTIVE' },
    });

    const daysToSchedule = DAY_SCHEDULES[sessionsPerWeek] || [1, 3, 5];
    const itemsData = [];

    // Rotasi 6 latihan agar terdistribusi merata
    for (let i = 0; i < daysToSchedule.length; i++) {
      const dayOfWeek = daysToSchedule[i];
      const exercise = validPool[i % validPool.length];

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
        orderIndex: 1,
        sets,
        targetReps,
        targetDurationSeconds,
        restSeconds,
      });
    }

    await prisma.workoutPlanItem.createMany({ data: itemsData });

    return this.getActivePlan(userId);
  }

  static async getActivePlan(userId: string) {
    return prisma.workoutPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        workoutPlanItems: {
          include: { exercise: true },
          orderBy: [{ dayOfWeek: 'asc' }, { orderIndex: 'asc' }],
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