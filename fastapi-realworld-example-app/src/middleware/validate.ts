import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = parsed.body;
      req.query = parsed.query as any;
      req.params = parsed.params as any;
      next();
    } catch (error: any) {
      const formattedErrors: string[] = error.errors.map(
        (err: any) => `${err.path.join('.')} ${err.message}`
      );
      res.status(422).json({
        errors: {
          body: formattedErrors,
        },
      });
    }
  };
};
