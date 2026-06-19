<script>
  // Spend-by-supercategory pie chart (charts.html). The pie is drawn on a plain
  // <canvas> (no chart library) once the data has loaded.
  import * as charts from '../client/charts.api.js';
  import { onMount, tick } from 'svelte';

  const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'];

  let segments = $state([]);
  let total = $state(0);
  let loading = $state(true);
  let message = $state('');
  let month = $state('this');
  let canvas = $state();

  onMount(async () => {
    try {
      month = new URLSearchParams(location.search).get('month') === 'prev' ? 'prev' : 'this';
      const rows = await charts.supercategoryTotals({ month });
      segments = rows.map((r, i) => ({
        label: r.supercategory,
        value: Number(r.total),
        color: palette[i % palette.length],
      }));
      total = segments.reduce((s, seg) => s + seg.value, 0);
      await tick();
      render();
    } catch (e) {
      console.error(e);
      message = 'Could not load chart data';
    } finally {
      loading = false;
    }
  });

  const monthLabel = $derived.by(() => {
    const d = new Date();
    d.setDate(1);
    if (month === 'prev') d.setMonth(d.getMonth() - 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  function render() {
    if (!canvas || segments.length === 0) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 10;
    const t = segments.reduce((s, seg) => s + seg.value, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    let start = -Math.PI / 2;
    segments.forEach((seg) => {
      const angle = (seg.value / t) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      // Draw the sum on the slice (skip slices too small to fit a label).
      if (seg.value / t >= 0.04) {
        const mid = start + angle / 2;
        const lx = cx + Math.cos(mid) * r * 0.62;
        const ly = cy + Math.sin(mid) * r * 0.62;
        const text = Math.round(seg.value).toString();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, lx, ly);
      }
      start += angle;
    });
  }

  function percent(value) {
    return total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  }
</script>

<main class="container">
  <h2>Charts</h2>
  <p>Expenses by supercategory · <span>{monthLabel}</span></p>

  <p>
    <a href="charts.html" aria-current={month === 'this' ? 'page' : null}>This month</a>
    ·
    <a href="charts.html?month=prev" aria-current={month === 'prev' ? 'page' : null}>Prev month</a>
  </p>

  {#if loading}<p aria-busy="true">Loading…</p>{/if}
  {#if message}<p>{message}</p>{/if}
  {#if !loading && !message && segments.length === 0}<p>{'No expenses in ' + monthLabel + '.'}</p>{/if}

  {#if segments.length > 0}
    <div>
      <canvas bind:this={canvas} width="300" height="300" style="max-width: 100%"></canvas>

      <table>
        <thead>
          <tr>
            <th scope="col">Supercategory</th>
            <th scope="col">Sum</th>
            <th scope="col">%</th>
          </tr>
        </thead>
        <tbody>
          {#each segments as seg (seg.label)}
            <tr>
              <th scope="row">
                <span style={'display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:8px;vertical-align:middle;background:' + seg.color}></span>
                <a href={'blotter.html?supercategory=' + encodeURIComponent(seg.label)}>{seg.label}</a>
              </th>
              <td>{seg.value.toFixed(2)}</td>
              <td>{percent(seg.value) + '%'}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{total.toFixed(2)}</td>
            <td>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
</main>
