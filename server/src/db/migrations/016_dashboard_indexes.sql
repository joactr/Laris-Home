CREATE INDEX IF NOT EXISTS idx_memberships_household_id ON memberships(household_id);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_household_id
ON shopping_lists(household_id);

CREATE INDEX IF NOT EXISTS idx_list_items_list_completed_created
ON list_items(list_id, is_completed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_household_start
ON events(household_id, start_datetime);

CREATE INDEX IF NOT EXISTS idx_chore_templates_household_active
ON chore_templates(household_id, is_active);

CREATE INDEX IF NOT EXISTS idx_chore_instances_template_scheduled_status
ON chore_instances(template_id, scheduled_date, status);

CREATE INDEX IF NOT EXISTS idx_meal_plan_items_household_date_type
ON meal_plan_items(household_id, date, meal_type);

CREATE INDEX IF NOT EXISTS idx_projects_household_status
ON projects(household_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status_due_date
ON tasks(project_id, status, due_date);
