import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

export class StreakService {
  /**
   * Helper untuk konversi hari Javascript (0=Minggu, 1=Senin) 
   * ke standar Prisma (1=Senin, 7=Minggu)
   */
  private static getPrismaDayOfWeek(date: Date = new Date()): number {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  /**
   * Memproses penambahan/reset streak user
   */
  static async processDailyStreak(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDate = user.lastCompletedDate ? new Date(user.lastCompletedDate) : null;
    if (lastDate) lastDate.setHours(0, 0, 0, 0);

    // Jika hari ini sudah terhitung streak-nya, abaikan
    if (lastDate && lastDate.getTime() === today.getTime()) {
      return user.currentStreakDays;
    }

    let newStreak = user.currentStreakDays;

    if (!lastDate) {
      // Streak pertama kali
      newStreak = 1;
    } else {
      const diffInTime = today.getTime() - lastDate.getTime();
      const diffInDays = Math.round(diffInTime / (1000 * 3600 * 24));

      if (diffInDays === 1) {
        // H+1 berturut-turut -> Streak bertambah
        newStreak += 1;
      } else if (diffInDays > 1) {
        // Terlewat lebih dari 1 hari -> Reset streak ke 1
        newStreak = 1;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreakDays: newStreak,
        lastCompletedDate: today,
      },
    });

    return updatedUser.currentStreakDays;
  }

  /**
   * Mengecek apakah SELURUH latihan hari ini sudah diselesaikan oleh user
   */
  static async checkAndTriggerDailyStreak(userId: string): Promise<{ isCompletedToday: boolean; currentStreakDays: number }> {
    const today = new Date();
    const currentDayOfWeek = this.getPrismaDayOfWeek(today);

    // 1. Ambil plan aktif user untuk hari ini
    const activePlan = await prisma.workoutPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        workoutPlanItems: {
          where: { dayOfWeek: currentDayOfWeek },
        },
      },
    });

    // Jika tidak ada plan atau hari ini Rest Day, abaikan pengecekan otomatis ini
    if (!activePlan || activePlan.workoutPlanItems.length === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return { isCompletedToday: false, currentStreakDays: user?.currentStreakDays || 0 };
    }

    // 2. Kumpulkan daftar exerciseId yang wajib dikerjakan hari ini
    const requiredExerciseIds = activePlan.workoutPlanItems.map((item) => item.exerciseId);

    // 3. Cari sesi latihan berstatus COMPLETED yang diselesaikan hari ini
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const completedSessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      select: { exerciseId: true },
    });

    const completedExerciseIds = new Set(completedSessions.map((s) => s.exerciseId));

    // 4. Verifikasi apakah SELURUH exerciseId hari ini sudah ada di completedSessions
    const isAllDone = requiredExerciseIds.every((id) => completedExerciseIds.has(id));

    if (isAllDone) {
      const updatedStreak = await this.processDailyStreak(userId);
      return { isCompletedToday: true, currentStreakDays: updatedStreak };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    return { isCompletedToday: false, currentStreakDays: user?.currentStreakDays || 0 };
  }

  /**
   * Klaim streak khusus Hari Istirahat (Rest Day Check-in)
   */
  static async claimRestDay(userId: string) {
    const today = new Date();
    const currentDayOfWeek = this.getPrismaDayOfWeek(today);

    const activePlan = await prisma.workoutPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        workoutPlanItems: {
          where: { dayOfWeek: currentDayOfWeek },
        },
      },
    });

    // Validasi: Rest Day hanya bisa diklaim jika memang TIDAK ADA jadwal latihan hari ini
    if (activePlan && activePlan.workoutPlanItems.length > 0) {
      throw new AppError(400, 'Hari ini ada jadwal latihan. Selesaikan semua sesi latihanmu untuk menyalakan streak!');
    }

    const newStreak = await this.processDailyStreak(userId);
    return { message: 'Hari istirahat berhasil diklaim!', currentStreakDays: newStreak };
  }
}