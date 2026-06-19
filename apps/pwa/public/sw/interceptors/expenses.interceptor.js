import * as store from '../store/db.js';
import { json, csv, path, query } from './respond.js';

const idOf = (req) => Number(path(req).split('/').pop());

export const expensesInterceptors = [
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/expenses',
    execute: async (req) => {
      const q = query(req);
      return json(
        await store.listExpenses({
          category: q.get('category') || undefined,
          supercategory: q.get('supercategory') || undefined,
          period: q.get('period') || undefined,
        })
      );
    },
  },
  {
    match: (req) => req.method === 'POST' && path(req) === '/api/expenses',
    execute: async (req) => json(await store.insertExpense(await req.json()), 201),
  },
  {
    match: (req) => req.method === 'PUT' && /^\/api\/expenses\/\d+$/.test(path(req)),
    execute: async (req) => json(await store.updateExpense(idOf(req), await req.json())),
  },
  {
    match: (req) => req.method === 'DELETE' && /^\/api\/expenses\/\d+$/.test(path(req)),
    execute: async (req) => {
      await store.deleteExpense(idOf(req));
      return json({ ok: true });
    },
  },
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/export',
    execute: async () => csv(await store.exportCsv()),
  },
  {
    match: (req) => req.method === 'POST' && path(req) === '/api/import',
    execute: async (req) => {
      try {
        return json(await store.importCsv(await req.text()));
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 400);
      }
    },
  },
];
