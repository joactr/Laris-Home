ALTER TABLE list_items ADD COLUMN IF NOT EXISTS normalized_name TEXT;

UPDATE list_items
SET normalized_name = lower(regexp_replace(name, '[^[:alnum:]]+', ' ', 'g'))
WHERE normalized_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_list_items_list_normalized_active
ON list_items(list_id, normalized_name, is_completed);

CREATE TABLE IF NOT EXISTS recipe_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (household_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS recipe_tag_assignments (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE IF NOT EXISTS recipe_user_preferences (
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_tags_household_normalized
ON recipe_tags(household_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_recipe_user_preferences_user_favorite
ON recipe_user_preferences(user_id, is_favorite, rating);
