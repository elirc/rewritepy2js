# Codebase map: one delete request

All paths are relative to `fastapi-realworld-example-app/`.

## Layer diagram

```text
HTTP DELETE /api/articles/:slug/comments/:id
  src/server.ts:15-16        cors(), express.json()
  src/server.ts:23           app.use('/api', articleRoutes)
  src/routes/articles.ts:157 router.delete('/articles/:slug/comments/:id', authenticate, handler)
    src/middleware/auth.ts:12-34   authenticate -> req.user = { id }
    handler (articles.ts:158-173)
      parseInt(req.params.id)                       line 160
      CommentRepository.delete(id, slug, userId)    line 161
        src/repositories/CommentRepository.ts:73-85
          prisma.comment.findFirst({ where: { id, article: { slug } } })
          authorId check -> throw Error('Forbidden')
          prisma.comment.delete({ where: { id } })
        src/repositories/prisma.ts:3   PrismaClient singleton
      status mapping: false -> 404, 'Forbidden' -> 403, other -> next(error)
  src/server.ts:26-33        fallback error handler -> 500
```

## Who owns each status code

| Status | Produced at | Condition |
|---|---|---|
| 401 | `src/middleware/auth.ts:15` | no `Authorization` header |
| 401 | `auth.ts:22` | header is not exactly `Token <jwt>` or `Bearer <jwt>` |
| 401 | `auth.ts:32` | `jwt.verify` throws |
| 204 | `src/routes/articles.ts:166` | repository returned `true` |
| 404 | `articles.ts:162-164` | repository returned `false` (body `Comment not found`) |
| 403 | `articles.ts:168-169` | caught error whose `message === 'Forbidden'` |
| 500 | `src/server.ts:26-33` | any other error passed to `next` |

Each status has a different owner. When a test fails with the wrong code, this table tells you which file to open.

## The route (`src/routes/articles.ts:156-174`)

The handler reads `req.user!.id` (line 159) — the non-null assertion is safe only because `authenticate` runs first in the same registration. It parses the comment id with `parseInt(req.params.id)` (line 160), with no radix and no `NaN` check. It then delegates with all three values (line 161). Note that the article-level routes in the same file follow the same pattern: `DELETE /articles/:slug` (lines 77-94) and `PUT /articles/:slug` (lines 58-75) also map `false` to 404 and `'Forbidden'` to 403.

## The authentication middleware (`src/middleware/auth.ts`)

`authenticate` accepts both the Conduit-style `Token` prefix and `Bearer` (lines 19-24), verifies with `SECRET_KEY` (line 28) and sets `req.user = { id: parseInt(payload.sub) }` (line 29). `SECRET_KEY` falls back to the literal `'SECRET_KEY_FALLBACK'` when the environment variable is unset (line 4). `optionalAuthenticate` (lines 36-51) swallows verification errors and continues anonymously; it is used for the comment list route (articles.ts:142), not for delete.

## The repository (`src/repositories/CommentRepository.ts`)

The repository is a class of static methods over the imported Prisma singleton (line 1). That import path is the seam the test replaces.

- `create(body, slug, authorId)` (lines 36-54) resolves the article with `findUnique({ where: { slug } })` and returns `null` if missing, then creates with `articleId: article.id`.
- `getComments(slug, currentUserId?)` (lines 56-71) resolves the article the same way, then `findMany({ where: { articleId: article.id }, orderBy: { createdAt: 'desc' } })`.
- `delete(id, slug, currentUserId)` (lines 73-85) — the fixed method — reads with `findFirst({ where: { id, article: { slug } } })`, returns `false` if no row, throws `Forbidden` on author mismatch, then `delete({ where: { id } })` and returns `true`.
- `mapComment` (lines 17-34) shapes the response and computes `following` by scanning `comment.author.followers` (lines 18-20), which is why `create` and `getComments` `include: { author: { include: { followers: true } } }` (lines 46-50, 63-67).

Two of three methods already resolved the parent first. The old `delete` was the odd one out — a convention violation is often the fastest clue to a bug.

## The schema (`prisma/schema.prisma`)

- `Article.slug` is `@unique` (line 35); `Article.id` is the primary key (line 32).
- `Comment.articleId` (line 59) references `Article.id` through the relation named `article` (line 65), with `onDelete: Cascade`.
- `Comment.id` is a global autoincrement primary key (line 58) — unique across all articles, which is exactly why "id alone" finds a row regardless of the URL's slug.

So the nested URL contains two identifiers: the public parent key (`slug`) and the child key (`id`). The relation filter `article: { slug }` uses the relation name from line 65 and the unique field from line 35.

## The test seam

[`tests/comment-delete-boundary.test.mjs`](../tests/comment-delete-boundary.test.mjs) (outside the app folder, at repository root) loads the real `CommentRepository.ts` with `./prisma` stubbed, records `findFirst` and `delete` arguments, and in its fourth case loads the real `articles.ts` with a router double to execute the registered DELETE callback. It is a source-level integration seam, not a mounted server test.

## Exercise: follow values, not files

**Goal:** practise value tracing on unfamiliar CRUD code.

**Check:** write two chains. (1) `slug`: URL path -> `req.params.slug` (articles.ts:161) -> `delete` parameter (CommentRepository.ts:73) -> relation filter (line 75). (2) `currentUserId`: `Authorization` header -> `payload.sub` (auth.ts:29) -> `req.user!.id` (articles.ts:159) -> comparison (CommentRepository.ts:79). In the snapshot version, mark the exact link where chain (1) ended.
