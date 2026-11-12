import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

export interface WeeklyStreakDay {
  dayOfWeek: number;
  label: string;
  date: string;
  isToday: boolean;
  isWorkoutDay: boolean;
  isChecked: boolean;
  status: 'COMPLETED' | 'REST_CLAIMED' | 'PENDING' | 'MISSED';
}

export interface WeeklyStreakResponse {
  currentStreakDays: number;
  lastCompletedDate: Date | null;
  weeklySummary: {
    completedSessions: number;
    targetSessions: number;
    remainingSessions: number;
  };
  days: WeeklyStreakDay[];
}

export class StreakService {
  /**
   * Helper untuk mengonversi Date ke info tanggal kalender dalam timezone pengguna (default: Asia/Jakarta)
   */
  private static getZonedDateInfo(date: Date = new Date(), timeZone: string = 'Asia/Jakarta') {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === 'year')!.value;
    const month = parts.find((p) => p.type === 'month')!.value;
    const day = parts.find((p) => p.type === 'day')!.value;
    const weekday = parts.find((p) => p.type === 'weekday')!.value;

    const dayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };

    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      dayOfWeek: dayMap[weekday] || 1,
      ymd: `${year}-${month}-${day}`,
    };
  }

  /**
   * Helper untuk konversi hari Javascript (0=Minggu, 1=Senin) 
   * ke standar Prisma (1=Senin, 7=Minggu)
   */
  private static getPrismaDayOfWeek(date: Date = new Date()): number {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  static async evaluateAndGetStreak(
    userId: string,
    referenceDate: Date = new Date(),
    timeZone: string = 'Asia/Jakarta'
  ): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return 0;

    // Jika belum pernah latihan sama sekali, kembalikan nilai saat ini
    if (!user.lastCompletedDate) {
      return user.currentStreakDays;
    }

    const todayZoned = this.getZonedDateInfo(referenceDate, timeZone);
    const lastDateZoned = this.getZonedDateInfo(new Date(user.lastCompletedDate), timeZone);

    const diffInTime =
      new Date(`${todayZoned.ymd}T00:00:00.000Z`).getTime() -
      new Date(`${lastDateZoned.ymd}T00:00:00.000Z`).getTime();
    const diffInDays = Math.round(diffInTime / (1000 * 3600 * 24));

    // Jika terlewat lebih dari 1 hari (kemarin bolos), reset streak ke 0
    if (diffInDays > 1 && user.currentStreakDays > 0) {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { currentStreakDays: 0 },
      });
      return updatedUser.currentStreakDays;
    }

    return user.currentStreakDays;
  }

  /**
   * Memproses penambahan/reset streak user
   */
  static async processDailyStreak(userId: string, timeZone: string = 'Asia/Jakarta'): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'User tidak ditemukan');

    const todayZoned = this.getZonedDateInfo(new Date(), timeZone);
    const today = new Date(`${todayZoned.ymd}T00:00:00.000Z`);

    const lastDateZoned = user.lastCompletedDate
      ? this.getZonedDateInfo(new Date(user.lastCompletedDate), timeZone)
      : null;

    // Jika hari ini sudah terhitung streak-nya, abaikan
    if (lastDateZoned && lastDateZoned.ymd === todayZoned.ymd) {
      return user.currentStreakDays;
    }

    let newStreak = user.currentStreakDays;

    if (!lastDateZoned) {
      // Streak pertama kali
      newStreak = 1;
    } else {
      const diffInTime = today.getTime() - new Date(`${lastDateZoned.ymd}T00:00:00.000Z`).getTime();
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
    today.setHours(0, 0, 0, 0);
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

    // Simpan riwayat klaim ke tabel rest_day_checkins
    if ((prisma as any).restDayCheckin?.upsert) {
      try {
        await (prisma as any).restDayCheckin.upsert({
          where: {
            userId_checkinDate: {
              userId,
              checkinDate: today,
            },
          },
          update: {},
          create: {
            userId,
            checkinDate: today,
          },
        });
      } catch {
        // Fallback aman jika tabel rest_day_checkins belum dimigrasi
      }
    }

    const newStreak = await this.processDailyStreak(userId);
    return { message: 'Hari istirahat berhasil diklaim!', currentStreakDays: newStreak };
  }

  /**
   * Menghitung status streak dan ringkasan sesi untuk kartu "MINGGU INI" (Senin - Minggu)
   */
  static async getWeeklyStreak(
    userId: string,
    referenceDate: Date = new Date(),
    timeZone: string = 'Asia/Jakarta'
  ): Promise<WeeklyStreakResponse> {
    // 1. Lazy evaluation streak harian
    await this.evaluateAndGetStreak(userId, referenceDate, timeZone);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currentStreakDays: true,
        lastCompletedDate: true,
        sessionsPerWeek: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'User tidak ditemukan');
    }

    // 2. Rentang waktu minggu ini dalam Timezone pengguna (default: Asia/Jakarta)
    const todayZoned = this.getZonedDateInfo(referenceDate, timeZone);
    const currentDayOfWeek = todayZoned.dayOfWeek; // 1 = Senin, ..., 7 = Minggu
    const diffToMonday = currentDayOfWeek - 1;

    const baseTodayUtc = new Date(Date.UTC(todayZoned.year, todayZoned.month - 1, todayZoned.day));
    const mondayUtc = new Date(baseTodayUtc);
    mondayUtc.setUTCDate(baseTodayUtc.getUTCDate() - diffToMonday);

    const sundayUtc = new Date(mondayUtc);
    sundayUtc.setUTCDate(mondayUtc.getUTCDate() + 6);

    const mondayYmd = mondayUtc.toISOString().split('T')[0];
    const sundayYmd = sundayUtc.toISOString().split('T')[0];

    // Batas query database mencakup rentang waktu WIB (+07:00)
    const mondayStart = new Date(`${mondayYmd}T00:00:00.000+07:00`);
    const sundayEnd = new Date(`${sundayYmd}T23:59:59.999+07:00`);

    // 3. Ambil plan aktif beserta items
    const activePlan = await prisma.workoutPlan.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        workoutPlanItems: true,
      },
    });

    // 4. Ambil seluruh sesi latihan COMPLETED pada rentang Senin - Minggu berjalan
    const completedSessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: {
          gte: mondayStart,
          lte: sundayEnd,
        },
      },
      select: {
        exerciseId: true,
        completedAt: true,
      },
    });

    // Ambil riwayat klaim rest day pada rentang Senin - Minggu berjalan
    let restDayCheckins: Array<{ checkinDate: Date }> = [];
    if ((prisma as any).restDayCheckin?.findMany) {
      try {
        restDayCheckins = await (prisma as any).restDayCheckin.findMany({
          where: {
            userId,
            checkinDate: {
              gte: mondayStart,
              lte: sundayEnd,
            },
          },
          select: {
            checkinDate: true,
          },
        });
      } catch {
        restDayCheckins = [];
      }
    }

    const lastDateZoned = user.lastCompletedDate
      ? this.getZonedDateInfo(new Date(user.lastCompletedDate), timeZone)
      : null;

    const LABELS = ['S', 'S', 'R', 'K', 'J', 'S', 'M'];
    const days: WeeklyStreakDay[] = [];

    for (let i = 1; i <= 7; i++) {
      const dayUtc = new Date(mondayUtc);
      dayUtc.setUTCDate(mondayUtc.getUTCDate() + (i - 1));
      const dateString = dayUtc.toISOString().split('T')[0];

      const dayStart = new Date(`${dateString}T00:00:00.000+07:00`);
      const dayEnd = new Date(`${dateString}T23:59:59.999+07:00`);

      const isToday = dateString === todayZoned.ymd;
      const isPast = dateString < todayZoned.ymd;

      // Sesi yang diselesaikan pada tanggal ini
      const daySessions = completedSessions.filter((session) => {
        if (!session.completedAt) return false;
        const sessionTime = new Date(session.completedAt).getTime();
        return sessionTime >= dayStart.getTime() && sessionTime <= dayEnd.getTime();
      });

      // Cek apakah ada jadwal latihan di hari ini
      const scheduledItems = activePlan?.workoutPlanItems.filter((item) => item.dayOfWeek === i) || [];
      const isWorkoutDay = scheduledItems.length > 0;

      let isChecked = false;
      let status: 'COMPLETED' | 'REST_CLAIMED' | 'PENDING' | 'MISSED' = 'PENDING';

      if (isWorkoutDay) {
        const requiredExerciseIds = scheduledItems.map((item) => item.exerciseId);
        const completedExerciseIds = new Set(daySessions.map((s) => s.exerciseId));
        const isAllDone =
          requiredExerciseIds.length > 0 &&
          requiredExerciseIds.every((id) => completedExerciseIds.has(id));

        if (isAllDone) {
          status = 'COMPLETED';
          isChecked = true;
        } else {
          status = isPast ? 'MISSED' : 'PENDING';
          isChecked = false;
        }
      } else {
        // Rest Day
        const hasExtraSession = daySessions.length > 0;
        const hasCheckinRecord = restDayCheckins.some((checkin) => {
          const cZoned = this.getZonedDateInfo(new Date(checkin.checkinDate), timeZone);
          return cZoned.ymd === dateString;
        });

        let isClaimedOrActiveInStreak = false;

        if (lastDateZoned) {
          const diffDays = Math.round(
            (new Date(`${dateString}T00:00:00.000Z`).getTime() -
              new Date(`${lastDateZoned.ymd}T00:00:00.000Z`).getTime()) /
              (1000 * 3600 * 24)
          );
          const isExactLastCompleted = diffDays === 0;
          const isInActiveStreak =
            user.currentStreakDays > 0 &&
            diffDays >= -(user.currentStreakDays - 1) &&
            diffDays <= 0;

          isClaimedOrActiveInStreak = isExactLastCompleted || isInActiveStreak;
        }

        const isRestClaimed = hasCheckinRecord || hasExtraSession || isClaimedOrActiveInStreak;

        if (isRestClaimed) {
          status = 'REST_CLAIMED';
          isChecked = true;
        } else {
          status = isPast ? 'MISSED' : 'PENDING';
          isChecked = false;
        }
      }

      days.push({
        dayOfWeek: i,
        label: LABELS[i - 1],
        date: dateString,
        isToday,
        isWorkoutDay,
        isChecked,
        status,
      });
    }

    // 5. Ringkasan target sesi mingguan
    const completedSessionsCount = days.filter((d) => d.isWorkoutDay && d.status === 'COMPLETED').length;
    const scheduledDaysCount = days.filter((d) => d.isWorkoutDay).length;
    const targetSessions = scheduledDaysCount > 0 ? scheduledDaysCount : (user.sessionsPerWeek || 0);
    const remainingSessions = Math.max(0, targetSessions - completedSessionsCount);

    return {
      currentStreakDays: user.currentStreakDays,
      lastCompletedDate: user.lastCompletedDate,
      weeklySummary: {
        completedSessions: completedSessionsCount,
        targetSessions,
        remainingSessions,
      },
      days,
    };
  }
}