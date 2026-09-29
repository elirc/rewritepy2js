import { Router, Request, Response, NextFunction } from 'express';
import { ArticleRepository } from '../repositories/ArticleRepository';

const router = Router();

router.get('/tags', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tags = await ArticleRepository.getTags();
    res.status(200).json({ tags });
  } catch (error) {
    next(error);
  }
});

export default router;
