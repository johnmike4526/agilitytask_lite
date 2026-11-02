export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const shortDate = new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short' });

const WIDTH = 960;
const HEIGHT = 340;
const PAD = { top: 20, right: 20, bottom: 36, left: 46 };

function niceTicks(max) {
  const raw = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const stepSize = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10;
  const ticks = [];
  for (let value = 0; value <= max + stepSize / 2; value += stepSize) ticks.push(Math.round(value));
  return ticks;
}

export function burndownSvg({ points, total }) {
  if (points.length < 2) {
    return '<p class="empty">No hay datos suficientes para el burndown.</p>';
  }

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const t0 = points[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const ticks = niceTicks(total);
  const yMax = ticks[ticks.length - 1];

  const x = (date) => PAD.left + ((date.getTime() - t0) / (t1 - t0)) * plotW;
  const y = (value) => PAD.top + plotH - (value / yMax) * plotH;
  const path = (series) => series.map((point, index) => `${index ? 'L' : 'M'}${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');

  const ideal = points.map((point) => ({ date: point.date, value: point.ideal }));
  const real = points.filter((point) => point.real !== null).map((point) => ({ date: point.date, value: point.real }));

  const grid = ticks.map((tick) => `
    <line class="grid" x1="${PAD.left}" y1="${y(tick)}" x2="${WIDTH - PAD.right}" y2="${y(tick)}" />
    <text class="tick" x="${PAD.left - 8}" y="${y(tick) + 4}" text-anchor="end">${tick}</text>`).join('');

  const every = Math.max(1, Math.ceil(points.length / 8));
  const xLabels = points
    .filter((_, index) => index % every === 0 || index === points.length - 1)
    .map((point) => `<text class="tick" x="${x(point.date)}" y="${HEIGHT - 12}" text-anchor="middle">${shortDate.format(point.date)}</text>`)
    .join('');

  const last = real[real.length - 1];
  const marker = last
    ? `<circle class="dot" cx="${x(last.date)}" cy="${y(last.value)}" r="4" />
       <text class="dot-label" x="${x(last.date) - 8}" y="${y(last.value) - 10}" text-anchor="end">${last.value} abiertas</text>`
    : '';

  return `
  <svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Burndown del entregable">
    ${grid}
    <path class="line-ideal" d="${path(ideal)}" />
    ${real.length ? `<path class="line-real" d="${path(real)}" />` : ''}
    ${marker}
    ${xLabels}
  </svg>
  <div class="legend">
    <span><i class="swatch ideal"></i>Ideal</span>
    <span><i class="swatch real"></i>Real (tareas abiertas)</span>
  </div>`;
}

const SEGMENTS = [
  { key: 'done', label: 'Completadas', css: 'seg-done' },
  { key: 'inReview', label: 'En revisión', css: 'seg-review' },
  { key: 'inProgress', label: 'En curso', css: 'seg-progress' },
  { key: 'todo', label: 'Por hacer', css: 'seg-todo' },
];

export function workloadBars(rows) {
  if (!rows.length) return '<p class="empty">Sin tareas asignadas en este entregable.</p>';
  const max = Math.max(...rows.map((row) => row.total));

  const bars = rows.map((row) => {
    const segments = SEGMENTS
      .filter((segment) => row[segment.key] > 0)
      .map((segment) => `<span class="seg ${segment.css}" style="flex:${row[segment.key]}" title="${segment.label}: ${row[segment.key]}"></span>`)
      .join('');
    return `
      <div class="bar-row">
        <span class="bar-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(row.total / max) * 100}%">${segments}</span></span>
        <span class="bar-value">${row.total}</span>
      </div>`;
  }).join('');

  const legend = SEGMENTS.map((segment) => `<span><i class="swatch ${segment.css}"></i>${segment.label}</span>`).join('');
  return `<div class="bars">${bars}</div><div class="legend">${legend}</div>`;
}
