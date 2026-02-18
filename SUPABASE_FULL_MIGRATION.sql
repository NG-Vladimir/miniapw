-- =====================================================
-- ПОЛНАЯ МИГРАЦИЯ ДЛЯ SUPABASE
-- Скопируй весь файл и вставь в SQL Editor → Run
-- =====================================================

-- 1) Таблица users (если ещё нет)
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  role TEXT,
  lead_with_guitar BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Обновляем users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IS NULL OR role IN ('responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_with_guitar BOOLEAN DEFAULT false;

-- 3) Удаляем старую таблицу service_schedule и создаём заново с правильным PK
DROP TABLE IF EXISTS service_schedule;

CREATE TABLE service_schedule (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL,
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  role TEXT NOT NULL CHECK (role IN ('responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month, year, day_of_month, role)
);

CREATE INDEX idx_schedule_month_year ON service_schedule(month, year);

-- 4) RLS
ALTER TABLE service_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_schedule_all" ON service_schedule;
CREATE POLICY "service_schedule_all" ON service_schedule FOR ALL USING (true) WITH CHECK (true);
