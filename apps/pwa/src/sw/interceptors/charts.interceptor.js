import * as store from '../store/db.js';
import { json, path, query } from './respond.js';

export const chartsInterceptors = [
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/supercategory-totals',
    execute: async (req) =>
      json(await store.supercategoryTotals({ month: query(req).get('month') || undefined })),
  },
];
