/* TurboChat — claude_content.js  |  document_idle  |  claude.ai  v2.0
 *
 * DOM-based message limiting + multi-format export (PDF/Word/JSON/Markdown).
 * Exports ALL messages including hidden ones. Images captured as base64.
 */
(function () {
  'use strict';

  const ACCENT   = '#e07b53';
  const AI_LABEL = 'Claude';
  const PLATFORM = 'claude';

  // ── Config ─────────────────────────────────────────────────────────────────
  let limit = 5, batchSize = 10, enabled = true;

  function loadConfig() {
    chrome.storage.local.get({ enabled: true, limit: 5, batchSize: 10 }, (d) => {
      enabled = d.enabled ?? true; limit = d.limit ?? 5; batchSize = d.batchSize ?? 10;
    });
  }
  loadConfig();
  chrome.storage.onChanged.addListener(loadConfig);

  // ── CSS ────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .tc-cl-hidden { display: none !important; }

    #tc-load-more-cl {
      display: flex; justify-content: center;
      padding: 16px 0 8px;
    }
    #tc-load-btn-cl {
      background: rgba(212,132,90,.12); color: #e8c4a0;
      border: 1px solid rgba(212,132,90,.3); border-radius: 8px;
      padding: 10px 24px; font-size: 13px; font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: pointer; display: flex; flex-direction: column;
      align-items: center; gap: 3px; transition: background .15s;
      text-align: center; line-height: 1.4;
    }
    #tc-load-btn-cl:hover { background: rgba(212,132,90,.2); }
    #tc-load-btn-cl .tc-sub { font-size: 11px; opacity: 0.6; font-weight: 400; }

    #tc-pill-cl {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 10000; background: #1a1210; color: #e8c4a0;
      border: 1px solid rgba(212,132,90,.25); padding: 6px 16px;
      border-radius: 20px; font-size: 12px; font-weight: 600;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.5);
      pointer-events: none; opacity: 0; transition: opacity .3s ease; white-space: nowrap;
    }
    #tc-pill-cl.visible { opacity: 1; }
  `;
  document.head.appendChild(style);

  // ── State ──────────────────────────────────────────────────────────────────
  let hiddenCount = 0, loadMoreEl = null, pillEl = null, pillTimer = null;
  let applied = false, observer = null;

  // ── Per-chat memory ────────────────────────────────────────────────────────
  const CONV_KEY = 'tc_cl_conv_limits';

  function getVisibleTarget() {
    try { return (JSON.parse(localStorage.getItem(CONV_KEY) || '{}'))[location.pathname] ?? null; } catch { return null; }
  }
  function saveVisibleTarget(n) {
    try { const a = JSON.parse(localStorage.getItem(CONV_KEY)||'{}'); a[location.pathname]=n; localStorage.setItem(CONV_KEY,JSON.stringify(a)); } catch {}
  }
  function clearVisibleTarget() {
    try { const a = JSON.parse(localStorage.getItem(CONV_KEY)||'{}'); delete a[location.pathname]; localStorage.setItem(CONV_KEY,JSON.stringify(a)); } catch {}
  }

  // ── Pill ───────────────────────────────────────────────────────────────────
  function showPill(text, autohide) {
    if (!pillEl) { pillEl = document.createElement('div'); pillEl.id = 'tc-pill-cl'; document.body.appendChild(pillEl); }
    pillEl.textContent = text; pillEl.classList.add('visible');
    clearTimeout(pillTimer);
    if (autohide) pillTimer = setTimeout(() => pillEl?.classList.remove('visible'), autohide);
  }

  // ── Find message elements ──────────────────────────────────────────────────
  function getMessageGroups() {
    let msgs = [...document.querySelectorAll('[data-test-render-count]')];
    if (msgs.length > 1) return msgs;

    const colSels = [
      '[class*="ConversationContent"]','[class*="conversation-content"]',
      'main [class*="flex-col"] > [class*="group"]','main [class*="flex-col"] > div[class]',
    ];
    for (const sel of colSels) {
      const container = document.querySelector(sel);
      if (container) {
        msgs = [...container.children].filter(el => el.tagName==='DIV' && el.children.length>0 && !el.id?.startsWith('tc-'));
        if (msgs.length > 1) return msgs;
      }
    }

    const human = document.querySelector('[class*="human-turn"],[class*="HumanTurn"],[class*="user-message"]');
    if (human) {
      let node = human;
      while (node.parentElement && node.parentElement !== document.body) {
        const sibs = [...node.parentElement.children].filter(el => el.tagName==='DIV' && !el.id?.startsWith('tc-'));
        if (sibs.length > 2) return sibs;
        node = node.parentElement;
      }
    }

    const scrollArea = document.querySelector('main [class*="overflow-y"]') || document.querySelector('main');
    if (scrollArea) {
      msgs = [...scrollArea.children].filter(el => el.tagName==='DIV' && !el.id?.startsWith('tc-') && el.children.length>0);
      if (msgs.length > 1) return msgs;
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
      showPill(`TurboChat · ${total} messages`, 2500); return;
    }

    const toHide = total - effectiveLimit;
    for (let i = 0; i < toHide; i++) msgs[i].classList.add('tc-cl-hidden');
    hiddenCount = toHide; applied = true;

    insertLoadMoreButton(msgs, toHide, Math.min(batchSize, toHide));
    showPill(`${effectiveLimit} shown · ${toHide} above`, 3000);
    broadcastStatus(total, effectiveLimit, toHide);
  }

  function broadcastStatus(total, visible, hidden) {
    try {
      sessionStorage.setItem('turbochat_last_status_cl', JSON.stringify({
        url:location.href, total, kept:visible, hidden, hasOlder:hidden>0, enabled:true,
      }));
    } catch {}
  }

  function insertLoadMoreButton(msgs, toHide, batchCount) {
    loadMoreEl?.remove(); loadMoreEl = null;
    if (toHide <= 0) return;
    const firstVisible = msgs.find(el => !el.classList.contains('tc-cl-hidden'));
    if (!firstVisible?.parentElement) return;
    loadMoreEl = document.createElement('div');
    loadMoreEl.id = 'tc-load-more-cl';
    loadMoreEl.innerHTML = `
      <button id="tc-load-btn-cl">
        Load ${batchCount} previous messages
        <span class="tc-sub">${toHide} messages above</span>
      </button>`;
    firstVisible.parentElement.insertBefore(loadMoreEl, firstVisible);
    document.getElementById('tc-load-btn-cl').addEventListener('click', loadMoreMessages);
  }

  function loadMoreMessages() {
    const msgs   = getMessageGroups();
    const hidden = msgs.filter(el => el.classList.contains('tc-cl-hidden'));
    if (hidden.length === 0) { loadMoreEl?.remove(); loadMoreEl = null; return; }
    const toReveal = Math.min(batchSize, hidden.length);
    hidden.slice(-toReveal).forEach(el => el.classList.remove('tc-cl-hidden'));
    hiddenCount = hidden.length - toReveal;
    const vis = msgs.filter(el => !el.classList.contains('tc-cl-hidden')).length;
    saveVisibleTarget(vis);
    loadMoreEl?.remove(); loadMoreEl = null;
    if (hiddenCount > 0) insertLoadMoreButton(msgs, hiddenCount, Math.min(batchSize, hiddenCount));
    showPill(hiddenCount>0 ? `${hiddenCount} still above` : 'All messages shown', 2500);
    broadcastStatus(msgs.length, vis, hiddenCount);
  }

  // ── Export — ALL messages, images captured ─────────────────────────────────
  async function exportChat(format) {
    const core = window.__tcExportCore;
    if (!core) { alert('TurboChat: Export core not loaded. Please refresh.'); return; }

    // Temporarily reveal ALL hidden messages
    const wasHidden = [...document.querySelectorAll('.tc-cl-hidden')];
    wasHidden.forEach(el => el.classList.remove('tc-cl-hidden'));

    // Force-load lazy images, then wait for them to actually fetch
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.loading = 'eager'; img.removeAttribute('loading');
    });
    await new Promise(r => setTimeout(r, 800)); // let images start loading

    const title = document.title.replace(/\s*[-|].*Cla.*$/i,'').trim() || 'Claude Conversation';
    const msgs  = getMessageGroups();
    const extracted = [];

    for (const turn of msgs) {
      const isUser = !!turn.querySelector('[class*="human"],[class*="HumanTurn"],[class*="user-message"]')
                  || (turn.className||'').toLowerCase().includes('human');
      const images = await core.extractImages(turn);
      const inner  = turn.cloneNode(true);
      extracted.push({
        role:   isUser ? 'user' : 'assistant',
        text:   core.cleanText(inner),
        html:   core.cleanInnerHtml(inner),
        images,
      });
    }

    // Re-hide what was hidden
    wasHidden.forEach(el => el.classList.add('tc-cl-hidden'));

    if (extracted.length === 0) { alert('TurboChat: No messages found to export.'); return; }

    await core.dispatch(format, extracted, {
      title, platform: PLATFORM, accent: ACCENT, aiLabel: AI_LABEL,
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetMessages() {
    clearVisibleTarget();
    document.querySelectorAll('.tc-cl-hidden').forEach(el => el.classList.remove('tc-cl-hidden'));
    loadMoreEl?.remove(); loadMoreEl = null;
    hiddenCount = 0; applied = false;
    loadConfig(); setTimeout(applyLimit, 200);
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'turbochat-cl-reset') resetMessages();
    if (e.data?.type === 'turbochat-cl-export') exportChat(e.data.format || 'pdf');
  });

  // ── Auto-trim on new message ───────────────────────────────────────────────
  let autoTrimTimer = null;
  observer = new MutationObserver(() => {
    const msgs = getMessageGroups();
    if (!applied) { if (msgs.length >= 2) scheduleApply(800); return; }
    clearTimeout(autoTrimTimer);
    autoTrimTimer = setTimeout(() => {
      const current = getMessageGroups();
      const total   = current.length;
      const target  = getVisibleTarget() ?? limit;
      const hidden  = current.filter(m => m.classList.contains('tc-cl-hidden')).length;
      const visible = total - hidden;
      if (visible > target) {
        const toHide = visible - target;
        const candidates = current.filter(m => !m.classList.contains('tc-cl-hidden'));
        for (let i = 0; i < Math.min(toHide, candidates.length-2); i++) {
          candidates[i].classList.add('tc-cl-hidden');
        }
        const newHidden  = current.filter(m => m.classList.contains('tc-cl-hidden')).length;
        const newVisible = total - newHidden;
        hiddenCount = newHidden;
        loadMoreEl?.remove(); loadMoreEl = null;
        if (newHidden > 0) insertLoadMoreButton(current, newHidden, Math.min(batchSize, newHidden));
        broadcastStatus(total, newVisible, newHidden);
      }
    }, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── SPA navigation ─────────────────────────────────────────────────────────
  let lastUrl = location.href, applyTimer = null;

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

  scheduleApply(1500);

})();
