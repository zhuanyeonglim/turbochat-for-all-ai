# Privacy Policy — TurboChat for All AI

**Last updated: April 2026**

---

## Overview

TurboChat for All AI ("TurboChat", "the extension", "we") is a free, open-source Chrome browser extension. This privacy policy explains what data the extension accesses, how it is used, and what is never collected.

**Short version: TurboChat collects no user data. Everything stays on your device.**

---

## What TurboChat Does NOT Collect

TurboChat does not collect, transmit, store on external servers, or share any of the following:

- Your AI conversation content (ChatGPT, Claude, Gemini messages)
- Your name, email address, or any personally identifiable information
- Your browsing history or web activity
- Your location
- Your saved prompts or prompt library content
- Any usage analytics or telemetry
- Any crash reports or error logs

---

## What TurboChat Stores Locally

TurboChat stores the following data **on your device only**, using Chrome's built-in `chrome.storage` API. This data never leaves your browser.

| Data | Where stored | Purpose |
|------|-------------|---------|
| Extension settings (message limit, batch size, on/off toggle) | `chrome.storage.local` | Remember your preferences across sessions |
| Saved prompts (name, description, body text, folder) | `chrome.storage.local` | Prompt Library feature |
| Folder names and structure | `chrome.storage.local` | Prompt Library organisation |
| Per-chat visible message count | `chrome.storage.local` | Remember scroll position per conversation |
| Warning banner dismissed state | `chrome.storage.local` | Avoid showing the export reminder repeatedly |

All of this data is stored exclusively in your browser on your device. It is never uploaded, synced to our servers, or accessible by anyone other than you.

---

## Permissions Explained

TurboChat requests the following Chrome permissions. Each is used solely for the extension's core functionality.

**storage** — saves your settings and prompt library locally on your device.

**tabs** — identifies which AI chat tab is active when you trigger an export or insert a prompt from the side panel.

**scripting** — injects the Load More button and export engine into ChatGPT, Claude, and Gemini pages. Also inserts prompts into the chat input field.

**activeTab** — accesses the currently active tab when you interact with the extension popup.

**downloads** — saves exported conversation files (PDF, Word, JSON, Markdown) to your device.

**sidePanel** — opens the Prompt Library as a Chrome side panel alongside your AI chat.

**Host permissions** (chatgpt.com, claude.ai, gemini.google.com) — required to run content scripts on these pages for the Load More and export features.

**CDN host permissions** (googleusercontent.com, anthropic.com, openai.com, amazonaws.com) — required to fetch AI-generated images from these content delivery networks so they can be embedded into PDF and Word exports. Images are processed locally and never stored or transmitted.

---

## Exports

When you export a conversation, the export file (PDF, Word, JSON, or Markdown) is generated entirely in your browser and downloaded directly to your device. Export files are never uploaded to any server.

---

## Prompt Library

Prompts you save are stored in `chrome.storage.local` on your device. They are not synced to any external server, not accessible to the extension developer, and not shared with any third party. If you uninstall the extension, your saved prompts are deleted along with all other local storage. Use the Export feature to back up your prompts before uninstalling.

---

## Ko-fi (Voluntary Support)

TurboChat includes a link to the developer's Ko-fi page (ko-fi.com/codylim) for voluntary support. Clicking this link opens Ko-fi in a new browser tab. Any payment made through Ko-fi is handled entirely by Ko-fi and PayPal under their own privacy policies. TurboChat does not receive or store any payment information.

---

## Third-Party Services

TurboChat does not integrate with any third-party analytics, advertising, or tracking services.

The extension does not use Google Analytics, Facebook Pixel, Mixpanel, Sentry, or any similar service.

---

## Open Source

TurboChat is fully open source. You can inspect every line of code at:

**https://github.com/zhuanyeonglim/turbochat-for-all-ai**

There are no hidden functions, obfuscated scripts, or undisclosed data collection of any kind.

---

## Children's Privacy

TurboChat does not knowingly collect any information from children under 13. The extension does not collect any personal information from any user regardless of age.

---

## Changes to This Policy

If this privacy policy changes, the updated version will be published at this URL with a new "Last updated" date. Since TurboChat collects no user data, changes are expected to be minimal.

---

## Contact

If you have questions about this privacy policy, please open an issue on GitHub:

**https://github.com/zhuanyeonglim/turbochat-for-all-ai/issues**

Or contact the developer directly through Ko-fi:

**https://ko-fi.com/codylim**

---

*TurboChat for All AI is developed and maintained by Zhuanyeong Lim, Malaysia.*
