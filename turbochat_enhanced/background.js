/* TurboChat — background.js  v2.0.0 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      enabled:true, limit:5, batchSize:10,
      workerEnabled:true, idbEnabled:true, batchingEnabled:true,
    });
  }
  if (reason === 'update') {
    chrome.storage.local.get(['limit','_migrated_v2'], (d) => {
      if (!d._migrated_v2) {
        const updates = { _migrated_v2: true };
        if (!d.limit || d.limit === 15) updates.limit = 5;
        chrome.storage.local.set(updates);
      }
    });
  }
});

// Alt+Shift+L → Load More (all platforms)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'load-more') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const url = tab.url || '';
  const isClaude = url.includes('claude.ai');
  const isGemini = url.includes('gemini.google.com');
  const isGPT    = url.match(/chatgpt\.com|chat\.openai\.com/);
  if (!isClaude && !isGemini && !isGPT) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (cl, gm) => {
      const id = cl ? 'tc-load-btn-cl' : gm ? 'tc-load-btn-gm' : 'tc-load-btn';
      const btn = document.getElementById(id);
      if (btn && !btn.disabled) btn.click();
    },
    args: [isClaude, isGemini],
  }).catch(() => {});
});
