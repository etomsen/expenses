import { getJson } from './http.js';

export const list = () => getJson('/api/categories');
