-- 005_chores.sql
CREATE TABLE IF NOT EXISTS chore_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  location VARCHAR(100),
  default_assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recurrence_type VARCHAR(20) NOT NULL DEFAULT 'weekly',
  recurrence_days INTEGER[] DEFAULT ARRAY[1],
  points INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chore_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES chore_templates(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
