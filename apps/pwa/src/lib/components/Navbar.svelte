<script>
  // Shared navbar + DB settings menu (Import/Export/Reset). Replaces the old
  // templater-inlined navbar.html. Talks to the data layer by importing the
  // client modules directly — the /api/* calls already wait for the service
  // worker internally (see lib/client/http.js).
  import * as expenses from '../client/expenses.api.js';
  import * as budgets from '../client/budgets.api.js';
  import * as database from '../client/database.api.js';
  // Navbar mask icons (phone layout). Imported through Vite so they get hashed
  // + precached; applied via the --icon CSS variable on each span.
  import addIcon from '../../assets/nav/add.svg?url';
  import blotterIcon from '../../assets/nav/blotter.svg?url';
  import chartsIcon from '../../assets/nav/charts.svg?url';
  import budgetsIcon from '../../assets/nav/budgets.svg?url';
  import dbIcon from '../../assets/nav/db.svg?url';

  let showReset = $state(false);
  let resetting = $state(false);
  let showImport = $state(false);
  let importing = $state(false);
  let importFile = $state(null);
  let importMessage = $state('');
  let showBudgetImport = $state(false);
  let budgetImporting = $state(false);
  let budgetImportFile = $state(null);
  let budgetImportMessage = $state('');
  let budgetSkipped = $state([]);

  function isCurrent(file) {
    const path = location.pathname.split('/').pop() || 'index.html';
    return path === file ? 'page' : null;
  }

  async function reset() {
    if (resetting) return;
    resetting = true;
    try {
      await database.reset();
    } catch (e) {
      console.error(e);
    }
    location.reload();
  }

  function openImport() {
    importFile = null;
    importMessage = '';
    showImport = true;
  }

  async function runImport() {
    if (importing || !importFile) return;
    importing = true;
    importMessage = '';
    try {
      const text = await importFile.text();
      const r = await expenses.importCsv(text);
      importMessage =
        'Imported ' + r.imported + ' of ' + r.total + ' rows' +
        (r.unmatched ? ', ' + r.unmatched + ' → Непонятно' : '') +
        (r.skipped ? ', ' + r.skipped + ' skipped' : '') + '.';
    } catch (e) {
      console.error(e);
      importMessage = 'Import failed: ' + e.message;
    } finally {
      importing = false;
    }
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function runExport() {
    try {
      download('tomsy-expenses.csv', await expenses.exportCsv());
    } catch (e) {
      console.error(e);
    }
  }

  async function runBudgetExport() {
    try {
      download('tomsy-budgets.csv', await budgets.exportCsv());
    } catch (e) {
      console.error(e);
    }
  }

  function openBudgetImport() {
    budgetImportFile = null;
    budgetImportMessage = '';
    budgetSkipped = [];
    showBudgetImport = true;
  }

  async function runBudgetImport() {
    if (budgetImporting || !budgetImportFile) return;
    budgetImporting = true;
    budgetImportMessage = '';
    budgetSkipped = [];
    try {
      const text = await budgetImportFile.text();
      const r = await budgets.importCsv(text);
      budgetSkipped = r.skippedRows || [];
      budgetImportMessage =
        'Imported ' + r.imported + ' of ' + r.total + ' budgets' +
        (r.skipped ? ', ' + r.skipped + ' skipped' : '') + '.';
    } catch (e) {
      console.error(e);
      budgetImportMessage = 'Import failed: ' + e.message;
    } finally {
      budgetImporting = false;
    }
  }

  // Close the DB dropdown, then run the chosen action.
  function fromMenu(e, action) {
    e.preventDefault();
    e.currentTarget.closest('details').open = false;
    action();
  }
</script>

<header class="container">
  <nav>
    <ul>
      <li>
        <strong style="display: inline-flex; align-items: center; gap: 0.5rem">
          <img src="icons/icon.svg" alt="" height="28" width="28" style="border-radius: 6px" />
          Tomsy
        </strong>
      </li>
    </ul>
    <ul>
      <li><a href="index.html" aria-current={isCurrent('index.html')}><span class="nav-icon" style="--icon: url({addIcon})" aria-hidden="true"></span><span class="nav-label">Add</span></a></li>
      <li><a href="blotter.html" aria-current={isCurrent('blotter.html')}><span class="nav-icon" style="--icon: url({blotterIcon})" aria-hidden="true"></span><span class="nav-label">Blotter</span></a></li>
      <li><a href="charts.html" aria-current={isCurrent('charts.html')}><span class="nav-icon" style="--icon: url({chartsIcon})" aria-hidden="true"></span><span class="nav-label">Charts</span></a></li>
      <li><a href="budget.html" aria-current={isCurrent('budget.html')}><span class="nav-icon" style="--icon: url({budgetsIcon})" aria-hidden="true"></span><span class="nav-label">Budgets</span></a></li>
      <li>
        <details class="dropdown">
          <summary><span class="nav-icon" style="--icon: url({dbIcon})" aria-hidden="true"></span><span class="nav-label">DB</span></summary>
          <ul dir="rtl">
            <li><a href="#" onclick={(e) => fromMenu(e, openImport)}>Import</a></li>
            <li><a href="#" onclick={(e) => fromMenu(e, runExport)}>Export</a></li>
            <li><a href="#" onclick={(e) => fromMenu(e, openBudgetImport)}>Budgets Import</a></li>
            <li><a href="#" onclick={(e) => fromMenu(e, runBudgetExport)}>Budgets Export</a></li>
            <li><a href="#" onclick={(e) => fromMenu(e, () => (showReset = true))}>Reset</a></li>
          </ul>
        </details>
      </li>
    </ul>
  </nav>
</header>

<!-- Reset confirmation modal (Pico) -->
<dialog open={showReset}>
  <article>
    <header>
      <button aria-label="Close" rel="prev" onclick={() => { if (!resetting) showReset = false; }}></button>
      <p><strong>Reset database?</strong></p>
    </header>
    <p>
      This permanently deletes the entire local database — all expenses,
      categories and tables — then reloads the app. This cannot be undone.
    </p>
    <footer>
      <button class="secondary" onclick={() => (showReset = false)} disabled={resetting}>Cancel</button>
      <button class="contrast" onclick={reset} aria-busy={resetting} disabled={resetting}>
        {resetting ? 'Resetting…' : 'Reset'}
      </button>
    </footer>
  </article>
</dialog>

<!-- CSV import modal (Pico) -->
<dialog open={showImport}>
  <article>
    <header>
      <button aria-label="Close" rel="prev" onclick={() => { if (!importing) showImport = false; }}></button>
      <p><strong>Import</strong></p>
    </header>
    <p>Choose a .csv file with columns <strong>Date, Amount, Category, Desc</strong>. Unknown categories are imported as “Непонятно”.</p>
    <input
      type="file"
      accept=".csv,text/csv"
      disabled={importing}
      onchange={(e) => { importFile = e.target.files[0] || null; importMessage = ''; }}
    />
    {#if importMessage}<p>{importMessage}</p>{/if}
    <footer>
      <button class="secondary" onclick={() => (showImport = false)} disabled={importing}>Cancel</button>
      <button onclick={runImport} disabled={importing || !importFile} aria-busy={importing}>
        {importing ? 'Importing…' : 'Import'}
      </button>
    </footer>
  </article>
</dialog>

<!-- Budgets CSV import modal (Pico) -->
<dialog open={showBudgetImport}>
  <article>
    <header>
      <button aria-label="Close" rel="prev" onclick={() => { if (!budgetImporting) showBudgetImport = false; }}></button>
      <p><strong>Import budgets</strong></p>
    </header>
    <p>Choose a .csv file with columns <strong>Name, Category, Supercategory, Budget, From, Till</strong>. Rows whose category/supercategory isn't in the database are skipped.</p>
    <input
      type="file"
      accept=".csv,text/csv"
      disabled={budgetImporting}
      onchange={(e) => { budgetImportFile = e.target.files[0] || null; budgetImportMessage = ''; budgetSkipped = []; }}
    />
    {#if budgetImportMessage}<p>{budgetImportMessage}</p>{/if}
    {#if budgetSkipped.length > 0}
      <ul style="font-size: 0.85rem; color: var(--pico-muted-color)">
        {#each budgetSkipped as s}
          <li>{'Line ' + s.line + (s.name ? ' (' + s.name + ')' : '') + ': ' + s.reason}</li>
        {/each}
      </ul>
    {/if}
    <footer>
      <button class="secondary" onclick={() => (showBudgetImport = false)} disabled={budgetImporting}>Close</button>
      <button onclick={runBudgetImport} disabled={budgetImporting || !budgetImportFile} aria-busy={budgetImporting}>
        {budgetImporting ? 'Importing…' : 'Import'}
      </button>
    </footer>
  </article>
</dialog>

<style>
  /* Navbar shows text labels by default; icon-only on small (phone) screens.
     Icons are SVG masks (the --icon var, set per span) tinted with currentColor
     so they match the link state. */
  nav .nav-icon { display: none; }
  @media (max-width: 540px) {
    nav .nav-label { display: none; }
    nav .nav-icon {
      display: inline-block;
      width: 24px;
      height: 24px;
      vertical-align: middle;
      background-color: currentColor;
      -webkit-mask: var(--icon) no-repeat center / contain;
      mask: var(--icon) no-repeat center / contain;
    }
  }
</style>
