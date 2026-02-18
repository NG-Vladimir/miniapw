# Пошаговая настройка бота

## Шаг 1: Supabase (база данных)

Без Supabase бот не сможет сохранять роли. Сделай это первым.

1. Открой **https://supabase.com** в браузере
2. Нажми **Start your project**
3. Войди через GitHub или email
4. Нажми **New Project**
5. Укажи:
   - **Name** — например `telegram-bot`
   - **Database Password** — придумай и сохрани
   - **Region** — можно оставить по умолчанию
6. Нажми **Create new project** и подожди 1–2 минуты
7. В левом меню открой **SQL Editor**
8. Создай новый запрос и вставь:

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

9. Нажми **Run** (или Ctrl+Enter)
10. В левом меню открой **Project Settings** (значок шестерёнки)
11. Выбери **API**
12. Скопируй:
    - **Project URL** — это будет `SUPABASE_URL`
    - **anon public** (ключ в разделе Project API keys) — это будет `SUPABASE_ANON_KEY`

---

## Шаг 2: Vercel (хостинг)

1. Открой **https://vercel.com** в браузере
2. Войди через GitHub
3. Нажми **Add New** → **Project**
4. Импортируй папку с ботом (если она в GitHub) или используй Vercel CLI (см. ниже)
5. **Перед деплоем** перейди в **Settings** → **Environment Variables**
6. Добавь три переменные (Add → Name и Value):

| Name | Value |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | `8094871525:AAFcv5PysF7AaujOjhDp13BUwqWPRRX2UGE` |
| `SUPABASE_URL` | URL из Supabase (например `https://abcdefg.supabase.co`) |
| `SUPABASE_ANON_KEY` | anon key из Supabase |

7. Выбери Environment: **Production** (и при желании Preview)
8. Нажми **Save**
9. После деплоя скопируй URL проекта (например `https://telegram-role-bot.vercel.app`)

---

## Шаг 3: Установка Webhook в Telegram

После деплоя на Vercel у тебя будет URL вида `https://твой-проект.vercel.app`.

Открой в браузере (подставь свой URL):

```
https://api.telegram.org/bot8094871525:AAFcv5PysF7AaujOjhDp13BUwqWPRRX2UGE/setWebhook?url=https://ТВОЙ-URL.vercel.app/api/webhook
```

Например:
```
https://api.telegram.org/bot8094871525:AAFcv5PysF7AaujOjhDp13BUwqWPRRX2UGE/setWebhook?url=https://telegram-role-bot.vercel.app/api/webhook
```

Должен вернуться JSON: `{"ok":true,...}`

---

## Шаг 4: Проверка

Открой своего бота в Telegram, напиши `/start` — должен прийти приветствие и кнопки выбора роли.

---

## Деплой через Vercel CLI

Если проект ещё не на Vercel:

```bash
cd "/Users/vladimir/Desktop/Новая папка"
npm i -g vercel
vercel
```

Ответь на вопросы (логин, выбор проекта). После деплоя добавь переменные в Dashboard, как в Шаге 2.
