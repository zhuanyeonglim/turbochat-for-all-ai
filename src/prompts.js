'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const FREE_PROMPT_LIMIT = 10;

// ── Storage ───────────────────────────────────────────────────────────────────
const S = {
  get: (k, d) => new Promise(r => chrome.storage.local.get({[k]:d}, v => r(v[k]))),
  set: (k, v) => new Promise(r => chrome.storage.local.set({[k]:v}, r)),
  sync: (k, d) => new Promise(r => chrome.storage.sync.get({[k]:d}, v => r(v[k]))),
};

// ── State ─────────────────────────────────────────────────────────────────────
let folders     = [];
let prompts     = [];
let isPro       = false;
let activeFolder = null;
let activeId    = null;
let mode        = null;
let q           = '';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  [folders, prompts, isPro] = await Promise.all([
    S.get('tc_folders', []),
    S.get('tc_prompts', []),
    S.sync('tc_pro', false),
  ]);
  renderAll();
  updateProUI();
  initWarningBanner();
}
boot();

// ── Storage warning banner ────────────────────────────────────────────────────
async function initWarningBanner() {
  const banner = document.getElementById('storage-warning');
  if (!banner) return;
  const dismissed = await S.get('tc_warning_dismissed', false);
  // Always show unless explicitly dismissed — even with 0 prompts
  if (dismissed) {
    banner.style.display = 'none';
    return;
  }
  // Show the banner
  banner.style.display = 'flex';

  document.getElementById('btn-dismiss-warning')?.addEventListener('click', async () => {
    banner.style.display = 'none';
    await S.set('tc_warning_dismissed', true);
  });
}

function renderAll() { renderSidebar(); renderList(); }

// ── Pro UI gating ─────────────────────────────────────────────────────────────
function updateProUI() {
  const importBtn = document.getElementById('btn-import');
  const exportBtn = document.getElementById('btn-export');
  const proBar    = document.getElementById('pro-limit-bar');

  if (isPro) {
    if (importBtn) importBtn.disabled = false;
    if (exportBtn) exportBtn.disabled = false;
    if (proBar) proBar.style.display = 'none'; // hidden for all — Ko-fi model
  } else {
    // Ko-fi model — no limits
    if (proBar) proBar.style.display = 'none';
    if (false && proBar) {
      proBar.style.display = '';
      proBar.querySelector('#prompt-count-label').textContent =
        `${prompts.length} / ${FREE_PROMPT_LIMIT} prompts`;
      proBar.querySelector('#prompt-count-bar').style.width =
        Math.min(100, (prompts.length / FREE_PROMPT_LIMIT) * 100) + '%';
    }
    // Lock import/export with lock icon
      }
}

function canAddPrompt() { return true; }

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, ok) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (ok ? ' ok' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  // Library section
  document.getElementById('folder-items').innerHTML = [
    { id: null,        icon: '📋', label: 'All Prompts', count: prompts.length },
    { id: '__recent',  icon: '🕐', label: 'Recent',      count: Math.min(prompts.length, 10) },
    { id: '__none',    icon: '📄', label: 'Unfiled',     count: prompts.filter(p => !p.folderId).length },
  ].map(f => folderItemHtml(f)).join('');

  // User folders with edit/delete actions
  const foldersHtml = folders.map(f => {
    const count = prompts.filter(p => p.folderId === f.id).length;
    const active = activeFolder === f.id;
    return `<div class="folder-row${active ? ' active' : ''}" data-fid="${f.id}">
      <button class="folder-item folder-item-inner${active ? ' active' : ''}" data-fid="${f.id}">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${esc(f.name)}</span>
        <span class="folder-count">${count}</span>
      </button>
      <div class="folder-actions">
        <button class="folder-action-btn" data-action="rename" data-fid="${f.id}" title="Rename">✏️</button>
        <button class="folder-action-btn" data-action="delete" data-fid="${f.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('folder-folder-items').innerHTML = foldersHtml ||
    '<div style="font-size:11px;color:var(--faint);padding:4px 14px;">No folders yet</div>';

  // Wire library items
  document.querySelectorAll('.folder-item[data-fid]').forEach(el => {
    el.addEventListener('click', () => {
      activeFolder = el.dataset.fid === 'null' ? null : el.dataset.fid;
      closeDetail();
      renderAll();
    });
  });

  // Wire folder row clicks
  document.querySelectorAll('.folder-item-inner').forEach(el => {
    el.addEventListener('click', () => {
      activeFolder = el.dataset.fid;
      closeDetail();
      renderAll();
    });
  });

  // Wire folder action buttons
  document.querySelectorAll('.folder-action-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.action === 'rename') renameFolderPrompt(btn.dataset.fid);
      if (btn.dataset.action === 'delete') deleteFolder(btn.dataset.fid);
    });
  });

  // Update folder select in edit form
  const sel = document.getElementById('f-folder');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '<option value="">No folder — Unfiled</option>' +
      folders.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
    if (prev) sel.value = prev;
  }
}

function folderItemHtml({ id, icon, label, count }) {
  const fid = id === null ? 'null' : id;
  const active = (activeFolder === null && id === null) || activeFolder === id;
  return `<button class="folder-item${active ? ' active' : ''}" data-fid="${fid}">
    <span class="folder-icon">${icon}</span>
    <span class="folder-name">${esc(label)}</span>
    <span class="folder-count">${count}</span>
  </button>`;
}

// ── Folder rename / delete ────────────────────────────────────────────────────
function renameFolderPrompt(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  document.getElementById('folder-modal-title').textContent = 'Rename Folder';
  document.getElementById('folder-name-input').value = folder.name;
  document.getElementById('folder-overlay').classList.add('open');
  document.getElementById('folder-name-input').focus();
  document.getElementById('folder-name-input').select();
  // Store which folder we're editing
  document.getElementById('folder-overlay').dataset.editId = folderId;
}

async function deleteFolder(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const count = prompts.filter(p => p.folderId === folderId).length;
  const msg = count > 0
    ? `Delete folder "${folder.name}"? The ${count} prompt${count>1?'s':''} inside will become Unfiled.`
    : `Delete folder "${folder.name}"?`;
  if (!confirm(msg)) return;

  // Move prompts to unfiled
  prompts = prompts.map(p => p.folderId === folderId ? { ...p, folderId: '' } : p);
  folders = folders.filter(f => f.id !== folderId);

  await Promise.all([S.set('tc_folders', folders), S.set('tc_prompts', prompts)]);
  if (activeFolder === folderId) activeFolder = null;
  renderAll();
  toast('Folder deleted', true);
}

// ── Prompt list ───────────────────────────────────────────────────────────────
function filtered() {
  let list = [...prompts];
  if (activeFolder === '__recent') list = list.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,10);
  else if (activeFolder === '__none') list = list.filter(p => !p.folderId);
  else if (activeFolder) list = list.filter(p => p.folderId === activeFolder);
  if (q) {
    const lq = q.toLowerCase();
    list = list.filter(p => (p.name + (p.desc||'') + (p.body||'')).toLowerCase().includes(lq));
  }
  return list.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
}

function renderList() {
  const init = document.getElementById('initial-empty');
  if (init) init.remove();

  const list  = filtered();
  const title = q ? `Search: "${q}"`
    : activeFolder === null     ? 'All Prompts'
    : activeFolder === '__recent' ? 'Recent'
    : activeFolder === '__none' ? 'Unfiled'
    : folders.find(f => f.id === activeFolder)?.name || 'Prompts';

  document.getElementById('list-title').textContent  = title;
  document.getElementById('list-count').textContent  = list.length ? `${list.length} prompt${list.length>1?'s':''}` : '';

  const pane = document.getElementById('prompt-list');

  if (!list.length) {
    pane.innerHTML = `<div class="empty">
      <div class="empty-icon">📝</div>
      <div class="empty-title">${q ? 'No results' : 'No prompts yet'}</div>
      <div class="empty-sub">${q ? 'Try different keywords' : 'Create your first prompt — it will appear here'}</div>
      ${!q ? '<button class="btn-empty-new" id="btn-empty-new">+ Create prompt</button>' : ''}
    </div>`;
    document.getElementById('btn-empty-new')?.addEventListener('click', openNew);
    return;
  }

  pane.innerHTML = list.map(p => {
    const vars   = detectVars(p.body);
    const folder = p.folderId ? folders.find(f => f.id === p.folderId) : null;
    return `<div class="prompt-card${activeId === p.id ? ' active' : ''}" data-id="${p.id}">
      <div class="card-top">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-actions">
          <button class="btn-card-insert" data-id="${p.id}">Insert ↗</button>
        </div>
      </div>
      ${p.desc ? `<div class="card-desc">${esc(p.desc)}</div>` : ''}
      <div class="card-meta">
        ${folder ? `<span class="meta-tag folder">📁 ${esc(folder.name)}</span>` : ''}
        ${vars.length ? `<span class="meta-tag var">${vars.length} var${vars.length>1?'s':''}</span>` : ''}
        <span class="meta-tag">${new Date(p.createdAt||Date.now()).toLocaleDateString()}</span>
      </div>
    </div>`;
  }).join('');

  pane.querySelectorAll('.prompt-card').forEach(el => {
    el.addEventListener('click', e => {
      if (!e.target.closest('.btn-card-insert')) openView(el.dataset.id);
    });
  });
  pane.querySelectorAll('.btn-card-insert').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); quickInsert(btn.dataset.id); });
  });
}

// ── Detect {{vars}} ───────────────────────────────────────────────────────────
function detectVars(body = '') {
  return [...new Set((body.match(/\{\{([^}]+)\}\}/g) || []).map(m => m.slice(2, -2).trim()))];
}

// ── View mode ─────────────────────────────────────────────────────────────────
function openView(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;
  activeId = id; mode = 'view';
  renderList();

  const vars   = detectVars(p.body);
  const folder = p.folderId ? folders.find(f => f.id === p.folderId) : null;

  document.getElementById('detail-title').textContent = p.name;
  document.getElementById('detail-actions').innerHTML = `
    <button class="btn-icon" id="btn-edit">✏️ Edit</button>
    <button class="btn-icon danger" id="btn-delete">🗑</button>`;
  document.getElementById('btn-edit').addEventListener('click', () => openEdit(id));
  document.getElementById('btn-delete').addEventListener('click', () => deletePrompt(id));

  let body = '';
  if (p.desc) body += `<div class="view-section"><div class="view-label">Description</div><div class="view-text" style="color:var(--muted)">${esc(p.desc)}</div></div>`;
  if (folder) body += `<div style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px">📁 <strong>${esc(folder.name)}</strong></div>`;

  if (vars.length) {
    body += `<div class="field">
      <div class="field-label">Fill in variables</div>
      <div class="var-fill-grid">
        ${vars.map(v => `<div class="field">
          <label class="field-label" style="color:var(--blue)">${esc(v)}</label>
          <input class="field-input var-input" data-var="${esc(v)}" placeholder="${esc(v)}…">
        </div>`).join('')}
      </div>
    </div>
    <div class="view-section">
      <div class="view-label">Preview</div>
      <div class="view-body-text" id="preview-text">${esc(p.body)}</div>
    </div>`;
  } else {
    body += `<div class="view-section"><div class="view-label">Prompt</div><div class="view-body-text">${esc(p.body)}</div></div>`;
  }

  document.getElementById('detail-body').innerHTML = body;
  document.getElementById('detail-footer').style.display = '';
  document.getElementById('detail').classList.add('open');
  window._vid = id;

  // Event delegation for var inputs — no inline handlers (CSP)
  document.getElementById('detail-body').addEventListener('input', e => {
    if (e.target.classList.contains('var-input')) livePreview();
  });
}

function livePreview() {
  const p = prompts.find(x => x.id === window._vid);
  if (!p) return;
  let text = p.body;
  document.querySelectorAll('.var-input').forEach(inp => {
    if (inp.value) text = text.replaceAll(`{{${inp.dataset.var}}}`, inp.value);
  });
  const el = document.getElementById('preview-text');
  if (el) el.textContent = text;
}

// ── Edit mode ─────────────────────────────────────────────────────────────────
function openEdit(id) {
  const p = prompts.find(x => x.id === id) || {};
  activeId = id || null; mode = 'edit';
  renderList();

  document.getElementById('detail-title').textContent = id ? 'Edit Prompt' : 'New Prompt';
  document.getElementById('detail-actions').innerHTML = `
    ${id ? '<button class="btn-icon danger" id="btn-delete">🗑 Delete</button>' : ''}
    <button class="btn-primary" id="btn-save-prompt">Save</button>`;
  if (id) document.getElementById('btn-delete').addEventListener('click', () => deletePrompt(id));
  document.getElementById('btn-save-prompt').addEventListener('click', savePrompt);

  document.getElementById('detail-body').innerHTML = `
    <div class="field">
      <label class="field-label">Prompt name *</label>
      <input class="field-input" id="f-name" placeholder="e.g. Summarise this article" maxlength="80" value="${esc(p.name||'')}">
    </div>
    <div class="field">
      <label class="field-label">Description <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">(optional)</span></label>
      <input class="field-input" id="f-desc" placeholder="What does this prompt do?" maxlength="160" value="${esc(p.desc||'')}">
    </div>
    <div class="field">
      <label class="field-label">Save to folder</label>
      <select class="field-select" id="f-folder">
        <option value="">No folder — Unfiled</option>
        ${folders.map(f => `<option value="${f.id}"${p.folderId===f.id?' selected':''}>${esc(f.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="field-label">Prompt text *</label>
      <textarea class="field-textarea" id="f-body" placeholder="Write your prompt here…&#10;&#10;Tip: use {{variable}} for dynamic parts">${esc(p.body||'')}</textarea>
      <div class="field-hint" id="var-hint" style="display:none">
        Variables detected: <span class="var-chips" id="var-chips"></span>
      </div>
    </div>`;

  document.getElementById('f-body').addEventListener('input', () => {
    const vars  = detectVars(document.getElementById('f-body').value);
    const hint  = document.getElementById('var-hint');
    const chips = document.getElementById('var-chips');
    hint.style.display = vars.length ? '' : 'none';
    chips.innerHTML = vars.map(v => `<span class="var-chip">{{${v}}}</span>`).join('');
  });

  document.getElementById('detail-footer').style.display = 'none';
  document.getElementById('detail').classList.add('open');
  setTimeout(() => document.getElementById('f-name')?.focus(), 50);
  window._eid = id || null;
}

function openNew() {
  window._eid = null;
  openEdit(null);
}

function closeDetail() {
  document.getElementById('detail').classList.remove('open');
  document.getElementById('detail-footer').style.display = 'none';
  activeId = null; mode = null;
  window._vid = null; window._eid = null;
  renderList();
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function savePrompt() {
  const nameEl = document.getElementById('f-name');
  const bodyEl = document.getElementById('f-body');
  const name   = nameEl?.value.trim();
  const body   = bodyEl?.value.trim();

  if (!name) { nameEl?.focus(); toast('Please enter a prompt name'); return; }
  if (!body) { bodyEl?.focus(); toast('Please enter the prompt text'); return; }

  const desc     = document.getElementById('f-desc')?.value.trim() || '';
  const folderId = document.getElementById('f-folder')?.value || '';
  const eid      = window._eid;

  if (eid) {
    const i = prompts.findIndex(p => p.id === eid);
    if (i > -1) prompts[i] = { ...prompts[i], name, desc, body, folderId };
  } else {
    prompts.push({ id: uid(), name, desc, body, folderId, createdAt: Date.now() });
  }

  await S.set('tc_prompts', prompts);
  closeDetail();
  renderAll();
  updateProUI();
  toast(eid ? 'Prompt updated ✓' : 'Prompt saved ✓', true);
}

// ── Delete prompt ─────────────────────────────────────────────────────────────
async function deletePrompt(id) {
  if (!confirm('Delete this prompt?')) return;
  prompts = prompts.filter(p => p.id !== id);
  await S.set('tc_prompts', prompts);
  closeDetail();
  renderAll();
  updateProUI();
  toast('Deleted');
}

// ── Insert ────────────────────────────────────────────────────────────────────
document.getElementById('btn-insert').addEventListener('click', insertFromView);
document.getElementById('btn-copy').addEventListener('click', copyFromView);

function getRenderedText(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return null;
  let text = p.body;
  document.querySelectorAll('.var-input').forEach(inp => {
    if (inp.value) text = text.replaceAll(`{{${inp.dataset.var}}}`, inp.value);
  });
  return text;
}

async function insertFromView() {
  const text = getRenderedText(window._vid);
  if (!text) return;
  await S.set('tc_last_prompt', { id: window._vid, text });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { await navigator.clipboard.writeText(text); toast('Copied — no active tab', true); return; }

  const isAI = tab.url?.match(/chatgpt\.com|claude\.ai|gemini\.google\.com|perplexity\.ai|poe\.com/);
  if (!isAI)  { await navigator.clipboard.writeText(text); toast('Copied — open an AI chat to insert', true); return; }

  try {
    // Send via runtime message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'TURBOCHAT_INSERT_PROMPT', text });
    if (response?.ok) {
      toast('Inserted into chat ✓', true);
    } else {
      throw new Error('Insert returned not ok');
    }
  } catch (err) {
    // Fallback: inject directly via scripting API
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (promptText) => {
          const selectors = [
            '[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"][data-lexical-editor="true"]',
            'div.ProseMirror[contenteditable="true"]',
            '[contenteditable="true"]',
            'textarea',
          ];
          let el = null;
          for (const s of selectors) {
            el = document.querySelector(s);
            if (el && el.offsetParent !== null) break;
          }
          if (!el) return false;
          el.focus();
          if (el instanceof HTMLTextAreaElement) {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
            if (setter) setter.call(el, promptText); else el.value = promptText;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (el.isContentEditable) {
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, promptText);
          }
          return true;
        },
        args: [text],
      });
      toast('Inserted into chat ✓', true);
    } catch {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard ✓', true);
    }
  }
}

async function copyFromView() {
  const text = getRenderedText(window._vid);
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast('Copied ✓', true);
}

async function quickInsert(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;
  if (detectVars(p.body).length) { openView(id); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { await navigator.clipboard.writeText(p.body); toast('Copied ✓', true); return; }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TURBOCHAT_INSERT_PROMPT', text: p.body });
    toast('Inserted ✓', true);
  } catch {
    await navigator.clipboard.writeText(p.body);
    toast('Copied ✓', true);
  }
}

// ── Folder modal ──────────────────────────────────────────────────────────────
document.getElementById('btn-add-folder').addEventListener('click', () => {
  document.getElementById('folder-modal-title').textContent = 'New Folder';
  document.getElementById('folder-name-input').value = '';
  document.getElementById('folder-overlay').dataset.editId = '';
  document.getElementById('folder-overlay').classList.add('open');
  setTimeout(() => document.getElementById('folder-name-input').focus(), 50);
});

document.getElementById('btn-folder-cancel').addEventListener('click', () => {
  document.getElementById('folder-overlay').classList.remove('open');
});

document.getElementById('folder-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

document.getElementById('folder-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter')  document.getElementById('btn-folder-save').click();
  if (e.key === 'Escape') document.getElementById('btn-folder-cancel').click();
});

document.getElementById('btn-folder-save').addEventListener('click', async () => {
  const name   = document.getElementById('folder-name-input').value.trim();
  const editId = document.getElementById('folder-overlay').dataset.editId;
  if (!name) return;

  if (editId) {
    // Rename existing folder
    const i = folders.findIndex(f => f.id === editId);
    if (i > -1) folders[i] = { ...folders[i], name };
  } else {
    folders.push({ id: uid(), name });
  }

  await S.set('tc_folders', folders);
  document.getElementById('folder-overlay').classList.remove('open');
  renderAll();
  toast(editId ? 'Folder renamed ✓' : 'Folder created ✓', true);
});

// ── Export (Pro only) ─────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', async () => {
  const data = { version: 1, exported_at: new Date().toISOString(), folders, prompts };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `turbochat-prompts-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${prompts.length} prompts ✓`, true);
});

// ── Import (Pro only) ─────────────────────────────────────────────────────────
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const raw    = await file.text();
    const data   = JSON.parse(raw);
    if (!Array.isArray(data.prompts)) throw new Error('Invalid format');

    const existingIds      = new Set(prompts.map(p => p.id));
    const existingFolderIds = new Set(folders.map(f => f.id));
    const newPrompts  = data.prompts.filter(p => !existingIds.has(p.id));
    const newFolders  = (data.folders || []).filter(f => !existingFolderIds.has(f.id));

    prompts = [...prompts, ...newPrompts];
    folders = [...folders, ...newFolders];
    await Promise.all([S.set('tc_prompts', prompts), S.set('tc_folders', folders)]);
    renderAll();
    updateProUI();
    toast(`Imported ${newPrompts.length} prompt${newPrompts.length !== 1 ? 's' : ''} ✓`, true);
  } catch {
    toast('Import failed — check the file format');
  }
  e.target.value = '';
});

// ── Top-level wiring ──────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', openNew);
document.getElementById('btn-close').addEventListener('click', closeDetail);
document.getElementById('search').addEventListener('input', e => {
  q = e.target.value.trim();
  if (q) activeFolder = null;
  renderAll();
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && mode === 'edit') {
    e.preventDefault(); savePrompt();
  }
  if (e.key === 'Escape') {
    if (document.getElementById('folder-overlay').classList.contains('open')) {
      document.getElementById('folder-overlay').classList.remove('open');
    } else if (document.getElementById('detail').classList.contains('open')) {
      closeDetail();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openNew(); }
});

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Upgrade prompt button ─────────────────────────────────────────────────────
document.getElementById('btn-upgrade-prompts')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://turbochat.zhuanyeonglim.workers.dev/success' });
});

// ── Initial empty state button ────────────────────────────────────────────────
document.getElementById('btn-initial-new')?.addEventListener('click', openNew);
