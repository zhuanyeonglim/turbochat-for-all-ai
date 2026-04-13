/* TurboChat — gemini_content.js  |  document_idle  |  gemini.google.com
 *
 * DOM-based message limiting + export for Gemini.
 * Gemini uses custom elements: <user-query> and <model-response>
 * as well as various class-based selectors depending on version.
 */
(function () {
  'use strict';

  const ACCENT    = '#4285f4';
  const AI_LABEL  = 'Gemini';
  const PLATFORM  = 'gemini';

  // ── Config ─────────────────────────────────────────────────────────────────
  let limit     = 5;
  let batchSize = 10;
  let enabled   = true;

  function loadConfig() {
    chrome.storage.local.get({ enabled: true, limit: 5, batchSize: 10 }, (d) => {
      enabled   = d.enabled   ?? true;
      limit     = d.limit     ?? 5;
      batchSize = d.batchSize ?? 10;
    });
  }
  loadConfig();
  chrome.storage.onChanged.addListener(loadConfig);

  // ── CSS ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .tc-gm-hidden { display: none !important; }

    #tc-load-more-gm {
      display: flex; justify-content: center;
      padding: 16px 0 8px;
    }
    #tc-load-btn-gm {
      background: rgba(66,133,244,.1);
      color: #aac4f7;
      border: 1px solid rgba(66,133,244,.3);
      border-radius: 8px;
      padding: 10px 24px;
      font-size: 13px; font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: pointer;
      display: flex; flex-direction: column;
      align-items: center; gap: 3px;
      transition: background .15s;
      text-align: center; line-height: 1.4;
    }
    #tc-load-btn-gm:hover { background: rgba(66,133,244,.18); }
    #tc-load-btn-gm .tc-sub { font-size: 11px; opacity: 0.6; font-weight: 400; }

    #tc-pill-gm {
      position: fixed; top: 12px; left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      background: #0d1117; color: #aac4f7;
      border: 1px solid rgba(66,133,244,.25);
      padding: 6px 16px; border-radius: 20px;
      font-size: 12px; font-weight: 600;
      font-family: -apple-system, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,.5);
      pointer-events: none;
      opacity: 0; transition: opacity .3s ease;
      white-space: nowrap;
    }
    #tc-pill-gm.visible { opacity: 1; }
  `;
  document.head.appendChild(style);

  // ── State ──────────────────────────────────────────────────────────────────
  let hiddenCount = 0;
  let loadMoreEl  = null;
  let pillEl      = null;
  let pillTimer   = null;
  let applied     = false;

  // ── Per-chat memory ────────────────────────────────────────────────────────
  const CONV_KEY = 'tc_gm_conv_limits';

  function getVisibleTarget() {
    try { return (JSON.parse(localStorage.getItem(CONV_KEY) || '{}'))[location.pathname] ?? null; } catch { return null; }
  }
  function saveVisibleTarget(n) {
    try {
      const all = JSON.parse(localStorage.getItem(CONV_KEY) || '{}');
      all[location.pathname] = n;
      localStorage.setItem(CONV_KEY, JSON.stringify(all));
    } catch {}
  }
  function clearVisibleTarget() {
    try {
      const all = JSON.parse(localStorage.getItem(CONV_KEY) || '{}');
      delete all[location.pathname];
      localStorage.setItem(CONV_KEY, JSON.stringify(all));
    } catch {}
  }

  // ── Pill ───────────────────────────────────────────────────────────────────
  function showPill(text, autohide) {
    if (!pillEl) {
      pillEl = document.createElement('div');
      pillEl.id = 'tc-pill-gm';
      document.body.appendChild(pillEl);
    }
    pillEl.textContent = text;
    pillEl.classList.add('visible');
    clearTimeout(pillTimer);
    if (autohide) pillTimer = setTimeout(() => pillEl?.classList.remove('visible'), autohide);
  }

  // ── Find Gemini message elements ───────────────────────────────────────────
  // Gemini uses custom elements: <user-query> and <model-response>
  // Multiple selector strategies in order of reliability.
  function getMessageGroups() {
    // Strategy 1: Gemini custom elements (most reliable)
    let msgs = [...document.querySelectorAll('user-query, model-response')];
    if (msgs.length > 1) return msgs;

    // Strategy 2: data-turn-index attribute (newer Gemini builds)
    msgs = [...document.querySelectorAll('[data-turn-index]')];
    if (msgs.length > 1) return msgs;

    // Strategy 3: class-based (fallback for UI updates)
    const selectors = [
      '.conversation-container > div[class]',
      'chat-content > div[class]',
      '[class*="conversation"] > [class*="turn"]',
      'main [class*="message-wrapper"]',
      'main [class*="response-container"]',
    ];
    for (const sel of selectors) {
      msgs = [...document.querySelectorAll(sel)].filter(el =>
        !el.id?.startsWith('tc-') && el.children.length > 0
      );
      if (msgs.length > 1) return msgs;
    }

    // Strategy 4: walk up from a known element
    const knownEl = document.querySelector(
      '.query-text, [class*="human-turn"], [class*="user-message"], ' +
      'message-content, .model-response-text'
    );
    if (knownEl) {
      let node = knownEl;
      while (node.parentElement && node.parentElement !== document.body) {
        const sibs = [...node.parentElement.children].filter(el =>
          el.tagName === 'DIV' && !el.id?.startsWith('tc-')
        );
        if (sibs.length > 2) return sibs;
        node = node.parentElement;
      }
    }

    return [];
  }

  // ── Apply limit ────────────────────────────────────────────────────────────
  function applyLimit() {
    if (!enabled) return;
    const msgs = getMessageGroups();
    if (msgs.length === 0) return;

    const total = msgs.length;
    const savedVisible = getVisibleTarget();
    const effectiveLimit = savedVisible !== null ? Math.max(savedVisible, limit) : limit;

    if (total <= effectiveLimit) {
      applied = true; hiddenCount = 0;
      showPill(`TurboChat · ${total} messages`, 2500);
      return;
    }

    const toHide = total - effectiveLimit;
    for (let i = 0; i < toHide; i++) msgs[i].classList.add('tc-gm-hidden');
    hiddenCount = toHide;
    applied = true;

    insertLoadMoreBtn(msgs, toHide, Math.min(batchSize, toHide));
    showPill(`${effectiveLimit} shown · ${toHide} above`, 3000);
    broadcastStatus(total, effectiveLimit, toHide);
  }

  function broadcastStatus(total, visible, hidden) {
    try {
      sessionStorage.setItem('turbochat_last_status_gm', JSON.stringify({
        url: location.href, total, kept: visible, hidden, hasOlder: hidden > 0, enabled: true,
      }));
    } catch {}
  }

  // ── Load More button ───────────────────────────────────────────────────────
  function insertLoadMoreBtn(msgs, toHide, batchCount) {
    loadMoreEl?.remove(); loadMoreEl = null;
    if (toHide <= 0) return;

    const firstVisible = msgs.find(el => !el.classList.contains('tc-gm-hidden'));
    if (!firstVisible?.parentElement) return;

    loadMoreEl = document.createElement('div');
    loadMoreEl.id = 'tc-load-more-gm';
    loadMoreEl.innerHTML = `
      <button id="tc-load-btn-gm">
        Load ${batchCount} previous messages
        <span class="tc-sub">${toHide} messages above</span>
      </button>
    `;
    firstVisible.parentElement.insertBefore(loadMoreEl, firstVisible);
    document.getElementById('tc-load-btn-gm').addEventListener('click', loadMoreMessages);
  }

  function loadMoreMessages() {
    const msgs   = getMessageGroups();
    const hidden = msgs.filter(el => el.classList.contains('tc-gm-hidden'));
    if (hidden.length === 0) { loadMoreEl?.remove(); loadMoreEl = null; return; }

    const toReveal = Math.min(batchSize, hidden.length);
    hidden.slice(-toReveal).forEach(el => el.classList.remove('tc-gm-hidden'));
    hiddenCount = hidden.length - toReveal;

    const vis = msgs.filter(el => !el.classList.contains('tc-gm-hidden')).length;
    saveVisibleTarget(vis);

    loadMoreEl?.remove(); loadMoreEl = null;
    if (hiddenCount > 0) insertLoadMoreBtn(msgs, hiddenCount, Math.min(batchSize, hiddenCount));

    showPill(hiddenCount > 0 ? `${hiddenCount} still above` : 'All messages shown', 2500);
    broadcastStatus(msgs.length, vis, hiddenCount);
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  // Gemini-specific UI selectors to strip before export
  const GEMINI_UI_STRIP = [
    'model-thoughts',       // thinking indicator
    '[class*="header"]',   // response header with logo
    '[class*="trailing"]', // trailing action buttons
    '[class*="footer"]',   // response footer
    '[class*="response-actions"]',
    '[class*="action-buttons"]',
    '[class*="gemini-logo"]',
    '[class*="model-icon"]',
    '[class*="brand"]',
    'toolbelt',            // Gemini toolbelt custom element
    '.vote-thumbs',
    'message-actions',
    'response-header',
    '[data-test-id="logo"]',
  ].join(',');

  async function exportChat(format) {
    const core = window.__tcExportCore;
    if (!core) { alert('TurboChat: Export core not loaded. Please refresh.'); return; }

    // Temporarily show all hidden messages for export
    const wasHidden = [...document.querySelectorAll('.tc-gm-hidden')];
    wasHidden.forEach(el => el.classList.remove('tc-gm-hidden'));

    // Force-load any lazy images now that elements are visible
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.loading = 'eager'; img.removeAttribute('loading');
    });
    // Wait for images to start loading after being revealed
    await new Promise(r => setTimeout(r, 800));

    const title = document.title.replace(/\s*[-|].*$/, '').trim() || 'Gemini Conversation';
    const msgs  = getMessageGroups();
    const extracted = [];

    for (const turn of msgs) {
      const tagName = turn.tagName?.toLowerCase();
      const isUser  = tagName === 'user-query'
        || !!turn.querySelector('.query-text, [class*="user-query"], [class*="human-turn"]')
        || (turn.className || '').toLowerCase().includes('user');

      // ── Step 1: extract images from the LIVE element ──────────────────────
      // Must happen BEFORE cloning — detached clones have naturalWidth/width = 0
      // which causes the size filter in extractImages to kill every image.
      const images = await core.extractImages(turn);

      // ── Step 2: clone and strip UI chrome for text/HTML ───────────────────
      const inner = turn.cloneNode(true);
      try {
        inner.querySelectorAll(GEMINI_UI_STRIP).forEach(el => el.remove());
        inner.querySelectorAll('img').forEach(img => {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w < 64 || h < 64) img.remove();
        });
      } catch {}

      extracted.push({
        role:   isUser ? 'user' : 'assistant',
        text:   core.cleanText(inner),
        html:   core.cleanInnerHtml(inner),
        images,
      });
    }

    // Re-hide what was hidden
    wasHidden.forEach(el => el.classList.add('tc-gm-hidden'));

    if (extracted.length === 0) { alert('TurboChat: No messages found to export.'); return; }

    await core.dispatch(format, extracted, {
      title, platform: PLATFORM, accent: ACCENT, aiLabel: AI_LABEL,
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetMessages() {
    clearVisibleTarget();
    document.querySelectorAll('.tc-gm-hidden').forEach(el => el.classList.remove('tc-gm-hidden'));
    loadMoreEl?.remove(); loadMoreEl = null;
    hiddenCount = 0; applied = false;
    loadConfig();
    setTimeout(applyLimit, 200);
  }

  // ── Message listener ───────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'turbochat-gemini-reset') resetMessages();
    if (e.data?.type === 'turbochat-gemini-export') exportChat(e.data.format || 'pdf');
  });

  // ── SPA navigation watcher ─────────────────────────────────────────────────
  let lastUrl    = location.href;
  let applyTimer = null;

  function scheduleApply(delay = 1500) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => { if (!applied) applyLimit(); }, delay);
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href; applied = false; hiddenCount = 0;
      loadMoreEl?.remove(); loadMoreEl = null;
      scheduleApply(1200);
    }
  }).observe(document, { subtree: true, childList: true });

  new MutationObserver(() => {
    const msgs = getMessageGroups();
    if (!applied && msgs.length >= 2) scheduleApply(800);
  }).observe(document.body, { childList: true, subtree: true });

  scheduleApply(1500);

})();
