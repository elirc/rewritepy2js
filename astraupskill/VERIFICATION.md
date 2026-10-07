# Verification record

## Changed production files

Two files under `fastapi-realworld-example-app/` changed:

- [`src/repositories/CommentRepository.ts`](../fastapi-realworld-example-app/src/repositories/CommentRepository.ts) — `delete` gains a `slug` parameter and a relation-aware lookup (lines 73-76).
- [`src/routes/articles.ts`](../fastapi-realworld-example-app/src/routes/articles.ts) — the comment DELETE handler passes `req.params.slug` (line 161).

Pre-change bytes are preserved in [`snapshots/CommentRepository.ts.original.txt`](snapshots/CommentRepository.ts.original.txt) and [`snapshots/articles.ts.original.txt`](snapshots/articles.ts.original.txt). A plain `diff` of each pair shows only the hunks `73,74c73,76` and `161c161`.

Test support files at the repository root:

- [`tests/helpers/load-typescript.mjs`](../tests/helpers/load-typescript.mjs) — the dependency-free VM loader.
- [`tests/comment-delete-boundary.test.mjs`](../tests/comment-delete-boundary.test.mjs) — the four-case regression.

## Recorded command

The run recorded in [`evidence/results.json`](evidence/results.json) executed:

```text
node --experimental-vm-modules --test tests/comment-delete-boundary.test.mjs
```

through a project-check wrapper whose check id was `crud-b03-astra-runtime2`. `results.json` records `"exitCode": 0`, `"executedTests": 4`, `"passed": true`, start time `2026-09-22T02:05:40Z`, about 14.5 seconds elapsed, and a `cwd` inside a staging directory on the original machine (not this clone).

The four subtests are: owned matching delete; wrong slug zero-write; matching slug ownership rejection; and actual route handler execution (204/404/403 plus forwarding of a delete error to `next`). The previous edition of this record noted that an earlier version of the fourth case was only a source-text assertion and was replaced with real handler execution before this run.

The `log` field names `crud-b03-astra-runtime2.log`, but **that log is not in this repository** — `astraupskill/evidence/` contains only `results.json`. The per-test terminal output therefore cannot be inspected from this clone; re-run the command to see it first-hand.

## What is and is not proven

| Claim | Status |
|---|---|
| Repository queries `{ id, article: { slug } }` | Asserted (test lines 31, 38, 68) |
| Wrong slug -> `false`, zero writes | Asserted at repository level (lines 37-39) |
| Non-author -> `Forbidden`, zero writes | Asserted (lines 44-45) |
| Route passes the URL slug; maps 204/404/403 | Asserted (lines 63-71) |
| Unexpected delete error forwarded to `next` by identity | Asserted (lines 72-75) |
| Wrong slug through the **route** | Not tested — route cases use slug `alpha` only |
| JWT middleware, 401 paths | Not tested — `authenticate` stubbed |
| Express app, JSON parsing, 500 handler | Not tested — no server mounted |
| Prisma SQL against SQLite (`prisma/schema.prisma:2`) | Not tested — Prisma is a double |
| Concurrency, transactions | Not tested |
| `NaN` id handling | Not tested |

The commented Python files under `app/` and `tests/` contain no uncommented code lines, so they are not part of the change or the evidence; chapter 06 uses them only as a reference specification.

## Next verification steps

1. **HTTP integration:** run the app against a scratch SQLite database (the schema's `file:./dev.db`), seed two articles and one comment, issue the four Trace 1 requests plus a route-level wrong-slug request, and assert both status codes and the persisted row count.
2. **Concurrency:** issue two simultaneous deletes and record the second response, to decide whether a conditional `deleteMany` or a transaction is needed.
3. **Middleware:** add 401 cases for missing, malformed and expired tokens.

**Check (for a maintainer re-verifying):** in a fresh clone, the recorded command exits 0 and `node:test` reports `pass 4`; reverting only `articles.ts:161` to the snapshot makes the fourth test fail: the shifted arguments put `4` in `slug` and `undefined` in `currentUserId`, so the first loop iteration returns 403 instead of 204 (line 67).
