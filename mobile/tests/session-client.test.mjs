import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = readFileSync(new URL('../src/auth/session-client.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { createSessionClient, SessionChangedError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const pair = { access: 'old', refresh: 'refresh-old' };
const rotated = { access: 'new', refresh: 'refresh-new' };
const unauthorized = () => Object.assign(new Error('unauthorized'), { status: 401 });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(transport) {
  let stored = { ...pair }, expired = 0;
  const client = createSessionClient(transport, {
    read: async () => stored, write: async value => { stored = value; }, clear: async () => { stored = null; },
  }, error => error.status === 401, () => { expired++; });
  return { client, stored: () => stored, expired: () => expired };
}
test('concurrent 401s rotate a blacklisted refresh token only once', async () => {
  let rotations = 0;
  const gate = deferred();
  const state = setup(async (path, init) => {
    if (path.includes('/refresh/')) { rotations++; await gate.promise; return rotated; }
    if (init.headers.get('Authorization') === 'Bearer old') throw unauthorized();
    return path;
  });
  const requests = ['/feed/', '/chat/', '/me/'].map(path => state.client.request(path));
  await new Promise(r => setImmediate(r)); gate.resolve();
  assert.deepEqual(await Promise.all(requests), ['/feed/', '/chat/', '/me/']);
  assert.equal(rotations, 1); assert.deepEqual(state.stored(), rotated);
});
test('a delayed 401 reuses the already rotated pair', async () => {
  const gate = deferred(); let rotations = 0;
  const state = setup(async (path, init) => {
    if (path.includes('/refresh/')) { rotations++; return rotated; }
    if (init.headers.get('Authorization') === 'Bearer old') { if (path === '/slow/') await gate.promise; throw unauthorized(); }
    return path;
  });
  const slow = state.client.request('/slow/');
  await state.client.request('/fast/'); gate.resolve(); await slow;
  assert.equal(rotations, 1);
});
test('logout during refresh cannot restore credentials', async () => {
  const gate = deferred(), started = deferred();
  const state = setup(async path => {
    if (path.includes('/refresh/')) { started.resolve(); await gate.promise; return rotated; }
    throw unauthorized();
  });
  const pending = state.client.request('/me/'); const rejected = assert.rejects(pending, SessionChangedError);
  await started.promise; await state.client.clear(); gate.resolve(); await rejected;
  assert.equal(state.stored(), null);
});
test('an old account response cannot update the new account', async () => {
  const gate = deferred(); const state = setup(async () => { await gate.promise; return { username: 'old-user' }; });
  const pending = state.client.request('/me/'); const rejected = assert.rejects(pending, SessionChangedError);
  await new Promise(r => setImmediate(r));
  await state.client.setTokens(rotated); gate.resolve(); await rejected;
  assert.deepEqual(state.stored(), rotated); assert.equal(state.expired(), 0);
});
test('network errors preserve the session', async () => {
  const state = setup(async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(state.client.request('/me/'), TypeError);
  assert.deepEqual(state.stored(), pair); assert.equal(state.expired(), 0);
});
test('rejected refresh clears credentials and expires the session', async () => {
  const state = setup(async () => { throw unauthorized(); });
  await assert.rejects(state.client.request('/me/'));
  assert.equal(state.stored(), null); assert.equal(state.expired(), 1);
});
