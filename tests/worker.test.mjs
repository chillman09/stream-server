import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const kv = () => {
  const m = new Map();
  return {
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
};
const env = { MEDIA_KV: kv(), ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pw', JWT_SECRET: 'secret' };
const call = (path, init = {}) => worker.fetch(new Request('http://x' + path, init), env);
const post = (path, body, cookie) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });

test('public catalog is seeded and grouped', async () => {
  const d = await (await call('/api/media')).json();
  assert.ok(d.rows.length >= 1 && d.featured);
});
test('admin routes require auth', async () => {
  assert.equal((await post('/api/admin/media', { title: 'x' })).status, 401);
});
test('bad login rejected, good login can create + delete', async () => {
  assert.equal((await post('/api/admin/login', { username: 'admin', password: 'no' })).status, 401);
  const login = await post('/api/admin/login', { username: 'admin', password: 'pw' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const made = await post('/api/admin/media', { title: 'T', videoUrl: 'http://v', genres: 'A, B' }, cookie);
  assert.equal(made.status, 201);
  const m = await made.json();
  assert.deepEqual(m.genres, ['A', 'B']);
  const del = await call(`/api/admin/media/${m.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(del.status, 200);
});
