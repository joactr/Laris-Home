-- 018_household_roles_and_integrity.sql
-- Admin checks now read memberships.role (created in 002, default 'member').
-- Promote existing global admins so they keep admin rights in their household.
UPDATE memberships m
SET role = 'admin'
FROM users u
WHERE m.user_id = u.id AND u.is_admin = TRUE AND m.role <> 'admin';
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('admin', 'member'));

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
