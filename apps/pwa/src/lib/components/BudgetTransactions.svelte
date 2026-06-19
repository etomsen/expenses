<script>
  // A single budget and the expenses that fall under it (budget-transactions.html).
  import * as budgetsApi from '../client/budgets.api.js';
  import { onMount } from 'svelte';

  let budget = $state(null);
  let expenses = $state([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const id = Number(new URLSearchParams(location.search).get('budgetId'));
      if (!id) { error = 'No budget specified.'; return; }
      budget = await budgetsApi.get(id);
      if (!budget) { error = 'Budget #' + id + ' was not found.'; return; }
      expenses = await budgetsApi.expenses(id);
    } catch (e) {
      console.error(e);
      error = 'Could not load this budget.';
    } finally {
      loading = false;
    }
  });

  function formatDate(d) {
    return new Date(d).toISOString().slice(0, 10);
  }

  function parseDate(s) {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function fmtTill(s) {
    return parseDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function daysLeftLabel(s) {
    const t = parseDate(s);
    t.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const n = Math.round((t - now) / 86400000);
    if (n > 1) return n + ' days';
    if (n === 1) return '1 day';
    if (n === 0) return 'today';
    return 'ended';
  }

  function fmtNum(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Svelte action: draw the budget spend bar onto the canvas.
  function spendBar(canvas, b) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bud = Number(b.budget), spent = Number(b.spent);
    const ratio = bud > 0 ? Math.min(spent / bud, 1) : 0;
    const over = spent > bud;
    ctx.fillStyle = '#e5e7eb';
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = over ? '#ef4444' : '#10b981';
      roundRect(ctx, 0, 0, Math.max(ratio * w, h), h, h / 2);
      ctx.fill();
    }
  }
</script>

<main class="container">
  {#if loading}<p aria-busy="true">Loading…</p>{/if}

  {#if error}
    <article style="border-left: 4px solid #ef4444">
      <p>{error}</p>
      <a href="budget.html">← Back to budgets</a>
    </article>
  {/if}

  {#if !loading && budget && !error}
    <div>
      <h2>{budget.name}</h2>

      <!-- The budget row, exactly as on the budgets page. -->
      <table>
        <thead>
          <tr>
            <th scope="col">Till</th>
            <th scope="col">Budget</th>
            <th scope="col">Left</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              <span>{fmtTill(budget.date_till)}</span>
              <small>{'(' + daysLeftLabel(budget.date_till) + ')'}</small>
            </th>
            <td>
              <div style="display: flex; flex-direction: column; gap: 3px">
                <small>
                  <strong>{budget.name}</strong>
                  <span style="color: var(--pico-muted-color)">{'· ' + (budget.category || budget.supercategory)}</span>
                </small>
                <canvas use:spendBar={budget} width="220" height="14" style="max-width: 100%"></canvas>
              </div>
            </td>
            <td>{fmtNum(Number(budget.budget) - Number(budget.spent)) + '/' + fmtNum(budget.budget) + ' EUR'}</td>
          </tr>
        </tbody>
      </table>

      <h3>Transactions</h3>
      {#if expenses.length === 0}<p>No transactions for this budget.</p>{/if}
      {#if expenses.length > 0}
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
              <th scope="col">Category</th>
              <th scope="col">Supercategory</th>
            </tr>
          </thead>
          <tbody>
            {#each expenses as e (e.id)}
              <tr>
                <th scope="row">{formatDate(e.data)}</th>
                <td>{e.amount + ' ' + e.currency}</td>
                <td>{e.category}</td>
                <td>{e.supercategory}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</main>

<style>
  @media (max-width: 540px) {
    main.container {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }
    main table th,
    main table td {
      padding: 0.3rem 0.35rem;
      font-size: 0.8rem;
    }
    main table th[scope='row'],
    main table td:nth-child(2) {
      white-space: nowrap;
    }
  }
</style>
