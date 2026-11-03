# Content brief (rules for writing dishes, recipes, regions and festivals)

This is the brief that was given to the AI writers who produced the first 298 dishes. It is kept here so anyone adding content, human or AI, follows the same rules. Read it together with [the README](../README.md#6-how-to-add-or-change-content) and [review-queue.md](review-queue.md).

How it was used: twelve writers worked in parallel, each in a private copy of the repo (`content/` and `schemas/` and `scripts/`), each writing only new files named after its group (for example `content/regions/asia-a.json`) plus its own countries' dish and recipe files. The group files were then copied into the main repo and folded together with `python3 scripts/merge_collections.py`, then `python3 scripts/validate.py` was run on the result. Two things went wrong that way and are worth remembering: two groups invented the same region id (`west-coast`), and several groups defined the same ingredient with slightly different display names (the merge keeps the first and reports the rest). Give region and dish ids a country or cuisine prefix whenever the name is generic.

If you are adding content directly to the main repo rather than in a separate copy, ignore the paragraphs about workspaces and group file names: edit the collection files directly (see the README).

---

# Content brief: For the Love of Food

You are writing seed content for a world-cuisine atlas. (When this brief was used for parallel writers, each had a private workspace copy of the repo and worked only inside it.)

## What to produce

For each assigned country:
- **10 dishes** (for countries marked "+N", add N more to the existing dishes, so the country reaches 10 in total). Pick dishes that are well documented, genuinely representative, and spread across regions, courses and types (not ten desserts). Include at least one street food or snack, one vegetarian dish, and where the cuisine has them, one fermented/preserved item and one festival dish.
- **A recipe for every dish** (one recipe each, original wording, metric quantities, realistic home-cook method).
- **3 to 5 regions** per country where cuisine really differs, each with a summary and signature ingredients. Dishes should name their `region` where it is clear. Leave `region` out for pan-national dishes.
- **1 to 2 festivals** per country (food-relevant), each linked to dishes through festival-dish records (2 or more dishes per festival where honest). Dishes eaten at several festivals can have several links.
- **Countries**: one record per new country.

## Files to write (new files only, named by your group)

Use your group name as the file name, e.g. group `asia-a`:

| Path | Content |
|---|---|
| `content/countries/<group>.json` | NEW country records only |
| `content/regions/<group>.json` | regions for your countries |
| `content/ingredients/<group>.json` | ONLY ingredients not already in `content/ingredients.json` |
| `content/festivals/<group>.json` | festivals |
| `content/festival-dishes/<group>.json` | dish-to-festival links |
| `content/sources/<group>.json` | ONLY sources not already in `content/sources.json` |
| `content/dishes/<country-id>.json` | dishes for that country (for an existing country, ADD to the existing file, keeping existing records unchanged) |
| `content/recipes/<country-id>.json` | recipes for that country (same rule) |

Files are JSON arrays. Read `schemas/*.schema.json` first, then read the existing records in `content/` to copy the style, depth and tone (see `content/dishes/india.json`, `content/recipes/india.json`, `content/regions.json`, `content/festivals.json`). Match them.

IDs: lowercase kebab-case slugs. Dish ids are globally unique. Recipe ids are `<dish-id>-home` (or `-traditional`/`-quick`). Country ids are the English name in kebab-case (`south-africa`). Reuse existing ingredient ids wherever one fits (check `content/ingredients.json` first, including aliases) rather than inventing near-duplicates (`garlic`, not `garlic-cloves`).

## Accuracy rules (important)

This is factual content that real people will read. Do not invent.
- Only include dishes you are confident exist and are genuinely part of that cuisine. If you cannot reach the target number of well-documented dishes for a country, stop short and say so in your final report. A shortfall is better than invented dishes.
- Write history from solid knowledge. Where origin is uncertain or contested, say so, and record it in `origin_claims` with an honest `confidence` (`well-documented`, `widely-told`, `disputed`, `legend`). Never present a legend as fact. Avoid precise dates, names and numbers unless you are sure; prefer "19th century" to a made-up year.
- Do not claim a dish is "the national dish" unless that is widely accepted.
- Be respectful with religious, indigenous and colonial history; keep it neutral and factual.
- All prose is your own wording. Never copy or closely paraphrase source text.
- Recipes must be coherent and cookable: sensible quantities, times and temperatures. Do not omit key steps. Use `amount: null, unit: "to-taste"` only for salt/pepper-like items.
- `diet` tags: only tag what is true of the recipe as written (the validator checks vegetarian/vegan/gluten-free/dairy-free/egg-free/nut-free against ingredient categories and allergens, so give every ingredient the right category and allergens). When unsure, leave the tag off.
- Every record gets `"review_status": "draft"`.

## Sources

Every dish needs at least one source id in `sources`. Use general references: the Wikipedia article for the dish or cuisine, UNESCO Intangible Heritage entries, or official tourism/government pages. A new source record needs `id`, `title`, `url`, `type`, `licence_note` (for Wikipedia: `"CC BY-SA: cite, do not copy text."`) and `"checked": false`.

You MUST verify each NEW url with curl before using it, e.g. `curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 URL`. It must return 200. Wikipedia sometimes returns 429 when hit quickly: wait a few seconds and retry; space your requests out. If a page does not exist (404), find the right page title or use the country's cuisine article instead. Do not put an unverified URL in a source record. Reuse existing source ids where they already cover the topic.

## Validation

From your workspace root run `python3 scripts/validate.py`. It checks schemas, cross-references (regions, ingredients, sources, festivals), that each dish has a recipe, and diet tags. Fix every error. Your final state must print `OK`. (Run `pip install jsonschema` if it is missing.)

Build files incrementally: write one country at a time, validate, then continue. Do not leave half-finished files.

## Final report (keep it short)

Reply with: the countries done and dish counts; any shortfall and why; any facts you are less sure of (list dish ids) so a human reviewer can check them first; and the list of new files you wrote. Do not paste the content back.
