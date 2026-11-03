import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChrome, buildDocument, buildFetch } from './dom-double.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(raiz, 'src', 'dashboard.html');

const PERSONA = { id: 'u1', name: 'Persona Uno', organizationId: 'org1' };
const OBJETIVOS = [
  { id: 'o1', title: 'Entregable 2 — Módulo A' },
  { id: 'o2', title: 'Entregable 2 - Documentación' },
  { id: 'o3', title: 'reuniones' },
];
// El calendario abre en el mes corriente: la tarea cerrada tiene que caer ahi
// para que la prueba no dependa de la fecha en que se corra.
const HOY = new Date();
const DIA_CIERRE = new Date(HOY.getFullYear(), HOY.getMonth(), 4, 12, 0, 0);
const CIERRE_YMD = `${DIA_CIERRE.getFullYear()}-${String(DIA_CIERRE.getMonth() + 1).padStart(2, '0')}-04`;

const TAREAS = [
  { id: 't1', title: 'Tarea en curso', status: 'IN_PROGRESS', priority: 'HIGH', progress: 50,
    dueDate: '2026-11-20T17:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
    objectiveId: 'o1', assignees: [PERSONA], createdBy: PERSONA, tags: [] },
  { id: 't2', title: 'Tarea cerrada', status: 'COMPLETED', priority: 'LOW', progress: 100,
    dueDate: '2026-10-10T17:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
    completedAt: DIA_CIERRE.toISOString(), objectiveId: 'o2', assignees: [PERSONA], createdBy: PERSONA, tags: [] },
];

// Cada escenario necesita su propia instancia del módulo: el sufijo lo fuerza.
let n = 0;
async function arrancar({ config = null, schedule = null, granted = true } = {}) {
  const dom = buildDocument(HTML);
  const { chrome, store } = buildChrome({ config, schedule, granted });
  const { fetchDouble, calls } = buildFetch({ me: PERSONA, objectives: OBJETIVOS, tasks: TAREAS, projects: [{ id: 'p1', name: 'Proyecto Uno' }] });
  globalThis.document = dom.document;
  globalThis.chrome = chrome;
  globalThis.fetch = fetchDouble;
  await import(`../src/dashboard.js?caso=${++n}`);
  await new Promise((r) => setTimeout(r, 30));   // deja asentar el arranque async
  return { ...dom, store, calls, $: (id) => dom.byId.get(id) };
}

// 1. Arranque en frío: sin configuración no debe reventar.
//    Es la regresión del 2-nov: renderAgenda y renderFind corren antes de
//    la primera consulta, con el estado todavía vacío.
{
  const app = await arrancar();
  assert.match(app.$('status').textContent, /Primer uso/);
  assert.equal(app.$('deliverable').innerHTML, '', 'sin datos, el selector queda vacío');
  assert.match(app.$('find-results').innerHTML, /Escribe un nombre/);
  assert.equal(app.calls.length, 0, 'sin API key no se llama a la API');
}

// 2. Arranque con configuración: consulta, agrupa y pinta.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', projectName: 'Proyecto Uno', group: '', groupPattern: '(entregable|sprint)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  assert.ok(app.calls.includes('/api/v1/tasks'), 'pide las tareas');
  assert.ok(app.calls.includes('/api/v1/objectives'), 'pide los objetivos');
  assert.ok(app.calls.includes('/api/v1/projects'), 'carga la lista de proyectos, no solo la guardada');

  const select = app.$('deliverable').innerHTML;
  assert.match(select, /Entregable 2/, 'agrupa por la convención del título');
  assert.match(select, /2 objetivos/);
  assert.match(select, /Sin agrupar/, 'lo que no encaja va a su propio grupo');

  assert.equal(app.$('kpis').hidden, false);
  assert.match(app.$('kpis').innerHTML, /Completadas/);
  assert.match(app.$('burndown').innerHTML, /<svg/, 'dibuja el burndown');
  assert.match(app.$('calendar').innerHTML, /data-day=/, 'dibuja el calendario');
  assert.match(app.$('agenda-count').textContent, /sin agendar/);
  assert.match(app.$('find-count').textContent, /2 tareas/);
}

// 3. Soltar una tarea en un día la guarda en la agenda local.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  const dia = new app.El('', { day: '2026-11-18' });
  await app.$('calendar').dispatch('drop', { target: dia, dataTransfer: { getData: () => 't1' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(app.store.schedule, { t1: '2026-11-18' }, 'la agenda vive en chrome.storage, no en AgilityTask');
}

// 4. Doble clic sobre una tarea del calendario abre el buscador con su detalle.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
    schedule: { t1: '2026-11-18' },
  });
  const chip = new app.El('', { id: 't1' });
  await app.$('calendar').dispatch('dblclick', { target: chip });
  const buscar = app.tabs.find((t) => t.dataset.tab === 'buscar');
  assert.ok(buscar.classes.has('is-active'), 'cambia al tab Buscar');
  assert.ok(app.byId.get('panel-buscar').classes.has('is-active'));
  assert.match(app.$('find-detail').innerHTML, /Tarea en curso/, 'muestra el detalle de la tarea');
  assert.equal(app.$('find').value, 'Tarea en curso');
}

// 5. La casilla de tareas cerradas las dibuja en el dia en que se cerraron,
//    y la eleccion sobrevive al siguiente arranque.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '', rangeStart: '', rangeEnd: '' },
  });
  const calendario = () => app.$('calendar').innerHTML;
  assert.ok(!calendario().includes('Tarea cerrada'), 'apagada, no se dibujan');

  const casilla = app.$('agenda-done');
  casilla.checked = true;
  await casilla.dispatch('change', { target: casilla });
  await new Promise((r) => setTimeout(r, 10));

  const html = calendario();
  const desde = html.indexOf(`data-day="${CIERRE_YMD}"`);
  const dia = html.slice(desde, html.indexOf('data-day="', desde + 10));
  assert.ok(dia.includes('Tarea cerrada'), 'aparece en el dia de completedAt');
  assert.ok(dia.includes('chip is-done'));
  assert.match(app.$('agenda-count').textContent, /1 cerradas/);
  assert.equal(app.store.config.agendaDone, true, 'la eleccion queda guardada');

  const vuelta = await arrancar({ config: app.store.config });
  assert.equal(vuelta.$('agenda-done').checked, true, 'y vuelve marcada al reabrir');
  assert.ok(vuelta.$('calendar').innerHTML.includes('Tarea cerrada'));
}

console.log('OK: arranque del tablero');
