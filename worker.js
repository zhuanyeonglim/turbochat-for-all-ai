/* GPT Lift — worker.js  |  Web Worker
 * Handles JSON.parse, trim, and IndexedDB — all off the main thread.
 *
 * IMPORTANT: Cache entries include the `limit` they were trimmed with.
 * On DB_GET, if stored limit !== requested limit, we return a miss.
 * This prevents serving stale 15-message entries after user changes to 5.
 */

'use strict';

const DB_NAME    = 'gptlift';
const DB_VERSION = 1;
const STORE      = 'responses';
const MAX_ENTRIES = 50;
const MAX_AGE_MS  = 30 * 60 * 1000; // 30 min

const EXCLUDED_ROLES = new Set(['system', 'tool', 'thinking']);

// ── IndexedDB ─────────────────────────────────────────────────────────────
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const st = d.createObjectStore(STORE, { keyPath: 'convId' });
        st.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getDB() {
  if (!db) db = await openDB();
  return db;
}

async function dbGet(convId) {
  try {
    const d   = await getDB();
    const tx  = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(convId);
    return await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => rej(req.error);
    });
  } catch { return null; }
}

async function dbPut(entry) {
  try {
    const d  = await getDB();
    const tx = d.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.put(entry);
    const countReq = st.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ENTRIES) {
        const cursor = st.index('ts').openCursor(null, 'next');
        let toDel = countReq.result - MAX_ENTRIES;
        cursor.onsuccess = (ev) => {
          const c = ev.target.result;
          if (c && toDel > 0) { c.delete(); toDel--; c.continue(); }
        };
      }
    };
    return new Promise(resolve => { tx.oncomplete = resolve; tx.onerror = resolve; });
  } catch { /* ignore */ }
}

async function dbDelete(convId) {
  try {
    const d  = await getDB();
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(convId);
  } catch { /* ignore */ }
}

// ── Trimmer ───────────────────────────────────────────────────────────────
function isVisible(node) {
  const role = node?.message?.author?.role;
  return !!role && !EXCLUDED_ROLES.has(role);
}

function stripImageAssets(node) {
  try {
    const parts = node?.message?.content?.parts;
    if (Array.isArray(parts)) {
      parts.forEach(p => {
        if (!p || typeof p !== 'object') return;
        if (p.content_type === 'image_asset_pointer') { p.asset_pointer = ''; p.width = 0; p.height = 0; }
        if (p.content_type === 'multimodal_text' && p.image_part) p.image_part.asset_pointer = '';
      });
    }
    const att = node?.metadata?.attachments;
    if (Array.isArray(att)) att.forEach(a => { if (a?.url) a.url = ''; });
  } catch { /* never break */ }
}

function trimMapping(data, messageLimit, extraMessages) {
  try {
    const { mapping, current_node: currentNode } = data;
    if (!mapping || !currentNode || !mapping[currentNode]) return null;

    const chain = []; const visited = new Set(); let id = currentNode;
    while (id && mapping[id] && !visited.has(id)) {
      visited.add(id); chain.push(id); id = mapping[id].parent ?? null;
    }
    chain.reverse();

    let absoluteMessageCount = 0;
    for (const nid of chain) { if (isVisible(mapping[nid])) absoluteMessageCount++; }

    const effectiveLimit = Math.max(messageLimit + extraMessages, 2);
    if (absoluteMessageCount <= effectiveLimit) return null;

    let count = 0, cutoffIdx = 0;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (isVisible(mapping[chain[i]])) { count++; if (count >= effectiveLimit) { cutoffIdx = i; break; } }
    }

    // Only keep from cutoff onward — no pre-cutoff structural nodes
    const keptChain = chain.slice(cutoffIdx);
    const newMapping = {};
    for (let i = 0; i < keptChain.length; i++) {
      const nid  = keptChain[i];
      const node = structuredClone(mapping[nid]);
      node.parent   = i > 0 ? keptChain[i - 1] : null;
      node.children = i < keptChain.length - 1 ? [keptChain[i + 1]] : [];
      if (!isVisible(node)) stripImageAssets(node);
      newMapping[nid] = node;
    }

    return {
      mapping: newMapping, current_node: currentNode,
      root: keptChain[0] ?? currentNode,
      visibleTotal: absoluteMessageCount, absoluteMessageCount,
      visibleKept: effectiveLimit,
      hasOlderMessages: absoluteMessageCount > effectiveLimit,
      conversation_id: data.conversation_id,
    };
  } catch { return null; }
}

// ── Message handler ───────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, id } = e.data;

  if (type === 'DB_GET') {
    const { convId, limit } = e.data;
    const entry = await dbGet(convId);

    if (!entry) { self.postMessage({ type: 'DB_GET_RESULT', id, hit: false }); return; }
    if (Date.now() - entry.ts > MAX_AGE_MS) {
      await dbDelete(convId);
      self.postMessage({ type: 'DB_GET_RESULT', id, hit: false }); return;
    }
    // ── Limit or extra mismatch → stale entry → treat as miss ──
    // Must validate BOTH limit and extra. Without extra check, a 15-message
    // cached body (limit=5 + extra=10) gets served on fresh open (extra=0).
    const requestedExtra = e.data.extra ?? 0;
    if (entry.limit !== limit || (entry.extra ?? 0) !== requestedExtra) {
      await dbDelete(convId);
      self.postMessage({ type: 'DB_GET_RESULT', id, hit: false }); return;
    }

    self.postMessage({ type: 'DB_GET_RESULT', id, hit: true, entry });
    return;
  }

  if (type === 'PROCESS') {
    const { convId, text, limit, extra } = e.data;
    try {
      const data = JSON.parse(text);
      if (!data.mapping || !data.current_node) {
        self.postMessage({ type: 'PROCESS_RESULT', id, ok: false }); return;
      }
      const result = trimMapping(data, limit, extra);
      let body;
      if (!result) {
        body = text;
        // Store with limit+extra so future reads can validate both
        await dbPut({ convId, body, result: null, ts: Date.now(), limit, extra });
        self.postMessage({ type: 'PROCESS_RESULT', id, ok: true, body, result: null }); return;
      }
      const newData = { ...data, mapping: result.mapping, current_node: result.current_node, root: result.root };
      body = JSON.stringify(newData);
      await dbPut({ convId, body, result, ts: Date.now(), limit, extra }); // ← limit+extra stored
      self.postMessage({ type: 'PROCESS_RESULT', id, ok: true, body, result });
    } catch (err) {
      self.postMessage({ type: 'PROCESS_RESULT', id, ok: false, error: err.message });
    }
    return;
  }

  if (type === 'DB_INVALIDATE') {
    await dbDelete(e.data.convId);
    return;
  }
};
