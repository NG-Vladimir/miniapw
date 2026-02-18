-- Выполни в Supabase → SQL Editor → New query
-- 1) Обновляем роли в users + добавляем lead_with_guitar (для ответственного+гитара)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IS NULL OR role IN ('responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_with_guitar BOOLEAN DEFAULT false;

-- 2) Таблица service_schedule — PK включает role (ответственный может быть и на гитаре)
CREATE TABLE IF NOT EXISTS service_schedule (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL,
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  role TEXT NOT NULL CHECK (role IN ('responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month, year, day_of_month, role)
);

CREATE INDEX IF NOT EXISTS idx_schedule_month_year ON service_schedule(month, year);

-- 3) Если таблица уже была с PK (user_id,month,year,day) без role — выполни /clear, затем:
-- ALTER TABLE service_schedule DROP CONSTRAINT IF EXISTS service_schedule_pkey;
-- ALTER TABLE service_schedule ADD PRIMARY KEY (user_id, month, year, day_of_month, role);

ALTER TABLE service_schedule DROP CONSTRAINT IF EXISTS service_schedule_role_check;
ALTER TABLE service_schedule ADD CONSTRAINT service_schedule_role_check CHECK (role IN ('responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums'));

-- 4) RLS — разрешаем anon доступ к service_schedule (если RLS включён)
ALTER TABLE service_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_schedule_all" ON service_schedule;
CREATE POLICY "service_schedule_all" ON service_schedule FOR ALL USING (true) WITH CHECK (true);
