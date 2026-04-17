# Changelog

All notable changes to TurboChat for All AI are documented here.

## [2.0.0] — 2026-04-13

### Added
- **Gemini support** — full DOM-based message limiting and export for gemini.google.com
- **4 export formats** — PDF, Word (.doc), JSON, Markdown across all 3 platforms
- **Image export** — AI-generated images captured as base64 and embedded in PDF and Word
- `export_core.js` — shared export engine used by all platforms
- Per-platform platform tabs in popup (ChatGPT · Claude · Gemini)
- Export scope label per platform showing what gets captured
- XHR-based image fetcher for cross-origin CDN images (Google, OpenAI Azure CDN)
- Host permissions for Google CDN (`*.googleusercontent.com`) for image capture

### Fixed
- PDF "Save as PDF" button was broken on all platforms due to CSP blocking inline scripts in blob URLs — fixed by driving `window.print()` from the content script on the window reference, bypassing CSP entirely
- ChatGPT export was calling `world: 'MAIN'` from popup but export function was in ISOLATED world — fixed with postMessage approach matching Claude/Gemini
- Gemini images not appearing in PDF — `extractImages()` was called on a detached clone where `naturalWidth/width = 0`, causing every image to be filtered out — fixed by extracting from live DOM element before cloning
- Gemini star logo appearing in PDF exports — fixed with UI element detection (`isUIImage()`) and Gemini-specific selector strip before export
- Word export missing images — canvas `toDataURL()` throws SecurityError for cross-origin images; fixed with XHR blob fetch fallback

### Changed
- Extension renamed from "GPT Lift" to "TurboChat for All AI"
- Manifest version bumped to 2.0.0
- Added `downloads` permission to manifest

## [1.0.0] — 2026 (Initial)

### Added
- ChatGPT fetch interception with Web Worker JSON processing
- IndexedDB L2 cache for instant repeat visits
- Token batching for smoother streaming
- Proactive idle prefetch of sidebar conversations
- Claude.ai DOM-based message limiting
- Load More button for both platforms
- Alt+Shift+L keyboard shortcut
- Per-chat memory (persists visible count across sessions)
- Basic HTML export (PDF via browser print)
- Popup UI with platform tabs and stats
