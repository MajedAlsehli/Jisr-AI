CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  manager_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  emp_key TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  manager_name TEXT NOT NULL,
  initials TEXT NOT NULL,
  hire_date DATE NOT NULL,
  role_start_date DATE NOT NULL,
  leave_balance INTEGER NOT NULL DEFAULT 12,
  leadership_cert BOOLEAN NOT NULL DEFAULT false,
  performance_rating_met BOOLEAN NOT NULL DEFAULT false,
  goal_achievement_met BOOLEAN NOT NULL DEFAULT false,
  manager_feedback_positive BOOLEAN NOT NULL DEFAULT false,
  peer_feedback_positive BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent'))
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  type TEXT NOT NULL CHECK (type IN ('leave','overtime','expense')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','overdue','needs_policy_check','ready'))
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  cycle TEXT NOT NULL,
  notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  department_key TEXT NOT NULL,
  level TEXT NOT NULL,
  duration TEXT NOT NULL,
  format TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  course_id INTEGER REFERENCES courses(id),
  relevance_pct INTEGER NOT NULL,
  ai_rationale TEXT,
  hr_status TEXT NOT NULL DEFAULT 'pending' CHECK (hr_status IN ('pending','approved','rejected')),
  forwarded_to_manager_at TIMESTAMPTZ,
  manager_presented_at TIMESTAMPTZ,
  request_ref TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT false
);
