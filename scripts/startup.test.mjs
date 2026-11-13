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

const PROYECTOS = [{ id: 'p1', name: 'Proyecto Uno' }, { id: 'p2', name: 'Proyecto Dos' }];

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
  const { fetchDouble, calls } = buildFetch({ me: PERSONA, objectives: OBJETIVOS, tasks: TAREAS, projects: PROYECTOS });
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
  assert.equal(app.$('group-mode').hidden, true, 'con patron que encaja no hay aviso');
}

// 2b. Sin convencion de nombres el aviso aparece, y lleva el texto en el tooltip.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: 'NO-ENCAJA-\\d+', rangeStart: '', rangeEnd: '' },
  });
  const aviso = app.$('group-mode');
  assert.equal(aviso.hidden, false, 'se muestra el icono');
  const grupos = app.$('deliverable');
  assert.ok(grupos.innerHTML.startsWith('<option value="__todos__">Mostrar todos'), 'arranca en Mostrar todos');
  assert.match(grupos.innerHTML, /Mostrar todos · 3 objetivos/);
  assert.equal(grupos.value, '__todos__', 'y es el seleccionado por defecto');
  assert.ok(grupos.innerHTML.includes('reuniones'), 'los objetivos sueltos siguen disponibles');
  assert.match(app.$('kpis').innerHTML, /<b>2<\/b><span>Tareas/, 'el resumen suma las tareas de todos los objetivos');
  assert.match(aviso.dataset.tip, /Mostrar todos/);
  assert.equal(aviso.getAttribute('aria-label'), aviso.dataset.tip, 'el lector de pantalla lee lo mismo que el tooltip');
  assert.equal(aviso.textContent, '', 'el mensaje ya no se imprime en linea');
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

// 6. El pivote de objetivos: expandir objetivo, expandir persona, abrir tarea.
{
  // Con el patron por convencion los dos objetivos caen en el mismo grupo, que
  // es lo que pone a las dos tareas bajo el mismo pivote.
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  const tabla = app.$('objectives-table');
  const cuerpo = () => tabla.subs.get('tbody').innerHTML;
  const clic = async (dataset, clases = []) => {
    const fila = new app.El('', dataset);
    for (const c of clases) fila.classes.add(c);
    await tabla.dispatch('click', { target: fila });
  };

  assert.ok(cuerpo().includes('data-key="o:o1"'), 'arranca mostrando los objetivos');
  assert.ok(!cuerpo().includes('Persona Uno'), 'plegado, sin personas');

  await clic({ key: 'o:o1' }, ['pivot', 'is-expandable']);
  assert.ok(cuerpo().includes('Persona Uno'), 'al expandir el objetivo aparece quien lo trabaja');
  assert.ok(!cuerpo().includes('Tarea en curso'), 'todavia sin tareas');

  await clic({ key: 'o:o1:p:u1' }, ['pivot', 'is-expandable']);
  assert.ok(cuerpo().includes('Tarea en curso'), 'al expandir la persona aparecen sus tareas');
  assert.ok(cuerpo().includes('data-task="t1"'));

  await clic({ task: 't1' }, ['pivot', 'is-task']);
  const buscar = app.tabs.find((t) => t.dataset.tab === 'buscar');
  assert.ok(buscar.classes.has('is-active'), 'la tarea lleva al tab Buscar');
  assert.match(app.$('find-detail').innerHTML, /Tarea en curso/);

  await clic({ key: 'o:o1' }, ['pivot', 'is-expandable']);
  assert.ok(!cuerpo().includes('Persona Uno'), 'volver a pulsar el objetivo lo pliega');
  await clic({ key: 'o:o1' }, ['pivot', 'is-expandable']);
  assert.ok(!cuerpo().includes('Tarea en curso'), 'y al reabrirlo las personas vuelven plegadas');
}

// 7. Cambiar de proyecto desde el encabezado, sin pasar por Configuracion.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', projectName: 'Proyecto Uno', group: 'entregable 2', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  const selector = app.$('project');
  assert.ok(selector.innerHTML.includes('Proyecto Uno') && selector.innerHTML.includes('Proyecto Dos'),
    'el encabezado lista los proyectos de la cuenta');
  assert.equal(selector.value, 'p1');
  assert.equal(app.$('cfg-project').value, 'p1', 'y el de Configuracion queda en el mismo');

  const consultas = app.calls.length;
  selector.value = 'p2';
  await selector.dispatch('change', { target: selector });
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(app.store.config.projectId, 'p2');
  assert.equal(app.store.config.projectName, 'Proyecto Dos', 'guarda el nombre, no solo el id');
  assert.equal(app.store.config.group, '', 'el grupo del proyecto anterior no se arrastra');
  assert.ok(app.calls.length > consultas, 'vuelve a consultar la API');
  assert.equal(app.$('cfg-project').value, 'p2', 'los dos desplegables quedan en el mismo proyecto');
}

// 8. Los filtros de la tabla de tareas aceptan varias opciones a la vez.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  const filtro = app.$('filter-status');
  const resumen = () => filtro.subs.get('.multi-text').textContent;
  const marcar = async (value, checked) => {
    const casilla = new app.El('', {});
    casilla.value = value;
    casilla.checked = checked;
    await filtro.dispatch('change', { target: casilla });
  };

  assert.equal(resumen(), 'Todos los estados');
  assert.equal(app.$('filters-clear').hidden, true, 'sin filtros no hay boton de limpiar');
  assert.match(app.$('task-count').textContent, /2 de 2 tareas/);

  await marcar('TODO', true);
  assert.equal(resumen(), 'Por hacer', 'con una marcada muestra su etiqueta');
  assert.match(app.$('task-count').textContent, /0 de 2 tareas/, 'ninguna tarea esta por hacer');
  assert.equal(app.$('filters-clear').hidden, false);

  await marcar('IN_PROGRESS', true);
  await marcar('COMPLETED', true);
  assert.equal(resumen(), '3 estados', 'con varias, el conteo');
  assert.match(app.$('task-count').textContent, /2 de 2 tareas/, 'la seleccion suma, no intersecta');
  assert.ok(filtro.classes.has('has-filter'), 'el desplegable se marca como filtrado');

  await marcar('TODO', false);
  assert.equal(resumen(), '2 estados', 'desmarcar quita solo esa');

  await app.$('filters-clear').dispatch('click', {});
  assert.equal(resumen(), 'Todos los estados', 'limpiar deja los tres filtros en blanco');
  assert.equal(app.$('filters-clear').hidden, true);
  assert.ok(!filtro.classes.has('has-filter'));
}

// 9. Pulsar una fila de la tabla de tareas abre su detalle.
{
  const app = await arrancar({
    config: { apiKey: 'k', baseUrl: 'https://ejemplo.test/api/v1', projectId: 'p1', group: '', groupPattern: '(entregable)\\s*\\d+', rangeStart: '', rangeEnd: '' },
  });
  const tabla = app.$('tasks-table');
  assert.match(tabla.subs.get('tbody').innerHTML, /data-task="t1"/, 'cada fila lleva su tarea');

  const fila = new app.El('', { task: 't1' });
  await tabla.dispatch('click', { target: fila });

  const buscar = app.tabs.find((t) => t.dataset.tab === 'buscar');
  assert.ok(buscar.classes.has('is-active'), 'lleva al tab Buscar');
  assert.match(app.$('find-detail').innerHTML, /Tarea en curso/);

  // El encabezado ordenable no debe quedar atrapado por el nuevo manejador.
  const primera = () => /data-task="([^"]+)"/.exec(tabla.subs.get('tbody').innerHTML)?.[1];
  assert.equal(primera(), 't2', 'por defecto ordena por fecha: primero la mas proxima');
  const encabezado = app.sortables.find((th) => th.dataset.sort === 'progress');
  await encabezado.dispatch('click', {});
  assert.equal(primera(), 't1', 'ordenar por avance pone antes la del 50%');
  await encabezado.dispatch('click', {});
  assert.equal(primera(), 't2', 'y volver a pulsar invierte el orden');
}

console.log('OK: arranque del tablero');
