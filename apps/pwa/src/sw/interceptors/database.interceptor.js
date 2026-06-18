import * as store from '../store/db.js';
import { json, path } from './respond.js';

export const databaseInterceptors = [
  {
    match: (req) => req.method === 'POST' && path(req) === '/api/reset',
    execute: async () => {
      await store.resetDatabase();
      return json({ ok: true });
    },
  },
];
