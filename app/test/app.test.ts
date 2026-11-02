/**
 * HTTP-level tests for the app. Starts the built server (npm run app:build first), then checks
 * routes, filters, security and the admin guard.
 *   npm run app:test                                        embedded database in a temp folder
 *   TEST_DATABASE_URL=postgres://... npm run app:test       a real Postgres that already has the content
 *                                                           imported (db:migrate then db:import)
 */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

let server: ChildProcess;
let base = '';
let dir = '';

const freePort = () => new Promise<number>((res) => {
  const s = createServer().listen(0, () => { const p = (s.address() as any).port; s.close(() => res(p)); });
});
const get = (path: string, init: RequestInit = {}) => fetch(base + path, { redirect: 'manual', ...init });
const count = async (path: string) => Number((await (await get(path)).text()).match(/result-count[^>]*>(\d+) dish/)?.[1]);

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ftlof-app-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', ['app/dist/server/entry.mjs'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PGLITE_DIR: dir, ADMIN_TOKEN: 'test-admin-token-1234', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(base + '/healthz')).ok) return; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server did not start');
});
after(() => { server?.kill(); rmSync(dir, { recursive: true, force: true }); });

describe('pages', () => {
  for (const path of ['/', '/dishes', '/dishes/wiesn-hendl', '/countries', '/countries/germany', '/festivals', '/festivals/oktoberfest',
    '/ingredients/tamarind', '/spices', '/spices/cumin', '/favourites', '/healthz', '/admin/login']) {
    it(`GET ${path} is 200`, async () => assert.equal((await get(path)).status, 200));
  }
  it('unknown dish, blend and page are 404', async () => {
    for (const p of ['/dishes/nope', '/blends/nope', '/countries/nope', '/festivals/nope', '/spices/nope', '/no-such-page']) {
      assert.equal((await get(p)).status, 404, p);
    }
  });
  it('a spice used as an ingredient redirects to its spice page', async () => {
    const r = await get('/ingredients/cumin');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/spices/cumin');
  });
});

describe('filters', () => {
  it('lists everything', async () => assert.equal(await count('/dishes'), 298));
  it('country + festival', async () => assert.equal(await count('/dishes?country=germany&festival=oktoberfest'), 4));
  it('diet', async () => assert.equal(await count('/dishes?diet=vegan'), 69));
  it('include + exclude ingredient', async () => assert.equal(await count('/dishes?inc=tamarind&exc=fish%20sauce'), 2));
  it('ingredient alias search (besan = gram flour)', async () => {
    const j = await (await get('/api/dishes?q=besan')).json() as any;
    assert.deepEqual(j.dishes.map((d: any) => d.id).sort(), ['dhokla', 'fijian-besan-ladoo', 'vada-pav']);
  });
  it('festival month', async () => assert.equal(await count('/dishes?month=11'), 26));
  it('pages hold 24 dishes', async () => {
    const j = await (await get('/api/dishes?page=2')).json() as any;
    assert.equal(j.dishes.length, 24);
    assert.equal(j.total, 298);
  });
  it('favourites endpoint returns just the requested dishes', async () => {
    const j = await (await get('/api/dishes?ids=dhokla,pad-thai')).json() as any;
    assert.deepEqual(j.dishes.map((d: any) => d.id).sort(), ['dhokla', 'pad-thai']);
  });
});

describe('hostile input', () => {
  it('SQL-like and oversized values never cause an error, and nothing is dropped', async () => {
    const evil = ["' or 1=1 --", "'; drop table dishes; --", 'x'.repeat(5000), '\u0000', '%'];
    for (const v of evil) {
      for (const k of ['q', 'country', 'region', 'type', 'course', 'flavour', 'diet', 'festival', 'inc', 'exc', 'spice', 'time', 'month', 'page']) {
        const r = await get(`/dishes?${k}=${encodeURIComponent(v)}`);
        assert.ok(r.status < 500, `${k}=${v.slice(0, 20)} -> ${r.status}`);
        if (v === '\u0000') assert.equal(r.status, 400);
      }
    }
    for (const q of ['time=9e99', 'month=99999999999', 'spice=1e99', 'page=-9999999999', 'page=1e99']) {
      assert.equal((await get('/dishes?' + q)).status, 200, q);
    }
    assert.equal(await count('/dishes'), 298);
  });
  it('script in the query string is HTML-escaped', async () => {
    const html = await (await get('/dishes?q=' + encodeURIComponent('"><script>alert(1)</script>'))).text();
    assert.ok(!html.includes('"><script>alert(1)'));
  });
});

describe('admin guard', () => {
  it('redirects every admin page when signed out', async () => {
    for (const p of ['/admin', '/admin/review/dhokla']) {
      const r = await get(p);
      assert.equal(r.status, 302, p);
      assert.equal(r.headers.get('location'), '/admin/login');
    }
  });
  it('a signed-out status change is redirected, not applied', async () => {
    const r = await get('/admin/review/dhokla', { method: 'POST', body: new URLSearchParams({ action: 'status', to: 'published', note: 'x' }) });
    assert.equal(r.status, 302);
  });
  it('rejects a wrong token and a missing reviewer name', async () => {
    const bad = await get('/admin/login', { method: 'POST', body: new URLSearchParams({ token: 'wrong', reviewer: 'me' }) });
    assert.equal(bad.status, 200);
    assert.equal(bad.headers.get('set-cookie'), null);
    const noName = await get('/admin/login', { method: 'POST', body: new URLSearchParams({ token: 'test-admin-token-1234', reviewer: '' }) });
    assert.equal(noName.headers.get('set-cookie'), null);
  });
  it('rejects a cross-site login POST (CSRF)', async () => {
    const r = await get('/admin/login', {
      method: 'POST', headers: { 'sec-fetch-site': 'cross-site' },
      body: new URLSearchParams({ token: 'test-admin-token-1234', reviewer: 'x' }),
    });
    assert.equal(r.status, 403);
  });
  it('sets an HttpOnly, SameSite=Strict session on a correct login', async () => {
    const r = await get('/admin/login', { method: 'POST', body: new URLSearchParams({ token: 'test-admin-token-1234', reviewer: 'Tester' }) });
    assert.equal(r.status, 302);
    const cookie = r.headers.get('set-cookie') ?? '';
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });
  it('sends security headers and keeps admin out of caches', async () => {
    const r = await get('/');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal((await get('/admin')).headers.get('cache-control'), 'private, no-store');
  });
});
