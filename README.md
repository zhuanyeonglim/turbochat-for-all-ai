<div align="center">

<img src="src/icons/icon128.png" width="80" alt="TurboChat Logo">

# TurboChat for All AI

**The only browser extension that fixes lag AND exports full conversations — for ChatGPT, Claude, and Gemini.**

[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](https://github.com/zhuanyeonglim/turbochat-for-all-ai/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-orange.svg)](src/manifest.json)
[![Platforms](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini-purple.svg)](#supported-platforms)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#features) · [Installation](#installation) · [Export Formats](#export-formats) · [How It Works](#how-it-works) · [Contributing](#contributing) · [License](#license)

</div>

---

## Overview

Long AI conversations get slow. Really slow. ChatGPT lags with 50+ messages. Claude freezes. Gemini struggles. **TurboChat** solves this by showing only the most recent messages on load and letting you page through older ones — keeping the page fast while keeping all your history intact.

But that's only half of it. We also built **the most complete AI conversation export tool available**:

- Export to **PDF, Word (.doc), JSON, and Markdown**
- Captures **AI-generated images** and embeds them directly in exports
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
| Per-chat memory (remembers position) | ✅ | ✅ | ✅ |
| Web Worker (off-main-thread parsing) | ✅ | — | — |
| IndexedDB cache (instant repeat visits) | ✅ | — | — |
| Token batching (smoother streaming) | ✅ | — | — |

### 📄 Export Engine

| Format | Text | Code | Tables | AI Images | All Messages |
|--------|------|------|--------|-----------|--------------|
| PDF | ✅ | ✅ | ✅ | ✅ | ✅ |
| Word | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ | count | ✅ |
| Markdown | ✅ | ✅ | ✅ | noted | ✅ |

---

## Installation

### From Source (Developer Mode)

1. Click **Code → Download ZIP** on this page and unzip it
2. Open **Chrome** (or Edge, Brave, Arc)
3. Go to `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked**
6. Select the **`src`** folder inside the unzipped directory
7. The TurboChat icon appears in your toolbar — you're ready

> **Tip:** After any update, just click the refresh icon on the extension card at `chrome://extensions`.

### Chrome Web Store

*Coming soon.*

---

## Export Formats

### 📄 PDF
Opens a formatted print-ready page and auto-triggers the browser's print dialog. Includes full styling, platform accent colours, embedded images, and proper code block formatting. Print dialog opens automatically — no broken buttons.

### 📝 Word (.doc)
Downloads a `.doc` file compatible with Microsoft Word, LibreOffice, and Google Docs. AI-generated images are base64-encoded directly into the file — no external links, no broken images.

### 🗂️ JSON
Structured JSON with role, text, and image count per message. Ideal for developers processing conversation data programmatically.

### ✍️ Markdown
Clean Markdown for Notion, Obsidian, GitHub, or any knowledge base. Code blocks, tables, and formatting preserved.

---

## Supported Platforms

| Platform | URL | Performance Fix | Export |
|----------|-----|----------------|--------|
| **ChatGPT** | chatgpt.com | ✅ Full (fetch interception + Worker + IndexedDB) | ✅ All formats |
| **Claude** | claude.ai | ✅ DOM-based | ✅ All formats |
| **Gemini** | gemini.google.com | ✅ DOM-based | ✅ All formats |

---

## How It Works

### Performance: ChatGPT (Fetch Interception)

ChatGPT loads entire conversation JSON from its backend. For long chats this is a massive payload that blocks the main thread during parsing. TurboChat:

1. **Intercepts** the `fetch()` call to `/backend-api/conversation/:id`
2. **Processes** the JSON in a **Web Worker** (off the main thread — zero UI jank)
3. **Trims** the mapping to only the most recent N messages
4. **Caches** the result in **IndexedDB** (instant on repeat visits)
5. Returns the trimmed response to ChatGPT's renderer

### Performance: Claude & Gemini (DOM Hiding)

Claude and Gemini use internal APIs that can't be safely intercepted. TurboChat uses **CSS-based DOM hiding** instead:

1. Waits for the conversation to render fully
2. Hides older message elements with `display: none`
3. Inserts a **Load More** button above the first visible message
4. On click, reveals the next batch instantly — no page reload

All hidden messages stay in the DOM. Exports always capture the full conversation including hidden messages.

### Export: Image Capture Pipeline

AI-generated images are cross-origin (Google CDN, OpenAI Azure CDN). Canvas `toDataURL()` throws a `SecurityError` for cross-origin images, and Word documents can't load external URLs. TurboChat's solution:

1. Try canvas capture (works for same-origin / CORS-flagged images)
2. Fall back to **XHR fetch as blob** — content scripts can fetch cross-origin URLs in `host_permissions` with user session cookies intact
3. Convert blob → base64 via `FileReader`
4. Embed directly into PDF/Word output

### Export: Why the PDF Buttons Work

Every other export tool has broken "Save PDF" buttons. Here's why: ChatGPT, Claude, and Gemini all have a strict **Content Security Policy** that blocks inline scripts. Blob URLs created from their pages inherit this CSP — any `<script>` tag inside the blob HTML is silently killed.

TurboChat's fix: **zero scripts inside the blob HTML**. `window.print()` is called from the content script on the `win` reference returned by `window.open()`. The content script already has access to that window — CSP not involved at all.

---

## Project Structure

```
turbochat-for-all-ai/
│
├── src/                        ← Chrome extension (load this folder)
│   ├── manifest.json           # Permissions, content script routing
│   ├── background.js           # Service worker: install, keyboard shortcuts
│   ├── export_core.js          # Shared export engine (all platforms)
│   │
│   ├── page_bootstrap.js       # ChatGPT: writes config, creates Worker blob URL
│   ├── inject.js               # ChatGPT: fetch proxy, L1 cache, Worker bridge
│   ├── worker.js               # ChatGPT: Web Worker — JSON parse, IndexedDB
│   ├── content.js              # ChatGPT: Load More button, export trigger
│   │
│   ├── claude_inject.js        # Claude: MAIN world bridge
│   ├── claude_content.js       # Claude: DOM hiding, Load More, export
│   │
│   ├── gemini_inject.js        # Gemini: MAIN world bridge
│   ├── gemini_content.js       # Gemini: DOM hiding, Load More, export
│   │
│   ├── popup.html              # Extension popup UI
│   ├── popup.js                # Popup: platform tabs, stats, export buttons
│   └── icons/                  # Extension icons (16, 48, 128px)
│
├── .github/
│   └── ISSUE_TEMPLATE/         # Bug report & feature request templates
│
├── .gitignore
├── CHANGELOG.md                # Full version history
├── LICENSE                     # MIT License
├── README.md
└── SECURITY.md                 # Vulnerability reporting policy
```

---

## Configuration

All settings accessible from the popup:

| Setting | Default | Description |
|---------|---------|-------------|
| Messages on open | 5 | Messages shown when a chat loads |
| Load batch size | 10 | Messages revealed per Load More click |
| Enabled | On | Master on/off switch |
| Web Worker | On | Off-main-thread JSON parsing (ChatGPT only) |
| IndexedDB | On | Persistent cache for instant repeat visits (ChatGPT only) |
| Token Batching | On | RAF-batched streaming mutations (ChatGPT only) |

Settings persist via `chrome.storage.local`.

---

## Privacy

- **No data collection.** Zero telemetry, zero analytics, zero tracking.
- **No external servers.** All processing is local, in your browser.
- **No account required.** Install and use immediately.
- **Exports stay on your device.** Files are created locally and downloaded directly — never uploaded anywhere.
- Conversation content is read only to render the Load More button and generate exports. It is never transmitted off your device.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

### Development Setup

```bash
git clone https://github.com/zhuanyeonglim/turbochat-for-all-ai.git
cd turbochat-for-all-ai

# Load the extension in Chrome:
# chrome://extensions → Developer mode → Load unpacked → select the src/ folder

# After any code change, click the refresh icon on the extension card
```

### Reporting Bugs

Please include:
- Which platform (ChatGPT / Claude / Gemini)
- Which export format (if export-related)
- Chrome version (`chrome://version`)
- What you expected vs what happened

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## License

Copyright (c) 2026 TurboChat — Zhuanyeong Lim

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ⚡ to make AI conversations fast again</sub>
</div>
