/**
 * One way to open the database for scripts.
 *   - DATABASE_URL set  -> real Postgres (Supabase, Neon, local) via postgres-js
 *   - otherwise / --pglite -> embedded Postgres (PGlite): in memory, or persisted to a folder
 * Both return a Drizzle instance with the same schema, so scripts do not care which they got.
 */
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleLite } from 'drizzle-orm/pglite';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import * as schema from './schema';

export interface Conn {
  db: any;
  kind: 'postgres' | 'pglite';
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

export async function connect(opts: { pglite?: boolean | string } = {}): Promise<Conn> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.pglite) {
    const client = postgres(url, { max: 5, prepare: false }); // prepare:false works with pooled Supabase/Neon URLs
    const db = drizzlePg(client, { schema });
    return {
      db, kind: 'postgres',
      migrate: () => migratePg(db, { migrationsFolder: 'db/migrations' }),
      close: () => client.end(),
    };
  }
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
