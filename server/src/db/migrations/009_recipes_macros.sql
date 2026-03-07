-- 009_recipes_macros.sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS calories_per_serving NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS protein_per_serving NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS carbs_per_serving NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fat_per_serving NUMERIC;
