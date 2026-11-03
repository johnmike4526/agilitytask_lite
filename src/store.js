import { defaultBaseUrl } from './api.js';
import { DEFAULT_GROUP_PATTERN } from './model.js';

const KEY = 'config';

const DEFAULTS = {
  apiKey: '',
  baseUrl: '',
  projectId: '',
  projectName: '',
  group: '',
  agendaAll: false,
  agendaDone: false,
  groupPattern: DEFAULT_GROUP_PATTERN,
  rangeStart: '',
  rangeEnd: '',
};

export async function loadConfig() {
  const stored = await chrome.storage.local.get(KEY);
  const config = { ...DEFAULTS, ...(stored[KEY] ?? {}) };
  if (!config.baseUrl) config.baseUrl = await defaultBaseUrl();
  return config;
}

export async function saveConfig(patch) {
  const next = { ...(await loadConfig()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
