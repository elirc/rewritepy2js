# Worked change: bind delete to its article

Paths are relative to `fastapi-realworld-example-app/` unless they start with `astraupskill/` or `tests/`.

## Before

From [`snapshots/CommentRepository.ts.original.txt`](snapshots/CommentRepository.ts.original.txt), lines 73-82:

```ts
static async delete(id: number, currentUserId: number): Promise<boolean> {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return false;

  if (comment.authorId !== currentUserId) {
    throw new Error('Forbidden');
  }

  await prisma.comment.delete({ where: { id } });
  return true;
}
```

and from [`snapshots/articles.ts.original.txt`](snapshots/articles.ts.original.txt), line 161:

```ts
const success = await CommentRepository.delete(commentId, currentUserId);
```

The route had the slug in `req.params.slug` and discarded it at the call boundary.

## After

`src/repositories/CommentRepository.ts:73-85`:

```ts
static async delete(id: number, slug: string, currentUserId: number): Promise<boolean> {
  const comment = await prisma.comment.findFirst({
    where: { id, article: { slug } },
  });
  if (!comment) return false;

  if (comment.authorId !== currentUserId) {
    throw new Error('Forbidden');
  }

  await prisma.comment.delete({ where: { id } });
  return true;
}
```

`src/routes/articles.ts:161`:

```ts
const success = await CommentRepository.delete(commentId, req.params.slug, currentUserId);
```

A plain `diff` of each snapshot against its live file reports exactly these hunks: `73,74c73,76` in the repository and `161c161` in the route.

## Line-by-line reasoning

- **New parameter position.** `slug` is inserted between `id` and `currentUserId`. Both are typed, so in a `tsc` build a caller that still passed two arguments would fail to compile; a caller that passed `(id, userId, slug)` by mistake would also fail, because `userId` is a `number` and `slug` a `string`. (No `tsc` run is part of this lesson's evidence.)
- **`findUnique` -> `findFirst`.** `findUnique` selects by a unique field; the conjunction with a relation filter is expressed with `findFirst`, which accepts an arbitrary `where`. The relation name `article` comes from `prisma/schema.prisma:65`, the field `slug` from line 35. Which other selector shapes a particular Prisma version supports is not established here.
- **Unchanged write.** `delete({ where: { id } })` stays as it was. After the guarded read it targets the same row in the demonstrated path; it does not re-assert the slug (see the race discussion in chapter 02).
- **Unchanged responses.** No status code, response body, creation or listing behaviour changed.

## Trace

Request id 9, slug `alpha`, user 4.

| Version | Read | Read result | Write | Return | HTTP |
|---|---|---|---|---|---|
| before | `findUnique({ where: { id: 9 } })` | row 9, author 4 | `delete({ where: { id: 9 } })` | `true` | 204 |
| after | `findFirst({ where: { id: 9, article: { slug: 'alpha' } } })` | row 9, author 4 | `delete({ where: { id: 9 } })` | `true` | 204 |

Change only the slug to `beta` (comment 9 still belongs to `alpha`):

| Version | Read result | Write | HTTP |
|---|---|---|---|
| before | row 9, author 4 | **deletes row 9** | 204 |
| after | `null` | none | 404 |

The second table is the bug and its fix in two rows.

## What was deliberately not changed

- Malformed-id handling at `articles.ts:160`.
- The article-author moderation rule from the Python reference (chapter 06).
- The error-message string matching at `articles.ts:168`.
- Atomicity of read-then-delete.

Each is a legitimate follow-up, and each would need its own test. Keeping the patch to two hunks makes its review cheap and its evidence complete.

## The review question

The important question is not whether `findFirst` can find a row; it is whether the route value is proven to reach that query. A repository-only test would pass even if the route still called `delete(commentId, currentUserId)` in an untyped build. That is why the fourth test executes the registered route handler (`tests/comment-delete-boundary.test.mjs:48-76`) and asserts the `where` the repository received (line 68).

## Exercises

**Goal:** reproduce the diff. **Check:** `git diff --no-index astraupskill/snapshots/CommentRepository.ts.original.txt fastapi-realworld-example-app/src/repositories/CommentRepository.ts` shows one removed `findUnique` line and an added `findFirst` block, and nothing else.

**Goal:** apply the same fix shape elsewhere. **Check:** search `src/routes/` for other nested routes with two path parameters. List them, and for each say whether the repository call receives every URL parameter. (In this clone, `/articles/:slug/comments/:id` is the only route with two path parameters.)
