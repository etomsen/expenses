<script>
  // Budgets list (budget.html): active/archived budgets with a spend bar drawn
  // on a per-row <canvas>, plus an add/edit modal.
  import * as categories from '../client/categories.api.js';
  import * as budgetsApi from '../client/budgets.api.js';
  import { onMount } from 'svelte';

  let budgets = $state([]);
  let categoryList = $state([]);
  let loading = $state(true);
  let message = $state('');
  let archived = $state(false);
  let showAdd = $state(false);
  let editingId = $state(null);
  let saving = $state(false);
  let deleting = $state(false);
  let addMessage = $state('');
  let form = $state({ name: '', supercategory: '', category: '', budget: '', dateFrom: '', dateTill: '' });

  onMount(async () => {
    try {
      archived = new URLSearchParams(location.search).get('archived') === 'true';
      categoryList = await categories.list();
      await reload();
    } catch (e) {
      console.error(e);
      message = 'Could not load budgets';
    } finally {
      loading = false;
    }
  });

  async function reload() {
    budgets = await budgetsApi.list({ archived });
  }

  const supercategories = $derived([...new Set(categoryList.map((c) => c.supercategory))].sort());

  function categoriesFor(sc) {
    return categoryList.filter((c) => c.supercategory === sc);
  }

  function openAdd() {
    const today = new Date().toISOString().slice(0, 10);
    editingId = null;
    form = { name: '', supercategory: '', category: '', budget: '', dateFrom: today, dateTill: today };
    addMessage = '';
    showAdd = true;
  }

  function openEdit(b) {
    editingId = b.id;
    form = {
      name: b.name,
      supercategory: b.supercategory,
      category: b.category || '',
      budget: String(b.budget),
      dateFrom: b.date_from,
      dateTill: b.date_till,
    };
    addMessage = '';
    showAdd = true;
  }

  const amountValue = $derived.by(() => {
    const s = String(form.budget).replace(/\s/g, '');
    const d = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (d === -1) return parseFloat(s);
    return parseFloat(s.slice(0, d).replace(/[.,]/g, '') + '.' + s.slice(d + 1).replace(/[.,]/g, ''));
  });

  const addValid = $derived(
    !!form.name && !!form.supercategory && amountValue > 0 && !!form.dateFrom && !!form.dateTill
  );

  async function saveBudget() {
    if (!addValid || saving) return;
    saving = true;
    addMessage = '';
    const data = {
      name: form.name,
      category: form.category || null,
      supercategory: form.supercategory,
      budget: amountValue,
      dateFrom: form.dateFrom,
      dateTill: form.dateTill,
    };
    try {
      if (editingId) await budgetsApi.update(editingId, data);
      else await budgetsApi.create(data);
      await reload();
      showAdd = false;
    } catch (e) {
      console.error(e);
      addMessage = 'Failed to save: ' + e.message;
    } finally {
      saving = false;
    }
  }

  async function removeBudget() {
    if (!editingId || deleting) return;
    deleting = true;
    addMessage = '';
    try {
      await budgetsApi.remove(editingId);
      await reload();
      showAdd = false;
    } catch (e) {
      console.error(e);
      addMessage = 'Failed to delete: ' + e.message;
    } finally {
      deleting = false;
    }
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

  // Svelte action: draw the budget spend bar onto the row's canvas (replaces
  // Alpine's x-init="drawBar($el, b)").
  function spendBar(canvas, b) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const budget = Number(b.budget), spent = Number(b.spent);
    const ratio = budget > 0 ? Math.min(spent / budget, 1) : 0;
    const over = spent > budget;
    // track (available)
    ctx.fillStyle = '#e5e7eb';
    roundRect(ctx, 0, 0, w, h, h / 2);
    ctx.fill();
    // spent fill
    if (ratio > 0) {
      ctx.fillStyle = over ? '#ef4444' : '#10b981';
      roundRect(ctx, 0, 0, Math.max(ratio * w, h), h, h / 2);
      ctx.fill();
    }
  }
</script>

<main class="container">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem">
    <h2 style="margin: 0">Budgets</h2>
    <button onclick={openAdd} style="width: auto">Add</button>
  </div>

  <p>
    <a href="budget.html" aria-current={!archived ? 'page' : null}>Active</a>
    ·
    <a href="budget.html?archived=true" aria-current={archived ? 'page' : null}>Archived</a>
  </p>

  {#if loading}<p aria-busy="true">Loading…</p>{/if}
  {#if message}<p>{message}</p>{/if}
  {#if !loading && !message && budgets.length === 0}<p>{archived ? 'No archived budgets.' : 'No active budgets.'}</p>{/if}

  {#if budgets.length > 0}
    <table>
      <thead>
        <tr>
          <th scope="col">Till</th>
          <th scope="col">Budget</th>
          <th scope="col">Left</th>
        </tr>
      </thead>
      <tbody>
        {#each budgets as b (b.id)}
          <tr onclick={() => openEdit(b)} style="cursor: pointer">
            <th scope="row">
              <a href={'budget-transactions.html?budgetId=' + b.id} onclick={(e) => e.stopPropagation()}>
                <span>{fmtTill(b.date_till)}</span>
                <small>{'(' + daysLeftLabel(b.date_till) + ')'}</small>
              </a>
            </th>
            <td>
              <div style="display: flex; flex-direction: column; gap: 3px">
                <small>
                  <strong>{b.name}</strong>
                  <span style="color: var(--pico-muted-color)">{'· ' + (b.category || b.supercategory)}</span>
                </small>
                <canvas use:spendBar={b} width="220" height="14" style="max-width: 100%"></canvas>
              </div>
            </td>
            <td>{fmtNum(Number(b.budget) - Number(b.spent)) + '/' + fmtNum(b.budget) + ' EUR'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- Add / edit budget modal (Pico) -->
  <dialog open={showAdd}>
    <article>
      <header>
        <button aria-label="Close" rel="prev" onclick={() => { if (!saving && !deleting) showAdd = false; }}></button>
        <p><strong>{editingId ? 'Edit budget' : 'New budget'}</strong></p>
      </header>

      <label>
        Name
        <input type="text" bind:value={form.name} required />
      </label>

      <label>
        Supercategory
        <select bind:value={form.supercategory} onchange={() => (form.category = '')} required>
          <option value="" disabled>Select a supercategory</option>
          {#each supercategories as sc}
            <option value={sc}>{sc}</option>
          {/each}
        </select>
      </label>

      <label>
        Category (optional)
        <select bind:value={form.category}>
          <option value="">— whole supercategory —</option>
          {#each categoriesFor(form.supercategory) as c (c.category)}
            <option value={c.category}>{c.category}</option>
          {/each}
        </select>
      </label>

      <label>
        Budget
        <input
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          bind:value={form.budget}
          oninput={() => (form.budget = form.budget.replace(/[^0-9.,]/g, ''))}
          required
        />
      </label>

      <div style="display: flex; gap: 1rem">
        <label style="flex: 1">
          From
          <input type="date" bind:value={form.dateFrom} required />
        </label>
        <label style="flex: 1">
          Till
          <input type="date" bind:value={form.dateTill} required />
        </label>
      </div>

      {#if addMessage}<p>{addMessage}</p>{/if}

      <footer style="display: flex; gap: 0.5rem; align-items: center">
        {#if editingId}
          <button
            onclick={removeBudget}
            disabled={saving || deleting}
            aria-busy={deleting}
            style="--pico-background-color: #c0392b; --pico-border-color: #c0392b"
          >{deleting ? 'Deleting…' : 'Delete'}</button>
        {/if}
        <span style="flex: 1"></span>
        <button class="secondary" onclick={() => (showAdd = false)} disabled={saving || deleting}>Cancel</button>
        <button onclick={saveBudget} disabled={!addValid || saving || deleting} aria-busy={saving}>
          {saving ? 'Saving…' : (editingId ? 'Save' : 'Add')}
        </button>
      </footer>
    </article>
  </dialog>
</main>
