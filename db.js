'use strict';

/* Archivio locale (IndexedDB). Archivi:
   photos  – scheda della foto (metadati, valutazioni, modifiche, versioni, cronologia)
   files   – file originale (Blob)
   decoded – RAW già decodificato (Blob PNG), per non ridecodificarlo a ogni apertura
   thumbs  – miniatura con le modifiche applicate (Blob JPEG)
   depth   – mappa di profondità (Blob PNG)
   albums  – album
   inbox   – foto ricevute da "Condividi" (riempito dal service worker) */

const DB_NAME = 'luce-stanza', DB_VER = 1;
const STORES = ['photos', 'files', 'decoded', 'thumbs', 'depth', 'albums', 'inbox'];

const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s))
          d.createObjectStore(s, s === 'photos' || s === 'albums' ? { keyPath: 'id' } : s === 'inbox' ? { autoIncrement: true } : undefined);
      };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async run(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, mode), st = tx.objectStore(store);
      let out;
      const q = fn(st);
      if (q) q.onsuccess = () => { out = q.result; };
      tx.oncomplete = () => res(out);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  },
  get: (s, k) => DB.run(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => DB.run(s, 'readwrite', st => (k === undefined ? st.put(v) : st.put(v, k))),
  del: (s, k) => DB.run(s, 'readwrite', st => st.delete(k)),
  all: s => DB.run(s, 'readonly', st => st.getAll()),
  keys: s => DB.run(s, 'readonly', st => st.getAllKeys()),
  clear: s => DB.run(s, 'readwrite', st => st.clear()),
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Impronta per riconoscere i duplicati: dimensione + SHA-256 dei primi 256 KB */
async function quickHash(file) {
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return file.size + ':' + Array.from(new Uint8Array(h).slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function storageInfo() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage || 0, quota: e.quota || 0, persisted: navigator.storage.persisted ? await navigator.storage.persisted() : false };
}
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';
