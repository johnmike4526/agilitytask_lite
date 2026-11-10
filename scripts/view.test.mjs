import assert from 'node:assert/strict';
import { calendarHtml, poolHtml } from '../src/agenda.js';
import { detailHtml } from '../src/detail.js';
import { pivotHtml } from '../src/pivot.js';
import { monthGrid, ymd } from '../src/schedule.js';

const persona = { id: 'u1', name: 'Persona Uno' };
const tasks = [
  {
    id: 'cmaaaaaaa00000000000aaaa',
    title: 'Ajustar el balanceador del ambiente de pruebas',
    description: 'Linea 1\nLinea <2> con "comillas"',
    status: 'IN_REVIEW', priority: 'HIGH', progress: 75,
    dueDate: '2026-11-06T22:00:00.000Z', originalDueDate: '2026-10-20T22:00:00.000Z',
    createdAt: '2026-10-23T02:00:04.355Z', updatedAt: '2026-10-28T05:30:11.058Z',
    completedAt: null, hoursSpent: 5.13, type: 'TASK', tags: ['infra'],
    assignees: [persona], createdBy: persona, objectiveId: 'obj1',
    parentTask: { id: 'p1', title: 'Tarea madre' },
  },
  {
    id: 'task-sin-fecha', title: 'Sin fecha <script>alert(1)</script>',
    status: 'TODO', priority: 'LOW', progress: 0, dueDate: null,
    createdAt: '2026-10-01T00:00:00.000Z', assignees: [persona], createdBy: persona, tags: [],
  },
];

const cursor = new Date(2026, 10, 1);
const plan = { 'cmaaaaaaa00000000000aaaa': '2026-11-03' };
const html = calendarHtml({ cursor, plan, tasks, today: new Date(2026, 10, 1) });

assert.equal((html.match(/data-day="/g) ?? []).length, monthGrid(2026, 10).length, 'una celda por día de la grilla');
assert.ok(html.includes('data-day="2026-11-03"'));
const nov3 = html.slice(html.indexOf('data-day="2026-11-03"'), html.indexOf('data-day="2026-11-04"'));
assert.ok(nov3.includes('Ajustar el balanceador'), 'la tarea agendada cae en su día');
assert.ok(!html.slice(html.indexOf('data-day="2026-11-02"'), html.indexOf('data-day="2026-11-03"')).includes('Ajustar el balanceador'));
assert.ok(nov3.indexOf('vence') === -1, 'el aviso de vencimiento no va en el día agendado');
assert.ok(html.slice(html.indexOf('data-day="2026-11-06"')).includes('1 vence'), 'el día del dueDate avisa');
assert.ok(html.includes('is-today'), 'marca el día de hoy');

// Tareas cerradas: caen en el día de completedAt, no en el de la agenda
const cerrada = {
  id: 'cerrada-1', title: 'Rotar el certificado del balanceador',
  status: 'COMPLETED', priority: 'MEDIUM', progress: 100,
  dueDate: '2026-11-20T17:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
  completedAt: '2026-11-05T19:30:00.000Z', assignees: [persona], createdBy: persona, tags: [],
};
const conCerradas = calendarHtml({ cursor, plan, tasks, done: [cerrada], today: new Date(2026, 10, 1) });
const nov5 = conCerradas.slice(conCerradas.indexOf('data-day="2026-11-05"'), conCerradas.indexOf('data-day="2026-11-06"'));
assert.ok(nov5.includes('Rotar el certificado'), 'la cerrada cae en el día de completedAt');
assert.ok(nov5.includes('chip is-done'));
assert.ok(!nov5.includes('data-unschedule'), 'la cerrada no se puede desagendar: es historia');
assert.ok(!nov5.includes('draggable'), 'y tampoco se arrastra');
const nov20 = conCerradas.slice(conCerradas.indexOf('data-day="2026-11-20"'), conCerradas.indexOf('data-day="2026-11-21"'));
assert.ok(!nov20.includes('Rotar el certificado'), 'no se dibuja en su fecha de vencimiento');
assert.ok(!html.includes('Rotar el certificado'), 'sin la casilla marcada no aparece');

// Sin completedAt cae a updatedAt; sin ninguno de los dos, no se dibuja
const sinSello = { ...cerrada, id: 'cerrada-2', completedAt: null, updatedAt: '2026-11-11T12:00:00.000Z' };
const conRespaldo = calendarHtml({ cursor, plan, tasks, done: [sinSello] });
assert.ok(conRespaldo.slice(conRespaldo.indexOf('data-day="2026-11-11"'), conRespaldo.indexOf('data-day="2026-11-12"')).includes('Rotar el certificado'));
const huerfana = calendarHtml({ cursor, plan, tasks, done: [{ ...cerrada, id: 'c3', completedAt: null, updatedAt: null }] });
assert.ok(!huerfana.includes('Rotar el certificado'), 'sin fecha de cierre no se ubica en ningún día');

// Escapado: nada de HTML crudo viniendo del título de una tarea
const pool = poolHtml(tasks);
assert.ok(!pool.includes('<script>'), 'el título no inyecta HTML');
assert.ok(pool.includes('&lt;script&gt;'));

const detail = detailHtml(tasks[0], { objectiveTitle: 'Entregable 2 — Módulo A', plannedDay: '2026-11-03' });
for (const needle of ['Ajustar el balanceador', 'Entregable 2', 'subtarea de', '(extendida)', '5.13', 'Persona Uno', '75%']) {
  assert.ok(detail.includes(needle), `el detalle muestra ${needle}`);
}
assert.ok(detail.includes('Linea &lt;2&gt;'), 'la descripción va escapada');
assert.ok(detailHtml(tasks[1], {}).includes('sin agendar'));
assert.ok(detailHtml(tasks[1], {}).includes('sin objetivo'));

// Pivote objetivo › persona › tarea
const otra = { id: 'u2', name: 'Persona Dos' };
const delObjetivo = [
  { id: 'p1', title: 'Compartida entre dos', status: 'IN_PROGRESS', priority: 'HIGH', progress: 40,
    dueDate: '2026-12-01T17:00:00.000Z', assignees: [persona, otra] },
  { id: 'p2', title: 'Solo de Uno <b>', status: 'COMPLETED', priority: 'LOW', progress: 100,
    dueDate: '2026-10-01T17:00:00.000Z', assignees: [persona] },
  { id: 'p3', title: 'Sin dueño', status: 'TODO', priority: 'LOW', progress: 0, dueDate: null, assignees: [] },
  { id: 'p4', title: 'Descartada', status: 'DISCARDED', priority: 'LOW', progress: 0, dueDate: null, assignees: [persona] },
];
const objetivos = [{ id: 'obj1', title: 'Entregable 3 - Documentación' }, { id: 'obj2', title: 'Entregable 3 - Vacío' }];
const tasksOf = (id) => (id === 'obj1' ? delObjetivo : []);

const plegado = pivotHtml({ objectives: objetivos, tasksOf, expanded: new Set() });
assert.equal((plegado.match(/class="pivot /g) ?? []).length, 2, 'plegado solo muestra los objetivos');
assert.ok(plegado.includes('data-key="o:obj1"'));
assert.ok(!plegado.includes('Persona Uno'), 'sin expandir no se ven las personas');
assert.ok(plegado.includes('is-expandable'), 'el objetivo con tareas se puede expandir');
const vacio = plegado.slice(plegado.indexOf('data-key="o:obj2"') - 120, plegado.indexOf('data-key="o:obj2"') + 60);
assert.ok(!vacio.includes('is-expandable'), 'un objetivo sin tareas no ofrece expandir');

const conPersonas = pivotHtml({ objectives: objetivos, tasksOf, expanded: new Set(['o:obj1']) });
assert.ok(conPersonas.includes('Persona Uno') && conPersonas.includes('Persona Dos'));
assert.ok(conPersonas.includes('Sin asignar'), 'lo no asignado también es una fila');
assert.ok(!conPersonas.includes('Compartida entre dos'), 'las tareas aún no');
const uno = conPersonas.slice(conPersonas.indexOf('data-key="o:obj1:p:u1"'), conPersonas.indexOf('data-key="o:obj1:p:u2"'));
assert.match(uno, />2</, 'Persona Uno: 2 tareas contadas, la descartada queda fuera');

const conTareas = pivotHtml({ objectives: objetivos, tasksOf, expanded: new Set(['o:obj1', 'o:obj1:p:u1', 'o:obj1:p:u2']) });
assert.ok(conTareas.includes('data-task="p1"'), 'la tarea es pinchable');
assert.equal((conTareas.match(/data-task="p1"/g) ?? []).length, 2, 'la compartida aparece bajo sus dos dueños');
assert.ok(!conTareas.includes('Descartada'), 'la descartada no se lista');
assert.ok(conTareas.includes('Solo de Uno &lt;b&gt;'), 'el título va escapado');

assert.match(pivotHtml({ objectives: [], tasksOf, expanded: new Set() }), /Sin objetivos/);

assert.equal(ymd(new Date(2026, 10, 3)), '2026-11-03');
console.log('OK: vistas de agenda y detalle');
