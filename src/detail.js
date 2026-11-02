import { escapeHtml } from './charts.js';
import { PRIORITY_LABEL, STATUS_LABEL, dueState, percent } from './model.js';

const dateFmt = new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium' });
const stampFmt = new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', timeStyle: 'short' });

const stamp = (value, fmt = stampFmt) => (value ? fmt.format(new Date(value)) : '—');

function field(label, value) {
  return `<div class="field-row"><dt>${label}</dt><dd>${value}</dd></div>`;
}

export function detailHtml(task, { objectiveTitle, plannedDay } = {}) {
  const light = dueState(task);
  const names = (task.assignees ?? []).map((person) => escapeHtml(person.name)).join(', ');
  const lightLabel = {
    overdue: 'vencida', soon: 'por vencer', ok: 'al día', done: 'completada', none: 'sin fecha',
  }[light];

  const extended = task.originalDueDate && task.originalDueDate !== task.dueDate
    ? field('Fecha original', `${stamp(task.originalDueDate, dateFmt)} <span class="muted">(extendida)</span>`)
    : '';

  return `
  <article class="detail">
    <header class="detail-head">
      <div>
        <span class="task-id">${escapeHtml(task.id)}</span>
        <h3>${escapeHtml(task.title)}</h3>
      </div>
      <div class="detail-tags">
        <span class="tag prio-${task.priority}">${PRIORITY_LABEL[task.priority] ?? task.priority}</span>
        <span class="tag st-${task.status}">${STATUS_LABEL[task.status] ?? task.status}</span>
      </div>
    </header>

    <dl class="fields">
      ${field('Avance', `<span class="meter"><span class="meter-track"><span class="meter-fill${percent(task) >= 100 ? ' full' : ''}" style="width:${percent(task)}%"></span></span><b>${percent(task)}%</b></span>`)}
      ${field('Asignado', names || '<span class="muted">Sin asignar</span>')}
      ${field('Fecha límite', `<i class="light ${light}"></i>${stamp(task.dueDate, dateFmt)} <span class="muted">${lightLabel}</span>`)}
      ${extended}
      ${field('Agendada', plannedDay ? dateFmt.format(new Date(`${plannedDay}T12:00:00`)) : '<span class="muted">sin agendar</span>')}
      ${field('Objetivo', objectiveTitle ? escapeHtml(objectiveTitle) : '<span class="muted">sin objetivo</span>')}
      ${field('Horas', task.hoursSpent ?? '—')}
      ${field('Creada por', `${escapeHtml(task.createdBy?.name ?? '—')} <span class="muted">${stamp(task.createdAt, dateFmt)}</span>`)}
      ${field('Última edición', stamp(task.updatedAt))}
      ${field('Completada', stamp(task.completedAt))}
      ${field('Tipo', `${escapeHtml(task.type ?? '—')}${task.parentTask ? ` · subtarea de <span class="muted">${escapeHtml(task.parentTask.title)}</span>` : ''}`)}
      ${task.tags?.length ? field('Etiquetas', task.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')) : ''}
      ${task.feedback ? field('Feedback', escapeHtml(task.feedback)) : ''}
    </dl>

    ${task.description ? `<section class="detail-desc"><h4>Descripción</h4><pre>${escapeHtml(task.description)}</pre></section>` : ''}
  </article>`;
}
