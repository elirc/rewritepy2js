# Worked change: bind delete to its article

The old repository method was:

```ts
static async delete(id: number, currentUserId: number): Promise<boolean> {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return false;
  if (comment.authorId !== currentUserId) throw new Error('Forbidden');
  await prisma.comment.delete({ where: { id } });
  return true;
}
```

The route supplied a slug but discarded it at the call boundary. The staged implementation is:

```ts
static async delete(id: number, slug: string, currentUserId: number) {
  const comment = await prisma.comment.findFirst({
    where: { id, article: { slug } },
  });
  if (!comment) return false;
  if (comment.authorId !== currentUserId) throw new Error('Forbidden');
  await prisma.comment.delete({ where: { id } });
  return true;
}
```

and the route calls `delete(commentId, req.params.slug, currentUserId)`. `findFirst` makes both identity predicates explicit in the read. The choice here does not establish which other selector shapes a particular Prisma version supports. The relation name `article` comes from the schema, while `slug` is the unique field on `Article`.

Trace a request with id 9, slug `alpha`, user 4. The repository asks for id 9 under article alpha, receives an owned row, and deletes id 9. Change only the slug to `beta`; the double returns no row, so the result is false and the delete call list stays empty. Keep the old snapshot open while reviewing: it proves both the discarded URL value and the exact baseline behavior. This is a small change because it repairs the identity predicate and call signature without changing response formats, creation, listing, or authentication.


The important review question is not whether `findFirst` can find a row; it is whether the test proves the route value is present in that query. A signature change without the route update would either fail compilation in a typed build or silently use the wrong argument in an untyped caller. The executed handler case catches that seam without mounting Express.
