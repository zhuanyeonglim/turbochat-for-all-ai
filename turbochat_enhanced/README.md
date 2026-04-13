<div align="center">

<img src="icons/icon128.png" width="80" alt="TurboChat Logo">

# TurboChat for All AI

**The only browser extension that fixes lag AND exports full conversations — for ChatGPT, Claude, and Gemini.**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/your-username/turbochat-for-all-ai/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-orange.svg)](manifest.json)
[![Platforms](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini-purple.svg)](#supported-platforms)

[Features](#features) · [Export Formats](#export-formats) · [Installation](#installation) · [How It Works](#how-it-works) · [Contributing](#contributing) · [License](#license)

</div>

---

## Overview

Long AI conversations get slow. Really slow. ChatGPT lags with 50+ messages. Claude freezes. Gemini struggles. **TurboChat** solves this by showing only the most recent messages on load and letting you page through older ones — keeping the page fast while keeping all your history intact.

But that's only half of it. We also built **the most complete AI conversation export tool available**:

- Export to **PDF, Word (.doc), JSON, and Markdown**
- Captures **AI-generated images** embedded directly into your exports
- Works across **all three major AI platforms** — not just one
- No servers, no accounts, no data ever leaves your browser

---

## Features

### ⚡ Performance Engine
| Feature | ChatGPT | Claude | Gemini |
|---------|---------|--------|--------|
| Message limiting (show N on load) | ✅ | ✅ | ✅ |
| Load More button (batch reveal) | ✅ | ✅ | ✅ |
| Keyboard shortcut (Alt+Shift+L) | ✅ | ✅ | ✅ |
| Per-chat memory (remembers your position) | ✅ | ✅ | ✅ |
| Web Worker (off-main-thread parsing) | ✅ | — | — |
| IndexedDB cache (instant repeat visits) | ✅ | — | — |
| Token batching (smoother streaming) | ✅ | — | — |
| Lazy image loading | ✅ | — | — |

### 📄 Export Engine
| Format | Text | Code blocks | Tables | AI Images | All Messages |
|--------|------|------------|--------|-----------|--------------|
| PDF    | ✅   | ✅          | ✅     | ✅        | ✅           |
| Word   | ✅   | ✅          | ✅     | ✅        | ✅           |
| JSON   | ✅   | ✅          | ✅     | count     | ✅           |
| Markdown | ✅ | ✅          | ✅     | noted     | ✅           |

---

## Export Formats

### 📄 PDF
Opens a formatted print-ready page and auto-triggers the browser's print dialog. The exported PDF includes full styling, platform branding colour, embedded images, and proper code block formatting.

### 📝 Word (.doc)
Downloads a `.doc` file that opens in Microsoft Word, LibreOffice, and Google Docs. Embedded images are base64-encoded directly into the file — no external links, no broken images.

### 🗂️ JSON
Exports a structured JSON file with role, text, and image count for every message. Ideal for developers who want to process conversation data programmatically.

### ✍️ Markdown
Exports clean Markdown suitable for Notion, Obsidian, GitHub, or any knowledge base. Code blocks, tables, and formatting are preserved.

---

## Supported Platforms

| Platform | URL | Performance Fix | Export |
|----------|-----|----------------|--------|
| **ChatGPT** | chatgpt.com | ✅ Full (fetch interception + Worker + IndexedDB) | ✅ All formats |
| **Claude** | claude.ai | ✅ DOM-based | ✅ All formats |
| **Gemini** | gemini.google.com | ✅ DOM-based | ✅ All formats |

---

## Installation

### From Source (Developer Mode)

1. **Download** this repository — click `Code → Download ZIP` and unzip it
2. Open **Chrome** (or any Chromium browser — Edge, Brave, Arc)
3. Navigate to `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked**
6. Select the `turbochat-for-all-ai` folder
7. The TurboChat icon appears in your toolbar — you're ready

> **Note:** The extension will prompt for host permissions for ChatGPT, Claude, and Gemini when first activated. These are required for the content scripts to run.

### Chrome Web Store
*Coming soon.*

---

## How It Works

### Performance: ChatGPT (Fetch Interception)
ChatGPT loads entire conversation JSON from its backend API. For long chats this is a massive payload that blocks the main thread during parsing. TurboChat:

1. **Intercepts** the `fetch()` call to `/backend-api/conversation/:id`
2. **Processes** the JSON in a **Web Worker** (off the main thread — zero UI jank)
3. **Trims** the mapping to only the most recent N messages
4. **Caches** the result in **IndexedDB** (instant on repeat visits)
5. Returns the trimmed response to ChatGPT's renderer

The page renders only what you asked for. Older messages load on demand via the **Load More** button, one batch at a time.

### Performance: Claude & Gemini (DOM Hiding)
Claude and Gemini use opaque internal APIs that can't be safely intercepted. Instead, TurboChat uses **CSS-based DOM hiding**:

1. Waits for the conversation to render
2. Hides older message elements with `display: none`
3. Inserts a **Load More** button above the first visible message
4. On click, reveals the next batch by removing the hidden class
5. No page reload required — instant reveal

All hidden messages are still in the DOM. Exports always capture the full conversation including hidden messages.

### Export: Image Capture Pipeline
Capturing AI-generated images into exports is non-trivial because:
- Images may be cross-origin (hosted on Google's CDN, OpenAI's Azure CDN)
- Canvas `toDataURL()` throws a `SecurityError` for cross-origin images
- Word documents cannot load external URLs — need embedded base64

TurboChat's solution:
1. Try canvas capture (works for same-origin / CORS-flagged images)
2. Fall back to **XHR fetch as blob** — content scripts run in a privileged context that can fetch cross-origin URLs listed in `host_permissions`
3. Convert blob to base64 via `FileReader`
4. Embed directly into PDF/Word output

### Export: PDF Without Broken Buttons
ChatGPT, Claude, and Gemini all apply a strict **Content Security Policy** that blocks inline scripts. Blob URLs created from their pages inherit this CSP — meaning any `<script>` tag inside the blob HTML is silently killed. This is why every other export extension has broken "Save PDF" buttons.

TurboChat's fix: **no scripts inside the blob HTML at all**. Instead, `window.print()` is called from the content script directly on the `win` reference returned by `window.open()`. Since the content script already has access to that window object, CSP is completely bypassed — no scripts needed inside the page.

---

## Architecture

```
turbochat-for-all-ai/
├── manifest.json          # Extension config, permissions, content script routing
├── background.js          # Service worker: install, keyboard commands
│
├── export_core.js         # Shared export engine (all platforms)
│                          # Image capture, PDF/Word/JSON/Markdown builders
│
├── page_bootstrap.js      # ChatGPT: ISOLATED world, document_start
│                          # Writes config to localStorage, creates Worker blob URL
├── inject.js              # ChatGPT: MAIN world, document_start
│                          # Fetch proxy, L1 memory cache, Worker bridge, prefetch
├── worker.js              # ChatGPT: Web Worker
│                          # JSON parse + trim, IndexedDB read/write
├── content.js             # ChatGPT: ISOLATED world, document_idle
│                          # Load More button, scroll restore, export trigger
│
├── claude_inject.js       # Claude: MAIN world, document_start (minimal bridge)
├── claude_content.js      # Claude: ISOLATED world, document_idle
│                          # DOM hiding, Load More, export
│
├── gemini_inject.js       # Gemini: MAIN world, document_start (minimal bridge)
├── gemini_content.js      # Gemini: ISOLATED world, document_idle
│                          # DOM hiding, Load More, export
│
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic: platform tabs, stats, export buttons
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Configuration

All settings are accessible from the popup:

| Setting | Default | Description |
|---------|---------|-------------|
| Messages on open | 5 | How many messages to show when a chat loads |
| Load batch size | 10 | How many messages to reveal per Load More click |
| Enabled | On | Master on/off switch |
| Web Worker | On | Parse JSON off the main thread (ChatGPT only) |
| IndexedDB | On | Cache parsed responses for instant repeat visits (ChatGPT only) |
| Token Batching | On | Batch streaming mutations via RAF (ChatGPT only) |

Settings persist across sessions via `chrome.storage.local`.

---

## Privacy

- **No data collection.** Zero telemetry, no analytics, no tracking.
- **No external servers.** All processing happens locally in your browser.
- **No account required.** Install and use immediately.
- **Export files stay on your device.** PDF, Word, JSON, and Markdown files are created locally and downloaded directly — never uploaded anywhere.
- The extension reads conversation content only to render the Load More button and generate exports. Content is never transmitted off your device.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

### Development Setup
```bash
git clone https://github.com/your-username/turbochat-for-all-ai.git
cd turbochat-for-all-ai

# Load in Chrome
# chrome://extensions → Developer mode → Load unpacked → select this folder

# After any file change, click the refresh icon on chrome://extensions
```

### Reporting Bugs
Please include:
- Which platform (ChatGPT / Claude / Gemini)
- Which export format (if export-related)
- Chrome version
- What you expected vs what happened

---

## License

Copyright (c) 2026 TurboChat

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgements

- Built to solve a real problem: AI conversations getting slower the more useful they become
- Tested against ChatGPT, Claude.ai, and Gemini web interfaces
- Icons generated for TurboChat branding

---

<div align="center">
  <sub>Made with ⚡ by the TurboChat team</sub>
</div>
