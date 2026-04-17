/* TurboChat — export_core.js  |  document_idle  |  all platforms  v2.3
 *
 * v2.3 fixes:
 *  - extractImages: force eager loading before capture
 *  - extractImages: proper waitForImage() with timeout
 *  - fetchAsBase64: withCredentials=true for all CDNs (signed URLs need cookies)
 *  - blob: URL images captured directly via canvas (same-origin, always works)
 */
(function () {
  'use strict';

  /* ── UI image detection ────────────────────────────────────────────────── */
  function isUIImage(img) {
    const uiTags    = ['NAV','HEADER','ASIDE','BUTTON','FOOTER'];
    const uiClasses = /logo|avatar|icon|sprite|badge|thumb|decorat|star|gem|brand/i;
    let node = img.parentElement;
    while (node && node !== document.body) {
      if (uiTags.includes(node.tagName)) return true;
      if (node.getAttribute('role') === 'img') return true;
      if (node.getAttribute('aria-hidden') === 'true') return true;
      if (uiClasses.test((node.className || '') + ' ' + (node.id || ''))) return true;
      node = node.parentElement;
    }
    return false;
  }

  /* ── XHR fetch ─────────────────────────────────────────────────────────── */
  function fetchAsBase64(src) {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', src, true);
        xhr.responseType = 'blob';
        xhr.timeout = 12000;
        // Always send credentials — signed CDN URLs (OpenAI Azure, Google CDN)
        // validate against the user's active session cookies.
        xhr.withCredentials = true;
        xhr.onload = () => {
          if (xhr.status !== 200) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = xhr.ontimeout = () => resolve(null);
        xhr.send();
      } catch { resolve(null); }
    });
  }

  /* Wait for an image to fully load with a timeout safety net */
  function waitForImage(img, ms = 6000) {
    return new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      const t = setTimeout(resolve, ms);
      const done = () => { clearTimeout(t); resolve(); };
      img.addEventListener('load',  done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  /* ── Image capture ─────────────────────────────────────────────────────── */
  async function extractImages(container) {
    const results = [];

    for (const img of container.querySelectorAll('img')) {
      if (!img.src || img.src === window.location.href) continue;

      // ── Force eager loading ───────────────────────────────────────────────
      // lazy loading was (wrongly) applied to all images by older versions.
      // Setting loading=lazy retroactively on an img already in the DOM tells
      // the browser to defer/cancel the fetch if off-screen — images never load.
      if (img.loading === 'lazy') {
        img.loading = 'eager';
        img.removeAttribute('loading');
      }

      // ── Size filter ───────────────────────────────────────────────────────
      // Use getBoundingClientRect as fallback for off-screen images.
      // If ALL sources report 0 the image may not have loaded yet — don't skip it.
      const w = img.naturalWidth  || img.width  || Math.round(img.getBoundingClientRect().width);
      const h = img.naturalHeight || img.height || Math.round(img.getBoundingClientRect().height);
      if (w > 0 && w < 48) continue;
      if (h > 0 && h < 48) continue;

      if (isUIImage(img)) continue;
      if (img.src.startsWith('data:')) { results.push(img.src); continue; }

      // ── Wait for image to actually load ───────────────────────────────────
      await waitForImage(img, 6000);

      let dataUrl = null;

      // blob: URLs are same-origin — canvas always works
      if (img.src.startsWith('blob:')) {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 512; c.height = img.naturalHeight || 512;
          c.getContext('2d').drawImage(img, 0, 0);
          const d = c.toDataURL('image/png');
          if (d && d !== 'data:,') { results.push(d); continue; }
        } catch {}
      }

      // Canvas for same-origin / CORS-flagged images
      if (!dataUrl && img.naturalWidth > 0) {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          const d = c.toDataURL('image/png');
          if (d && d !== 'data:,') dataUrl = d;
        } catch { /* cross-origin taint — fall through to XHR */ }
      }

      // XHR fallback: content script has cookie access for signed CDN URLs
      if (!dataUrl) dataUrl = await fetchAsBase64(img.src);

      if (dataUrl) results.push(dataUrl);
    }
    return results;
  }

  /* ── Clean text / HTML ─────────────────────────────────────────────────── */
  const UI_STRIP = [
    'button','form','nav','aside','.sr-only','[aria-hidden="true"]',
    '[class*="action-bar"],[class*="copy-btn"],[class*="feedback"]',
    '[class*="thumb"],[class*="footnote"],[class*="scroll-button"]',
    '[class*="toolbar"],[class*="citation"],[data-testid="composer-footer"]',
    'model-thoughts','[class*="trailing"],[class*="footer-actions"]',
    '[class*="response-actions"],[class*="gemini-logo"],[class*="model-icon"]',
    'toolbelt','.vote-thumbs','message-actions','response-header',
  ].join(',');

  function cleanText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll(UI_STRIP).forEach(n => n.remove());
    c.querySelectorAll('img').forEach(img => { if ((img.width||0) < 48) img.remove(); });
    return c.innerText?.trim() || c.textContent?.trim() || '';
  }

  function cleanInnerHtml(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll(UI_STRIP).forEach(n => n.remove());
    c.querySelectorAll('img').forEach(img => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w < 48 || h < 48) { img.remove(); return; }
      img.style.maxWidth = '100%'; img.style.borderRadius = '6px';
      img.style.margin = '10px 0'; img.style.display = 'block';
    });
    return c.innerHTML.trim();
  }

  /* ── Shared CSS ────────────────────────────────────────────────────────── */
  function sharedCss(accent) {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Inter',-apple-system,sans-serif;font-size:14px;line-height:1.75;
           color:#1a1a1a;background:#fff;max-width:820px;margin:0 auto;padding:40px 32px;}
      .print-bar{
        position:fixed;top:0;left:0;right:0;background:#fff;
        border-bottom:1px solid #e5e7eb;padding:10px 24px;
        display:flex;align-items:center;justify-content:space-between;
        z-index:9999;box-shadow:0 1px 6px rgba(0,0,0,.07);
      }
      .print-bar-title{font-size:13px;font-weight:600;color:#111;
                       white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;}
      .print-hint{font-size:12px;color:#555;background:#f3f4f6;
                  border:1px solid #e5e7eb;border-radius:6px;padding:5px 12px;white-space:nowrap;}
      .export-header{border-bottom:3px solid ${accent};padding-bottom:16px;margin-bottom:32px;}
      .export-title{font-size:22px;font-weight:600;color:#111;}
      .export-meta{font-size:12px;color:#888;margin-top:4px;}
      .msg{margin-bottom:28px;}
      .role{font-size:11px;font-weight:600;text-transform:uppercase;
            letter-spacing:.07em;margin-bottom:8px;}
      .msg-user .role{color:${accent};}
      .msg-ai .role{color:#666;}
      .body{padding:14px 18px;border-radius:8px;}
      .msg-user .body{background:#fff;border:1px solid #eee;border-left:3px solid ${accent};}
      .msg-ai .body{background:#f8f9fa;border-left:3px solid #e0e0e0;}
      .body img{max-width:100%;border-radius:6px;margin:10px 0;display:block;}
      .body pre{background:#1e1e1e;color:#d4d4d4;padding:14px 16px;border-radius:6px;
                font-size:13px;margin:10px 0;white-space:pre-wrap;overflow-x:auto;}
      .body code{background:#efefef;padding:1px 5px;border-radius:3px;font-size:13px;}
      .body pre code{background:none;padding:0;}
      .body table{border-collapse:collapse;width:100%;margin:10px 0;}
      .body th,.body td{border:1px solid #ddd;padding:8px 12px;font-size:13px;}
      .body th{background:#f0f0f0;font-weight:600;}
      .body h1,.body h2,.body h3{margin:14px 0 6px;font-weight:600;}
      .body p{margin:8px 0;}
      .body ul,.body ol{margin:8px 0 8px 20px;}
      .body a{color:${accent};}
      .export-footer{margin-top:48px;padding-top:16px;border-top:1px solid #eee;
                     font-size:11px;color:#aaa;text-align:center;}
      @media print{
        .print-bar{display:none!important;}
        body{padding:20px;margin-top:0!important;}
        .msg{page-break-inside:avoid;}
        pre{white-space:pre-wrap;}
      }
    `;
  }

  /* ── PDF HTML — zero scripts, zero inline handlers ─────────────────────── */
  function buildHtmlPage(msgs, { title, accent, aiLabel }) {
    const rows = msgs.map(m => {
      const cls  = m.role === 'user' ? 'msg-user' : 'msg-ai';
      const role = m.role === 'user' ? 'You' : aiLabel;
      const imgHtml = (m.images || []).map(src =>
        `<img src="${src}" alt="image">`
      ).join('');
      return `<div class="msg ${cls}">
  <div class="role">${role}</div>
  <div class="body">${m.html || escHtml(m.text)}${imgHtml}</div>
</div>`;
    }).join('\n');

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<style>${sharedCss(accent)}</style>
</head><body>
<div class="print-bar">
  <div class="print-bar-title">${escHtml(title)}</div>
  <div class="print-hint">🖨 Saving as PDF&hellip; &nbsp;|&nbsp; press <strong>Ctrl+P</strong> / <strong>⌘P</strong> to re-open</div>
</div>
<div style="margin-top:56px;">
<div class="export-header">
  <div class="export-title">${escHtml(title)}</div>
  <div class="export-meta">Exported from ${aiLabel} &middot; ${new Date().toLocaleDateString()} &middot; TurboChat</div>
</div>
${rows}
<div class="export-footer">Exported with TurboChat for All AI &middot; ${new Date().toLocaleString()}</div>
</div>
</body></html>`;
  }

  /* ── Word (.doc) ───────────────────────────────────────────────────────── */
  function buildWordDoc(msgs, { title, accent, aiLabel }) {
    const rows = msgs.map(m => {
      const isUser = m.role === 'user';
      const role   = isUser ? 'You' : aiLabel;
      const imgHtml = (m.images || [])
        .filter(src => src.startsWith('data:'))
        .map(src => `<p><img src="${src}" width="500" style="max-width:500pt;display:block;margin:6pt 0;"></p>`)
        .join('');
      const bodyContent = m.html
        ? m.html
            .replace(/<pre([^>]*)>/g, '<pre style="background:#1e1e1e;color:#d4d4d4;padding:8pt;font-family:Courier New;font-size:10pt;white-space:pre-wrap;">')
            .replace(/<code>/g, '<code style="background:#efefef;padding:1pt 4pt;font-family:Courier New;">')
        : `<p>${escHtml(m.text)}</p>`;
      return `
<p style="font-size:9pt;font-weight:bold;text-transform:uppercase;letter-spacing:1pt;
          color:${isUser ? accent : '#666'};margin-bottom:4pt;">${role}</p>
<div style="border-left:3pt solid ${isUser ? accent : '#ddd'};padding:8pt 12pt;
            margin-bottom:16pt;background:${isUser ? '#fff' : '#f8f9fa'};">
  ${bodyContent}
  ${imgHtml}
</div>`;
    }).join('');

    return `<html xmlns:o='urn:schemas-microsoft-com:office:office'
               xmlns:w='urn:schemas-microsoft-com:office:word'
               xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='UTF-8'>
<meta name='ProgId' content='Word.Document'>
<title>${escHtml(title)}</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1a1a1a;margin:2cm;}
  p{margin:6pt 0;} img{max-width:500pt;height:auto;}
  pre{font-family:Courier New;font-size:9pt;white-space:pre-wrap;padding:8pt;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #ddd;padding:6pt 10pt;}
  th{background:#f0f0f0;font-weight:bold;}
  h1{font-size:16pt;}h2{font-size:14pt;}h3{font-size:12pt;}ul,ol{margin-left:20pt;}
</style>
</head>
<body>
<h1 style="color:${accent};border-bottom:2px solid ${accent};padding-bottom:8pt;">${escHtml(title)}</h1>
<p style="font-size:9pt;color:#888;margin-bottom:24pt;">
  Exported from ${aiLabel} &middot; ${new Date().toLocaleDateString()} &middot; TurboChat for All AI
</p>
${rows}
<p style="margin-top:32pt;padding-top:12pt;border-top:1px solid #eee;
          font-size:9pt;color:#aaa;text-align:center;">
  Exported with TurboChat for All AI &middot; ${new Date().toLocaleString()}
</p>
</body></html>`;
  }

  /* ── JSON ──────────────────────────────────────────────────────────────── */
  function buildJson(msgs, { title, platform, aiLabel }) {
    return JSON.stringify({
      title, platform,
      exported_at: new Date().toISOString(),
      exported_by: 'TurboChat for All AI v2.3',
      message_count: msgs.length,
      messages: msgs.map(m => ({
        role: m.role,
        text: m.text,
        image_count: (m.images || []).length,
      })),
    }, null, 2);
  }

  /* ── Markdown ──────────────────────────────────────────────────────────── */
  function buildMarkdown(msgs, { title, aiLabel }) {
    const header = `# ${title}\n*Exported from ${aiLabel} · ${new Date().toLocaleDateString()} · TurboChat*\n\n---\n\n`;
    const body   = msgs.map(m => {
      const role = m.role === 'user' ? '**You**' : `**${aiLabel}**`;
      const imgs = (m.images||[]).length > 0
        ? `\n\n*[${m.images.length} image(s) — available in PDF/Word export]*` : '';
      return `${role}\n\n${m.text}${imgs}`;
    }).join('\n\n---\n\n');
    return header + body + '\n\n---\n\n*Exported with TurboChat for All AI*\n';
  }

  /* ── Download helpers ──────────────────────────────────────────────────── */
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function openPrintPage(html) {
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) {
      alert('TurboChat: Allow popups for this site, then export again.\nChrome: click the popup-blocked icon in the address bar → "Always allow".');
      URL.revokeObjectURL(url);
      return;
    }
    // Drive print() from content script — no scripts inside blob HTML (CSP-safe)
    win.addEventListener('load', () => {
      setTimeout(() => { try { win.print(); } catch {} }, 600);
    });
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }

  /* ── Utilities ─────────────────────────────────────────────────────────── */
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function safeFilename(title, ext) {
    const base = title.replace(/[^a-z0-9\s\-_]/gi,'').trim()
                      .replace(/\s+/g,'_').slice(0,60) || 'conversation';
    return `${base}_${new Date().toISOString().slice(0,10)}.${ext}`;
  }

  /* ── Main dispatch ─────────────────────────────────────────────────────── */
  async function dispatch(format, msgs, opts) {
    const { title } = opts;
    switch (format) {
      case 'pdf':      openPrintPage(buildHtmlPage(msgs, opts)); break;
      case 'word':     downloadBlob(buildWordDoc(msgs, opts),    safeFilename(title,'doc'),  'application/msword'); break;
      case 'json':     downloadBlob(buildJson(msgs, opts),       safeFilename(title,'json'), 'application/json');   break;
      case 'markdown': downloadBlob(buildMarkdown(msgs, opts),   safeFilename(title,'md'),   'text/markdown');      break;
    }
  }

  window.__tcExportCore = { extractImages, cleanText, cleanInnerHtml, dispatch, escHtml };

})();
