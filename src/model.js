const DAY_MS = 86_400_000;
const SOON_DAYS = 3;
const MAX_POINTS = 90;

export const STATUS_LABEL = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En curso',
  IN_REVIEW: 'En revisión',
  COMPLETED: 'Completada',
  DISCARDED: 'Descartada',
};

export const PRIORITY_LABEL = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

export const isDone = (task) => task.status === 'COMPLETED';
export const isCounted = (task) => task.status !== 'DISCARDED';

// La API no expone un historial de cambios de estado. completedAt es el dato
// bueno; updatedAt es el respaldo cuando la tarea se cerró sin sellarlo, y
// adelanta la curva si hubo ediciones posteriores al cierre.
export const closedAt = (task) => task.completedAt ?? task.updatedAt ?? null;

export const percent = (task) => (isDone(task) ? 100 : Number(task.progress) || 0);

// Agrupación de objetivos. Por defecto reconoce las convenciones de nombre más
// comunes; el patrón se cambia en Configuración. Si ningún objetivo encaja, cada
// objetivo es su propio grupo, que es lo correcto cuando no hay convención.
export const DEFAULT_GROUP_PATTERN = '(entregable|fase|hito|sprint|etapa|release)\\s*\\d+';

const OTHERS = '__otros__';
export const ALL = '__todos__';

function safePattern(source) {
  if (!source || !source.trim()) return null;
  try {
    return new RegExp(source, 'i');
  } catch {
    return null;
  }
}

const tidy = (text) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const trailingNumber = (label) => {
  const match = /(\d+)\s*$/.exec(label);
  return match ? Number(match[1]) : null;
};

function byLabel(a, b) {
  if (a.key === OTHERS) return 1;
  if (b.key === OTHERS) return -1;
  const left = trailingNumber(a.label);
  const right = trailingNumber(b.label);
  const prefix = a.label.replace(/\d+\s*$/, '').localeCompare(b.label.replace(/\d+\s*$/, ''));
  if (left !== null && right !== null && prefix === 0) return left - right;
  return a.label.localeCompare(b.label);
}

/**
 * Devuelve { mode, groups }. mode es 'patron' cuando al menos un objetivo encaja
 * con el patrón, y 'objetivo' cuando no encaja ninguno y se cae al objetivo suelto.
 */
export function groupObjectives(objectives, patternSource = DEFAULT_GROUP_PATTERN) {
  const pattern = safePattern(patternSource);
  const groups = new Map();
  const loose = [];

  for (const objective of objectives) {
    const match = pattern?.exec(objective.title ?? '');
    if (!match) {
      loose.push(objective);
      continue;
    }
    const label = tidy(match[0]);
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, label, objectives: [] });
    groups.get(key).objectives.push(objective);
  }

  if (!groups.size) {
    // Sin convención no hay entregables que armar, así que la opción por defecto
    // es verlo todo junto; los objetivos sueltos quedan debajo para enfocar uno.
    const sueltos = objectives
      .map((objective) => ({ key: objective.id, label: objective.title ?? objective.id, objectives: [objective] }))
      .sort(byLabel);
    const todos = { key: ALL, label: 'Mostrar todos', objectives: [...objectives] };
    return { mode: 'objetivo', groups: objectives.length > 1 ? [todos, ...sueltos] : sueltos };
  }

  if (loose.length) groups.set(OTHERS, { key: OTHERS, label: 'Sin agrupar', objectives: loose });
  return { mode: 'patron', groups: [...groups.values()].sort(byLabel) };
}

export function dueState(task, now = new Date()) {
  if (isDone(task)) return 'done';
  if (!task.dueDate) return 'none';
  const days = (new Date(task.dueDate) - now) / DAY_MS;
  if (days < 0) return 'overdue';
  if (days <= SOON_DAYS) return 'soon';
  return 'ok';
}

export function summarize(tasks, now = new Date()) {
  const counted = tasks.filter(isCounted);
  const by = (status) => counted.filter((task) => task.status === status).length;
  return {
    total: counted.length,
    done: by('COMPLETED'),
    inReview: by('IN_REVIEW'),
    inProgress: by('IN_PROGRESS'),
    todo: by('TODO'),
    discarded: tasks.length - counted.length,
    overdue: counted.filter((task) => dueState(task, now) === 'overdue').length,
    noDueDate: counted.filter((task) => !task.dueDate).length,
    progress: counted.length
      ? Math.round(counted.reduce((sum, task) => sum + percent(task), 0) / counted.length)
      : 0,
  };
}

// Rango por defecto: de la tarea más antigua al vencimiento más lejano.
export function defaultRange(tasks) {
  const counted = tasks.filter(isCounted);
  const starts = counted.map((task) => task.createdAt).filter(Boolean).map(Date.parse);
  const ends = counted.map((task) => task.dueDate).filter(Boolean).map(Date.parse);
  if (!starts.length) return null;
  const start = new Date(Math.min(...starts));
  const end = ends.length ? new Date(Math.max(...ends)) : new Date(Math.max(...starts) + 30 * DAY_MS);
  return { start, end: end > start ? end : new Date(start.getTime() + 30 * DAY_MS) };
}

export function burndown(tasks, { start, end, now = new Date() }) {
  const counted = tasks.filter(isCounted);
  const from = new Date(start);
  const to = new Date(end);
  if (!counted.length || !(from < to)) return { points: [], total: 0, remaining: 0 };

  const total = counted.length;
  const closures = counted
    .filter(isDone)
    .map((task) => Date.parse(closedAt(task)))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const span = Math.max(1, Math.ceil((to - from) / DAY_MS));
  const step = Math.max(1, Math.ceil(span / MAX_POINTS));
  const remainingAt = (time) => total - closures.filter((closed) => closed <= time).length;

  const stamps = [];
  for (let day = 0; day <= span; day += step) stamps.push(from.getTime() + day * DAY_MS);
  if (stamps[stamps.length - 1] !== to.getTime()) stamps.push(to.getTime());
  if (now > from && now < to) stamps.push(now.getTime());
  stamps.sort((a, b) => a - b);

  const points = [...new Set(stamps)].map((time) => ({
    date: new Date(time),
    ideal: Math.max(0, total * (1 - (time - from) / (to - from))),
    real: time <= now.getTime() ? remainingAt(time) : null,
  }));

  return { points, total, remaining: remainingAt(now.getTime()) };
}

export function perDeveloper(tasks, now = new Date()) {
  const rows = new Map();
  const row = (id, name) => {
    if (!rows.has(id)) {
      rows.set(id, { id, name, total: 0, done: 0, inReview: 0, inProgress: 0, todo: 0, overdue: 0, sum: 0 });
    }
    return rows.get(id);
  };

  for (const task of tasks.filter(isCounted)) {
    const assignees = task.assignees?.length ? task.assignees : [{ id: '__none__', name: 'Sin asignar' }];
    for (const assignee of assignees) {
      const entry = row(assignee.id, assignee.name ?? 'Sin nombre');
      entry.total += 1;
      entry.sum += percent(task);
      if (task.status === 'COMPLETED') entry.done += 1;
      else if (task.status === 'IN_REVIEW') entry.inReview += 1;
      else if (task.status === 'IN_PROGRESS') entry.inProgress += 1;
      else entry.todo += 1;
      if (dueState(task, now) === 'overdue') entry.overdue += 1;
    }
  }

  return [...rows.values()]
    .map((entry) => ({ ...entry, progress: entry.total ? Math.round(entry.sum / entry.total) : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
