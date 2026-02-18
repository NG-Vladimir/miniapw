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

  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config failed');
  const { supabaseUrl, supabaseKey } = await res.json();
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  const now = getMoscowNow();
  currentMonth = now.month;
  currentYear = now.year;

  await loadUsers();
  await loadSchedule();
  render();
  bindEvents();
  document.getElementById('loader').classList.add('hidden');
}

async function loadUsers() {
  const { data } = await supabase.from('users').select('id, first_name').not('first_name', 'is', null).order('first_name');
  users = data || [];
}

async function loadSchedule() {
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
    const options = users.map(u => `<option value="${u.first_name}" ${byRole[r] === u.first_name ? 'selected' : ''}>${u.first_name}</option>`).join('');
    return `
      <div class="role-field">
        <label>${ROLE_LABELS[r]}</label>
        <input type="text" data-role="${r}" value="${(byRole[r] || '').replace(/"/g, '&quot;')}" placeholder="Имя участника" list="users-list">
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
  const fields = document.querySelectorAll('.role-field input');
  const tg = window.Telegram?.WebApp;

  for (const input of fields) {
    const role = input.dataset.role;
    const name = input.value.trim();
    if (!name) continue;

    let userId = users.find(u => u.first_name === name)?.id;
    if (!userId) {
      const { data: newUser } = await supabase.from('users').insert({ id: -Date.now(), first_name: name }).select('id').single();
      if (newUser) userId = newUser.id;
      else userId = -Date.now();
      await supabase.from('users').upsert({ id: userId, first_name: name }, { onConflict: 'id' });
      users.push({ id: userId, first_name: name });
    }

    await supabase.from('service_schedule').upsert({
      user_id: userId,
      first_name: name,
      month: currentMonth,
      year: currentYear,
      day_of_month: editingDay,
      role,
    }, { onConflict: 'user_id,month,year,day_of_month,role' });
  }

  if (tg?.showPopup) tg.showPopup({ title: 'Сохранено', message: 'График обновлён' });
  document.getElementById('dayEdit').hidden = true;
  await loadSchedule();
  render();
}

init().catch(err => {
  console.error(err);
  document.getElementById('loader').innerHTML = `<span style="color:#ef4444">Ошибка: ${err.message}</span>`;
});
