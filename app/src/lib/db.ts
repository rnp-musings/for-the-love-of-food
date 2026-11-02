/**
 * One shared database connection per server process.
 *   DATABASE_URL set  -> Postgres (production)
 *   otherwise         -> embedded PGlite in ./.pgdata, created and filled from /content on first start
 */
import { count } from 'drizzle-orm';
import { connect, type Conn } from '../../../db/client';
import * as t from '../../../db/schema';

let ready: Promise<Conn> | undefined;

async function init(): Promise<Conn> {
  const useLite = !process.env.DATABASE_URL;
  const conn = await connect({ pglite: useLite ? (process.env.PGLITE_DIR ?? '.pgdata') : false });
  if (useLite) {
    await conn.migrate();
    const [{ n }] = await conn.db.select({ n: count() }).from(t.dishes);
    if (n === 0) {
      console.log('[app] empty embedded database: importing /content (first start only)');
      const { execFileSync } = await import('node:child_process');
      await conn.close();
      execFileSync('npx', ['tsx', 'db/import.ts', '--skip-validate', '--pglite', process.env.PGLITE_DIR ?? '.pgdata'], { stdio: 'inherit' });
      return connect({ pglite: process.env.PGLITE_DIR ?? '.pgdata' });
    }
  }
  return conn;
}

export const getDb = async () => (await (ready ??= init())).db;
export { t };
