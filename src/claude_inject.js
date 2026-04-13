/* GPT Lift — claude_inject.js  |  MAIN world, document_start  |  claude.ai
 *
 * Claude.ai approach: DOM-based message hiding (NOT fetch interception).
 * Fetch interception breaks Claude.ai because the internal API endpoints
 * and response structure differ from what we'd guess. DOM hiding is:
 *   - Safe: can't break page loading
 *   - Simple: no API knowledge needed
 *   - No reload needed for Load More
 *   - Works regardless of API changes
 */
(function () {
  'use strict';

  // Public reset — popup calls this
  window.__tcResetMessagesCl = function () {
    window.postMessage({ type: 'turbochat-cl-reset' }, '*');
  };

  console.log('[GPT Lift] ✓ Claude.ai support loaded (DOM mode)');
})();
