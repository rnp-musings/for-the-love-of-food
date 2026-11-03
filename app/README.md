# App (database-backed)

Server-rendered Astro app over Postgres. Every page is a query, so it scales past what a static page can hold, filters run in SQL, and the spice library and review workflow have somewhere to live. The GitHub Pages site in the repo root is unchanged and keeps deploying until you point a domain at this app.

## Run it

```bash
npm install
npm run app:build
ADMIN_TOKEN='choose-a-long-secret' INSECURE_COOKIES=1 npm run app:start     # http://localhost:4321
# development with reload:
npm run app:dev
```

With no `DATABASE_URL` the app uses an embedded Postgres in `./.pgdata`, created and filled from `/content` on first start. That is for development and demos only.

## Production

On Vercel: see [docs/deploy-vercel.md](../docs/deploy-vercel.md). The steps below are for a server you run yourself (Docker, Fly.io, Railway, a VPS).

1. Create a Postgres database (Supabase, Neon, or any Postgres 14+ with `pg_trgm`).
2. Release step, run on every deploy: `DATABASE_URL=... npx tsx db/migrate.ts && DATABASE_URL=... npx tsx db/import.ts --skip-validate` (validate content in CI first).
3. Run the server: `DATABASE_URL=... ADMIN_TOKEN=... node app/dist/server/entry.mjs`, or use the `Dockerfile` (Fly.io, Railway, Render, Cloud Run, a VPS).
4. Behind a TLS-terminating proxy, build with `ALLOWED_HOST=your.domain` so forwarded headers are trusted.
5. Point a monitor at `/healthz`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Unset = embedded demo database |
| `ADMIN_TOKEN` | At least 12 characters. Enables `/admin`. Unset = no admin area exists |
| `ALLOWED_HOST` | Build-time public host name (see above) |
| `PORT`, `HOST` | Listen address (default 4321 / all interfaces) |
| `PGLITE_DIR` | Folder for the embedded database (default `.pgdata`) |
| `INSECURE_COOKIES=1` | Allow the admin cookie over plain http, for local use only |

## What is in it

- `/dishes`: filters by country, region, type, course, flavour, diet, spice level, active time, festival and month, plus ingredients to include or exclude. All run in SQL, paged 24 at a time, and work without JavaScript. The URL holds the filter state.
- `/dishes/<id>`: story, origin claims with confidence, recipes with a servings scaler, festivals, sources and a "verified" marker. Ingredient names link to ingredient or spice pages. Recipe structured data is included.
- `/countries`, `/festivals`, `/spices` (library and blends), `/ingredients/<id>`.
- `/favourites`: saved in the visitor's browser only.
- `/api/dishes`: the same filters as JSON, or `?ids=a,b,c`.
- `/admin`: review queue. Verify sources, then move a dish (and its recipes) from draft to reviewed or published, with a required note. Every change is logged with the reviewer's name. A status set here survives re-imports.

## Security notes

- Admin uses one shared secret and a signed, HttpOnly, SameSite=Strict cookie. Login attempts are throttled in the database (10 per 10 minutes per client address), so the limit holds across instances.
- Cross-site form posts are rejected by Astro's origin check; a browser-side test for this is in `test/browser.e2e.cjs`.
- All SQL uses bound parameters; enum filters are checked against allow-lists; numbers are clamped; requests containing a NUL byte are refused.
- Public pages are cacheable for 60 seconds; admin pages are never cached.
- Not done: per-user accounts, row-level security (only needed if a browser talks to Supabase directly, which this app does not), CSP headers.

## Tests

```bash
npm run app:build && npm run app:test      # 31 HTTP-level tests on a temp embedded database
node app/test/browser.e2e.cjs              # optional, needs Playwright and a running app (see the file header)
```
