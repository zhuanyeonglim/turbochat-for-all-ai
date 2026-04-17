/* TurboChat — background.js  v2.3 */

const WORKER = 'https://turbochat.zhuanyeonglim.workers.dev';
const PROMPTS_PAGE = 'prompts.html';

// ── Install ───────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      enabled: true, limit: 5, batchSize: 10,
      workerEnabled: true, idbEnabled: true, batchingEnabled: true,
    });
  }
  // Set side panel behaviour on install
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

// ── Open Prompt Library side panel ────────────────────────────────────────────
async function openPromptPanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('no tab');

    if (chrome.sidePanel) {
      // Step 1: enable the panel for this tab
      await chrome.sidePanel.setOptions({
        tabId:   tab.id,
        path:    PROMPTS_PAGE,
        enabled: true,
      });
      // Step 2: open it
      await chrome.sidePanel.open({ windowId: tab.windowId });
      console.log('[TurboChat] Side panel opened');
    } else {
      throw new Error('sidePanel API not available');
    }
  } catch (err) {
    console.warn('[TurboChat] Side panel failed, opening popup window:', err.message);
    // Fallback: float a window on the right side of the screen
    chrome.windows.create({
      url:    chrome.runtime.getURL(PROMPTS_PAGE),
      type:   'popup',
      width:  480,
      height: 800,
    });
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-prompts') {
    await openPromptPanel();
    return;
  }
  if (command === 'load-more') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const url      = tab.url || '';
    const isClaude = url.includes('claude.ai');
    const isGemini = url.includes('gemini.google.com');
    const isGPT    = url.match(/chatgpt\.com|chat\.openai\.com/);
    if (!isClaude && !isGemini && !isGPT) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cl, gm) => {
        const id  = cl ? 'tc-load-btn-cl' : gm ? 'tc-load-btn-gm' : 'tc-load-btn';
        const btn = document.getElementById(id);
        if (btn && !btn.disabled) btn.click();
      },
      args: [isClaude, isGemini],
    }).catch(() => {});
  }
});

// ── Messages from popup & content scripts ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'open-prompts') {
    openPromptPanel().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // keep channel open
  }
  if (msg.type === 'verify-pro') {
    verifyProStatus().then(isPro => sendResponse({ isPro }));
    return true;
  }
  if (msg.type === 'activate-pro-token') {
    chrome.storage.sync.set({
      tc_pro_token: msg.token,
      tc_pro_email: msg.email,
      tc_pro:       true,
    }, () => sendResponse({ success: true }));
    return true;
  }
});

// ── External messages (from success page) ─────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'turbochat-activate-pro' && msg.token && msg.email) {
    chrome.storage.sync.set({
      tc_pro_token: msg.token,
      tc_pro_email: msg.email,
      tc_pro:       true,
    }, () => sendResponse({ success: true }));
    return true;
  }
});

// ── Pro token verification ────────────────────────────────────────────────────
async function verifyProStatus() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['tc_pro_token', 'tc_pro'], async (data) => {
      if (!data.tc_pro_token) { resolve(false); return; }
      try {
        const res = await fetch(`${WORKER}/verify`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token: data.tc_pro_token }),
        });
        const d = await res.json();
        chrome.storage.sync.set({ tc_pro: d.pro === true });
        resolve(d.pro === true);
      } catch {
        resolve(data.tc_pro === true);
      }
    });
  });
}

verifyProStatus();
