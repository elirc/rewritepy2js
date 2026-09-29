import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY || 'SECRET_KEY_FALLBACK';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
  };
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ errors: { body: ['Authorization header is missing'] } });
    return;
  }

  // Conduit spec uses 'Token <jwt>' instead of 'Bearer <jwt>'
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || (parts[0] !== 'Token' && parts[0] !== 'Bearer')) {
    res.status(401).json({ errors: { body: ['Invalid token format'] } });
    return;
  }

  const token = parts[1];
  try {
    const payload = jwt.verify(token, SECRET_KEY) as any;
    req.user = { id: parseInt(payload.sub) };
    next();
  } catch (error) {
    res.status(401).json({ errors: { body: ['Invalid or expired token'] } });
  }
};

export const optionalAuthenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && (parts[0] === 'Token' || parts[0] === 'Bearer')) {
      const token = parts[1];
      try {
        const payload = jwt.verify(token, SECRET_KEY) as any;
        req.user = { id: parseInt(payload.sub) };
      } catch (error) {
        // Suppress and allow anonymous request
      }
    }
  }
  next();
};
