import { Router, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/UserRepository';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { UpdateUserSchema } from '../schemas';

const router = Router();

router.get('/user', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await UserRepository.findById(userId);
    if (!user) {
      res.status(404).json({ errors: { body: ['User not found'] } });
      return;
    }

    const token = UserRepository.generateToken(user.id);
    res.status(200).json({
      user: {
        email: user.email,
        token,
        username: user.username,
        bio: user.bio,
        image: user.image,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/user', authenticate, validate(UpdateUserSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await UserRepository.update(userId, req.body.user);
    res.status(200).json({ user });
  } catch (error: any) {
    res.status(422).json({ errors: { body: [error.message || 'Update failed'] } });
  }
});

export default router;
