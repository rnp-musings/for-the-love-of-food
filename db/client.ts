/**
 * One way to open the database for scripts and the app.
 *   - DATABASE_URL set  -> real Postgres (Supabase, Neon, local) via postgres-js
 *   - otherwise / --pglite -> embedded Postgres (PGlite): in memory, or persisted to a folder
 * Both return a Drizzle instance with the same schema, so callers do not care which they got.
 *
 * PGlite is imported only when needed, so a production deployment that always has DATABASE_URL
 * never loads (or needs to ship) the embedded database.
 */
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export interface Conn {
  db: any;
  kind: 'postgres' | 'pglite';
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Connections per process. Serverless functions (Vercel) run many short-lived instances, so each
 * keeps one connection and relies on the provider's pooler; long-running servers keep a small pool.
 * Override with DB_POOL_MAX.
 */
const poolMax = () => Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 1 : 5);

export async function connect(opts: { pglite?: boolean | string } = {}): Promise<Conn> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.pglite) {
    const client = postgres(url, {
      max: poolMax(),
      prepare: false,        // required by transaction-mode poolers (Supabase pooler, Neon pooled URLs)
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    const db = drizzlePg(client, { schema });
    return {
      db, kind: 'postgres',
      migrate: () => migratePg(db, { migrationsFolder: 'db/migrations' }),
      close: () => client.end(),
    };
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. On Vercel the app needs a hosted Postgres; set DATABASE_URL in the project settings.');
  }
  // Module names are passed through a variable on purpose: bundlers and Vercel's file tracer cannot follow
  // them, so the ~50 MB embedded database is never copied into a production deployment.
  const load = (name: string) => import(/* @vite-ignore */ name);
  const [{ drizzle: drizzleLite }, { migrate: migrateLite }, { PGlite }, { pg_trgm }] = await Promise.all([
    load('drizzle-orm/pglite'),
    load('drizzle-orm/pglite/migrator'),
    load('@electric-sql/pglite'),
    load('@electric-sql/pglite/contrib/pg_trgm'),
  ]);
  const dir = typeof opts.pglite === 'string' ? opts.pglite : undefined; // undefined = in memory
  // In-memory databases must be created with an options object only: passing `undefined` as the first
  // argument makes this PGlite version drop the extensions.
  const lite = dir ? new PGlite(dir, { extensions: { pg_trgm } }) : new PGlite({ extensions: { pg_trgm } });
  const db = drizzleLite(lite, { schema });
  return {
    db, kind: 'pglite',
    migrate: () => migrateLite(db, { migrationsFolder: 'db/migrations' }),
    close: () => lite.close(),
  };
}
