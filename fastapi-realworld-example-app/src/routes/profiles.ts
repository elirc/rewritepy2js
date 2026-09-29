import { Router, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/UserRepository';
import { authenticate, optionalAuthenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.get('/profiles/:username', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentUserId = req.user?.id;
    const profile = await UserRepository.getProfile(req.params.username, currentUserId);
    if (!profile) {
      res.status(404).json({ errors: { body: ['Profile not found'] } });
      return;
    }
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
});

router.post('/profiles/:username/follow', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const profile = await UserRepository.follow(req.params.username, currentUserId);
    if (!profile) {
      res.status(404).json({ errors: { body: ['Profile not found'] } });
      return;
    }
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
});

router.delete('/profiles/:username/follow', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const currentUserId = req.user!.id;
    const profile = await UserRepository.unfollow(req.params.username, currentUserId);
    if (!profile) {
      res.status(404).json({ errors: { body: ['Profile not found'] } });
      return;
    }
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
});

export default router;
