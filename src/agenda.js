import { escapeHtml } from './charts.js';
import { PRIORITY_LABEL, STATUS_LABEL, dueState, percent } from './model.js';
import { monthGrid, ymd } from './schedule.js';

const monthFmt = new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const shortId = (id) => String(id ?? '').slice(-6).toUpperCase();

function chip(task, { removable }) {
  const light = dueState(task);
  return `<span class="chip light-${light}" draggable="true" data-id="${escapeHtml(task.id)}"
    title="${escapeHtml(task.title)}">
    <span class="chip-text">${escapeHtml(task.title)}</span>
    ${removable ? '<button class="chip-x" type="button" data-unschedule aria-label="Quitar del día">×</button>' : ''}
  </span>`;
}

export function calendarHtml({ cursor, plan, tasks, today = new Date() }) {
  const byDay = new Map();
  for (const task of tasks) {
    const day = plan[task.id];
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(task);
  }

  const dueByDay = new Map();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const day = ymd(new Date(task.dueDate));
    dueByDay.set(day, (dueByDay.get(day) ?? 0) + 1);
  }

  const head = WEEKDAYS.map((name) => `<span class="cal-weekday">${name}</span>`).join('');
  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth()).map((date) => {
    const day = ymd(date);
    const outside = date.getMonth() !== cursor.getMonth();
    const isToday = day === ymd(today);
    const scheduled = byDay.get(day) ?? [];
    const due = dueByDay.get(day) ?? 0;
    return `
      <div class="day${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}" data-day="${day}">
        <header>
          <span class="day-number">${date.getDate()}</span>
          ${due ? `<span class="day-due" title="${due} ${due === 1 ? 'tarea vence' : 'tareas vencen'} este día">${due} vence${due === 1 ? '' : 'n'}</span>` : ''}
        </header>
        <div class="day-chips">${scheduled.map((task) => chip(task, { removable: true })).join('')}</div>
      </div>`;
  }).join('');

  return `<div class="cal-weekdays">${head}</div><div class="cal-grid">${cells}</div>`;
}

export function poolHtml(tasks) {
  if (!tasks.length) return '<p class="empty">Nada pendiente que coincida.</p>';
  return tasks.map((task) => `
    <article class="pool-item" draggable="true" data-id="${escapeHtml(task.id)}">
      <header>
        <span class="task-id">${shortId(task.id)}</span>
        <span class="tag prio-${task.priority}">${PRIORITY_LABEL[task.priority] ?? task.priority}</span>
        <span class="tag st-${task.status}">${STATUS_LABEL[task.status] ?? task.status}</span>
      </header>
      <p class="pool-title">${escapeHtml(task.title)}</p>
      <footer>
        <i class="light ${dueState(task)}"></i>
        <span>${task.dueDate ? new Date(task.dueDate).toLocaleDateString('es-PA') : 'sin fecha'}</span>
        <span class="muted">${percent(task)}%</span>
      </footer>
    </article>`).join('');
}

export const monthTitle = (cursor) => monthFmt.format(cursor);
