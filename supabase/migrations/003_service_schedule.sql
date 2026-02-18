-- Разрешаем новые роли в users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IS NULL OR role IN ('leader', 'guitarist', 'drummer', 'keyboardist', 'vocalist'));

-- График служений: конкретные числа месяца + роль на этот день
CREATE TABLE IF NOT EXISTS service_schedule (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL,
  day_of_month INT NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
  role TEXT NOT NULL CHECK (role IN ('leader', 'guitarist', 'drummer', 'keyboardist', 'vocalist')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, month, year, day_of_month)
);

CREATE INDEX IF NOT EXISTS idx_schedule_month_year ON service_schedule(month, year);
