// tests/plan.controller.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PlanController } from '../src/controllers/plan.controller';
import { AIPlanService } from '../src/services/aiPlan.service';
import { PlanService } from '../src/services/plan.service';
import { metrics } from '../src/lib/metrics';

describe('PlanController - generatePlan with AI & Fallback', () => {
  beforeEach(() => {
    metrics.reset();
    process.env.USE_AI_FOR_PLAN = 'true';
  });

  it('should call AIPlanService and record success metric when AI succeeds', async () => {
    const originalAiGenerate = AIPlanService.generatePlanFromAI;
    const originalPlanGenerate = PlanService.generatePlan;

    try {
      const mockPlan = { id: 'plan-ai-1', name: 'AI Plan', status: 'ACTIVE' };
      let aiCalled = false;
      let fallbackCalled = false;

      AIPlanService.generatePlanFromAI = async () => {
        aiCalled = true;
        return mockPlan as any;
      };

      PlanService.generatePlan = async () => {
        fallbackCalled = true;
        return null as any;
      };

      let statusCode = 0;
      let responseBody: any = null;

      const req: any = {
        user: { id: 'user-1' },
        body: { name: 'My Custom Plan', goal: 'MUSCLE_BUILDING' },
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

      const next = () => {};

      await PlanController.generatePlan(req, res, next);

      assert.equal(statusCode, 201);
      assert.deepEqual(responseBody, { status: 'success', data: mockPlan });
      assert.equal(aiCalled, true);
      assert.equal(fallbackCalled, false);
      assert.equal(metrics.getSnapshot().aiSuccessTotal, 1);
      assert.equal(metrics.getSnapshot().aiFallbackTotal, 0);
    } finally {
      AIPlanService.generatePlanFromAI = originalAiGenerate;
      PlanService.generatePlan = originalPlanGenerate;
    }
  });

  it('should gracefully fall back to PlanService.generatePlan when AIPlanService throws', async () => {
    const originalAiGenerate = AIPlanService.generatePlanFromAI;
    const originalPlanGenerate = PlanService.generatePlan;

    try {
      const mockFallbackPlan = { id: 'plan-fallback-1', name: 'Rule Plan', status: 'ACTIVE' };
      let fallbackCalled = false;

      AIPlanService.generatePlanFromAI = async () => {
        throw new Error('Gemini API timeout or rate limit');
      };

      PlanService.generatePlan = async () => {
        fallbackCalled = true;
        return mockFallbackPlan as any;
      };

      let statusCode = 0;
      let responseBody: any = null;

      const req: any = {
        user: { id: 'user-1' },
        body: { goal: 'GENERAL_FITNESS' },
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

      const next = () => {};

      await PlanController.generatePlan(req, res, next);

      assert.equal(statusCode, 201);
      assert.deepEqual(responseBody, { status: 'success', data: mockFallbackPlan });
      assert.equal(fallbackCalled, true);
      assert.equal(metrics.getSnapshot().aiSuccessTotal, 0);
      assert.equal(metrics.getSnapshot().aiFallbackTotal, 1);
    } finally {
      AIPlanService.generatePlanFromAI = originalAiGenerate;
      PlanService.generatePlan = originalPlanGenerate;
    }
  });

  it('should directly call PlanService when USE_AI_FOR_PLAN is false', async () => {
    process.env.USE_AI_FOR_PLAN = 'false';
    const originalAiGenerate = AIPlanService.generatePlanFromAI;
    const originalPlanGenerate = PlanService.generatePlan;

    try {
      const mockPlan = { id: 'plan-deterministic-1', status: 'ACTIVE' };
      let aiCalled = false;
      let deterministicCalled = false;

      AIPlanService.generatePlanFromAI = async () => {
        aiCalled = true;
        return null as any;
      };

      PlanService.generatePlan = async () => {
        deterministicCalled = true;
        return mockPlan as any;
      };

      let statusCode = 0;
      let responseBody: any = null;

      const req: any = {
        user: { id: 'user-1' },
        body: {},
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

      const next = () => {};

      await PlanController.generatePlan(req, res, next);

      assert.equal(statusCode, 201);
      assert.deepEqual(responseBody, { status: 'success', data: mockPlan });
      assert.equal(aiCalled, false);
      assert.equal(deterministicCalled, true);
      assert.equal(metrics.getSnapshot().aiSuccessTotal, 0);
      assert.equal(metrics.getSnapshot().aiFallbackTotal, 0);
    } finally {
      AIPlanService.generatePlanFromAI = originalAiGenerate;
      PlanService.generatePlan = originalPlanGenerate;
    }
  });
});
