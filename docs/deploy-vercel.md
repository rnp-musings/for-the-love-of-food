# Deploying the app on Vercel

The app lives in `app/` and builds for Vercel when the `VERCEL` environment variable is set (Vercel sets it itself). `vercel.json` tells Vercel how: `npm ci`, then `npm run app:vercel-build`, which builds the app and moves the output to where Vercel looks for it. The static GitHub Pages site is unaffected.

## One-time setup

### 1. Create the database (Supabase shown; Neon works the same way)

1. New project. Choose a region near where the Vercel functions will run (Vercel's default is Washington DC, `iad1`; change it under Project Settings, Functions, if your database is elsewhere).
2. Open **Connect** and copy two connection strings. Replace `[YOUR-PASSWORD]` in each:
   - **Transaction pooler** (port 6543): for the app on Vercel. Many short-lived functions share a small pool.
   - **Session pooler** (port 5432 on the pooler host): for migrations and imports from GitHub Actions. Supabase's direct connection is IPv6-only, which GitHub's runners do not support.
   - Neon: use the *pooled* URL for the app and the *direct* URL for migrations.
3. `pg_trgm` is created by the first migration; no action needed.

### 2. Put the content in the database

In the GitHub repository: **Settings, Secrets and variables, Actions, New repository secret**:

| Name | Value |
|---|---|
| `DATABASE_URL_ADMIN` | the *session pooler* string |

Then **Actions, Sync database, Run workflow**. It validates the content, applies migrations and imports everything. After that it runs on its own whenever `content/` or `db/` changes on `main`.

(To do it from your own computer instead: `DATABASE_URL='...' npx tsx db/migrate.ts && DATABASE_URL='...' npx tsx db/import.ts`.)

### 3. Create the Vercel project

1. **Add New, Project**, import `rnp-musings/for-the-love-of-food`.
2. Leave **Root Directory** as `./` and the framework as **Other**. The settings come from `vercel.json`.
3. Add **Environment Variables**:

   | Name | Value | Environments |
   |---|---|---|
   | `DATABASE_URL` | the *transaction pooler* string | Production, Preview |
   | `ADMIN_TOKEN` | a random string of 32 or more characters | **Production only** |

   Leaving `ADMIN_TOKEN` out of Preview means preview deployments have no admin area, so nobody can change review state from a pull-request preview.
4. Deploy. Check `https://<your-project>.vercel.app/healthz` returns `ok`.
5. Optional: attach your own domain under Settings, Domains.

Generate a token with: `openssl rand -base64 36`

## Day to day

- Push to `main` and Vercel builds a production deployment. Pull requests get preview URLs.
- Content changes (JSON in `content/`) reach the database through the *Sync database* workflow; the site shows them within about five minutes (pages are cached at the edge for 5 minutes).
- Reviewers sign in at `/admin` with the token and their name. Status changes live in the database and survive content re-imports.

## Things to know

- **Hobby plan is non-commercial.** If the site will carry ads, affiliate links or sell anything, use Pro.
- **Cold starts.** The first request after a quiet period takes a little longer while the function and its database connection start.
- **Login throttling** is stored in the database (`login_attempts`), so it holds across all function instances.
- **Admin cookie** is an HMAC of your token. Changing `ADMIN_TOKEN` signs everyone out.
- **Backups.** Supabase's free plan has no point-in-time recovery. The content itself is safe in git; what is only in the database is review status, source verification and the review log. Export those periodically or upgrade the plan before relying on them.
- The embedded demo database is not used on Vercel. Without `DATABASE_URL` the app returns a 503 from `/healthz` with a clear message in the function logs.

## Testing the Vercel build without a Vercel account

```bash
VERCEL=1 npm run app:vercel-build
DATABASE_URL=postgres://... VERCEL=1 ADMIN_TOKEN=... node app/test/vercel-harness.mjs "$PWD/.vercel/output/functions/_render.func/app/dist/server/entry.mjs"
# then browse http://127.0.0.1:4331
```
