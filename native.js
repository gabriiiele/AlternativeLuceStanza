'use strict';

/* App nativa (APK Android e app iPhone, fatte con Capacitor).
   Nel browser questo file non fa nulla. Nell'app:
   - Android: le esportazioni vanno direttamente nella Galleria (Immagini › Luce Stanza; backup e TIFF in Download),
     si può sfogliare la Galleria dall'app e ricevere foto da "Condividi → Luce Stanza" (plugin LucePlugin.java);
   - iPhone: le esportazioni vengono salvate nell'app File (Luce Stanza) e si apre il foglio di condivisione,
     da cui si sceglie "Salva immagine" per metterle in Foto. */

const NATIVE_OS = IS_NATIVE ? Capacitor.getPlatform() : 'web';
const NativeFS = IS_NATIVE ? Capacitor.registerPlugin('Filesystem') : null;
const NativeShare = IS_NATIVE ? Capacitor.registerPlugin('Share') : null;
const Luce = NATIVE_OS === 'android' ? Capacitor.registerPlugin('Luce') : null;

const blobToBase64 = b => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).slice(String(r.result).indexOf(',') + 1));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

/* Scrive un file a pezzi (i file grandi, come i backup, non passano tutti insieme dal ponte con l'app) */
async function nativeWrite(file, directory) {
  const CH = 3 << 20;   // multiplo di 3: ogni pezzo in base64 è completo
  const path = 'Luce Stanza/' + file.name.replace(/[\\/:*?"<>|]/g, '_');
  for (let o = 0; o === 0 || o < file.size; o += CH) {
    const data = await blobToBase64(file.slice(o, o + CH));
    if (o === 0) await NativeFS.writeFile({ path, data, directory, recursive: true });
    else await NativeFS.appendFile({ path, data, directory });
  }
  return (await NativeFS.getUri({ path, directory })).uri;
}

/* Salva una o più esportazioni */
async function nativeSave(files) {
  if (NATIVE_OS === 'android') {
    let folder = '';
    for (const [i, f] of files.entries()) {
      if (files.length > 1) toast(`Salvataggio ${i + 1} di ${files.length}…`);
      const path = await nativeWrite(f, 'CACHE');
      folder = (await Luce.save({ path, name: f.name, mime: f.type || 'application/octet-stream' })).folder;
    }
    toast(files.length > 1 ? `${files.length} file salvati in ${folder}` : `Salvato in ${folder}`);
    return;
  }
  // iPhone: copia nell'app File e foglio di condivisione (Salva immagine, AirDrop, Instagram…)
  const uris = [];
  for (const f of files) uris.push(await nativeWrite(f, 'DOCUMENTS'));
  try { await NativeShare.share({ files: uris }); }
  catch { toast('Salvato nell\'app File › Luce Stanza'); }
}

/* Legge un file della Galleria o condiviso come File, passando dalla cache dell'app */
async function nativeReadUri(uri) {
  const c = await Luce.copyToCache({ uri });
  try {
    const blob = await (await fetch(Capacitor.convertFileSrc(c.path))).blob();
    return new File([blob], c.name, { type: c.mime || blob.type, lastModified: c.taken || Date.now() });
  } finally { Luce.deleteCached({ path: c.path }); }
}

/* Foto arrivate con "Condividi → Luce Stanza" (all'avvio o con l'app già aperta) */
async function importShared() {
  const { uris } = await Luce.takeShared();
  if (!uris.length) return;
  const files = [];
  for (const [i, u] of uris.entries()) {
    libStatus(`Lettura ${i + 1} di ${uris.length}…`);
    try { files.push(await nativeReadUri(u)); } catch (e) { console.error(u, e); }
  }
  libStatus('');
  if (files.length) await importFiles(files);
}
function initNative() {
  if (NATIVE_OS !== 'android') return;
  Luce.addListener('shared', () => importShared());
  importShared().catch(e => console.error(e));
}

/* ---------- Galleria del telefono (solo Android) ---------- */

const gal = { album: null, albums: null, items: [], total: 0, sel: new Set(), perm: null };
const galThumbs = new Map();

async function renderGallery(body) {
  if (!gal.perm) gal.perm = await Luce.galleryPermission().catch(() => ({ granted: false }));
  if (!gal.perm.granted) {
    body.append(note('Per sfogliare la Galleria serve il permesso di leggere le foto.'),
      actions(btn('Consenti l\'accesso alle foto', async () => { gal.perm = null; renderLibrary(); }, 'primary')));
    return;
  }
  if (gal.perm.partial) body.append(note('Hai concesso solo alcune foto: per vederle tutte cambia il permesso nelle impostazioni di Android.'));
  if (!gal.albums) gal.albums = (await Luce.albums()).albums;
  body.append(chips([['', 'Tutte'], ...gal.albums.map(a => [a.id, `${a.name} (${a.count})`])], gal.album || '', v => {
    gal.album = v || null; gal.items = []; gal.sel.clear(); renderLibrary();
  }));
  const grid = el('div', { id: 'grid' });
  grid.style.gridTemplateColumns = `repeat(${appSettings.cols}, 1fr)`;
  const more = el('div', { className: 'actions' });
  body.append(grid, more, el('div', { id: 'libCount', className: 'note' }));
  if (!gal.items.length) await galLoadMore();
  const known = new Set(photos.filter(p => !p.trashed).map(p => p.srcUri).filter(Boolean));
  const draw = () => {
    grid.innerHTML = '';
    for (const it of gal.items) {
      const cell = el('div', { className: 'cell' + (gal.sel.has(it.uri) ? ' sel' : '') });
      const img = el('img', { alt: '' });
      cell.append(img);
      if (known.has(it.uri)) { const m = el('span', { className: 'edmark', title: 'Già nella libreria' }); m.append(icon('check', 14)); cell.append(m); }
      cell.onclick = () => { gal.sel.has(it.uri) ? gal.sel.delete(it.uri) : gal.sel.add(it.uri); cell.classList.toggle('sel'); galBar(); };
      cell.dataset.uri = it.uri;
      grid.append(cell);
      galObserver.observe(cell);
    }
    more.innerHTML = '';
    if (gal.items.length < gal.total) more.append(btn('Mostra altre', async () => { await galLoadMore(); draw(); }));
    $('libCount').textContent = gal.total ? `${gal.total} foto nella Galleria · tocca per selezionare` : 'Nessuna foto in questo album.';
  };
  draw();
  galBar();
}
async function galLoadMore() {
  const r = await Luce.list({ offset: gal.items.length, limit: 150, ...(gal.album ? { album: gal.album } : {}) });
  gal.items.push(...r.items); gal.total = r.total;
}
const galObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    galObserver.unobserve(e.target);
    const uri = e.target.dataset.uri, img = e.target.querySelector('img');
    if (galThumbs.has(uri)) { img.src = galThumbs.get(uri); continue; }
    Luce.thumbnail({ uri, size: 256 }).then(r => { galThumbs.set(uri, r.data); img.src = r.data; }).catch(() => {});
  }
}, { rootMargin: '400px' });

/* Barra in basso della Galleria: importa le foto scelte */
function galBar() {
  const bar = $('selBar');
  if (lib.view !== 'gallery' || !gal.sel.size) { if (lib.view === 'gallery') bar.hidden = true; return; }
  bar.innerHTML = ''; bar.hidden = false;
  bar.append(el('span', { textContent: `${gal.sel.size} scelte` }),
    btn('Annulla', () => { gal.sel.clear(); renderLibrary(); }),
    btn('Importa', galImport, 'primary'));
}
async function galImport() {
  const list = gal.items.filter(it => gal.sel.has(it.uri)), files = [], uris = [];
  for (const [i, it] of list.entries()) {
    libStatus(`Lettura ${i + 1} di ${list.length}…`);
    try { files.push(await nativeReadUri(it.uri)); uris.push(it.uri); } catch (e) { console.error(it.uri, e); }
  }
  libStatus('');
  gal.sel.clear();
  const added = await importFiles(files, { quiet: true });
  // ricorda da quale foto della Galleria viene ogni scheda (segno "già importata")
  for (const rec of added) { const i = files.findIndex(f => f.name === rec.file); if (i >= 0) { rec.srcUri = uris[i]; await DB.put('photos', rec); } }
  toast(`${added.length} importate`);
  renderLibrary();
}
