import { getJson, getText, sendJson, sendText, whenReady, apiUrl } from './http.js';

export const list = ({ archived } = {}) =>
  getJson('/api/budgets' + (archived ? '?archived=true' : ''));

export const get = async (id) => {
  await whenReady();
  const res = await fetch(apiUrl(`/api/budgets/${id}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load budget');
  return res.json();
};

export const expenses = (id) => getJson(`/api/budgets/${id}/expenses`);
export const create = (payload) => sendJson('POST', '/api/budgets', payload);
export const update = (id, payload) => sendJson('PUT', `/api/budgets/${id}`, payload);
export const remove = (id) => sendJson('DELETE', `/api/budgets/${id}`);
export const exportCsv = () => getText('/api/budgets/export');
export const importCsv = (text) => sendText('POST', '/api/budgets/import', text);
