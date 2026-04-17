/* TurboChat — gemini_inject.js  |  MAIN world, document_start  |  gemini.google.com */
(function () {
  'use strict';
  window.__tcResetMessagesGemini = function () {
    window.postMessage({ type: 'turbochat-gemini-reset' }, '*');
  };
  console.log('[TurboChat] ✓ Gemini support loaded (DOM mode)');
})();
