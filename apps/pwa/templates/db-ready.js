// Readiness promise the local DB module (app.js) resolves once PGLite loads.
window.__expenseDBReady = new Promise((resolve) => {
  window.__resolveExpenseDB = resolve;
});
