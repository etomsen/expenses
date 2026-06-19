<script>
  // Expense table (blotter.html): period filters, category/supercategory
  // filters via the URL, edit/delete modal, running total.
  import * as categories from '../client/categories.api.js';
  import * as expensesApi from '../client/expenses.api.js';
  import { onMount } from 'svelte';

  const currencies = ['EUR', 'RUB', 'BYN', 'USD'];
  const periods = [
    { key: 'week', label: 'Week' },
    { key: '2weeks', label: '2 weeks' },
    { key: 'month', label: 'Month' },
    { key: 'all', label: 'All' },
  ];

  let expenses = $state([]);
  let categoryList = $state([]);
  let loading = $state(true);
  let message = $state('');
  let filterCategory = $state('');
  let filterSupercategory = $state('');
  let period = $state('week');

  let showEdit = $state(false);
  let saving = $state(false);
  let deleting = $state(false);
  let editMessage = $state('');
  let edit = $state({ id: null, date: '', amount: '', currency: 'EUR', category: '', description: '' });

  onMount(async () => {
    try {
      // Optional ?category / ?supercategory / ?period filters.
      const params = new URLSearchParams(location.search);
      filterCategory = params.get('category') || '';
      filterSupercategory = params.get('supercategory') || '';
      period = params.get('period') || 'week';
      await reloadExpenses();
      categoryList = await categories.list();
    } catch (e) {
      console.error(e);
      message = 'Could not load expenses';
    } finally {
      loading = false;
    }
  });

  async function reloadExpenses() {
    expenses = await expensesApi.list({
      category: filterCategory || undefined,
      supercategory: filterSupercategory || undefined,
      period,
    });
  }

  function periodHref(p) {
    // Keep any active category/supercategory filter; 'week' is the default so
    // it needs no param.
    const params = new URLSearchParams(location.search);
    if (p === 'week') params.delete('period');
    else params.set('period', p);
    const qs = params.toString();
    return 'blotter.html' + (qs ? '?' + qs : '');
  }

  const total = $derived(expenses.reduce((s, e) => s + Number(e.amount), 0));

  const heading = $derived(
    filterCategory ? '"' + filterCategory + '"'
      : filterSupercategory ? '"' + filterSupercategory + '"'
      : 'All'
  );

  function formatDate(d) {
    return new Date(d).toISOString().slice(0, 10);
  }

  function openEdit(e) {
    editMessage = '';
    edit = {
      id: e.id,
      date: formatDate(e.data),
      amount: String(e.amount),
      currency: e.currency,
      category: e.category,
      description: e.desc || '',
    };
    showEdit = true;
  }

  const editAmountValue = $derived.by(() => {
    const s = String(edit.amount).replace(/\s/g, '');
    const decPos = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (decPos === -1) return parseFloat(s);
    const intPart = s.slice(0, decPos).replace(/[.,]/g, '');
    const fracPart = s.slice(decPos + 1).replace(/[.,]/g, '');
    return parseFloat(intPart + '.' + fracPart);
  });

  const editValid = $derived(
    !!edit.date && editAmountValue > 0 && !!edit.currency && !!edit.category
  );

  async function saveEdit() {
    if (!editValid || saving) return;
    const selected = categoryList.find((c) => c.category === edit.category);
    saving = true;
    editMessage = '';
    try {
      await expensesApi.update(edit.id, {
        data: new Date(edit.date).toISOString(),
        amount: editAmountValue,
        currency: edit.currency,
        desc: edit.description,
        category: edit.category,
        supercategory: selected ? selected.supercategory : '',
      });
      await reloadExpenses();
      showEdit = false;
    } catch (e) {
      console.error(e);
      editMessage = 'Failed to save: ' + e.message;
    } finally {
      saving = false;
    }
  }

  async function deleteEdit() {
    if (saving || deleting) return;
    deleting = true;
    editMessage = '';
    try {
      await expensesApi.remove(edit.id);
      await reloadExpenses();
      showEdit = false;
    } catch (e) {
      console.error(e);
      editMessage = 'Failed to delete: ' + e.message;
    } finally {
      deleting = false;
    }
  }
</script>

<main class="container">
  <h2>{heading + ': ' + total.toFixed(2) + ' EUR'}</h2>

  <p>
    {#each periods as p, i}
      <span>
        <a href={periodHref(p.key)} aria-current={period === p.key ? 'page' : null}>{p.label}</a>{#if i < periods.length - 1}<span> · </span>{/if}
      </span>
    {/each}
  </p>

  {#if filterCategory || filterSupercategory}
    <p>
      {#if filterCategory}<span>Filtered by category: <strong>{filterCategory}</strong></span>{/if}
      {#if filterSupercategory}<span>Filtered by supercategory: <strong>{filterSupercategory}</strong></span>{/if}
      · <a href="blotter.html">show all</a>
    </p>
  {/if}

  {#if loading}<p aria-busy="true">Loading expenses…</p>{/if}
  {#if message}<p>{message}</p>{/if}
  {#if !loading && !message && expenses.length === 0}<p>No expenses yet.</p>{/if}

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
            <td>
              <a href="#" aria-label="Edit" onclick={(ev) => { ev.preventDefault(); openEdit(e); }}>{e.amount + ' ' + e.currency}</a>
            </td>
            <td>
              <a href={'blotter.html?category=' + encodeURIComponent(e.category)}>{e.category}</a>
            </td>
            <td>
              <a href={'blotter.html?supercategory=' + encodeURIComponent(e.supercategory)}>{e.supercategory}</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- Edit expense modal (Pico) -->
  <dialog open={showEdit}>
    <article>
      <header>
        <button aria-label="Close" rel="prev" onclick={() => { if (!saving) showEdit = false; }}></button>
        <p><strong>Edit expense</strong></p>
      </header>

      <label>
        Date
        <input type="date" bind:value={edit.date} required />
      </label>

      <div style="display: flex; gap: 1rem; align-items: flex-end">
        <div style="flex: 1">
          <label>
            Amount
            <input
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              bind:value={edit.amount}
              oninput={() => (edit.amount = edit.amount.replace(/[^0-9.,]/g, ''))}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Currency
            <select bind:value={edit.currency} required>
              {#each currencies as c}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </label>
        </div>
      </div>

      <label>
        Category
        <select bind:value={edit.category} required>
          <option value="" disabled>Select a category</option>
          {#each categoryList as c}
            <option value={c.category}>{c.category + ' (' + c.supercategory + ')'}</option>
          {/each}
        </select>
      </label>

      <label>
        Description
        <input type="text" bind:value={edit.description} />
      </label>

      {#if editMessage}<p>{editMessage}</p>{/if}

      <footer style="display: flex; gap: 0.5rem; align-items: center">
        <button
          onclick={deleteEdit}
          disabled={saving || deleting}
          aria-busy={deleting}
          style="margin-right: auto; --pico-background-color: #c0392b; --pico-border-color: #c0392b"
        >{deleting ? 'Deleting…' : 'Delete'}</button>
        <button class="secondary" onclick={() => (showEdit = false)} disabled={saving || deleting}>Cancel</button>
        <button onclick={saveEdit} disabled={!editValid || saving || deleting} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </footer>
    </article>
  </dialog>
</main>

<style>
  @media (max-width: 540px) {
    main.container {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }
    main h2 {
      font-size: 1.4rem;
      margin-bottom: 0.5rem;
    }
    main table th,
    main table td {
      padding: 0.3rem 0.35rem;
      font-size: 0.8rem;
    }
    /* Date and amount stay on one line; long category names may wrap. */
    main table th[scope='row'],
    main table td:nth-child(2) {
      white-space: nowrap;
    }
  }
</style>
