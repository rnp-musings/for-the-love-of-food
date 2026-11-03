# For the Love of Food

A filterable atlas of world cuisine: regional food country by country, the story behind each dish, recipes, food festivals and the dishes eaten at them, and (soon) a spice library.

**Handover note, written 2026-11-03 at commit `1cb9b0d`.** The people and the AI session that built this are gone, so this file is meant to be enough to pick the project up cold. It says what exists, why it is built the way it is, what has and has not been tested, and what to do next. Where something was not verified, it says so.

## Contents

1. [Where things stand](#1-where-things-stand)
2. [What is in the box](#2-what-is-in-the-box)
3. [Getting started](#3-getting-started)
4. [Architecture and why](#4-architecture-and-why)
5. [The content](#5-the-content)
6. [How to add or change content](#6-how-to-add-or-change-content)
7. [The database](#7-the-database)
8. [The app](#8-the-app)
9. [Review workflow](#9-review-workflow)
10. [Testing and CI](#10-testing-and-ci)
11. [Deploying](#11-deploying)
12. [Gotchas we hit](#12-gotchas-we-hit)
13. [Open issues and known gaps](#13-open-issues-and-known-gaps)
14. [Suggested next steps, in order](#14-suggested-next-steps-in-order)
15. [History and decisions](#15-history-and-decisions)
16. [Access and accounts](#16-access-and-accounts)

---

## 1. Where things stand

| Thing | State |
|---|---|
| Content | 30 countries, 136 regions, 298 dishes each with one recipe, 53 festivals, 124 dish-to-festival links, 428 ingredients, 389 sources. **All AI-drafted, none reviewed by a person.** |
| Static site | **Live** at https://rnp-musings.github.io/for-the-love-of-food/ (GitHub Pages, redeploys on every push to `main`). Filters run in the browser. |
| Database-backed app (`app/`) | **Built and tested, not deployed anywhere.** Server-rendered, filters in SQL, spice library pages, reviewer screen. |
| Database | Schema, migrations and importer done and tested on embedded Postgres and local Postgres 16. **No hosted database exists yet.** |
| Hosting decision | Vercel chosen. The owner had created a Vercel account and given it access to the repo. No project was imported and no database created as of this note. |
| Spice library | Tables, file formats, validator rules, importer and pages exist. **No content.** 68 spice ingredients have empty placeholder profiles. |
| Licence | **None chosen.** There is no `LICENSE` file. See [open issues](#13-open-issues-and-known-gaps). |

The very next job is to finish the deployment ([section 11](#11-deploying)) and then start human review of the content ([section 9](#9-review-workflow)).

## 2. What is in the box

```
content/            The data. JSON, one file per collection (dishes and recipes: one file per country).
schemas/            JSON Schema for every record type. The contract for content/.
scripts/            validate.py (content checker), merge_collections.py, place-vercel-output.mjs
db/                 Postgres schema (Drizzle), SQL migrations, importer, queries, smoke test
app/                Database-backed Astro app (server rendering). Has its own README.
src/                The original static Astro site (reads content/ directly at build time)
docs/               research.md (original scope), review-queue.md, content-brief.md, deploy-vercel.md
.github/workflows/  ci.yml, deploy.yml (Pages), db-sync.yml (hosted DB sync)
Dockerfile          Production image for the app (never built, see section 13)
vercel.json         Tells Vercel how to build the app
```

Other READMEs: [app/README.md](app/README.md) (running and securing the app), [db/README.md](db/README.md) (database commands), [docs/deploy-vercel.md](docs/deploy-vercel.md) (step-by-step Vercel setup), [docs/review-queue.md](docs/review-queue.md) (the claims to check first), [docs/content-brief.md](docs/content-brief.md) (the rules for writing content), [docs/research.md](docs/research.md) (the first-pass scope and licensing research; its "next steps" section is long superseded).

## 3. Getting started

Requirements: **Node 22**, **Python 3** with `jsonschema`, git. Postgres is optional (an embedded one is used when `DATABASE_URL` is not set).

```bash
git clone https://github.com/rnp-musings/for-the-love-of-food
cd for-the-love-of-food
npm install
pip install jsonschema
python3 scripts/validate.py          # should print OK
```

Run the pieces:

```bash
# Static site (the one on GitHub Pages). Serves under /for-the-love-of-food/
npm run dev                          # http://localhost:4321/for-the-love-of-food/

# Database-backed app, no setup: uses an embedded Postgres in ./.pgdata, filled from content/ on first start
npm run app:build
ADMIN_TOKEN='any-string-of-12-or-more-chars' INSECURE_COOKIES=1 npm run app:start    # http://localhost:4321
#   first start takes ~10 s while it imports; /admin is the reviewer screen; delete .pgdata to reset

# Same app with hot reload
npm run app:dev

# Tests
npm run db:smoke                     # import + queries on embedded Postgres (about 20 checks)
npm run app:build && npm run app:test   # 32 HTTP tests on embedded Postgres
```

Environment variables for the app:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Unset means embedded demo database (never use that in production). On Vercel it is required. |
| `ADMIN_TOKEN` | 12+ characters. Enables `/admin`. Unset means the admin area does not exist (404). |
| `INSECURE_COOKIES=1` | Lets the admin cookie work over plain http. Local use only. |
| `ALLOWED_HOST` | Build-time public host, only for self-hosting behind a TLS proxy. Not needed on Vercel. |
| `PORT`, `HOST` | Listen address for the Node server (default 4321, all interfaces). |
| `PGLITE_DIR` | Folder for the embedded database (default `.pgdata`). |
| `DB_POOL_MAX` | Connections per process (default 5, or 1 on Vercel). |
| `TEST_DATABASE_URL` | Makes `npm run app:test` use a real Postgres that already has the content imported. |

## 4. Architecture and why

```
content/*.json  --(validate.py)-->  git  --push-->  GitHub Actions
      |                                                  |-- deploy.yml  -> static site on GitHub Pages
      |                                                  |-- db-sync.yml -> migrate + import into hosted Postgres
      |                                                  `-- ci.yml      -> builds + all tests
      v
 db/import.ts  -->  Postgres  <--  app/ (Astro SSR on Vercel Functions)  <--  visitors
                        ^
                        `-- /admin reviewer screen writes review status + source verification
```

**JSON in git is the source of truth for content. Postgres holds the same content plus review state.** The importer upserts by id and never overwrites a reviewer's status. That split is deliberate: content changes are reviewed as pull requests; review decisions (who checked what, when) are data that belongs in a database.

Key choices and what was rejected:

| Decision | Why | Rejected |
|---|---|---|
| Static JSON first, database later | Fastest way to get a reviewable content set; the static site was live within hours | Starting with a database and admin UI |
| Astro | Content-heavy site, ships almost no JS, one framework for static and server rendering | Next.js (heavier than needed) |
| Postgres + Drizzle | The spice library is relational; faceted filters use array columns and GIN indexes; full-text and trigram search are built in | SQLite (fine for read-only, awkward once reviewers write); a separate search engine (not needed below tens of thousands of records) |
| Slugs as primary keys | The same kebab-case ids appear in JSON, the database and URLs | Auto-increment ids |
| Admin = one shared secret (`ADMIN_TOKEN`) + name | Works with any Postgres, no accounts to run | Supabase Auth (more moving parts; revisit if several reviewers need individual logins) |
| Vercel for hosting | Git push deploys, preview URLs per pull request, free to start | Fly.io / Railway (no code changes needed, and the `Dockerfile` already supports them; see section 11) |
| Two adapters in one config | `app/astro.config.mjs` builds for Vercel when `VERCEL` is set and as a Node server otherwise | Maintaining two apps |
| AI-drafted, human-reviewed content | The only way to reach hundreds of dishes; the review workflow exists to make "human-reviewed" real | Hand-writing everything; bulk-importing open datasets (thin on stories, licensing complications) |

## 5. The content

### Record types

Defined in `schemas/`, documented by example in `content/`:

| Collection | File(s) | Notes |
|---|---|---|
| Countries | `content/countries.json` | `continent` is one of africa, asia, europe, north-america, south-america, oceania. Cuba and Jamaica are filed under north-america. |
| Regions | `content/regions.json` | Belong to a country; list signature ingredients. Ids must be globally unique (see gotchas). |
| Dishes | `content/dishes/<country-id>.json` | Story, tags, cited `origin_claims` with a confidence level. |
| Recipes | `content/recipes/<country-id>.json` | Linked to a dish. Currently exactly one per dish, id `<dish-id>-home`. |
| Ingredients | `content/ingredients.json` | Controlled list with `aliases` and `allergens`. Category drives the diet-tag check. |
| Festivals | `content/festivals.json` | `months` lists every month it can fall in (movable festivals list all 12). |
| Festival-dish links | `content/festival-dishes.json` | A dish can be in many festivals and the reverse. Role: traditional, signature, seasonal, offering. |
| Sources | `content/sources.json` | Every citation. `checked` is false until a human opens it and confirms it supports the claim. |
| Spices, blends | `content/spices.json`, `content/blends.json` | Do not exist yet. Formats are in `schemas/spice.schema.json` and `schemas/blend.schema.json`. |

### Coverage

Five countries per continent, ten dishes each (except Tonga):

- Asia: India, China, Japan, Thailand, Vietnam
- Europe: Italy, France, Germany, Spain, Greece
- North America: Mexico, United States, Canada, Cuba, Jamaica
- Africa: Morocco, Ethiopia, Egypt, Nigeria, South Africa
- South America: Brazil, Peru, Argentina, Colombia, Chile
- Oceania: Australia, New Zealand, Fiji, Samoa, **Tonga (8 dishes)**

Tonga stops at 8 on purpose: the writer could not name two more dishes it was sure were real and was instructed not to invent any. Do not pad it; add dishes only with a source.

### How the content was made, and what that means for trust

1. India, Italy and Mexico were written first (5 dishes each) as a vertical slice, then the rest by **12 parallel AI writers** following [docs/content-brief.md](docs/content-brief.md), each in a private copy of the repo, merged with `scripts/merge_collections.py`.
2. The writers were told not to invent dishes, to record contested origins as `origin_claims` with a confidence (`well-documented`, `widely-told`, `disputed`, `legend`), and to cite sources.
3. Every new source URL was fetched and returned HTTP 200 **when it was added**. That proves the page exists, **not** that it says what the dish record claims. Several writers admitted they wrote facts from memory rather than from the page.
4. The validator enforces structure, references and diet tags (see below). It cannot judge whether a story is true.

So: treat everything as a draft. [docs/review-queue.md](docs/review-queue.md) lists roughly 200 dishes the writers themselves flagged as least certain, plus recipes with food-safety implications (curing salt, fermentation, cooking temperatures). Start there.

### What `scripts/validate.py` checks

JSON Schema for every record; every cross-reference resolves (country, region, ingredient, source, festival, dish); every dish has at least one recipe; a dish's region belongs to its country; `to-taste` ingredients have no amount; and **diet tags against ingredients** (a dish tagged vegetarian cannot have a meat, poultry or fish ingredient; gluten-free cannot contain a gluten allergen; likewise dairy-free, egg-free, nut-free, vegan). The check is only as good as the ingredient `category` and `allergens` fields, so a wrong category silently weakens it.

## 6. How to add or change content

The rules for writing (accuracy, sourcing, tone, what to do when unsure) are in [docs/content-brief.md](docs/content-brief.md). Read it first.

**Edit an existing dish or recipe:** change the JSON in `content/dishes/<country>.json` or `content/recipes/<country>.json`, run `python3 scripts/validate.py`, commit. A pull request is the review.

**Add a dish:**
1. Add the dish to `content/dishes/<country>.json` with a globally unique kebab-case id (prefix it with the cuisine if the name is generic, e.g. `moroccan-couscous`).
2. Add its recipe to `content/recipes/<country>.json` as `<dish-id>-home`. Reuse existing ingredient ids (search `content/ingredients.json`, including aliases). Add new ingredients there with the right `category` and `allergens`.
3. Add sources to `content/sources.json` (`"checked": false`). Open each URL first. Wikipedia rate-limits fast requests (HTTP 429), so space them out.
4. Link festivals in `content/festival-dishes.json` only if the dish genuinely belongs to the festival.
5. `python3 scripts/validate.py` must print `OK`.

**Add a country:** add to `countries.json`, then regions (3 to 5 where cuisine really differs), then dishes and recipes, then festivals. Region ids must not collide with any existing id.

**Add a spice or blend:** create `content/spices.json` / `content/blends.json`. A spice `id` must equal an existing ingredient id whose category is `herb-spice`. See [db/README.md](db/README.md#spice-library).

**Add many records in parallel** (what was done for the first 298): give each writer a private copy of `content/`, `schemas/` and `scripts/`, have them write only new files named after their group (`content/regions/<group>.json`, `content/ingredients/<group>.json`, and so on) plus their own country files, then copy the files back and run `python3 scripts/merge_collections.py` followed by `validate.py`. The validator and merge script both understand the per-group `content/<collection>/<group>.json` layout. The merge script unions ingredients and sources by id and reports conflicts; any duplicate region, festival or country id is an error you must resolve by renaming.

**After any content change** that should reach the hosted database: merging to `main` triggers the *Sync database* workflow (once configured, see section 11). Or run `npm run db:import` yourself with `DATABASE_URL` set.

## 7. The database

Full details in [db/README.md](db/README.md). The essentials:

- `db/schema.ts` is the Drizzle schema. Tables mirror the JSON records, plus `spices`, `spice_substitutes`, `spice_origins`, `blends`, `blend_components`, source-link tables, `review_log` and `login_attempts`. The view `dish_ingredients` (one row per dish and ingredient across its recipes) drives the include/exclude-ingredient filters and "dishes that use this spice".
- Migrations are SQL in `db/migrations/`. `0000_init` and `0002_login_attempts` are generated by `npm run db:generate`; `0001_search_extras` is hand-written (the `pg_trgm` extension, trigram indexes, `updated_at` triggers). **Review the generated SQL before committing a new migration.**
- `npm run db:migrate` applies migrations; `npm run db:import` loads `content/`. Both honour `DATABASE_URL`, or take `--pglite [dir]` for an embedded database.
- **Import rules:** upserts by id; child rows (aliases, claims, recipe lines, links) are replaced; `review_status` set in the database is **preserved** (pass `--overwrite-review` to force the JSON value); `sources.checked` is only ever raised, never lowered; records deleted from JSON are reported as orphans, never deleted. Runs `validate.py` first unless `--skip-validate`.
- `db/queries.ts` holds every query the app uses. `searchDishes()` is the heart of the filters. All values are bound parameters, enum filters are checked against allow-lists, numbers are clamped.
- `db/smoke.ts` (`npm run db:smoke`) imports into a throw-away database twice, then checks that the SQL filters give exactly the answers the static site gave (for example 69 vegan dishes, Germany plus Oktoberfest gives 4), that spices and blends import, and that a reviewer's status survives a re-import.

## 8. The app

Details in [app/README.md](app/README.md). Summary:

- Astro with `output: 'server'`. Every page is a database query through `app/src/lib/db.ts` (one shared connection per process; embedded database only when `DATABASE_URL` is unset).
- Pages: `/` (home, "celebrating this month"), `/dishes` (all filters, paged 24, works without JavaScript, filter state in the URL), `/dishes/<id>` (story, origin claims, recipe with servings scaler, festivals, sources, Recipe structured data), `/countries`, `/countries/<id>`, `/festivals`, `/festivals/<id>`, `/ingredients/<id>` (redirects to the spice page for spices), `/spices` and `/spices/<id>`, `/blends/<id>`, `/favourites` (browser-only), `/api/dishes` (JSON, same filters, or `?ids=a,b`), `/healthz`, `/admin`.
- Filters: country, region, dish type, course, flavour (all selected), diet, max spice level, active time, festival, festival month, ingredients to include and exclude (names or aliases), free text (name, local name, summary, any ingredient name or alias).
- `app/src/middleware.ts` sets security headers on every response, keeps `/admin` out of caches, redirects signed-out admin requests to the login, refuses any request containing a NUL byte, and sets `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` on public pages (so a CDN caches them 5 minutes).
- The static site in `src/` is the older, simpler version. Once the app is live it can be retired (delete `src/`, `astro.config.mjs` at the root, `public/`, and `.github/workflows/deploy.yml`) or kept as a fallback. Components and CSS are duplicated between the two on purpose, to avoid coupling while the app was being built.

## 9. Review workflow

Every record has `review_status`: `draft` (default) → `reviewed` → `published`.

At `/admin` (set `ADMIN_TOKEN`; sign in with the token and your name):

1. The queue lists dishes by status, country or name, with how many sources are unverified.
2. On a dish's review page: open each source, tick **Mark verified** only if it supports the claims; read the story, origin claims, festival links and recipe.
3. Move the status. **The app enforces:** leaving `draft` needs every source verified and a note saying what you checked. Moving a dish also moves its recipes. Each change is written to `review_log` with your name, the note and the time.
4. Fixes to wording are made in the JSON in git, not in the admin screen. Re-importing keeps the status you set.

Only dishes (and their recipes) have a review screen today. The database layer (`setReviewStatus`) already supports countries, regions, festivals, spices and blends; they need pages.

**Important gap:** the public site currently shows every dish whatever its status, with a "Draft" or "Reviewed" badge on anything not `published`. `searchDishes` accepts a `statuses` filter but no page uses it. Decide when to hide unreviewed content and wire it up (see next steps).

## 10. Testing and CI

| What | Command | Covers |
|---|---|---|
| Content | `python3 scripts/validate.py` | schemas, references, diet tags |
| Database | `npm run db:smoke` | migrate, idempotent import, filters match the static site, spices and blends, status survives re-import |
| App (HTTP) | `npm run app:build && npm run app:test` | 32 tests: every route, filters, hostile input (SQL-like strings, huge numbers, NUL bytes, XSS), admin guard, CSRF, cookie flags, security headers, login throttle |
| App on real Postgres | `TEST_DATABASE_URL=postgres://... npm run app:test` | the same, 31 tests (throttle test skipped on a persistent database) |
| Browser | `node app/test/browser.e2e.cjs` | filters auto-apply, pagination, favourites, servings scaler, ingredient links, full admin review flow, signed-in cross-site forgery refused, XSS payloads do not execute. Not wired into CI (needs Playwright, which is not a dependency); see the header of the file for how to run it. |
| Vercel function | see `docs/deploy-vercel.md` | `app/test/vercel-harness.mjs` hosts the built function locally |

`.github/workflows/ci.yml` runs on every push and pull request: validate content, build the static site, `db:smoke`, build the app, a Vercel build (asserting the embedded database is not shipped), the app tests on embedded Postgres, then migrate and import into a Postgres 16 service container and run the app tests against it. `deploy.yml` deploys the static site to Pages. `db-sync.yml` syncs the hosted database (see below).

Not covered: there is **no linter, formatter or type-check step**; no unit tests beyond the above; no accessibility or performance audit beyond the basics (semantic HTML, skip link, labels, focus styles, a responsive layout checked at 390 px).

## 11. Deploying

### Static site (done)

GitHub Pages, source **GitHub Actions**, built by `deploy.yml` on every push to `main`. Served under `/for-the-love-of-food/` (see `base` in the root `astro.config.mjs`).

### App on Vercel (not done)

Follow [docs/deploy-vercel.md](docs/deploy-vercel.md). In short:

1. Create a hosted Postgres (Supabase or Neon). Two connection strings: pooled (for the app) and session/direct (for migrations).
2. Add the migrations string as the GitHub secret `DATABASE_URL_ADMIN`, run the **Sync database** workflow once. (Until the secret exists the workflow runs and reports success while doing nothing.)
3. Import the repo in Vercel. Root `./`, framework **Other** (settings come from `vercel.json`). Env vars: `DATABASE_URL` (pooled; Production and Preview) and `ADMIN_TOKEN` (**Production only**, so previews have no admin).
4. Check `/healthz`.

What was verified: the built Vercel function was run locally (`app/test/vercel-harness.mjs`) against real Postgres 16 and passed the browser suite. **What was not:** an actual deployment on Vercel, or a hosted Supabase/Neon database. Expect small surprises (dashboard labels in the guide were written from memory).

Things to know on Vercel: the Hobby plan is **non-commercial only**; Pro is $20 per user per month. Pages are cached at the edge for 5 minutes, so a content change takes up to that long to show. Supabase's free plan pauses after a week of inactivity and has no point-in-time recovery: git holds the content, but review status, source verification and the review log live only in the database, so export them or upgrade before relying on them.

### Alternatives

Fly.io or Railway can run the `Dockerfile` with no code change (the app builds a Node server when `VERCEL` is unset). The image has never been built (no Docker daemon was available), so expect to fix something on first build. Requires `DATABASE_URL`, `ADMIN_TOKEN`, and `ALLOWED_HOST=<your domain>` as a build argument.

## 12. Gotchas we hit

Each of these cost time. Do not rediscover them.

1. **PGlite and `undefined`.** `new PGlite(undefined, { extensions })` silently drops the extensions in this version, so `CREATE EXTENSION pg_trgm` fails with "not available". For in-memory use pass only the options object. (Handled in `db/client.ts`.)
2. **Astro's CSRF check is browser-oriented.** It trusts `Sec-Fetch-Site`, falls back to comparing `Origin`, and lets requests that send neither through. A scripted POST with no headers works; one with a wrong `Origin` gets 403. Test cross-site behaviour with `sec-fetch-site: cross-site`, not by omitting headers. The admin cookie is also `SameSite=Strict`.
3. **`Astro.clientAddress` throws on the Vercel adapter.** Admin login would have returned a 500 in production. `app/src/lib/auth.ts` reads it with a fallback to Vercel's `x-real-ip` / `x-forwarded-for` (only trusted when the socket address is unavailable, because a directly exposed server can have those headers forged). Found only by running the built Vercel function.
4. **Postgres rejects NUL bytes**, and rejects numbers that overflow the column type. Both caused 500s from URLs like `?q=%00` or `?time=9e99`. Handled centrally (middleware 400s a NUL; `clampInt` in `db/queries.ts`).
5. **`db.execute()` returns different shapes** on postgres-js (an array) and PGlite (`{ rows }`). Use `rowsOf()` from `db/queries.ts`.
6. **Pooled connection strings need `prepare: false`** in postgres-js (already set), and serverless instances should hold one connection each (`DB_POOL_MAX`, default 1 on Vercel).
7. **Vercel traces files statically.** A normal `import('@electric-sql/pglite')` pulled 24 files (about 16 MB) of embedded database into the function. `db/client.ts` loads it through a variable module name so it is never traced, and CI asserts it is absent. The adapter's `excludeFiles` only matches exact files, not folders.
8. **Vercel wants its output at the repo root, the app is in `app/`.** `scripts/place-vercel-output.mjs` moves `app/.vercel/output` to `.vercel/output`; `vercel.json` runs it through `npm run app:vercel-build`.
9. **Wikipedia returns 429** if you check many URLs quickly. Space requests out and retry. Some page titles that look right 404 (use the cuisine article instead of guessing).
10. **Ids must be globally unique across a collection.** Two parallel writers both created a region called `west-coast` (US and New Zealand); the merge silently kept the first and the validator caught the dangling reference. Prefix generic region and dish ids. Ingredient definitions collided on display name and category; `merge_collections.py` keeps the first and prints the rest, so read its output.
11. **Diet tags are validated against ingredient `category` and `allergens`.** Give new ingredients the correct values or the check passes vacuously (for example `coconut-milk` is categorised as `fruit`, matching `coconut`).
12. **The static site's trailing-slash and base-path settings differ from the app's** (`always` with `/for-the-love-of-food`, versus `never` at the root). Do not copy links between them blindly.
13. **The static dishes page renders every dish into one HTML page.** Fine at 300; it will get heavy past roughly a thousand. This is the main reason the app exists.
14. **Parallel AI writers sharing a scratch folder overwrote each other's helper files.** If you repeat the parallel approach, give every writer its own working directory outside the repo, and tell them so.
15. **In the original sandbox, `pkill -f <pattern>` killed the shell that ran it** when the pattern appeared in the command line. Use `fuser -k <port>/tcp` instead. (Only relevant if you work in a similar environment.)

## 13. Open issues and known gaps

Content:
- **Nothing is human-reviewed.** See [docs/review-queue.md](docs/review-queue.md).
- Tonga has 8 dishes; Colombia has no Amazon region; Chile's northern region has no dish; China has no Hunan, Fujian or Jiangsu dish; several regions have no dish assigned (Epirus, central Cuba, Kingston, Amhara, Oromia, northern and southern Morocco). India has 9 regions and Italy 8, above the 3 to 5 the brief asked for.
- Festival-to-dish links are the weakest data: many are loose associations (the link notes say "not exclusive to"). Five festivals have only one linked dish.
- No fermented dish for Thailand, Jamaica, Cuba, Fiji, Samoa or Tonga.
- No images. No translations (local dish names are stored; the site is English only).
- Recipes are one per dish, written for home cooks, **never cooked or tested**. Quantities and timings are plausible, not proven.

Product and engineering:
- **No `LICENSE` file.** Recipe records default to the text "CC-BY-4.0 (original text)" and the content brief says all text is original, but nobody has chosen a licence for the repository or the content. Decide before inviting contributors or reuse. Source notes mark Wikipedia as CC BY-SA ("cite, do not copy text"); the writers were told not to copy.
- **Public pages show drafts** (see section 9).
- **Admin is one shared secret.** No per-user accounts, no roles. The login throttle is 10 attempts per 10 minutes per client address, stored in the database.
- **No Content-Security-Policy header.** No row-level security (not needed unless a browser talks to Supabase directly, which this app does not).
- **Review screen covers dishes only.**
- **No source link checker.** `sources.last_http_status` and `last_probed_at` columns exist but nothing fills them.
- **The `Dockerfile` has never been built.** **The Vercel deployment has never run on Vercel.**
- **Spice library is empty** apart from placeholders.
- No lint, format or type-check step; browser tests not in CI.
- `npm audit` reports a moderate issue in a dev dependency of `drizzle-kit` (an old `esbuild` dev server). Dev-only; not shipped.
- The original `docs/research.md` is a first pass written from memory; its licensing table (TheMealDB, Open Food Facts and so on) is unverified and no external dataset was used.
- Server-side the app caches nothing itself; if traffic grows, the 5-minute CDN cache is what protects the database.

## 14. Suggested next steps, in order

1. **Finish the deployment** (section 11). Verify `/healthz`, the filters, a spice page, and the admin sign-in on the real URL. Fix whatever the first real deploy reveals and update `docs/deploy-vercel.md`.
2. **Choose a licence** and add `LICENSE` (and a content licence note).
3. **Review the food-safety items first** in `docs/review-queue.md` (curing salt in `montreal-smoked-meat`, fermentation and curing timings, cooking temperatures), then the flagged facts, region by region. Verify sources in `/admin`, publish what passes.
4. **Hide unreviewed content from the public** (or label it more strongly): pass `statuses: ['reviewed','published']` from the pages into `searchDishes` and the detail pages, behind an environment variable so you can flip it as review progresses.
5. **Decide the fate of the static site.** If the app is live and stable, remove it (and the Pages workflow) to avoid maintaining two front ends; otherwise keep it as a fallback and point both at the same content.
6. **Spice library content.** Write `content/spices.json` for the 68 placeholder spices (start with the most-used: cumin, turmeric, chilli, coriander, cardamom, cinnamon, saffron), then blends (garam masala, ras el hanout, five-spice, za'atar, berbere). Source every claim.
7. **Add a linter/formatter, `astro check` for types, and put the browser suite in CI** (add `@playwright/test`).
8. **Fill content gaps** listed in section 13, with sourced, non-invented dishes.
9. **A source link checker** (a scheduled workflow that fills `last_http_status`) so dead links are found automatically.
10. **Review screens for the other record types**, and per-reviewer accounts (Supabase Auth or similar) if more than a couple of people review.
11. **Scale to the target of about 2,000 dishes.** The owner expects that volume. Before bulk-generating, add: duplicate detection across dishes, an automated "does the source mention the dish" check, and a stricter pipeline than the first run (the first run's quality depended on each writer's self-reporting). Keep the review queue, not the writing, as the bottleneck you manage.
12. Images (with licensing), a sitemap, and basic analytics, if wanted.

## 15. History and decisions

How the project came to be, in order, so the commit history makes sense:

1. **Research.** Scope: countries and regions where cuisine varies, recipes, dish stories, food festivals, dishes grouped by festival, and filtering by country, ingredient, flavour and dish type. Decisions made with the owner: audience is home cooks, travellers and culture readers together; content is AI-drafted and human-reviewed; static site first; English only with local names stored; read-only with favourites saved in the browser. (`5074702`)
2. **Schemas and a seed slice** of 3 countries and 15 dishes, plus the validator. (`6caaaa1`)
3. **Static Astro site** with filters, deployed to GitHub Pages. First deploy failed because Pages had to be enabled by hand (source: GitHub Actions); the workflow cannot enable it itself. (`03ceb80`)
4. **Content expansion** to 30 countries by 12 parallel writers, then merged. (`47e3557`, `33a8b63`)
5. **Postgres schema, importer and the spice-library model**, tested on embedded Postgres. The owner said they expect about 2,000 dishes and want to add a spice library. (`57c3ea3`)
6. **The database-backed app**, with the reviewer screen; 31 HTTP tests plus a browser suite, run on embedded and real Postgres. Security testing found and fixed: 500s on huge numbers and NUL bytes, and a missing-headers redirect. (`e1c86de`)
7. **Vercel readiness.** The owner chose Vercel after comparing it with Fly.io and Railway. Running the built function locally found the `clientAddress` bug. (`f316db5`)
8. **Content brief** saved into the repo. (`1cb9b0d`)
9. **This handover note.**

Cost thinking recorded with the owner (prices from third-party summaries, not verified against official pages, so check): Supabase free tier $0 (pauses when idle) or Pro about $25 a month; Vercel Hobby free but non-commercial, Pro $20 per user per month; Fly.io about $2 to $4 a month for a small machine but no free tier, managed Postgres from $38; Railway $5 a month including usage credit. A domain is roughly $10 to $15 a year.

A second project (a separate "Story of Art" app, run from another session by the same owner) asked for this same stack. It was given a read-only description; no code is shared.

## 16. Access and accounts

- **GitHub:** the repository is public, in the `rnp-musings` organisation. The Claude GitHub App is installed on it (pushes from the AI session needed this). GitHub Pages is enabled with source "GitHub Actions".
- **Vercel:** the owner created an account and granted it access to the repository. Nothing is deployed from it yet.
- **Hosted database:** none yet.
- **GitHub secrets needed:** `DATABASE_URL_ADMIN` (for the Sync database workflow). Nothing else.
- **No secrets are stored in the repository.** `ADMIN_TOKEN` and `DATABASE_URL` belong in Vercel's environment settings only. The token `test-admin-token-1234` that appears in tests is a throw-away test value.
- Commits made by the AI session carry a `Co-Authored-By` trailer. Everything was committed straight to `main`; now that CI exists, working through pull requests is a better habit.
