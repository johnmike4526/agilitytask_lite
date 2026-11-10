// Doble mínimo de DOM y de las APIs de chrome, suficiente para arrancar
// dashboard.js fuera del navegador. Sin dependencias: lo que no está aquí es
// que dashboard.js no lo usa, y si algún día lo usa, la prueba se cae y avisa.
import { readFileSync } from 'node:fs';

class El {
  constructor(id = '', dataset = {}) {
    this.id = id;
    this.dataset = dataset;
    this.classes = new Set();
    this.listeners = new Map();
    this.attributes = new Map();
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.options = [];
    this.selectedOptions = [];
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    };
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  async dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) {
      await handler({ target: this, preventDefault() {}, ...event });
    }
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }

  closest() { return this; }
  scrollIntoView() {}
  querySelector() { return new El(); }
}

export function buildDocument(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const byId = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) byId.set(id, new El(id));

  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(([, tab]) => {
    const el = new El('', { tab });
    el.classes.add('tab');
    return el;
  });
  const panels = [...byId.keys()].filter((id) => id.startsWith('panel-')).map((id) => byId.get(id));
  const sortables = [...html.matchAll(/data-sort="([^"]+)"/g)].map(([, sort]) => new El('', { sort }));

  const document = {
    querySelector(selector) {
      const id = /^#([A-Za-z0-9_-]+)/.exec(selector)?.[1];
      if (!id) return null;
      const el = byId.get(id);
      if (!el) return null;             // id inexistente: dashboard.js revienta y la prueba lo caza
      if (!selector.includes(' ')) return el;
      el.sub ??= new El(`${id} ${selector.split(' ').slice(1).join(' ')}`);
      return el.sub;
    },
    querySelectorAll(selector) {
      if (selector === '.tab') return tabs;
      if (selector === '.panel') return panels;
      if (selector.includes('[data-sort]')) return sortables;
      return [];
    },
  };

  return { document, byId, tabs, panels, El };
}

export function buildChrome({ config = null, schedule = null, granted = true } = {}) {
  const store = {};
  if (config) store.config = config;
  if (schedule) store.schedule = schedule;
  return {
    store,
    chrome: {
      storage: {
        local: {
          async get(key) { return key in store ? { [key]: store[key] } : {}; },
          async set(patch) { Object.assign(store, patch); },
        },
      },
      permissions: {
        async contains() { return granted; },
        async request() { return granted; },
      },
    },
  };
}

export function buildFetch(data) {
  const calls = [];
  const fetchDouble = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const body = path.endsWith('/me')
      ? { data: data.me }
      : { data: data[path.split('/').pop()] ?? [], meta: { total: (data[path.split('/').pop()] ?? []).length, hasMore: false } };
    return { ok: true, status: 200, async json() { return body; }, async text() { return JSON.stringify(body); } };
  };
  return { fetchDouble, calls };
}
