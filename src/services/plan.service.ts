// src/services/plan.service.ts
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { Exercise } from '../app/generated/prisma'; // 1. Import tipe Exercise

export class PlanService {
  static async generatePlan(userId: string, customName?: string, customGoal?: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const goal = customGoal || user.goal || 'GENERAL_FITNESS';
    const name = customName || `Plan ${goal.replace(/_/g, ' ')}`;
    const sessionsPerWeek = user.sessionsPerWeek || 3;
    const userEquipment = (user.equipment as string[]) || [];

    await prisma.workoutPlan.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });

    const allExercises = await prisma.exercise.findMany({ where: { isActive: true } });
    if (allExercises.length === 0) throw new AppError(400, 'Katalog latihan belum tersedia');

    // 2. Tambahkan tipe (ex: Exercise) pada baris 28
    const availableExercises = allExercises.filter((ex: Exercise) => {
      const required = ex.equipmentRequired as string[];
      if (!required || required.length === 0) return true;
      return required.every((item) => userEquipment.includes(item));
    });

    // 3. Tambahkan tipe (ex: Exercise) pada baris 37
    const validPool = availableExercises.length > 0 
      ? availableExercises 
      : allExercises.filter((ex: Exercise) => !ex.equipmentRequired || (ex.equipmentRequired as string[]).length === 0);

    const newPlan = await prisma.workoutPlan.create({
      data: { userId, name, goal, status: 'ACTIVE' },
    });

    const itemsData = [];
    const daysInterval = Math.floor(7 / sessionsPerWeek);

    for (let i = 0; i < sessionsPerWeek; i++) {
      const dayOfWeek = Math.min(i * daysInterval + 1, 7);
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