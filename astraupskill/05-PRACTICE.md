# Practice: predict before reading the answer

Use the changed repository and route as your only specification. For each case, predict the HTTP outcome, Prisma calls, and whether a write occurs.

1. `DELETE /articles/alpha/comments/9` arrives for user 4. Prisma's relation-aware lookup returns `{ id: 9, authorId: 4 }`. What does the route return, and what exact delete selector is sent?
2. The URL says `beta`, but the same id belongs to article `alpha`; the caller is still user 4. Does ownership permit deletion? What does the repository return?
3. The slug matches, but the row's `authorId` is 8 and the caller is 4. Which layer converts the failure to 403?
4. Prisma returns null for a matching id and slug. Does the repository throw, return false, or call delete?
5. `id` parses to `NaN`. The staged route still uses the existing parse behavior. Is malformed-id validation part of this patch's evidence?

For an additional review exercise, compare `create` and `getComments`: both first resolve an article by slug. Explain why a delete method that ignores slug is inconsistent with the repository's own conventions. Then inspect [`snapshots/CommentRepository.ts.original.txt`](snapshots/CommentRepository.ts.original.txt) and mark the exact missing input.

Write a table with columns request, lookup result, authorization result, response, and writes. Keep "not demonstrated" separate from "false": the runtime test does not mount Express, execute authentication, or contact a database. A strong answer also identifies the remaining race: another process could alter the row between the guarded read and delete. This bounded patch preserves existing behavior and narrows the URL/resource mismatch; it does not promise transaction-level atomicity or organization-level isolation.
