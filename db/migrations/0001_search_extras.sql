-- Typo-tolerant, substring-friendly search. pg_trgm ships with Postgres, Supabase and Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "dishes_name_trgm" ON "dishes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ingredient_aliases_trgm" ON "ingredient_aliases" USING gin ("alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ingredients_name_trgm" ON "ingredients" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
-- Keep updated_at honest on every change, whichever client wrote it.
CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER dishes_touch BEFORE UPDATE ON "dishes" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint
CREATE TRIGGER recipes_touch BEFORE UPDATE ON "recipes" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint
CREATE TRIGGER spices_touch BEFORE UPDATE ON "spices" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();--> statement-breakpoint
CREATE TRIGGER blends_touch BEFORE UPDATE ON "blends" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
