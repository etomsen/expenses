import { categoriesInterceptors } from './categories.interceptor.js';
import { expensesInterceptors } from './expenses.interceptor.js';
import { chartsInterceptors } from './charts.interceptor.js';
import { budgetsInterceptors } from './budgets.interceptor.js';
import { databaseInterceptors } from './database.interceptor.js';

// First match wins. More specific routes (e.g. /:id/expenses) come before the
// generic ones within each resource module.
export const interceptors = [
  ...categoriesInterceptors,
  ...expensesInterceptors,
  ...chartsInterceptors,
  ...budgetsInterceptors,
  ...databaseInterceptors,
];
