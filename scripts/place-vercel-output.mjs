// The app lives in app/, but Vercel reads the Build Output API folder from the repository root.
// Run after `astro build --root app` with VERCEL set: moves app/.vercel/output to ./.vercel/output.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const from = 'app/.vercel/output';
if (!existsSync(from)) {
  console.error(`${from} not found. Was the build run with the VERCEL environment variable set?`);
  process.exit(1);
}
rmSync('.vercel/output', { recursive: true, force: true });
mkdirSync('.vercel', { recursive: true });
cpSync(from, '.vercel/output', { recursive: true });
rmSync('app/.vercel', { recursive: true, force: true });
console.log('Build output placed at .vercel/output');
