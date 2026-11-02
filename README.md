# For the Love of Food

A read-only, filterable atlas of world cuisine: regional food by country, recipes, the stories behind dishes, food festivals, and the dishes eaten at each festival.

Status: early seed collection, live at https://rnp-musings.github.io/for-the-love-of-food/ once GitHub Pages is enabled. See [docs/research.md](docs/research.md) for scope and decisions.

## Layout

| Path | Contents |
|---|---|
| `schemas/` | JSON Schemas for every record type |
| `content/countries.json`, `regions.json` | Places |
| `content/dishes/<country>.json` | Dishes with story, tags and cited origin claims |
| `content/recipes/<country>.json` | One or more recipes per dish |
| `content/ingredients.json` | Controlled ingredient list with aliases and allergens |
| `content/festivals.json`, `festival-dishes.json` | Festivals and the dish-to-festival links |
| `content/sources.json` | Every source cited by other records |
| `scripts/validate.py` | Schema, cross-reference and diet-tag checks |
| `src/` | Astro pages, components and the favourites script |
| `app/` | Database-backed app (Astro server rendering + Postgres) |
| `db/` | Schema, migrations, importer, queries |
| `.github/workflows/deploy.yml` | Validates content, builds and deploys the static site to GitHub Pages |
| `.github/workflows/ci.yml` | Validates, builds both sites, runs the database and app tests |
| `Dockerfile` | Production image for the app |

## Two sites

- **Static site** (repo root, `src/`): reads `/content` at build time and deploys to GitHub Pages.
- **App** (`app/`): the database-backed version with server-side filters, the spice library and a reviewer screen. See [app/README.md](app/README.md).

## Run the static site

```bash
npm install
npm run dev      # http://localhost:4321/for-the-love-of-food/
npm run build    # static output in dist/
```

The site is static Astro. Filtering runs in the browser, and favourites are kept in the visitor's own browser (localStorage). Filters are mirrored in the URL so a filtered view can be shared.

## Validate content

```bash
pip install jsonschema
python3 scripts/validate.py
```

## Content rules

- All story and recipe text is original. Sources are cited, never copied.
- Every record starts as `review_status: "draft"` and needs human review before it is published.
- A source's `checked` flag stays `false` until a person has opened the URL and confirmed it supports the claim.
- Contested origins go in `origin_claims` with a confidence level, never stated as fact.
- Diet tags are checked against recipe ingredients by the validator.

## Seed slice

30 countries (five per continent, Tonga at 8 dishes), 136 regions, 298 dishes each with a recipe, and 53 festivals. All of it is AI-drafted and unreviewed: see [docs/review-queue.md](docs/review-queue.md).
