// Agenda personal: en qué día pienso trabajar cada tarea. Vive solo en este
// navegador — no toca AgilityTask ni el dueDate que ve el equipo.
const KEY = 'schedule';

export async function loadPlan() {
  const stored = await chrome.storage.local.get(KEY);
  return stored[KEY] ?? {};
}

export async function savePlan(plan) {
  await chrome.storage.local.set({ [KEY]: plan });
  return plan;
}

export async function schedule(taskId, day) {
  const plan = await loadPlan();
  if (day) plan[taskId] = day;
  else delete plan[taskId];
  return savePlan(plan);
}

export const ymd = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export function monthGrid(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // la semana arranca en lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => new Date(year, month, 1 - offset + index));
}
