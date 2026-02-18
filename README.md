# Telegram Role Bot

Бот приветствует, спрашивает твою роль (барабанщик / клавишник / вокалист) и сохраняет её в Supabase.

## Технологии

- **Vercel** — хостинг (Serverless Functions)
- **Webhook** — приём обновлений от Telegram
- **Supabase** — хранение ролей пользователей

## Быстрый старт

### 1. Supabase

1. Зайди на [supabase.com](https://supabase.com) и создай проект.
2. В **SQL Editor** выполни миграцию из `supabase/migrations/001_create_users.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  role TEXT CHECK (role IN ('drummer', 'keyboardist', 'vocalist')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
```

3. В **Project Settings → API** скопируй:
   - Project URL → `SUPABASE_URL`
   - anon public key → `SUPABASE_ANON_KEY`

### 2. Vercel

1. Установи [Vercel CLI](https://vercel.com/cli) (если ещё не установлен):
   ```bash
   npm i -g vercel
   ```

2. В папке проекта:
   ```bash
   npm install
   vercel
   ```

3. Добавь переменные окружения в Vercel (Dashboard → Settings → Environment Variables):

   | Имя | Значение |
   |-----|----------|
   | `TELEGRAM_BOT_TOKEN` | Твой токен бота |
   | `SUPABASE_URL` | URL проекта Supabase |
   | `SUPABASE_ANON_KEY` | anon key из Supabase |

4. Узнай URL деплоя (например `https://your-app.vercel.app`) и установи webhook:
   ```bash
   curl "https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/setWebhook?url=https://your-app.vercel.app/api/webhook"
   ```

### 3. Локальный запуск

```bash
npm install
vercel dev
```

Создай туннель (ngrok и т.п.) для тестирования webhook локально.

## Команды бота

- `/start` — приветствие и выбор роли
- `/role` или «роль», «моя роль» — показать текущую роль

## Безопасность

- Не храни токен в коде — используй переменные окружения.
- Не добавляй `.env` в git (он уже в `.gitignore`).
