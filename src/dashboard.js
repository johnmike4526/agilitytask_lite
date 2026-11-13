import { AgilityClient } from './api.js';
import { loadConfig, saveConfig } from './store.js';
import { burndownSvg, workloadBars, escapeHtml, meterHtml } from './charts.js';
import { pivotHtml } from './pivot.js';
import { menuHtml, summaryText, toggle } from './multiselect.js';
import {
  PRIORITY_LABEL, STATUS_LABEL, burndown, defaultRange, groupObjectives,
  closedAt, dueState, isCounted, isDone, percent, perDeveloper, summarize,
} from './model.js';
import { loadPlan, schedule } from './schedule.js';
import { calendarHtml, monthTitle, poolHtml } from './agenda.js';
import { detailHtml } from './detail.js';

const $ = (selector) => document.querySelector(selector);
const dateFmt = new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' });
const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// Los tres filtros de la tabla de tareas son multiseleccion: nada marcado
// significa «sin filtro», igual que la antigua opcion «Todos».
const FILTROS = {
  assignee: { id: '#filter-assignee', vacio: 'Todos los asignados', plural: 'asignados' },
  status: { id: '#filter-status', vacio: 'Todos los estados', plural: 'estados' },
  due: { id: '#filter-due', vacio: 'Cualquier fecha', plural: 'vencimientos' },
};
const OPCIONES_ESTADO = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'DISCARDED']
  .map((value) => ({ value, label: STATUS_LABEL[value] }));
const OPCIONES_FECHA = [
  { value: 'overdue', label: 'Vencidas' },
  { value: 'soon', label: 'Por vencer (3 días)' },
  { value: 'ok', label: 'Al día' },
  { value: 'none', label: 'Sin fecha' },
];
const STATUS_RANK = { IN_PROGRESS: 0, IN_REVIEW: 1, TODO: 2, COMPLETED: 3, DISCARDED: 4 };

const state = {
  config: null,
  objectives: [],
  projects: [],
  tasks: [],
  groups: [],
  group: '',
  groupMode: 'patron',
  sort: { key: 'dueDate', dir: 1 },
  filters: { search: '', assignee: [], status: [], due: [] },
  filterOptions: { assignee: [], status: OPCIONES_ESTADO, due: OPCIONES_FECHA },
  me: null,
  plan: {},
  calCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  agendaSearch: '',
  agendaAll: false,
  agendaDone: false,
  expanded: new Set(),
  findQuery: '',
  findSelected: null,
};

// ── Utilidades de presentación ───────────────────────────────────────────────

function note(message, isError = false) {
  const element = $('#status');
  element.textContent = message ?? '';
  element.classList.toggle('error', isError);
  element.hidden = !message;
}

const shortId = (id) => String(id ?? '').slice(-6).toUpperCase();
const assigneeNames = (task) => (task.assignees ?? []).map((a) => a.name).filter(Boolean);

// El manifest ya no fija el host: se pide permiso para el que se configure, y
// solo para ese. chrome.permissions.request exige un gesto del usuario, de ahí
// que cuelgue de los botones y no del arranque.
function originOf(baseUrl) {
  try {
    return `${new URL(baseUrl).origin}/*`;
  } catch {
    return null;
  }
}

async function hasHostAccess(baseUrl) {
  const origin = originOf(baseUrl);
  return origin ? chrome.permissions.contains({ origins: [origin] }) : false;
}

async function ensureHostAccess(baseUrl) {
  const origin = originOf(baseUrl);
  if (!origin) throw new Error('La URL base no es válida.');
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error(`Sin permiso para ${origin}: la extensión no puede consultar la API.`);
}

function client() {
  return new AgilityClient({ apiKey: state.config.apiKey, baseUrl: state.config.baseUrl });
}

// ── Datos ────────────────────────────────────────────────────────────────────

function objectivesOfGroup() {
  return state.groups.find((group) => group.key === state.group)?.objectives ?? [];
}

function tasksOfGroup() {
  const ids = new Set(objectivesOfGroup().map((objective) => objective.id));
  return state.tasks.filter((task) => ids.has(task.objectiveId));
}

function burndownRange(tasks) {
  const { rangeStart, rangeEnd } = state.config;
  if (rangeStart && rangeEnd) return { start: new Date(`${rangeStart}T00:00:00`), end: new Date(`${rangeEnd}T23:59:59`) };
  return defaultRange(tasks);
}

async function refresh() {
  if (!state.config.apiKey || !state.config.projectId) {
    note('Configura la API key y el proyecto en la pestaña Configuración.', true);
    return;
  }
  const button = $('#refresh');
  button.disabled = true;
  note('Consultando AgilityTask…');
  try {
    if (!(await hasHostAccess(state.config.baseUrl))) {
      throw new Error('Falta autorizar el host de la API: abre Configuración y pulsa Guardar.');
    }
    const api = client();
    const [objectives, tasks, me] = await Promise.all([
      api.objectives(state.config.projectId),
      api.tasks(state.config.projectId),
      api.me().catch(() => null),
    ]);
    state.objectives = objectives;
    state.tasks = tasks;
    state.me = me?.id ?? null;
    const grouped = groupObjectives(objectives, state.config.groupPattern);
    state.groups = grouped.groups;
    state.groupMode = grouped.mode;
    if (!state.groups.some((group) => group.key === state.group)) {
      state.group = state.groups[0]?.key ?? '';
    }
    renderGroupSelect();
    render();
    note(`${tasks.length} tareas y ${objectives.length} objetivos leídos a las ${new Date().toLocaleTimeString('es-PA')}.`);
  } catch (error) {
    note(error.message, true);
  } finally {
    button.disabled = false;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

// Los dos desplegables de proyecto se llenan de la misma lista: el del
// encabezado para cambiar de proyecto sobre la marcha, el de Configuración para
// el primer alta. Si la lista todavía no llegó, se muestra el guardado para no
// dejar el encabezado vacío.
function renderProjectSelects() {
  const proyectos = state.projects.length
    ? state.projects
    : [{ id: state.config.projectId, name: state.config.projectName || state.config.projectId }].filter((p) => p.id);
  const opciones = proyectos
    .map((proyecto) => `<option value="${escapeHtml(proyecto.id)}">${escapeHtml(proyecto.name)}</option>`)
    .join('');

  for (const id of ['#project', '#cfg-project']) {
    const select = $(id);
    select.innerHTML = opciones;
    select.value = state.config.projectId;
  }
}

function renderGroupSelect() {
  const select = $('#deliverable');
  select.innerHTML = state.groups
    .map((group) => {
      const count = group.objectives.length;
      const suffix = count > 1 ? ` · ${count} objetivo${count === 1 ? '' : 's'}` : '';
      return `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}${suffix}</option>`;
    })
    .join('');
  select.value = state.group;
  const aviso = $('#group-mode');
  const mensaje = state.groupMode === 'patron'
    ? ''
    : 'Ningún objetivo de este proyecto encaja con el patrón de agrupación. Se abre en «Mostrar todos», con cada objetivo disponible por separado en la lista. El patrón se cambia en Configuración.';
  aviso.dataset.tip = mensaje;
  aviso.setAttribute('aria-label', mensaje);
  aviso.hidden = !mensaje;
}

function render() {
  const tasks = tasksOfGroup();
  renderKpis(tasks);
  renderBurndown(tasks);
  renderWorkload(tasks);
  renderObjectives();
  renderAssigneeFilter(tasks);
  renderTasks(tasks);
  renderAgenda();
  renderFind();
}

function renderKpis(tasks) {
  const stats = summarize(tasks);
  // Cada tarjeta lleva el filtro que la reproduce en la tabla de tareas. La del
  // avance promedio no: no hay subconjunto que mostrar.
  const cards = [
    { label: 'Tareas', value: stats.total, campo: 'todas' },
    { label: 'Completadas', value: stats.done, tone: 'is-green', campo: 'status', valor: 'COMPLETED' },
    { label: 'En revisión', value: stats.inReview, campo: 'status', valor: 'IN_REVIEW' },
    { label: 'En curso', value: stats.inProgress, campo: 'status', valor: 'IN_PROGRESS' },
    { label: 'Por hacer', value: stats.todo, campo: 'status', valor: 'TODO' },
    { label: 'Vencidas', value: stats.overdue, tone: stats.overdue ? 'is-red' : '', campo: 'due', valor: 'overdue' },
    { label: 'Sin fecha', value: stats.noDueDate, campo: 'due', valor: 'none' },
    { label: 'Avance promedio', value: `${stats.progress}%` },
  ];

  $('#kpis').innerHTML = cards.map((card) => {
    const cuerpo = `<b>${card.value}</b><span>${card.label}</span>`;
    if (!card.campo) return `<div class="kpi ${card.tone ?? ''}">${cuerpo}</div>`;
    const valor = card.valor ? ` data-valor="${card.valor}"` : '';
    return `<button type="button" class="kpi is-link ${card.tone ?? ''}" data-campo="${card.campo}"${valor}
      title="Ver estas tareas">${cuerpo}</button>`;
  }).join('');
  $('#kpis').hidden = false;
}

function renderBurndown(tasks) {
  const range = burndownRange(tasks);
  if (!range) {
    $('#burndown').innerHTML = '<p class="empty">Este entregable no tiene tareas.</p>';
    $('#burndown-range').textContent = '';
    return;
  }
  const result = burndown(tasks, range);
  $('#burndown').innerHTML = burndownSvg(result);
  const ideal = result.points.find((point) => point.real !== null && point.date <= new Date())
    ? result.points.filter((point) => point.real !== null).pop().ideal
    : result.total;
  const delta = Math.round(result.remaining - ideal);
  const verdict = delta > 0 ? `${delta} tareas por encima de la línea ideal` : `${Math.abs(delta)} por debajo de la ideal`;
  $('#burndown-range').textContent =
    `${dateFmt.format(range.start)} – ${dateFmt.format(range.end)} · ${result.remaining} de ${result.total} abiertas · ${verdict}`;
}

function renderWorkload(tasks) {
  const rows = perDeveloper(tasks);
  $('#workload').innerHTML = workloadBars(rows);
  $('#workload-table tbody').innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="num">${row.total}</td>
        <td class="num">${row.done}</td>
        <td class="num">${row.inReview}</td>
        <td class="num">${row.inProgress}</td>
        <td class="num">${row.todo}</td>
        <td class="num">${row.overdue || ''}</td>
        <td>${meterHtml(row.progress)}</td>
      </tr>`)
    .join('');
}

const tasksOfObjective = (objectiveId) => state.tasks.filter((task) => task.objectiveId === objectiveId);

function renderObjectives() {
  $('#objectives-table tbody').innerHTML = pivotHtml({
    objectives: objectivesOfGroup(),
    tasksOf: tasksOfObjective,
    expanded: state.expanded,
  });
}

function renderFilter(campo) {
  const { id, vacio, plural } = FILTROS[campo];
  const opciones = state.filterOptions[campo];
  const elegidas = state.filters[campo];
  $(`${id} .multi-menu`).innerHTML = menuHtml(opciones, elegidas);
  $(`${id} .multi-text`).textContent = summaryText(opciones, elegidas, vacio, plural);
  $(id).classList.toggle('has-filter', elegidas.length > 0);
}

function renderFilters() {
  for (const campo of Object.keys(FILTROS)) renderFilter(campo);
  const activos = Object.keys(FILTROS).some((campo) => state.filters[campo].length) || state.filters.search;
  $('#filters-clear').hidden = !activos;
}

function renderAssigneeFilter(tasks) {
  const nombres = [...new Set(tasks.flatMap(assigneeNames))].sort((a, b) => a.localeCompare(b));
  state.filterOptions.assignee = [
    { value: '__none__', label: 'Sin asignar' },
    ...nombres.map((name) => ({ value: name, label: name })),
  ];
  // Al cambiar de grupo o de proyecto puede desaparecer gente ya marcada.
  const vigentes = new Set(state.filterOptions.assignee.map((opcion) => opcion.value));
  state.filters.assignee = state.filters.assignee.filter((valor) => vigentes.has(valor));
  renderFilters();
}

function applyFilters(tasks) {
  const { search, assignee, status, due } = state.filters;
  const needle = search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (status.length ? !status.includes(task.status) : !isCounted(task)) return false;
    if (assignee.length) {
      const names = assigneeNames(task);
      const coincide = assignee.some((valor) => (valor === '__none__' ? !names.length : names.includes(valor)));
      if (!coincide) return false;
    }
    if (due.length && !due.includes(dueState(task))) return false;
    if (needle) {
      const haystack = `${task.title} ${shortId(task.id)} ${task.id} ${names.join(' ')}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function sortValue(task, key) {
  switch (key) {
    case 'id': return shortId(task.id);
    case 'priority': return PRIORITY_RANK[task.priority] ?? 9;
    case 'title': return (task.title ?? '').toLowerCase();
    case 'assignee': return (assigneeNames(task)[0] ?? 'zzz').toLowerCase();
    case 'progress': return percent(task);
    case 'status': return STATUS_RANK[task.status] ?? 9;
    case 'dueDate': return task.dueDate ? Date.parse(task.dueDate) : Number.MAX_SAFE_INTEGER;
    default: return 0;
  }
}

function renderTasks(tasks) {
  const visible = applyFilters(tasks).sort((a, b) => {
    const left = sortValue(a, state.sort.key);
    const right = sortValue(b, state.sort.key);
    if (left < right) return -state.sort.dir;
    if (left > right) return state.sort.dir;
    return 0;
  });

  $('#task-count').textContent = `${visible.length} de ${tasks.filter(isCounted).length} tareas`;
  $('#tasks-table tbody').innerHTML = visible.map((task) => {
    const light = dueState(task);
    const names = assigneeNames(task);
    const hint = light === 'overdue' ? 'Vencida' : light === 'soon' ? 'Vence en 3 días o menos' : '';
    return `
      <tr class="is-task" data-task="${escapeHtml(task.id)}" title="Abrir el detalle">
        <td class="task-id" title="${escapeHtml(task.id)}">${shortId(task.id)}</td>
        <td><span class="tag prio-${task.priority}">${PRIORITY_LABEL[task.priority] ?? task.priority}</span></td>
        <td class="task-title">${escapeHtml(task.title)}</td>
        <td>${names.length ? escapeHtml(names.join(', ')) : '<span class="muted">Sin asignar</span>'}</td>
        <td>${meterHtml(percent(task))}</td>
        <td class="date ${light === 'overdue' ? 'overdue' : ''}" title="${hint}">
          <i class="light ${light}"></i>${task.dueDate ? dateFmt.format(new Date(task.dueDate)) : '—'}
        </td>
        <td><span class="tag st-${task.status}">${STATUS_LABEL[task.status] ?? task.status}</span></td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">Ninguna tarea coincide con los filtros.</td></tr>';
}

// ── Configuración ────────────────────────────────────────────────────────────

// Cambiar de proyecto invalida el grupo elegido y el árbol abierto del pivote:
// son de otro proyecto.
async function switchProject(projectId) {
  const elegido = state.projects.find((proyecto) => proyecto.id === projectId);
  state.config = await saveConfig({
    projectId,
    projectName: elegido?.name ?? projectId,
    group: '',
  });
  state.group = '';
  state.expanded.clear();
  renderProjectSelects();
  await refresh();
}

function fillConfigForm() {
  $('#cfg-base').value = state.config.baseUrl;
  $('#cfg-key').value = state.config.apiKey;
  $('#agenda-all').checked = state.config.agendaAll;
  $('#agenda-done').checked = state.config.agendaDone;
  $('#cfg-pattern').value = state.config.groupPattern;
  $('#cfg-start').value = state.config.rangeStart;
  $('#cfg-end').value = state.config.rangeEnd;
  renderProjectSelects();
}

function formConfig() {
  return { baseUrl: $('#cfg-base').value.trim(), apiKey: $('#cfg-key').value.trim() };
}

async function loadProjects() {
  const status = $('#config-status');
  try {
    status.textContent = 'Cargando proyectos…';
    const config = formConfig();
    await ensureHostAccess(config.baseUrl);
    state.projects = await new AgilityClient(config).projects();
    renderProjectSelects();
    status.textContent = `${state.projects.length} proyectos disponibles.`;
  } catch (error) {
    status.textContent = error.message;
  }
}

// ── Eventos ──────────────────────────────────────────────────────────────────

function showTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.classList.toggle('is-active', panel.id === `panel-${name}`);
  }
}

function wire() {
  $('#refresh').addEventListener('click', refresh);

  $('#project').addEventListener('change', (event) => switchProject(event.target.value));

  $('#deliverable').addEventListener('change', (event) => {
    state.group = event.target.value;
    saveConfig({ group: state.group }).then((config) => { state.config = config; });
    render();
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  }

  $('#search').addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderFilters();
    renderTasks(tasksOfGroup());
  });

  for (const [campo, { id }] of Object.entries(FILTROS)) {
    $(id).addEventListener('change', (event) => {
      const casilla = event.target;
      state.filters[campo] = toggle(state.filters[campo], casilla.value, casilla.checked);
      renderFilter(campo);
      renderFilters();
      renderTasks(tasksOfGroup());
    });
  }

  // Un desplegable abierto se cierra al pulsar fuera; <details> por si solo
  // solo se cierra con su propio resumen.
  document.addEventListener('click', (event) => {
    for (const { id } of Object.values(FILTROS)) {
      const menu = $(id);
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    }
  });

  $('#filters-clear').addEventListener('click', () => {
    state.filters = { search: '', assignee: [], status: [], due: [] };
    $('#search').value = '';
    renderFilters();
    renderTasks(tasksOfGroup());
  });

  $('#kpis').addEventListener('click', (event) => {
    const tarjeta = event.target.closest('[data-campo]');
    if (!tarjeta) return;
    const { campo, valor } = tarjeta.dataset;
    state.filters = { search: '', assignee: [], status: [], due: [] };
    if (campo !== 'todas') state.filters[campo] = [valor];
    $('#search').value = '';
    renderFilters();
    renderTasks(tasksOfGroup());
    showTab('tareas');
  });

  $('#tasks-table').addEventListener('click', (event) => {
    const fila = event.target.closest('[data-task]');
    if (fila) openInFinder(fila.dataset.task);
  });

  for (const header of document.querySelectorAll('#tasks-table th[data-sort]')) {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
      renderTasks(tasksOfGroup());
    });
  }

  $('#test').addEventListener('click', async () => {
    const status = $('#config-status');
    try {
      const config = formConfig();
      await ensureHostAccess(config.baseUrl);
      const me = await new AgilityClient(config).me();
      status.textContent = `Conectado como ${me.name ?? me.email ?? 'usuario'}.`;
    } catch (error) {
      status.textContent = error.message;
    }
  });

  $('#load-projects').addEventListener('click', loadProjects);

  $('#objectives-table').addEventListener('click', (event) => {
    const fila = event.target.closest('.pivot');
    if (!fila) return;
    if (fila.dataset.task) {
      openInFinder(fila.dataset.task);
      return;
    }
    if (!fila.classList.contains('is-expandable')) return;
    const key = fila.dataset.key;
    if (state.expanded.has(key)) {
      // Cerrar un objetivo cierra también las personas que colgaban de él.
      for (const abierta of [...state.expanded]) {
        if (abierta === key || abierta.startsWith(`${key}:`)) state.expanded.delete(abierta);
      }
    } else {
      state.expanded.add(key);
    }
    renderObjectives();
  });

  wireAgenda();
  wireFind();

  $('#config-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await ensureHostAccess($('#cfg-base').value.trim());
    } catch (error) {
      $('#config-status').textContent = error.message;
      return;
    }
    const select = $('#cfg-project');
    state.config = await saveConfig({
      ...formConfig(),
      projectId: select.value,
      projectName: state.projects.find((proyecto) => proyecto.id === select.value)?.name ?? select.value,
      groupPattern: $('#cfg-pattern').value.trim(),
      rangeStart: $('#cfg-start').value,
      rangeEnd: $('#cfg-end').value,
    });
    $('#config-status').textContent = 'Guardado.';
    renderProjectSelects();
    await refresh();
  });
}

(async function start() {
  state.config = await loadConfig();
  state.plan = await loadPlan();
  state.group = state.config.group;
  state.agendaAll = state.config.agendaAll;
  state.agendaDone = state.config.agendaDone;
  fillConfigForm();
  wire();
  renderFilters();
  renderAgenda();
  renderFind();
  if (state.config.apiKey && (await hasHostAccess(state.config.baseUrl))) {
    // Sin esto el desplegable arranca con la única opción que dejó fillConfigForm,
    // la guardada, y parece que la cuenta solo tuviera ese proyecto.
    await loadProjects().catch(() => {});
  }
  if (state.config.apiKey && state.config.projectId) await refresh();
  else note('Primer uso: abre Configuración, pega la API key y elige el proyecto.');
})();

// ── Agenda ───────────────────────────────────────────────────────────────────

const OPEN_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'IN_REVIEW']);

const isMine = (task) => (task.assignees ?? []).some((person) => person.id === state.me);

function agendaScope() {
  return state.agendaAll ? state.tasks : tasksOfGroup();
}

function myOpenTasks() {
  return agendaScope().filter((task) => OPEN_STATUSES.has(task.status) && isMine(task));
}

// Lo que cerré, por el día en que se cerró. No entra al listado lateral: ya no
// hay nada que planificar, solo deja ver en qué se fue cada día.
function myDoneTasks() {
  return agendaScope().filter((task) => isDone(task) && isMine(task) && closedAt(task));
}

function matches(task, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${task.title} ${task.id}`.toLowerCase().includes(needle);
}

function renderAgenda() {
  const mine = myOpenTasks();
  const pool = mine.filter((task) => !state.plan[task.id] && matches(task, state.agendaSearch));

  const closed = state.agendaDone ? myDoneTasks() : [];

  $('#cal-title').textContent = monthTitle(state.calCursor);
  $('#calendar').innerHTML = calendarHtml({ cursor: state.calCursor, plan: state.plan, tasks: mine, done: closed });
  $('#agenda-pool').innerHTML = poolHtml(pool);

  const planned = mine.filter((task) => state.plan[task.id]).length;
  const resumen = [`${pool.length} sin agendar`, `${planned} en el calendario`];
  if (state.agendaDone) resumen.push(`${closed.length} cerradas`);
  $('#agenda-count').textContent = state.me
    ? resumen.join(' · ')
    : 'No se pudo resolver tu usuario; revisa la API key.';
}

async function moveTask(taskId, day) {
  state.plan = await schedule(taskId, day);
  renderAgenda();
}

function wireAgenda() {
  const step = (months) => {
    state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + months, 1);
    renderAgenda();
  };
  $('#cal-prev').addEventListener('click', () => step(-1));
  $('#cal-next').addEventListener('click', () => step(1));
  $('#cal-today').addEventListener('click', () => {
    const today = new Date();
    state.calCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    renderAgenda();
  });

  $('#agenda-search').addEventListener('input', (event) => {
    state.agendaSearch = event.target.value;
    renderAgenda();
  });
  for (const [id, campo] of [['#agenda-all', 'agendaAll'], ['#agenda-done', 'agendaDone']]) {
    $(id).addEventListener('change', async (event) => {
      state[campo] = event.target.checked;
      state.config = await saveConfig({ [campo]: state[campo] });
      renderAgenda();
    });
  }

  for (const zone of [$('#agenda-pool'), $('#calendar')]) {
    zone.addEventListener('dragstart', (event) => {
      const source = event.target.closest('[data-id]');
      if (!source) return;
      event.dataTransfer.setData('text/plain', source.dataset.id);
      event.dataTransfer.effectAllowed = 'move';
    });
  }

  const calendar = $('#calendar');
  calendar.addEventListener('dragover', (event) => {
    const day = event.target.closest('.day');
    if (!day) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    day.classList.add('is-over');
  });
  calendar.addEventListener('dragleave', (event) => {
    event.target.closest('.day')?.classList.remove('is-over');
  });
  calendar.addEventListener('drop', (event) => {
    const day = event.target.closest('.day');
    if (!day) return;
    event.preventDefault();
    day.classList.remove('is-over');
    const taskId = event.dataTransfer.getData('text/plain');
    if (taskId) moveTask(taskId, day.dataset.day);
  });
  calendar.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-unschedule]');
    if (remove) moveTask(remove.closest('[data-id]').dataset.id, null);
  });

  for (const zone of [calendar, $('#agenda-pool')]) {
    zone.addEventListener('dblclick', (event) => {
      const card = event.target.closest('[data-id]');
      if (card) openInFinder(card.dataset.id);
    });
  }

  // Soltar en la lista devuelve la tarea a "sin agendar".
  const poolZone = $('#agenda-pool');
  poolZone.addEventListener('dragover', (event) => event.preventDefault());
  poolZone.addEventListener('drop', (event) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    if (taskId) moveTask(taskId, null);
  });
}

// ── Buscador ─────────────────────────────────────────────────────────────────

const FIND_LIMIT = 60;

function renderFind() {
  const query = state.findQuery.trim();
  const hits = query ? state.tasks.filter((task) => matches(task, query)).slice(0, FIND_LIMIT) : [];

  $('#find-count').textContent = query
    ? `${hits.length}${hits.length === FIND_LIMIT ? '+' : ''} de ${state.tasks.length} tareas`
    : `${state.tasks.length} tareas en el proyecto`;

  $('#find-results').innerHTML = query
    ? hits.map((task) => `
        <button class="find-hit${task.id === state.findSelected ? ' is-active' : ''}" type="button" data-id="${escapeHtml(task.id)}">
          <span class="task-id">${shortId(task.id)}</span>
          <span class="pool-title">${escapeHtml(task.title)}</span>
          <span><span class="tag st-${task.status}">${STATUS_LABEL[task.status] ?? task.status}</span></span>
        </button>`).join('') || '<p class="empty">Sin coincidencias.</p>'
    : '<p class="empty">Escribe un nombre o un Id.</p>';

  const task = state.tasks.find((candidate) => candidate.id === state.findSelected);
  $('#find-detail').innerHTML = task
    ? detailHtml(task, {
        objectiveTitle: state.objectives.find((objective) => objective.id === task.objectiveId)?.title,
        plannedDay: state.plan[task.id],
      })
    : '<p class="empty">Elige una tarea para ver su detalle.</p>';
}

function openInFinder(taskId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;
  state.findQuery = task.title;
  state.findSelected = task.id;
  $('#find').value = task.title;
  showTab('buscar');
  renderFind();
  $('#find-detail').scrollIntoView({ block: 'nearest' });
}

function wireFind() {
  $('#find').addEventListener('input', (event) => {
    state.findQuery = event.target.value;
    state.findSelected = null;
    renderFind();
  });
  $('#find-results').addEventListener('click', (event) => {
    const hit = event.target.closest('[data-id]');
    if (!hit) return;
    state.findSelected = hit.dataset.id;
    renderFind();
  });
}
