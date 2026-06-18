import { getJson, getText, sendJson, sendText, qs } from './http.js';

export const list = (filters = {}) => getJson('/api/expenses' + qs(filters));
export const create = (payload) => sendJson('POST', '/api/expenses', payload);
export const update = (id, payload) => sendJson('PUT', `/api/expenses/${id}`, payload);
export const remove = (id) => sendJson('DELETE', `/api/expenses/${id}`);
export const exportCsv = () => getText('/api/export');
export const importCsv = (text) => sendText('POST', '/api/import', text);
