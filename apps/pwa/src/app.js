// Entry module: loads the PGLite-backed database and exposes it to the
// (non-module) Alpine component on the page. Using a real module here means
// the './db.js' specifier resolves correctly — unlike a dynamic import()
// evaluated inside an Alpine expression, which has no reliable base URL.
import * as db from './db.js';

window.ExpenseDB = db;
// Resolve the readiness promise the page set up in <head> so the Alpine
// component can grab the DB regardless of script execution order.
if (window.__resolveExpenseDB) window.__resolveExpenseDB(db);
