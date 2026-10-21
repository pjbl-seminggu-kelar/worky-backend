import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

export class ExerciseController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { category } = req.query;
      const whereClause: any = { isActive: true };

      if (category && typeof category === 'string' && category.toUpperCase() !== 'ALL') {
        whereClause.category = category.toUpperCase();
      }

      const exercises = await prisma.exercise.findMany({
        where: whereClause,
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          description: true,
          defaultSets: true,
          defaultTargetReps: true,
          defaultTargetDurationSeconds: true,
          cvStatus: true,
        },
      });

      res.status(200).json({ status: 'success', data: exercises });
    } catch (err) {
      next(err);
    }
  }

 static async getBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    // FIX: Ambil parameter slug dan cast ke tipe 'string'
    const slug = req.params.slug as string;

    const exercise = await prisma.exercise.findUnique({
      where: { slug },
    });

    if (!exercise) {
      throw new AppError(404, 'Latihan tidak ditemukan');
    }

    res.status(200).json({ status: 'success', data: exercise });
  } catch (err) {
    next(err);
  }
}
}