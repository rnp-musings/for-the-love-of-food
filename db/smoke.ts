/**
 * End-to-end check with an in-memory Postgres: migrate, import, run the same filters
 * the static site was tested with and compare with the answers recorded there.
 *   npm run db:smoke
 */
import { execFileSync } from 'node:child_process';
import { count } from 'drizzle-orm';
import { connect } from './client';
import * as t from './schema';
import { dishesUsingSpice, searchDishes } from './queries';

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`);
};

// 1. import twice into the same database: second run must be a no-op
const conn = await connect({ pglite: true });
await conn.migrate();
await conn.close();

// Use a fresh persisted PGlite dir so two importer processes can share it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'ftlof-pg-'));
try {
  const run = () => execFileSync('npx', ['tsx', 'db/import.ts', '--skip-validate', '--pglite', dir], { encoding: 'utf8' });
  console.log(run().trim().split('\n').slice(-1)[0]);
  console.log('second import (idempotency):', run().trim().split('\n').slice(-1)[0]);

  const c = await connect({ pglite: dir });
  const db = c.db;
  const n = async (table: any) => (await db.select({ n: count() }).from(table))[0].n;

  check('countries', await n(t.countries), 30);
  check('dishes', await n(t.dishes), 298);
  check('recipes', await n(t.recipes), 298);
  check('festival links', await n(t.festivalDishes), 124);
  check('spice stubs = herb-spice ingredients', (await db.execute(
    (await import('drizzle-orm')).sql`select (select count(*) from spices)::int = (select count(*) from ingredients where category = 'herb-spice') as ok`)).rows[0].ok, true);

  // 2. the same questions the static site's browser test asked
  check('all dishes', (await searchDishes(db, { limit: 1000 })).length, 298);
  check('country=germany + festival=oktoberfest', (await searchDishes(db, { country: 'germany', festival: 'oktoberfest' })).map((d: any) => d.name).sort(),
    ['Bavarian pretzel', 'Käsespätzle', 'Weisswurst', 'Wiesn-Hendl (Oktoberfest roast chicken)']);
  check('diet=vegan', (await searchDishes(db, { diet: ['vegan'], limit: 1000 })).length, 69);
  check('includes tamarind, excludes fish sauce', (await searchDishes(db, { includeIngredients: ['tamarind'], excludeIngredients: ['fish-sauce'], limit: 1000 })).length, 2);
  check('festival month = November', (await searchDishes(db, { festivalMonth: 11, limit: 1000 })).length, 26);
  check('dessert, active time <= 60 min', (await searchDishes(db, { type: 'dessert', maxActiveMinutes: 60, limit: 1000 })).length, 15);
  const besan = (await searchDishes(db, { q: 'besan' })).map((d: any) => d.id).sort();
  check('search "besan" (alias of gram flour) finds dishes made with it', besan.includes('dhokla') && besan.includes('vada-pav'), true);
  check('search "besan" count', besan, ['dhokla', 'fijian-besan-ladoo', 'vada-pav']);
  check('paging: 24 per page by default', (await searchDishes(db, {})).length, 24);

  // 3. spice library plumbing
  const cumin = await dishesUsingSpice(db, 'cumin');
  check('cumin is used in some dishes', cumin.length > 0, true);

  // 4. review status survives a re-import
  await db.update(t.dishes).set({ reviewStatus: 'reviewed' }).where((await import('drizzle-orm')).eq(t.dishes.id, 'dhokla'));
  await c.close();
  run();
  const c2 = await connect({ pglite: dir });
  const row = await c2.db.select({ s: t.dishes.reviewStatus }).from(t.dishes).where((await import('drizzle-orm')).eq(t.dishes.id, 'dhokla'));
  check('reviewer status preserved by re-import', row[0].s, 'reviewed');
  await c2.close();

  // 5. spice library import, using a throw-away fixture (test data only, never written to /content)
  const { cpSync, writeFileSync } = await import('node:fs');
  const fx = mkdtempSync(join(tmpdir(), 'ftlof-fx-'));
  cpSync('content', fx, { recursive: true });
  writeFileSync(join(fx, 'spices.json'), JSON.stringify([{
    id: 'cumin', scientific_name: 'Cuminum cyminum', part_used: 'seed', heat_level: 0, flavour_notes: ['aromatic', 'bitter'],
    origins: [{ country: 'india', role: 'major-producer' }], substitutes: [{ ingredient: 'garam-masala', note: 'test fixture' }],
    sources: ['wiki-indian-cuisine'], review_status: 'draft',
  }]));
  writeFileSync(join(fx, 'blends.json'), JSON.stringify([{
    id: 'test-blend', name: 'Test blend', country: 'india', summary: 'fixture',
    components: [{ ingredient: 'cumin', proportion_note: 'dominant' }, { ingredient: 'turmeric', optional: true }],
    sources: ['wiki-indian-cuisine'], review_status: 'draft',
  }]));
  const spiceDir = mkdtempSync(join(tmpdir(), 'ftlof-pg2-'));
  execFileSync('npx', ['tsx', 'db/import.ts', '--skip-validate', '--content', fx, '--pglite', spiceDir], { encoding: 'utf8' });
  const c3 = await connect({ pglite: spiceDir });
  const { sql: q } = await import('drizzle-orm');
  const sp = (await c3.db.execute(q`select s.scientific_name, s.part_used,
      (select count(*)::int from spice_origins where spice_id = 'cumin') origins,
      (select count(*)::int from spice_substitutes where spice_id = 'cumin') subs,
      (select count(*)::int from spice_sources where spice_id = 'cumin') srcs,
      (select count(*)::int from blend_components where blend_id = 'test-blend') comps,
      (select count(*)::int from blend_sources where blend_id = 'test-blend') bsrcs
    from spices s where s.ingredient_id = 'cumin'`)).rows[0];
  check('spice profile imported', [sp.scientific_name, sp.part_used], ['Cuminum cyminum', 'seed']);
  check('spice origins/substitutes/sources', [sp.origins, sp.subs, sp.srcs], [1, 1, 1]);
  check('blend components/sources', [sp.comps, sp.bsrcs], [2, 1]);
  await c3.close();
  rmSync(fx, { recursive: true, force: true });
  rmSync(spiceDir, { recursive: true, force: true });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
