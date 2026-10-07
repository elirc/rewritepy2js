# Concepts: nested identity and authorization

Paths are relative to `fastapi-realworld-example-app/`.

## 1. A nested URL carries two facts

`/articles/:slug/comments/:id` names a parent (`slug`) and a child (`id`). The safe lookup is the conjunction `comment.id = id AND article.slug = slug`. Checking only the child answers a different question — "does this row exist anywhere?" — and lets the URL lie about its parent. Because `Comment.id` is a global autoincrement key (`prisma/schema.prisma:58`), an id lookup always ignores the parent.

This matters even when the caller owns the comment. Ownership answers *who may act*; parent matching answers *which resource they asked for*. The bug was not an authorization bypass across users (the author check still ran), it was an **identity** bug: the server executed a different request than the one the URL described. Clients that build URLs from stale state, or log/audit by URL, would record a delete against the wrong article.

## 2. Check order is a design decision

The fixed repository applies checks in this order (`src/repositories/CommentRepository.ts:73-85`):

1. **Identity** — `findFirst({ where: { id, article: { slug } } })`. No row -> `false` -> 404.
2. **Authorization** — `comment.authorId !== currentUserId` -> `throw new Error('Forbidden')` -> 403.
3. **Write** — `delete({ where: { id } })` -> `true` -> 204.

Putting identity first means a caller probing ids under the wrong slug gets 404 rather than 403, so the endpoint does not confirm that "comment 9 exists and belongs to someone else" unless the slug is also right. Putting authorization before the write is the zero-write guarantee the tests assert.

## 3. 404 vs 403 is existing product behaviour

The route's mapping is shared with the article endpoints in the same file (`src/routes/articles.ts:82-84` and `:88-89` for article delete; `:162-164` and `:168-169` for comment delete). Preserve it rather than inventing a new error shape. Note that this mapping relies on string-matching an error message (`error.message === 'Forbidden'`); any other exception — including a Prisma error — falls through to `next(error)` and becomes a 500 in `src/server.ts:26-33`.

## 4. Read-then-write is not atomic

After the guarded read, the write uses only `{ where: { id } }` (line 83). The sequence demonstrates the right logic but does not atomically preserve the read's conditions: if another operation changed the comment's article or author between lines 74 and 83, the delete would still proceed. In this schema neither `articleId` nor `authorId` is ever updated by the TypeScript code (there is no comment-update route in `articles.ts`), so the practical exposure is small — but the same shape appears in `ArticleRepository.update` and `ArticleRepository.delete` (`src/repositories/ArticleRepository.ts:108-148`), where the row is mutable.

A single conditional write — a `deleteMany` filtered by id, slug and author whose returned count distinguishes "nothing matched" — would close the window but would also merge the 404 and 403 cases unless a follow-up read distinguishes them. Whether that trade-off is worth it, and the exact Prisma filter support, needs evidence from a real database run; this lesson does not provide it.

## 5. Repository conventions as a review tool

`create` (lines 36-54) and `getComments` (lines 56-71) both resolve the article by slug first and return `null` when it is missing. A `delete` that ignored its slug was inconsistent with the class's own convention. The fix chooses a single relation-filtered query instead of a two-step "find article, then find comment where articleId matches"; both enforce the invariant, and the single query avoids an extra round trip.

## 6. What the change does not claim

- **Tenant isolation:** the schema has article ownership and comment authorship but no organization key, so "tenant" vocabulary does not apply.
- **Malformed ids:** `parseInt(req.params.id)` (articles.ts:160) can yield `NaN`; this patch neither validates nor tests that path.
- **Article-author moderation:** only the comment author may delete. The commented Python reference allowed the article author too (see chapter 06); the TypeScript port does not.

## Concept checks

1. **Goal:** separate identity from authorization. **Check:** for the request "user 4 deletes their own comment 9 via the wrong slug", say which check fails in the new code and which status results (identity, 404).
2. **Goal:** locate the race window. **Check:** cite the two line numbers between which another writer could interfere (`CommentRepository.ts:74` and `:83`), and name one other repository method in this codebase with the same shape.
3. **Goal:** trace an unexpected error. **Check:** if `findFirst` rejects with a database error, list every file:line it passes through until a response is written (`CommentRepository.ts:74` -> `articles.ts:171` -> `server.ts:28-32`).
