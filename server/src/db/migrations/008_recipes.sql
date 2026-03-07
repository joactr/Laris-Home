-- 008_recipes.sql
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source_url TEXT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  instructions TEXT,
  servings INTEGER,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  original_text TEXT NOT NULL,
  quantity NUMERIC(10,2),
  unit VARCHAR(50),
  notes TEXT
);

-- Extend meal_plan_days to reference recipes instead of simple text
ALTER TABLE meal_plan_days ADD COLUMN breakfast_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE meal_plan_days ADD COLUMN lunch_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE meal_plan_days ADD COLUMN dinner_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE meal_plan_days ADD COLUMN snack_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
