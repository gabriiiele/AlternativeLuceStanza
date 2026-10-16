'use strict';

/* ---------- Parametri ---------- */

const HSL_BANDS = [
  ['Rossi', '#e53935'], ['Arancio', '#fb8c00'], ['Gialli', '#fdd835'], ['Verdi', '#43a047'],
  ['Azzurri', '#00acc1'], ['Blu', '#1e88e5'], ['Viola', '#8e24aa'], ['Magenta', '#d81b60'],
];

const HUE_BG = 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';

// [chiave, etichetta, min, max, passo, (sfondo)]
const TABS = {
  Luce: [
    ['exp', 'Esposizione', -3, 3, 0.01], ['contrast', 'Contrasto', -1, 1, 0.01],
    ['hi', 'Alteluci', -1, 1, 0.01], ['sh', 'Ombre', -1, 1, 0.01],
    ['wh', 'Bianchi', -1, 1, 0.01], ['bl', 'Neri', -1, 1, 0.01],
    ['clarity', 'Chiarezza', -1, 1, 0.01], ['texture', 'Texture', -1, 1, 0.01],
    ['dehaze', 'Foschia', -1, 1, 0.01],
  ],
  Colore: [
    ['temp', 'Temperatura', -1, 1, 0.01], ['tint', 'Tinta', -1, 1, 0.01],
    ['vib', 'Vividezza', -1, 1, 0.01], ['sat', 'Saturazione', -1, 1, 0.01],
    ['fade', 'Dissolvenza', 0, 1, 0.01],
  ],
  Gradazione: [
    ['gsH', 'Ombre: tinta', 0, 360, 1, HUE_BG], ['gsS', 'Ombre: forza', 0, 1, 0.01],
    ['gmH', 'Medi: tinta', 0, 360, 1, HUE_BG], ['gmS', 'Medi: forza', 0, 1, 0.01],
    ['ghH', 'Luci: tinta', 0, 360, 1, HUE_BG], ['ghS', 'Luci: forza', 0, 1, 0.01],
    ['gBal', 'Bilanciamento', -1, 1, 0.01],
  ],
  Dettaglio: [
    ['sharp', 'Nitidezza', 0, 2, 0.01], ['denoise', 'Riduz. rumore', 0, 1, 0.01],
  ],
  Effetti: [
    ['vig', 'Vignettatura', -1, 1, 0.01], ['vigMid', 'Vign. centro', 0, 1, 0.01], ['vigFeather', 'Vign. sfumata', 0, 1, 0.01],
    ['grain', 'Grana', 0, 1, 0.01], ['grainSize', 'Grana: dim.', 0.5, 3, 0.01],
    ['glow', 'Bagliore', 0, 1, 0.01], ['halation', 'Alone (halation)', 0, 1, 0.01],
    ['ca', 'Aberr. cromatica', 0, 1, 0.01],
  ],
};
const TAB_ORDER = ['Preset', 'Luce', 'Colore', 'Gradazione', 'B&N', 'HSL', 'Curva', 'Dettaglio', 'Effetti', 'Geometria', 'Maschere', 'LUT', 'Esporta'];

const defMask = () => ({ type: 0, x: 0.5, y: 0.5, angle: 0, size: 0.4, feather: 0.5, ratio: 1, invert: 0,
  exp: 0, contrast: 0, hi: 0, sh: 0, temp: 0, tint: 0, sat: 0 });
const IDENT = () => [[0, 0], [1, 1]];

const defaults = () => ({
  exp: 0, contrast: 0, hi: 0, sh: 0, wh: 0, bl: 0, clarity: 0, texture: 0, dehaze: 0,
  temp: 0, tint: 0, vib: 0, sat: 0, fade: 0, mono: 0,
  gsH: 210, gsS: 0, gmH: 40, gmS: 0, ghH: 40, ghS: 0, gBal: 0,
  sharp: 0, denoise: 0,
  vig: 0, vigMid: 0.4, vigFeather: 0.5, grain: 0, grainSize: 1, glow: 0, halation: 0, ca: 0,
  lutAmt: 1,
  hsl: new Array(24).fill(0), bwm: new Array(8).fill(0),
  curve: IDENT(), cr: IDENT(), cg: IDENT(), cb: IDENT(),
  geo: { aspect: 'orig', zoom: 1, angle: 0, rot: 0, fx: 0, fy: 0 },
  masks: [defMask(), defMask()],
});

const clone = o => JSON.parse(JSON.stringify(o));

/* Costruisce i parametri di un preset; amt = intensità (0..1.5) */
function lerpCurve(pts, amt) {
  if (amt === 1) return clone(pts);
  const lut = curveLUT(pts);
  return [0, 0.25, 0.5, 0.75, 1].map(x => [x, x + (lut[Math.round(x * 255)] - x) * amt]);
}
function buildPreset(def, amt = 1) {
  const out = defaults(), d0 = defaults();
  for (const [k, v] of Object.entries(def)) {
    if (k === 'hsl') for (const i in v) for (let j = 0; j < 3; j++) out.hsl[i * 3 + j] = v[i][j] * amt;
    else if (k === 'bw') for (const i in v) out.bwm[i] = v[i] * amt;
    else if (k === 'curve' || k === 'cr' || k === 'cg' || k === 'cb') out[k] = lerpCurve(v, amt);
    else if (typeof v === 'number' && typeof d0[k] === 'number')
      out[k] = /H$/.test(k) ? v : d0[k] + (v - d0[k]) * amt;
  }
  return out;
}

let params = defaults();
const history = { undo: [], redo: [] };

/* ---------- Stato ---------- */

const $ = id => document.getElementById(id);
let engine, thumbEngine, loaded = false, bandIdx = 0, maskIdx = 0, curTab = 'Preset', comparing = false;
let fileName = 'foto', lutName = '', curPreset = null, presetAmt = 1, presetCat = 'Tutti', presetQuery = '';
let clipboard = null, srcSmall = null;
const view = { scale: 1, x: 0, y: 0 };
const exportOpts = { fmt: 'image/jpeg', quality: 0.95, maxSide: 0 };

const userPresets = () => { try { return JSON.parse(localStorage.getItem('presets') || '{}'); } catch { return {}; } };

/* ---------- Disegno ---------- */

function viewSize() {
  const st = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const [ow, oh] = engine.outputSize(params);
  const s = Math.min(st.width / ow, st.height / oh);
  const cssW = ow * s, k = Math.min(1, (cssW * dpr * Math.max(1, view.scale)) / ow, 4096 / Math.max(ow, oh));
  return [Math.max(1, Math.round(ow * k)), Math.max(1, Math.round(oh * k)), ow * s, oh * s];
}

let raf = 0;
function redraw() {
  if (!loaded || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const [w, h, cw, ch] = viewSize();
    let p = params;
    if (comparing) { p = defaults(); p.geo = params.geo; }
    engine.render(p, w, h);
    const cv = $('view');
    cv.style.width = Math.round(cw) + 'px'; cv.style.height = Math.round(ch) + 'px';
    applyView();
    drawHistogram();
  });
}

function applyView() { $('view').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; }

const hctx = () => $('hist').getContext('2d');
const hbuf = document.createElement('canvas'); hbuf.width = 96; hbuf.height = 64;
function drawHistogram() {
  const c = $('hist'), ctx = hctx(), b = hbuf.getContext('2d', { willReadFrequently: true });
  b.drawImage($('view'), 0, 0, 96, 64);
  const d = b.getImageData(0, 0, 96, 64).data, bins = [new Array(48).fill(0), new Array(48).fill(0), new Array(48).fill(0)];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) bins[k][d[i + k] >> 2 >> 1]++;
  const mx = Math.max(1, ...bins.flat().map(v => v)) * 0.6;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  ['#f33', '#3f3', '#38f'].forEach((col, k) => {
    ctx.fillStyle = col;
    bins[k].forEach((v, i) => { const h = Math.min(1, v / mx) * c.height; ctx.fillRect(i * 2.5, c.height - h, 2.5, h); });
  });
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------- Annulla / ripeti ---------- */

function commit() {
  history.undo.push(clone(params));
  if (history.undo.length > 100) history.undo.shift();
  history.redo.length = 0;
  syncButtons();
}
function syncButtons() {
  $('btnUndo').disabled = !history.undo.length;
  $('btnRedo').disabled = !history.redo.length;
  for (const id of ['btnCompare', 'btnExport']) $(id).disabled = !loaded;
}
function applyState(s) { params = clone(s); renderPanel(); redraw(); syncButtons(); }

/* ---------- Componenti dell'interfaccia ---------- */

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const fmtVal = (v, step) => (step >= 1 ? String(Math.round(v)) : (+v).toFixed(2));

function slider(label, min, max, step, get, set, bg, neutral = 0) {
  const inp = el('input', { type: 'range', min, max, step, value: get() });
  if (bg) inp.style.background = bg;
  const out = el('output', { textContent: fmtVal(get(), step) });
  let before = null;
  inp.addEventListener('pointerdown', () => { before = clone(params); });
  inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmtVal(inp.value, step); redraw(); });
  inp.addEventListener('change', () => {
    if (before) { history.undo.push(before); history.redo.length = 0; before = null; syncButtons(); }
  });
  inp.addEventListener('dblclick', () => {             // doppio tocco = valore neutro
    commit(); set(neutral); inp.value = neutral; out.textContent = fmtVal(neutral, step); redraw();
  });
  return el('div', { className: 'row' }, el('label', { textContent: label }), inp, out);
}

const btn = (text, onclick, cls = '') => el('button', { textContent: text, onclick, className: cls });
const actions = (...b) => el('div', { className: 'actions' }, ...b);

function renderTabs() {
  const nav = $('tabs'); nav.innerHTML = '';
  for (const name of TAB_ORDER)
    nav.append(el('button', { textContent: name, className: name === curTab ? 'on' : '',
      onclick: () => { curTab = name; renderTabs(); renderPanel(); } }));
  nav.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderPanel() {
  const panel = $('panel'); panel.innerHTML = '';
  if (TABS[curTab]) {
    for (const [k, label, min, max, step, bg] of TABS[curTab]) {
      const neutral = defaults()[k];
      panel.append(slider(label, min, max, step, () => params[k], v => { params[k] = v; }, bg, neutral));
    }
    if (curTab === 'Luce') panel.append(actions(btn('Auto', autoTone)));
  } else ({
    'B&N': renderBW, HSL: renderHSL, Curva: renderCurve, Geometria: renderGeo, Maschere: renderMasks,
    LUT: renderLut, Preset: renderPresets, Esporta: renderExport,
  })[curTab](panel);
}

/* Bianco e nero */
function renderBW(panel) {
  panel.append(slider('Bianco e nero', 0, 1, 0.01, () => params.mono, v => { params.mono = v; }));
  HSL_BANDS.forEach(([name], i) =>
    panel.append(slider('Mix ' + name.toLowerCase(), -1, 1, 0.01, () => params.bwm[i], v => { params.bwm[i] = v; },
      `linear-gradient(90deg,#000,${HSL_BANDS[i][1]})`)));
}

/* HSL */
function renderHSL(panel) {
  const chips = el('div', { className: 'chips' });
  HSL_BANDS.forEach(([name, col], i) => chips.append(el('button', {
    className: 'chip' + (i === bandIdx ? ' on' : ''), title: name, style: `background:${col}`,
    onclick: () => { bandIdx = i; renderPanel(); } })));
  panel.append(chips);
  ['Tonalità', 'Saturazione', 'Luminanza'].forEach((label, j) =>
    panel.append(slider(label, -1, 1, 0.01, () => params.hsl[bandIdx * 3 + j], v => { params.hsl[bandIdx * 3 + j] = v; })));
}

/* Curve: generale, rosso, verde, blu */
let curveCh = 'curve';
function renderCurve(panel) {
  const chans = [['curve', 'RGB', '#4da3ff'], ['cr', 'R', '#ff5252'], ['cg', 'G', '#4caf50'], ['cb', 'B', '#448aff']];
  const chips = el('div', { className: 'chips' });
  for (const [k, n] of chans) chips.append(btn(n, () => { curveCh = k; renderPanel(); }, k === curveCh ? 'on' : ''));
  const col = chans.find(c => c[0] === curveCh)[2];
  const cv = el('canvas', { id: 'curve', width: 260, height: 260 });
  const ctx = cv.getContext('2d');
  let drag = -1, before = null;
  const pts = () => params[curveCh];
  const draw = () => {
    ctx.clearRect(0, 0, 260, 260);
    ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 65, 0); ctx.lineTo(i * 65, 260); ctx.moveTo(0, i * 65); ctx.lineTo(260, i * 65); ctx.stroke();
    }
    const lut = curveLUT(pts());
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) ctx[i ? 'lineTo' : 'moveTo'](i / 255 * 260, 260 - lut[i] * 260);
    ctx.stroke(); ctx.fillStyle = '#fff';
    for (const [x, y] of pts()) { ctx.beginPath(); ctx.arc(x * 260, 260 - y * 260, 6, 0, 7); ctx.fill(); }
  };
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  const near = (x, y) => pts().findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.07);
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); before = clone(params);
    const [x, y] = pos(e); drag = near(x, y);
    if (drag < 0) { pts().push([x, y]); pts().sort((a, b) => a[0] - b[0]); drag = pts().findIndex(p => p[0] === x); }
    draw(); redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const [x, y] = pos(e), P = pts();
    if (drag > 0 && drag < P.length - 1) P[drag][0] = Math.min(P[drag + 1][0] - 0.02, Math.max(P[drag - 1][0] + 0.02, x));
    P[drag][1] = y; draw(); redraw();
  });
  cv.addEventListener('pointerup', () => {
    if (drag >= 0 && before) { history.undo.push(before); history.redo.length = 0; syncButtons(); }
    drag = -1; before = null;
  });
  cv.addEventListener('dblclick', e => {
    const i = near(...pos(e));
    if (i > 0 && i < pts().length - 1) { commit(); pts().splice(i, 1); draw(); redraw(); }
  });
  panel.append(chips, cv, actions(btn('Azzera questa curva', () => { commit(); params[curveCh] = IDENT(); draw(); redraw(); })));
  draw();
}

/* Geometria */
function renderGeo(panel) {
  const g = () => params.geo;
  const chips = el('div', { className: 'chips' });
  for (const a of Object.keys(ASPECTS))
    chips.append(btn(a === 'orig' ? 'Originale' : a, () => { commit(); g().aspect = a; renderPanel(); redraw(); }, g().aspect === a ? 'on' : ''));
  panel.append(chips,
    slider('Raddrizza', -45, 45, 0.1, () => g().angle, v => { g().angle = v; }),
    slider('Zoom', 1, 4, 0.01, () => g().zoom, v => { g().zoom = v; }, null, 1),
    actions(
      btn('⟲ 90°', () => { commit(); g().rot = (g().rot + 3) % 4; redraw(); }),
      btn('⟳ 90°', () => { commit(); g().rot = (g().rot + 1) % 4; redraw(); }),
      btn('Specchia ↔', () => { commit(); g().fx ^= 1; redraw(); }),
      btn('Specchia ↕', () => { commit(); g().fy ^= 1; redraw(); }),
      btn('Azzera', () => { commit(); params.geo = defaults().geo; renderPanel(); redraw(); })));
}

/* Maschere locali */
function renderMasks(panel) {
  const m = () => params.masks[maskIdx];
  const chips = el('div', { className: 'chips' });
  params.masks.forEach((_, i) => chips.append(btn('Maschera ' + (i + 1), () => { maskIdx = i; renderPanel(); }, i === maskIdx ? 'on' : '')));
  const types = el('div', { className: 'chips' });
  ['Spenta', 'Lineare', 'Radiale'].forEach((n, t) =>
    types.append(btn(n, () => { commit(); m().type = t; renderPanel(); redraw(); }, m().type === t ? 'on' : '')));
  panel.append(chips, types);
  if (!m().type) return;
  const S = (label, k, min, max, step = 0.01, neutral = 0) => panel.append(slider(label, min, max, step, () => m()[k], v => { m()[k] = v; }, null, neutral));
  S('Posizione X', 'x', 0, 1, 0.01, 0.5); S('Posizione Y', 'y', 0, 1, 0.01, 0.5);
  S('Angolo', 'angle', -180, 180, 1);
  if (m().type === 2) { S('Raggio', 'size', 0.05, 1.5, 0.01, 0.4); S('Forma', 'ratio', 0.3, 3, 0.01, 1); }
  S('Sfumatura', 'feather', 0.02, 1, 0.01, 0.5);
  panel.append(actions(btn('Inverti', () => { commit(); m().invert ^= 1; redraw(); renderPanel(); }, m().invert ? 'on' : '')));
  [['Esposizione', 'exp', -3, 3], ['Contrasto', 'contrast', -1, 1], ['Alteluci', 'hi', -1, 1], ['Ombre', 'sh', -1, 1],
    ['Temperatura', 'temp', -1, 1], ['Tinta', 'tint', -1, 1], ['Saturazione', 'sat', -1, 1]].forEach(a => S(...a));
  panel.append(actions(btn('Azzera maschera', () => { commit(); params.masks[maskIdx] = defMask(); renderPanel(); redraw(); })));
}

/* LUT */
function renderLut(panel) {
  panel.append(
    el('p', { className: 'note', textContent: lutName ? `LUT attiva: ${lutName}` : 'Carica un file .cube (LUT 3D) per applicare un look esterno.' }),
    actions(btn('Carica LUT .cube', () => $('fileLut').click()), btn('Rimuovi LUT', () => { engine.clearLut(); lutName = ''; renderPanel(); redraw(); })),
    slider('Intensità LUT', 0, 1, 0.01, () => params.lutAmt, v => { params.lutAmt = v; }, null, 1));
}

/* Esportazione */
function renderExport(panel) {
  const sel = (label, opts, get, set) => {
    const s = el('select');
    opts.forEach(([v, t]) => s.append(el('option', { value: v, textContent: t, selected: String(v) === String(get()) })));
    s.onchange = () => set(s.value);
    return el('div', { className: 'row' }, el('label', { textContent: label }), s, el('span'));
  };
  panel.append(
    sel('Formato', [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']], () => exportOpts.fmt, v => { exportOpts.fmt = v; }),
    sel('Lato lungo', [[0, 'Originale'], [4096, '4096 px'], [2048, '2048 px'], [1080, '1080 px']], () => exportOpts.maxSide, v => { exportOpts.maxSide = +v; }),
    slider('Qualità', 0.5, 1, 0.01, () => exportOpts.quality, v => { exportOpts.quality = v; }, null, 0.95),
    actions(btn('Esporta ora', exportImage, 'primary')));
}

/* Preset */
function currentDefList() {
  const all = [...PRESET_DEFS, ...Object.entries(userPresets()).map(([name, def]) => ({ cat: 'Miei', name, def, user: true }))];
  const q = presetQuery.trim().toLowerCase();
  return all.filter(p => (presetCat === 'Tutti' || p.cat === presetCat) && (!q || p.name.toLowerCase().includes(q)));
}

function applyPreset(entry, amt) {
  const np = entry.user ? clone(entry.def) : buildPreset(entry.def, amt);
  if (entry.user) Object.assign(np, { ...defaults(), ...np });
  np.geo = params.geo; np.masks = params.masks; np.lutAmt = params.lutAmt;
  params = np;
}

const thumbCache = new Map();
function makeThumb(entry) {
  const key = entry.cat + entry.name + (entry.user ? JSON.stringify(entry.def).length : '');
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = entry.user ? { ...defaults(), ...clone(entry.def) } : buildPreset(entry.def, 1);
  p.geo = { aspect: '4:3', zoom: 1, angle: 0, rot: 0, fx: 0, fy: 0 };
  thumbEngine.render(p, 160, 120);
  const url = thumbEngine.canvas.toDataURL('image/jpeg', 0.7);
  thumbCache.set(key, url);
  return url;
}

function renderPresets(panel) {
  const search = el('input', { type: 'search', placeholder: 'Cerca un preset…', value: presetQuery, className: 'search' });
  const cats = el('div', { className: 'chips' });
  const grid = el('div', { className: 'presets' });
  const catNames = ['Tutti', ...PRESET_CATEGORIES, ...(Object.keys(userPresets()).length ? ['Miei'] : [])];
  for (const c of catNames) cats.append(btn(c, () => { presetCat = c; renderPanel(); }, c === presetCat ? 'on' : ''));

  const fill = () => {
    grid.innerHTML = '';
    const list = currentDefList();
    if (!list.length) grid.append(el('p', { className: 'note', textContent: 'Nessun preset trovato.' }));
    list.forEach((entry, i) => {
      const card = el('button', { className: 'preset' + (curPreset && curPreset.name === entry.name ? ' on' : '') });
      const img = el('img', { alt: '' }); card.append(img, el('span', { textContent: entry.name }));
      card.onclick = () => {
        if (!loaded) return;
        commit(); curPreset = entry; applyPreset(entry, presetAmt); redraw();
        grid.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); card.classList.add('on');
      };
      grid.append(card);
      if (loaded) setTimeout(() => { img.src = makeThumb(entry); }, 0);   // anteprime una alla volta, senza bloccare
    });
  };

  search.oninput = () => { presetQuery = search.value; fill(); };
  const amt = slider('Intensità', 0, 1.5, 0.01, () => presetAmt, v => {
    presetAmt = v;
    if (curPreset && !curPreset.user) { const keep = [params.geo, params.masks, params.lutAmt]; params = buildPreset(curPreset.def, v); [params.geo, params.masks, params.lutAmt] = keep; }
  }, null, 1);
  panel.append(search, cats, amt, grid, actions(
    btn('Salva come preset', () => {
      const name = prompt('Nome del preset?'); if (!name) return;
      const u = userPresets(); const p = clone(params); delete p.geo; delete p.masks; u[name] = p;
      try { localStorage.setItem('presets', JSON.stringify(u)); } catch {}
      presetCat = 'Miei'; renderPanel();
    }),
    btn('Copia impostazioni', () => { clipboard = clone(params); }),
    btn('Incolla impostazioni', () => { if (!clipboard) return; commit(); const g = params.geo, m = params.masks; params = clone(clipboard); params.geo = g; params.masks = m; renderPanel(); redraw(); }),
    btn('Azzera tutto', () => { commit(); params = defaults(); curPreset = null; renderPanel(); redraw(); })));
  fill();
}

/* Regolazione automatica */
function autoTone() {
  if (!loaded) return;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(srcSmall, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data, L = [];
  for (let i = 0; i < d.length; i += 4) L.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
  L.sort((a, b) => a - b);
  const mean = L.reduce((a, b) => a + b, 0) / L.length, p1 = L[Math.floor(L.length * 0.01)], p99 = L[Math.floor(L.length * 0.99)];
  commit();
  params.exp = Math.max(-1.5, Math.min(1.5, (0.45 - mean) * 3));
  params.bl = -Math.min(1, p1 / 0.15 * 0.5);
  params.wh = Math.max(0, Math.min(1, (1 - p99) / 0.15 * 0.5));
  params.contrast = 0.1; params.vib = 0.15;
  renderPanel(); redraw();
}

/* ---------- Caricamento ed esportazione ---------- */

async function openFile(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { alert('Formato non supportato dal browser (i RAW arriveranno in una versione successiva).'); return; }
  fileName = file.name.replace(/\.[^.]+$/, '');
  const fit = (max) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    if (k === 1) return [bmp, w, h];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return [c, w, h];
  };
  const [src, w, h] = fit(engine.maxSize);
  engine.setImage(src, w, h);
  const [ts, tw, th] = fit(256);
  thumbEngine.setImage(ts, tw, th); thumbCache.clear();
  srcSmall = ts;
  loaded = true; params = defaults(); curPreset = null;
  history.undo.length = history.redo.length = 0;
  view.scale = 1; view.x = view.y = 0;
  $('empty').hidden = true; $('hist').hidden = false;
  renderPanel(); syncButtons(); redraw();
}

function exportImage() {
  if (!loaded) return;
  let [w, h] = engine.outputSize(params);
  const k = exportOpts.maxSide ? Math.min(1, exportOpts.maxSide / Math.max(w, h)) : 1;
  w = Math.round(w * k); h = Math.round(h * k);
  engine.render(params, w, h);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[exportOpts.fmt];
  $('view').toBlob(async blob => {
    const f = new File([blob], `${fileName}-luce.${ext}`, { type: exportOpts.fmt });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f] }); redraw(); return; } catch { /* annullato: scarico */ }
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: f.name }); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    redraw();
  }, exportOpts.fmt, exportOpts.quality);
}

async function openLut(file) {
  try {
    const { data, n } = parseCube(await file.text());
    engine.setLut(data, n); lutName = file.name; params.lutAmt = 1;
    renderPanel(); redraw();
  } catch (e) { alert(e.message); }
}

/* ---------- Zoom e spostamento dell'anteprima ---------- */

function setupGestures() {
  const st = $('stage'), ptrs = new Map();
  let lastDist = 0, lastMid = null;
  const clampView = () => {
    if (view.scale <= 1) { view.scale = 1; view.x = view.y = 0; return; }
    const r = st.getBoundingClientRect(), mx = r.width * (view.scale - 1) / 2, my = r.height * (view.scale - 1) / 2;
    view.x = Math.max(-mx, Math.min(mx, view.x)); view.y = Math.max(-my, Math.min(my, view.y));
  };
  const update = () => { clampView(); applyView(); redraw(); };
  st.addEventListener('pointerdown', e => { if (e.target === $('hist')) return; st.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); lastDist = 0; });
  st.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1 && view.scale > 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; update(); }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastDist) { view.scale = Math.max(1, Math.min(8, view.scale * dist / lastDist)); update(); }
      lastDist = dist;
    }
  });
  const end = e => { ptrs.delete(e.pointerId); lastDist = 0; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', e => { e.preventDefault(); view.scale = Math.max(1, Math.min(8, view.scale * (e.deltaY < 0 ? 1.15 : 0.87))); update(); }, { passive: false });
  st.addEventListener('dblclick', () => { view.scale = view.scale > 1 ? 1 : 2.5; if (view.scale === 1) view.x = view.y = 0; update(); });
}

/* ---------- Avvio ---------- */

window.addEventListener('DOMContentLoaded', () => {
  try {
    engine = new Engine($('view'));
    thumbEngine = new Engine(document.createElement('canvas'));
  } catch (e) { $('empty').textContent = e.message; return; }
  renderTabs(); renderPanel(); syncButtons(); setupGestures();
  $('btnOpen').onclick = () => $('file').click();
  $('file').onchange = e => e.target.files[0] && openFile(e.target.files[0]);
  $('fileLut').onchange = e => e.target.files[0] && openLut(e.target.files[0]);
  $('btnUndo').onclick = () => { if (history.undo.length) { history.redo.push(clone(params)); applyState(history.undo.pop()); } };
  $('btnRedo').onclick = () => { if (history.redo.length) { history.undo.push(clone(params)); applyState(history.redo.pop()); } };
  $('btnExport').onclick = exportImage;
  const cmp = $('btnCompare');
  const setCmp = v => { comparing = v; cmp.classList.toggle('on', v); redraw(); };
  cmp.addEventListener('pointerdown', () => setCmp(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => setCmp(false));
  window.addEventListener('resize', redraw);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
});
