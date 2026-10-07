# rewritepy2js CRUD upskill

## What this repository actually runs

Despite the project name, the executable code this lesson studies is the TypeScript Express application in [`fastapi-realworld-example-app/src`](../fastapi-realworld-example-app/src). Its `package.json` describes itself as a "TypeScript / Express rewrite of the Conduit RealWorld API" and its `dev` script runs `ts-node-dev ... src/server.ts`. The Python tree beside it (`app/`, `tests/`) is **commented out**: for example 87 of the 102 lines in `app/api/routes/comments.py` begin with `#`, and the Python tests under `tests/api/` are commented in the same way. The Python code is therefore not executable evidence, but it is still useful as the *reference behaviour* the rewrite was ported from (see chapter 06).

The persistence layer is Prisma with a **SQLite** datasource (`prisma/schema.prisma` lines 1-4: `provider = "sqlite"`, `url = "file:./dev.db"`). Earlier drafts of these notes said PostgreSQL; that does not match the schema in this clone.

## The defect

`DELETE /api/articles/:slug/comments/:id` (route registered at `src/routes/articles.ts:157`, mounted under `/api` at `src/server.ts:23`) presents an article slug, but the old repository lookup used only `{ id }`. An authenticated comment author could send a valid comment id under *another* article's slug and still delete it — the URL lied about its parent and the server did not check.

The change, visible by diffing the [snapshots](snapshots) against the live files:

- `CommentRepository.delete` gains a `slug` parameter and replaces `findUnique({ where: { id } })` with `findFirst({ where: { id, article: { slug } } })` (`src/repositories/CommentRepository.ts:73-76`).
- The route passes `req.params.slug` (`src/routes/articles.ts:161`).

Ownership remains a separate second check (lines 79-81). A wrong slug now behaves like a missing resource and reaches no delete call.

## The invariant

Name it before editing:

> A comment can be deleted through this endpoint only when its id belongs to the article named in the URL **and** its author is the authenticated user.

Each runtime test case breaks exactly one clause, so a failure points at one clause.

## Reading order

1. [01-CODEBASE-MAP](01-CODEBASE-MAP.md) — the request from `server.ts` to Prisma, with every status code's owner.
2. [02-CONCEPTS](02-CONCEPTS.md) — nested identity, 404 vs 403, read-then-write races, repository conventions.
3. [03-WORKED-CHANGE](03-WORKED-CHANGE.md) — the diff, line by line, and what was intentionally left alone.
4. [04-TESTING-AND-DEBUGGING](04-TESTING-AND-DEBUGGING.md) — how the VM loader runs real TypeScript against a Prisma double.
5. [05-PRACTICE](05-PRACTICE.md) — Goal/**Check** exercises; do them before reading 06.
6. [06-SOLUTIONS-AND-REVIEW](06-SOLUTIONS-AND-REVIEW.md) — answers, rubric, senior-review findings, and the Python-reference divergence.
7. [07-TRACE-LAB](07-TRACE-LAB.md) — request traces, including failure and race traces.
8. [VERIFICATION](VERIFICATION.md) — what was executed and what was not.

## Evidence boundary

The [runtime test](../tests/comment-delete-boundary.test.mjs) loads the real TypeScript repository and route through a local VM loader and supplies Prisma-shaped, router and response doubles. It verifies query arguments, delete calls, ownership failure, route wiring and error forwarding. It does not start Express, run the JWT middleware, or execute SQL against SQLite.

**Goal for the lesson:** explain, with file:line citations, why a request with the wrong slug used to delete a row and now cannot.

**Check:** given `DELETE /api/articles/beta/comments/9` from the author of comment 9 (which belongs to article `alpha`), write the old and new Prisma calls and the HTTP status each version returns. Compare against the snapshot (`findUnique({ where: { id } })` -> 204) and the live file (`findFirst` -> `null` -> 404 at `articles.ts:162-164`).
