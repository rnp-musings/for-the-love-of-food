/**
 * Import /content JSON into Postgres.
 *
 *   DATABASE_URL=postgres://... npm run db:import            real database
 *   npm run db:import -- --pglite                            throw-away in-memory database
 *   npm run db:import -- --pglite ./.pgdata                  persisted local database
 *
 * Flags
 *   --skip-validate     do not run scripts/validate.py first (it runs by default and must pass)
 *   --overwrite-review  also overwrite review_status from JSON. By default review_status set in the
 *                       database is preserved, so a reviewer's work is never undone by a re-import.
 *   --content <dir>     read JSON from another folder (used by the tests)
 *   --dry-run           do everything inside a transaction and roll it back
 *
 * Re-running is safe: rows are upserted by id, child rows are replaced.
 * Records deleted from JSON are reported as orphans, never silently deleted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableColumns, inArray, sql } from 'drizzle-orm';
import { connect } from './client';
import * as t from './schema';

const flags = new Set(process.argv.slice(2));
const ci = process.argv.indexOf('--content');
const CONTENT = ci > -1 ? process.argv[ci + 1] : join(import.meta.dirname, '..', 'content');
const lite = process.argv.indexOf('--pglite');
const liteArg = lite > -1 ? (process.argv[lite + 1]?.startsWith('--') || !process.argv[lite + 1] ? true : process.argv[lite + 1]) : false;

// ---------------------------------------------------------------- reading content
const read = (f: string): any[] => (existsSync(join(CONTENT, f)) ? JSON.parse(readFileSync(join(CONTENT, f), 'utf8')) : []);
const readDir = (d: string): any[] =>
  existsSync(join(CONTENT, d))
    ? readdirSync(join(CONTENT, d)).filter((f) => f.endsWith('.json')).sort().flatMap((f) => read(join(d, f)))
    : [];
const both = (name: string) => [...read(`${name}.json`), ...readDir(name)];

// ---------------------------------------------------------------- write helpers
const CHUNK = 400;
const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/** Upsert rows; `update` lists the TS column keys to overwrite on conflict. */
async function upsert(tx: any, table: any, rows: any[], target: any, update: string[]) {
  if (!rows.length) return;
  const cols = getTableColumns(table);
  const set: Record<string, any> = Object.fromEntries(update.map((k) => [k, sql`excluded.${sql.identifier(cols[k].name)}`]));
  if ('updatedAt' in cols) set.updatedAt = sql`now()`;
  for (const c of chunks(rows)) {
    await tx.insert(table).values(c).onConflictDoUpdate({ target, set });
  }
}
async function insertAll(tx: any, table: any, rows: any[]) {
  for (const c of chunks(rows)) if (c.length) await tx.insert(table).values(c);
}
/** Replace child rows of the given parents: delete, then insert. */
async function replaceChildren(tx: any, table: any, ownerCol: any, ownerIds: string[], rows: any[]) {
  for (const c of chunks(ownerIds)) await tx.delete(table).where(inArray(ownerCol, c));
  await insertAll(tx, table, rows);
}
const nz = (v: any) => (v === undefined ? null : v);

async function main() {
  if (!flags.has('--skip-validate')) {
    try {
      console.log(execFileSync('python3', ['scripts/validate.py'], { encoding: 'utf8', cwd: join(CONTENT, '..') }).trim().split('\n').pop());
    } catch (e: any) {
      console.error(e.stdout?.toString() || e.message);
      console.error('\nContent failed validation: nothing was imported.');
      process.exit(1);
    }
  }

  const data = {
    countries: both('countries'), regions: both('regions'), ingredients: both('ingredients'), sources: both('sources'),
    festivals: both('festivals'), festivalDishes: both('festival-dishes'), dishes: readDir('dishes'),
    recipes: readDir('recipes'), spices: both('spices'), blends: both('blends'),
  };
  const keepReview = !flags.has('--overwrite-review');
  const review = keepReview ? [] : ['reviewStatus'];
  const conn = await connect({ pglite: liteArg });
  console.log(`Database: ${conn.kind}`);
  await conn.migrate();

  const ROLLBACK = new Error('dry-run');
  try {
    await conn.db.transaction(async (tx: any) => {
      // sources: content fields only, so human "checked" decisions in the DB survive re-imports
      await upsert(tx, t.sources, data.sources.map((s) => ({
        id: s.id, title: s.title, url: s.url, type: s.type, licenceNote: nz(s.licence_note),
      })), t.sources.id, ['title', 'url', 'type', 'licenceNote']);
      // first import only: carry over the checked flag from JSON when it is true
      const checkedInJson = data.sources.filter((s) => s.checked).map((s) => s.id);
      if (checkedInJson.length) {
        await tx.update(t.sources).set({ checked: true }).where(inArray(t.sources.id, checkedInJson));
      }

      await upsert(tx, t.countries, data.countries.map((c) => ({
        id: c.id, name: c.name, localName: nz(c.local_name), iso2: c.iso2, continent: c.continent,
        summary: c.summary, regionalVariation: c.regional_variation, reviewStatus: c.review_status ?? 'draft',
      })), t.countries.id, ['name', 'localName', 'iso2', 'continent', 'summary', 'regionalVariation', ...review]);

      await upsert(tx, t.regions, data.regions.map((r) => ({
        id: r.id, countryId: r.country, name: r.name, localName: nz(r.local_name), summary: r.summary,
        reviewStatus: r.review_status ?? 'draft',
      })), t.regions.id, ['countryId', 'name', 'localName', 'summary', ...review]);

      await upsert(tx, t.ingredients, data.ingredients.map((i) => ({
        id: i.id, name: i.name, category: i.category, allergens: i.allergens ?? [],
      })), t.ingredients.id, ['name', 'category', 'allergens']);
      await replaceChildren(tx, t.ingredientAliases, t.ingredientAliases.ingredientId, data.ingredients.map((i) => i.id),
        data.ingredients.flatMap((i) => [...new Set<string>(i.aliases ?? [])].map((alias) => ({ ingredientId: i.id, alias }))));

      await replaceChildren(tx, t.regionSignatureIngredients, t.regionSignatureIngredients.regionId, data.regions.map((r) => r.id),
        data.regions.flatMap((r) => r.signature_ingredients.map((ingredientId: string) => ({ regionId: r.id, ingredientId }))));

      await upsert(tx, t.dishes, data.dishes.map((d) => ({
        id: d.id, name: d.name, localName: nz(d.local_name), countryId: d.country, regionId: nz(d.region), type: d.type,
        course: d.course, flavours: d.flavours, diet: d.diet, cookMethods: d.cook_methods, spiceLevel: d.spice_level,
        summary: d.summary, storyMd: d.story, originPeriod: nz(d.origin_period), image: nz(d.image),
        reviewStatus: d.review_status ?? 'draft',
      })), t.dishes.id, ['name', 'localName', 'countryId', 'regionId', 'type', 'course', 'flavours', 'diet', 'cookMethods',
        'spiceLevel', 'summary', 'storyMd', 'originPeriod', 'image', ...review]);
      await replaceChildren(tx, t.dishOriginClaims, t.dishOriginClaims.dishId, data.dishes.map((d) => d.id),
        data.dishes.flatMap((d) => d.origin_claims.map((c: any) => ({
          dishId: d.id, claim: c.claim, confidence: c.confidence, sourceId: nz(c.source),
        }))));

      await upsert(tx, t.recipes, data.recipes.map((r) => ({
        id: r.id, dishId: r.dish, title: r.title, version: r.version ?? 'home', servings: r.servings,
        prepMinutes: r.prep_minutes, cookMinutes: r.cook_minutes, passiveMinutes: r.passive_minutes ?? 0,
        difficulty: r.difficulty, steps: r.steps, notes: nz(r.notes), licence: r.licence ?? 'CC-BY-4.0 (original text)',
        reviewStatus: r.review_status ?? 'draft',
      })), t.recipes.id, ['dishId', 'title', 'version', 'servings', 'prepMinutes', 'cookMinutes', 'passiveMinutes',
        'difficulty', 'steps', 'notes', 'licence', ...review]);
      await replaceChildren(tx, t.recipeIngredients, t.recipeIngredients.recipeId, data.recipes.map((r) => r.id),
        data.recipes.flatMap((r) => r.ingredients.map((l: any, position: number) => ({
          recipeId: r.id, position, ingredientId: l.ingredient, amount: l.amount === null ? null : String(l.amount),
          unit: l.unit, note: nz(l.note), optional: !!l.optional, groupName: nz(l.group),
        }))));

      await upsert(tx, t.festivals, data.festivals.map((f) => ({
        id: f.id, name: f.name, localName: nz(f.local_name), type: f.type, timing: f.timing, months: f.months,
        duration: nz(f.duration), summary: f.summary, storyMd: f.story, foodTraditionsMd: nz(f.food_traditions),
        reviewStatus: f.review_status ?? 'draft',
      })), t.festivals.id, ['name', 'localName', 'type', 'timing', 'months', 'duration', 'summary', 'storyMd',
        'foodTraditionsMd', ...review]);
      const fids = data.festivals.map((f) => f.id);
      await replaceChildren(tx, t.festivalCountries, t.festivalCountries.festivalId, fids,
        data.festivals.flatMap((f) => f.countries.map((countryId: string) => ({ festivalId: f.id, countryId }))));
      await replaceChildren(tx, t.festivalRegions, t.festivalRegions.festivalId, fids,
        data.festivals.flatMap((f) => (f.regions ?? []).map((regionId: string) => ({ festivalId: f.id, regionId }))));
      await replaceChildren(tx, t.festivalDishes, t.festivalDishes.festivalId, fids,
        data.festivalDishes.map((l) => ({ festivalId: l.festival, dishId: l.dish, role: l.role, note: nz(l.note) })));

      // ---- spice library
      // Every herb-spice ingredient gets a (possibly empty) profile row, so the library has a page per spice from day one.
      const spiceIngredients = data.ingredients.filter((i) => i.category === 'herb-spice').map((i) => ({ ingredientId: i.id }));
      for (const c of chunks(spiceIngredients)) await tx.insert(t.spices).values(c).onConflictDoNothing();
      await upsert(tx, t.spices, data.spices.map((s) => ({
        ingredientId: s.id, scientificName: nz(s.scientific_name), partUsed: nz(s.part_used), heatLevel: nz(s.heat_level),
        heatShu: nz(s.heat_shu), flavourNotes: s.flavour_notes ?? [], aroma: nz(s.aroma), historyMd: nz(s.history),
        storage: nz(s.storage), buyingTips: nz(s.buying_tips), reviewStatus: s.review_status ?? 'draft',
      })), t.spices.ingredientId, ['scientificName', 'partUsed', 'heatLevel', 'heatShu', 'flavourNotes', 'aroma',
        'historyMd', 'storage', 'buyingTips', ...review]);
      const sids = data.spices.map((s) => s.id);
      await replaceChildren(tx, t.spiceOrigins, t.spiceOrigins.spiceId, sids,
        data.spices.flatMap((s) => (s.origins ?? []).map((o: any) => ({ spiceId: s.id, countryId: o.country, role: o.role }))));
      await replaceChildren(tx, t.spiceSubstitutes, t.spiceSubstitutes.spiceId, sids,
        data.spices.flatMap((s) => (s.substitutes ?? []).map((u: any) => ({ spiceId: s.id, substituteId: u.ingredient, note: nz(u.note) }))));

      await upsert(tx, t.blends, data.blends.map((b) => ({
        id: b.id, name: b.name, localName: nz(b.local_name), countryId: nz(b.country), regionId: nz(b.region),
        summary: b.summary, historyMd: nz(b.history), reviewStatus: b.review_status ?? 'draft',
      })), t.blends.id, ['name', 'localName', 'countryId', 'regionId', 'summary', 'historyMd', ...review]);
      await replaceChildren(tx, t.blendComponents, t.blendComponents.blendId, data.blends.map((b) => b.id),
        data.blends.flatMap((b) => b.components.map((c: any) => ({
          blendId: b.id, ingredientId: c.ingredient, proportionNote: nz(c.proportion_note), optional: !!c.optional,
        }))));

      // ---- source links (all owners share one shape: owner id + source id)
      const links: [any, any, string, any[]][] = [
        [t.countrySources, t.countrySources.ownerId, 'country', data.countries],
        [t.regionSources, t.regionSources.ownerId, 'region', data.regions],
        [t.dishSources, t.dishSources.ownerId, 'dish', data.dishes],
        [t.recipeSources, t.recipeSources.ownerId, 'recipe', data.recipes],
        [t.festivalSources, t.festivalSources.ownerId, 'festival', data.festivals],
        [t.spiceSources, t.spiceSources.ownerId, 'spice', data.spices],
        [t.blendSources, t.blendSources.ownerId, 'blend', data.blends],
      ];
      for (const [table, ownerCol, , recs] of links) {
        await replaceChildren(tx, table, ownerCol, recs.map((r) => r.id),
          recs.flatMap((r) => [...new Set<string>(r.sources ?? [])].map((sourceId) => ({ ownerId: r.id, sourceId }))));
      }

      // ---- report
      const orphan = async (label: string, table: any, idCol: any, ids: string[]) => {
        const rows = await tx.select({ id: idCol }).from(table);
        const gone = rows.map((r: any) => r.id).filter((id: string) => !new Set(ids).has(id));
        if (gone.length) console.warn(`  orphans in ${label} (in DB, not in JSON): ${gone.slice(0, 8).join(', ')}${gone.length > 8 ? ` +${gone.length - 8} more` : ''}`);
      };
      await orphan('dishes', t.dishes, t.dishes.id, data.dishes.map((d) => d.id));
      await orphan('recipes', t.recipes, t.recipes.id, data.recipes.map((d) => d.id));
      await orphan('festivals', t.festivals, t.festivals.id, fids);
      await orphan('ingredients', t.ingredients, t.ingredients.id, data.ingredients.map((d) => d.id));

      if (flags.has('--dry-run')) throw ROLLBACK;
    });
    console.log(`Imported: ${data.countries.length} countries, ${data.regions.length} regions, ${data.dishes.length} dishes, ` +
      `${data.recipes.length} recipes, ${data.ingredients.length} ingredients, ${data.festivals.length} festivals, ` +
      `${data.spices.length} spice profiles, ${data.blends.length} blends, ${data.sources.length} sources.`);
  } catch (e) {
    if (e === ROLLBACK) console.log('Dry run complete: transaction rolled back.');
    else throw e;
  } finally {
    await conn.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
