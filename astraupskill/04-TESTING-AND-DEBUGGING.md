# Testing and debugging the boundary

## The loader

[`tests/helpers/load-typescript.mjs`](../tests/helpers/load-typescript.mjs) evaluates real TypeScript source in a Node `vm` context:

- It strips types with `stripTypeScriptTypes` from `node:module` (line 38) and builds a `vm.SourceTextModule` (line 39). That API is why the command needs `--experimental-vm-modules`.
- Its linker (lines 44-50) resolves imports in a fixed order: an explicit stub wins (line 45); then three allow-listed builtins (line 46); then `@/` aliases (line 47); then relative paths (line 48). Anything else throws `Unstubbed external dependency` (line 49). So every external package the code touches must be named in the test.
- It refuses to load source outside the given root (line 35).

Because stubs are checked first, the test can replace `./prisma` while still loading the real `CommentRepository.ts`.

## The test file

[`tests/comment-delete-boundary.test.mjs`](../tests/comment-delete-boundary.test.mjs):

| Lines | Purpose |
|---|---|
| 7 | root is `fastapi-realworld-example-app/` |
| 8-10 | `prismaState` plus a `Proxy` that forwards property reads to `prismaState.current`. The module is loaded **once**; each test swaps the double underneath it. |
| 11-14 | load the real repository with `./prisma` stubbed as `{ prisma: prismaProxy }` |
| 16-26 | `db({ comment })` installs a double whose `findFirst` and `delete` record their arguments and return the given row |
| 28-33 | **owned, matching** — returns `true`; `findFirst` got `{ where: { id: 9, article: { slug: 'alpha' } } }`; `delete` got `{ where: { id: 9 } }` |
| 35-40 | **wrong slug** — double returns `null`; result `false`; `delete` list empty |
| 42-46 | **matching, not owner** (author 8, caller 4) — rejects `/Forbidden/`; no delete |
| 48-76 | **route wiring** — load the real `articles.ts` with stubs for `express`, both repositories, auth, validate and schemas; capture the handler for `delete /articles/:slug/comments/:id`; run it for 204, 404 and 403; then make `delete` throw and assert the exact error reaches `next` |

Two details are worth copying into your own tests:

- **Serialized comparison.** Lines 31-32 and 38 compare `JSON.stringify(...)` rather than `deepEqual`, because objects created inside the VM have a different `Object.prototype` from the test's realm, and strict deep equality checks prototypes.
- **The router double records the last handler.** `handlers.at(-1)` (line 51) skips the `authenticate` stub and keeps the real async handler. That is why the test passes `user: { id: 4 }` directly in the request object (line 66): no middleware runs.

The fourth case's loop (lines 63-71) asserts, for each outcome: the status; that `end()` was called only for 204; that the repository received the slug from `params` (line 68); that exactly one delete happened only on 204 (line 69); and that error responses have a non-empty `errors.body` (line 70). The final block (lines 72-75) proves an unexpected delete failure is forwarded by identity, not swallowed or mislabelled.

## Debugging guide

Inspect the first call before inspecting the result.

| Symptom | Diagnosis | Look at |
|---|---|---|
| `findFirst` arguments lack `article` | repository fix absent | `CommentRepository.ts:74-76` |
| `findFirst` is never called; `findUnique` is undefined | old code path; the double has no `findUnique` | snapshot vs live file |
| result `false` but `calls.delete` non-empty | guard misplaced after the write | `CommentRepository.ts:77` vs `:83` |
| repository tests pass, line 68 fails | signature changed, route not rewired | `articles.ts:161` |
| `handler` undefined at line 62 | route path or method changed | `articles.ts:157` |
| 403 case returns 500-like `next` call | error message no longer exactly `'Forbidden'` | `CommentRepository.ts:80`, `articles.ts:168` |
| `Unstubbed external dependency: X` | `articles.ts` gained an import | add a stub at test lines 53-60 |

## What the test cannot see

- No Express app is created, so routing, `express.json()`, CORS and the fallback error handler (`src/server.ts:15-33`) are untested.
- `authenticate` is a no-op stub, so JWT parsing and the three 401 paths (`src/middleware/auth.ts:15`, `:22`, `:32`) are untested.
- Prisma is a double, so the relation filter is checked for *shape*, not for the SQL it generates against SQLite, and there is no evidence about concurrency.
- The `NaN` id path is not exercised.

## Running it

From the repository root (the folder containing `tests/`):

```text
node --experimental-vm-modules --test tests/comment-delete-boundary.test.mjs
```

No `npm install` is needed for this file, because every external import is stubbed. The recorded run is described in [VERIFICATION](VERIFICATION.md).

## Exercises

**Goal:** prove the wrong-slug test is a regression test. **Check:** describe what happens to test 2 (lines 35-40) if you revert only the repository to the snapshot version: the double has no `findUnique`, so the call throws a `TypeError` and the assertion fails — note that it fails for an *incidental* reason. Next, give the double a `findUnique` that returns `{ id: 9, authorId: 4 }` and re-trace: the old two-parameter signature receives `(9, 'other', 4)`, so `'other'` lands in `currentUserId`, the author check throws `Forbidden`, and the test fails for a *second* incidental reason. Conclude that the faithful regression check is at the route level with both files reverted: the old route calls `delete(9, 4)`, the `findUnique` double returns the row, and a wrong-slug request ends in 204 with one delete. Write that extra route case (slug `beta`, row belonging to `alpha`) — the current loop at lines 63-71 only ever uses slug `alpha`.

**Goal:** add the missing malformed-id case. **Check:** write the request object and the assertion you would add to the route loop for `params.id = 'abc'`, and state honestly that the expected status cannot be determined from this code alone because it depends on how Prisma treats `NaN`.
