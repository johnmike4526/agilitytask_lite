import assert from 'node:assert/strict';
import { calendarHtml, poolHtml } from '../src/agenda.js';
import { detailHtml } from '../src/detail.js';
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

assert.equal(ymd(new Date(2026, 10, 3)), '2026-11-03');
console.log('OK: vistas de agenda y detalle');
