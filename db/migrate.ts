/** Apply pending migrations. Usage: DATABASE_URL=... npm run db:migrate   (or add --pglite <dir>) */
import { connect } from './client';

const i = process.argv.indexOf('--pglite');
const conn = await connect({ pglite: i > -1 ? (process.argv[i + 1] ?? true) : false });
await conn.migrate();
console.log(`Migrations applied (${conn.kind}).`);
await conn.close();
