<div align="center">

<img src="src/icons/icon128.png" width="80" alt="TurboChat Logo">

# TurboChat for All AI

**The only browser extension that fixes lag AND exports full conversations — for ChatGPT, Claude, and Gemini.**

[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](https://github.com/zhuanyeonglim/turbochat-for-all-ai/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-orange.svg)](src/manifest.json)
[![Platforms](https://img.shields.io/badge/platforms-ChatGPT%20%7C%20Claude%20%7C%20Gemini-purple.svg)](#supported-platforms)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/codylim)

[Features](#features) · [Installation](#installation) · [Prompt Library](#prompt-library) · [Export Formats](#export-formats) · [How It Works](#how-it-works) · [Contributing](#contributing)

</div>

---

## Why TurboChat?

Long AI conversations get slow. Really slow. ChatGPT lags with 50+ messages. Claude freezes. Gemini struggles. **TurboChat** solves this by showing only the most recent messages on load and letting you page through older ones — keeping the page fast while keeping all your history intact.

But that's only half of it:

- Export to **PDF, Word, JSON, and Markdown** — with AI-generated images embedded
- **Prompt Library** — save your favourite prompts and insert them into any AI chat with one click
- Works across **ChatGPT, Claude, and Gemini** — not just one platform
- **100% free and open source** — no subscription, no paywall, ever

---

## Features

### ⚡ Performance Fix

| Feature | ChatGPT | Claude | Gemini |
|---------|---------|--------|--------|
| Message limiting (show N on load) | ✅ | ✅ | ✅ |
| Load More button (batch reveal) | ✅ | ✅ | ✅ |
| Keyboard shortcut (Alt+Shift+L) | ✅ | ✅ | ✅ |
| Per-chat memory (remembers position) | ✅ | ✅ | ✅ |
| Web Worker (off-main-thread parsing) | ✅ | — | — |
| IndexedDB cache (instant repeat visits) | ✅ | — | — |

### 📄 Export Engine

| Format | Text | Code | Tables | AI Images | All Messages |
|--------|------|------|--------|-----------|--------------|
| PDF | ✅ | ✅ | ✅ | ✅ | ✅ |
| Word | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ | — | ✅ |
| Markdown | ✅ | ✅ | ✅ | — | ✅ |

### 📝 Prompt Library

- Save unlimited prompts with name, description, and folder
- Organise into custom folders (Marketing, Coding, Writing...)
- Insert into any AI chat with one click — no copy-pasting
- Variable support: use `{{topic}}`, `{{tone}}`, `{{language}}` in prompts — fill them in before inserting
- Import and export your entire prompt library as JSON
- Works as a Chrome side panel — visible side-by-side with your AI chat

---

## Installation

### From Chrome Web Store
*Coming soon*

### From Source (Developer Mode)

1. Click **Code → Download ZIP** on this page and unzip it
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the **`src`** folder inside the unzipped directory
6. The TurboChat icon appears in your toolbar

> After any update, click the refresh icon on the extension card at `chrome://extensions`.

---

## Export Formats

**PDF** — opens a formatted print-ready page and auto-triggers the browser's print dialog. Includes full styling, embedded AI images, and proper code block formatting.

**Word (.doc)** — downloads a `.doc` file compatible with Microsoft Word, LibreOffice, and Google Docs. AI images are base64-encoded directly into the file — no broken links.

**JSON** — structured export with role, text, and content per message. For developers who want to process conversation data programmatically.

**Markdown** — clean Markdown for Notion, Obsidian, GitHub, or any knowledge base. Code blocks, tables, and formatting preserved.

---

## Prompt Library

Open the Prompt Library by clicking **📝 Prompt Library** in the TurboChat popup, or press **Alt+Shift+P** on any AI chat page.

The library opens as a side panel so you can see your prompts and the AI chat at the same time.

**Creating a prompt** — click **+ New Prompt**, fill in the name and prompt text, optionally add a description and folder. Use `{{variable}}` syntax for dynamic parts — TurboChat detects them automatically and lets you fill them in before inserting.

**Inserting a prompt** — click **Insert ↗** on any prompt card to insert directly into the active chat input. If the prompt has variables, you'll see a fill-in form with a live preview first.

**Folders** — create folders to organise by topic or project. Hover any folder to rename or delete it.

**Import / Export** — export your entire library as a JSON file for backup or sharing. Import merges without duplicating.

---

## Supported Platforms

| Platform | URL | Performance Fix | Export | Prompt Insert |
|----------|-----|----------------|--------|---------------|
| **ChatGPT** | chatgpt.com | ✅ Full | ✅ | ✅ |
| **Claude** | claude.ai | ✅ DOM-based | ✅ | ✅ |
| **Gemini** | gemini.google.com | ✅ DOM-based | ✅ | ✅ |

---

## How It Works

### Performance: ChatGPT

ChatGPT loads entire conversation JSON from its backend. For long chats this is a massive payload that blocks the main thread. TurboChat intercepts the `fetch()` call, processes the JSON in a **Web Worker** off the main thread, trims it to the most recent N messages, and caches the result in **IndexedDB** for instant repeat visits.

### Performance: Claude & Gemini

Claude and Gemini use internal APIs that can't be safely intercepted. TurboChat uses CSS-based DOM hiding instead — hides older messages, inserts a Load More button, and reveals batches on demand. All hidden messages stay in the DOM so exports always capture the full conversation.

### Export: Image Capture

AI-generated images are cross-origin (Google CDN, OpenAI Azure CDN). TurboChat first tries canvas capture, then falls back to XHR blob fetch with credentials — content scripts can fetch cross-origin URLs listed in `host_permissions` with the user's session cookies intact. Images are base64-encoded and embedded directly into PDF and Word output.

### Export: Why the PDF Buttons Work

Every other export extension has broken "Save PDF" buttons because the host site's Content Security Policy blocks inline scripts in blob URLs. TurboChat's fix: zero scripts inside the blob HTML. `window.print()` is called from the content script on the `win` reference returned by `window.open()` — CSP not involved at all.

---

## Project Structure

```
turbochat-for-all-ai/
│
├── src/                        ← Load this folder in Chrome
│   ├── manifest.json
│   ├── background.js           # Service worker: keyboard shortcuts, side panel
│   ├── export_core.js          # Shared export engine (all platforms)
│   │
│   ├── content.js              # ChatGPT: Load More, export trigger
│   ├── inject.js               # ChatGPT: fetch proxy, Web Worker bridge
│   ├── page_bootstrap.js       # ChatGPT: config, Worker blob URL
│   ├── worker.js               # ChatGPT: Web Worker — JSON parse, IndexedDB
│   │
│   ├── claude_content.js       # Claude: DOM hiding, Load More, export
│   ├── claude_inject.js        # Claude: MAIN world bridge
│   │
│   ├── gemini_content.js       # Gemini: DOM hiding, Load More, export
│   ├── gemini_inject.js        # Gemini: MAIN world bridge
│   │
│   ├── popup.html              # Extension popup UI
│   ├── popup.js                # Popup logic
│   │
│   ├── prompts.html            # Prompt Library side panel
│   ├── prompts.js              # Prompt Library logic
│   │
│   ├── success_bridge.js       # Runs on payment success page
│   └── icons/
│
├── CHANGELOG.md
├── LICENSE
├── README.md
└── SECURITY.md
```

---

## Privacy

- **No data collection.** Zero telemetry, zero analytics, zero tracking.
- **No external servers.** All processing is local, in your browser.
- **No account required.** Install and use immediately.
- **Exports stay on your device.** Files are created locally and downloaded directly.
- Conversation content is read only to render Load More and generate exports. Never transmitted off your device.
- Prompts are saved locally in your browser's storage (`chrome.storage.local`). Never sent anywhere.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

```bash
git clone https://github.com/zhuanyeonglim/turbochat-for-all-ai.git
cd turbochat-for-all-ai

# Load in Chrome:
# chrome://extensions → Developer mode → Load unpacked → select src/

# After any code change, click refresh on the extension card
```

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when reporting issues. Include platform, Chrome version, and what you expected vs what happened.

---

## Support

TurboChat is completely free. If it's saved you time, you can support development on Ko-fi — it helps me keep building.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/codylim)

---

## License

Copyright (c) 2026 Zhuanyeong Lim

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ⚡ to make AI conversations fast again · <a href="https://ko-fi.com/codylim">Support on Ko-fi</a></sub>
</div>
