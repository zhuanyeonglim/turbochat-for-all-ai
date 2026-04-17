/* TurboChat — success_bridge.js
 * Runs on the success page. Injects extension ID so the page
 * can call chrome.runtime.sendMessage to activate Pro.
 * Also checks localStorage for token saved as fallback.
 */
(function () {
  // Inject our extension ID into the page via a <meta> tag
  const meta = document.createElement('meta');
  meta.name    = 'turbochat-ext-id';
  meta.content = chrome.runtime.id;
  document.head.appendChild(meta);

  // Fallback: if token was saved to localStorage by the success page,
  // pick it up and store in chrome.storage.sync
  const token = localStorage.getItem('tc_pro_token');
  const email = localStorage.getItem('tc_pro_email');
  if (token && email) {
    chrome.runtime.sendMessage({
      type: 'activate-pro-token',
      token,
      email,
    }, () => {
      localStorage.removeItem('tc_pro_token');
      localStorage.removeItem('tc_pro_email');
    });
  }
})();
