import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import profileRoutes from './routes/profiles';
import tagRoutes from './routes/tags';
import articleRoutes from './routes/articles';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Register API Routes under /api prefix
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', profileRoutes);
app.use('/api', tagRoutes);
app.use('/api', articleRoutes);

// General Fallback Error Interceptor
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack || err);
  res.status(500).json({
    errors: {
      body: ['Internal Server Error', err.message || 'Unknown error occurred'],
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`💾 SQLite database connected via Prisma Client`);
});

export default app;
