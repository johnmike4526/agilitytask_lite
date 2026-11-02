// La URL de la instancia no vive en el repo: sale de src/env.js, que no se
// versiona (ver src/env.example.js). Sin ese archivo la extensión arranca con la
// URL vacía y la pide en Configuración.
export async function defaultBaseUrl() {
  try {
    const env = await import('./env.js');
    return env.API_BASE_URL ?? '';
  } catch {
    return '';
  }
}

const PAGE_SIZE = 100;
const MAX_PAGES = 200;

function unwrap(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.tasks)) return body.tasks;
  return [];
}

export class AgilityError extends Error {
  constructor(status, detail) {
    super(`API [${status}]: ${detail}`);
    this.name = 'AgilityError';
    this.status = status;
  }
}

export class AgilityClient {
  constructor({ apiKey, baseUrl }) {
    if (!apiKey) throw new Error('Falta la API key: cárgala en Configuración.');
    if (!baseUrl) throw new Error('Falta la URL base de la API: cárgala en Configuración.');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async request(path, params = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new AgilityError(response.status, (await response.text()).slice(0, 300));
    }
    return response.json();
  }

  // La API pagina con limit=20 por defecto y clampea limit a 100 sin avisarlo
  // más que en meta.hasMore. Un listado parcial silencioso falsearía el
  // burndown, así que se drena y se contrasta contra meta.total.
  async requestAll(path, params = {}) {
    const items = [];
    let offset = 0;
    let total;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.request(path, { ...params, limit: PAGE_SIZE, offset });
      const batch = unwrap(body);
      items.push(...batch);
      const meta = body?.meta;
      if (typeof meta?.total === 'number') total = meta.total;
      const hasMore = meta ? meta.hasMore === true : batch.length === PAGE_SIZE;
      if (!hasMore || batch.length === 0) break;
      offset = typeof meta?.nextOffset === 'number' ? meta.nextOffset : offset + batch.length;
    }
    if (typeof total === 'number' && items.length < total) {
      throw new Error(`Listado incompleto de ${path}: ${items.length} de ${total}.`);
    }
    return items;
  }

  async me() {
    const body = await this.request('/me');
    return body?.data ?? body;
  }

  async projects() {
    return unwrap(await this.request('/projects'));
  }

  objectives(projectId) {
    return this.requestAll('/objectives', { projectId });
  }

  tasks(projectId) {
    return this.requestAll('/tasks', { projectId });
  }

  async members(projectId) {
    const { organizationId } = await this.me();
    return this.requestAll('/members', { organizationId, projectId });
  }
}
