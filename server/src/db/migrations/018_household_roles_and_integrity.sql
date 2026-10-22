-- 018_household_roles_and_integrity.sql
-- Household-scoped admin role (users.is_admin stays as a global fallback).

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS role VARCHAR(20);
UPDATE memberships m
SET role = 'admin'
FROM users u
WHERE m.user_id = u.id AND m.role IS NULL AND u.is_admin = TRUE;
UPDATE memberships SET role = 'member' WHERE role IS NULL;
ALTER TABLE memberships ALTER COLUMN role SET DEFAULT 'member';
ALTER TABLE memberships ALTER COLUMN role SET NOT NULL;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member'));

-- One membership per (user, household). Remove accidental duplicates first.
DELETE FROM memberships a
USING memberships b
WHERE a.user_id = b.user_id
  AND a.household_id = b.household_id
  AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_user_household
  ON memberships(user_id, household_id);

-- Push subscriptions are identified by endpoint per user.
DELETE FROM push_subscriptions a
USING push_subscriptions b
WHERE a.user_id = b.user_id
  AND a.subscription->>'endpoint' = b.subscription->>'endpoint'
  AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
  ON push_subscriptions(user_id, (subscription->>'endpoint'));

-- Common household-scoped lookups that still lacked an index.
CREATE INDEX IF NOT EXISTS idx_recipes_household_id ON recipes(household_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_chore_instances_household_date ON chore_instances(household_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_list_items_name ON list_items(list_id, lower(normalized_name));
