import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { StreakService } from './streak.service';

export class UserService {
  static async getProfile(userId: string) {
    const streakInfo = await StreakService.checkAndTriggerDailyStreak(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        age: true,
        weightKg: true,
        goal: true,
        experienceLevel: true,
        sessionsPerWeek: true,
        sessionDurationMinutes: true,
        equipment: true,
        reminderTime: true,
        streakWeeks: true,
        createdAt: true,
      },
    });

    if (!user) throw new AppError(404, 'Pengguna tidak ditemukan');

    // 1. Hitung Rekap Statistik Keseluruhan
    const sessionStats = await prisma.workoutSession.aggregate({
      where: { userId, status: 'COMPLETED' },
      _count: { id: true },
      _sum: { validReps: true },
      _avg: { validRepRate: true },
    });

    const totalSessions = sessionStats._count.id || 0;
    const totalValidReps = sessionStats._sum.validReps || 0;
    const avgFormRate = sessionStats._avg.validRepRate
      ? Math.round(Number(sessionStats._avg.validRepRate))
      : 0;

    // 2. Kalkulasi Kualitas Form per Minggu (7 Minggu Terakhir: M1 - M7)
    const now = new Date();
    const weeklyFormQuality = [];

    for (let i = 6; i >= 0; i--) {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - (i + 1) * 7);

      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() - i * 7);

      const weekAggregate = await prisma.workoutSession.aggregate({
        where: {
          userId,
          status: 'COMPLETED',
          createdAt: {
            gte: startOfWeek,
            lt: endOfWeek,
          },
        },
        _avg: { validRepRate: true },
      });

      const avgRate = weekAggregate._avg.validRepRate
        ? Math.round(Number(weekAggregate._avg.validRepRate))
        : 0;

      weeklyFormQuality.push({
        weekLabel: `M${7 - i}`,
        formRate: avgRate,
      });
    }

    return {
      user,
      streak: streakInfo,
      stats: {
        totalSessions,
        totalValidReps,
        avgFormRate,
        weeklyFormQuality, // Array 7 elemen untuk grafik M1-M7
      },
    };
  }

  static async updateProfile(userId: string, data: Record<string, any>) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        age: true,
        weightKg: true,
        goal: true,
        experienceLevel: true,
        sessionsPerWeek: true,
        sessionDurationMinutes: true,
        equipment: true,
        reminderTime: true,
        streakWeeks: true,
      },
    });

    return updatedUser;
  }
}