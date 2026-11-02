import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { parseDishFilters } from '../../lib/filters';
import { countDishes, searchDishes } from '../../../../db/queries';

// JSON version of the dishes filters: /api/dishes?country=germany&diet=vegan, or ?ids=a,b,c (used by Favourites).
export const GET: APIRoute = async ({ url }) => {
  const db = await getDb();
  const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' };
  if (url.searchParams.has('ids')) {
    const dishes = await searchDishes(db, { favouriteIds: ids, limit: 200 });
    return new Response(JSON.stringify({ dishes }), { headers });
  }
  const { filters } = await parseDishFilters(url);
  const [dishes, total] = await Promise.all([searchDishes(db, filters), countDishes(db, filters)]);
  return new Response(JSON.stringify({ total, page: Math.floor((filters.offset ?? 0) / (filters.limit ?? 24)) + 1, dishes }), { headers });
};
