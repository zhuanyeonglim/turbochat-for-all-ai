# Changelog

## [2.3.0] — 2026-04-13

### Fixed
- **ChatGPT images not loading in chat** — removed `loading=lazy` retroactive assignment
  that was cancelling image fetches for AI-generated images
- **Images missing from PDF/Word export** — `extractImages()` was called on a detached clone
  (naturalWidth = 0), causing size filter to skip every image. Now extracts from live DOM first
- **Blob: URL images not captured** — added direct canvas path for same-origin blob URLs
- **XHR credential fix** — `withCredentials: true` on all fetches for signed CDN URLs

## [2.2.0] — 2026-04-13

### Fixed
- **PDF Save button broken on all platforms** — host site CSP blocks inline scripts in blob URLs.
  Removed all `<script>` from blob HTML; `window.print()` now driven from content script via
  the `win` reference returned by `window.open()`
- **ChatGPT export not working** — popup was calling `world: 'MAIN'` but export function
  lived in ISOLATED world. Switched to postMessage pattern
- **Gemini logo appearing large in PDF** — added `isUIImage()` DOM-tree check and
  Gemini-specific UI selector strip before image extraction

## [2.1.0] — 2026-04-13

### Fixed
- **Gemini images missing from PDF** — `extractImages()` called on detached clone
  (naturalWidth = 0). Fixed by extracting from live element before cloning
- **Word export missing images** — canvas throws SecurityError for cross-origin CDN images.
  Added XHR blob fetch fallback with credentials

### Added
- `fetchAsBase64()` — XHR-based cross-origin image fetcher
- `isUIImage()` — DOM-tree traversal to skip logos and UI chrome
- Extended `host_permissions` for Google CDN and OpenAI Azure CDN

## [2.0.0] — 2026-04-13

### Added
- **Gemini support** — DOM-based message limiting and export for gemini.google.com
- **4 export formats** — PDF, Word, JSON, Markdown across all 3 platforms
- **Image export** — AI-generated images captured as base64, embedded in PDF and Word
- `export_core.js` — shared export engine for all platforms
- 3-tab popup (ChatGPT · Claude · Gemini)
- Host permissions for Google CDN and OpenAI Azure CDN

### Changed
- Renamed from "GPT Lift" to "TurboChat for All AI"
- Manifest bumped to v2.0.0
- Added `downloads` permission

## [1.0.0] — 2026 (Initial release)

### Added
- ChatGPT fetch interception with Web Worker JSON processing
- IndexedDB L2 cache for instant repeat visits
- Token batching for smoother streaming
- Proactive idle prefetch of sidebar conversations
- Claude.ai DOM-based message limiting
- Load More button for ChatGPT and Claude
- Alt+Shift+L keyboard shortcut
- Per-chat memory (visible count persists across sessions)
- Basic HTML/PDF export
- Popup UI with platform tabs and live stats
