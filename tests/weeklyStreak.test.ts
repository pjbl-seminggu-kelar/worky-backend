import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/db';
import { StreakService } from '../src/services/streak.service';
import { PlanController } from '../src/controllers/plan.controller';
import planRouter from '../src/routes/plan.route';

describe('StreakService - getWeeklyStreak', () => {
  it('should reset currentStreakDays to 0 if user missed yesterday (Lazy Evaluation)', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalUpdate = prisma.user.update;
    const originalFindFirst = prisma.workoutPlan.findFirst;
    const originalFindMany = prisma.workoutSession.findMany;

    try {
      // Reference date: Thursday, 2026-11-12
      const referenceDate = new Date('2026-11-12T10:00:00.000Z');

      // Last completed date was 3 days ago (Monday, 2026-11-09)
      const mockUser = {
        id: 'user-lazy-1',
        currentStreakDays: 10,
        lastCompletedDate: new Date('2026-11-09T00:00:00.000Z'),
        sessionsPerWeek: 3,
      };

      let resetOccurred = false;
      prisma.user.findUnique = (async ({ where }: any) => {
        if (where.id === 'user-lazy-1') {
          return { ...mockUser };
        }
        return null;
      }) as any;

      prisma.user.update = (async ({ where, data }: any) => {
        if (where.id === 'user-lazy-1' && data.currentStreakDays === 0) {
          resetOccurred = true;
          mockUser.currentStreakDays = 0;
          return { ...mockUser };
        }
        return mockUser;
      }) as any;

      prisma.workoutPlan.findFirst = (async () => null) as any;
      prisma.workoutSession.findMany = (async () => []) as any;

      const result = await StreakService.getWeeklyStreak('user-lazy-1', referenceDate);

      assert.equal(resetOccurred, true);
      assert.equal(result.currentStreakDays, 0);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.user.update = originalUpdate;
      prisma.workoutPlan.findFirst = originalFindFirst;
      prisma.workoutSession.findMany = originalFindMany;
    }
  });

  it('should generate 7 days from Monday to Sunday with correct labels, dates, and isToday', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalFindFirst = prisma.workoutPlan.findFirst;
    const originalFindMany = prisma.workoutSession.findMany;

    try {
      // Reference date: Thursday 2026-11-12
      const referenceDate = new Date('2026-11-12T12:00:00.000Z');

      const mockUser = {
        id: 'user-7days',
        currentStreakDays: 5,
        lastCompletedDate: new Date('2026-11-11T00:00:00.000Z'),
        sessionsPerWeek: 4,
      };

      prisma.user.findUnique = (async () => mockUser) as any;
      prisma.workoutPlan.findFirst = (async () => null) as any;
      prisma.workoutSession.findMany = (async () => []) as any;

      const result = await StreakService.getWeeklyStreak('user-7days', referenceDate);

      assert.equal(result.days.length, 7);
      assert.deepEqual(
        result.days.map((d) => d.dayOfWeek),
        [1, 2, 3, 4, 5, 6, 7]
      );
      assert.deepEqual(
        result.days.map((d) => d.label),
        ['S', 'S', 'R', 'K', 'J', 'S', 'M']
      );
      assert.deepEqual(
        result.days.map((d) => d.date),
        [
          '2026-11-09',
          '2026-11-10',
          '2026-11-11',
          '2026-11-12',
          '2026-11-13',
          '2026-11-14',
          '2026-11-15',
        ]
      );

      // Day 4 (Kamis, 2026-11-12) must be isToday: true, others false
      assert.equal(result.days[0].isToday, false);
      assert.equal(result.days[1].isToday, false);
      assert.equal(result.days[2].isToday, false);
      assert.equal(result.days[3].isToday, true);
      assert.equal(result.days[4].isToday, false);
      assert.equal(result.days[5].isToday, false);
      assert.equal(result.days[6].isToday, false);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.workoutPlan.findFirst = originalFindFirst;
      prisma.workoutSession.findMany = originalFindMany;
    }
  });

  it('should evaluate workout day as COMPLETED only when ALL scheduled exercises are completed', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalFindFirst = prisma.workoutPlan.findFirst;
    const originalFindMany = prisma.workoutSession.findMany;

    try {
      // Reference date: Thursday 2026-11-12
      const referenceDate = new Date('2026-11-12T15:00:00.000Z');

      const mockUser = {
        id: 'user-workout-eval',
        currentStreakDays: 3,
        lastCompletedDate: new Date('2026-11-11T00:00:00.000Z'),
        sessionsPerWeek: 3,
      };

      // Monday (day 1): 2 exercises (ex-1, ex-2) -> Both completed
      // Wednesday (day 3): 2 exercises (ex-1, ex-3) -> Only ex-1 completed (partial)
      // Friday (day 5): 1 exercise (ex-2) -> In future
      const mockPlan = {
        id: 'plan-1',
        status: 'ACTIVE',
        workoutPlanItems: [
          { dayOfWeek: 1, exerciseId: 'ex-1' },
          { dayOfWeek: 1, exerciseId: 'ex-2' },
          { dayOfWeek: 3, exerciseId: 'ex-1' },
          { dayOfWeek: 3, exerciseId: 'ex-3' },
          { dayOfWeek: 5, exerciseId: 'ex-2' },
        ],
      };

      const mockSessions = [
        // Monday completed sessions (ex-1 and ex-2)
        {
          exerciseId: 'ex-1',
          completedAt: new Date('2026-11-09T08:00:00.000Z'),
        },
        {
          exerciseId: 'ex-2',
          completedAt: new Date('2026-11-09T08:30:00.000Z'),
        },
        // Wednesday completed session (only ex-1)
        {
          exerciseId: 'ex-1',
          completedAt: new Date('2026-11-11T09:00:00.000Z'),
        },
      ];

      prisma.user.findUnique = (async () => mockUser) as any;
      prisma.workoutPlan.findFirst = (async () => mockPlan) as any;
      prisma.workoutSession.findMany = (async () => mockSessions) as any;

      const result = await StreakService.getWeeklyStreak('user-workout-eval', referenceDate);

      // Monday (day 1): COMPLETED (isChecked: true)
      const monday = result.days[0];
      assert.equal(monday.isWorkoutDay, true);
      assert.equal(monday.isChecked, true);
      assert.equal(monday.status, 'COMPLETED');

      // Wednesday (day 3): MISSED (only 1 of 2 exercises completed, past date)
      const wednesday = result.days[2];
      assert.equal(wednesday.isWorkoutDay, true);
      assert.equal(wednesday.isChecked, false);
      assert.equal(wednesday.status, 'MISSED');

      // Friday (day 5): PENDING (future date)
      const friday = result.days[4];
      assert.equal(friday.isWorkoutDay, true);
      assert.equal(friday.isChecked, false);
      assert.equal(friday.status, 'PENDING');
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.workoutPlan.findFirst = originalFindFirst;
      prisma.workoutSession.findMany = originalFindMany;
    }
  });

  it('should evaluate Rest Days as REST_CLAIMED, MISSED, or PENDING appropriately', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalFindFirst = prisma.workoutPlan.findFirst;
    const originalFindMany = prisma.workoutSession.findMany;

    try {
      // Reference date: Thursday 2026-11-12
      const referenceDate = new Date('2026-11-12T10:00:00.000Z');

      // User has 3 days active streak ending on 2026-11-11 (covers 11-09, 11-10, 11-11)
      const mockUser = {
        id: 'user-rest-eval',
        currentStreakDays: 3,
        lastCompletedDate: new Date('2026-11-11T00:00:00.000Z'),
        sessionsPerWeek: 2,
      };

      // Only Monday (day 1) and Friday (day 5) are workout days
      // Tuesday (day 2), Wednesday (day 3), Thursday (day 4), Saturday (day 6), Sunday (day 7) are Rest Days
      const mockPlan = {
        id: 'plan-2',
        status: 'ACTIVE',
        workoutPlanItems: [
          { dayOfWeek: 1, exerciseId: 'ex-1' },
          { dayOfWeek: 5, exerciseId: 'ex-1' },
        ],
      };

      // Monday had workout session.
      // Saturday (day 6) user did an extra unscheduled session!
      const mockSessions = [
        {
          exerciseId: 'ex-1',
          completedAt: new Date('2026-11-09T08:00:00.000Z'),
        },
        {
          exerciseId: 'ex-extra',
          completedAt: new Date('2026-11-14T10:00:00.000Z'), // Saturday
        },
      ];

      prisma.user.findUnique = (async () => mockUser) as any;
      prisma.workoutPlan.findFirst = (async () => mockPlan) as any;
      prisma.workoutSession.findMany = (async () => mockSessions) as any;

      const result = await StreakService.getWeeklyStreak('user-rest-eval', referenceDate);

      // Tuesday (day 2): Rest day, within active streak (2026-11-09 to 2026-11-11) -> REST_CLAIMED
      const tuesday = result.days[1];
      assert.equal(tuesday.isWorkoutDay, false);
      assert.equal(tuesday.isChecked, true);
      assert.equal(tuesday.status, 'REST_CLAIMED');

      // Wednesday (day 3): Rest day, within active streak -> REST_CLAIMED
      const wednesday = result.days[2];
      assert.equal(wednesday.isWorkoutDay, false);
      assert.equal(wednesday.isChecked, true);
      assert.equal(wednesday.status, 'REST_CLAIMED');

      // Thursday (day 4): Rest day, today, not yet claimed -> PENDING
      const thursday = result.days[3];
      assert.equal(thursday.isWorkoutDay, false);
      assert.equal(thursday.isToday, true);
      assert.equal(thursday.isChecked, false);
      assert.equal(thursday.status, 'PENDING');

      // Saturday (day 6): Rest day, but has extra workout session completed -> REST_CLAIMED
      const saturday = result.days[5];
      assert.equal(saturday.isWorkoutDay, false);
      assert.equal(saturday.isChecked, true);
      assert.equal(saturday.status, 'REST_CLAIMED');

      // Sunday (day 7): Rest day, future -> PENDING
      const sunday = result.days[6];
      assert.equal(sunday.isWorkoutDay, false);
      assert.equal(sunday.isChecked, false);
      assert.equal(sunday.status, 'PENDING');
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.workoutPlan.findFirst = originalFindFirst;
      prisma.workoutSession.findMany = originalFindMany;
    }
  });

  it('should correctly calculate weeklySummary (completedSessions, targetSessions, remainingSessions)', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalFindFirst = prisma.workoutPlan.findFirst;
    const originalFindMany = prisma.workoutSession.findMany;

    try {
      const referenceDate = new Date('2026-11-12T12:00:00.000Z');

      const mockUser = {
        id: 'user-summary',
        currentStreakDays: 35,
        lastCompletedDate: new Date('2026-11-12T00:00:00.000Z'),
        sessionsPerWeek: 4,
      };

      // Plan has 4 scheduled workout days: Monday (1), Tuesday (2), Thursday (4), Saturday (6)
      const mockPlan = {
        id: 'plan-summary',
        status: 'ACTIVE',
        workoutPlanItems: [
          { dayOfWeek: 1, exerciseId: 'ex-1' },
          { dayOfWeek: 2, exerciseId: 'ex-1' },
          { dayOfWeek: 4, exerciseId: 'ex-1' },
          { dayOfWeek: 6, exerciseId: 'ex-1' },
        ],
      };

      // Completed days: Monday, Tuesday, Thursday (3 completed)
      const mockSessions = [
        { exerciseId: 'ex-1', completedAt: new Date('2026-11-09T07:00:00.000Z') },
        { exerciseId: 'ex-1', completedAt: new Date('2026-11-10T07:00:00.000Z') },
        { exerciseId: 'ex-1', completedAt: new Date('2026-11-12T07:00:00.000Z') },
      ];

      prisma.user.findUnique = (async () => mockUser) as any;
      prisma.workoutPlan.findFirst = (async () => mockPlan) as any;
      prisma.workoutSession.findMany = (async () => mockSessions) as any;

      const result = await StreakService.getWeeklyStreak('user-summary', referenceDate);

      assert.deepEqual(result.weeklySummary, {
        completedSessions: 3,
        targetSessions: 4,
        remainingSessions: 1,
      });
      assert.equal(result.currentStreakDays, 35);
      assert.deepEqual(result.lastCompletedDate, mockUser.lastCompletedDate);
    } finally {
      prisma.user.findUnique = originalFindUnique;
      prisma.workoutPlan.findFirst = originalFindFirst;
      prisma.workoutSession.findMany = originalFindMany;
    }
  });
});

describe('PlanController - getWeeklyStreak', () => {
  it('should respond with status 200 and success response format', async () => {
    const originalGetWeeklyStreak = StreakService.getWeeklyStreak;

    try {
      const mockData = {
        currentStreakDays: 35,
        lastCompletedDate: new Date('2026-11-12T00:00:00.000Z'),
        weeklySummary: {
          completedSessions: 3,
          targetSessions: 4,
          remainingSessions: 1,
        },
        days: [
          {
            dayOfWeek: 1,
            label: 'S',
            date: '2026-11-09',
            isToday: false,
            isWorkoutDay: true,
            isChecked: true,
            status: 'COMPLETED' as const,
          },
        ],
      };

      StreakService.getWeeklyStreak = async (userId: string) => {
        assert.equal(userId, 'user-ctrl-1');
        return mockData as any;
      };

      let statusCode = 0;
      let responseBody: any = null;

      const req: any = {
        user: { id: 'user-ctrl-1' },
      };

      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (data: any) => {
              responseBody = data;
            },
          };
        },
      };

      let nextCalledWith: any = null;
      const next = (err?: any) => {
        nextCalledWith = err;
      };

      await PlanController.getWeeklyStreak(req, res, next);

      assert.equal(statusCode, 200);
      assert.deepEqual(responseBody, {
        status: 'success',
        data: mockData,
      });
      assert.equal(nextCalledWith, null);
    } finally {
      StreakService.getWeeklyStreak = originalGetWeeklyStreak;
    }
  });

  it('should call next(err) when an error is thrown', async () => {
    const originalGetWeeklyStreak = StreakService.getWeeklyStreak;

    try {
      const mockError = new Error('Database connection failed');
      StreakService.getWeeklyStreak = async () => {
        throw mockError;
      };

      const req: any = {
        user: { id: 'user-err-1' },
      };

      const res: any = {};
      let nextCalledWith: any = null;
      const next = (err?: any) => {
        nextCalledWith = err;
      };

      await PlanController.getWeeklyStreak(req, res, next);

      assert.equal(nextCalledWith, mockError);
    } finally {
      StreakService.getWeeklyStreak = originalGetWeeklyStreak;
    }
  });
});

describe('PlanRouter - /weekly-streak route', () => {
  it('should have GET /weekly-streak route configured', () => {
    const layer = planRouter.stack.find(
      (s: any) => s.route && s.route.path === '/weekly-streak' && s.route.methods.get
    );
    assert.ok(layer, 'Route GET /weekly-streak should be registered in plan router');
  });
});
