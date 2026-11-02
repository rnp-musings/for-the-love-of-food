import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';

// For load balancers and uptime monitors: proves the database answers.
export const GET: APIRoute = async () => {
  try {
    await (await getDb()).execute(sql`select 1`);
    return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('database unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
