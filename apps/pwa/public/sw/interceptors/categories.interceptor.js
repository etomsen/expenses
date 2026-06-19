import * as store from '../store/db.js';
import { json, path } from './respond.js';

export const categoriesInterceptors = [
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/categories',
    execute: async () => json(await store.listCategories()),
  },
];
