import { Router, Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/UserRepository';
import { validate } from '../middleware/validate';
import { RegisterUserSchema, LoginUserSchema } from '../schemas';

const router = Router();

router.post('/users', validate(RegisterUserSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserRepository.register(req.body.user);
    res.status(201).json({ user });
  } catch (error: any) {
    res.status(422).json({ errors: { body: [error.message || 'Registration failed'] } });
  }
});

router.post('/users/login', validate(LoginUserSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await UserRepository.login(req.body.user);
    if (!user) {
      res.status(401).json({ errors: { body: ['Invalid email or password'] } });
      return;
    }
    res.status(200).json({ user });
  } catch (error: any) {
    next(error);
  }
});

export default router;
