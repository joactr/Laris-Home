-- 013_chores_enhancements.sql
ALTER TABLE chore_templates ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE chore_templates ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1;
