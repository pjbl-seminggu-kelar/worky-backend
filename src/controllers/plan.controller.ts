import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { PlanService } from '../services/plan.service';
import { AIPlanService } from '../services/aiPlan.service';
import { updatePlanItemSchema, generatePlanSchema } from '../schemas/plan.schema';
import { StreakService } from '../services/streak.service';
import { metrics } from '../lib/metrics';

export class PlanController {
  static async getActivePlan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const plan = await PlanService.getActivePlan(userId);
      res.status(200).json({ status: 'success', data: plan });
    } catch (err) {
      next(err);
    }
  }

  static async generatePlan(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const validated = generatePlanSchema.parse(req.body);

      let plan;
      const useAi = process.env.USE_AI_FOR_PLAN !== 'false';

      if (useAi) {
        const startTime = Date.now();
        try {
          plan = await AIPlanService.generatePlanFromAI(userId, validated.name, validated.goal);
          const latencyMs = Date.now() - startTime;
          metrics.recordAiSuccess(latencyMs);
        } catch (aiErr) {
          console.warn(
            '[PlanController] AI plan generation failed, falling back to deterministic generator:',
            aiErr
          );
          metrics.recordAiFallback();
          plan = await PlanService.generatePlan(userId, validated.name, validated.goal);
        }
      } else {
        plan = await PlanService.generatePlan(userId, validated.name, validated.goal);
      }

      res.status(201).json({ status: 'success', data: plan });
    } catch (err) {
      next(err);
    }
  }

  static async updatePlanItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const itemId = req.params.itemId as string;
      const validated = updatePlanItemSchema.parse(req.body);
      const updated = await PlanService.updatePlanItem(userId, itemId, validated);
      res.status(200).json({ status: 'success', data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async claimRestDay(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await StreakService.claimRestDay(userId);
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  }
}
