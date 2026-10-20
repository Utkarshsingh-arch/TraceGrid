import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jurisdictions = await prisma.jurisdiction.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        region: true,
      },
    });

    res.status(200).json({
      success: true,
      data: jurisdictions,
    });
  } catch (err) {
    next(err);
  }
});

export const jurisdictionRoutes = router;
