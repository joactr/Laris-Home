-- 011_recipes_image.sql
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT;
