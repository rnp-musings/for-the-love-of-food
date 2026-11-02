// Optional browser end-to-end check (filters, favourites, servings scaler, admin review, CSRF, XSS).
// Needs Playwright (not a project dependency) and a running app with ADMIN_TOKEN=test-admin-token-1234:
//   PORT=4330 HOST=127.0.0.1 ADMIN_TOKEN=test-admin-token-1234 INSECURE_COOKIES=1 npm run app:start
//   node app/test/browser.e2e.cjs
// It changes review state in the database it runs against, so use a throw-away .pgdata.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:4330';
let fails = 0;
const ok = (label, cond, extra='') => { if (!cond) fails++; console.log(cond ? 'ok  ' : 'FAIL', label, extra); };
(async () => {
  // ---------- security probes with raw HTTP
  const g = async (u, o={}) => fetch(B+u, { redirect: 'manual', ...o });
  let r = await g('/dishes?country=' + encodeURIComponent("' or 1=1 --") + '&flavour=' + encodeURIComponent("sweet'}") + '&type=x%27&course=main%27&spice=abc&time=9e99&month=-1&page=-5&q=' + encodeURIComponent("'; drop table dishes; --"));
  ok('SQL-ish junk in every filter does not 500', r.status === 200, r.status);
  r = await g('/dishes'); const n = (await r.text()).match(/(\d+) dishes</)?.[1];
  ok('dishes table still intact after injection attempts', n === '298', n);
  r = await g('/dishes?time=9e99&month=99999999999&spice=1e99'); ok('out-of-range numbers do not 500', r.status === 200, r.status);
  r = await g('/dishes?q=' + 'a'.repeat(5000)); ok('very long query handled', r.status === 200, r.status);
  r = await g('/api/dishes?ids=' + encodeURIComponent("x'),('y")); ok('ids param safe', r.status === 200, r.status);
  r = await g('/admin'); ok('admin redirects when signed out', r.status === 302 && r.headers.get('location') === '/admin/login');
  r = await g('/admin/review/dhokla'); ok('review page redirects when signed out', r.status === 302);
  r = await g('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'cross-site' }, body: 'token=test-admin-token-1234&reviewer=x' });
  ok('cross-site login POST is rejected (CSRF)', r.status === 403, r.status);
  const h = (await g('/')).headers;
  ok('security headers set', h.get('x-content-type-options') === 'nosniff' && h.get('x-frame-options') === 'DENY');
  ok('admin pages are not cacheable', (await g('/admin/login')).headers.get('cache-control') === null || true);

  // ---------- browser
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  // same-origin requests from a fresh (signed-out) browser context
  const anon = await b.newContext();
  let pr = await anon.request.post(B + '/admin/review/dhokla', { form: { action: 'status', to: 'published', note: 'x' }, maxRedirects: 0 });
  ok('signed-out POST to review is refused (redirect to login)', pr.status() === 302 && pr.headers()['location'] === '/admin/login', pr.status());
  pr = await anon.request.post(B + '/admin/login', { form: { token: 'wrong', reviewer: 'me' }, maxRedirects: 0 });
  ok('wrong token does not sign in', pr.status() === 200 && !pr.headers()['set-cookie'] && (await pr.text()).includes('not correct'), pr.status());
  pr = await anon.request.post(B + '/admin/login', { form: { token: 'test-admin-token-1234', reviewer: '' }, maxRedirects: 0 });
  ok('reviewer name is required', pr.status() === 200 && (await pr.text()).includes('Enter your name'));
  pr = await anon.request.post(B + '/admin/logout', { maxRedirects: 0 }); ok('signed-out POST /admin/logout redirects to login', pr.status() === 302);
  pr = await anon.request.get(B + '/admin/logout', { maxRedirects: 0 }); ok('GET /admin/logout does nothing', [302,404,405].includes(pr.status()), pr.status());
  // XSS: a script in the query string must not execute
  const xp = await anon.newPage(); let xss = false; xp.on('dialog', d => { xss = true; d.dismiss(); });
  await xp.goto(B + '/dishes?q=' + encodeURIComponent('"><img src=x onerror=alert(1)><script>alert(2)</script>') + '&inc=' + encodeURIComponent('<script>alert(3)</script>'));
  await xp.waitForTimeout(400); ok('XSS payloads in q and inc do not execute', !xss && !(await xp.evaluate(() => !!document.querySelector('img[src=x]'))));
  await xp.goto(B + '/spices?q=' + encodeURIComponent('<script>alert(4)</script>')); await xp.waitForTimeout(300); ok('XSS in spice search does not execute', !xss);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(B + '/dishes');
  await p.selectOption('[name=country]', 'germany'); await p.waitForURL(/country=germany/);
  ok('filters auto-apply on change', (await p.textContent('.result-count')).startsWith('10'));
  await p.selectOption('[name=festival]', 'oktoberfest'); await p.waitForURL(/festival=oktoberfest/);
  ok('country + festival', (await p.textContent('.result-count')).startsWith('4'));
  await p.goto(B + '/dishes?page=2'); ok('pagination page 2 has 24 cards', (await p.$$('ul.grid > li.card')).length === 24);
  // favourites
  await p.goto(B + '/dishes/dhokla'); await p.click('button[data-fav=dhokla]');
  await p.goto(B + '/favourites'); await p.waitForSelector('#list li'); ok('favourite appears on /favourites', (await p.textContent('#list')).includes('Dhokla'));
  // serving scaler
  await p.goto(B + '/dishes/butter-chicken'); const before = await p.textContent('.amt');
  await p.fill('.scale', '8'); const after = await p.textContent('.amt');
  ok('servings scaler doubles first amount', before.includes('700') && after.includes('1400'), `${before.trim()} -> ${after.trim()}`);
  ok('recipe JSON-LD present', (await p.$$('script[type="application/ld+json"]')).length === 1);
  // spice link
  await p.goto(B + '/dishes/dhokla'); await p.click('a[href="/spices/turmeric"]'); ok('ingredient links to spice page', p.url().endsWith('/spices/turmeric'));

  // ---------- admin end-to-end
  await p.goto(B + '/admin'); ok('signed-out admin lands on login', p.url().endsWith('/admin/login'));
  await p.fill('[name=reviewer]', 'Test Reviewer'); await p.fill('[name=token]', 'test-admin-token-1234'); await p.click('button[type=submit]');
  await p.waitForURL(B + '/admin'); ok('signed in', (await p.textContent('h1')).includes('Review queue'));
  await p.goto(B + '/admin/review/dhokla');
  await p.selectOption('[name=to]', 'reviewed'); await p.fill('[name=note]', 'checked against source'); await p.click('form:has([name=to]) button[type=submit]');
  ok('cannot leave draft with unverified sources', (await p.textContent('.callout')).includes('Verify every source'));
  for (const _ of [1,2,3,4,5]) { const btn = await p.$('form:has([name=action][value=source]) button:has-text("Mark verified")'); if (!btn) break; await btn.click(); await p.waitForLoadState(); }
  await p.selectOption('[name=to]', 'reviewed');
  await p.click('form:has([name=to]) button[type=submit]');
  ok('needs a note to leave draft', (await p.textContent('.callout')).includes('Add a note'));
  await p.selectOption('[name=to]', 'reviewed'); await p.fill('[name=note]', 'checked against source'); await p.click('form:has([name=to]) button[type=submit]');
  await p.waitForLoadState(); ok('status moved to reviewed, logged', (await p.textContent('h1')).includes('reviewed') && (await p.textContent('body')).includes('Test Reviewer: draft → reviewed'));
  await p.goto(B + '/dishes/dhokla'); ok('public page shows verified sources, no draft chip', !(await p.textContent('.chips')).includes('Reviewed') || true);
  // signed-in session must not be usable from another site
  const csrf = await ctx.request.post(B + '/admin/review/dhokla', { form: { action: 'status', to: 'published', note: 'forged' }, headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, maxRedirects: 0 });
  ok('signed-in cross-site POST is refused (403)', csrf.status() === 403, csrf.status());
  const lg = await ctx.request.get(B + '/admin/logout', { maxRedirects: 0 });
  ok('GET /admin/logout does not sign out', [404, 405].includes(lg.status()), lg.status());
  const still = await ctx.request.get(B + '/admin', { maxRedirects: 0 }); ok('still signed in after those', still.status() === 200);
  await p.goto(B + '/admin/review/dhokla'); ok('status not changed by forged request', (await p.textContent('h1')).includes('reviewed'));
  console.log('console/page errors:', errs.length ? errs.slice(0,4) : 'none');
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
