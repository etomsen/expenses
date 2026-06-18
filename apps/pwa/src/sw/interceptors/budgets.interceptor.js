import * as store from '../store/db.js';
import { json, csv, path, query } from './respond.js';

// /api/budgets/:id  and  /api/budgets/:id/expenses
const idOf = (req) => Number(path(req).split('/')[3]);

export const budgetsInterceptors = [
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/budgets/export',
    execute: async () => csv(await store.exportBudgetsCsv()),
  },
  {
    match: (req) => req.method === 'POST' && path(req) === '/api/budgets/import',
    execute: async (req) => {
      try {
        return json(await store.importBudgetsCsv(await req.text()));
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 400);
      }
    },
  },
  {
    match: (req) => req.method === 'GET' && path(req) === '/api/budgets',
    execute: async (req) =>
      json(await store.listBudgets({ archived: query(req).get('archived') === 'true' })),
  },
  {
    match: (req) => req.method === 'POST' && path(req) === '/api/budgets',
    execute: async (req) => json(await store.insertBudget(await req.json()), 201),
  },
  {
    match: (req) => req.method === 'GET' && /^\/api\/budgets\/\d+\/expenses$/.test(path(req)),
    execute: async (req) => json(await store.budgetExpenses(idOf(req))),
  },
  {
    match: (req) => req.method === 'GET' && /^\/api\/budgets\/\d+$/.test(path(req)),
    execute: async (req) => {
      const b = await store.getBudget(idOf(req));
      return b ? json(b) : json({ error: 'Budget not found' }, 404);
    },
  },
  {
    match: (req) => req.method === 'PUT' && /^\/api\/budgets\/\d+$/.test(path(req)),
    execute: async (req) => {
      await store.updateBudget(idOf(req), await req.json());
      return json({ ok: true });
    },
  },
  {
    match: (req) => req.method === 'DELETE' && /^\/api\/budgets\/\d+$/.test(path(req)),
    execute: async (req) => {
      await store.deleteBudget(idOf(req));
      return json({ ok: true });
    },
  },
];
