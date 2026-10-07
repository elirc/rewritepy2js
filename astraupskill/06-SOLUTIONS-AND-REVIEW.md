# Solutions and review rubric

Paths are relative to `fastapi-realworld-example-app/`.

## Part A

| # | Request | Lookup | Authorization | Response | Writes |
|---|---|---|---|---|---|
| 1 | alpha / 9 / user 4 | `findFirst({ where: { id: 9, article: { slug: 'alpha' } } })` -> row, author 4 | passes | 204 (`routes/articles.ts:166`) | `delete({ where: { id: 9 } })` |
| 2 | beta / 9 / user 4 | `findFirst` with slug `beta` -> `null` | not reached | 404 `Comment not found` (`articles.ts:162-164`) | none |
| 3 | alpha / 9 / user 4, author 8 | row | `Forbidden` thrown (`CommentRepository.ts:80`) | 403 (`articles.ts:168-169`) | none |
| 4 | alpha / 9 / user 4, row gone | `null` | not reached | 404 | none |
| 5 | alpha / `abc` | `findFirst` with `id: NaN` | not demonstrated | not demonstrated | not demonstrated |

Case 2 is the fix: ownership would have permitted it, but identity fails first, so the author's own comment cannot be deleted through the wrong parent. Case 5 is outside the patch; how Prisma reacts to `NaN` for an `Int` filter is not shown by any code or test in this clone. If it throws, the error reaches `next` (line 171) and becomes a 500.

## Part B

6. `Bearer` is accepted (`src/middleware/auth.ts:21` allows `Token` or `Bearer`); the repository is called as in case 1.
7. `JWT` is rejected at `auth.ts:21-23` with 401 `Invalid token format`; the repository is not called.
8. No header -> 401 `Authorization header is missing` at `auth.ts:14-16`; the repository is not called.

## Part C

9. `create` and `getComments` both start with `prisma.article.findUnique({ where: { slug } })` (lines 37 and 57) and return `null` when the article is missing; the old `delete` accepted no `slug` parameter at all (snapshot line 73), so it could not honour the same parent rule.
10. `ArticleRepository.update`: read at line 109, write at line 124 (`prisma.article.update({ where: { slug } ...})`). `ArticleRepository.delete`: read at line 140, write at line 147. Between read and write another `update` can rewrite the article's `slug` (line 119), so a concurrent rename makes the second `where: { slug }` miss. The author field is never changed by this code.

## Part D — the Python reference diverges

The commented Python implementation (`app/api/routes/comments.py:80-102`) and tests (`tests/api/comments/test_comment_delete.py`) describe different rules from the TypeScript port:

| Situation | Python reference | TypeScript port |
|---|---|---|
| Comment belongs to another article | 400 `Comment does not belong to this article` (`comments.py:96-97`; test lines 48-69) | 404 `Comment not found` (`articles.ts:162-164`) |
| Caller is neither comment author nor article author | 400 `Comment does not belong to this user` (`comments.py:99-100`) | 403 (`articles.ts:168-169`) |
| Caller is the **article author**, comment by someone else | allowed, 200 (`comments.py:99`; test `test_can_delete_all_comments_of_own_article`, lines 72-85) | 403 — only the comment author may delete (`CommentRepository.ts:79-81`) |
| Success status | 200 (test lines 84, 100) | 204 (`articles.ts:166`) |

The patch in this lesson restored the *parent check* that the Python version had, but chose 404 rather than 400 to stay consistent with the TypeScript file's existing mapping. The moderation rule (article authors may remove comments on their article) was not ported at all. Whether that is a bug or a deliberate product decision cannot be determined from code; a reviewer should ask.

## Part E

The repository rethrows; the route's catch sees `message !== 'Forbidden'` and calls `next(error)` (`articles.ts:171`); the fallback handler logs the stack and responds **500** with `{ errors: { body: ['Internal Server Error', 'database unavailable'] } }` (`src/server.ts:28-32`). The objection: `err.message` from arbitrary internal errors — including database driver messages — is returned to the client. It should be logged, not echoed.

## Part F

Both requests can pass `findFirst` before either deletes. The first `delete({ where: { id: 9 } })` removes the row; the second targets a missing row. What Prisma raises in that case, and therefore which status the second client sees, is not demonstrated here. If it raises, the route forwards it to `next` and the client gets a 500 instead of the 404 a sequential retry would get.

## Rubric

Award credit when an answer: passes the slug from route to repository; uses the schema's relation name (`schema.prisma:65`); preserves the ownership check; proves a wrong parent causes zero writes; and keeps undemonstrated behaviour labelled. Ask for both a wrong-parent test and an ownership test — one happy path is insufficient. Check that the snapshots are byte-for-byte originals, that the test imports production source through the helper, and reject any claim of database or end-to-end coverage: the test supplies Prisma, router, middleware and response doubles.

## Senior-review findings

1. **Fixed — parent identity ignored.** Old `CommentRepository.delete` read by `{ id }` only (snapshot line 74). Now `findFirst({ where: { id, article: { slug } } })` (`CommentRepository.ts:74-76`).
2. **Internal error messages leak to clients.** `src/server.ts:30` returns `err.message` in the 500 body.
3. **Hard-coded JWT fallback secret.** `src/middleware/auth.ts:4` uses `'SECRET_KEY_FALLBACK'` when `SECRET_KEY` is unset, so a misconfigured deploy silently accepts tokens signed with a public string. Fail fast at startup instead.
4. **Unvalidated numeric path parameter.** `parseInt(req.params.id)` without radix or `NaN` check (`articles.ts:160`); `validate()` (`src/middleware/validate.ts:4-27`) exists but no params schema is applied to this route.
5. **Read-then-write without a condition.** `CommentRepository.ts:74-83`, and more consequentially `ArticleRepository.ts:109/124` and `:140/147`, where `slug` is mutable.
6. **Error classification by string.** `error.message === 'Forbidden'` (`articles.ts:168`, also lines 69 and 88). A typed error class would survive message edits.
7. **Port divergence from the reference.** Article-author moderation and status codes differ from the commented Python implementation (Part D).
8. **Follower scan per comment.** `mapComment` loads every follower of each comment author (`include: { followers: true }`, `CommentRepository.ts:46-50`, `63-67`) just to compute one boolean with `.some` (lines 18-20). On popular authors this grows with follower count; a filtered relation or a count query would be cheaper.
