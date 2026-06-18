// The app no longer touches the database directly. It talks to the service
// worker over /api/* through these client modules. This file aggregates them
// into a namespaced API and resolves the page's readiness promise.
import * as categories from './client/categories.api.js';
import * as expenses from './client/expenses.api.js';
import * as charts from './client/charts.api.js';
import * as budgets from './client/budgets.api.js';
import * as database from './client/database.api.js';
import { whenReady } from './client/http.js';

const api = {
  categories,
  expenses,
  charts,
  budgets,
  database,
  // `ready` resolves once a service worker controls the page (so /api/* works).
  ready: whenReady(),
};

window.ExpenseApi = api;
if (window.__resolveExpenseDB) window.__resolveExpenseDB(api);
