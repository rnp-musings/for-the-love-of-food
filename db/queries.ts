/**
 * Read/write queries used by the app. All values are bound parameters; enum-typed filters
 * are checked against allow-lists before they reach SQL.
 */
import { and, asc, desc, eq, exists, inArray, or, sql, type SQL } from 'drizzle-orm';
import * as t from './schema';

type Db = any;
export type Status = 'draft' | 'reviewed' | 'published';
export const ALL_STATUSES: Status[] = ['draft', 'reviewed', 'published'];

/** postgres-js returns an array, PGlite returns { rows }. */
export const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : (res?.rows ?? []));

const allow = <T extends string>(values: readonly T[], xs: string[] | undefined): T[] =>
  (xs ?? []).filter((x): x is T => (values as readonly string[]).includes(x));
const enumVals = (e: { enumValues: readonly string[] }) => e.enumValues;

/** array['a','b']::enum[] built from bound parameters */
const enumArray = (xs: string[], type: string) =>
  sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::${sql.raw(type)}[]`;

// ====================================================================== dishes
export interface DishFilters {
  q?: string;
  country?: string;
  region?: string;
  type?: string;
  course?: string;
  flavours?: string[];       // dish must have all
  diet?: string[];           // dish must have all
  maxSpice?: number;
  maxActiveMinutes?: number; // some recipe with prep + cook within this
  includeIngredients?: string[];
  excludeIngredients?: string[];
  festival?: string;
  festivalMonth?: number;
  favouriteIds?: string[];
  statuses?: Status[];       // omit = all
  limit?: number;
  offset?: number;
}

const hasIngredient = (id: string) =>
  sql`exists (select 1 from ${t.dishIngredients} di where di.dish_id = ${t.dishes.id} and di.ingredient_id = ${id})`;

/** Keep numbers inside what the column types can hold; anything else is dropped. */
const clampInt = (v: number | undefined, min: number, max: number): number | undefined =>
  v === undefined || !Number.isFinite(v) ? undefined : Math.min(max, Math.max(min, Math.trunc(v)));

export function dishWhere(db: Db, f: DishFilters): SQL | undefined {
  const maxSpice = clampInt(f.maxSpice, 0, 5);
  const maxMinutes = clampInt(f.maxActiveMinutes, 0, 100000);
  const month = clampInt(f.festivalMonth, 1, 12);
  const course = allow(enumVals(t.course), f.course ? [f.course] : []);
  const type = allow(enumVals(t.dishType), f.type ? [f.type] : []);
  const flavours = allow(enumVals(t.flavour), f.flavours);
  const diets = allow(enumVals(t.diet), f.diet);
  const where: (SQL | undefined)[] = [
    f.country ? eq(t.dishes.countryId, f.country) : undefined,
    f.region ? eq(t.dishes.regionId, f.region) : undefined,
    type.length ? sql`${t.dishes.type} = ${type[0]}` : undefined,
    course.length ? sql`${t.dishes.course} @> ${enumArray(course, 'course')}` : undefined,
    flavours.length ? sql`${t.dishes.flavours} @> ${enumArray(flavours, 'flavour')}` : undefined,
    diets.length ? sql`${t.dishes.diet} @> ${enumArray(diets, 'diet')}` : undefined,
    maxSpice !== undefined && maxSpice < 5 ? sql`${t.dishes.spiceLevel} <= ${maxSpice}` : undefined,
    maxMinutes !== undefined
      ? exists(db.select({ x: sql`1` }).from(t.recipes)
          .where(and(eq(t.recipes.dishId, t.dishes.id), sql`${t.recipes.prepMinutes} + ${t.recipes.cookMinutes} <= ${maxMinutes}`)))
      : undefined,
    ...(f.includeIngredients ?? []).map((i) => hasIngredient(i)),
    ...(f.excludeIngredients ?? []).map((i) => sql`not ${hasIngredient(i)}`),
    f.festival
      ? exists(db.select({ x: sql`1` }).from(t.festivalDishes)
          .where(and(eq(t.festivalDishes.dishId, t.dishes.id), eq(t.festivalDishes.festivalId, f.festival))))
      : undefined,
    month
      ? exists(db.select({ x: sql`1` }).from(t.festivalDishes)
          .innerJoin(t.festivals, eq(t.festivals.id, t.festivalDishes.festivalId))
          .where(and(eq(t.festivalDishes.dishId, t.dishes.id), sql`${t.festivals.months} @> array[${month}]::smallint[]`)))
      : undefined,
    f.favouriteIds ? inArray(t.dishes.id, f.favouriteIds.length ? f.favouriteIds : ['']) : undefined,
    f.statuses?.length ? inArray(t.dishes.reviewStatus, f.statuses) : undefined,
  ];

  if (f.q?.trim()) {
    const q = f.q.trim().slice(0, 80);
    const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
    // Text document, name substring (trigram-indexed), or any ingredient name/alias of the dish.
    where.push(or(
      sql`${t.dishes.searchDoc} @@ websearch_to_tsquery('simple', ${q})`,
      sql`${t.dishes.name} ilike ${like}`,
      sql`exists (
        select 1 from ${t.dishIngredients} di
        join ${t.ingredients} i on i.id = di.ingredient_id
        left join ${t.ingredientAliases} a on a.ingredient_id = i.id
        where di.dish_id = ${t.dishes.id} and (i.name ilike ${like} or a.alias ilike ${like}))`,
    ));
  }
  const parts = where.filter(Boolean) as SQL[];
  return parts.length ? and(...parts) : undefined;
}

export async function searchDishes(db: Db, f: DishFilters = {}) {
  return db
    .select({
      id: t.dishes.id, name: t.dishes.name, localName: t.dishes.localName, countryId: t.dishes.countryId,
      regionId: t.dishes.regionId, type: t.dishes.type, summary: t.dishes.summary, flavours: t.dishes.flavours,
      diet: t.dishes.diet, spiceLevel: t.dishes.spiceLevel, reviewStatus: t.dishes.reviewStatus,
      countryName: t.countries.name, regionName: t.regions.name,
    })
    .from(t.dishes)
    .innerJoin(t.countries, eq(t.countries.id, t.dishes.countryId))
    .leftJoin(t.regions, eq(t.regions.id, t.dishes.regionId))
    .where(dishWhere(db, f))
    .orderBy(asc(t.dishes.name))
    .limit(Math.min(f.limit ?? 24, 200))
    .offset(f.offset ?? 0);
}

export async function countDishes(db: Db, f: DishFilters = {}): Promise<number> {
  const res = await db.select({ n: sql<number>`count(*)::int` }).from(t.dishes).where(dishWhere(db, f));
  return res[0].n;
}

/** Everything the filter form needs, from the data that actually exists. */
export async function facetOptions(db: Db, statuses?: Status[]) {
  const st = statuses?.length ? sql`where review_status in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : sql``;
  const one = async (query: SQL) => rowsOf(await db.execute(query));
  const [countries, regions, types, courses, flavours, diets, festivals, months] = await Promise.all([
    one(sql`select c.id, c.name, count(d.id)::int as n from countries c join dishes d on d.country_id = c.id group by c.id order by c.name`),
    one(sql`select r.id, r.name, r.country_id as "countryId", count(d.id)::int as n from regions r join dishes d on d.region_id = r.id group by r.id order by r.name`),
    one(sql`select type as id, count(*)::int as n from dishes ${st} group by type order by type`),
    one(sql`select c as id, count(*)::int as n from dishes, unnest(course) c group by c order by c`),
    one(sql`select f as id, count(*)::int as n from dishes, unnest(flavours) f group by f order by f`),
    one(sql`select x as id, count(*)::int as n from dishes, unnest(diet) x group by x order by x`),
    one(sql`select f.id, f.name, count(fd.dish_id)::int as n from festivals f join festival_dishes fd on fd.festival_id = f.id group by f.id order by f.name`),
    one(sql`select m as id, count(distinct fd.dish_id)::int as n from festivals f join festival_dishes fd on fd.festival_id = f.id, unnest(f.months) m group by m order by m`),
  ]);
  return { countries, regions, types, courses, flavours, diets, festivals, months };
}

/** Ingredient names/aliases typed by a visitor -> ingredient ids (exact match, case-insensitive). */
export async function resolveIngredients(db: Db, names: string[]): Promise<{ id: string; name: string }[]> {
  const clean = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  if (!clean.length) return [];
  const res = rowsOf(await db.execute(sql`
    select distinct i.id, i.name from ingredients i
    left join ingredient_aliases a on a.ingredient_id = i.id
    where lower(i.name) in (${sql.join(clean.map((c) => sql`${c}`), sql`, `)})
       or lower(a.alias) in (${sql.join(clean.map((c) => sql`${c}`), sql`, `)})`));
  return res;
}

export async function ingredientOptions(db: Db) {
  return rowsOf(await db.execute(sql`
    select i.name as value from ingredients i where exists (select 1 from recipe_ingredients ri where ri.ingredient_id = i.id)
    union
    select a.alias from ingredient_aliases a where exists (select 1 from recipe_ingredients ri where ri.ingredient_id = a.ingredient_id)
    order by 1`)).map((r) => r.value as string);
}

// ====================================================================== dish detail
export async function getDish(db: Db, id: string) {
  const [dish] = await db.select().from(t.dishes).where(eq(t.dishes.id, id));
  if (!dish) return null;
  const [country] = await db.select().from(t.countries).where(eq(t.countries.id, dish.countryId));
  const region = dish.regionId ? (await db.select().from(t.regions).where(eq(t.regions.id, dish.regionId)))[0] : null;
  const recipes = await db.select().from(t.recipes).where(eq(t.recipes.dishId, id)).orderBy(asc(t.recipes.id));
  const lines = recipes.length
    ? await db.select({
        recipeId: t.recipeIngredients.recipeId, position: t.recipeIngredients.position, amount: t.recipeIngredients.amount,
        unit: t.recipeIngredients.unit, note: t.recipeIngredients.note, optional: t.recipeIngredients.optional,
        groupName: t.recipeIngredients.groupName, ingredientId: t.ingredients.id, ingredientName: t.ingredients.name,
        category: t.ingredients.category,
      })
        .from(t.recipeIngredients)
        .innerJoin(t.ingredients, eq(t.ingredients.id, t.recipeIngredients.ingredientId))
        .where(inArray(t.recipeIngredients.recipeId, recipes.map((r: any) => r.id)))
        .orderBy(asc(t.recipeIngredients.recipeId), asc(t.recipeIngredients.position))
    : [];
  const claims = await db.select({ claim: t.dishOriginClaims.claim, confidence: t.dishOriginClaims.confidence, sourceId: t.dishOriginClaims.sourceId, sourceUrl: t.sources.url })
    .from(t.dishOriginClaims).leftJoin(t.sources, eq(t.sources.id, t.dishOriginClaims.sourceId)).where(eq(t.dishOriginClaims.dishId, id)).orderBy(asc(t.dishOriginClaims.id));
  const festivals = await db.select({ id: t.festivals.id, name: t.festivals.name, months: t.festivals.months, role: t.festivalDishes.role, note: t.festivalDishes.note })
    .from(t.festivalDishes).innerJoin(t.festivals, eq(t.festivals.id, t.festivalDishes.festivalId)).where(eq(t.festivalDishes.dishId, id));
  const sources = await db.select({ id: t.sources.id, title: t.sources.title, url: t.sources.url, checked: t.sources.checked })
    .from(t.dishSources).innerJoin(t.sources, eq(t.sources.id, t.dishSources.sourceId)).where(eq(t.dishSources.ownerId, id));
  const related = await db.select({ id: t.dishes.id, name: t.dishes.name, countryName: t.countries.name })
    .from(t.dishes).innerJoin(t.countries, eq(t.countries.id, t.dishes.countryId))
    .where(and(eq(t.dishes.type, dish.type), sql`${t.dishes.id} <> ${id}`, dish.regionId ? eq(t.dishes.regionId, dish.regionId) : eq(t.dishes.countryId, dish.countryId)))
    .orderBy(asc(t.dishes.name)).limit(6);
  return { dish, country, region, recipes: recipes.map((r: any) => ({ ...r, lines: lines.filter((l: any) => l.recipeId === r.id) })), claims, festivals, sources, related };
}

// ====================================================================== places and festivals
export async function listCountries(db: Db) {
  return rowsOf(await db.execute(sql`
    select c.id, c.name, c.local_name as "localName", c.continent, c.summary,
      (select count(*)::int from regions r where r.country_id = c.id) as regions,
      (select count(*)::int from dishes d where d.country_id = c.id) as dishes
    from countries c order by c.continent, c.name`));
}

export async function getCountry(db: Db, id: string) {
  const [country] = await db.select().from(t.countries).where(eq(t.countries.id, id));
  if (!country) return null;
  const regions = await db.select().from(t.regions).where(eq(t.regions.countryId, id)).orderBy(asc(t.regions.name));
  const signature = await db.select({ regionId: t.regionSignatureIngredients.regionId, id: t.ingredients.id, name: t.ingredients.name })
    .from(t.regionSignatureIngredients).innerJoin(t.ingredients, eq(t.ingredients.id, t.regionSignatureIngredients.ingredientId))
    .innerJoin(t.regions, eq(t.regions.id, t.regionSignatureIngredients.regionId)).where(eq(t.regions.countryId, id));
  const dishes = await searchDishes(db, { country: id, limit: 200 });
  const festivals = await db.select({ id: t.festivals.id, name: t.festivals.name, timing: t.festivals.timing })
    .from(t.festivalCountries).innerJoin(t.festivals, eq(t.festivals.id, t.festivalCountries.festivalId)).where(eq(t.festivalCountries.countryId, id));
  const sources = await db.select({ id: t.sources.id, title: t.sources.title, url: t.sources.url })
    .from(t.countrySources).innerJoin(t.sources, eq(t.sources.id, t.countrySources.sourceId)).where(eq(t.countrySources.ownerId, id));
  return { country, regions: regions.map((r: any) => ({ ...r, signature: signature.filter((s: any) => s.regionId === r.id) })), dishes, festivals, sources };
}

export async function listFestivals(db: Db) {
  return rowsOf(await db.execute(sql`
    select f.id, f.name, f.type, f.timing, f.months, f.summary,
      (select string_agg(c.name, ', ' order by c.name) from festival_countries fc join countries c on c.id = fc.country_id where fc.festival_id = f.id) as countries,
      (select count(*)::int from festival_dishes fd where fd.festival_id = f.id) as dishes
    from festivals f order by f.months[1], f.name`));
}

export async function getFestival(db: Db, id: string) {
  const [festival] = await db.select().from(t.festivals).where(eq(t.festivals.id, id));
  if (!festival) return null;
  const countries = await db.select({ id: t.countries.id, name: t.countries.name })
    .from(t.festivalCountries).innerJoin(t.countries, eq(t.countries.id, t.festivalCountries.countryId)).where(eq(t.festivalCountries.festivalId, id));
  const dishes = await db.select({
    id: t.dishes.id, name: t.dishes.name, summary: t.dishes.summary, countryName: t.countries.name, regionName: t.regions.name,
    flavours: t.dishes.flavours, diet: t.dishes.diet, type: t.dishes.type, reviewStatus: t.dishes.reviewStatus, role: t.festivalDishes.role, note: t.festivalDishes.note,
  }).from(t.festivalDishes).innerJoin(t.dishes, eq(t.dishes.id, t.festivalDishes.dishId))
    .innerJoin(t.countries, eq(t.countries.id, t.dishes.countryId)).leftJoin(t.regions, eq(t.regions.id, t.dishes.regionId))
    .where(eq(t.festivalDishes.festivalId, id)).orderBy(asc(t.dishes.name));
  const sources = await db.select({ id: t.sources.id, title: t.sources.title, url: t.sources.url })
    .from(t.festivalSources).innerJoin(t.sources, eq(t.sources.id, t.festivalSources.sourceId)).where(eq(t.festivalSources.ownerId, id));
  return { festival, countries, dishes, sources };
}

// ====================================================================== ingredients and the spice library
export async function getIngredient(db: Db, id: string) {
  const [ingredient] = await db.select().from(t.ingredients).where(eq(t.ingredients.id, id));
  if (!ingredient) return null;
  const aliases = (await db.select({ alias: t.ingredientAliases.alias }).from(t.ingredientAliases).where(eq(t.ingredientAliases.ingredientId, id))).map((r: any) => r.alias);
  const dishes = await searchDishes(db, { includeIngredients: [id], limit: 200 });
  return { ingredient, aliases, dishes };
}

export interface SpiceFilters { q?: string; part?: string; maxHeat?: number; flavour?: string; profileOnly?: boolean }

export async function listSpices(db: Db, f: SpiceFilters = {}) {
  const maxHeat = clampInt(f.maxHeat, 0, 5);
  const part = allow(enumVals(t.spicePart), f.part ? [f.part] : [])[0];
  const flavour = allow(enumVals(t.flavour), f.flavour ? [f.flavour] : [])[0];
  const like = f.q?.trim() ? '%' + f.q.trim().slice(0, 60).replace(/[\\%_]/g, (m) => '\\' + m) + '%' : null;
  return rowsOf(await db.execute(sql`
    select i.id, i.name, s.scientific_name as "scientificName", s.part_used as "partUsed", s.heat_level as "heatLevel",
      s.flavour_notes as "flavourNotes", s.review_status as "reviewStatus",
      (s.scientific_name is not null or s.history_md is not null) as "hasProfile",
      (select count(*)::int from dish_ingredients di where di.ingredient_id = i.id) as dishes
    from spices s join ingredients i on i.id = s.ingredient_id
    where true
      ${part ? sql`and s.part_used = ${part}` : sql``}
      ${maxHeat !== undefined && maxHeat < 5 ? sql`and s.heat_level <= ${maxHeat}` : sql``}
      ${flavour ? sql`and s.flavour_notes @> array[${flavour}]::flavour[]` : sql``}
      ${f.profileOnly ? sql`and (s.scientific_name is not null or s.history_md is not null)` : sql``}
      ${like ? sql`and (i.name ilike ${like} or s.scientific_name ilike ${like} or exists (select 1 from ingredient_aliases a where a.ingredient_id = i.id and a.alias ilike ${like}))` : sql``}
    order by "hasProfile" desc, i.name`));
}

export async function getSpice(db: Db, id: string) {
  const [row] = await db.select().from(t.spices).where(eq(t.spices.ingredientId, id));
  if (!row) return null;
  const [ingredient] = await db.select().from(t.ingredients).where(eq(t.ingredients.id, id));
  const aliases = (await db.select({ alias: t.ingredientAliases.alias }).from(t.ingredientAliases).where(eq(t.ingredientAliases.ingredientId, id))).map((r: any) => r.alias);
  const origins = await db.select({ id: t.countries.id, name: t.countries.name, role: t.spiceOrigins.role })
    .from(t.spiceOrigins).innerJoin(t.countries, eq(t.countries.id, t.spiceOrigins.countryId)).where(eq(t.spiceOrigins.spiceId, id));
  const substitutes = await db.select({ id: t.ingredients.id, name: t.ingredients.name, note: t.spiceSubstitutes.note })
    .from(t.spiceSubstitutes).innerJoin(t.ingredients, eq(t.ingredients.id, t.spiceSubstitutes.substituteId)).where(eq(t.spiceSubstitutes.spiceId, id));
  const blends = await db.select({ id: t.blends.id, name: t.blends.name })
    .from(t.blendComponents).innerJoin(t.blends, eq(t.blends.id, t.blendComponents.blendId)).where(eq(t.blendComponents.ingredientId, id));
  const dishes = await searchDishes(db, { includeIngredients: [id], limit: 200 });
  const sources = await db.select({ id: t.sources.id, title: t.sources.title, url: t.sources.url })
    .from(t.spiceSources).innerJoin(t.sources, eq(t.sources.id, t.spiceSources.sourceId)).where(eq(t.spiceSources.ownerId, id));
  return { spice: row, ingredient, aliases, origins, substitutes, blends, dishes, sources };
}

export async function listBlends(db: Db) {
  return rowsOf(await db.execute(sql`
    select b.id, b.name, b.local_name as "localName", b.summary, c.name as "countryName",
      (select string_agg(i.name, ', ' order by i.name) from blend_components bc join ingredients i on i.id = bc.ingredient_id where bc.blend_id = b.id) as components
    from blends b left join countries c on c.id = b.country_id order by b.name`));
}

export async function getBlend(db: Db, id: string) {
  const [blend] = await db.select().from(t.blends).where(eq(t.blends.id, id));
  if (!blend) return null;
  const country = blend.countryId ? (await db.select().from(t.countries).where(eq(t.countries.id, blend.countryId)))[0] : null;
  const components = await db.select({ id: t.ingredients.id, name: t.ingredients.name, proportionNote: t.blendComponents.proportionNote, optional: t.blendComponents.optional })
    .from(t.blendComponents).innerJoin(t.ingredients, eq(t.ingredients.id, t.blendComponents.ingredientId)).where(eq(t.blendComponents.blendId, id));
  const sources = await db.select({ id: t.sources.id, title: t.sources.title, url: t.sources.url })
    .from(t.blendSources).innerJoin(t.sources, eq(t.sources.id, t.blendSources.sourceId)).where(eq(t.blendSources.ownerId, id));
  return { blend, country, components, sources };
}

/** Kept for the smoke test and the spice page. */
export async function dishesUsingSpice(db: Db, spiceId: string) {
  return db.select({ id: t.dishes.id, name: t.dishes.name, countryId: t.dishes.countryId })
    .from(t.dishes).where(hasIngredient(spiceId)).orderBy(asc(t.dishes.name));
}

export async function siteStats(db: Db) {
  const r = rowsOf(await db.execute(sql`select
    (select count(*)::int from countries) countries, (select count(*)::int from regions) regions,
    (select count(*)::int from dishes) dishes, (select count(*)::int from recipes) recipes,
    (select count(*)::int from festivals) festivals,
    (select count(*)::int from spices where scientific_name is not null or history_md is not null) spices,
    (select count(*)::int from blends) blends,
    (select count(*)::int from dishes where review_status = 'published') published`));
  return r[0];
}

// ====================================================================== review workflow (admin)
export const REVIEW_TABLES = {
  dish: { table: t.dishes, id: t.dishes.id, status: t.dishes.reviewStatus },
  recipe: { table: t.recipes, id: t.recipes.id, status: t.recipes.reviewStatus },
  country: { table: t.countries, id: t.countries.id, status: t.countries.reviewStatus },
  region: { table: t.regions, id: t.regions.id, status: t.regions.reviewStatus },
  festival: { table: t.festivals, id: t.festivals.id, status: t.festivals.reviewStatus },
  spice: { table: t.spices, id: t.spices.ingredientId, status: t.spices.reviewStatus },
  blend: { table: t.blends, id: t.blends.id, status: t.blends.reviewStatus },
} as const;
export type ReviewEntity = keyof typeof REVIEW_TABLES;

export async function reviewQueue(db: Db, opts: { status?: Status; country?: string; q?: string; limit?: number; offset?: number } = {}) {
  const like = opts.q?.trim() ? '%' + opts.q.trim().slice(0, 60).replace(/[\\%_]/g, (m) => '\\' + m) + '%' : null;
  const where = and(
    opts.status ? eq(t.dishes.reviewStatus, opts.status) : undefined,
    opts.country ? eq(t.dishes.countryId, opts.country) : undefined,
    like ? sql`${t.dishes.name} ilike ${like}` : undefined,
  );
  const rows = await db.select({
    id: t.dishes.id, name: t.dishes.name, countryName: t.countries.name, reviewStatus: t.dishes.reviewStatus,
    unchecked: sql<number>`(select count(*)::int from ${t.dishSources} ds join ${t.sources} s on s.id = ds.source_id where ds.dish_id = ${t.dishes.id} and not s.checked)`,
  }).from(t.dishes).innerJoin(t.countries, eq(t.countries.id, t.dishes.countryId)).where(where)
    .orderBy(asc(t.countries.name), asc(t.dishes.name)).limit(opts.limit ?? 50).offset(opts.offset ?? 0);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.dishes).where(where);
  const byStatus = rowsOf(await db.execute(sql`select review_status as status, count(*)::int as n from dishes group by review_status`));
  return { rows, total: n, byStatus };
}

/** Change a record's status and log who did it and why. One transaction. */
const noNul = (v: string) => v.replace(/\u0000/g, '');

export async function setReviewStatus(db: Db, entity: ReviewEntity, id: string, to: Status, reviewer: string, note?: string) {
  const spec = REVIEW_TABLES[entity];
  if (!spec || !ALL_STATUSES.includes(to)) throw new Error('bad request');
  return db.transaction(async (tx: any) => {
    const [cur] = await tx.select({ s: spec.status }).from(spec.table).where(eq(spec.id, id));
    if (!cur) throw new Error('not found');
    if (cur.s === to) return false;
    await tx.update(spec.table).set({ reviewStatus: to }).where(eq(spec.id, id));
    await tx.insert(t.reviewLog).values({ entityType: entity, entityId: id, fromStatus: cur.s, toStatus: to, reviewer: noNul(reviewer).slice(0, 80), note: note ? noNul(note).slice(0, 500) : null });
    return true;
  });
}

export async function setSourceChecked(db: Db, sourceId: string, checked: boolean, reviewer: string) {
  await db.update(t.sources).set(checked
    ? { checked: true, checkedBy: noNul(reviewer).slice(0, 80), checkedAt: new Date() }
    : { checked: false, checkedBy: null, checkedAt: null }).where(eq(t.sources.id, sourceId));
}

export async function recentReviews(db: Db, limit = 20) {
  return db.select().from(t.reviewLog).orderBy(desc(t.reviewLog.at)).limit(limit);
}
