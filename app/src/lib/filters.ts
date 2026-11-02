import { getDb } from './db';
import { resolveIngredients, type DishFilters } from '../../../db/queries';

export const PAGE_SIZE = 24;

const list = (v: string | null) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
const num = (v: string | null) => (v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export interface ParsedFilters {
  filters: DishFilters;
  raw: URLSearchParams;
  page: number;
  include: { id: string; name: string }[];
  exclude: { id: string; name: string }[];
  unknown: string[];
}

/** Turn a query string into SQL filters. Unknown values are ignored, never passed through. */
export async function parseDishFilters(url: URL): Promise<ParsedFilters> {
  const p = url.searchParams;
  const db = await getDb();
  const incNames = list(p.get('inc')), excNames = list(p.get('exc'));
  const [include, exclude] = await Promise.all([resolveIngredients(db, incNames), resolveIngredients(db, excNames)]);
  const known = new Set([...include, ...exclude].map((i) => i.name.toLowerCase()));
  const unknown = [...incNames, ...excNames].filter((n) => !known.has(n.toLowerCase()) && !include.concat(exclude).some((i) => i.id === n));
  const page = Math.max(1, Math.min(500, Math.floor(num(p.get('page')) ?? 1)));
  const filters: DishFilters = {
    q: p.get('q')?.slice(0, 80) || undefined,
    country: p.get('country') || undefined,
    region: p.get('region') || undefined,
    type: p.get('type') || undefined,
    course: p.get('course') || undefined,
    flavours: p.getAll('flavour'),
    diet: p.getAll('diet'),
    maxSpice: num(p.get('spice')),
    maxActiveMinutes: num(p.get('time')),
    includeIngredients: include.map((i) => i.id),
    excludeIngredients: exclude.map((i) => i.id),
    festival: p.get('festival') || undefined,
    festivalMonth: num(p.get('month')),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  return { filters, raw: p, page, include, exclude, unknown };
}

/** Current query string with some params changed or removed (for pagination and chip links). */
export function withParams(raw: URLSearchParams, change: Record<string, string | null>): string {
  const q = new URLSearchParams(raw);
  for (const [k, v] of Object.entries(change)) {
    q.delete(k);
    if (v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? '?' + s : '';
}
