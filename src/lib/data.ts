// Loads the JSON content and builds lookups used by every page.
// Content is validated separately by scripts/validate.py.
const flat = (mods: Record<string, any>) => Object.values(mods).flatMap((m: any) => m.default);

import countriesJson from '../../content/countries.json';
import regionsJson from '../../content/regions.json';
import ingredientsJson from '../../content/ingredients.json';
import festivalsJson from '../../content/festivals.json';
import festivalDishesJson from '../../content/festival-dishes.json';
import sourcesJson from '../../content/sources.json';

const dishMods = import.meta.glob('../../content/dishes/*.json', { eager: true });
const recipeMods = import.meta.glob('../../content/recipes/*.json', { eager: true });

export const countries: any[] = countriesJson;
export const regions: any[] = regionsJson;
export const ingredients: any[] = ingredientsJson;
export const festivals: any[] = festivalsJson;
export const festivalDishes: any[] = festivalDishesJson;
export const sources: any[] = sourcesJson;
export const rawDishes: any[] = flat(dishMods);
export const recipes: any[] = flat(recipeMods);

const by = (list: any[]) => Object.fromEntries(list.map((x) => [x.id, x]));
export const countryById = by(countries);
export const regionById = by(regions);
export const ingredientById = by(ingredients);
export const festivalById = by(festivals);
export const sourceById = by(sources);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const label = (s: string) =>
  s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Dishes enriched with recipes, ingredient ids, festivals, quickest active time. */
export const dishes = rawDishes
  .map((d) => {
    const rs = recipes.filter((r) => r.dish === d.id);
    const ingredientIds = [...new Set(rs.flatMap((r) => r.ingredients.map((i: any) => i.ingredient)))];
    const fests = festivalDishes
      .filter((fd) => fd.dish === d.id)
      .map((fd) => ({ ...fd, festival: festivalById[fd.festival] }));
    const activeTimes = rs.map((r) => r.prep_minutes + r.cook_minutes);
    return {
      ...d,
      countryName: countryById[d.country]?.name,
      regionName: d.region ? regionById[d.region]?.name : undefined,
      recipes: rs,
      ingredientIds,
      festivals: fests,
      months: [...new Set(fests.flatMap((f: any) => f.festival.months))],
      activeMinutes: activeTimes.length ? Math.min(...activeTimes) : null,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const dishById = by(dishes);

/** Facet values that actually occur in the data, so filters never offer empty choices. */
export const uniq = (xs: string[]) => [...new Set(xs)].sort();
