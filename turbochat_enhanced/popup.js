'use strict';

const app      = document.getElementById('app');
const togMain  = document.getElementById('tog-main');
const pwrLabel = document.getElementById('pwr-label');
const brandTag = document.getElementById('brand-tag');
const tabGPT   = document.getElementById('tab-gpt');
const tabCL    = document.getElementById('tab-cl');
const tabGM    = document.getElementById('tab-gm');
const sVis     = document.getElementById('s-vis');
const sHid     = document.getElementById('s-hid');
const notice   = document.getElementById('notice');
const slLimit  = document.getElementById('sl-limit');
const slBatch  = document.getElementById('sl-batch');
const vLimit   = document.getElementById('v-limit');
const vBatch   = document.getElementById('v-batch');
const plusCard = document.getElementById('plus-card');
const tWorker  = document.getElementById('t-worker');
const tIdb     = document.getElementById('t-idb');
const tBatch   = document.getElementById('t-batching');
const bWorker  = document.getElementById('b-worker');
const bIdb     = document.getElementById('b-idb');
const bBatchBadge = document.getElementById('b-batch');
const btnReset = document.getElementById('btn-reset');
const btnSave  = document.getElementById('btn-save');
const exportNote = document.getElementById('export-note');
const exportScope = document.getElementById('export-scope');

const DEFAULTS = {
  enabled:true, limit:5, batchSize:10,
  workerEnabled:true, idbEnabled:true, batchingEnabled:true,
};

const PLATFORM = {
  gpt: {
    accent:'#10a37f', bg:'rgba(16,163,127,.1)', bd:'rgba(16,163,127,.22)',
    tag:'Speed fix for ChatGPT', tabCls:'active-gpt',
    statusKey:'turbochat_last_status',
    exportScope:'All messages + generated images',
  },
  claude: {
    accent:'#e07b53', bg:'rgba(224,123,83,.1)',  bd:'rgba(224,123,83,.22)',
    tag:'Speed fix for Claude.ai', tabCls:'active-cl',
    statusKey:'turbochat_last_status_cl',
    exportScope:'All messages (incl. hidden) + uploads',
  },
  gemini: {
    accent:'#4285f4', bg:'rgba(66,133,244,.1)',  bd:'rgba(66,133,244,.22)',
    tag:'Speed fix for Gemini', tabCls:'active-gm',
    statusKey:'turbochat_last_status_gm',
    exportScope:'All messages + generated images',
  },
};

let activePlatform = 'gpt';

function setPlatform(p) {
  activePlatform = p;
  const cfg = PLATFORM[p];
  const root = document.documentElement;
  root.style.setProperty('--accent',    cfg.accent);
  root.style.setProperty('--accent-bg', cfg.bg);
  root.style.setProperty('--accent-bd', cfg.bd);
  brandTag.textContent    = cfg.tag;
  exportScope.textContent = cfg.exportScope;

  [tabGPT, tabCL, tabGM].forEach(t => t.className = 'tab');
  ({ gpt:tabGPT, claude:tabCL, gemini:tabGM })[p].classList.add(cfg.tabCls);

  // Power toggle color (hardcoded — no CSS vars in toggle)
  const pwrTrack = togMain.nextElementSibling;
  if (pwrTrack && togMain.checked) {
    pwrTrack.style.background  = cfg.accent;
    pwrTrack.style.borderColor = cfg.accent;
  }

  plusCard.style.display = p === 'gpt' ? '' : 'none';
  sVis.textContent = sHid.textContent = '—';
  pollStats();
}

// Load settings
chrome.storage.local.get(DEFAULTS, (d) => {
  togMain.checked   = d.enabled;
  slLimit.value     = d.limit;      vLimit.textContent = d.limit;
  slBatch.value     = d.batchSize;  vBatch.textContent = d.batchSize;
  tWorker.checked   = d.workerEnabled;
  tIdb.checked      = d.idbEnabled;
  tBatch.checked    = d.batchingEnabled;
  updateBadges();
  if (!d.enabled) app.classList.add('off');
});

// Events
togMain.addEventListener('change', () => { app.classList.toggle('off', !togMain.checked); save(); });
tabGPT.addEventListener('click',  () => setPlatform('gpt'));
tabCL.addEventListener('click',   () => setPlatform('claude'));
tabGM.addEventListener('click',   () => setPlatform('gemini'));

slLimit.addEventListener('input',  () => { vLimit.textContent = slLimit.value; });
slBatch.addEventListener('input',  () => { vBatch.textContent = slBatch.value; });
slLimit.addEventListener('change', save);
slBatch.addEventListener('change', save);
tWorker.addEventListener('change', () => { updateBadges(); save(); });
tIdb.addEventListener('change',    () => { if(tIdb.checked && !tWorker.checked) tWorker.checked=true; updateBadges(); save(); });
tBatch.addEventListener('change',  () => { updateBadges(); save(); });

btnSave.addEventListener('click', () => {
  save(() => { btnSave.textContent = 'Saved ✓'; setTimeout(() => { btnSave.textContent = 'Save'; }, 1500); });
});

// ── Export buttons ──────────────────────────────────────────────────────────
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('exporting')) return;
    const format = btn.dataset.format;
    await doExport(format, btn);
  });
});

async function doExport(format, btn) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs.find(t => t.url?.match(/chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com/));
  if (!tab) {
    exportNote.textContent = '⚠ No AI tab found';
    setTimeout(() => { exportNote.textContent = 'Click a format to export'; }, 2000);
    return;
  }

  const labels = { pdf:'PDF', word:'Word', json:'JSON', markdown:'Markdown' };
  btn.classList.add('exporting');
  exportNote.textContent = `Exporting ${labels[format]}…`;

  const isClaude = tab.url?.includes('claude.ai');
  const isGemini = tab.url?.includes('gemini.google.com');

  try {
    if (isClaude) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (fmt) => window.postMessage({ type: 'turbochat-cl-export', format: fmt }, '*'),
        args: [format],
      });
    } else if (isGemini) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (fmt) => window.postMessage({ type: 'turbochat-gemini-export', format: fmt }, '*'),
        args: [format],
      });
    } else {
      // ChatGPT — postMessage to content.js (ISOLATED world)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (fmt) => window.postMessage({ type: 'turbochat-gpt-export', format: fmt }, '*'),
        args: [format],
      });
    }

    exportNote.textContent = `✓ ${labels[format]} export started`;
    setTimeout(() => window.close(), 800);
  } catch (err) {
    exportNote.textContent = `⚠ Export failed — try refreshing`;
    console.error('TurboChat export error:', err);
  }

  btn.classList.remove('exporting');
  setTimeout(() => { exportNote.textContent = 'Click a format to export'; }, 3000);
}

// ── Badges ──────────────────────────────────────────────────────────────────
function updateBadges() {
  const upd = (el, on) => { el.classList.toggle('off', !on); el.textContent = on ? 'Active' : 'Off'; };
  upd(bWorker, tWorker.checked);
  upd(bIdb,    tIdb.checked);
  upd(bBatchBadge, tBatch.checked);
}

function getFormValues() {
  return {
    enabled:         togMain.checked,
    limit:           parseInt(slLimit.value, 10),
    batchSize:       parseInt(slBatch.value, 10),
    workerEnabled:   tWorker.checked,
    idbEnabled:      tIdb.checked,
    batchingEnabled: tBatch.checked,
  };
}
function save(cb) { chrome.storage.local.set(getFormValues(), () => cb && cb()); }

// ── Reset ───────────────────────────────────────────────────────────────────
btnReset.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs.find(t => t.url?.match(/chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com/));
  if (!tab) { btnReset.textContent = 'No tab'; setTimeout(() => { btnReset.textContent = 'Reset'; }, 2000); return; }

  const isClaude = tab.url?.includes('claude.ai');
  const isGemini = tab.url?.includes('gemini.google.com');

  if (isClaude) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.postMessage({ type: 'turbochat-cl-reset' }, '*'),
    }).catch(() => {});
  } else if (isGemini) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          const all = JSON.parse(localStorage.getItem('tc_gm_conv_limits') || '{}');
          delete all[location.pathname];
          localStorage.setItem('tc_gm_conv_limits', JSON.stringify(all));
        } catch {}
        window.postMessage({ type: 'turbochat-gemini-reset' }, '*');
      },
    }).catch(() => {});
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: () => {
        try {
          const m = location.pathname.match(/\/c\/([a-f0-9-]{36})/i);
          const convId = m ? m[1] : null;
          if (convId) {
            const all = JSON.parse(localStorage.getItem('tc_conv_limits') || '{}');
            delete all[convId];
            localStorage.setItem('tc_conv_limits', JSON.stringify(all));
          }
        } catch {}
        if (typeof window.__tcResetMessages === 'function') window.__tcResetMessages();
        else location.reload();
      },
    }).catch(() => {});
  }

  btnReset.textContent = 'Resetting…';
  setTimeout(() => { btnReset.textContent = 'Reset'; }, 2000);
  setTimeout(() => window.close(), 400);
});

// ── Poll stats ───────────────────────────────────────────────────────────────
async function pollStats() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs.find(t => t.url?.match(/chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com/));
    if (!tab) { notice.style.display = 'block'; return; }
    notice.style.display = 'none';

    const url = tab.url || '';
    const detected = url.includes('claude.ai') ? 'claude'
                   : url.includes('gemini.google.com') ? 'gemini'
                   : 'gpt';
    if (detected !== activePlatform) setPlatform(detected);

    const statusKey = PLATFORM[activePlatform].statusKey;
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (key) => {
        try { const r = sessionStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
      },
      args: [statusKey],
    }).catch(() => null);

    const s = result?.[0]?.result;
    if (!s) return;
    sVis.textContent = s.kept ?? s.visible ?? '—';
    sHid.textContent = (s.hidden ?? 0) > 0 ? s.hidden : '0';
    updateBadges();
  } catch {}
}

pollStats();
setInterval(pollStats, 2500);
