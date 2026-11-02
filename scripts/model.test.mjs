import assert from 'node:assert/strict';
import { burndown, dueState, perDeveloper, summarize, groupObjectives, defaultRange } from '../src/model.js';

const now = new Date('2026-11-01T12:00:00Z');
const day = (n) => new Date(now.getTime() + n * 86400000).toISOString();
const unoPersona = { id: 'a', name: 'Persona Uno' };
const dosPersona = { id: 'b', name: 'Persona Dos' };

const tasks = [
  { id: '1', status: 'COMPLETED', priority: 'HIGH', progress: 100, dueDate: day(-10), createdAt: day(-30), completedAt: day(-12), assignees: [unoPersona] },
  { id: '2', status: 'COMPLETED', priority: 'LOW', progress: 50, dueDate: day(-5), createdAt: day(-30), completedAt: null, updatedAt: day(-2), assignees: [unoPersona] },
  { id: '3', status: 'IN_PROGRESS', priority: 'HIGH', progress: 50, dueDate: day(-1), createdAt: day(-20), assignees: [dosPersona] },
  { id: '4', status: 'TODO', priority: 'MEDIUM', progress: 0, dueDate: day(2), createdAt: day(-20), assignees: [dosPersona] },
  { id: '5', status: 'IN_REVIEW', priority: 'MEDIUM', progress: 75, dueDate: day(20), createdAt: day(-20), assignees: [] },
  { id: '6', status: 'TODO', priority: 'LOW', progress: 0, dueDate: null, createdAt: day(-20), assignees: [unoPersona, dosPersona] },
  { id: '7', status: 'DISCARDED', priority: 'LOW', progress: 0, dueDate: day(-40), createdAt: day(-40), assignees: [unoPersona] },
];

// Semáforo
assert.equal(dueState(tasks[0], now), 'done', 'completada sin importar la fecha');
assert.equal(dueState(tasks[2], now), 'overdue', 'vencida');
assert.equal(dueState(tasks[3], now), 'soon', 'vence dentro de 3 días');
assert.equal(dueState(tasks[4], now), 'ok');
assert.equal(dueState(tasks[5], now), 'none');

// Resumen: las descartadas no cuentan
const stats = summarize(tasks, now);
assert.equal(stats.total, 6);
assert.equal(stats.done, 2);
assert.equal(stats.overdue, 1, 'solo la #3; la descartada vencida no cuenta');
assert.equal(stats.noDueDate, 1);
assert.equal(stats.progress, Math.round((100 + 100 + 50 + 0 + 75 + 0) / 6), 'completada = 100% aunque progress diga otra cosa');

// Carga por desarrollador: una tarea con dos asignados suma a ambos
const rows = perDeveloper(tasks, now);
const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
assert.equal(byName['Persona Uno'].total, 3);
assert.equal(byName['Persona Uno'].done, 2);
assert.equal(byName['Persona Dos'].total, 3);
assert.equal(byName['Persona Dos'].overdue, 1);
assert.equal(byName['Sin asignar'].total, 1);
assert.equal(rows.reduce((s, r) => s + r.total, 0), 7, '6 tareas, una contada dos veces');

// Burndown
const range = defaultRange(tasks);
assert.ok(range.start < range.end);
const curve = burndown(tasks, { ...range, now });
assert.equal(curve.total, 6);
assert.equal(curve.remaining, 4, '6 contadas menos 2 cerradas');
assert.equal(curve.points[0].real, 6, 'al inicio nada cerrado');
assert.ok(curve.points.every((p) => p.date > now ? p.real === null : p.real !== null), 'sin curva real en el futuro');
assert.ok(Math.abs(curve.points.at(-1).ideal) < 1e-9, 'la ideal llega a cero');

// Agrupación: varios objetivos del mismo entregable caen en un grupo
const porEntregable = groupObjectives([
  { id: 'o1', title: 'Entregable 3 — Módulo A' },
  { id: 'o2', title: 'Entregable 3 - Documentación' },
  { id: 'o3', title: 'Entregable 4 — Módulo B' },
  { id: 'o4', title: 'reuniones-seguimiento' },
]);
assert.equal(porEntregable.mode, 'patron');
assert.deepEqual(porEntregable.groups.map((g) => g.label), ['Entregable 3', 'Entregable 4', 'Sin agrupar']);
assert.equal(porEntregable.groups[0].objectives.length, 2);
assert.equal(porEntregable.groups.at(-1).objectives[0].id, 'o4', 'lo que no encaja va al final');

// Otras convenciones salen del patrón por defecto, y ordenan por número
const porSprint = groupObjectives([
  { id: 's10', title: 'Sprint 10: cierre' },
  { id: 's2', title: 'Sprint 2: arranque' },
  { id: 'f1', title: 'Fase 1 — descubrimiento' },
]);
assert.deepEqual(porSprint.groups.map((g) => g.label), ['Fase 1', 'Sprint 2', 'Sprint 10'], '10 va después de 2');

// Sin convención: cada objetivo es su propio grupo
const sinConvencion = groupObjectives([
  { id: 'a', title: 'Backend de notificaciones' },
  { id: 'b', title: 'App móvil' },
]);
assert.equal(sinConvencion.mode, 'objetivo');
assert.deepEqual(sinConvencion.groups.map((g) => g.label), ['App móvil', 'Backend de notificaciones']);
assert.equal(sinConvencion.groups[0].objectives.length, 1);

// Patrón vacío o inválido: también cae a un grupo por objetivo, sin reventar
for (const patron of ['', '   ', '(((']) {
  const caido = groupObjectives([{ id: 'a', title: 'Entregable 3 — Módulo A' }], patron);
  assert.equal(caido.mode, 'objetivo', `patrón ${JSON.stringify(patron)} cae a objetivo suelto`);
}

// Patrón propio
const propio = groupObjectives(
  [{ id: 'a', title: 'EPIC-12 pagos' }, { id: 'b', title: 'EPIC-12 reportes' }],
  'EPIC-\\d+',
);
assert.equal(propio.groups.length, 1);
assert.equal(propio.groups[0].label, 'EPIC-12');

console.log('OK: modelo');
