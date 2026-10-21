// src/controllers/session.controller.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { SessionService } from '../services/session.service';
import { startSessionSchema, logEventsSchema, completeSessionSchema } from '../schemas/session.schema';

export class SessionController {
  static async start(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const validated = startSessionSchema.parse(req.body);
      const session = await SessionService.startSession(userId, validated);
      res.status(201).json({ status: 'success', data: session });
    } catch (err) {
      next(err);
    }
  }

  static async logEvents(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      // FIX: Cast req.params.id ke tipe 'string'
      const sessionId = req.params.id as string;

      const validated = logEventsSchema.parse(req.body);
      await SessionService.logEvents(userId, sessionId, validated.events);
      res.status(200).json({ status: 'success', message: 'Events berhasil dicatat' });
    } catch (err) {
      next(err);
    }
  }

  static async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      // FIX: Cast req.params.id ke tipe 'string'
      const sessionId = req.params.id as string;

      const validated = completeSessionSchema.parse(req.body);
      const result = await SessionService.completeSession(userId, sessionId, validated);
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const history = await SessionService.getUserHistory(userId);
      res.status(200).json({ status: 'success', data: history });
    } catch (err) {
      next(err);
    }
  }
}