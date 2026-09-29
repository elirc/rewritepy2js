import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from './helpers/load-typescript.mjs';

const root = fileURLToPath(new URL('../fastapi-realworld-example-app/', import.meta.url));
let prisma;
const prismaState = { current: null };
const prismaProxy = new Proxy({}, { get: (_target, key) => prismaState.current?.[key] });
const repository = await loadTypeScript('src/repositories/CommentRepository.ts', {
  root,
  stubs: { './prisma': { prisma: prismaProxy } },
});

function db({ comment = null } = {}) {
  const calls = { findFirst: [], delete: [] };
  prisma = {
    comment: {
      findFirst: async (args) => { calls.findFirst.push(args); return comment; },
      delete: async (args) => { calls.delete.push(args); return comment; },
    },
  };
  prismaState.current = prisma;
  return calls;
}

test('deletes an owned comment only when its URL slug matches the comment article', async () => {
  const calls = db({ comment: { id: 9, authorId: 4, article: { slug: 'alpha' } } });
  assert.equal(await repository.CommentRepository.delete(9, 'alpha', 4), true);
  assert.equal(JSON.stringify(calls.findFirst), JSON.stringify([{ where: { id: 9, article: { slug: 'alpha' } } }]));
  assert.equal(JSON.stringify(calls.delete), JSON.stringify([{ where: { id: 9 } }]));
});

test('wrong article slug is a not-found result and cannot delete the row', async () => {
  const calls = db();
  assert.equal(await repository.CommentRepository.delete(9, 'other', 4), false);
  assert.equal(JSON.stringify(calls.findFirst), JSON.stringify([{ where: { id: 9, article: { slug: 'other' } } }]));
  assert.deepEqual(calls.delete, []);
});

test('matching article still enforces comment ownership', async () => {
  const calls = db({ comment: { id: 9, authorId: 8, article: { slug: 'alpha' } } });
  await assert.rejects(repository.CommentRepository.delete(9, 'alpha', 4), /Forbidden/);
  assert.deepEqual(calls.delete, []);
});

test('actual nested DELETE handler passes slug and maps repository outcomes', async () => {
  const routes = new Map();
  const router = Object.fromEntries(['get','post','put','delete'].map(method => [method, (url, ...handlers) => {
    routes.set(`${method} ${url}`, handlers.at(-1));
  }]));
  await loadTypeScript('src/routes/articles.ts', { root, stubs: {
    express: { Router: () => router, Response: undefined, NextFunction: undefined },
    '../repositories/ArticleRepository': { ArticleRepository: {} },
    '../repositories/CommentRepository': { CommentRepository: repository.CommentRepository },
    '../middleware/auth': { authenticate: () => {}, optionalAuthenticate: () => {}, AuthenticatedRequest: undefined },
    '../middleware/validate': { validate: () => () => {} },
    '../schemas': { NewArticleSchema: {}, UpdateArticleSchema: {}, NewCommentSchema: {} },
  }});
  const handler = routes.get('delete /articles/:slug/comments/:id');
  assert.equal(typeof handler, 'function');
  for (const [comment, expected] of [[{id:9,authorId:4},204],[null,404],[{id:9,authorId:8},403]]) {
    const calls = db({comment}); let status, ended=false, body;
    const res = {status(code) {status=code;return this;}, json(value) {body=value;return this;}, end(){ended=true;}};
    await handler({params:{id:'9',slug:'alpha'},user:{id:4}}, res, error => {throw error;});
    assert.equal(status,expected); assert.equal(ended,expected===204);
    assert.equal(JSON.stringify(calls.findFirst[0].where), JSON.stringify({id:9,article:{slug:'alpha'}}));
    assert.equal(calls.delete.length,expected===204?1:0);
    if(expected!==204) assert.ok(body.errors.body.length);
  }
  db({comment:{id:9,authorId:4}}); const failure = new Error('database unavailable');
  prisma.comment.delete = async () => {throw failure;}; let forwarded;
  await handler({params:{id:'9',slug:'alpha'},user:{id:4}}, {status(){throw new Error('unexpected response');}}, error=>{forwarded=error;});
  assert.equal(forwarded,failure);
});
