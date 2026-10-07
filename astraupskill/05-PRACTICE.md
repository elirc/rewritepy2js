# Practice: predict before reading the answer

Use the changed repository (`fastapi-realworld-example-app/src/repositories/CommentRepository.ts`) and route (`src/routes/articles.ts`) as your only specification. For each case predict the HTTP outcome, the Prisma calls, and whether a write occurs. Every exercise has a **Goal** and a **Check**; answers are in [06](06-SOLUTIONS-AND-REVIEW.md).

## Part A — single requests

1. `DELETE /api/articles/alpha/comments/9` for user 4; `findFirst` returns `{ id: 9, authorId: 4 }`.
2. The URL says `beta`, but comment 9 belongs to `alpha`; caller is user 4 (the author).
3. The slug matches; the row's `authorId` is 8; caller is 4.
4. `findFirst` returns `null` for a matching id and slug (the comment was already deleted).
5. `id` is `abc`, so `parseInt` returns `NaN`.

**Goal:** apply the check order from chapter 02.

**Check:** fill a table with columns *request, lookup result, authorization result, response, writes*. Mark any cell the code does not determine as "not demonstrated" rather than guessing. Your table must contain exactly one 204 row.

## Part B — headers and middleware

6. The same request as case 1 but with header `Authorization: Bearer <valid jwt>`.
7. Header `Authorization: JWT <valid jwt>`.
8. No `Authorization` header.

**Goal:** know which layer answers before the repository runs.

**Check:** for each, cite the line in `src/middleware/auth.ts` that decides the outcome, and state whether `CommentRepository.delete` is called.

## Part C — consistency review

9. Compare `create` (lines 36-54) and `getComments` (lines 56-71) with the old `delete` in [`snapshots/CommentRepository.ts.original.txt`](snapshots/CommentRepository.ts.original.txt).

**Goal:** use a class's own conventions as a spec.

**Check:** write one sentence explaining why a `delete` that ignores its slug is inconsistent with the other two methods, and mark the exact missing input in the snapshot.

10. Read `ArticleRepository.update` and `ArticleRepository.delete` (`src/repositories/ArticleRepository.ts:108-148`).

**Goal:** generalise the race from chapter 02.

**Check:** identify the read line and the write line in each method, and say which fields could change between them in this codebase (consider that `update` itself rewrites `slug` at line 119).

## Part D — reference behaviour

11. Open the commented Python route `app/api/routes/comments.py` (lines 80-102) and the commented test `tests/api/comments/test_comment_delete.py`.

**Goal:** compare a port with the code it was ported from.

**Check:** list every behavioural difference between the Python reference and the TypeScript `delete` for: wrong article, non-author caller, and an article author deleting someone else's comment on their own article. Cite the Python line and the TypeScript line for each.

## Part E — error surface

12. `prisma.comment.delete` throws `new Error('database unavailable')` after a successful read.

**Goal:** follow an unexpected error to the client.

**Check:** state the HTTP status and the exact response body the client receives, citing `src/routes/articles.ts:171` and `src/server.ts:26-33`. Then say what a security reviewer would object to in that body.

## Part F — race

13. Two requests delete comment 9 at the same moment, both from its author with the correct slug.

**Goal:** reason about read-then-write without a database.

**Check:** describe one interleaving where both `findFirst` calls see the row, and say what the second `delete({ where: { id: 9 } })` would do. Mark clearly that the exact Prisma error and resulting status are *not demonstrated* by any test here.

## Scoring

Two points each for: correct identity predicate; correct authorization outcome; correct status owner (file:line); honest "not demonstrated" cells; at least one finding beyond the patch. Keep "not demonstrated" separate from "false" throughout.
