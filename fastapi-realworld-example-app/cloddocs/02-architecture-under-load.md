# Supplementary: Architecture Under Load — What the Docs Don't Teach You

> **Context:** The existing documentation does a solid job explaining *what* the code does. This document covers *what happens when things go wrong at scale* — the failure modes, cascading effects, and mitigation strategies that separate a mid-level engineer from someone who can be trusted with production systems.

---

## 1. The Anatomy of a Production Outage

The existing docs explain how `Promise.all` parallelizes queries and how connection pools work. But they never walk through what a real outage looks like. Here's a scenario grounded in the actual architecture of this codebase.

### The Scenario: Thursday at 3 PM

Your Conduit API has been running smoothly for months. A popular tech blogger with 200K followers publishes a post linking to an article on your platform. Within 10 minutes, traffic spikes from 50 req/s to 2,000 req/s.

### What happens, layer by layer:

```
Timeline:
─────────────────────────────────────────────────────────
 0:00  Normal traffic. Pool: 8/20 connections used.
 0:02  Traffic doubles. Pool: 16/20 connections used.
 0:03  Traffic triples. Pool: 20/20 + overflow begins.
 0:04  Pool hits max_overflow (30 total). New requests wait.
 0:05  pool_timeout (30s) starts expiring. Requests get 500s.
 0:06  Error rate hits 40%. Health check fails.
 0:07  Load balancer removes instance. Remaining instances absorb more load.
 0:08  Cascade: remaining instances also saturate.
 0:10  Full outage. Every request returns 503.
─────────────────────────────────────────────────────────
```

### Why this codebase is particularly vulnerable

1. **No connection pooling configuration is explicit.** The Prisma client in `src/repositories/prisma.ts` is instantiated with zero pool configuration:
   ```typescript
   export const prisma = new PrismaClient({
     log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
   });
   ```
   Prisma's default connection limit for SQLite is 1 (single-writer). For PostgreSQL, it defaults to `num_cpus * 2 + 1`. On a 2-vCPU container, that's **5 connections** — exhausted instantly under load.

2. **Every article query loads the entire follower list.** Look at `ArticleRepository.ts:80-86`:
   ```typescript
   include: {
     author: {
       include: { followers: true },  // ← loads ALL followers into memory
     },
   }
   ```
   If an author has 50,000 followers, every single article query fetches 50,000 user rows into Node.js memory. For a feed of 20 articles by the same author, that's 50,000 × 20 = **1 million user objects** deserialized per request.

3. **No request timeout.** There's nothing stopping a slow database query from holding an Express worker thread for 60+ seconds while the connection pool starves.

### How to fix it

```typescript
// 1. Explicit connection pool sizing
// In your .env or Prisma connection string:
DATABASE_URL="postgresql://user:pass@host/db?connection_limit=20&pool_timeout=10"

// 2. Don't load followers — count them or check membership directly
const article = await prisma.article.findUnique({
  where: { slug },
  include: {
    author: {
      include: {
        // Instead of loading all followers:
        _count: { select: { followers: true } },
        // Check if THIS user follows, not load ALL followers:
        followers: { where: { id: currentUserId }, select: { id: true } },
      },
    },
    tags: true,
    _count: { select: { favoritedBy: true } },
    favoritedBy: currentUserId
      ? { where: { id: currentUserId }, select: { id: true } }
      : false,
  },
});

// 3. Request timeout middleware
import { setTimeout } from 'timers/promises';

app.use(async (req, res, next) => {
  const timeout = setTimeout(10_000).then(() => {
    if (!res.headersSent) {
      res.status(504).json({ errors: { body: ['Request timed out'] } });
    }
  });
  res.on('finish', () => clearTimeout(timeout));
  next();
});
```

---

## 2. Caching Strategies the Docs Ignore

The existing upskill materials mention Redis once, in passing, noting the codebase doesn't use it. But caching is fundamental to system design interviews.

### What should be cached in this application

| Data | TTL | Strategy | Why |
|------|-----|----------|-----|
| Tags list (`GET /tags`) | 5 minutes | Cache-aside | Tags change rarely. This is the most-requested, least-changing endpoint. |
| Article by slug | 30 seconds | Cache-aside with invalidation | Article reads massively outnumber writes. |
| User profile | 60 seconds | Cache-aside | Profile data changes infrequently. |
| Feed query | Not cacheable | — | Personalized per user; caching would leak private data. |
| Auth token validation | Per-request | In-memory LRU | Avoid hitting the DB to verify the same JWT on every request. |

### Cache-aside pattern (the one you'll need in interviews)

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });

async function getArticleBySlug(slug: string): Promise<Article | null> {
  const cacheKey = `article:${slug}`;

  // 1. Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Cache miss — query database
  const article = await prisma.article.findUnique({
    where: { slug },
    include: { author: true, tags: true },
  });

  if (article) {
    // 3. Populate cache with TTL
    await redis.setex(cacheKey, 30, JSON.stringify(article));
  }

  return article;
}

// 4. Invalidate on write
async function updateArticle(slug: string, data: any): Promise<Article> {
  const article = await prisma.article.update({ where: { slug }, data });
  await redis.del(`article:${slug}`);  // Bust the cache
  return article;
}
```

### Cache stampede — the failure mode nobody explains

When a popular cached item expires, hundreds of concurrent requests all simultaneously discover the cache miss and all hit the database at the same time. This is called a **cache stampede** (or thundering herd).

**Solution:** Use a lock or probabilistic early expiration:
```typescript
async function getWithStampedeProtection(key: string, ttl: number, fetcher: () => Promise<any>) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Try to acquire a lock
  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: 5 });

  if (!acquired) {
    // Someone else is refreshing — wait briefly and retry
    await new Promise(r => setTimeout(r, 100));
    return getWithStampedeProtection(key, ttl, fetcher);
  }

  try {
    const value = await fetcher();
    await redis.setex(key, ttl, JSON.stringify(value));
    return value;
  } finally {
    await redis.del(lockKey);
  }
}
```

---

## 3. Database Migration Safety the Docs Gloss Over

The upskill `05-architecture/02-data-auth-and-side-effects.md` has a 5-step migration checklist, but it describes the *happy path only*. Here's what actually goes wrong:

### Dangerous migrations

| Migration | Risk | Why |
|-----------|------|-----|
| `ALTER TABLE articles ADD COLUMN read_time INT NOT NULL` | **Outage** | `NOT NULL` without a default locks the table while backfilling every row. On a table with 10M rows, this can take 30+ minutes. |
| `CREATE UNIQUE INDEX ix_articles_slug ON articles(slug)` | **Outage** | Index creation on large tables acquires a lock that blocks all writes. |
| `ALTER TABLE users DROP COLUMN bio` | **Rollback impossible** | If you drop the column and then need to rollback the application, the old code crashes because it expects `bio` to exist. |
| `ALTER TABLE articles ALTER COLUMN description TYPE TEXT` | **Risky** | Type changes can fail if existing data doesn't conform. |

### The expand-contract pattern (safe migrations)

Instead of modifying columns in place, use a three-phase approach:

```
Phase 1: EXPAND (add new, keep old)
──────────────────────────────────
Migration: ALTER TABLE articles ADD COLUMN slug_v2 VARCHAR(255);
Code: Write to BOTH slug and slug_v2. Read from slug.
Deploy: Safe — old code doesn't know about slug_v2 and ignores it.

Phase 2: MIGRATE (backfill data)
──────────────────────────────────
Script: UPDATE articles SET slug_v2 = slug WHERE slug_v2 IS NULL;
         (Run in batches of 1000 to avoid long locks)
Code: Write to BOTH. Read from slug_v2 (with fallback to slug).

Phase 3: CONTRACT (remove old)
──────────────────────────────────
Migration: ALTER TABLE articles DROP COLUMN slug;
           ALTER TABLE articles RENAME COLUMN slug_v2 TO slug;
Code: Only references slug.
Deploy: Safe — all data already lives in slug_v2/slug.
```

Each phase is independently deployable and rollbackable. This is how Stripe, GitHub, and every large-scale system handles schema changes on live databases.

---

## 4. Horizontal Scaling — What "Stateless" Actually Requires

The existing docs correctly state that JWT makes authentication stateless. But they don't explain what else must be true for horizontal scaling to work.

### Checklist: Can you add a second server instance right now?

| Requirement | Current Status | Problem |
|-------------|---------------|---------|
| No in-memory state between requests | ✅ Yes | — |
| No local file storage for user data | ✅ Yes (no uploads) | If you add file uploads, you need S3 or equivalent |
| Database accessible from multiple instances | ⚠️ SQLite: No | SQLite is a file-based database. Two servers cannot share a single `dev.db` file. You must use PostgreSQL for multi-instance deployments. |
| Session data shared across instances | ✅ Yes (JWT) | — |
| Background jobs not tied to a specific instance | ✅ Yes (none exist) | If you add background jobs, use an external queue (Redis/SQS), not `setTimeout` |
| Consistent slug generation across instances | ⚠️ Weak | `Math.random()` + timestamp could theoretically collide. Use UUIDs. |

### The key insight
**"Stateless" means the server holds zero information between requests.** If you store anything in a module-level variable, a closure, or a `Map()` that persists across requests, you break horizontal scaling because two instances will have divergent state.

```typescript
// ❌ BREAKS horizontal scaling — state stored in process memory
const rateLimitMap = new Map<string, number>();  // Instance A and B have different maps

// ✅ WORKS — state stored in external service (Redis)
const rateLimitCount = await redis.incr(`ratelimit:${ip}`);
```

---

## 5. API Versioning — The Conversation Nobody Had

Neither doc set mentions API versioning. This is a critical omission for enterprise interviews.

### The three common strategies

**1. URL Path Versioning** (most common, easiest to understand)
```
GET /api/v1/articles
GET /api/v2/articles
```
- **Pro:** Obvious, easy to route, easy to deprecate.
- **Con:** URL pollution, forces clients to change URLs.

**2. Header Versioning** (Stripe, GitHub)
```
GET /api/articles
Headers: { "Accept": "application/vnd.conduit.v2+json" }
```
- **Pro:** Clean URLs, more RESTful.
- **Con:** Harder to debug, harder to cache.

**3. Query Parameter Versioning**
```
GET /api/articles?version=2
```
- **Pro:** Simple.
- **Con:** Looks hacky, optional parameters shouldn't change response shape.

### The interview answer

> *"We version via URL path because it provides the clearest contract boundary. When we release v2, we keep v1 running alongside it with a deprecation timeline. We use an API gateway or reverse proxy to route `/v1` and `/v2` to different deployments or code branches. We never break v1 until all consumers have migrated, verified by tracking per-version request counts in our metrics dashboard."*

---

## Summary: What to Study Next

If you've absorbed the existing upskill suite AND this document, here's the prioritized list of remaining topics for staff-level system design readiness:

1. **Event-driven architecture** — Pub/sub, event sourcing, CQRS
2. **Distributed tracing** — OpenTelemetry, Jaeger, trace context propagation
3. **Circuit breakers** — Preventing cascade failures when downstream services go down
4. **Database read replicas** — Replication lag, eventual consistency, stale reads
5. **Feature flags** — Decoupling deployment from release, gradual rollouts
6. **Blue-green and canary deployments** — Zero-downtime deployment strategies

These topics go beyond what this codebase can teach you, but they're the foundations of the system design conversations you'll have at any company running services at scale.
