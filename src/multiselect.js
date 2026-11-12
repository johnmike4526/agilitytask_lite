import { escapeHtml } from './charts.js';

/** Opciones: [{ value, label }]. Seleccionado: arreglo de value. */
export function menuHtml(options, selected) {
  return options.map((option) => {
    const marcada = selected.includes(option.value) ? ' checked' : '';
    return `<label class="multi-option">
      <input type="checkbox" value="${escapeHtml(option.value)}"${marcada} />
      <span>${escapeHtml(option.label)}</span>
    </label>`;
  }).join('');
}

/**
 * Nada marcado se lee como «sin filtro», que es lo que esperaba el desplegable
 * de una sola opción. Con una, su etiqueta; con varias, el conteo.
 */
export function summaryText(options, selected, vacio, plural) {
  if (!selected.length) return vacio;
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? vacio;
  }
  return `${selected.length} ${plural}`;
}

export function toggle(selected, value, checked) {
  const resto = selected.filter((actual) => actual !== value);
  return checked ? [...resto, value] : resto;
}
