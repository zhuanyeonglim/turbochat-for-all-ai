/* GPT Lift — page_bootstrap.js  |  ISOLATED world, document_start
 *
 * Two jobs:
 *   1. Write config to localStorage before any fetch fires
 *   2. Create a Blob URL for the Worker so MAIN world can load it
 *      without hitting ChatGPT's CSP (chrome-extension:// URLs are blocked
 *      as Worker sources by the page's Content-Security-Policy).
 *      Blob URLs are same-origin and CSP-exempt.
 */
(function () {
  const CFG_KEY  = 'turbochat_config';
  const DEFAULTS = {
    enabled:        true,
    limit:          5,
    batchSize:      10,
    // Plus features — individually toggleable
    workerEnabled:  true,
    idbEnabled:     true,
    batchingEnabled:true,
  };

  // ── Write config to localStorage ─────────────────────────────────────────
  function writeConfig(s) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        enabled:         s.enabled         ?? DEFAULTS.enabled,
        limit:           s.limit           ?? DEFAULTS.limit,
        batchSize:       s.batchSize       ?? DEFAULTS.batchSize,
        workerEnabled:   s.workerEnabled   ?? DEFAULTS.workerEnabled,
        idbEnabled:      s.idbEnabled      ?? DEFAULTS.idbEnabled,
        batchingEnabled: s.batchingEnabled ?? DEFAULTS.batchingEnabled,
      }));
    } catch { /* private browsing */ }
  }

  chrome.storage.local.get(DEFAULTS, writeConfig);
  chrome.storage.onChanged.addListener((_, area) => {
    if (area === 'local') chrome.storage.local.get(DEFAULTS, writeConfig);
  });

  // ── Create Blob Worker URL ────────────────────────────────────────────────
  // Fetch worker.js from extension, wrap in Blob, expose as object URL.
  // MAIN world reads dataset.glWorkerUrl to construct the Worker.
  (async () => {
    try {
      const workerSrc = chrome.runtime.getURL('worker.js');
      const res  = await fetch(workerSrc);
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/javascript' });
      const url  = URL.createObjectURL(blob);
      document.documentElement.dataset.glWorkerUrl = url;
    } catch (err) {
      console.warn('[GPT Lift] Could not create Worker blob URL:', err);
    }
  })();
})();
