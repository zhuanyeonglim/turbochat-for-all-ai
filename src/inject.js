/* GPT Lift — inject.js  |  MAIN world, document_start
 *
 * Plus features — individually toggled via popup:
 *   workerEnabled   → Web Worker (JSON.parse + trim off main thread)
 *   idbEnabled      → IndexedDB  (persistent L2 cache via Worker)
 *   batchingEnabled → Token batching (RAF-batched streaming mutations)
 *
 * Cache hierarchy:
 *   L1 Memory Map  ~0ms    always active
 *   L2 IndexedDB   ~5ms    only if idbEnabled
 *   L3 Network     200ms+  always (fallback)
 */

(function () {
  'use strict';

  const CFG_KEY  = 'turbochat_config';
  const EXTRA_KEY = 'turbochat_extra';
  const NAV_KEY   = 'turbochat_navigating';
  const DEFAULTS  = {
    enabled: true, limit: 5, batchSize: 10,
    workerEnabled: true, idbEnabled: true, batchingEnabled: true,
  };

  const EXCLUDED_ROLES = new Set(['system', 'tool', 'thinking']);

  function isVisible(node) {
    const role = node?.message?.author?.role;
    return !!role && !EXCLUDED_ROLES.has(role);
  }

  function getConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULTS };
  }

  // ── Per-chat memory — localStorage, permanent across sessions ───────────────
  // Each conversation remembers how many extra messages the user has loaded.
  // Format: localStorage['tc_conv_limits'] = { [convId]: extra, ... }
  // sessionStorage still used for the reload-skip flags (tc_navigating etc.)

  const CONV_LIMITS_KEY = 'tc_conv_limits';

  function getAllConvLimits() {
    try { return JSON.parse(localStorage.getItem(CONV_LIMITS_KEY) || '{}'); } catch { return {}; }
  }

  function getExtra(convId) {
    if (!convId) return 0;
    try { return getAllConvLimits()[convId] || 0; } catch { return 0; }
  }

  function setExtra(convId, n) {
    if (!convId) return;
    try {
      const all = getAllConvLimits();
      if (n <= 0) delete all[convId];
      else all[convId] = n;
      localStorage.setItem(CONV_LIMITS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
    // Also keep sessionStorage flag so reload-skip logic still works
    try {
      if (n > 0) sessionStorage.setItem(EXTRA_KEY, JSON.stringify({ convId, extra: n, url: location.href }));
      else sessionStorage.removeItem(EXTRA_KEY);
    } catch { /* ignore */ }
  }

  function clearExtra(convId) {
    if (!convId) return;
    try {
      const all = getAllConvLimits();
      delete all[convId];
      localStorage.setItem(CONV_LIMITS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
    try { sessionStorage.removeItem(EXTRA_KEY); } catch { /* ignore */ }
  }

  // Public reset — called from popup reset button
  window.__tcResetMessages = function() {
    try { sessionStorage.removeItem(EXTRA_KEY); } catch { /* ignore */ }
    const convId = currentConvId || getConvIdFromPath();
    if (convId) {
      // Set synchronous skip flag BEFORE reload — worker invalidation is async
      // and won't finish before location.reload() fires
      try { sessionStorage.setItem('tc_skip_once', convId); } catch { /* ignore */ }
      dbInvalidate(convId); // also fires async (belt+suspenders for next visit)
    }
    location.reload();
  };

  // Extract convId from current page URL (for use before first fetch fires)
  function getConvIdFromPath() {
    const m = location.pathname.match(/\/c\/([a-f0-9-]{36})/i);
    return m ? m[1] : null;
  }

  function broadcast(payload) {
    window.postMessage({ type: 'turbochat-status', payload }, '*');
    try {
      sessionStorage.setItem('turbochat_last_status',
        JSON.stringify({ ...payload, url: location.href }));
    } catch { /* ignore */ }

  }

  // ── L1: Memory LRU (always active) ───────────────────────────────────────
  const CACHE_MAX = 8;
  const memCache  = new Map();
  let   lastLimit = getConfig().limit; // track limit changes

  function memGet(convId) {
    const e = memCache.get(convId);
    if (!e) return null;
    memCache.delete(convId); memCache.set(convId, e);
    return e;
  }

  function memPut(convId, body, result) {
    if (memCache.size >= CACHE_MAX) memCache.delete(memCache.keys().next().value);
    memCache.set(convId, { body, result, ts: Date.now() });
  }

  function memInvalidate(convId) { memCache.delete(convId); }

  // When limit changes, flush entire L1 — all entries are now wrong limit
  function checkLimitChanged() {
    const cfg = getConfig();
    if (cfg.limit !== lastLimit) {
      lastLimit = cfg.limit;
      memCache.clear();
      console.log(`[GPT Lift] Limit changed to ${cfg.limit} — L1 cache flushed`);
    }
  }

  // Poll for config changes (storage writes happen in ISOLATED world, not directly observable from MAIN)
  setInterval(checkLimitChanged, 1000);

  // ── Web Worker bridge (workerEnabled) ─────────────────────────────────────
  let worker      = null;
  let workerReady = false;
  const pending   = new Map();
  let msgId       = 0;

  // Wait for page_bootstrap.js to set the Blob URL (async fetch)
  function waitForWorkerUrl(timeout = 5000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const url = document.documentElement.dataset.glWorkerUrl;
        if (url) return resolve(url);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(check, 50);
      };
      check();
    });
  }

  async function initWorker() {
    if (worker) return worker;
    const url = await waitForWorkerUrl();
    if (!url) { console.warn('[GPT Lift] Worker URL not available'); return null; }
    try {
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const cb = pending.get(e.data.id);
        if (cb) { pending.delete(e.data.id); cb(e.data); }
      };
      worker.onerror = (err) => {
        console.warn('[GPT Lift] Worker error:', err.message);
        worker = null; workerReady = false;
        pending.forEach((cb) => cb(null));
        pending.clear();
      };
      workerReady = true;
      console.log('[GPT Lift] ✓ Web Worker started (Blob URL)');
      return worker;
    } catch (err) {
      console.warn('[GPT Lift] Worker creation failed:', err);
      return null;
    }
  }

  function workerSend(msg, timeoutMs = 8000) {
    if (!worker || !workerReady) return Promise.resolve(null);
    const id = ++msgId;
    return new Promise((resolve) => {
      const t = setTimeout(() => { pending.delete(id); resolve(null); }, timeoutMs);
      pending.set(id, (data) => { clearTimeout(t); resolve(data); });
      worker.postMessage({ ...msg, id });
    });
  }

  // ── IndexedDB via Worker (idbEnabled) ─────────────────────────────────────
  async function dbGet(convId) {
    const cfg   = getConfig();
    const extra = getExtra(convId);
    if (!cfg.idbEnabled || !workerReady) return null;
    // Pass limit AND extra — worker rejects entries that don't match both
    const r = await workerSend({ type: 'DB_GET', convId, limit: cfg.limit, extra }, 3000);
    return r?.hit ? r.entry : null;
  }

  async function dbProcess(convId, text, limit, extra) {
    const cfg = getConfig();
    if (!cfg.workerEnabled || !workerReady) {
      // Fallback: process on main thread
      return mainThreadProcess(text, limit, extra, convId);
    }
    const r = await workerSend({ type: 'PROCESS', convId, text, limit, extra }, 12000);
    return r?.ok ? { body: r.body, result: r.result } : null;
  }

  function dbInvalidate(convId) {
    if (workerReady) workerSend({ type: 'DB_INVALIDATE', convId });
    memInvalidate(convId);
  }

  // ── Main-thread fallback trimmer (when Worker disabled) ───────────────────
  function stripImageAssets(node) {
    try {
      const parts = node?.message?.content?.parts;
      if (Array.isArray(parts)) {
        parts.forEach(p => {
          if (!p || typeof p !== 'object') return;
          if (p.content_type === 'image_asset_pointer') { p.asset_pointer = ''; p.width = 0; p.height = 0; }
          if (p.content_type === 'multimodal_text' && p.image_part) p.image_part.asset_pointer = '';
        });
      }
      const att = node?.metadata?.attachments;
      if (Array.isArray(att)) att.forEach(a => { if (a?.url) a.url = ''; });
    } catch { /* ignore */ }
  }

  function trimMapping(data, messageLimit, extraMessages) {
    try {
      const { mapping, current_node: currentNode } = data;
      if (!mapping || !currentNode || !mapping[currentNode]) return null;

      // Walk current_node → root via parent pointers, build chain root-first
      const chain = []; const visited = new Set(); let id = currentNode;
      while (id && mapping[id] && !visited.has(id)) {
        visited.add(id); chain.push(id); id = mapping[id].parent ?? null;
      }
      chain.reverse();

      let absoluteMessageCount = 0;
      for (const nid of chain) { if (isVisible(mapping[nid])) absoluteMessageCount++; }

      const effectiveLimit = Math.max(messageLimit + extraMessages, 2);
      if (absoluteMessageCount <= effectiveLimit) return null;

      // Find cutoff index — keep last effectiveLimit visible messages
      let count = 0, cutoffIdx = 0;
      for (let i = chain.length - 1; i >= 0; i--) {
        if (isVisible(mapping[chain[i]])) { count++; if (count >= effectiveLimit) { cutoffIdx = i; break; } }
      }

      // ONLY keep nodes from cutoffIdx onward — no pre-cutoff structural nodes.
      // Keeping pre-cutoff nodes causes ChatGPT to render alternate branches
      // as "Reply 1, Reply 2..." because those nodes retain multi-child metadata.
      const keptChain = chain.slice(cutoffIdx);

      const newMapping = {};
      for (let i = 0; i < keptChain.length; i++) {
        const nid  = keptChain[i];
        const node = structuredClone(mapping[nid]);
        // Relink as clean single-child linear chain — no branches
        node.parent   = i > 0 ? keptChain[i - 1] : null;
        node.children = i < keptChain.length - 1 ? [keptChain[i + 1]] : [];
        newMapping[nid] = node;
      }

      return {
        mapping: newMapping, current_node: currentNode,
        root: keptChain[0] ?? currentNode,
        visibleTotal: absoluteMessageCount, absoluteMessageCount,
        visibleKept: effectiveLimit,
        hasOlderMessages: absoluteMessageCount > effectiveLimit,
        conversation_id: data.conversation_id,
      };
    } catch { return null; }
  }

  function mainThreadProcess(text, limit, extra, convId) {
    try {
      let t = text;
      if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
      const data   = JSON.parse(t);
      const result = trimMapping(data, limit, extra);
      if (!result) return { body: text, result: null };
      const newData = { ...data, mapping: result.mapping, current_node: result.current_node, root: result.root };
      return { body: JSON.stringify(newData), result };
    } catch { return null; }
  }

  // ── Build Response ────────────────────────────────────────────────────────
  function buildResponse(original, body) {
    const headers = new Headers();
    original.headers.forEach((v, k) => {
      const l = k.toLowerCase();
      if (l === 'content-length' || l === 'content-encoding') return;
      headers.set(k, v);
    });
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(body, { status: original.status, statusText: original.statusText, headers });
  }

  function broadcastResult(result, fromCache, features) {
    broadcast({
      total:    result?.visibleTotal  ?? 0,
      visible:  result?.visibleKept   ?? 0,
      hidden:   result ? result.visibleTotal - result.visibleKept : 0,
      hasOlder: result?.hasOlderMessages ?? false,
      enabled:  true,
      fromCache,
      features, // pass active features to popup
    });
  }

  // ── In-flight dedup ───────────────────────────────────────────────────────
  const inFlight = new Map();

  async function fetchAndProcess(convId, signal) {
    if (inFlight.has(convId)) return inFlight.get(convId);
    const cfg   = getConfig();
    const extra = getExtra(convId);
    const url   = `https://chatgpt.com/backend-api/conversation/${convId}`;

    const work = (async () => {
      try {
        const res = await originalFetch(url, signal ? { signal } : {});
        if (!res.ok) {
          // 404 = conversation deleted/inaccessible — mark as skip so we don't retry
          if (res.status === 404) prefetchQueued.add(convId + '_skip');
          return;
        }
        const text      = await res.text();
        const processed = await dbProcess(convId, text, cfg.limit, extra);
        if (processed) memPut(convId, processed.body, processed.result);
      } catch (e) {
        // Suppress network/CORS errors from prefetch — not user-facing
      }
    })();

    inFlight.set(convId, work);
    work.finally(() => inFlight.delete(convId));
    return work;
  }

  // ── Fetch proxy ───────────────────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);
  let currentConvId   = null;

  window.fetch = async function (...args) {
    const req = args[0];
    const url = req instanceof Request ? req.url : String(req);

    // Only intercept GET requests to the conversation endpoint
    // POST/PUT/DELETE go straight through (message sends, etc.)
    const method = req instanceof Request ? req.method : (args[1]?.method || 'GET');
    if (method !== 'GET') return originalFetch(...args);

    if (!url.includes('/backend-api/conversation/')) return originalFetch(...args);

    const cfg = getConfig();
    if (!cfg.enabled) return originalFetch(...args);

    // Extract UUID only — reject paths like "69a59bee.../messages"
    const segment = url.split('/backend-api/conversation/')[1]?.split('?')[0];
    const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!segment || !UUID_RE.test(segment)) return originalFetch(...args);
    const convId = segment;

    if (convId !== currentConvId) {
      // Switching conversations — clear extra for old one
      if (currentConvId) clearExtra(currentConvId);
      currentConvId = convId;
    }

    const features = {
      worker:   cfg.workerEnabled   && workerReady,
      idb:      cfg.idbEnabled      && workerReady,
      batching: cfg.batchingEnabled,
    };

    // Skip cache if Load More or Reset just triggered a reload.
    // Both flags are set synchronously before reload so they're always
    // present by the time the first fetch fires after reload.
    let skipCache = false;
    try {
      const nav  = sessionStorage.getItem('tc_navigating');
      const skip = sessionStorage.getItem('tc_skip_once');
      if (nav === convId) {
        skipCache = true;
        sessionStorage.removeItem('tc_navigating');
        console.log(`[GPT Lift] Load More — cache skip for ${convId.slice(0,8)}…`);
      } else if (skip === convId) {
        skipCache = true;
        sessionStorage.removeItem('tc_skip_once');
        console.log(`[GPT Lift] Reset — cache skip for ${convId.slice(0,8)}…`);
      }
    } catch { /* ignore */ }

    // L1 memory
    if (!skipCache) {
      const memHit = memGet(convId);
      if (memHit) {
        console.log(`[GPT Lift] ⚡ L1: ${convId.slice(0,8)}…`);
        broadcastResult(memHit.result, true, features);
        const dummy = await originalFetch(...args);
        return buildResponse(dummy, memHit.body);
      }

      // L2 IndexedDB
      if (cfg.idbEnabled && workerReady) {
        const dbHit = await dbGet(convId);
        if (dbHit) {
          console.log(`[GPT Lift] ⚡ L2: ${convId.slice(0,8)}… (IndexedDB)`);
          memPut(convId, dbHit.body, dbHit.result);
          broadcastResult(dbHit.result, true, features);
          const dummy = await originalFetch(...args);
          return buildResponse(dummy, dbHit.body);
        }
      }

      // Join in-flight prefetch if available
      if (inFlight.has(convId)) {
        await inFlight.get(convId);
        const hit = memGet(convId);
        if (hit) {
          broadcastResult(hit.result, true, features);
          const dummy = await originalFetch(...args);
          return buildResponse(dummy, hit.body);
        }
      }
    }

    // L3 network
    const response = await originalFetch(...args);
    if (!response.ok) return response;

    try {
      const extra     = getExtra(convId);
      const text      = await response.clone().text();
      const processed = await dbProcess(convId, text, cfg.limit, extra);
      if (!processed) return response;
      memPut(convId, processed.body, processed.result);
      broadcastResult(processed.result, false, features);
      return buildResponse(response, processed.body);
    } catch (err) {
      console.warn('[GPT Lift] Fetch intercept error:', err);
      return response;
    }
  };

  // ── Proactive idle prefetch ───────────────────────────────────────────────
  const prefetchQueued = new Set();

  function extractConvId(href) {
    const m = href?.match(/\/c\/([a-f0-9-]{36})/i);
    return m ? m[1] : null;
  }

  function queuePrefetch(convId) {
    const cfg = getConfig();
    if (!cfg.enabled) return;
    if (prefetchQueued.size >= 8) return;
    if (prefetchQueued.has(convId) || prefetchQueued.has(convId + '_skip')) return;
    if (memGet(convId) || convId === currentConvId) return;
    prefetchQueued.add(convId);

    const run = async (deadline) => {
      if (deadline?.timeRemaining() < 10) {
        requestIdleCallback(run, { timeout: 5000 }); return;
      }
      if (memGet(convId)) return;
      if (cfg.idbEnabled && workerReady) {
        const dbHit = await dbGet(convId);
        if (dbHit) { memPut(convId, dbHit.body, dbHit.result); return; }
      }
      if (!inFlight.has(convId)) fetchAndProcess(convId);
    };

    'requestIdleCallback' in window
      ? requestIdleCallback(run, { timeout: 5000 })
      : setTimeout(() => run(null), prefetchQueued.size * 300);
  }

  function scanSidebar() {
    document.querySelectorAll('a[href*="/c/"]').forEach(link => {
      const id = extractConvId(link.getAttribute('href'));
      if (id) queuePrefetch(id);
    });
  }

  function startSidebarObserver() {
    scanSidebar();
    const root = document.querySelector('nav') || document.body;
    const obs  = new MutationObserver(() => { clearTimeout(obs._t); obs._t = setTimeout(scanSidebar, 250); });
    obs.observe(root, { childList: true, subtree: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', startSidebarObserver)
    : setTimeout(startSidebarObserver, 0);

  document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a[href*="/c/"]');
    if (!link) return;
    const id = extractConvId(link.getAttribute('href'));
    if (!id || id === currentConvId || memGet(id) || inFlight.has(id)) return;
    fetchAndProcess(id);
  }, { passive: true });

  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      const id = extractConvId(location.href);
      if (id) currentConvId = id;
      setTimeout(scanSidebar, 800);
    }
  }).observe(document, { subtree: true, childList: true });

  // ── Token batching (batchingEnabled) ─────────────────────────────────────
  let rafPending   = false;
  let mutBuf       = [];
  let streamingObs = null;
  let isStreaming   = false;
  let streamTimer   = null;

  function flushMutations() { rafPending = false; mutBuf = []; }

  function onMutation(mutations) {
    const cfg = getConfig();
    if (!cfg.batchingEnabled) return;
    mutBuf.push(...mutations);
    if (!rafPending) { rafPending = true; requestAnimationFrame(flushMutations); }
  }

  function startTokenBatching() {
    new MutationObserver(() => {
      const cfg       = getConfig();
      const streaming = cfg.batchingEnabled && !!(
        document.querySelector('.result-streaming') ||
        document.querySelector('[data-testid="streaming-indicator"]') ||
        document.querySelector('[class*="result-streaming"]')
      );

      if (streaming && !isStreaming) {
        isStreaming = true;
        const last = document.querySelector('[data-testid^="conversation-turn-"]:last-of-type')
                  || document.querySelector('article[data-testid]:last-of-type');
        if (last && !streamingObs) {
          streamingObs = new MutationObserver(onMutation);
          streamingObs.observe(last, { childList: true, subtree: true, characterData: true });
        }
      }

      if (!streaming && isStreaming) {
        isStreaming = false;
        clearTimeout(streamTimer);
        streamTimer = setTimeout(() => {
          streamingObs?.disconnect();
          streamingObs = null; mutBuf = [];
        }, 500);
      }
    }).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'data-testid'],
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', startTokenBatching)
    : setTimeout(startTokenBatching, 0);

  // ── Load More ─────────────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'turbochat-load-more') return;
    const cfg    = getConfig();
    const convId = currentConvId || getConvIdFromPath();
    if (!convId) { console.warn('[GPT Lift] Load More: no convId'); return; }

    const newExtra = getExtra(convId) + cfg.batchSize;
    console.log(`[GPT Lift] Load More: extra ${getExtra(convId)} → ${newExtra} (limit=${cfg.limit})`);

    // Invalidate caches BEFORE storing new extra
    dbInvalidate(convId);

    // Store extra — setExtra uses location.href which is same before/after reload
    setExtra(convId, newExtra);

    // NAVIGATING flag tells fetch proxy to skip L1/L2 on next load
    // tc_skip_once is the synchronous belt-and-suspenders version
    try {
      sessionStorage.setItem('tc_navigating', convId);
      sessionStorage.setItem('tc_skip_once', convId);
    } catch { /* ignore */ }

    location.reload();
  });

  // ── Init Worker ───────────────────────────────────────────────────────────
  (async () => {
    const cfg = getConfig();
    if (cfg.workerEnabled) {
      await initWorker();
    }
    console.log(`[GPT Lift] ✓ Ready — Worker:${workerReady} IDB:${cfg.idbEnabled} Batching:${cfg.batchingEnabled}`);
  })();

})();
