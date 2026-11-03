import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// Server-rendered app: every page is a database query.
//  - On Vercel (the VERCEL env var is set during its builds) it builds for Vercel Functions.
//  - Everywhere else (local, Docker, Fly, Railway) it builds a standalone Node server.
const onVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  output: 'server',
  adapter: onVercel
    ? vercel({ maxDuration: 15 })
    : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  server: { host: true, port: Number(process.env.PORT ?? 4321) },
  security: {
    checkOrigin: true, // rejects cross-site form POSTs (CSRF)
    // Behind a TLS-terminating proxy you run yourself, name the public host at build time so forwarded
    // headers are trusted:  ALLOWED_HOST=food.example.com npm run app:build   (not needed on Vercel)
    allowedDomains: process.env.ALLOWED_HOST ? [{ hostname: process.env.ALLOWED_HOST, protocol: 'https' }] : [],
  },
  vite: {
    // Keep the database drivers as runtime imports (PGlite loads WASM files from node_modules).
    ssr: { external: ['@electric-sql/pglite', 'postgres'] },
    build: { target: 'es2022' },
  },
});
