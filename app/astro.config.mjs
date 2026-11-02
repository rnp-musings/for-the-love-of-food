import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Server-rendered app: every page is a database query. Runs anywhere Node runs (see ../Dockerfile).
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'never',
  server: { host: true, port: Number(process.env.PORT ?? 4321) },
  security: {
    checkOrigin: true, // rejects cross-site form POSTs (CSRF)
    // Behind a TLS-terminating proxy, name the public host at build time so forwarded headers are trusted:
    //   ALLOWED_HOST=food.example.com npm run app:build
    allowedDomains: process.env.ALLOWED_HOST ? [{ hostname: process.env.ALLOWED_HOST, protocol: 'https' }] : [],
  },
  vite: {
    // Keep the database drivers as runtime imports (PGlite loads WASM files from node_modules).
    ssr: { external: ['@electric-sql/pglite', 'postgres'] },
    build: { target: 'es2022' },
  },
});
