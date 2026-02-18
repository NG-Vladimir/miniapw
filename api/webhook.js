import { supabase } from '../lib/supabase.js';

// Порядок ролей в графике (1–6)
const ROLES = {
  responsible: 'Ответственный',
  keyboardist: 'Клавишник',
  guitar: 'Гитара',
  backing_vocal: 'Бэк-вокал',
  bass: 'Бас',
  drums: 'Барабаны',
};

// Сопоставление старых ключей БД с новыми (для отображения на русском)
const ROLE_DISPLAY = {
  ...ROLES,
  leader: 'Ответственный',
  guitarist: 'Гитара',
  drummer: 'Барабаны',
  vocalist: 'Бэк-вокал',
};

// Маппинг старых ролей в новые при чтении из БД
const ROLE_ALIAS = {
  leader: 'responsible',
  guitarist: 'guitar',
  drummer: 'drums',
  vocalist: 'backing_vocal',
};

const ROLE_ORDER = ['responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums'];

function getRoleLabel(roleKey) {
  return ROLE_DISPLAY[roleKey] || ROLES[roleKey] || (roleKey || '—');
}

function normalizeRoleForDisplay(roleKey) {
  return ROLE_ALIAS[roleKey] || roleKey;
}

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

// Месяц/год по Москве (чтобы график совпадал с локальным временем пользователя)
function getMoscowNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const year = parseInt(parts.find(p => p.type === 'year').value, 10);
  const month = parseInt(parts.find(p => p.type === 'month').value, 10);
  return { month, year, monthName: MONTHS[month - 1] };
}

async function sendMessage(botToken, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function answerCallback(botToken, callbackQueryId) {
  return fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

function getLeadWithGuitarKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '[+] Да, веду и играю на гитаре', callback_data: 'resp_lead_yes' }],
      [{ text: '[−] Нет, только ответственный', callback_data: 'resp_lead_no' }],
    ],
  };
}

function getRoleKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Ответственный', callback_data: 'role_responsible' }],
      [
        { text: 'Клавишник', callback_data: 'role_keyboardist' },
        { text: 'Гитара', callback_data: 'role_guitar' },
      ],
      [
        { text: 'Бэк-вокал', callback_data: 'role_backing_vocal' },
        { text: 'Бас', callback_data: 'role_bass' },
      ],
      [
        { text: 'Барабаны', callback_data: 'role_drums' },
        { text: '[−] Отмена', callback_data: 'cancel_back' },
      ],
    ],
  };
}

// Дни вторников и воскресений для месяца/года
function getTuesdayDays(month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 2) result.push(d);
  }
  return result;
}
function getSundayDays(month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 0) result.push(d);
  }
  return result;
}

function getTuesdayKeyboard(month, year) {
  const days = getTuesdayDays(month, year);
  const rows = [];
  for (let i = 0; i < days.length; i += 6) {
    rows.push(days.slice(i, i + 6).map(d => ({ text: String(d), callback_data: `day_${d}` })));
  }
  rows.push([{ text: '− Удалить день', callback_data: 'remove_day_ask' }]);
  return { inline_keyboard: rows };
}

function getSundayKeyboard(month, year) {
  const days = getSundayDays(month, year);
  const rows = [];
  for (let i = 0; i < days.length; i += 6) {
    rows.push(days.slice(i, i + 6).map(d => ({ text: String(d), callback_data: `day_${d}` })));
  }
  rows.push([{ text: '− Удалить день', callback_data: 'remove_day_ask' }]);
  return { inline_keyboard: rows };
}

function getMainMenuKeyboard() {
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.MINI_APP_URL || 'https://novaya-papka-sandy.vercel.app');
  return {
    inline_keyboard: [
      [
        { text: '► Открыть приложение', web_app: { url: appUrl } },
      ],
      [
        { text: 'График на месяц', callback_data: 'schedule_view' },
        { text: 'Мои дни', callback_data: 'my_days' },
      ],
      [
        { text: '+ Добавить день', callback_data: 'add_day' },
        { text: '− Удалить день', callback_data: 'remove_day_ask' },
      ],
      [{ text: 'Изменить роль', callback_data: 'change_role' }],
    ],
  };
}

function getRemoveDayKeyboard(slots) {
  if (!slots.length) return { inline_keyboard: [[{ text: '[−] Назад', callback_data: 'cancel_back' }]] };
  const byDay = {};
  for (const s of slots) {
    if (!byDay[s.day_of_month]) byDay[s.day_of_month] = [];
    byDay[s.day_of_month].push(getRoleLabel(s.role));
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < days.length; i += 3) {
    rows.push(days.slice(i, i + 3).map(d => ({
      text: `${d} — ${[...new Set(byDay[d])].join(', ')}`,
      callback_data: `remove_day_${d}`,
    })));
  }
  rows.push([{ text: '[−] Отмена', callback_data: 'cancel_back' }]);
  return { inline_keyboard: rows };
}

async function deleteServiceSlot(userId, month, year, dayOfMonth) {
  await supabase.from('service_schedule')
    .delete()
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .eq('day_of_month', dayOfMonth);
}

async function clearMonthSchedule(month, year) {
  await supabase.from('service_schedule')
    .delete()
    .eq('month', month)
    .eq('year', year);
}

async function ensureUser(telegramId, firstName = null, username = null) {
  await supabase.from('users').upsert(
    {
      id: telegramId,
      first_name: firstName,
      username,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
}

async function getUser(telegramId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', telegramId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function saveUserRole(telegramId, role, username = null, firstName = null, leadWithGuitar = null) {
  const row = {
    id: telegramId,
    role,
    username,
    first_name: firstName,
    updated_at: new Date().toISOString(),
  };
  if (leadWithGuitar !== null) row.lead_with_guitar = leadWithGuitar;
  const { error } = await supabase.from('users').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`saveRole: ${error.message}`);
}

async function addServiceSlot(userId, firstName, month, year, dayOfMonth, role) {
  const { error: userErr } = await supabase.from('users').upsert(
    { id: userId, first_name: firstName, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (userErr) throw new Error(`users: ${userErr.message}`);

  const { error } = await supabase.from('service_schedule').upsert(
    {
      user_id: userId,
      first_name: firstName,
      month,
      year,
      day_of_month: dayOfMonth,
      role,
    },
    { onConflict: 'user_id,month,year,day_of_month,role' }
  );
  if (error) throw new Error(`service_schedule: ${error.message}`);
}

async function getMySlots(userId, month, year) {
  const { data, error } = await supabase
    .from('service_schedule')
    .select('day_of_month, role')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .order('day_of_month');
  if (error) throw error;
  return data || [];
}

async function getScheduleForMonth(month, year) {
  const { data, error } = await supabase
    .from('service_schedule')
    .select('day_of_month, first_name, role')
    .eq('month', month)
    .eq('year', year)
    .order('day_of_month');
  if (error) throw error;
  return data || [];
}

function formatScheduleMessage(entries, monthName, month, year) {
  const byDay = {};
  for (const e of entries) {
    const d = e.day_of_month;
    if (!byDay[d]) byDay[d] = {};
    const roleKey = normalizeRoleForDisplay(e.role);
    const name = (e.first_name || 'Без имени').trim();
    if (!byDay[d][roleKey]) byDay[d][roleKey] = [];
    if (!byDay[d][roleKey].includes(name)) byDay[d][roleKey].push(name);
  }
  for (const d of Object.keys(byDay)) {
    for (const k of Object.keys(byDay[d])) {
      if (Array.isArray(byDay[d][k])) byDay[d][k] = byDay[d][k].join(', ');
    }
  }
  const tueDays = getTuesdayDays(month, year);
  const sunDays = getSundayDays(month, year);
  const allServiceDays = [...tueDays, ...sunDays].sort((a, b) => a - b);
  let msg = `<b>График на ${monthName}</b>\n\n`;
  if (!allServiceDays.length) {
    return msg + 'Нет дней службы в этом месяце.';
  }
  for (const d of allServiceDays) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const wd = dayOfWeek === 0 ? 'вс' : 'вт';
    msg += `<b>${d} число (${wd})</b>\n`;
    for (const roleKey of ROLE_ORDER) {
      const roleLabel = getRoleLabel(roleKey);
      const person = byDay[d]?.[roleKey] || '—';
      msg += `${roleLabel}: ${Array.isArray(person) ? person.join(', ') : person}\n`;
    }
    msg += '\n';
  }
  return msg.trim();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Webhook is active' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set' });

  const body = req.body;
  if (!body) return res.status(200).send('OK');

  const message = body.message;
  const callbackQuery = body.callback_query;

  try {
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id;
      const userId = callbackQuery.from.id;
      const firstName = callbackQuery.from.first_name || 'Участник';
      const username = callbackQuery.from.username;
      const data = callbackQuery.data;
      const { month, year, monthName } = getMoscowNow();

      if (data.startsWith('role_') && !data.startsWith('role_slot')) {
        const role = data.replace('role_', '');
        if (role === 'responsible') {
          await sendMessage(botToken, chatId, 'Будете ли вы вести службу и играть на гитаре?', getLeadWithGuitarKeyboard());
          await answerCallback(botToken, callbackQuery.id);
        } else {
          try {
            await saveUserRole(userId, role, username, firstName);
            const roleName = getRoleLabel(role);
            await sendMessage(botToken, chatId, `Записал роль: <b>${roleName}</b>\n\nДобавь дни, когда ты служишь (конкретные числа месяца):`, getMainMenuKeyboard());
          } catch (e) {
            console.error('saveUserRole error:', e);
            await sendMessage(botToken, chatId, `Ошибка сохранения роли: ${e.message}\n\nВыполни миграцию в Supabase.`, getRoleKeyboard());
          }
          await answerCallback(botToken, callbackQuery.id);
        }
      } else if (data === 'resp_lead_yes') {
        try {
          await saveUserRole(userId, 'responsible', username, firstName, true);
          await sendMessage(botToken, chatId, 'Записал: <b>Ответственный</b> + <b>Гитара</b>\n\nДобавь дни службы — твоё имя будет в обеих ролях.', getMainMenuKeyboard());
        } catch (e) {
          console.error('saveUserRole error:', e);
          await sendMessage(botToken, chatId, `Ошибка: ${e.message}`, getRoleKeyboard());
        }
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'resp_lead_no') {
        try {
          await saveUserRole(userId, 'responsible', username, firstName, false);
          await sendMessage(botToken, chatId, 'Записал: <b>Ответственный</b>\n\nДобавь дни, когда ты служишь:', getMainMenuKeyboard());
        } catch (e) {
          console.error('saveUserRole error:', e);
          await sendMessage(botToken, chatId, `Ошибка: ${e.message}`, getRoleKeyboard());
        }
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'add_day') {
        const user = await getUser(userId);
        if (!user?.role) {
          await sendMessage(botToken, chatId, 'Сначала выбери свою роль:', getRoleKeyboard());
          await answerCallback(botToken, callbackQuery.id);
        } else {
          const label = `${monthName} ${year}`;
          const kbTue = getTuesdayKeyboard(month, year);
          const kbSun = getSundayKeyboard(month, year);
          await sendMessage(botToken, chatId, `<b>${label}</b>\n\n<b>Выбери дни вторника:</b>`, kbTue.inline_keyboard.length ? kbTue : { inline_keyboard: [[{ text: '—', callback_data: 'noop' }]] });
          await sendMessage(botToken, chatId, `<b>Выбери дни воскресенья:</b>`, kbSun.inline_keyboard.length ? kbSun : { inline_keyboard: [[{ text: '—', callback_data: 'noop' }]] });
          await answerCallback(botToken, callbackQuery.id);
        }
      } else if (data.startsWith('day_')) {
        const day = parseInt(data.replace('day_', ''), 10);
        const user = await getUser(userId);
        if (!user?.role) {
          await sendMessage(botToken, chatId, 'Сначала выбери роль через «Изменить роль»:', getRoleKeyboard());
          await answerCallback(botToken, callbackQuery.id);
        } else {
          const roleToSave = normalizeRoleForDisplay(user.role) || user.role;
          const rolesToAdd = (roleToSave === 'responsible' && user.lead_with_guitar)
            ? ['responsible', 'guitar']
            : [roleToSave];
          try {
            for (const r of rolesToAdd) {
              await addServiceSlot(userId, firstName, month, year, day, r);
            }
            const label = rolesToAdd.length > 1
              ? rolesToAdd.map(r => getRoleLabel(r)).join(' + ')
              : getRoleLabel(roleToSave);
            await sendMessage(botToken, chatId, `Записал: <b>${day} число</b> — ${label}`, getMainMenuKeyboard());
          } catch (e) {
            console.error('addServiceSlot error:', e);
            await sendMessage(botToken, chatId, `Ошибка сохранения: ${e.message}\n\nПроверь, что в Supabase выполнена миграция.`, getMainMenuKeyboard());
          }
          await answerCallback(botToken, callbackQuery.id);
        }
      } else if (data === 'cancel_back') {
        await sendMessage(botToken, chatId, 'Отменено. Возврат в меню.', getMainMenuKeyboard());
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'remove_day_ask') {
        const slots = await getMySlots(userId, month, year);
        const label = `${monthName} ${year}`;
        if (!slots.length) {
          await sendMessage(botToken, chatId, `Нет записей для удаления в ${label}.`, getMainMenuKeyboard());
        } else {
          await sendMessage(botToken, chatId, `Какой день вы хотите удалить?`, getRemoveDayKeyboard(slots));
        }
        await answerCallback(botToken, callbackQuery.id);
      } else if (data.startsWith('remove_day_')) {
        const day = parseInt(data.replace('remove_day_', ''), 10);
        await deleteServiceSlot(userId, month, year, day);
        await sendMessage(botToken, chatId, `Удалил <b>${day} число</b> из графика.`, getMainMenuKeyboard());
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'clear_confirm') {
        await clearMonthSchedule(month, year);
        await sendMessage(botToken, chatId, `График за <b>${monthName} ${year}</b> полностью очищен. Начинайте заново.`, getMainMenuKeyboard());
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'clear_cancel') {
        await sendMessage(botToken, chatId, 'Отменено.', getMainMenuKeyboard());
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'schedule_view') {
        try {
          const entries = await getScheduleForMonth(month, year);
          const msg = formatScheduleMessage(entries, `${monthName} ${year}`, month, year);
          await sendMessage(botToken, chatId, msg, getMainMenuKeyboard());
        } catch (e) {
          console.error('schedule_view error:', e);
          await sendMessage(botToken, chatId, `<b>График на ${monthName} ${year}</b>\n\nОшибка загрузки. Убедись, что в Supabase выполнена миграция (таблица service_schedule).`, getMainMenuKeyboard());
        }
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'my_days') {
        try {
          const slots = await getMySlots(userId, month, year);
          const label = `${monthName} ${year}`;
          if (!slots.length) {
            await sendMessage(botToken, chatId, `<b>Твои дни в ${label}</b>\n\nПока нет записей. Добавь день (вторники и воскресенья):`, getMainMenuKeyboard());
          } else {
            const byDay = {};
            for (const s of slots) {
              if (!byDay[s.day_of_month]) byDay[s.day_of_month] = [];
              byDay[s.day_of_month].push(getRoleLabel(s.role));
            }
            let text = `<b>Твои дни в ${label}</b>\n\n`;
            for (const d of Object.keys(byDay).map(Number).sort((a, b) => a - b)) {
              text += `${d} число — ${[...new Set(byDay[d])].join(', ')}\n`;
            }
            text += '\nДобавить ещё день?';
            await sendMessage(botToken, chatId, text, getMainMenuKeyboard());
          }
        } catch (e) {
          console.error('my_days error:', e);
          await sendMessage(botToken, chatId, 'Ошибка загрузки. Убедись, что в Supabase выполнена миграция (таблица service_schedule).', getMainMenuKeyboard());
        }
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'change_role') {
        await sendMessage(botToken, chatId, 'Выбери роль (будет использоваться при добавлении дней):', getRoleKeyboard());
        await answerCallback(botToken, callbackQuery.id);
      } else if (data === 'noop') {
        await answerCallback(botToken, callbackQuery.id);
      }
      return res.status(200).send('OK');
    }

    if (message) {
      const chatId = message.chat.id;
      const userId = message.from?.id;
      const text = (message.text || '').trim().toLowerCase();
      const name = message.from?.first_name || 'друг';

      if (text === '/start') {
        const appUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (process.env.MINI_APP_URL || 'https://novaya-papka-sandy.vercel.app');
        const startKb = {
          inline_keyboard: [
            [{ text: '► Открыть приложение', web_app: { url: appUrl } }],
            ...getRoleKeyboard().inline_keyboard,
          ],
        };
        await sendMessage(
          botToken,
          chatId,
          `Привет, ${name}!\n\n<b>Открой приложение</b> — там можно назначить все роли на день одним нажатием.\n\nИли выбери свою роль в группе:`,
          startKb
        );
      } else if (text === '/role' || text === 'роль' || text === 'моя роль') {
        const user = await getUser(userId);
        if (user?.role) {
          await sendMessage(botToken, chatId, `Твоя роль в профиле: <b>${getRoleLabel(user.role)}</b>`, getMainMenuKeyboard());
        } else {
          await sendMessage(botToken, chatId, 'Нажми /start и выбери роль.', getRoleKeyboard());
        }
      } else if (text === '/schedule' || text === '/график' || text === 'график') {
        const { month: m, year: y, monthName: mn } = getMoscowNow();
        const entries = await getScheduleForMonth(m, y);
        await sendMessage(botToken, chatId, formatScheduleMessage(entries, `${mn} ${y}`, m, y), getMainMenuKeyboard());
      } else if (text === '/clear' || text === '/очистить') {
        const { month: m, year: y, monthName: mn } = getMoscowNow();
        const label = `${mn} ${y}`;
        const kb = {
          inline_keyboard: [
            [{ text: '[+] Да, очистить весь график', callback_data: 'clear_confirm' }],
            [{ text: '[−] Отмена', callback_data: 'clear_cancel' }],
          ],
        };
        await sendMessage(botToken, chatId, `⚠️ Удалить весь график за <b>${label}</b>?\n\nВсе записи будут удалены. Это нельзя отменить.`, kb);
      } else {
        await sendMessage(botToken, chatId, 'Используй /start или кнопки меню.');
      }
    }
  } catch (err) {
    console.error('Bot error:', err);
  }
  return res.status(200).send('OK');
}
