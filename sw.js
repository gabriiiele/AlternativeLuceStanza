const CACHE = 'luce-stanza-v16';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'compat.js', 'native.js', 'shaders.js', 'engine.js', 'profiles.js', 'presets.js',
  'state.js', 'db.js', 'tools.js', 'export.js', 'ai.js', 'backup.js', 'merge.js', 'camera.js', 'app.js', 'library.js',
  'vendor/tf.min.js', 'vendor/anthropic-sdk.js',
  'vendor/fonts/montserrat-latin-400-normal.woff2', 'vendor/fonts/montserrat-latin-600-normal.woff2', 'vendor/fonts/playfair-display-latin-400-normal.woff2',
  'vendor/fonts/playfair-display-latin-700-normal.woff2', 'vendor/fonts/playfair-display-latin-400-italic.woff2', 'vendor/fonts/bebas-neue-latin-400-normal.woff2',
  'vendor/fonts/great-vibes-latin-400-normal.woff2', 'vendor/fonts/cormorant-garamond-latin-400-normal.woff2', 'vendor/fonts/cormorant-garamond-latin-600-normal.woff2',
  'vendor/libraw/index.js', 'vendor/libraw/worker.js', 'vendor/libraw/libraw.wasm',
  'vendor/sr/slim-x2/model.json', 'vendor/sr/slim-x2/group1-shard1of1.bin',
  'vendor/sr/medium-x2/model.json', 'vendor/sr/medium-x2/group1-shard1of1.bin',
  'vendor/sr/medium-x4/model.json', 'vendor/sr/medium-x4/group1-shard1of1.bin'];

// modelli dell'analisi del viso (~30 MB): scaricati solo al primo uso e poi conservati per l'uso offline
const FACE_CACHE = 'luce-face-1';

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'transformers-cache' && k !== FACE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

/* "Condividi" dalla Galleria: salva i file nell'archivio inbox e apre l'app */
function saveInbox(files) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('luce-stanza', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of ['photos', 'files', 'decoded', 'thumbs', 'depth', 'albums', 'inbox'])
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, s === 'photos' || s === 'albums' ? { keyPath: 'id' } : s === 'inbox' ? { autoIncrement: true } : undefined);
    };
    r.onsuccess = () => {
      const tx = r.result.transaction('inbox', 'readwrite');
      for (const f of files) tx.objectStore('inbox').add({ blob: f, name: f.name, time: f.lastModified || Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      await saveInbox(form.getAll('photos').filter(f => f instanceof File));
      return Response.redirect('./index.html?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // stessa origine: chiede sempre al server se il file è cambiato (evita di mescolare file di versioni diverse)
  const same = url.origin === location.origin;
  if (same && url.pathname.includes('/vendor/face/')) {
    e.respondWith(caches.open(FACE_CACHE).then(async c => {
      const hit = await c.match(e.request, { ignoreSearch: true }); if (hit) return hit;
      const r = await fetch(e.request); if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  e.respondWith(fetch(e.request, same ? { cache: 'no-cache' } : {}).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
