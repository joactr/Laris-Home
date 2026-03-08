CREATE TABLE IF NOT EXISTS meal_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    meal_type VARCHAR(50) NOT NULL,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    text_content TEXT,
    servings NUMERIC(5,2) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate existing data from meal_plan_days
INSERT INTO meal_plan_items (household_id, date, meal_type, recipe_id, text_content)
SELECT household_id, date, 'breakfast', breakfast_recipe_id, breakfast
FROM meal_plan_days WHERE breakfast IS NOT NULL OR breakfast_recipe_id IS NOT NULL;

INSERT INTO meal_plan_items (household_id, date, meal_type, recipe_id, text_content)
SELECT household_id, date, 'lunch', lunch_recipe_id, lunch
FROM meal_plan_days WHERE lunch IS NOT NULL OR lunch_recipe_id IS NOT NULL;

INSERT INTO meal_plan_items (household_id, date, meal_type, recipe_id, text_content)
SELECT household_id, date, 'dinner', dinner_recipe_id, dinner
FROM meal_plan_days WHERE dinner IS NOT NULL OR dinner_recipe_id IS NOT NULL;

INSERT INTO meal_plan_items (household_id, date, meal_type, recipe_id, text_content)
SELECT household_id, date, 'snack', snack_recipe_id, snack
FROM meal_plan_days WHERE snack IS NOT NULL OR snack_recipe_id IS NOT NULL;
