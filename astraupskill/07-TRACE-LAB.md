# Trace lab: follow requests through the layers

Use the tables as a worksheet: cover the right-hand columns and predict them. Paths are relative to `fastapi-realworld-example-app/`.

## Trace 1 — four repository states

| slug | id | user | `findFirst` result | route result | delete call | test that covers it |
|---|---:|---:|---|---|---|---|
| alpha | 9 | 4 | row 9, author 4 | 204 | `{ where: { id: 9 } }` | tests 1 and 4 |
| beta | 9 | 4 | null | 404 | none | test 2 (repository only) |
| alpha | 9 | 4 | row 9, author 8 | 403 | none | tests 3 and 4 |
| alpha | 10 | 4 | null | 404 | none | test 4 (`null` case) |

For the first row, walk it fully: the URL matches the pattern at `src/routes/articles.ts:157`; `authenticate` sets `req.user` (`src/middleware/auth.ts:29`); the handler parses `9` (line 160) and passes `(9, 'alpha', 4)` (line 161); the repository's relation filter (`src/repositories/CommentRepository.ts:75`) is where the parent becomes part of data correctness rather than a string carried for logging; the owned row passes line 79; line 83 deletes; the route ends with `res.status(204).end()` (line 166). For the second row, stop at the `null` and do not mentally continue to `comment.delete`.

## Trace 2 — the old code, same inputs

Using the snapshots ([repository](snapshots/CommentRepository.ts.original.txt) line 74, [route](snapshots/articles.ts.original.txt) line 161):

| slug | id | user | `findUnique` result | route result | delete call |
|---|---:|---:|---|---|---|
| alpha | 9 | 4 | row 9, author 4 | 204 | `{ where: { id: 9 } }` |
| beta | 9 | 4 | **row 9, author 4** | **204** | **`{ where: { id: 9 } }`** |
| alpha | 9 | 4 | row 9, author 8 | 403 | none |

Row two is the defect: the slug never left the route.

## Trace 3 — failures before the repository

| Request | Stops at | Status | Repository called? |
|---|---|---|---|
| no `Authorization` header | `auth.ts:14-16` | 401 | no |
| `Authorization: Token` (one part) | `auth.ts:21-23` | 401 | no |
| `Authorization: Token <expired>` | `auth.ts:31-33` | 401 | no |
| `Authorization: Bearer <valid>` | passes `auth.ts:30` | — | yes |

None of these rows is covered by the runtime test (authentication is stubbed at test line 57).

## Trace 4 — infrastructure error

`findFirst` rejects with a database error.

| Step | Code | Effect |
|---|---|---|
| 1 | `CommentRepository.ts:74` | promise rejects; no further repository lines run |
| 2 | `articles.ts:167-168` | caught; message is not `'Forbidden'` |
| 3 | `articles.ts:171` | `next(error)` |
| 4 | `src/server.ts:27` | stack logged to console |
| 5 | `server.ts:28-32` | 500 with `['Internal Server Error', <error message>]` |

The patch does not convert this to 404 or 403, which prevents masking infrastructure failures as "not found". Test 4's final block (`tests/comment-delete-boundary.test.mjs:72-75`) proves step 3 for a failing `delete`; steps 4-5 are untested.

## Trace 5 — two concurrent deletes

| t | Request A | Request B | Database |
|---|---|---|---|
| 1 | `findFirst` -> row 9 | | row 9 present |
| 2 | | `findFirst` -> row 9 | row 9 present |
| 3 | `delete({ where: { id: 9 } })` | | row 9 gone |
| 4 | 204 | `delete({ where: { id: 9 } })` -> outcome not demonstrated | — |

Write "not demonstrated" in B's final cell; neither code nor tests here establish what Prisma raises for a missing row on SQLite. If it raises, Trace 4 applies and B receives a 500.

## Trace 6 — the Python reference

Re-run Trace 1, row 3 under the commented Python rules (`app/api/routes/comments.py:93-102`): if the caller were the **article** author rather than a stranger, the reference would allow the delete. Under the TypeScript code the article author gets 403. Record this as a requirements question, not a test failure.

## Lab checks

**Goal:** separate executed evidence from reading. **Check:** in each table, mark every row covered by one of the four test cases in [`tests/comment-delete-boundary.test.mjs`](../tests/comment-delete-boundary.test.mjs). Only rows in Trace 1 (all four) and step 3 of Trace 4 qualify. Note that the wrong-slug row is covered at repository level only; the route case always uses slug `alpha`.

**Goal:** design the missing test. **Check:** write the request, double and assertions for a *route-level* wrong-slug case (slug `beta`, double returns `null`), and state which line of the test loop you would extend (lines 63-71).
