CREATE TYPE "public"."allergen" AS ENUM('gluten', 'dairy', 'egg', 'fish', 'shellfish', 'peanut', 'tree-nut', 'sesame', 'soy', 'mustard', 'sulphites');--> statement-breakpoint
CREATE TYPE "public"."claim_confidence" AS ENUM('well-documented', 'widely-told', 'disputed', 'legend');--> statement-breakpoint
CREATE TYPE "public"."continent" AS ENUM('africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania');--> statement-breakpoint
CREATE TYPE "public"."cook_method" AS ENUM('fried', 'deep-fried', 'steamed', 'baked', 'grilled', 'raw', 'fermented', 'slow-cooked', 'simmered', 'sauteed', 'roasted', 'boiled');--> statement-breakpoint
CREATE TYPE "public"."course" AS ENUM('breakfast', 'starter', 'main', 'side', 'dessert', 'snack', 'drink');--> statement-breakpoint
CREATE TYPE "public"."diet" AS ENUM('vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."dish_type" AS ENUM('soup', 'stew', 'curry', 'salad', 'bread', 'rice-dish', 'pasta-noodle', 'dumpling', 'grill-bbq', 'street-food', 'dessert', 'drink', 'pickle-ferment', 'sauce', 'snack', 'pastry', 'fish-dish', 'meat-dish', 'other');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('country', 'region', 'dish', 'recipe', 'festival', 'spice', 'blend');--> statement-breakpoint
CREATE TYPE "public"."festival_dish_role" AS ENUM('traditional', 'signature', 'seasonal', 'offering');--> statement-breakpoint
CREATE TYPE "public"."festival_type" AS ENUM('harvest', 'religious', 'beverage', 'street-food', 'seasonal', 'commemorative', 'national');--> statement-breakpoint
CREATE TYPE "public"."flavour" AS ENUM('sweet', 'sour', 'salty', 'bitter', 'umami', 'spicy', 'smoky', 'tangy', 'aromatic', 'rich');--> statement-breakpoint
CREATE TYPE "public"."ingredient_category" AS ENUM('meat', 'poultry', 'fish-seafood', 'dairy', 'egg', 'grain-flour', 'legume', 'vegetable', 'fruit', 'herb-spice', 'fat-oil', 'sweetener', 'nut-seed', 'condiment', 'alcohol', 'other');--> statement-breakpoint
CREATE TYPE "public"."origin_role" AS ENUM('native', 'major-producer', 'historic-trade');--> statement-breakpoint
CREATE TYPE "public"."recipe_version" AS ENUM('traditional', 'home', 'quick');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'reviewed', 'published');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('encyclopedia', 'unesco', 'academic', 'book', 'news', 'official', 'other');--> statement-breakpoint
CREATE TYPE "public"."spice_part" AS ENUM('seed', 'bark', 'root', 'rhizome', 'fruit', 'berry', 'pod', 'flower', 'stigma', 'bud', 'leaf', 'resin', 'aril', 'mixed', 'other');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'clove', 'pinch', 'bunch', 'to-taste');--> statement-breakpoint
CREATE TABLE "blend_components" (
	"blend_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"proportion_note" text,
	"optional" boolean DEFAULT false NOT NULL,
	CONSTRAINT "blend_components_blend_id_ingredient_id_pk" PRIMARY KEY("blend_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "blend_sources" (
	"blend_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "blend_sources_blend_id_source_id_pk" PRIMARY KEY("blend_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "blends" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"local_name" text,
	"country_id" text,
	"region_id" text,
	"summary" text NOT NULL,
	"history_md" text,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"local_name" text,
	"iso2" text NOT NULL,
	"continent" "continent" NOT NULL,
	"summary" text NOT NULL,
	"regional_variation" text NOT NULL,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "countries_iso2_unique" UNIQUE("iso2")
);
--> statement-breakpoint
CREATE TABLE "country_sources" (
	"country_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "country_sources_country_id_source_id_pk" PRIMARY KEY("country_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "dish_origin_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"dish_id" text NOT NULL,
	"claim" text NOT NULL,
	"confidence" "claim_confidence" NOT NULL,
	"source_id" text
);
--> statement-breakpoint
CREATE TABLE "dish_sources" (
	"dish_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "dish_sources_dish_id_source_id_pk" PRIMARY KEY("dish_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"local_name" text,
	"country_id" text NOT NULL,
	"region_id" text,
	"type" "dish_type" NOT NULL,
	"course" "course"[] NOT NULL,
	"flavours" "flavour"[] NOT NULL,
	"diet" "diet"[] DEFAULT '{}' NOT NULL,
	"cook_methods" "cook_method"[] NOT NULL,
	"spice_level" smallint NOT NULL,
	"summary" text NOT NULL,
	"story_md" text NOT NULL,
	"origin_period" text,
	"image" text,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"search_doc" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(local_name,'') || ' ' || coalesce(summary,''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festival_countries" (
	"festival_id" text NOT NULL,
	"country_id" text NOT NULL,
	CONSTRAINT "festival_countries_festival_id_country_id_pk" PRIMARY KEY("festival_id","country_id")
);
--> statement-breakpoint
CREATE TABLE "festival_dishes" (
	"festival_id" text NOT NULL,
	"dish_id" text NOT NULL,
	"role" "festival_dish_role" NOT NULL,
	"note" text,
	CONSTRAINT "festival_dishes_festival_id_dish_id_pk" PRIMARY KEY("festival_id","dish_id")
);
--> statement-breakpoint
CREATE TABLE "festival_regions" (
	"festival_id" text NOT NULL,
	"region_id" text NOT NULL,
	CONSTRAINT "festival_regions_festival_id_region_id_pk" PRIMARY KEY("festival_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "festival_sources" (
	"festival_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "festival_sources_festival_id_source_id_pk" PRIMARY KEY("festival_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "festivals" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"local_name" text,
	"type" "festival_type" NOT NULL,
	"timing" text NOT NULL,
	"months" smallint[] NOT NULL,
	"duration" text,
	"summary" text NOT NULL,
	"story_md" text NOT NULL,
	"food_traditions_md" text,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_aliases" (
	"ingredient_id" text NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "ingredient_aliases_ingredient_id_alias_pk" PRIMARY KEY("ingredient_id","alias")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "ingredient_category" NOT NULL,
	"allergens" "allergen"[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"position" smallint NOT NULL,
	"ingredient_id" text NOT NULL,
	"amount" numeric(10, 3),
	"unit" "unit" NOT NULL,
	"note" text,
	"optional" boolean DEFAULT false NOT NULL,
	"group_name" text
);
--> statement-breakpoint
CREATE TABLE "recipe_sources" (
	"recipe_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "recipe_sources_recipe_id_source_id_pk" PRIMARY KEY("recipe_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"dish_id" text NOT NULL,
	"title" text NOT NULL,
	"version" "recipe_version" DEFAULT 'home' NOT NULL,
	"servings" smallint NOT NULL,
	"prep_minutes" integer NOT NULL,
	"cook_minutes" integer NOT NULL,
	"passive_minutes" integer DEFAULT 0 NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"steps" text[] NOT NULL,
	"notes" text,
	"licence" text DEFAULT 'CC-BY-4.0 (original text)' NOT NULL,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_signature_ingredients" (
	"region_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	CONSTRAINT "region_signature_ingredients_region_id_ingredient_id_pk" PRIMARY KEY("region_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "region_sources" (
	"region_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "region_sources_region_id_source_id_pk" PRIMARY KEY("region_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"country_id" text NOT NULL,
	"name" text NOT NULL,
	"local_name" text,
	"summary" text NOT NULL,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"from_status" "review_status",
	"to_status" "review_status" NOT NULL,
	"reviewer" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"type" "source_type" NOT NULL,
	"licence_note" text,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_by" text,
	"checked_at" timestamp with time zone,
	"last_http_status" smallint,
	"last_probed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spice_origins" (
	"spice_id" text NOT NULL,
	"country_id" text NOT NULL,
	"role" "origin_role" NOT NULL,
	CONSTRAINT "spice_origins_spice_id_country_id_role_pk" PRIMARY KEY("spice_id","country_id","role")
);
--> statement-breakpoint
CREATE TABLE "spice_sources" (
	"spice_id" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "spice_sources_spice_id_source_id_pk" PRIMARY KEY("spice_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "spice_substitutes" (
	"spice_id" text NOT NULL,
	"substitute_id" text NOT NULL,
	"note" text,
	CONSTRAINT "spice_substitutes_spice_id_substitute_id_pk" PRIMARY KEY("spice_id","substitute_id")
);
--> statement-breakpoint
CREATE TABLE "spices" (
	"ingredient_id" text PRIMARY KEY NOT NULL,
	"scientific_name" text,
	"part_used" "spice_part",
	"heat_level" smallint,
	"heat_shu" integer,
	"flavour_notes" "flavour"[] DEFAULT '{}' NOT NULL,
	"aroma" text,
	"history_md" text,
	"storage" text,
	"buying_tips" text,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blend_components" ADD CONSTRAINT "blend_components_blend_id_blends_id_fk" FOREIGN KEY ("blend_id") REFERENCES "public"."blends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blend_components" ADD CONSTRAINT "blend_components_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blend_sources" ADD CONSTRAINT "blend_sources_blend_id_blends_id_fk" FOREIGN KEY ("blend_id") REFERENCES "public"."blends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blend_sources" ADD CONSTRAINT "blend_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blends" ADD CONSTRAINT "blends_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blends" ADD CONSTRAINT "blends_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_sources" ADD CONSTRAINT "country_sources_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_sources" ADD CONSTRAINT "country_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_origin_claims" ADD CONSTRAINT "dish_origin_claims_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_origin_claims" ADD CONSTRAINT "dish_origin_claims_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_sources" ADD CONSTRAINT "dish_sources_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_sources" ADD CONSTRAINT "dish_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_countries" ADD CONSTRAINT "festival_countries_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_countries" ADD CONSTRAINT "festival_countries_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_dishes" ADD CONSTRAINT "festival_dishes_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_dishes" ADD CONSTRAINT "festival_dishes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_regions" ADD CONSTRAINT "festival_regions_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_regions" ADD CONSTRAINT "festival_regions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_sources" ADD CONSTRAINT "festival_sources_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_sources" ADD CONSTRAINT "festival_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_sources" ADD CONSTRAINT "recipe_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_signature_ingredients" ADD CONSTRAINT "region_signature_ingredients_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_signature_ingredients" ADD CONSTRAINT "region_signature_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_sources" ADD CONSTRAINT "region_sources_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_sources" ADD CONSTRAINT "region_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_origins" ADD CONSTRAINT "spice_origins_spice_id_spices_ingredient_id_fk" FOREIGN KEY ("spice_id") REFERENCES "public"."spices"("ingredient_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_origins" ADD CONSTRAINT "spice_origins_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_sources" ADD CONSTRAINT "spice_sources_spice_id_spices_ingredient_id_fk" FOREIGN KEY ("spice_id") REFERENCES "public"."spices"("ingredient_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_sources" ADD CONSTRAINT "spice_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_substitutes" ADD CONSTRAINT "spice_substitutes_spice_id_spices_ingredient_id_fk" FOREIGN KEY ("spice_id") REFERENCES "public"."spices"("ingredient_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spice_substitutes" ADD CONSTRAINT "spice_substitutes_substitute_id_ingredients_id_fk" FOREIGN KEY ("substitute_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spices" ADD CONSTRAINT "spices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "countries_continent_idx" ON "countries" USING btree ("continent");--> statement-breakpoint
CREATE INDEX "origin_claims_dish_idx" ON "dish_origin_claims" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "dishes_country_idx" ON "dishes" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "dishes_region_idx" ON "dishes" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "dishes_type_idx" ON "dishes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "dishes_status_idx" ON "dishes" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "dishes_flavours_gin" ON "dishes" USING gin ("flavours");--> statement-breakpoint
CREATE INDEX "dishes_diet_gin" ON "dishes" USING gin ("diet");--> statement-breakpoint
CREATE INDEX "dishes_course_gin" ON "dishes" USING gin ("course");--> statement-breakpoint
CREATE INDEX "dishes_search_gin" ON "dishes" USING gin ("search_doc");--> statement-breakpoint
CREATE INDEX "festival_dishes_dish_idx" ON "festival_dishes" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "festivals_months_gin" ON "festivals" USING gin ("months");--> statement-breakpoint
CREATE INDEX "ingredients_category_idx" ON "ingredients" USING btree ("category");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_ingredient_idx" ON "recipe_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipes_dish_idx" ON "recipes" USING btree ("dish_id");--> statement-breakpoint
CREATE INDEX "regions_country_idx" ON "regions" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "review_log_entity_idx" ON "review_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_url_idx" ON "sources" USING btree ("url");--> statement-breakpoint
CREATE VIEW "public"."dish_ingredients" AS (
  select distinct r.dish_id as dish_id, ri.ingredient_id as ingredient_id
  from recipes r join recipe_ingredients ri on ri.recipe_id = r.id
);