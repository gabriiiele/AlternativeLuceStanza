'use strict';

/* Libreria in stile Lightroom: griglia, album, filtri, ricerca, selezione multipla, importazione,
   duplicati, impostazioni. Le foto e le modifiche restano sul telefono (IndexedDB). */

const RAW_RE = /\.(dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|3fr|iiq|x3f|erf|kdc|mrw|dcr|mos|rwl)$/i;
const LABELS = { red: '#e53935', yellow: '#fdd835', green: '#43a047', blue: '#1e88e5', purple: '#8e24aa' };

const appSettings = (() => {
  const d = { theme: 'dark', cols: 3, importPreset: '', skipDuplicates: true, sort: 'taken', dir: -1, viewHist: true, viewInfo: false, viewClip: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem('appSettings') || '{}') }; } catch { return d; }
})();
function saveAppSettings() { try { localStorage.setItem('appSettings', JSON.stringify(appSettings)); } catch { /* spazio pieno */ } }

const lib = { view: 'all', album: null, query: '', filter: { rating: 0, flag: 'any', label: '', raw: false, edited: false }, showFilters: false, selecting: false, sel: new Set() };
let photos = [], albums = [], libEngine = null, curPhoto = null;
const thumbUrls = new Map();

/* ---------- Decodifica ---------- */

let LibRawMod = null;
async function decodeRaw(blob) {
  LibRawMod ||= (await import(new URL('vendor/libraw/index.js', location.href).href)).default;
  const raw = new LibRawMod();
  try {
    await raw.open(new Uint8Array(await blob.arrayBuffer()), { useCameraWb: true, outputBps: 8, userQual: 3 });
    const meta = await raw.metadata(true);
    const img = await raw.imageData();
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d'), id = ctx.createImageData(img.width, img.height), d = img.data;
    for (let i = 0, j = 0; j < id.data.length; i += 3, j += 4) { id.data[j] = d[i]; id.data[j + 1] = d[i + 1]; id.data[j + 2] = d[i + 2]; id.data[j + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    const tags = { make: meta.camera_make, model: meta.camera_model, iso: meta.iso_speed, exposure: meta.shutter, fnumber: meta.aperture,
      focal: meta.focal_len, dateOriginal: meta.timestamp ? new Date(meta.timestamp).toLocaleString('it-IT') : '', lens: meta.lens?.Lens || '' };
    return { canvas: c, tags, taken: meta.timestamp ? +new Date(meta.timestamp) : 0 };
  } catch (e) { throw new Error('File RAW non leggibile (' + e.message + ')'); } finally { raw.dispose(); }
}

function exifDate(s) {
  const m = s && String(s).match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? +new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
}

/* Lato massimo gestito dal motore (dipende dalla GPU, fino a 16384 px) */
const maxSide = () => (typeof engine !== 'undefined' && engine ? engine.maxSize : 4096);

/* Restituisce { canvas (al massimo max px sul lato lungo), tags, taken, app1 } */
async function decodePhoto(blob, name, max = maxSide()) {
  if (RAW_RE.test(name)) return decodeRaw(blob);
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const ex = readExif(await blob.slice(0, 256 * 1024).arrayBuffer());
  return { canvas: c, tags: ex.tags, taken: exifDate(ex.tags.dateOriginal || ex.tags.date), app1: ex.app1 };
}

/* Sorgente da modificare: RAW già decodificato oppure il file originale */
async function photoSource(rec, max) {
  const dec = rec.raw ? await DB.get('decoded', rec.id) : null;
  if (dec) { const r = await decodePhoto(dec, 'x.jpg', max); r.tags = rec.exif; return r; }
  return decodePhoto(await DB.get('files', rec.id), rec.name, max);
}

const scaledCanvas = (src, max) => {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(src.width * k)), height: Math.max(1, Math.round(src.height * k)) });
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
  return c;
};

/* Miniatura con le modifiche (motore dedicato alla libreria) */
async function makeThumb(src, p, eng = libEngine, brushes, size = 400, type = 'image/jpeg') {
  const s = scaledCanvas(src, size * 1.2);
  if (eng === libEngine) eng.setImage(s, s.width, s.height);
  const [ow, oh] = eng.outputSize(p), k = Math.min(1, size / Math.max(ow, oh));
  eng.render(effectiveParams(p), Math.max(1, Math.round(ow * k)), Math.max(1, Math.round(oh * k)), brushes || {});
  return new Promise(r => eng.canvas.toBlob(r, type, 0.82));
}

/* ---------- Importazione ---------- */

/* Restituisce le schede delle foto aggiunte; quiet = senza messaggio finale */
async function importFiles(files, { quiet = false } = {}) {
  const added = [];
  const known = new Set(photos.map(p => p.hash));
  const preset = appSettings.importPreset ? presetEntries().find(e => e.cat + '/' + e.name === appSettings.importPreset) : null;
  let n = 0, dup = 0, fail = 0;
  for (const [i, f] of files.entries()) {
    libStatus(`Importazione ${i + 1} di ${files.length}…`);
    try {
      const hash = await quickHash(f);
      const trashed = photos.find(p => p.hash === hash && p.trashed);
      if (trashed) { delete trashed.trashed; await DB.put('photos', trashed); n++; continue; }
      if (appSettings.skipDuplicates && known.has(hash)) { dup++; continue; }
      const d = await decodePhoto(f, f.name), id = uid(), raw = RAW_RE.test(f.name);
      const edits = preset ? (preset.user ? buildPreset(preset.def, 1, defaults()) : buildPreset(preset.def, 1)) : null;
      const rec = { id, name: f.name.replace(/\.[^.]+$/, ''), file: f.name, type: f.type, size: f.size, raw, hash,
        added: Date.now(), taken: d.taken || f.lastModified || Date.now(), w: d.canvas.width, h: d.canvas.height, exif: d.tags || {},
        rating: 0, flag: 0, label: '', keywords: [], albums: lib.album ? [lib.album] : [], edits, versions: [], history: [], edited: 0 };
      await DB.put('files', f, id);
      if (raw) await DB.put('decoded', await new Promise(r => d.canvas.toBlob(r, 'image/jpeg', 0.97)), id);
      await DB.put('thumbs', await makeThumb(d.canvas, edits || defaults()), id);
      await DB.put('photos', rec);
      photos.push(rec); added.push(rec); known.add(hash); n++;
    } catch (e) { console.error(f.name, e); fail++; }
  }
  libStatus('');
  if (!quiet) toast(`${n} importate` + (dup ? ` · ${dup} duplicati saltati` : '') + (fail ? ` · ${fail} non leggibili` : ''));
  renderLibrary();
  return added;
}

/* Aggiunge alla libreria un'immagine creata dall'app (unione HDR, panorama, scatto elaborato) */
async function addCanvasPhoto(canvas, name, extra = {}) {
  const id = uid(), blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95)), now = Date.now();
  const rec = { id, name, file: name + '.jpg', type: 'image/jpeg', size: blob.size, raw: false, hash: id, added: now,
    taken: extra.taken || now, w: canvas.width, h: canvas.height, exif: extra.exif || {}, rating: 0, flag: 0, label: '',
    keywords: extra.keywords || [], albums: extra.albums || [], edits: null, versions: [], history: [], edited: 0 };
  await DB.put('files', blob, id);
  await DB.put('thumbs', await makeThumb(canvas, defaults()), id);
  await DB.put('photos', rec);
  photos.push(rec);
  return rec;
}

/* Unione HDR o panorama delle foto selezionate (in ordine di scatto) */
async function batchMerge(kind) {
  const list = selected().sort((a, b) => a.taken - b.taken || a.name.localeCompare(b.name));
  if (list.length < 2) { toast('Seleziona almeno 2 foto'); return; }
  if (kind === 'hdr' && list.length > 7) { toast('Per l\'HDR usa da 2 a 7 foto'); return; }
  let focal35 = 26;
  if (kind === 'pano') {
    const f = prompt('Focale equivalente 35 mm delle foto (se non la conosci lascia il valore proposto)', String(list[0].exif.focal35 || 26));
    if (f === null) return;
    focal35 = Math.max(8, Math.min(400, parseFloat(f) || 26));
  }
  try {
    const canvases = [];
    for (const [i, r] of list.entries()) { libStatus(`Caricamento ${i + 1} di ${list.length}…`); canvases.push((await photoSource(r)).canvas); }
    const label = kind === 'hdr' ? 'HDR' : 'Panorama';
    const prog = (v, step) => libStatus(`${label}: ${step} ${Math.round(v * 100)}%`);
    const out = kind === 'hdr' ? await mergeHDR(canvases, prog) : await mergePanorama(canvases, { focal35, onProgress: prog });
    const rec = await addCanvasPhoto(out, `${list[0].name} ${label}`, { taken: list[0].taken, exif: list[0].exif, albums: list[0].albums });
    libStatus(''); lib.selecting = false; lib.sel.clear(); renderLibrary();
    toast(`${label} creato (${out.width} × ${out.height})`);
    return rec;
  } catch (e) { libStatus(''); alert(`${kind === 'hdr' ? 'Unione HDR' : 'Panorama'}: ${e.message}`); console.error(e); }
}

/* Foto arrivate da "Condividi" nella galleria di Android */
async function importInbox() {
  const items = await DB.all('inbox');
  if (!items.length) return;
  await DB.clear('inbox');
  await importFiles(items.map(it => new File([it.blob], it.name, { type: it.blob.type, lastModified: it.time })));
}

/* ---------- Filtri e ordinamento ---------- */

function visiblePhotos() {
  const f = lib.filter, q = lib.query.trim().toLowerCase();
  let list = photos.filter(p => {
    if (lib.view === 'trash') return !!p.trashed;
    if (p.trashed) return false;
    if (lib.view === 'album' && !p.albums.includes(lib.album)) return false;
    if (lib.view === 'picks' && p.flag !== 1) return false;
    if (lib.view === 'rejects' && p.flag !== -1) return false;
    if (lib.view === 'edited' && !isEdited(p.edits)) return false;
    if (lib.view === 'rated' && p.rating < 1) return false;
    if (f.rating && p.rating < f.rating) return false;
    if (f.flag === 'pick' && p.flag !== 1) return false;
    if (f.flag === 'none' && p.flag !== 0) return false;
    if (f.flag === 'reject' && p.flag !== -1) return false;
    if (f.label && p.label !== f.label) return false;
    if (f.raw && !p.raw) return false;
    if (f.edited && !isEdited(p.edits)) return false;
    if (q) {
      const d = new Date(p.taken), albumNames = p.albums.map(a => albums.find(x => x.id === a)?.name || '').join(' ');
      const hay = [p.name, p.file, ...p.keywords, p.exif.make, p.exif.model, p.exif.lens, albumNames,
        d.getFullYear(), d.toLocaleString('it-IT', { month: 'long' }), p.raw ? 'raw' : ''].join(' ').toLowerCase();
      if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
    }
    return true;
  });
  const key = { taken: p => p.taken, added: p => p.added, name: p => p.name.toLowerCase(), rating: p => p.rating, edited: p => p.edited }[appSettings.sort];
  list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * appSettings.dir);
  return list;
}

/* ---------- Disegno della libreria ---------- */

const ICON = {
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  plus: 'M12 5v14M5 12h14', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  check: 'M5 12l5 5 9-10', gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', album: 'M4 6h16v13H4zM8 3h8', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  flag: 'M5 21V4h11l-2 4 2 4H5', back: 'M15 5l-7 7 7 7', share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6', more: 'M5 12h.01M12 12h.01M19 12h.01',
  edit: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4', trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', tag: 'M3 12V4h8l10 10-8 8z',
};
const icon = (name, size = 22) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.classList.add('ic');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICON[name]); s.append(p);
  return s;
};
const ibtn = (name, onclick, title = '', cls = '') => { const b = el('button', { className: 'ibtn ' + cls, title, onclick }); b.append(icon(name)); return b; };

function libStatus(t) { $('libStatus').textContent = t; $('libStatus').hidden = !t; }

const VIEWS = [['all', 'Tutte le foto'], ['picks', 'Scelte'], ['rated', 'Valutate'], ['edited', 'Modificate'], ['rejects', 'Rifiutate'], ['trash', 'Cestino']];
const TRASH_DAYS = 30;
const livePhotos = () => photos.filter(p => !p.trashed);

function renderLibrary() {
  document.body.dataset.theme = appSettings.theme;
  const top = $('libTop'); top.innerHTML = '';
  const title = lib.view === 'album' ? (albums.find(a => a.id === lib.album)?.name || 'Album') : lib.view === 'albums' ? 'Album' : lib.view === 'settings' ? 'Impostazioni'
    : VIEWS.find(v => v[0] === lib.view)?.[1] || 'Libreria';
  if (lib.view === 'album') top.append(ibtn('back', () => { lib.view = 'albums'; renderLibrary(); }, 'Album'));
  top.append(el('h2', { textContent: title }), el('span', { className: 'spacer' }));
  if (!['albums', 'settings'].includes(lib.view)) {
    top.append(ibtn('search', () => { lib.showSearch = !lib.showSearch; renderLibrary(); }, 'Cerca', lib.showSearch ? 'on' : ''),
      ibtn('filter', () => { lib.showFilters = !lib.showFilters; renderLibrary(); }, 'Filtri', lib.showFilters ? 'on' : ''),
      ibtn('check', () => { lib.selecting = !lib.selecting; lib.sel.clear(); renderLibrary(); }, 'Seleziona', lib.selecting ? 'on' : ''),
      ibtn('camera', openCamera, 'Fotocamera'));
  }
  const body = $('libBody'); body.innerHTML = '';
  if (lib.view === 'albums') renderAlbums(body);
  else if (lib.view === 'settings') renderSettings(body);
  else renderGrid(body);
  const nav = $('libNav'); nav.innerHTML = '';
  for (const [v, label, ic] of [['all', 'Libreria', 'grid'], ['albums', 'Album', 'album'], ['settings', 'Impostazioni', 'gear']]) {
    const active = v === lib.view || (v === 'all' && VIEWS.some(x => x[0] === lib.view)) || (v === 'albums' && lib.view === 'album');
    const b = el('button', { className: 'navbtn' + (active ? ' on' : ''), onclick: () => { lib.view = v; lib.selecting = false; renderLibrary(); } });
    b.append(icon(ic), el('span', { textContent: label })); nav.append(b);
  }
  $('fab').hidden = lib.view === 'settings' || lib.selecting;
  renderSelBar();
}

function renderGrid(body) {
  if (lib.showSearch) {
    const s = el('input', { type: 'search', className: 'search', placeholder: 'Cerca: nome, parola chiave, fotocamera, anno, mese…', value: lib.query });
    s.oninput = () => { lib.query = s.value; fillGrid(); };
    body.append(s); setTimeout(() => s.focus(), 0);
  }
  if (lib.view !== 'album') body.append(chips(VIEWS.map(([v, t]) => [v, v === 'trash' && photos.some(p => p.trashed) ? `${t} (${photos.filter(p => p.trashed).length})` : t]), lib.view, v => { lib.view = v; lib.sel.clear(); renderLibrary(); }));
  if (lib.view === 'trash') body.append(note(`Le foto eliminate restano qui ${TRASH_DAYS} giorni, poi vengono cancellate definitivamente.`),
    photos.some(p => p.trashed) ? actions(btn('Svuota cestino', emptyTrash)) : null);
  if (lib.showFilters) {
    const f = lib.filter;
    body.append(el('div', { className: 'filters' },
      chips([[0, 'Tutte'], [1, '★1+'], [2, '★2+'], [3, '★3+'], [4, '★4+'], [5, '★5']], f.rating, v => { f.rating = +v; renderLibrary(); }),
      chips([['any', 'Qualsiasi'], ['pick', 'Scelte'], ['none', 'Senza contrassegno'], ['reject', 'Rifiutate']], f.flag, v => { f.flag = v; renderLibrary(); }),
      chips([['', 'Ogni etichetta'], ...Object.keys(LABELS).map(k => [k, '●'])], f.label, v => { f.label = v; renderLibrary(); }),
      actions(toggle('Solo RAW', () => f.raw, v => { f.raw = v; }, true), toggle('Solo modificate', () => f.edited, v => { f.edited = v; }, true)),
      el('div', { className: 'row' }, el('label', { textContent: 'Ordina per' }), (() => {
        const s = el('select');
        [['taken', 'Data di scatto'], ['added', 'Data di importazione'], ['name', 'Nome'], ['rating', 'Valutazione'], ['edited', 'Ultima modifica']]
          .forEach(([v, t]) => s.append(el('option', { value: v, textContent: t, selected: v === appSettings.sort })));
        s.onchange = () => { appSettings.sort = s.value; saveAppSettings(); fillGrid(); };
        return s;
      })(), btn(appSettings.dir < 0 ? '↓' : '↑', () => { appSettings.dir *= -1; saveAppSettings(); renderLibrary(); })),
      slider('Colonne', 2, 6, 1, () => appSettings.cols, v => { appSettings.cols = v; saveAppSettings(); fillGrid(); }, { neutral: 3 })));
    // le etichette colore dei chip
    body.querySelectorAll('.filters .chips')[2].querySelectorAll('button').forEach((b, i) => { if (i) b.style.color = Object.values(LABELS)[i - 1]; });
  }
  const grid = el('div', { id: 'grid' });
  body.append(grid, el('div', { id: 'libCount', className: 'note' }));
  fillGrid();
}

const thumbObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    thumbObserver.unobserve(e.target);
    loadThumb(e.target.dataset.id, e.target.querySelector('img'));
  }
}, { rootMargin: '300px' });

async function loadThumb(id, img) {
  let url = thumbUrls.get(id);
  if (!url) { const b = await DB.get('thumbs', id); if (!b) return; url = URL.createObjectURL(b); thumbUrls.set(id, url); }
  img.src = url;
}
function dropThumb(id) { const u = thumbUrls.get(id); if (u) URL.revokeObjectURL(u); thumbUrls.delete(id); }

function fillGrid() {
  const grid = $('grid'); if (!grid) return;
  grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${appSettings.cols}, 1fr)`;
  const list = visiblePhotos();
  for (const p of list) {
    const cell = el('div', { className: 'cell' + (lib.sel.has(p.id) ? ' sel' : '') });
    cell.dataset.id = p.id;
    cell.append(el('img', { alt: '', loading: 'lazy' }));
    const badges = el('div', { className: 'badges' });
    if (p.rating) badges.append(el('span', { textContent: '★' + p.rating }));
    if (p.flag === 1) badges.append(el('span', { textContent: '⚑' }));
    if (p.flag === -1) badges.append(el('span', { textContent: '✕' }));
    if (p.raw) badges.append(el('span', { textContent: 'RAW' }));
    cell.append(badges);
    if (isEdited(p.edits)) { const m = el('span', { className: 'edmark', title: 'Modificata' }); m.append(icon('edit', 14)); cell.append(m); }
    if (p.label) cell.append(el('i', { className: 'lbl', style: `background:${LABELS[p.label]}` }));
    cell.onclick = () => {
      if (lib.selecting) { lib.sel.has(p.id) ? lib.sel.delete(p.id) : lib.sel.add(p.id); cell.classList.toggle('sel'); renderSelBar(); }
      else openPhoto(p.id);
    };
    grid.append(cell);
    thumbObserver.observe(cell);
  }
  $('libCount').textContent = list.length ? `${list.length} foto` : lib.view === 'trash' ? 'Il cestino è vuoto.'
    : (livePhotos().length ? 'Nessuna foto con questi filtri.' : 'Nessuna foto: tocca + per importare dalla galleria, oppure condividi delle foto con l\'app dalla Galleria di Android.');
}

/* ---------- Selezione multipla e azioni in blocco ---------- */

const selected = () => photos.filter(p => lib.sel.has(p.id));
async function savePhotos(list) { for (const p of list) await DB.put('photos', p); }

function renderSelBar() {
  const bar = $('selBar'); bar.innerHTML = ''; bar.hidden = !lib.selecting;
  if (!lib.selecting) return;
  const n = lib.sel.size;
  if (lib.view === 'trash') {
    bar.append(el('span', { textContent: `${n} selezionate` }),
      btn('Tutte', () => { visiblePhotos().forEach(p => lib.sel.add(p.id)); fillGrid(); renderSelBar(); }),
      btn('Ripristina', () => n && restoreFromTrash(), 'primary'), btn('Elimina definitivamente', () => n && batchDelete()));
    return;
  }
  bar.append(el('span', { textContent: `${n} selezionate` }),
    btn('Tutte', () => { visiblePhotos().forEach(p => lib.sel.add(p.id)); fillGrid(); renderSelBar(); }),
    btn('★', () => n && batchRate()), btn('⚑', () => n && batchFlag()), btn('●', () => n && batchLabel()),
    btn('Parole chiave', () => n && batchKeywords()), btn('Album', () => n && batchAlbum()),
    btn('Preset', () => n && batchPreset()), btn('Incolla', () => n && batchPaste()),
    btn('Unisci HDR', () => batchMerge('hdr')), btn('Panorama', () => batchMerge('pano')),
    btn('Esporta', () => n && batchExport(), 'primary'), btn('Elimina', () => n && batchDelete()));
}

async function pickFrom(title, items) {
  const box = el('div', { className: 'checks one' }); let choice = null;
  items.forEach(([v, t]) => box.append(btn(t, () => { choice = v; box.closest('.modal-wrap').querySelector('.primary').click(); })));
  const r = await modal(title, box, ['Annulla']);
  return choice;
}

async function batchRate() { const r = await pickFrom('Valutazione', [[0, 'Nessuna'], [1, '★'], [2, '★★'], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']]); if (r == null) return; selected().forEach(p => { p.rating = r; }); await savePhotos(selected()); fillGrid(); }
async function batchFlag() { const r = await pickFrom('Contrassegno', [[1, '⚑ Scelta'], [0, 'Nessuno'], [-1, '✕ Rifiutata']]); if (r == null) return; selected().forEach(p => { p.flag = r; }); await savePhotos(selected()); fillGrid(); }
async function batchLabel() { const r = await pickFrom('Etichetta colore', [['', 'Nessuna'], ['red', 'Rossa'], ['yellow', 'Gialla'], ['green', 'Verde'], ['blue', 'Blu'], ['purple', 'Viola']]); if (r == null) return; selected().forEach(p => { p.label = r; }); await savePhotos(selected()); fillGrid(); }
async function batchKeywords() {
  const s = prompt('Parole chiave da aggiungere (separate da virgola). Scrivi -parola per toglierla.'); if (!s) return;
  const words = s.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
  for (const p of selected()) for (const w of words) {
    if (w.startsWith('-')) p.keywords = p.keywords.filter(k => k !== w.slice(1)); else if (!p.keywords.includes(w)) p.keywords.push(w);
  }
  await savePhotos(selected()); toast('Parole chiave aggiornate');
}
async function batchAlbum() {
  const r = await pickFrom('Aggiungi all\'album', [['__new', '+ Nuovo album'], ...albums.map(a => [a.id, a.name]), ...(lib.view === 'album' ? [['__remove', 'Togli da questo album']] : [])]);
  if (r == null) return;
  let id = r;
  if (r === '__new') { const name = prompt('Nome dell\'album'); if (!name) return; id = uid(); const a = { id, name, created: Date.now() }; albums.push(a); await DB.put('albums', a); }
  for (const p of selected()) {
    if (r === '__remove') p.albums = p.albums.filter(a => a !== lib.album); else if (!p.albums.includes(id)) p.albums.push(id);
  }
  await savePhotos(selected()); fillGrid(); toast('Album aggiornato');
}
async function rethumb(p) {
  const src = await photoSource(p, 1200);
  await DB.put('thumbs', await makeThumb(src.canvas, p.edits || defaults()), p.id); dropThumb(p.id);
}
async function batchPreset() {
  const entries = presetEntries();
  const r = await pickFrom('Applica preset', entries.map((e, i) => [i, `${e.cat} · ${e.name}`]));
  if (r == null) return;
  const e = entries[r], list = selected();
  for (const [i, p] of list.entries()) {
    libStatus(`Preset ${i + 1} di ${list.length}…`);
    const base = p.edits || defaults();
    let np;
    if (e.user) np = buildPreset(e.def, 1, base); else { np = buildPreset(e.def, 1); copyGroups(base, np, LOCAL_GROUPS); np.lutAmt = base.lutAmt; }
    p.edits = np; p.edited = Date.now(); await DB.put('photos', p); await rethumb(p);
  }
  libStatus(''); fillGrid(); toast('Preset applicato');
}
async function batchPaste() {
  if (!clipboard) { toast('Copia prima delle impostazioni da una foto (Preset → Copia impostazioni)'); return; }
  const list = selected();
  for (const [i, p] of list.entries()) {
    libStatus(`Incolla ${i + 1} di ${list.length}…`);
    p.edits = Object.assign(p.edits || defaults(), clone(clipboard.values)); p.edited = Date.now();
    await DB.put('photos', p); await rethumb(p);
  }
  libStatus(''); fillGrid(); toast('Impostazioni sincronizzate');
}
async function batchExport() {
  const list = selected(), files = [];
  for (const [i, p] of list.entries()) {
    libStatus(`Esportazione ${i + 1} di ${list.length}…`);
    await loadIntoEditor(p, false);
    files.push(await buildExport(params));
  }
  libStatus('');
  if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  for (const f of files) await saveFile(f);
}
async function batchDelete() {
  if (lib.view === 'trash') {
    if (!confirm(`Eliminare definitivamente ${lib.sel.size} foto? Non si potranno recuperare.`)) return;
    for (const p of selected()) await deletePhoto(p.id);
  } else {
    for (const p of selected()) { p.trashed = Date.now(); await DB.put('photos', p); }
    toast(`${lib.sel.size} foto spostate nel cestino`);
  }
  lib.sel.clear(); renderLibrary();
}
async function restoreFromTrash() {
  for (const p of selected()) { delete p.trashed; await DB.put('photos', p); }
  toast(`${lib.sel.size} foto ripristinate`); lib.sel.clear(); renderLibrary();
}
async function emptyTrash() {
  const list = photos.filter(p => p.trashed);
  if (!confirm(`Eliminare definitivamente ${list.length} foto?`)) return;
  for (const p of list) await deletePhoto(p.id);
  renderLibrary();
}
async function deletePhoto(id) {
  for (const s of ['photos', 'files', 'decoded', 'thumbs', 'depth']) await DB.del(s, id);
  photos = photos.filter(p => p.id !== id); dropThumb(id);
}

/* ---------- Album ---------- */

function renderAlbums(body) {
  body.append(actions(btn('+ Nuovo album', async () => {
    const name = prompt('Nome dell\'album'); if (!name) return;
    const a = { id: uid(), name, created: Date.now() }; albums.push(a); await DB.put('albums', a); renderLibrary();
  })));
  const grid = el('div', { className: 'albums' });
  for (const a of albums) {
    const inside = livePhotos().filter(p => p.albums.includes(a.id));
    const img = el('img', { alt: '' }), card = el('div', { className: 'albumcard' }, img, el('b', { textContent: a.name }), el('span', { textContent: `${inside.length} foto` }));
    if (inside[0]) loadThumb(inside[0].id, img);
    card.onclick = () => { lib.view = 'album'; lib.album = a.id; renderLibrary(); };
    card.oncontextmenu = async ev => {
      ev.preventDefault();
      const r = await modal(a.name, note('Album'), ['Annulla', 'Elimina album', 'Rinomina']);
      if (r === 2) { const n = prompt('Nuovo nome', a.name); if (n) { a.name = n; await DB.put('albums', a); } }
      if (r === 1 && confirm('Eliminare l\'album? Le foto restano nella libreria.')) {
        albums = albums.filter(x => x !== a); await DB.del('albums', a.id);
        for (const p of inside) { p.albums = p.albums.filter(x => x !== a.id); await DB.put('photos', p); }
      }
      renderLibrary();
    };
    grid.append(card);
  }
  body.append(grid, note(albums.length ? 'Tieni premuto un album per rinominarlo o eliminarlo.' : 'Nessun album.'));
}

/* ---------- Impostazioni ---------- */

async function renderSettings(body) {
  const sel = (label, items, get, set) => {
    const s = el('select');
    items.forEach(([v, t]) => s.append(el('option', { value: v, textContent: t, selected: String(v) === String(get()) })));
    s.onchange = () => set(s.value);
    return el('div', { className: 'row' }, el('label', { textContent: label }), s, el('span'));
  };
  body.append(section('Aspetto'),
    sel('Tema', [['dark', 'Scuro'], ['oled', 'Nero (OLED)'], ['light', 'Chiaro']], () => appSettings.theme, v => { appSettings.theme = v; saveAppSettings(); renderLibrary(); }),
    section('Importazione'),
    sel('Preset all\'importazione', [['', 'Nessuno'], ...presetEntries().map(e => [e.cat + '/' + e.name, `${e.cat} · ${e.name}`])], () => appSettings.importPreset, v => { appSettings.importPreset = v; saveAppSettings(); }),
    actions(toggle('Salta i duplicati', () => appSettings.skipDuplicates, v => { appSettings.skipDuplicates = v; saveAppSettings(); }, true),
      btn('Trova duplicati nella libreria', findDuplicates)),
    section('Backup'),
    note(appSettings.lastBackup ? `Ultimo backup: ${new Date(appSettings.lastBackup).toLocaleString('it-IT')}` : 'Nessun backup ancora. Le foto esistono solo dentro l\'app: fanne uno ogni tanto e salvalo su Google Drive o sul computer.'),
    actions(btn('Crea backup', () => createBackup().catch(e => { libStatus(''); alert('Backup: ' + e.message); }), 'primary'),
      btn('Ripristina da backup', () => $('fileBackup').click())),
    note('Il backup contiene originali, modifiche, versioni, album, preset personali e impostazioni (non la chiave API).'),
    section('Galleria'),
    note('Per aprire foto direttamente dalla Galleria: seleziona le foto nella Galleria, tocca Condividi e scegli Luce Stanza (dopo aver installato l\'app dal menu di Chrome).'),
    section('Esportazione'),
    actions(btn('Usa le impostazioni di esportazione attuali come predefinite', () => {
      const o = { ...exportOpts, wmImage: null }; try { localStorage.setItem('exportOpts', JSON.stringify(o)); toast('Salvate'); } catch { /* spazio pieno */ }
    })),
    section('AI'),
    el('div', { className: 'row' }, el('label', { textContent: 'Chiave API Claude' }),
      Object.assign(el('input', { type: 'password', className: 'num', value: aiSettings.apiKey, placeholder: 'sk-ant-…' }), { onchange: e => { aiSettings.apiKey = e.target.value.trim(); saveAiSettings(); } }), el('span')),
    sel('Modello', [['claude-opus-5-5', 'Claude Opus 5.5 (predefinito)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (economico)']],
      () => aiSettings.model, v => { aiSettings.model = v; saveAiSettings(); }),
    sel('Accuratezza', [['low', 'Bassa (più veloce)'], ['medium', 'Media'], ['high', 'Alta']], () => aiSettings.effort, v => { aiSettings.effort = v; saveAiSettings(); }),
    note('La chiave resta solo su questo telefono. Senza chiave il "Look AI" usa il motore offline a parole chiave. Ogni richiesta a Claude ha un piccolo costo sul tuo account Anthropic.'),
    section('Archivio'));
  const info = el('div', { className: 'note', textContent: 'Calcolo spazio…' });
  body.append(info, actions(
    btn('Mantieni i dati in modo permanente', async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Archivio protetto dalla pulizia automatica' : 'Il browser non lo ha concesso'); renderLibrary(); }),
    btn('Rigenera miniature', async () => { for (const [i, p] of photos.entries()) { libStatus(`Miniature ${i + 1}/${photos.length}`); await rethumb(p); } libStatus(''); toast('Fatto'); }),
    btn('Elimina modelli AI scaricati', async () => { await caches.delete('transformers-cache'); toast('Modelli rimossi: verranno riscaricati al prossimo uso'); })),
    section('Informazioni'), note('Luce Stanza · editor fotografico personale. Elaborazione sul telefono; nessun dato inviato tranne le richieste a Claude, se configurate.'));
  const s = await storageInfo();
  info.textContent = (s ? `Spazio usato: ${fmtBytes(s.used)} su ${fmtBytes(s.quota)} disponibili · ${s.persisted ? 'archivio permanente' : 'archivio non permanente'} · ` : '') + `${livePhotos().length} foto`;
}

async function findDuplicates() {
  const groups = {};
  for (const p of livePhotos()) (groups[p.hash] ||= []).push(p);
  const dups = Object.values(groups).filter(g => g.length > 1);
  if (!dups.length) { toast('Nessun duplicato trovato'); return; }
  const extra = dups.flatMap(g => g.slice(1));
  const r = await modal('Duplicati', note(`${dups.length} gruppi, ${extra.length} copie in più (${dups.map(g => g[0].name).slice(0, 5).join(', ')}${dups.length > 5 ? '…' : ''}).`), ['Annulla', 'Seleziona le copie', 'Elimina le copie']);
  if (r === 1) { lib.view = 'all'; lib.selecting = true; lib.sel = new Set(extra.map(p => p.id)); renderLibrary(); }
  if (r === 2) { for (const p of extra) { p.trashed = Date.now(); await DB.put('photos', p); } toast(`${extra.length} copie spostate nel cestino`); renderLibrary(); }
}

/* ---------- Avvio libreria ---------- */

async function initLibrary() {
  libEngine = new Engine(document.createElement('canvas'));
  try { Object.assign(exportOpts, JSON.parse(localStorage.getItem('exportOpts') || '{}')); } catch { /* nessuna preferenza */ }
  photos = await DB.all('photos'); albums = await DB.all('albums');
  for (const p of photos.filter(p => p.trashed && Date.now() - p.trashed > TRASH_DAYS * 864e5)) await deletePhoto(p.id);
  $('fileBackup').onchange = e => {
    const f = [...e.target.files]; e.target.value = '';
    if (f.length) restoreBackup(f).catch(err => { libStatus(''); alert('Ripristino: ' + err.message); });
  };
  albums.sort((a, b) => a.created - b.created);
  renderLibrary();
  await importInbox();
}
