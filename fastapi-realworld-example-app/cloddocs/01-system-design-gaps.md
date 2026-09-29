# Supplementary: System Design Gaps & Missing Architectural Layers

> **Context:** After a thorough review of all existing documentation under `docs/upskill/` and `docs/journey/`, this document addresses system design topics that were either omitted entirely or covered only at surface level. These are the things an interviewer will ask about that the existing materials don't prepare you for.

---

## Gap 1: The Missing Service Layer

### What the existing docs say
The upskill suite (`05-architecture/01-boundaries-and-pattern-catalog.md`) describes three layers: Route Controllers → Dependency Injection → Repositories. The journey docs (`01-conceptual-overview.md`) list five layers but label layer 3 as "Business Domain / Service" and then immediately describe it as "Express Route Controller Handlers."

### What's actually missing
There is no **dedicated service layer** in either the Python original or the TypeScript rewrite. Business logic is split awkwardly between controllers and repositories:

- **Slug generation** happens in the route controller (Python) and in the repository (TypeScript). Neither is correct — it's domain logic that belongs in a service.
- **Ownership checks** (`article.authorId !== currentUserId`) happen in the route controller in Python but inside the repository in TypeScript. This inconsistency means the "where does authorization logic live?" question has two contradictory answers across the codebase.
- **Tag upsert orchestration** is pure business logic (determine which tags exist, create missing ones, associate them), but it lives in the repository.

### Why this matters in interviews
When an interviewer asks *"Where do you put business logic?"*, answering "in the controller" or "in the repository" are both wrong at staff level. The correct answer is:

> Business logic belongs in a **service layer** that sits between the transport layer (controllers) and the persistence layer (repositories). The service orchestrates multiple repository calls, enforces business invariants, and remains completely ignorant of HTTP concepts like status codes or request headers.

### What the architecture should look like

```
Controller (HTTP concerns only)
    │
    ▼
Service (business rules, orchestration, no HTTP, no SQL)
    │
    ▼
Repository (database queries only, no business decisions)
```

### Concrete example: Article creation with a proper service layer

```typescript
// src/services/ArticleService.ts — THE MISSING PIECE

export class ArticleService {
  /**
   * Orchestrates article creation. This is business logic:
   * - Generate a unique slug (domain rule)
   * - Resolve tags (orchestration across Tag + Article repositories)
   * - Enforce business constraints (e.g., title uniqueness policies)
   *
   * Notice: no `req`, no `res`, no HTTP status codes anywhere.
   * Notice: no raw Prisma calls — those belong in the repository.
   */
  static async createArticle(
    input: { title: string; description: string; body: string; tagList: string[] },
    authorId: number
  ): Promise<ArticleResponse> {
    // Business rule: generate slug
    const slug = this.generateUniqueSlug(input.title);

    // Business rule: prevent duplicate titles by same author
    const existing = await ArticleRepository.findBySlugRaw(slug);
    if (existing && existing.authorId === authorId) {
      throw new DuplicateArticleError(input.title);
    }

    // Orchestration: resolve tags (this coordinates two DB operations)
    const resolvedTags = await TagRepository.resolveTagNames(input.tagList);

    // Persistence: delegate the actual INSERT to the repository
    return ArticleRepository.createWithTags(
      { ...input, slug },
      authorId,
      resolvedTags
    );
  }

  private static generateUniqueSlug(title: string): string {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${base}-${Date.now().toString(36)}`;
  }
}
```

```typescript
// In the controller — notice how thin it becomes:
router.post('/articles', authenticate, validate(NewArticleSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const article = await ArticleService.createArticle(req.body.article, req.user!.id);
      res.status(201).json({ article });
    } catch (error) {
      if (error instanceof DuplicateArticleError) {
        res.status(422).json({ errors: { body: [error.message] } });
      } else {
        throw error; // let the global error handler deal with it
      }
    }
  }
);
```

---

## Gap 2: Error Handling Architecture

### What the existing docs say
The upskill docs mention `HTTPException` in passing. The journey docs show a single global error handler in `server.ts` that catches everything with `500 Internal Server Error`. The architecture critique mentions that repositories shouldn't raise HTTP exceptions.

### What's actually missing
Neither document set explains **how to design a proper error hierarchy**, which is one of the most common staff-level interview questions.

### The problem in the current codebase
Look at `src/repositories/ArticleRepository.ts:113`:
```typescript
throw new Error('Forbidden');
```
And the controller catches it with:
```typescript
if (error.message === 'Forbidden') {
  res.status(403).json({ ... });
}
```

This is **string-matching on error messages** — brittle, untestable, and a source of silent bugs if anyone ever changes the string. A typo in either side and the error falls through to a 500.

### The correct approach: domain error classes

```typescript
// src/errors/index.ts

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean; // true = expected, false = programmer bug

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;

  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' not found`);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly isOperational = true;

  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly isOperational = true;

  constructor(public readonly fieldErrors: Record<string, string[]>) {
    super('Validation failed');
  }
}
```

```typescript
// Updated global error handler in server.ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError && err.isOperational) {
    // Expected error — return the appropriate status
    res.status(err.statusCode).json({
      errors: { body: [err.message] },
    });
  } else {
    // Unexpected error — log it, return generic 500, alert on-call
    console.error('UNEXPECTED ERROR:', err);
    res.status(500).json({
      errors: { body: ['An unexpected error occurred'] },
    });
  }
});
```

### Why this matters
- **Operational errors** (user not found, forbidden) are expected and handled gracefully.
- **Programmer errors** (null pointer, undefined property) are bugs and trigger alerts.
- This distinction is **the single most important concept in production error handling** and neither doc set mentions it.

---

## Gap 3: Graceful Shutdown & Connection Cleanup

### What the existing docs say
Nothing. The upskill docs mention connection pools and the outbox pattern, but never address what happens when a server process receives `SIGTERM`.

### Why this matters
In containerized deployments (Kubernetes, ECS, Docker), your process will receive `SIGTERM` regularly during deployments, scaling events, and node rotations. If you don't handle it, in-flight requests get dropped and database connections leak.

```typescript
// What should exist in server.ts but doesn't:

import { prisma } from './repositories/prisma';

const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`\n⏳ Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed — no new connections accepted');
  });

  // 2. Wait for in-flight requests to complete (with timeout)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // 3. Close database connections cleanly
  await prisma.$disconnect();
  console.log('✅ Database connections closed');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### The interview question
> *"What happens to in-flight requests when you deploy a new version of your service?"*

If you can't answer this, you're not ready for a staff-level conversation about production operations.

---

## Gap 4: Structured Logging vs. console.log

### What the existing docs say
The upskill `07-quality/01-testing-and-debugging.md` mentions `pdb` for debugging. The journey docs don't mention logging at all. The actual codebase uses `console.log` and `console.error` everywhere.

### Why this matters
In production, `console.log('Server started')` is useless. You need **structured JSON logs** with correlation IDs so you can trace a single request across your entire system:

```typescript
// What production logging actually looks like:
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }  // Human-readable in dev
    : undefined,                  // Raw JSON in production
});

// Middleware that assigns a correlation ID to every request:
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  req.log = logger.child({ requestId: req.id, method: req.method, url: req.url });
  req.log.info('Request received');
  next();
});
```

A single log line in production looks like:
```json
{
  "level": 30,
  "time": 1716076192000,
  "requestId": "a1b2c3d4-e5f6-7890",
  "method": "POST",
  "url": "/api/articles",
  "msg": "Request received"
}
```

This is how Datadog, Splunk, and CloudWatch can index and search your logs. `console.log` gives you none of this.

---

## Gap 5: Rate Limiting & Abuse Prevention

### What the existing docs say
The security topology (`07-quality/02-performance-and-security.md`) covers JWT key strength, CORS configuration, and bcrypt rounds. It completely omits rate limiting.

### Why this matters
Without rate limiting, your API is vulnerable to:
- **Brute-force login attacks** (trying thousands of password combinations per second)
- **Denial-of-service** (flooding endpoints with requests)
- **Scraping** (extracting your entire article database)

```typescript
// A basic rate limiter using express-rate-limit:
import rateLimit from 'express-rate-limit';

// Global: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errors: { body: ['Too many requests, please try again later'] } },
});

// Strict: 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { errors: { body: ['Too many login attempts'] } },
});

app.use('/api', globalLimiter);
app.use('/api/users/login', loginLimiter);
```

---

## Gap 6: Health Checks & Readiness Probes

### What the existing docs say
Nothing. Not a single mention across 20+ files.

### Why this matters
Every production service needs at least two health endpoints:

```typescript
// Liveness: "Is the process running?"
// Used by the orchestrator to know if it should restart the container.
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: "Can this instance serve traffic?"
// Used by the load balancer to know if it should route requests here.
app.get('/health/ready', async (req, res) => {
  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', db: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', db: 'disconnected' });
  }
});
```

In Kubernetes, these map directly to `livenessProbe` and `readinessProbe` in your pod spec. If your readiness probe fails, the pod is removed from the service load balancer. If your liveness probe fails, the pod is killed and restarted.

---

## Gap 7: Idempotency in Write Operations

### What the existing docs say
The contribution practice doc (`08-contribution-practice.md`) covers soft deletes and N+1 fixes, but never mentions idempotency.

### Why this matters
Network failures happen. When a client sends a `POST /api/articles` and the connection drops before receiving the response, the client doesn't know if the article was created. They retry. Now you have duplicate articles.

### The solution: Idempotency keys

```typescript
// Client sends a unique key with every write request:
// POST /api/articles
// Headers: { "Idempotency-Key": "a1b2c3d4-e5f6" }

// Server-side middleware:
app.use(async (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'PUT') return next();

  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey) return next(); // Optional: make it required

  // Check if we've already processed this key
  const cached = await redis.get(`idempotency:${idempotencyKey}`);
  if (cached) {
    // Return the same response we returned last time
    const { statusCode, body } = JSON.parse(cached);
    res.status(statusCode).json(body);
    return;
  }

  // Monkey-patch res.json to capture the response
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    redis.setex(`idempotency:${idempotencyKey}`, 86400, JSON.stringify({
      statusCode: res.statusCode,
      body,
    }));
    return originalJson(body);
  };

  next();
});
```

This is standard practice at Stripe, Square, and every payment API. It's increasingly expected knowledge for backend engineers.
