<script>
  // Registers the module service worker (app-sw.js) and shows an "update
  // available" dialog when a new worker is waiting. Replaces the old
  // templater-inlined update-prompt.html; logic is unchanged.
  import { onMount } from 'svelte';

  let showUpdate = $state(false);
  let waitingWorker = $state(null);
  let localVersion = $state('');
  let remoteVersion = $state('');
  let reloading = false;

  // Ask a worker for its version over a MessageChannel; null if it doesn't answer.
  function swVersion(worker) {
    return new Promise((resolve) => {
      if (!worker) return resolve(null);
      const ch = new MessageChannel();
      let done = false;
      ch.port1.onmessage = (e) => { done = true; resolve(e.data && e.data.version); };
      try { worker.postMessage({ type: 'GET_VERSION' }, [ch.port2]); }
      catch (e) { return resolve(null); }
      setTimeout(() => { if (!done) resolve(null); }, 1500);
    });
  }

  onMount(() => {
    if (!('serviceWorker' in navigator)) return;

    // A controller change means a new worker took over — reload once so the
    // page runs the new version. Skip the first install (no prior controller)
    // and guard against reloading more than once (no update loop).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('app-sw.js', { type: 'module' }).then((reg) => {
      const consider = async (worker) => {
        if (!worker) return;
        const controller = navigator.serviceWorker.controller;
        if (!controller) return; // first install — just let it activate
        const remote = await swVersion(worker);
        // The incoming worker is the migration shim; it activates itself.
        if (remote === 'shim') return;
        const local = await swVersion(controller);
        // We're running on the shim mid-migration — pull in the real worker
        // silently, no dialog.
        if (local === 'shim') { worker.postMessage({ type: 'SKIP_WAITING' }); return; }
        // Same version on both sides — nothing to do (and don't loop).
        if (remote && local && remote === local) return;
        localVersion = local || '?';
        remoteVersion = remote || '?';
        waitingWorker = worker;
        showUpdate = true;
      };
      // A new worker already installed and waiting (e.g. declined last time).
      if (reg.waiting) consider(reg.waiting);
      // A new worker starts installing while the page is open.
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed') consider(nw);
        });
      });
    }).catch((e) => console.error('SW registration failed:', e));
  });

  function update() {
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    showUpdate = false;
  }
</script>

<dialog open={showUpdate}>
  <article>
    <header>
      <p><strong>Update available</strong></p>
    </header>
    <p>A new version is available. Do you want to update?</p>
    <p>
      <small>
        Current: <strong>{localVersion}</strong> ·
        New: <strong>{remoteVersion}</strong>
      </small>
    </p>
    <footer>
      <button class="secondary" onclick={() => (showUpdate = false)}>Later</button>
      <button onclick={update}>Update</button>
    </footer>
  </article>
</dialog>
