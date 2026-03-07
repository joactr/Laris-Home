-- 006_meals.sql
CREATE TABLE IF NOT EXISTS meal_plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  breakfast TEXT,
  lunch TEXT,
  dinner TEXT,
  snack TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (household_id, date)
);

CREATE TABLE IF NOT EXISTS meal_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  ingredients TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
