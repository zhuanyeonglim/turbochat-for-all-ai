/* TurboChat — content.js  |  document_idle  |  ChatGPT  v2.0
 *
 * Load More button + scroll restore.
 * Export via __tcExportCore (multi-format, images captured).
 */
(function () {

  const ACCENT   = '#10a37f';
  const AI_LABEL = 'ChatGPT';
  const PLATFORM = 'chatgpt';

  // ── CSS ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    body:has(textarea#prompt-textarea:focus) div[role="presentation"] .react-scroll-to-bottom--content > div {
      content-visibility: auto !important; contain: size layout paint !important;
    }
    [data-testid^="conversation-turn-"], article[data-testid] { contain: layout style; }
    /* NOTE: do NOT set loading=lazy on images — ChatGPT generates images after
       the article element renders, so retroactive lazy = browser cancels load. */

    #tc-pill {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 10000; background: #18181b; color: #fff;
      padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;
      font-family: -apple-system, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.35);
      pointer-events: none; display: flex; align-items: center;
      gap: 7px; opacity: 0; transition: opacity .3s ease; white-space: nowrap;
    }
    #tc-pill.visible { opacity: 1; }
    #tc-pill .tc-dot { width: 7px; height: 7px; background: #22c55e; border-radius: 50%; flex-shrink: 0; }
    #tc-pill.warn .tc-dot { background: #f59e0b; }

    #tc-load-more { display: flex; justify-content: center; padding: 16px 0 8px; margin: 0; min-height: 56px; }
    #tc-load-btn {
      background: #2a2a2a; color: #ececf1; border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px; padding: 10px 24px; font-size: 13px; font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px;
      box-shadow: 0 2px 8px rgba(0,0,0,.25); transition: background .15s, transform .1s;
      text-align: center; line-height: 1.4;
    }
    #tc-load-btn:hover { background: #383838; }
    #tc-load-btn:active { transform: scale(.98); }
    #tc-load-btn:disabled { opacity:.5; cursor:default; transform:none; }
    #tc-load-btn .tc-sub { font-size: 11px; opacity: 0.55; font-weight: 400; }
  `;
  document.head.appendChild(style);

  // ── State ─────────────────────────────────────────────────────────────────
  let loadMoreEl = null, pillEl = null, pillTimer = null, batchSize = 10;

  const IS_LOAD_MORE_RELOAD = (() => {
    try { return !!sessionStorage.getItem('tc_navigating'); } catch { return false; }
  })();

  chrome.storage.local.get({ batchSize: 10 }, (d) => { batchSize = d.batchSize ?? 10; });
  chrome.storage.onChanged.addListener((c) => { if (c.batchSize) batchSize = c.batchSize.newValue; });

  // ── Pill ──────────────────────────────────────────────────────────────────
  function ensurePill() {
    if (pillEl) return pillEl;
    pillEl = document.createElement('div'); pillEl.id = 'tc-pill';
    pillEl.innerHTML = '<span class="tc-dot"></span><span id="tc-pill-text"></span>';
    document.body.appendChild(pillEl); return pillEl;
  }
  function showPill(text, warn, autohide) {
    const pill = ensurePill();
    pill.classList.toggle('warn', !!warn);
    document.getElementById('tc-pill-text').textContent = text;
    pill.classList.add('visible');
    clearTimeout(pillTimer);
    if (autohide) pillTimer = setTimeout(() => pill.classList.remove('visible'), autohide);
  }
  function hidePill() { pillEl?.classList.remove('visible'); }

  // ── Load More button ───────────────────────────────────────────────────────
  const MSG_SEL = '[data-testid^="conversation-turn-"], article[data-testid]';

  function showLoadMore(hidden, batchCount) {
    const firstMsg = document.querySelector(MSG_SEL);
    if (!firstMsg) return;
    const parent = firstMsg.parentElement;
    if (!parent) return;
    if (loadMoreEl && loadMoreEl.parentElement !== parent) removeLoadMore();
    if (!loadMoreEl) {
      loadMoreEl = document.createElement('div'); loadMoreEl.id = 'tc-load-more';
      parent.insertBefore(loadMoreEl, firstMsg);
    }
    loadMoreEl.innerHTML = `
      <button id="tc-load-btn">
        Load ${batchCount} previous messages
        <span class="tc-sub">${hidden} messages above this point</span>
      </button>`;
    document.getElementById('tc-load-btn').addEventListener('click', onLoadMoreClick);
  }

  function onLoadMoreClick() {
    const btn = document.getElementById('tc-load-btn');
    if (!btn || btn.disabled) return;
    btn.innerHTML = `⏳ Loading…<span class="tc-sub">please wait</span>`;
    btn.disabled = true;
    saveScrollAnchor();
    setTimeout(() => window.postMessage({ type: 'turbochat-load-more' }, '*'), 120);
  }

  function removeLoadMore() { loadMoreEl?.remove(); loadMoreEl = null; }

  // ── Scroll anchor ─────────────────────────────────────────────────────────
  function saveScrollAnchor() {
    try {
      for (const turn of document.querySelectorAll(MSG_SEL)) {
        const rect = turn.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          sessionStorage.setItem('tc_scroll_anchor', JSON.stringify({
            anchorId: turn.getAttribute('data-testid') || '', anchorTop: rect.top,
          }));
          return;
        }
      }
    } catch {}
  }

  function restoreScrollAnchor() {
    if (!IS_LOAD_MORE_RELOAD) return;
    try { sessionStorage.removeItem('tc_navigating'); } catch {}
    const raw = sessionStorage.getItem('tc_scroll_anchor');
    if (!raw) return;
    try {
      const { anchorId, anchorTop } = JSON.parse(raw);
      if (!anchorId) return;
      sessionStorage.removeItem('tc_scroll_anchor');
      let found = false, retries = 0;
      const attempt = () => {
        const el = document.querySelector(`[data-testid="${CSS.escape(anchorId)}"]`);
        if (el) {
          found = true; el.scrollIntoView({ block: 'start', behavior: 'instant' });
          requestAnimationFrame(() => {
            const diff = el.getBoundingClientRect().top - anchorTop;
            if (Math.abs(diff) > 4) {
              let node = el.parentElement;
              while (node && node !== document.documentElement) {
                if (/(auto|scroll)/.test(window.getComputedStyle(node).overflowY)) { node.scrollTop += diff; return; }
                node = node.parentElement;
              }
              window.scrollBy(0, diff);
            }
          });
        } else if (++retries < 20) setTimeout(attempt, 250);
      };
      const obs = new MutationObserver(() => {
        const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
        if (turns.length >= 2 && !found) { obs.disconnect(); setTimeout(attempt, 80); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { if (!found) { obs.disconnect(); attempt(); } }, 4000);
    } catch {}
  }

  // ── Status receiver ───────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'turbochat-status') return;
    const s = e.data.payload;
    if (!s?.enabled) { hidePill(); removeLoadMore(); return; }
    if (s.hasOlder) {
      const batchCount = Math.min(batchSize, s.hidden || 0);
      showLoadMore(s.hidden || 0, batchCount);
      showPill(`${s.visible} shown · ${s.hidden} above${s.fromCache ? ' · ⚡' : ''}`, false, 3000);
    } else {
      removeLoadMore();
      if (s.total > 0) showPill(`TurboChat · ${s.total} messages`, false, 2500);
    }
  });

  // ── Config sync ───────────────────────────────────────────────────────────
  function syncConfig() {
    chrome.storage.local.get(['enabled','limit','batchSize'], (data) => {
      localStorage.setItem('turbochat_config', JSON.stringify({
        enabled:   data.enabled   ?? true,
        limit:     data.limit     ?? 5,
        batchSize: data.batchSize ?? 10,
      }));
      batchSize = data.batchSize ?? 10;
      if (!data.enabled) { hidePill(); removeLoadMore(); }
    });
  }
  syncConfig();
  chrome.storage.onChanged.addListener(syncConfig);
  restoreScrollAnchor();

  // Startup status recovery
  function applyStatus(s) {
    if (!s?.hasOlder) return;
    const cfg = (() => { try { return JSON.parse(localStorage.getItem('turbochat_config')||'{}'); } catch { return {}; } })();
    const bs = cfg.batchSize || 10;
    const batchCount = Math.min(bs, s.hidden || 0);
    if (batchCount < 1) return;
    showLoadMore(s.hidden || 0, batchCount);
    showPill(`${s.visible || 0} shown · ${s.hidden || 0} above`, false, 3000);
  }

  function waitForMessagesAndApply() {
    if (document.getElementById('tc-load-more')) return;
    let attempts = 0;
    const check = () => {
      if (document.getElementById('tc-load-more')) return;
      if (document.querySelectorAll(MSG_SEL).length > 0) {
        try {
          const raw = sessionStorage.getItem('turbochat_last_status');
          if (!raw) return;
          const stored = JSON.parse(raw);
          if (stored.url === location.href) applyStatus(stored);
        } catch {}
        return;
      }
      if (++attempts < 30) setTimeout(check, 300);
    };
    setTimeout(check, 500);
  }
  waitForMessagesAndApply();

  // NOTE: lazy loading intentionally removed — setting loading=lazy retroactively
  // on ChatGPT's AI-generated images causes the browser to cancel pending loads
  // for images above/near the viewport boundary. Images never render.

  // ── ChatGPT Export — triggered via postMessage from popup ────────────────
  // content.js runs in ISOLATED world — popup uses postMessage, not world:MAIN
  async function exportChatGPT(format) {
    const core = window.__tcExportCore;
    if (!core) { alert('TurboChat: Export core not loaded. Please refresh.'); return; }

    const turns = [...document.querySelectorAll(MSG_SEL)];
    if (turns.length === 0) { alert('TurboChat: No messages found to export.'); return; }

    const title = document.title.replace(/\s*[-|].*ChatGPT.*$/i,'').trim() || 'ChatGPT Conversation';
    const extracted = [];

    for (const turn of turns) {
      const isUser = turn.getAttribute('data-testid')?.includes('human')
                  || !!turn.querySelector('[data-message-author-role="user"]');
      const images = await core.extractImages(turn);
      const inner  = turn.cloneNode(true);
      extracted.push({
        role:   isUser ? 'user' : 'assistant',
        text:   core.cleanText(inner),
        html:   core.cleanInnerHtml(inner),
        images,
      });
    }

    if (extracted.length === 0) { alert('TurboChat: No content to export.'); return; }

    await core.dispatch(format, extracted, {
      title, platform: PLATFORM, accent: ACCENT, aiLabel: AI_LABEL,
    });
  }

  // Listen for export trigger from popup (ISOLATED world receives window messages)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'turbochat-gpt-export') exportChatGPT(e.data.format || 'pdf');
  });

})();

// ── Prompt Library injection ──────────────────────────────────────────────────
// Borrowed from Prompt OS injection logic — handles textarea, contenteditable,
// Lexical editor (ChatGPT), ProseMirror (various)
function tcFindChatInput() {
  const selectors = [
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][data-lexical-editor="true"]',
    'div.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return el;
  }
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function tcInsertText(el, text) {
  el.focus();

  // Textarea / input — use React-compatible value setter
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) {
      setter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ContentEditable (ChatGPT Lexical, Claude ProseMirror, Gemini)
  // execCommand preserves newlines; textContent does not
  if (el.isContentEditable) {
    // Clear existing content first
    el.focus();
    document.execCommand('selectAll', false, null);
    // Insert with newlines preserved
    const success = document.execCommand('insertText', false, text);
    if (!success) {
      // execCommand fallback for browsers that block it
      el.textContent = '';
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        el.appendChild(document.createTextNode(line));
        if (i < lines.length - 1) el.appendChild(document.createElement('br'));
      });
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return true;
  }
  return false;
}

window.addEventListener('message', (e) => {
  if (e.data?.type === 'TURBOCHAT_INSERT_PROMPT' && e.data.text) {
    const el = tcFindChatInput();
    if (el) tcInsertText(el, e.data.text);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TURBOCHAT_INSERT_PROMPT') {
    const el = tcFindChatInput();
    if (!el) { sendResponse({ ok: false, reason: 'No chat input found' }); return false; }
    const ok = tcInsertText(el, msg.text);
    sendResponse({ ok });
    return false;
  }
});
