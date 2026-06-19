<script>
  // Add-expense form (index.html). Categories load from a localStorage cache
  // first (instant) so the form is usable before PGLite boots, then refresh.
  import * as categories from '../client/categories.api.js';
  import * as expenses from '../client/expenses.api.js';
  import { onMount } from 'svelte';

  const currencies = ['EUR', 'RUB', 'BYN', 'USD'];

  let form = $state({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    currency: 'EUR',
    category: '',
    description: '',
  });
  let categoryList = $state([]);
  let saving = $state(false);
  let message = $state('');

  onMount(async () => {
    // Instant: show categories from the localStorage cache so the form is
    // usable without waiting for PGLite (~16MB) to boot.
    try {
      const cached = JSON.parse(localStorage.getItem('tomsy.categories') || 'null');
      if (Array.isArray(cached) && cached.length) categoryList = cached;
    } catch (e) {}
    // Background: load + re-cache the categories from the DB.
    try {
      categoryList = await categories.list();
      localStorage.setItem('tomsy.categories', JSON.stringify(categoryList));
    } catch (e) {
      console.error(e);
      if (!categoryList.length) message = 'Could not load categories';
    }
  });

  // Accept either '.' or ',' as the decimal separator (the last one wins); any
  // other separators are treated as thousands grouping.
  const amountValue = $derived.by(() => {
    const s = String(form.amount).replace(/\s/g, '');
    const decPos = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (decPos === -1) return parseFloat(s);
    const intPart = s.slice(0, decPos).replace(/[.,]/g, '');
    const fracPart = s.slice(decPos + 1).replace(/[.,]/g, '');
    return parseFloat(intPart + '.' + fracPart);
  });

  const isValid = $derived(
    !!form.date && amountValue > 0 && !!form.currency && !!form.category
  );

  async function submit() {
    if (!isValid || saving) return;
    const selected = categoryList.find((c) => c.category === form.category);
    const payload = {
      data: new Date(form.date).toISOString(),
      amount: amountValue,
      currency: form.currency,
      desc: form.description,
      category: form.category,
      supercategory: selected ? selected.supercategory : '',
    };
    saving = true;
    message = '';
    try {
      const saved = await expenses.create(payload);
      message = 'Saved expense #' + saved.id;
      form.amount = '';
      form.description = '';
      form.category = '';
    } catch (e) {
      message = 'Failed to save: ' + e.message;
    } finally {
      saving = false;
    }
  }
</script>

<main class="container">
  <form style="max-width: 400px; margin: 0 auto" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <label for="date">Date</label>
    <input id="date" type="date" bind:value={form.date} required />

    <div style="display: flex; gap: 1rem; align-items: flex-end">
      <div style="flex: 1">
        <label for="amount">Amount</label>
        <input
          id="amount"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          style="width: 100%"
          bind:value={form.amount}
          oninput={() => (form.amount = form.amount.replace(/[^0-9.,]/g, ''))}
          required
        />
      </div>
      <div>
        <select id="currency" bind:value={form.currency} required>
          {#each currencies as c}
            <option value={c}>{c}</option>
          {/each}
        </select>
      </div>
    </div>

    <label for="category">Category</label>
    <select id="category" bind:value={form.category} required>
      <option value="" disabled>Select a category</option>
      {#each categoryList as c}
        <option value={c.category}>{c.category + ' (' + c.supercategory + ')'}</option>
      {/each}
    </select>

    <label for="description">Description</label>
    <input id="description" type="text" bind:value={form.description} />

    <button type="submit" disabled={!isValid || saving}>{saving ? 'Saving…' : 'Add expense'}</button>

    {#if message}<p>{message}</p>{/if}
  </form>
</main>
