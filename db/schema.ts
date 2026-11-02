/**
 * Postgres schema (Drizzle) for For the Love of Food.
 *
 * Source of truth for content is the JSON in /content (reviewed through git).
 * This schema mirrors those records one to one, adds the spice library
 * (spices, blends, substitutes, origins) and a review log for the
 * draft -> reviewed -> published workflow.
 *
 * Primary keys are the same kebab-case slugs used in the JSON, so records can be
 * re-imported idempotently and URLs stay stable.
 */
import { sql } from 'drizzle-orm';
import {
  boolean, customType, index, integer, jsonb, numeric, pgEnum, pgTable, pgView, primaryKey,
  serial, smallint, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------- enums
export const reviewStatus = pgEnum('review_status', ['draft', 'reviewed', 'published']);
export const continent = pgEnum('continent', ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania']);
export const dishType = pgEnum('dish_type', ['soup', 'stew', 'curry', 'salad', 'bread', 'rice-dish', 'pasta-noodle', 'dumpling', 'grill-bbq', 'street-food', 'dessert', 'drink', 'pickle-ferment', 'sauce', 'snack', 'pastry', 'fish-dish', 'meat-dish', 'other']);
export const course = pgEnum('course', ['breakfast', 'starter', 'main', 'side', 'dessert', 'snack', 'drink']);
export const flavour = pgEnum('flavour', ['sweet', 'sour', 'salty', 'bitter', 'umami', 'spicy', 'smoky', 'tangy', 'aromatic', 'rich']);
export const diet = pgEnum('diet', ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free']);
export const cookMethod = pgEnum('cook_method', ['fried', 'deep-fried', 'steamed', 'baked', 'grilled', 'raw', 'fermented', 'slow-cooked', 'simmered', 'sauteed', 'roasted', 'boiled']);
export const claimConfidence = pgEnum('claim_confidence', ['well-documented', 'widely-told', 'disputed', 'legend']);
export const difficulty = pgEnum('difficulty', ['easy', 'medium', 'hard']);
export const recipeVersion = pgEnum('recipe_version', ['traditional', 'home', 'quick']);
export const unit = pgEnum('unit', ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'clove', 'pinch', 'bunch', 'to-taste']);
export const ingredientCategory = pgEnum('ingredient_category', ['meat', 'poultry', 'fish-seafood', 'dairy', 'egg', 'grain-flour', 'legume', 'vegetable', 'fruit', 'herb-spice', 'fat-oil', 'sweetener', 'nut-seed', 'condiment', 'alcohol', 'other']);
export const allergen = pgEnum('allergen', ['gluten', 'dairy', 'egg', 'fish', 'shellfish', 'peanut', 'tree-nut', 'sesame', 'soy', 'mustard', 'sulphites']);
export const festivalType = pgEnum('festival_type', ['harvest', 'religious', 'beverage', 'street-food', 'seasonal', 'commemorative', 'national']);
export const festivalDishRole = pgEnum('festival_dish_role', ['traditional', 'signature', 'seasonal', 'offering']);
export const sourceType = pgEnum('source_type', ['encyclopedia', 'unesco', 'academic', 'book', 'news', 'official', 'other']);
// Spice library
export const spicePart = pgEnum('spice_part', ['seed', 'bark', 'root', 'rhizome', 'fruit', 'berry', 'pod', 'flower', 'stigma', 'bud', 'leaf', 'resin', 'aril', 'mixed', 'other']);
export const originRole = pgEnum('origin_role', ['native', 'major-producer', 'historic-trade']);
export const entityType = pgEnum('entity_type', ['country', 'region', 'dish', 'recipe', 'festival', 'spice', 'blend']);

// ---------------------------------------------------------------- helpers
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const audit = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const status = () => reviewStatus('review_status').notNull().default('draft');

// ---------------------------------------------------------------- sources
export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  type: sourceType('type').notNull(),
  licenceNote: text('licence_note'),
  /** True once a person opened the URL and confirmed it supports the claim. */
  checked: boolean('checked').notNull().default(false),
  checkedBy: text('checked_by'),
  checkedAt: timestamp('checked_at', { withTimezone: true }),
  /** Filled by the periodic link checker (HTTP status of the last probe). */
  lastHttpStatus: smallint('last_http_status'),
  lastProbedAt: timestamp('last_probed_at', { withTimezone: true }),
  ...audit,
}, (t) => [uniqueIndex('sources_url_idx').on(t.url)]);

// ---------------------------------------------------------------- places
export const countries = pgTable('countries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  localName: text('local_name'),
  iso2: text('iso2').notNull().unique(),
  continent: continent('continent').notNull(),
  summary: text('summary').notNull(),
  regionalVariation: text('regional_variation').notNull(),
  reviewStatus: status(),
  ...audit,
}, (t) => [index('countries_continent_idx').on(t.continent)]);

export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  countryId: text('country_id').notNull().references(() => countries.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  localName: text('local_name'),
  summary: text('summary').notNull(),
  reviewStatus: status(),
  ...audit,
}, (t) => [index('regions_country_idx').on(t.countryId)]);

// ---------------------------------------------------------------- ingredients (and spices)
export const ingredients = pgTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: ingredientCategory('category').notNull(),
  allergens: allergen('allergens').array().notNull().default(sql`'{}'`),
  ...audit,
}, (t) => [index('ingredients_category_idx').on(t.category)]);

/** Alternative names (aubergine = eggplant). Searched alongside the name. */
export const ingredientAliases = pgTable('ingredient_aliases', {
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
}, (t) => [primaryKey({ columns: [t.ingredientId, t.alias] })]);

export const regionSignatureIngredients = pgTable('region_signature_ingredients', {
  regionId: text('region_id').notNull().references(() => regions.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'restrict' }),
}, (t) => [primaryKey({ columns: [t.regionId, t.ingredientId] })]);

// ---------------------------------------------------------------- spice library
/**
 * A spice is an ingredient (category herb-spice) with an optional profile.
 * Sharing the primary key with `ingredients` means a recipe line that uses
 * cumin already points at the spice, so "dishes that use X" needs no extra mapping.
 */
export const spices = pgTable('spices', {
  ingredientId: text('ingredient_id').primaryKey().references(() => ingredients.id, { onDelete: 'cascade' }),
  scientificName: text('scientific_name'),
  partUsed: spicePart('part_used'),
  /** 0 (none) to 5 (very hot): the same scale as dishes. */
  heatLevel: smallint('heat_level'),
  /** Scoville heat units, for chillies where a figure is documented. */
  heatShu: integer('heat_shu'),
  flavourNotes: flavour('flavour_notes').array().notNull().default(sql`'{}'`),
  aroma: text('aroma'),
  historyMd: text('history_md'),
  storage: text('storage'),
  buyingTips: text('buying_tips'),
  reviewStatus: status(),
  ...audit,
});

export const spiceSubstitutes = pgTable('spice_substitutes', {
  spiceId: text('spice_id').notNull().references(() => spices.ingredientId, { onDelete: 'cascade' }),
  substituteId: text('substitute_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  note: text('note'),
}, (t) => [primaryKey({ columns: [t.spiceId, t.substituteId] })]);

export const spiceOrigins = pgTable('spice_origins', {
  spiceId: text('spice_id').notNull().references(() => spices.ingredientId, { onDelete: 'cascade' }),
  countryId: text('country_id').notNull().references(() => countries.id, { onDelete: 'cascade' }),
  role: originRole('role').notNull(),
}, (t) => [primaryKey({ columns: [t.spiceId, t.countryId, t.role] })]);

/** Spice blends such as garam masala or ras el hanout. */
export const blends = pgTable('blends', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  localName: text('local_name'),
  countryId: text('country_id').references(() => countries.id, { onDelete: 'set null' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  summary: text('summary').notNull(),
  historyMd: text('history_md'),
  reviewStatus: status(),
  ...audit,
});

export const blendComponents = pgTable('blend_components', {
  blendId: text('blend_id').notNull().references(() => blends.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'restrict' }),
  /** Free text because blends vary by cook: "dominant", "1 part", "a pinch". */
  proportionNote: text('proportion_note'),
  optional: boolean('optional').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.blendId, t.ingredientId] })]);

// ---------------------------------------------------------------- dishes
export const dishes = pgTable('dishes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  localName: text('local_name'),
  countryId: text('country_id').notNull().references(() => countries.id, { onDelete: 'restrict' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  type: dishType('type').notNull(),
  course: course('course').array().notNull(),
  flavours: flavour('flavours').array().notNull(),
  diet: diet('diet').array().notNull().default(sql`'{}'`),
  cookMethods: cookMethod('cook_methods').array().notNull(),
  spiceLevel: smallint('spice_level').notNull(),
  summary: text('summary').notNull(),
  storyMd: text('story_md').notNull(),
  originPeriod: text('origin_period'),
  image: text('image'),
  reviewStatus: status(),
  /** Generated full-text document: name, local name and summary. Ingredient names are searched via the view below. */
  searchDoc: tsvector('search_doc').generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(local_name,'') || ' ' || coalesce(summary,''))`,
  ),
  ...audit,
}, (t) => [
  index('dishes_country_idx').on(t.countryId),
  index('dishes_region_idx').on(t.regionId),
  index('dishes_type_idx').on(t.type),
  index('dishes_status_idx').on(t.reviewStatus),
  // GIN indexes make the array filters (flavour, diet, course) and text search fast.
  index('dishes_flavours_gin').using('gin', t.flavours),
  index('dishes_diet_gin').using('gin', t.diet),
  index('dishes_course_gin').using('gin', t.course),
  index('dishes_search_gin').using('gin', t.searchDoc),
]);

export const dishOriginClaims = pgTable('dish_origin_claims', {
  id: serial('id').primaryKey(),
  dishId: text('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  claim: text('claim').notNull(),
  confidence: claimConfidence('confidence').notNull(),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
}, (t) => [index('origin_claims_dish_idx').on(t.dishId)]);

// ---------------------------------------------------------------- recipes
export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  dishId: text('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  version: recipeVersion('version').notNull().default('home'),
  servings: smallint('servings').notNull(),
  prepMinutes: integer('prep_minutes').notNull(),
  cookMinutes: integer('cook_minutes').notNull(),
  passiveMinutes: integer('passive_minutes').notNull().default(0),
  difficulty: difficulty('difficulty').notNull(),
  steps: text('steps').array().notNull(),
  notes: text('notes'),
  licence: text('licence').notNull().default('CC-BY-4.0 (original text)'),
  reviewStatus: status(),
  ...audit,
}, (t) => [index('recipes_dish_idx').on(t.dishId)]);

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'restrict' }),
  /** Null when unit = to-taste. */
  amount: numeric('amount', { precision: 10, scale: 3 }),
  unit: unit('unit').notNull(),
  note: text('note'),
  optional: boolean('optional').notNull().default(false),
  groupName: text('group_name'),
}, (t) => [
  index('recipe_ingredients_recipe_idx').on(t.recipeId),
  index('recipe_ingredients_ingredient_idx').on(t.ingredientId),
]);

// ---------------------------------------------------------------- festivals
export const festivals = pgTable('festivals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  localName: text('local_name'),
  type: festivalType('type').notNull(),
  timing: text('timing').notNull(),
  /** Months it can fall in (1-12), for the month filter. */
  months: smallint('months').array().notNull(),
  duration: text('duration'),
  summary: text('summary').notNull(),
  storyMd: text('story_md').notNull(),
  foodTraditionsMd: text('food_traditions_md'),
  reviewStatus: status(),
  ...audit,
}, (t) => [index('festivals_months_gin').using('gin', t.months)]);

export const festivalCountries = pgTable('festival_countries', {
  festivalId: text('festival_id').notNull().references(() => festivals.id, { onDelete: 'cascade' }),
  countryId: text('country_id').notNull().references(() => countries.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.festivalId, t.countryId] })]);

export const festivalRegions = pgTable('festival_regions', {
  festivalId: text('festival_id').notNull().references(() => festivals.id, { onDelete: 'cascade' }),
  regionId: text('region_id').notNull().references(() => regions.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.festivalId, t.regionId] })]);

export const festivalDishes = pgTable('festival_dishes', {
  festivalId: text('festival_id').notNull().references(() => festivals.id, { onDelete: 'cascade' }),
  dishId: text('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  role: festivalDishRole('role').notNull(),
  note: text('note'),
}, (t) => [primaryKey({ columns: [t.festivalId, t.dishId] }), index('festival_dishes_dish_idx').on(t.dishId)]);

// ---------------------------------------------------------------- source links
const sourceLink = (name: string, owner: string, ref: () => any) =>
  pgTable(name, {
    ownerId: text(owner).notNull().references(ref, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  }, (t) => [primaryKey({ columns: [t.ownerId, t.sourceId] })]);

export const countrySources = sourceLink('country_sources', 'country_id', () => countries.id);
export const regionSources = sourceLink('region_sources', 'region_id', () => regions.id);
export const dishSources = sourceLink('dish_sources', 'dish_id', () => dishes.id);
export const recipeSources = sourceLink('recipe_sources', 'recipe_id', () => recipes.id);
export const festivalSources = sourceLink('festival_sources', 'festival_id', () => festivals.id);
export const spiceSources = sourceLink('spice_sources', 'spice_id', () => spices.ingredientId);
export const blendSources = sourceLink('blend_sources', 'blend_id', () => blends.id);

// ---------------------------------------------------------------- review workflow
/** Append-only log of status changes: who moved what from draft to reviewed or published, and why. */
export const reviewLog = pgTable('review_log', {
  id: serial('id').primaryKey(),
  entityType: entityType('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fromStatus: reviewStatus('from_status'),
  toStatus: reviewStatus('to_status').notNull(),
  reviewer: text('reviewer').notNull(),
  note: text('note'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** Free-form evidence: which sources were opened, what was corrected. */
  details: jsonb('details'),
}, (t) => [index('review_log_entity_idx').on(t.entityType, t.entityId)]);

// ---------------------------------------------------------------- views
/**
 * One row per (dish, ingredient) across all of a dish's recipes. This is what
 * the "includes / excludes ingredient" and "uses spice" filters query.
 */
export const dishIngredients = pgView('dish_ingredients', {
  dishId: text('dish_id').notNull(),
  ingredientId: text('ingredient_id').notNull(),
}).as(sql`
  select distinct r.dish_id as dish_id, ri.ingredient_id as ingredient_id
  from recipes r join recipe_ingredients ri on ri.recipe_id = r.id
`);
