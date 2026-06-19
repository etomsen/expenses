import { getJson, qs } from './http.js';

export const supercategoryTotals = (opts = {}) => getJson('/api/supercategory-totals' + qs(opts));
