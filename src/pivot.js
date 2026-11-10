import { escapeHtml, meterHtml } from './charts.js';
import { STATUS_LABEL, dueState, isCounted, percent, perDeveloper, summarize } from './model.js';

const SIN_ASIGNAR = '__none__';

export const objectiveKey = (objective) => `o:${objective.id}`;
export const personKey = (objective, person) => `o:${objective.id}:p:${person.id}`;

const assigneesOf = (task) =>
  task.assignees?.length ? task.assignees : [{ id: SIN_ASIGNAR, name: 'Sin asignar' }];

function row({ level, key, label, expandable, open, stats, extra = '' }) {
  const twisty = expandable
    ? `<button class="twisty" type="button" aria-expanded="${open}" aria-label="${open ? 'Contraer' : 'Expandir'}"></button>`
    : '<span class="twisty-space"></span>';
  return `
    <tr class="pivot lvl-${level}${open ? ' is-open' : ''}${expandable ? ' is-expandable' : ''}" data-key="${escapeHtml(key)}">
      <td class="pivot-name">${twisty}<span class="pivot-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>${extra}</td>
      <td class="num">${stats.total ?? ''}</td>
      <td class="num">${stats.done ?? ''}</td>
      <td class="num">${stats.overdue || ''}</td>
      <td>${meterHtml(stats.progress)}</td>
    </tr>`;
}

function taskRow(task, key) {
  const light = dueState(task);
  return `
    <tr class="pivot lvl-2 is-task" data-key="${escapeHtml(key)}" data-task="${escapeHtml(task.id)}">
      <td class="pivot-name">
        <span class="twisty-space"></span>
        <span class="pivot-label" title="Abrir el detalle">${escapeHtml(task.title)}</span>
        <span class="tag st-${task.status}">${STATUS_LABEL[task.status] ?? task.status}</span>
      </td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num">${light === 'overdue' ? '<i class="light overdue"></i>' : ''}</td>
      <td>${meterHtml(percent(task))}</td>
    </tr>`;
}

/**
 * Objetivo › persona › tarea. Una tarea con dos asignados aparece bajo cada uno,
 * igual que en la carga por desarrollador, así que la suma de las personas puede
 * superar el total del objetivo.
 */
export function pivotHtml({ objectives, tasksOf, expanded }) {
  if (!objectives.length) return '<tr><td colspan="5" class="empty">Sin objetivos.</td></tr>';

  return objectives.map((objective) => {
    const tasks = tasksOf(objective.id);
    const oKey = objectiveKey(objective);
    const oOpen = expanded.has(oKey);
    const filas = [row({
      level: 0, key: oKey, label: objective.title, expandable: tasks.length > 0,
      open: oOpen, stats: summarize(tasks),
    })];

    if (!oOpen) return filas.join('');

    for (const persona of perDeveloper(tasks)) {
      const pKey = personKey(objective, persona);
      const pOpen = expanded.has(pKey);
      filas.push(row({ level: 1, key: pKey, label: persona.name, expandable: true, open: pOpen, stats: persona }));
      if (!pOpen) continue;

      const suyas = tasks
        .filter(isCounted)
        .filter((task) => assigneesOf(task).some((quien) => quien.id === persona.id))
        .sort((a, b) => percent(a) - percent(b) || a.title.localeCompare(b.title));
      filas.push(...suyas.map((task) => taskRow(task, `${pKey}:t:${task.id}`)));
    }

    return filas.join('');
  }).join('');
}
