/**
 * Dish search against Postgres: the server-side equivalent of the filters on /dishes/.
 * AND across filters, OR within the text search. Meant as the starting point for the app's API.
 */
import { and, arrayContains, asc, eq, exists, inArray, notExists, or, sql, type SQL } from 'drizzle-orm';
import * as t from './schema';

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
  status?: 'draft' | 'reviewed' | 'published'; // omit for all
  limit?: number;
  offset?: number;
}

const hasIngredient = (id: string) =>
  sql`exists (select 1 from ${t.dishIngredients} di where di.dish_id = ${t.dishes.id} and di.ingredient_id = ${id})`;

export async function searchDishes(db: any, f: DishFilters = {}) {
  const where: (SQL | undefined)[] = [
    f.country ? eq(t.dishes.countryId, f.country) : undefined,
    f.region ? eq(t.dishes.regionId, f.region) : undefined,
    f.type ? sql`${t.dishes.type} = ${f.type}` : undefined,
    f.course ? sql`${t.dishes.course} @> array[${f.course}]::course[]` : undefined,
    f.flavours?.length ? sql`${t.dishes.flavours} @> ${sql.raw(`array[${f.flavours.map((x) => `'${x.replace(/'/g, '')}'`).join(',')}]::flavour[]`)}` : undefined,
    f.diet?.length ? sql`${t.dishes.diet} @> ${sql.raw(`array[${f.diet.map((x) => `'${x.replace(/'/g, '')}'`).join(',')}]::diet[]`)}` : undefined,
    f.maxSpice !== undefined ? sql`${t.dishes.spiceLevel} <= ${f.maxSpice}` : undefined,
    f.maxActiveMinutes !== undefined
      ? exists(db.select({ x: sql`1` }).from(t.recipes)
          .where(and(eq(t.recipes.dishId, t.dishes.id), sql`${t.recipes.prepMinutes} + ${t.recipes.cookMinutes} <= ${f.maxActiveMinutes}`)))
      : undefined,
    ...(f.includeIngredients ?? []).map((i) => hasIngredient(i)),
    ...(f.excludeIngredients ?? []).map((i) => sql`not ${hasIngredient(i)}`),
    f.festival
      ? exists(db.select({ x: sql`1` }).from(t.festivalDishes)
          .where(and(eq(t.festivalDishes.dishId, t.dishes.id), eq(t.festivalDishes.festivalId, f.festival))))
      : undefined,
    f.festivalMonth
      ? exists(db.select({ x: sql`1` }).from(t.festivalDishes)
          .innerJoin(t.festivals, eq(t.festivals.id, t.festivalDishes.festivalId))
          .where(and(eq(t.festivalDishes.dishId, t.dishes.id), sql`${t.festivals.months} @> array[${f.festivalMonth}]::smallint[]`)))
      : undefined,
    f.status ? sql`${t.dishes.reviewStatus} = ${f.status}` : undefined,
  ];

  if (f.q?.trim()) {
    const q = f.q.trim();
    // Match the text document, the name by substring/typo (trigram index), or any ingredient name/alias of the dish.
    where.push(or(
      sql`${t.dishes.searchDoc} @@ websearch_to_tsquery('simple', ${q})`,
      sql`${t.dishes.name} ilike ${'%' + q + '%'}`,
      sql`exists (
        select 1 from ${t.dishIngredients} di
        join ${t.ingredients} i on i.id = di.ingredient_id
        left join ${t.ingredientAliases} a on a.ingredient_id = i.id
        where di.dish_id = ${t.dishes.id} and (i.name ilike ${'%' + q + '%'} or a.alias ilike ${'%' + q + '%'}))`,
    ));
  }

  return db
    .select({
      id: t.dishes.id, name: t.dishes.name, countryId: t.dishes.countryId, regionId: t.dishes.regionId,
      type: t.dishes.type, summary: t.dishes.summary, spiceLevel: t.dishes.spiceLevel, reviewStatus: t.dishes.reviewStatus,
    })
    .from(t.dishes)
    .where(and(...where.filter(Boolean)))
    .orderBy(asc(t.dishes.name))
    .limit(f.limit ?? 24)
    .offset(f.offset ?? 0);
}

/** Dishes that use a spice, for the spice library page. */
export async function dishesUsingSpice(db: any, spiceId: string) {
  return db.select({ id: t.dishes.id, name: t.dishes.name, countryId: t.dishes.countryId })
    .from(t.dishes)
    .where(hasIngredient(spiceId))
    .orderBy(asc(t.dishes.name));
}
