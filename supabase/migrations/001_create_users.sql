-- Таблица для хранения пользователей и их ролей
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  role TEXT CHECK (role IN ('drummer', 'keyboardist', 'vocalist')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по id
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
