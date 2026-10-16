const CACHE = 'luce-stanza-v3';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg', 'shaders.js', 'engine.js', 'profiles.js', 'presets.js', 'state.js', 'tools.js', 'export.js', 'app.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).catch(() => caches.match(e.request))
));
