-- Добавляем колонку для дней службы
ALTER TABLE users ADD COLUMN IF NOT EXISTS service_days TEXT 
  CHECK (service_days IS NULL OR service_days IN ('tuesday', 'sunday', 'both'));
