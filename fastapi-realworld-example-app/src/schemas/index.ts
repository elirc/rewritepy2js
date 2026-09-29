import { z } from 'zod';

export const RegisterUserSchema = z.object({
  body: z.object({
    user: z.object({
      username: z.string().min(1, 'Username is required'),
      email: z.string().email('Invalid email format'),
      password: z.string().min(6, 'Password must be at least 6 characters long'),
    }),
  }),
});

export const LoginUserSchema = z.object({
  body: z.object({
    user: z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(1, 'Password is required'),
    }),
  }),
});

export const UpdateUserSchema = z.object({
  body: z.object({
    user: z.object({
      email: z.string().email('Invalid email format').optional(),
      username: z.string().min(1).optional(),
      password: z.string().min(6).optional(),
      bio: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
    }),
  }),
});

export const NewArticleSchema = z.object({
  body: z.object({
    article: z.object({
      title: z.string().min(1, 'Title is required'),
      description: z.string().min(1, 'Description is required'),
      body: z.string().min(1, 'Body is required'),
      tagList: z.array(z.string()).default([]),
    }),
  }),
});

export const UpdateArticleSchema = z.object({
  body: z.object({
    article: z.object({
      title: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      body: z.string().min(1).optional(),
    }),
  }),
});

export const NewCommentSchema = z.object({
  body: z.object({
    comment: z.object({
      body: z.string().min(1, 'Comment body is required'),
    }),
  }),
});
