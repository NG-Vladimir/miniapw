const ROLE_ORDER = ['responsible', 'keyboardist', 'guitar', 'backing_vocal', 'bass', 'drums'];
const ROLE_LABELS = {
  responsible: 'Ответственный',
  keyboardist: 'Клавишник',
  guitar: 'Гитара',
  backing_vocal: 'Бэк-вокал',
  bass: 'Бас',
  drums: 'Барабаны',
};
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DEFAULT_NAMES = ['Андрей', 'Владимир'];

let supabase;
let currentMonth, currentYear;
let users = [];
let schedule = {};

function getMoscowNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  return {
    month: parseInt(parts.find(p => p.type === 'month').value, 10),
    year: parseInt(parts.find(p => p.type === 'year').value, 10),
  };
}

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

async function init() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    document.body.style.background = tg.themeParams?.bg_color || '#0f0f12';
  }

  const isLocalFile = window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null';
  if (!isLocalFile) {
    try {
      const base = window.location.origin;
      const res = await fetch(`${base}/api/config`);
      if (res.ok) {
        const { supabaseUrl, supabaseKey } = await res.json();
        if (supabaseUrl && supabaseKey && window.supabase) {
          supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        }
      }
    } catch (err) {
      console.warn('Config failed, running offline:', err);
    }
  }

  const now = getMoscowNow();
  currentMonth = now.month;
  currentYear = now.year;

  await loadUsers();
  await loadSchedule();
  render();
  bindEvents();

  const firstName = window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || 'Гость';
  document.getElementById('welcomeTitle').textContent = `${firstName}, привет!`;
  bindWelcomeEvents();
  bindSongsScreenOnce();

  document.getElementById('loader').classList.add('hidden');
}

function bindWelcomeEvents() {
  const welcome = document.getElementById('welcomeScreen');
  const mainApp = document.getElementById('app');

  document.getElementById('closeWelcome').onclick = () => {
    if (window.Telegram?.WebApp?.close) {
      window.Telegram.WebApp.close();
    } else {
      showScheduleScreen();
    }
  };

  document.querySelector('.welcome-menu').addEventListener('click', (e) => {
    const btn = e.target.closest('.welcome-menu-btn');
    if (!btn) return;
    const screen = btn.getAttribute('data-screen');
    if (screen === 'schedule' || screen === 'songs') {
      welcome.classList.add('hidden');
      showSongsScreen();
    } else {
      window.Telegram?.WebApp?.showPopup?.({ title: 'Скоро', message: 'Раздел в разработке.' });
    }
  });
}

function showScheduleScreen() {
  const welcome = document.getElementById('welcomeScreen');
  const mainApp = document.getElementById('app');
  const songs = document.getElementById('songsScreen');
  welcome.classList.add('hidden');
  if (songs) {
    songs.hidden = true;
    songs.classList.add('hidden');
  }
  mainApp.removeAttribute('hidden');
  loadSchedule().then(render);
}

function getDisplayNames() {
  const fromUsers = (users || []).map(u => u.first_name).filter(Boolean);
  return [...new Set([...DEFAULT_NAMES, ...fromUsers])].sort((a, b) => a.localeCompare(b));
}

let songsPickerDay = null;
let songsPickerRole = null;

function showSongsScreen() {
  document.getElementById('songsScreen').hidden = false;
  document.getElementById('songsScreen').classList.remove('hidden');
  document.getElementById('app').setAttribute('hidden', '');
  Promise.all([loadSchedule(), loadUsers()]).then(renderSongsList);
}

function hideSongsScreen() {
  document.getElementById('songsScreen').hidden = true;
  document.getElementById('songsScreen').classList.add('hidden');
  document.getElementById('welcomeScreen').classList.remove('hidden');
}

function renderSongsList() {
  const tue = getTuesdayDays(currentMonth, currentYear);
  const sun = getSundayDays(currentMonth, currentYear);
  const allDays = [...tue, ...sun].sort((a, b) => a - b);

  document.getElementById('songsMonthLabel').textContent = `${MONTHS[currentMonth - 1]} ${currentYear}`;

  if (!allDays.length) {
    document.getElementById('songsDayList').innerHTML = '<div class="empty-state"><p>Нет дней службы в этом месяце</p></div>';
    return;
  }

  const weekDayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  const html = allDays.map(d => {
    const dateObj = new Date(currentYear, currentMonth - 1, d);
    const wdIndex = dateObj.getDay();
    const weekDay = weekDayNames[wdIndex];
    const dateStr = `${d} ${monthNames[currentMonth - 1]}`;
    const byRole = schedule[d] || {};
    const slotsHtml = ROLE_ORDER.map(r => {
      const val = byRole[r];
      const isEmpty = !val;
      return `
        <div class="songs-slot-row">
          <span class="songs-slot-role">${ROLE_LABELS[r]}</span>
          <span class="songs-slot-value ${isEmpty ? 'empty' : ''}" data-day="${d}" data-role="${r}" data-name="${(val || '').replace(/"/g, '&quot;')}" title="${isEmpty ? 'Записаться' : 'Отменить'}">${val || 'пусто'}</span>
        </div>`;
    }).join('');
    return `
      <div class="songs-day-item" data-day="${d}">
        <div class="songs-day-head">
          <span class="songs-day-date">${weekDay}, ${dateStr}</span>
          <span class="songs-day-chevron">⌄</span>
        </div>
        <div class="songs-day-body">
          <div class="songs-day-slots">${slotsHtml}</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('songsDayList').innerHTML = html;
}

function bindSongsScreenOnce() {
  const list = document.getElementById('songsDayList');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const head = e.target.closest('.songs-day-head');
    const slot = e.target.closest('.songs-slot-value');
    if (head) {
      const item = head.closest('.songs-day-item');
      if (item) item.classList.toggle('expanded');
      return;
    }
    if (slot) {
      const day = parseInt(slot.dataset.day, 10);
      const role = slot.dataset.role;
      const name = (slot.dataset.name || '').trim();
      if (name) {
        const doClear = () => assignSlot(day, role, '').then(() => loadSchedule().then(renderSongsList));
        if (window.Telegram?.WebApp?.showConfirm) {
          window.Telegram.WebApp.showConfirm('Отменить запись?', (ok) => { if (ok) doClear(); });
        } else if (typeof confirm !== 'undefined' && !confirm('Отменить запись?')) {
          return;
        } else {
          doClear();
        }
      } else {
        songsPickerDay = day;
        songsPickerRole = role;
        openSongsPicker();
      }
      return;
    }
  });

  document.getElementById('songsClose').onclick = () => {
    if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
    else hideSongsScreen();
  };
  document.getElementById('songsBack').onclick = hideSongsScreen;

  document.getElementById('songsPrevMonth').onclick = () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadSchedule().then(renderSongsList);
  };
  document.getElementById('songsNextMonth').onclick = () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    loadSchedule().then(renderSongsList);
  };

  document.getElementById('songsExpandAll').onclick = () => {
    list.querySelectorAll('.songs-day-item').forEach(el => el.classList.add('expanded'));
  };
  document.getElementById('songsCollapseAll').onclick = () => {
    list.querySelectorAll('.songs-day-item').forEach(el => el.classList.remove('expanded'));
  };

  const pickerCancel = document.getElementById('songsPickerCancel');
  if (pickerCancel) pickerCancel.onclick = () => { document.getElementById('songsNamePicker').hidden = true; };
}

function openSongsPicker() {
  const names = getDisplayNames();
  const container = document.getElementById('songsPickerNames');
  container.innerHTML = names.map(n => `<button type="button" class="songs-picker-name" data-name="${n.replace(/"/g, '&quot;')}">${n}</button>`).join('');
  container.querySelectorAll('.songs-picker-name').forEach(btn => {
    btn.onclick = () => {
      const name = btn.dataset.name;
      assignSlot(songsPickerDay, songsPickerRole, name).then(() => {
        document.getElementById('songsNamePicker').hidden = true;
        return Promise.all([loadSchedule(), loadUsers()]);
      }).then(() => {
        renderSongsList();
        window.Telegram?.WebApp?.showPopup?.({ title: 'Сохранено', message: 'Участник записан.' });
      });
    };
  });
  document.getElementById('songsNamePicker').hidden = false;
}

async function assignSlot(day, role, name) {
  if (!supabase) {
    if (!schedule[day]) schedule[day] = {};
    if (name && name.trim()) schedule[day][role] = name.trim();
    else schedule[day][role] = undefined;
    renderSongsList();
    return;
  }
  await supabase.from('service_schedule')
    .delete()
    .eq('month', currentMonth)
    .eq('year', currentYear)
    .eq('day_of_month', day)
    .eq('role', role);

  if (name && name.trim()) {
    let userId = users.find(u => u.first_name === name)?.id;
    if (!userId) {
      const id = -Date.now() - Math.floor(Math.random() * 1000);
      await supabase.from('users').insert({ id, first_name: name });
      userId = id;
      users.push({ id: userId, first_name: name });
    }
    await supabase.from('service_schedule').insert({
      user_id: userId,
      first_name: name,
      month: currentMonth,
      year: currentYear,
      day_of_month: day,
      role,
    });
  }
}

async function loadUsers() {
  if (!supabase) {
    users = DEFAULT_NAMES.map((name, i) => ({ id: -(i + 1), first_name: name }));
    return;
  }
  const { data } = await supabase.from('users').select('id, first_name').not('first_name', 'is', null).order('first_name');
  users = data || [];
}

async function loadSchedule() {
  if (!supabase) {
    schedule = {};
    return;
  }
  const { data } = await supabase
    .from('service_schedule')
    .select('day_of_month, first_name, role')
    .eq('month', currentMonth)
    .eq('year', currentYear)
    .order('day_of_month');
  schedule = {};
  for (const row of data || []) {
    if (!schedule[row.day_of_month]) schedule[row.day_of_month] = {};
    schedule[row.day_of_month][row.role] = row.first_name || '—';
  }
}

function render() {
  const tue = getTuesdayDays(currentMonth, currentYear);
  const sun = getSundayDays(currentMonth, currentYear);
  const allDays = [...tue, ...sun].sort((a, b) => a - b);

  document.getElementById('monthLabel').textContent = `${MONTHS[currentMonth - 1]} ${currentYear}`;

  if (!allDays.length) {
    document.getElementById('scheduleList').innerHTML = '<div class="empty-state"><p>Нет дней службы в этом месяце</p></div>';
    return;
  }

  const html = allDays.map(d => {
    const wd = new Date(currentYear, currentMonth - 1, d).getDay() === 0 ? 'вс' : 'вт';
    const byRole = schedule[d] || {};
    const rows = ROLE_ORDER.map(r => {
      const val = byRole[r];
      return `<div class="role-row"><span class="role-label">${ROLE_LABELS[r]}</span><span class="role-value ${!val ? 'empty' : ''}">${val || '—'}</span></div>`;
    }).join('');
    return `
      <div class="day-card" data-day="${d}">
        <div class="day-card-header">
          <span class="day-card-date">${d} число</span>
          <span class="day-card-weekday">${wd}</span>
        </div>
        ${rows}
      </div>
    `;
  }).join('');

  document.getElementById('scheduleList').innerHTML = html;
}

function bindEvents() {
  document.getElementById('prevMonth').onclick = () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadSchedule().then(render);
  };
  document.getElementById('nextMonth').onclick = () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    loadSchedule().then(render);
  };

  document.getElementById('scheduleList').addEventListener('click', (e) => {
    const card = e.target.closest('.day-card');
    if (card) openEdit(parseInt(card.dataset.day, 10));
  });

  document.getElementById('closeEdit').onclick = () => {
    document.getElementById('dayEdit').hidden = true;
  };

  document.getElementById('saveDay').onclick = saveDay;
}

let editingDay = null;

function openEdit(day) {
  editingDay = day;
  document.getElementById('editDayTitle').textContent = `${day} число`;
  const byRole = schedule[day] || {};
  const html = ROLE_ORDER.map(r => {
    return `
      <div class="role-field">
        <label>${ROLE_LABELS[r]}</label>
        <input type="text" data-role="${r}" value="${(byRole[r] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" placeholder="Имя участника" list="users-list">
      </div>
    `;
  }).join('');
  document.getElementById('roleFields').innerHTML = html;

  const dl = document.createElement('datalist');
  dl.id = 'users-list';
  users.forEach(u => {
    const o = document.createElement('option');
    o.value = u.first_name;
    dl.appendChild(o);
  });
  document.getElementById('roleFields').appendChild(dl);

  document.getElementById('dayEdit').hidden = false;
}

async function saveDay() {
  if (!editingDay) return;
  if (!supabase) {
    alert('Сохранение только при запуске через сервер (npx vercel dev или деплой).');
    return;
  }
  const fields = document.querySelectorAll('.role-field input');
  const tg = window.Telegram?.WebApp;

  for (const r of ROLE_ORDER) {
    const input = document.querySelector(`.role-field input[data-role="${r}"]`);
    const name = (input?.value || '').trim();

    await supabase.from('service_schedule')
      .delete()
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .eq('day_of_month', editingDay)
      .eq('role', r);

    if (name) {
      let userId = users.find(u => u.first_name === name)?.id;
      if (!userId) {
        const id = -Date.now() - Math.floor(Math.random() * 1000);
        const { error: uErr } = await supabase.from('users').insert({ id, first_name: name });
        if (uErr && uErr.code !== '23505') {
          if (tg?.showAlert) tg.showAlert(`Ошибка: ${uErr.message}`);
          continue;
        }
        userId = id;
        users.push({ id: userId, first_name: name });
      }

      const { error } = await supabase.from('service_schedule').insert({
        user_id: userId,
        first_name: name,
        month: currentMonth,
        year: currentYear,
        day_of_month: editingDay,
        role: r,
      });
      if (error && tg?.showAlert) tg.showAlert(`Ошибка: ${error.message}`);
    }
  }

  if (tg?.showPopup) tg.showPopup({ title: 'Сохранено', message: 'График обновлён' });
  document.getElementById('dayEdit').hidden = true;
  await loadUsers();
  await loadSchedule();
  render();
}

init().catch(err => {
  console.error(err);
  document.getElementById('loader').innerHTML = `<span style="color:#ef4444">Ошибка: ${err.message}</span>`;
});
