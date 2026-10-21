import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = readFileSync(new URL('../src/feed/feed-mutations.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { FeedMutations } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const serverPost = { id: 1, is_liked: false, likes_count: 0, is_bookmarked: false, content: 'Post' };
test('a pending refresh cannot undo a like followed by a bookmark', () => {
  const changes = new FeedMutations(); const started = changes.version;
  changes.record(1, { is_liked: true, likes_count: 1 });
  changes.record(1, { is_bookmarked: true });
  assert.deepEqual(changes.apply(serverPost, started), { ...serverPost, is_liked: true, likes_count: 1, is_bookmarked: true });
  assert.equal(serverPost.likes_count, 0);
});
test('a newer server count is retained when the like finished before the fetch', () => {
  const changes = new FeedMutations(); changes.record(1, { is_liked: true, likes_count: 1 });
  const started = changes.version; changes.record(1, { is_bookmarked: true });
  assert.equal(changes.apply({ ...serverPost, likes_count: 8 }, started).likes_count, 8);
});
test('a deleted post cannot return from a stale page even when another action finishes', () => {
  const changes = new FeedMutations(); const started = changes.version;
  changes.record(1, null); changes.record(1, { is_bookmarked: true });
  assert.equal(changes.apply(serverPost, started), null);
});
test('the final tap state wins for the same field', () => {
  const changes = new FeedMutations(); const started = changes.version;
  changes.record(1, { is_liked: true, likes_count: 1 });
  changes.record(1, { is_liked: false, likes_count: 0 });
  assert.deepEqual(changes.apply(serverPost, started), serverPost);
});
