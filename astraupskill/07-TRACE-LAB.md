# Trace lab: follow four requests

Use the following trace table as a worksheet. The inputs are sent to the existing route; the repository and Prisma records are the observable boundaries.

| slug | id | user | `findFirst` result | expected route result | delete call |
|---|---:|---:|---|---|---|
| alpha | 9 | 4 | row 9, author 4 | 204 | `{where:{id:9}}` |
| beta | 9 | 4 | null | 404 | none |
| alpha | 9 | 4 | row 9, author 8 | 403 | none |
| alpha | 10 | 4 | null | 404 | none |

For the first row, start at the URL, parse `9`, read the authenticated user, and pass all three values to `CommentRepository.delete`. The repository's nested relation filter is the point where the parent becomes data correctness rather than a string carried for logging. After the owned row returns, the old `id` selector is safe for the demonstrated path because the row was already constrained by slug. For the second row, stop at the null result; do not mentally continue to `comment.delete`.

Now create a fifth trace where Prisma's `findFirst` rejects with a database error. The repository lets it reject, and the route's general catch calls `next`; it is not converted to 404 or 403 by this patch. That distinction prevents accidental masking of infrastructure failures. Finally, compare the trace to [`tests/comment-delete-boundary.test.mjs`](../tests/comment-delete-boundary.test.mjs): cases 1-3 cover repository states, and case 4 executes the route callback and actual repository together across success, missing, forbidden and delete-error outcomes. There is no test for middleware, response serialization, or real SQL. Record those as follow-up test targets rather than filling the table with invented evidence.
