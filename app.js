'use strict';

/* Interfaccia: pannelli, cronologia, preset, versioni, esportazione. */

const HSL_BANDS = [
  ['Rosso', '#e53935'], ['Arancione', '#fb8c00'], ['Giallo', '#fdd835'], ['Verde', '#43a047'],
  ['Acquamarina', '#00acc1'], ['Blu', '#1e88e5'], ['Viola', '#8e24aa'], ['Magenta', '#d81b60'],
];
const HUE_BG = 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
const BG = {
  temp: 'linear-gradient(90deg,#3b7bff,#ddd,#ffb03b)', tint: 'linear-gradient(90deg,#3bd36b,#ddd,#e04bd8)',
  sat: 'linear-gradient(90deg,#888,#f44)', exp: 'linear-gradient(90deg,#000,#fff)',
};

const TAB_ORDER = ['Preset', 'Profili', 'Luce', 'Curva', 'Colore', 'Mixer', 'Colore punto', 'Gradazione', 'B&N', 'Effetti',
  'Dettagli', 'Ottica', 'Ritaglio', 'Trasforma', 'Sfocatura', 'Maschere', 'Ritocco', 'Calibrazione', 'LUT',
  'Versioni', 'Cronologia', 'Info', 'Esporta'];

const $ = id => document.getElementById(id);
let params = defaults();
let engine, thumbEngine, loaded = false, curTab = 'Preset', comparing = false;
let fileName = 'foto', lutName = '', exifData = { app1: null, tags: {} };
let bandIdx = 0, hslMode = 'color', curveMode = 'point', curveCh = 'curve', gradeZone = 'all';
let maskIdx = 0, compIdx = 0, overlayOn = true, overlayCol = [1, 0.2, 0.2, 0.5], brushMode = false;
let pcIdx = 0, pcShowRange = false, guidedOn = false;
let curPreset = null, presetAmt = 1, presetCat = 'Tutti', presetQuery = '', presetManage = false, profGroup = 'Base';
let clipboard = null, versions = [];
const view = { scale: 1, x: 0, y: 0 };

/* ---------- Utilità interfaccia ---------- */

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter(k => k != null));
  return e;
}
const btn = (text, onclick, cls = '') => el('button', { textContent: text, onclick, className: cls });
const actions = (...b) => el('div', { className: 'actions' }, ...b);
const chips = (items, cur, onPick) => {
  const c = el('div', { className: 'chips' });
  for (const [val, label] of items) c.append(btn(label, () => onPick(val), String(val) === String(cur) ? 'on' : ''));
  return c;
};
const section = title => el('h3', { className: 'sec', textContent: title });
const note = text => el('p', { className: 'note', textContent: text });

function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}

const fmtVal = (v, step) => (step >= 1 ? String(Math.round(v)) : (+v).toFixed(2));

/* Slider con cronologia; doppio tocco = valore neutro */
function slider(label, min, max, step, get, set, o = {}) {
  const neutral = o.neutral ?? 0;
  const inp = el('input', { type: 'range', min, max, step, value: get() });
  if (o.bg) { inp.style.background = o.bg; inp.classList.add('grad'); }
  const out = el('output', { textContent: fmtVal(get(), step) });
  let before = null;
  inp.addEventListener('pointerdown', () => { before = clone(params); });
  inp.addEventListener('input', () => { set(+inp.value); out.textContent = fmtVal(inp.value, step); o.onInput?.(); redraw(); });
  inp.addEventListener('change', () => {
    if (before) { pushHistory(label, before); before = null; }
  });
  inp.addEventListener('dblclick', () => {
    commit(label); set(neutral); inp.value = neutral; out.textContent = fmtVal(neutral, step); o.onInput?.(); redraw();
  });
  return el('div', { className: 'row' }, el('label', { textContent: label }), inp, out);
}
/* Slider legato a una chiave di params */
const S = (k, label, min, max, step = 0.01, o = {}) =>
  slider(label, min, max, step, () => params[k], v => { params[k] = v; }, { neutral: defaults()[k], bg: BG[k], ...o });

/* ui = true: interruttore dell'interfaccia, non entra nella cronologia */
function toggle(label, get, set, ui = false) {
  return btn(label, () => { if (!ui) commit(label); set(!get()); renderPanel(); }, get() ? 'on' : '');
}

/* Finestra modale; ritorna una Promise con il pulsante scelto */
function modal(title, body, buttons = ['Annulla', 'OK']) {
  return new Promise(res => {
    const box = el('div', { className: 'modal' }, el('h3', { textContent: title }), body);
    const bar = el('div', { className: 'actions' });
    buttons.forEach((b, i) => bar.append(btn(b, () => { wrap.remove(); res(i); }, i === buttons.length - 1 ? 'primary' : '')));
    box.append(bar);
    const wrap = el('div', { className: 'modal-wrap' }, box);
    document.body.append(wrap);
  });
}

/* Scelta dei gruppi di impostazioni (copia selettiva, salvataggio preset) */
async function pickGroups(title, preset) {
  const checks = {};
  const list = el('div', { className: 'checks' });
  for (const g of Object.keys(GROUPS)) {
    const cb = el('input', { type: 'checkbox', checked: preset.includes(g) });
    checks[g] = cb;
    list.append(el('label', {}, cb, ' ' + g));
  }
  const all = actions(btn('Tutti', () => Object.values(checks).forEach(c => { c.checked = true; })),
    btn('Nessuno', () => Object.values(checks).forEach(c => { c.checked = false; })));
  const r = await modal(title, el('div', {}, all, list));
  return r === 1 ? Object.keys(checks).filter(g => checks[g].checked) : null;
}

/* ---------- Cronologia ---------- */

function pushHistory(label, state) {
  history.undo.push({ label, state });
  if (history.undo.length > 200) history.undo.shift();
  history.redo.length = 0;
  syncButtons();
}
const commit = label => pushHistory(label, clone(params));

function undo() {
  const h = history.undo.pop(); if (!h) return;
  history.redo.push({ label: h.label, state: clone(params) });
  applyState(h.state);
}
function redo() {
  const h = history.redo.pop(); if (!h) return;
  history.undo.push({ label: h.label, state: clone(params) });
  applyState(h.state);
}
function jumpHistory(i) {
  const cur = clone(params), later = history.undo.splice(i);
  history.redo = [];
  for (let k = later.length - 1; k >= 0; k--) history.redo.push({ label: later[k].label, state: k + 1 < later.length ? later[k + 1].state : cur });
  applyState(later[0].state);
}
function syncButtons() {
  $('btnUndo').disabled = !history.undo.length;
  $('btnRedo').disabled = !history.redo.length;
  for (const id of ['btnCompare', 'btnExport']) $(id).disabled = !loaded;
}
function applyState(s) { params = clone(s); renderPanel(); redraw(); syncButtons(); }

/* ---------- Disegno ---------- */

function viewSize() {
  const st = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const [ow, oh] = engine.outputSize(params, tool.mode === 'crop');
  const s = Math.min(st.width / ow, st.height / oh);
  const k = Math.min(1, (ow * s * dpr * Math.max(1, view.scale)) / ow, 4096 / Math.max(ow, oh));
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
    const b = brushCanvases();
    engine.render(effectiveParams(p), w, h, {
      full: tool.mode === 'crop', brushes: b.list, brushVer: b.ver,
      showMask: curTab === 'Maschere' && overlayOn && params.masks[maskIdx] ? maskIdx : -1, overlay: overlayCol,
      pcShow: curTab === 'Colore punto' && pcShowRange && params.pc[pcIdx] ? pcIdx : -1,
    });
    const cv = $('view');
    cv.style.width = Math.round(cw) + 'px'; cv.style.height = Math.round(ch) + 'px';
    applyView(); drawHistogram(); drawOverlay();
  });
}

function applyView() { $('view').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; }

const hbuf = el('canvas', { width: 96, height: 64 });
function drawHistogram() {
  const c = $('hist'), ctx = c.getContext('2d'), b = hbuf.getContext('2d', { willReadFrequently: true });
  b.drawImage($('view'), 0, 0, 96, 64);
  const d = b.getImageData(0, 0, 96, 64).data, bins = [0, 1, 2].map(() => new Array(64).fill(0));
  let clipLo = 0, clipHi = 0;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) bins[k][d[i + k] >> 2]++;
    if (d[i] < 2 && d[i + 1] < 2 && d[i + 2] < 2) clipLo++;
    if (d[i] > 253 || d[i + 1] > 253 || d[i + 2] > 253) clipHi++;
  }
  const mx = Math.max(1, ...bins.flat()) * 0.6;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  ['#f33', '#3f3', '#38f'].forEach((col, k) => {
    ctx.fillStyle = col;
    bins[k].forEach((v, i) => { const hh = Math.min(1, v / mx) * c.height; ctx.fillRect(i * 1.875, c.height - hh, 1.875, hh); });
  });
  ctx.globalCompositeOperation = 'source-over';
  const n = d.length / 4;
  ctx.fillStyle = clipLo / n > 0.01 ? '#4da3ff' : '#444'; ctx.fillRect(2, 2, 8, 8);
  ctx.fillStyle = clipHi / n > 0.01 ? '#ff5252' : '#444'; ctx.fillRect(c.width - 10, 2, 8, 8);
}

/* Modalità dello strumento sull'immagine in base alla scheda aperta */
function syncToolMode() {
  if (tool.mode === 'pick') return;
  const prev = tool.mode;
  const m = params.masks[maskIdx];
  tool.mode = curTab === 'Ritaglio' ? 'crop' : curTab === 'Ritocco' ? 'spot' : curTab === 'Sfocatura' ? 'blur'
    : curTab === 'Trasforma' && guidedOn ? 'guide'
    : curTab === 'Maschere' && m ? (brushMode && m.comps.some(c => c.type === 'brush') ? 'brush' : 'maskHandle') : null;
  if (tool.mode === 'crop' && prev !== 'crop') { view.scale = 1; view.x = view.y = 0; }
  if (prev !== tool.mode) redraw();
}

/* ---------- Schede ---------- */

function renderTabs() {
  const nav = $('tabs'); nav.innerHTML = '';
  for (const name of TAB_ORDER)
    nav.append(el('button', { textContent: name, className: name === curTab ? 'on' : '',
      onclick: () => { curTab = name; renderTabs(); renderPanel(); } }));
  nav.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

const PANELS = {};
function renderPanel() {
  const panel = $('panel'), top = panel.scrollTop; panel.innerHTML = '';
  const append = panel.append.bind(panel);
  PANELS[curTab]({ append: (...k) => append(...k.filter(x => x != null)) });
  panel.scrollTop = top;
  syncToolMode(); redraw();
}

/* Luce */
PANELS['Luce'] = p => {
  p.append(S('exp', 'Esposizione', -3, 3), S('contrast', 'Contrasto', -1, 1), S('hi', 'Alte luci', -1, 1), S('sh', 'Ombre', -1, 1),
    S('wh', 'Bianchi', -1, 1), S('bl', 'Neri', -1, 1), actions(btn('Auto', autoTone)));
};

function autoTone() {
  if (!loaded) return;
  const s = lumaStats();
  commit('Auto');
  params.exp = Math.max(-1.5, Math.min(1.5, (0.45 - s.mean) * 3));
  params.bl = -Math.min(1, s.p1 / 0.15 * 0.5);
  params.wh = Math.max(0, Math.min(1, (1 - s.p99) / 0.15 * 0.5));
  params.contrast = 0.1; params.vib = 0.15; params.hi = -0.15; params.sh = 0.15;
  const wb = autoWB(); params.temp = wb.temp * 0.6; params.tint = wb.tint * 0.6;
  renderPanel();
}

/* Curva */
PANELS['Curva'] = p => {
  p.append(chips([['point', 'Punti'], ['param', 'Parametrica']], curveMode, v => { curveMode = v; renderPanel(); }));
  if (curveMode === 'param') {
    p.append(S('pcHi', 'Alte luci', -1, 1), S('pcLt', 'Chiari', -1, 1), S('pcDk', 'Scuri', -1, 1), S('pcSh', 'Ombre', -1, 1),
      section('Divisioni'), S('pcS1', 'Ombre / scuri', 0.05, 0.45), S('pcS2', 'Scuri / chiari', 0.3, 0.7), S('pcS3', 'Chiari / alte luci', 0.55, 0.95),
      curveCanvas(true));
    return;
  }
  const chans = [['curve', 'RGB'], ['cr', 'Rosso'], ['cg', 'Verde'], ['cb', 'Blu']];
  p.append(chips(chans, curveCh, v => { curveCh = v; renderPanel(); }), curveCanvas(false),
    actions(btn('Azzera questa curva', () => { commit('Curva'); params[curveCh] = IDENT(); renderPanel(); }),
      btn('Contrasto medio', () => { commit('Curva'); params[curveCh] = [[0, 0], [0.25, 0.21], [0.75, 0.79], [1, 1]]; renderPanel(); }),
      btn('Contrasto forte', () => { commit('Curva'); params[curveCh] = [[0, 0], [0.25, 0.16], [0.75, 0.84], [1, 1]]; renderPanel(); })));
};

function curveCanvas(readOnly) {
  const col = { curve: '#4da3ff', cr: '#ff5252', cg: '#4caf50', cb: '#448aff' }[curveCh];
  const cv = el('canvas', { id: 'curve', width: 260, height: 260 }), ctx = cv.getContext('2d');
  let drag = -1, before = null;
  const pts = () => params[curveCh];
  const draw = () => {
    ctx.clearRect(0, 0, 260, 260);
    ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 65, 0); ctx.lineTo(i * 65, 260); ctx.moveTo(0, i * 65); ctx.lineTo(260, i * 65); ctx.stroke(); }
    const P = parametricLUT(params), M = curveLUT(pts());
    ctx.strokeStyle = readOnly ? '#fff' : col; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const y = readOnly ? P[i] : M[i];
      ctx[i ? 'lineTo' : 'moveTo'](i / 255 * 260, 260 - y * 260);
    }
    ctx.stroke();
    if (readOnly) return;
    ctx.fillStyle = '#fff';
    for (const [x, y] of pts()) { ctx.beginPath(); ctx.arc(x * 260, 260 - y * 260, 6, 0, 7); ctx.fill(); }
  };
  if (!readOnly) {
    const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))]; };
    const near = (x, y) => pts().findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 0.07);
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); before = clone(params);
      const [x, y] = pos(e); drag = near(x, y);
      if (drag < 0) { pts().push([x, y]); pts().sort((a, b) => a[0] - b[0]); drag = pts().findIndex(q => q[0] === x); }
      draw(); redraw();
    });
    cv.addEventListener('pointermove', e => {
      if (drag < 0) return;
      const [x, y] = pos(e), P = pts();
      if (drag > 0 && drag < P.length - 1) P[drag][0] = Math.min(P[drag + 1][0] - 0.02, Math.max(P[drag - 1][0] + 0.02, x));
      P[drag][1] = y; draw(); redraw();
    });
    cv.addEventListener('pointerup', () => { if (drag >= 0 && before) pushHistory('Curva', before); drag = -1; before = null; });
    cv.addEventListener('dblclick', e => {
      const i = near(...pos(e));
      if (i > 0 && i < pts().length - 1) { commit('Curva'); pts().splice(i, 1); draw(); redraw(); }
    });
  }
  draw();
  return cv;
}

/* Colore: bilanciamento del bianco e presenza */
const WB_PRESETS = { asShot: [0, 0], daylight: [0.05, 0], cloudy: [0.2, 0.03], shade: [0.35, 0.05], tungsten: [-0.6, 0.05], fluorescent: [-0.3, 0.3], flash: [0.12, 0] };
PANELS['Colore'] = p => {
  const items = [['asShot', 'Come scattato'], ['auto', 'Auto'], ['daylight', 'Luce diurna'], ['cloudy', 'Nuvoloso'], ['shade', 'Ombra'],
    ['tungsten', 'Tungsteno'], ['fluorescent', 'Fluorescente'], ['flash', 'Flash'], ['custom', 'Personalizzato']];
  p.append(section('Bilanciamento del bianco'), chips(items, params.wb, v => {
    if (v === 'custom') return;
    commit('Bilanciamento del bianco');
    const t = v === 'auto' ? autoWB() : { temp: WB_PRESETS[v][0], tint: WB_PRESETS[v][1] };
    Object.assign(params, { wb: v, temp: t.temp, tint: t.tint }); renderPanel();
  }),
  actions(btn('Contagocce', () => startPick('Tocca un punto che dovrebbe essere grigio o bianco', ({ rgb }) => {
    commit('Contagocce'); const t = wbFromColor(rgb); Object.assign(params, { wb: 'custom', temp: t.temp, tint: t.tint }); renderPanel();
  }))),
  S('temp', 'Temperatura', -1, 1, 0.01, { onInput: () => { params.wb = 'custom'; } }),
  S('tint', 'Tinta', -1, 1, 0.01, { onInput: () => { params.wb = 'custom'; } }),
  section('Presenza'), S('vib', 'Vividezza', -1, 1), S('sat', 'Saturazione', -1, 1, 0.01, { bg: BG.sat }));
};

/* Mixer colore (HSL) */
PANELS['Mixer'] = p => {
  p.append(chips([['color', 'Per colore'], ['h', 'Tonalità'], ['s', 'Saturazione'], ['l', 'Luminanza']], hslMode, v => { hslMode = v; renderPanel(); }));
  if (hslMode === 'color') {
    const c = el('div', { className: 'chips' });
    HSL_BANDS.forEach(([name, col], i) => c.append(el('button', { className: 'chip' + (i === bandIdx ? ' on' : ''), title: name,
      style: `background:${col}`, onclick: () => { bandIdx = i; renderPanel(); } })));
    p.append(c, note(HSL_BANDS[bandIdx][0]));
    ['Tonalità', 'Saturazione', 'Luminanza'].forEach((label, j) =>
      p.append(slider(label, -1, 1, 0.01, () => params.hsl[bandIdx * 3 + j], v => { params.hsl[bandIdx * 3 + j] = v; })));
  } else {
    const j = { h: 0, s: 1, l: 2 }[hslMode];
    HSL_BANDS.forEach(([name, col], i) => p.append(slider(name, -1, 1, 0.01, () => params.hsl[i * 3 + j], v => { params.hsl[i * 3 + j] = v; },
      { bg: `linear-gradient(90deg,#333,${col})` })));
  }
  p.append(actions(btn('Regolazione mirata', () => startPick('Tocca il colore da regolare', ({ out }) => {
    const h = rgbToHue(out);
    let best = 0, bd = 999;
    HSL_CENTERS.forEach((c, i) => { const d = Math.min(Math.abs(h - c), 360 - Math.abs(h - c)); if (d < bd) { bd = d; best = i; } });
    bandIdx = best; hslMode = 'color'; renderPanel(); toast('Colore selezionato: ' + HSL_BANDS[best][0]);
  })), btn('Azzera mixer', () => { commit('Mixer colore'); params.hsl.fill(0); renderPanel(); })));
};

function rgbToHue([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function rgbToHsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return [rgbToHue([r, g, b]) / 360, mx ? (mx - mn) / mx : 0, mx];
}

/* Colore punto */
PANELS['Colore punto'] = p => {
  const sw = el('div', { className: 'chips' });
  params.pc.forEach((c, i) => sw.append(el('button', { className: 'chip' + (i === pcIdx ? ' on' : ''),
    style: `background:rgb(${c.rgb.map(v => Math.round(v * 255)).join(',')})`, onclick: () => { pcIdx = i; renderPanel(); } })));
  p.append(sw, actions(
    btn('+ Campiona colore', () => {
      if (params.pc.length >= 4) { toast('Massimo 4 campioni'); return; }
      startPick('Tocca il colore da modificare', ({ out }) => {
        commit('Colore punto');
        const [h, s, v] = rgbToHsv(out);
        params.pc.push({ rgb: out, h, s, v, on: 1, dh: 0, ds: 0, dl: 0, hr: 0.5, sr: 0.5, lr: 0.5, fe: 0.5 });
        pcIdx = params.pc.length - 1; renderPanel();
      });
    }),
    toggle('Mostra intervallo', () => pcShowRange, v => { pcShowRange = v; }, true)));
  const c = params.pc[pcIdx];
  if (!c) { p.append(note('Campiona un colore nell\'immagine per modificarne solo quella tonalità precisa.')); return; }
  const P = (k, label, min, max, neutral = 0) => p.append(slider(label, min, max, 0.01, () => c[k], v => { c[k] = v; }, { neutral }));
  P('dh', 'Tonalità', -1, 1); P('ds', 'Saturazione', -1, 1); P('dl', 'Luminanza', -1, 1);
  p.append(section('Intervallo'));
  P('hr', 'Intervallo tonalità', 0, 1, 0.5); P('sr', 'Intervallo saturazione', 0, 1, 0.5); P('lr', 'Intervallo luminanza', 0, 1, 0.5); P('fe', 'Sfumatura', 0, 1, 0.5);
  p.append(actions(toggle(c.on ? 'Attivo' : 'Disattivato', () => c.on, v => { c.on = v ? 1 : 0; }),
    btn('Elimina campione', () => { commit('Colore punto'); params.pc.splice(pcIdx, 1); pcIdx = Math.max(0, pcIdx - 1); renderPanel(); })));
};

/* Gradazione colore */
PANELS['Gradazione'] = p => {
  const zones = [['all', 'Tre vie'], ['s', 'Ombre'], ['m', 'Mezzitoni'], ['h', 'Alte luci'], ['g', 'Globale']];
  p.append(chips(zones, gradeZone, v => { gradeZone = v; renderPanel(); }));
  const Z = { s: ['gsH', 'gsS', 'gsL', 'Ombre'], m: ['gmH', 'gmS', 'gmL', 'Mezzitoni'], h: ['ghH', 'ghS', 'ghL', 'Alte luci'], g: ['ggH', 'ggS', 'ggL', 'Globale'] };
  const zone = z => {
    const [hk, sk, lk, name] = Z[z];
    p.append(section(name), wheel(hk, sk), S(hk, 'Tonalità', 0, 360, 1, { bg: HUE_BG, neutral: defaults()[hk] }), S(sk, 'Saturazione', 0, 1), S(lk, 'Luminanza', -1, 1));
  };
  if (gradeZone === 'all') ['s', 'm', 'h'].forEach(zone); else zone(gradeZone);
  p.append(section('Comuni'), S('gBlend', 'Fusione', 0, 1), S('gBal', 'Bilanciamento', -1, 1));
};

/* Ruota colore: trascina per scegliere tonalità e saturazione */
function wheel(hk, sk) {
  const size = 120, cv = el('canvas', { width: size, height: size, className: 'wheel' }), ctx = cv.getContext('2d'), R = size / 2 - 4;
  const draw = () => {
    ctx.clearRect(0, 0, size, size);
    const cg = ctx.createConicGradient(0, size / 2, size / 2);
    for (let a = 0; a <= 360; a += 30) cg.addColorStop(a / 360, `hsl(${(360 - a) % 360},90%,55%)`);   // tonalità in senso antiorario
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(size / 2, size / 2, R, 0, 7); ctx.fill();
    const rg = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, R);
    rg.addColorStop(0, '#888'); rg.addColorStop(1, 'rgba(136,136,136,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(size / 2, size / 2, R, 0, 7); ctx.fill();
    const h = params[hk] * Math.PI / 180, s = params[sk] * R;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(h) * s, size / 2 - Math.sin(h) * s, 6, 0, 7); ctx.stroke();
  };
  let before = null;
  const set = e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * size - size / 2, y = -((e.clientY - r.top) / r.height * size - size / 2);
    params[hk] = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; params[sk] = Math.min(1, Math.hypot(x, y) / R);
    draw(); redraw();
  };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); before = clone(params); set(e); });
  cv.addEventListener('pointermove', e => { if (before) set(e); });
  cv.addEventListener('pointerup', () => { if (before) { pushHistory('Gradazione colore', before); before = null; renderPanel(); } });
  draw();
  return cv;
}

/* Bianco e nero */
PANELS['B&N'] = p => {
  p.append(actions(toggle('Bianco e nero', () => params.mono >= 1, v => { params.mono = v ? 1 : 0; })),
    S('mono', 'Intensità conversione', 0, 1), section('Mixer bianco e nero'));
  HSL_BANDS.forEach(([name, col], i) => p.append(slider(name, -1, 1, 0.01, () => params.bwm[i], v => { params.bwm[i] = v; },
    { bg: `linear-gradient(90deg,#000,${col})` })));
  p.append(actions(btn('Mix automatico', () => {
    commit('Mix B&N');
    // schiarisce i colori più presenti nell'immagine per separarli meglio in grigio
    const d = imgInfo.small.data, cnt = new Array(8).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const c = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], hsv = rgbToHsv(c); if (hsv[1] < 0.15) continue;
      const h = hsv[0] * 360; let b = 0, bd = 999;
      HSL_CENTERS.forEach((cc, k) => { const dd = Math.min(Math.abs(h - cc), 360 - Math.abs(h - cc)); if (dd < bd) { bd = dd; b = k; } });
      cnt[b] += hsv[1];
    }
    const mx = Math.max(...cnt, 1e-6);
    params.bwm = cnt.map(c => Math.round((c / mx * 0.6 - 0.2) * 100) / 100); params.mono = 1; renderPanel();
  }), btn('Azzera mixer', () => { commit('Mix B&N'); params.bwm.fill(0); renderPanel(); })),
  note('Gradazione colore, curve, grana e vignettatura funzionano anche in bianco e nero.'));
};

/* Effetti */
PANELS['Effetti'] = p => {
  p.append(S('texture', 'Texture', -1, 1), S('clarity', 'Chiarezza', -1, 1), S('dehaze', 'Rimozione foschia', -1, 1),
    section('Vignettatura'), S('vig', 'Quantità', -1, 1), S('vigMid', 'Punto medio', 0, 1), S('vigRound', 'Rotondità', -1, 1),
    S('vigFeather', 'Sfumatura', 0, 1), S('vigHi', 'Alte luci', 0, 1),
    section('Granulosità'), S('grain', 'Quantità', 0, 1), S('grainSize', 'Dimensione', 0.5, 3), S('grainRough', 'Ruvidità', 0, 1),
    section('Creativi'), S('fade', 'Dissolvenza neri', 0, 1), S('glow', 'Bagliore', 0, 1), S('halation', 'Alone pellicola', 0, 1),
    S('ca', 'Aberrazione cromatica', 0, 1));
};

/* Dettagli */
PANELS['Dettagli'] = p => {
  p.append(section('Nitidezza'), S('sharp', 'Quantità', 0, 2), S('sharpRad', 'Raggio', 0.5, 3), S('sharpDetail', 'Dettagli', 0, 1),
    S('sharpMask', 'Mascheratura', 0, 1),
    section('Riduzione disturbo luminanza'), S('nrLum', 'Luminanza', 0, 1), S('nrLumDetail', 'Dettagli', 0, 1), S('nrLumContrast', 'Contrasto', 0, 1),
    section('Riduzione disturbo colore'), S('nrCol', 'Colore', 0, 1), S('nrColDetail', 'Dettagli', 0, 1), S('nrColSmooth', 'Uniformità', 0, 1),
    note('Suggerimento: ingrandisci con due dita per valutare nitidezza e rumore.'));
};

/* Ottica */
PANELS['Ottica'] = p => {
  p.append(section('Aberrazione cromatica'), S('caR', 'Rosso / ciano', -1, 1), S('caB', 'Blu / giallo', -1, 1),
    section('Frange viola'), S('defP', 'Quantità', 0, 1), S('defPLo', 'Tonalità da', 220, 360, 1, { bg: HUE_BG }), S('defPHi', 'Tonalità a', 220, 360, 1, { bg: HUE_BG }),
    section('Frange verdi'), S('defG', 'Quantità', 0, 1), S('defGLo', 'Tonalità da', 40, 200, 1, { bg: HUE_BG }), S('defGHi', 'Tonalità a', 40, 200, 1, { bg: HUE_BG }),
    section('Correzione obiettivo manuale'), S('lensDist', 'Distorsione', -1, 1), S('lensVig', 'Vignettatura obiettivo', -1, 1), S('lensVigMid', 'Punto medio', 0, 1),
    note('I profili automatici degli obiettivi richiederebbero un database esterno: qui la correzione è manuale.'));
};

/* Ritaglio e rotazione */
PANELS['Ritaglio'] = p => {
  const g = params.geo;
  const ratios = [['orig', 'Originale'], ['free', 'Libero'], ['1:1', '1:1'], ['2:3', '2:3'], ['3:2', '3:2'], ['3:4', '3:4'], ['4:3', '4:3'],
    ['4:5', '4:5'], ['5:4', '5:4'], ['9:16', '9:16'], ['16:9', '16:9'], ['2.39:1', '2.39:1'], ['custom', `Pers. ${g.custom[0]}:${g.custom[1]}`]];
  p.append(section('Proporzioni'), chips(ratios, g.ratio, async v => {
    if (v === 'custom') {
      const s = prompt('Proporzione personalizzata (es. 5:7)', g.custom.join(':'));
      const m = s && s.match(/^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/);
      if (!m) return;
      commit('Proporzioni'); g.custom = [+m[1], +m[2]];
    } else commit('Proporzioni');
    g.ratio = v; resetCrop(); renderPanel();
  }),
  actions(btn('Inverti orientamento ⇄', () => {
    commit('Proporzioni');
    if (g.ratio === 'custom') g.custom.reverse();
    else if (ASPECTS[g.ratio] > 0) { const [a, b] = g.ratio.split(':'); if (ASPECTS[`${b}:${a}`]) g.ratio = `${b}:${a}`; }
    resetCrop(); renderPanel();
  })),
  section('Raddrizza'),
  slider('Angolo', -45, 45, 0.1, () => g.angle, v => { g.angle = v; }),
  actions(btn('Auto raddrizza', () => { commit('Auto raddrizza'); toast(autoUpright('straighten') ? 'Raddrizzato' : 'Nessuna linea trovata'); renderPanel(); }),
    btn('⟲ 90°', () => { commit('Ruota'); g.rot = (g.rot + 3) % 4; resetCrop(); renderPanel(); }),
    btn('⟳ 90°', () => { commit('Ruota'); g.rot = (g.rot + 1) % 4; resetCrop(); renderPanel(); }),
    btn('Rifletti ↔', () => { commit('Rifletti'); g.fx ^= 1; renderPanel(); }),
    btn('Rifletti ↕', () => { commit('Rifletti'); g.fy ^= 1; renderPanel(); })),
  actions(toggle('Vincola ritaglio', () => g.constrain, v => { g.constrain = v ? 1 : 0; })),
  section('Guide'), chips([['thirds', 'Terzi'], ['golden', 'Sezione aurea'], ['grid', 'Griglia'], ['diagonal', 'Diagonali'], ['none', 'Nessuna']], g.grid,
    v => { g.grid = v; renderPanel(); }),
  actions(btn('Azzera ritaglio', () => { commit('Ritaglio'); Object.assign(g, { angle: 0, rot: 0, fx: 0, fy: 0, ratio: 'orig', crop: [0, 0, 1, 1] }); renderPanel(); })),
  note('Trascina angoli e bordi del riquadro sull\'immagine.'));
};

/* Trasforma (Upright e prospettiva) */
PANELS['Trasforma'] = p => {
  const g = params.geo;
  const up = mode => () => {
    commit('Upright');
    if (mode === 'off') Object.assign(g, { trot: 0, vert: 0, horiz: 0 });
    else if (!autoUpright(mode)) toast('Nessuna linea trovata nell\'immagine');
    guidedOn = false; renderPanel();
  };
  p.append(section('Upright'), actions(btn('Off', up('off')), btn('Auto', up('auto')), btn('Livello', up('level')),
    btn('Verticale', up('vertical')), btn('Completo', up('full')),
    btn('Guidato', () => { guidedOn = !guidedOn; renderPanel(); toast(guidedOn ? 'Disegna fino a 4 linee lungo bordi che dovrebbero essere dritti' : 'Guidato disattivato'); }, guidedOn ? 'on' : '')));
  if (guidedOn) p.append(actions(btn('Cancella guide', () => { commit('Guide'); g.guides = []; Object.assign(g, { trot: 0, vert: 0, horiz: 0 }); renderPanel(); })));
  const G = (k, label, min, max, step = 0.01, neutral = 0) => p.append(slider(label, min, max, step, () => g[k], v => { g[k] = v; }, { neutral }));
  p.append(section('Manuale'));
  G('distort', 'Distorsione', -1, 1); G('vert', 'Verticale', -1, 1); G('horiz', 'Orizzontale', -1, 1); G('trot', 'Rotazione', -45, 45, 0.1);
  G('aspAdj', 'Aspetto', -1, 1); G('scale', 'Scala', 0.5, 2, 0.01, 1); G('ox', 'Spostamento X', -1, 1); G('oy', 'Spostamento Y', -1, 1);
  p.append(actions(toggle('Vincola ritaglio', () => g.constrain, v => { g.constrain = v ? 1 : 0; }),
    btn('Azzera trasformazioni', () => { commit('Trasforma'); Object.assign(g, { distort: 0, vert: 0, horiz: 0, trot: 0, aspAdj: 0, scale: 1, ox: 0, oy: 0, guides: [] }); renderPanel(); })));
};

/* Sfocatura obiettivo (zona di messa a fuoco manuale) */
PANELS['Sfocatura'] = p => {
  p.append(S('lbAmt', 'Intensità sfocatura', 0, 1),
    chips([['radial', 'Fuoco circolare'], ['linear', 'Fuoco a fascia (tilt-shift)']], params.lbType, v => { commit('Sfocatura'); params.lbType = v; renderPanel(); }),
    S('lbSize', 'Intervallo di fuoco', 0, 0.8), S('lbFeather', 'Transizione', 0, 1),
    params.lbType === 'linear' ? S('lbAngle', 'Angolo', -90, 90, 1) : null,
    S('lbBokeh', 'Luci del bokeh', 0, 1),
    note('Tocca o trascina sull\'immagine per scegliere il punto a fuoco. La zona è disegnata a mano, senza mappa di profondità AI.'));
};

/* Maschere */
const MASK_TYPES = [['brush', 'Pennello'], ['linear', 'Sfumatura lineare'], ['radial', 'Sfumatura radiale'], ['color', 'Intervallo colore'], ['lum', 'Intervallo luminanza']];
const selectedComp = () => params.masks[maskIdx]?.comps[compIdx];

PANELS['Maschere'] = p => {
  const list = el('div', { className: 'masklist' });
  params.masks.forEach((m, i) => list.append(el('div', { className: 'maskitem' + (i === maskIdx ? ' on' : '') },
    btn(m.on ? '👁' : '–', () => { commit('Maschera'); m.on = m.on ? 0 : 1; renderPanel(); }, 'eye'),
    btn(m.name, () => { maskIdx = i; compIdx = 0; renderPanel(); }, 'name'))));
  p.append(list);
  if (params.masks.length < MAX_MASKS) {
    const sel = el('select');
    sel.append(el('option', { textContent: '+ Nuova maschera…', value: '' }), ...MASK_TYPES.map(([v, t]) => el('option', { value: v, textContent: t })));
    sel.onchange = () => {
      if (!sel.value) return;
      commit('Nuova maschera');
      params.masks.push(newMask(sel.value, params.masks.length + 1));
      maskIdx = params.masks.length - 1; compIdx = 0; brushMode = sel.value === 'brush';
      if (sel.value === 'color' || sel.value === 'lum') pickForComp();
      renderPanel();
    };
    p.append(sel);
  }
  const m = params.masks[maskIdx];
  if (!m) { p.append(note('Le maschere applicano regolazioni solo a una zona: pennello, sfumature, intervallo colore o luminanza.')); return; }

  p.append(section('Maschera'), actions(
    btn('Rinomina', () => { const n = prompt('Nome maschera', m.name); if (n) { commit('Rinomina maschera'); m.name = n; renderPanel(); } }),
    toggle('Inverti', () => m.invert, v => { m.invert = v ? 1 : 0; }),
    btn('Duplica', () => {
      if (params.masks.length >= MAX_MASKS) return;
      commit('Duplica maschera'); const c = clone(m); c.id = Date.now() + '-' + maskSeq++; c.name += ' copia';
      params.masks.splice(maskIdx + 1, 0, c); maskIdx++; renderPanel();
    }),
    btn('Elimina', () => { commit('Elimina maschera'); params.masks.splice(maskIdx, 1); maskIdx = Math.max(0, maskIdx - 1); renderPanel(); })),
  actions(toggle('Mostra sovrapposizione', () => overlayOn, v => { overlayOn = v; }, true),
    ...[[1, 0.2, 0.2], [0.2, 1, 0.3], [0.3, 0.5, 1], [1, 1, 1]].map(c => el('button', { className: 'chip' + (c.every((v, i) => v === overlayCol[i]) ? ' on' : ''),
      style: `background:rgb(${c.map(v => v * 255).join(',')})`, onclick: () => { overlayCol = [...c, overlayCol[3]]; renderPanel(); } }))),
  slider('Opacità sovrapposizione', 0.1, 1, 0.01, () => overlayCol[3], v => { overlayCol[3] = v; }, { neutral: 0.5 }));

  // componenti
  p.append(section('Componenti'));
  const cl = el('div', { className: 'chips' });
  const OPN = { add: '+', sub: '−', int: '∩' };
  m.comps.forEach((c, i) => cl.append(btn(`${OPN[c.op]} ${MASK_TYPES.find(t => t[0] === c.type)[1]}`, () => { compIdx = i; renderPanel(); }, i === compIdx ? 'on' : '')));
  p.append(cl);
  if (m.comps.length < MAX_COMPS) {
    const sel = el('select');
    sel.append(el('option', { textContent: 'Aggiungi / sottrai / interseca…', value: '' }));
    for (const [op, opn] of [['add', 'Aggiungi'], ['sub', 'Sottrai'], ['int', 'Interseca']])
      for (const [t, tn] of MASK_TYPES) {
        if (t === 'brush' && m.comps.some(c => c.type === 'brush')) continue;
        sel.append(el('option', { value: op + ':' + t, textContent: `${opn}: ${tn}` }));
      }
    sel.onchange = () => {
      if (!sel.value) return;
      const [op, t] = sel.value.split(':');
      commit('Componente maschera'); m.comps.push(newComp(t, op)); compIdx = m.comps.length - 1;
      brushMode = t === 'brush'; if (t === 'color' || t === 'lum') pickForComp();
      renderPanel();
    };
    p.append(sel);
  }
  const c = m.comps[compIdx];
  if (c) {
    const C = (k, label, min, max, step = 0.01, neutral = 0) => p.append(slider(label, min, max, step, () => c[k], v => { c[k] = v; }, { neutral }));
    if (c.type === 'linear') { C('angle', 'Angolo', -180, 180, 1, 90); C('width', 'Ampiezza sfumatura', 0.01, 1, 0.01, 0.3); p.append(note('Trascina il punto blu per spostarla.')); }
    if (c.type === 'radial') { C('rx', 'Larghezza', 0.01, 1.5, 0.01, 0.25); C('ry', 'Altezza', 0.01, 1.5, 0.01, 0.25); C('angle', 'Angolo', -180, 180, 1); C('feather', 'Sfumatura', 0, 1, 0.01, 0.5); p.append(note('Trascina i punti blu per spostarla o ridimensionarla.')); }
    if (c.type === 'color') { C('range', 'Ampiezza intervallo', 0.02, 1, 0.01, 0.5); p.append(actions(btn('Campiona colore', pickForComp))); }
    if (c.type === 'lum') { C('lo', 'Minimo', 0, 1); C('hi', 'Massimo', 0, 1, 0.01, 1); C('smooth', 'Morbidezza', 0, 0.5, 0.01, 0.15); p.append(actions(btn('Campiona luminanza', pickForComp))); }
    if (c.type === 'brush') {
      p.append(actions(toggle('Dipingi sull\'immagine', () => brushMode, v => { brushMode = v; }, true),
        toggle('Gomma', () => brushOpts.erase, v => { brushOpts.erase = v; }, true),
        btn('Cancella tratti', () => { commit('Pennello'); m.strokes = []; renderPanel(); })),
      slider('Dimensione', 0.005, 0.3, 0.005, () => brushOpts.size, v => { brushOpts.size = v; }, { neutral: 0.05 }),
      slider('Sfumatura', 0, 1, 0.01, () => brushOpts.feather, v => { brushOpts.feather = v; }, { neutral: 0.5 }),
      slider('Flusso', 0.05, 1, 0.01, () => brushOpts.flow, v => { brushOpts.flow = v; }, { neutral: 0.8 }));
    }
    p.append(actions(toggle('Inverti componente', () => c.invert, v => { c.invert = v ? 1 : 0; }),
      chips([['add', 'Aggiungi'], ['sub', 'Sottrai'], ['int', 'Interseca']], c.op, v => { if (compIdx === 0) return; commit('Maschera'); c.op = v; renderPanel(); }),
      btn('Rimuovi componente', () => { commit('Maschera'); m.comps.splice(compIdx, 1); compIdx = Math.max(0, compIdx - 1); renderPanel(); })));
  }

  // regolazioni della maschera
  const a = m.adj;
  const A = (k, label, min, max, step = 0.01, o = {}) => p.append(slider(label, min, max, step, () => a[k], v => { a[k] = v; }, { neutral: defMaskAdj()[k], ...o }));
  p.append(section('Regolazioni della maschera'), slider('Quantità', 0, 2, 0.01, () => m.amount, v => { m.amount = v; }, { neutral: 1 }));
  A('exp', 'Esposizione', -3, 3); A('contrast', 'Contrasto', -1, 1); A('hi', 'Alte luci', -1, 1); A('sh', 'Ombre', -1, 1);
  A('wh', 'Bianchi', -1, 1); A('bl', 'Neri', -1, 1); A('temp', 'Temperatura', -1, 1, 0.01, { bg: BG.temp }); A('tint', 'Tinta', -1, 1, 0.01, { bg: BG.tint });
  A('hue', 'Tonalità', -1, 1); A('sat', 'Saturazione', -1, 1); A('texture', 'Texture', -1, 1); A('clarity', 'Chiarezza', -1, 1);
  A('dehaze', 'Rimozione foschia', -1, 1); A('sharp', 'Nitidezza', -1, 2); A('noise', 'Riduzione disturbo', 0, 1); A('moire', 'Moiré', 0, 1);
  A('ovH', 'Colore sovrapposto: tinta', 0, 360, 1, { bg: HUE_BG }); A('ovS', 'Colore sovrapposto: forza', 0, 1);
  p.append(actions(btn('Azzera regolazioni', () => { commit('Maschera'); m.adj = defMaskAdj(); renderPanel(); })));
};

function pickForComp() {
  const c = selectedComp(); if (!c) return;
  startPick(c.type === 'color' ? 'Tocca il colore da selezionare' : 'Tocca la luminosità da selezionare', ({ rgb }) => {
    commit('Campiona');
    if (c.type === 'color') c.rgb = rgb;
    else { const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; c.lo = Math.max(0, l - 0.15); c.hi = Math.min(1, l + 0.15); }
    renderPanel();
  });
}

/* Ritocco */
PANELS['Ritocco'] = p => {
  p.append(chips([['heal', 'Correggi'], ['clone', 'Clona'], ['redeye', 'Occhi rossi']], spotOpts.mode, v => { spotOpts.mode = v; renderPanel(); }),
    slider('Dimensione', 0.005, 0.2, 0.001, () => spotOpts.size, v => { spotOpts.size = v; }, { neutral: 0.03 }),
    slider('Sfumatura', 0, 1, 0.01, () => spotOpts.feather, v => { spotOpts.feather = v; }, { neutral: 0.4 }),
    slider('Opacità', 0.05, 1, 0.01, () => spotOpts.opacity, v => { spotOpts.opacity = v; }, { neutral: 1 }),
    note('Tocca un difetto per correggerlo. La zona sorgente viene scelta automaticamente: trascinala per cambiarla.'));
  const s = params.spots[selSpot];
  if (s) {
    const P = (k, label, min, max, step = 0.01) => p.append(slider(label, min, max, step, () => s[k], v => { s[k] = v; }));
    p.append(section('Punto selezionato'));
    P('r', 'Dimensione', 0.005, 0.2, 0.001); P('feather', 'Sfumatura', 0, 1); P('opacity', 'Opacità', 0.05, 1);
    p.append(actions(btn('Nuova sorgente', () => {
      commit('Ritocco'); const Sa = engine.size[0] / engine.size[1];
      const cur = [s.sx, s.sy]; let n;
      for (let k = 0; k < 5; k++) { n = autoSource(s.x + (Math.random() - 0.5) * 0.001, s.y, s.r * (1 + k * 0.15), Sa); if (n[0] !== cur[0]) break; }
      [s.sx, s.sy] = n; renderPanel();
    }), btn('Elimina punto', () => { commit('Ritocco'); params.spots.splice(selSpot, 1); selSpot = -1; renderPanel(); })));
  }
  if (params.spots.length) p.append(actions(btn(`Elimina tutti (${params.spots.length})`, () => { commit('Ritocco'); params.spots = []; selSpot = -1; renderPanel(); })));
};

/* Calibrazione */
PANELS['Calibrazione'] = p => {
  p.append(section('Ombre'), S('calSh', 'Tinta', -1, 1, 0.01, { bg: BG.tint }),
    section('Primario rosso'), S('calRH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#f0f,#f00,#fa0)' }), S('calRS', 'Saturazione', -1, 1),
    section('Primario verde'), S('calGH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#fd0,#0c0,#0dd)' }), S('calGS', 'Saturazione', -1, 1),
    section('Primario blu'), S('calBH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#0dd,#00f,#a0f)' }), S('calBS', 'Saturazione', -1, 1),
    note('Classico look cinematografico: blu tonalità −, saturazione +; rosso tonalità +.'));
};

/* Profili */
const profThumbs = new Map();
PANELS['Profili'] = p => {
  p.append(chips(PROFILE_GROUPS.map(g => [g, g]), profGroup, v => { profGroup = v; renderPanel(); }),
    S('profileAmt', 'Intensità profilo', 0, 2, 0.01, { neutral: 1 }));
  const grid = el('div', { className: 'presets' });
  for (const pr of PROFILES.filter(x => x.group === profGroup)) {
    const img = el('img', { alt: '' }), card = el('button', { className: 'preset' + (params.profile === pr.name ? ' on' : '') }, img, el('span', { textContent: pr.name }));
    card.onclick = () => { commit('Profilo'); params.profile = pr.name; renderPanel(); };
    grid.append(card);
    if (loaded) setTimeout(() => { img.src = thumbFor('prof:' + pr.name, () => { const q = clone(params); q.profile = pr.name; return effectiveParams(q); }); }, 0);
  }
  p.append(grid, actions(btn('Importa profilo (.cube)', () => $('fileLut').click())),
    note('I profili sono un punto di partenza: le altre regolazioni si sommano sopra.'));
};

/* LUT */
PANELS['LUT'] = p => {
  p.append(note(lutName ? `LUT attiva: ${lutName}` : 'Carica un file .cube (LUT 3D) per applicare un look esterno.'),
    actions(btn('Carica LUT .cube', () => $('fileLut').click()), btn('Rimuovi LUT', () => { engine.clearLut(); lutName = ''; renderPanel(); })),
    S('lutAmt', 'Intensità LUT', 0, 1, 0.01, { neutral: 1 }));
};

/* ---------- Preset ---------- */

function userPresets() {
  try {
    const list = JSON.parse(localStorage.getItem('presets2') || 'null');
    if (list) return list;
    const old = JSON.parse(localStorage.getItem('presets') || '{}');   // formato della versione precedente
    return Object.entries(old).map(([name, values]) => ({ name, group: 'Miei', values }));
  } catch { return []; }
}
function saveUserPresets(list) {
  try { localStorage.setItem('presets2', JSON.stringify(list)); } catch { toast('Spazio di archiviazione esaurito'); }
}

function presetEntries() {
  const user = userPresets().map(u => ({ cat: u.group, name: u.name, def: u.values, user: true }));
  return [...PRESET_DEFS, ...user];
}
function presetCats() {
  const groups = [...new Set(userPresets().map(u => u.group))];
  return ['Tutti', ...PRESET_CATEGORIES, ...groups.filter(g => !PRESET_CATEGORIES.includes(g))];
}

/* Valori del preset applicati alla foto con intensità amt */
function presetResult(entry, amt) {
  if (!entry.user) {
    const np = buildPreset(entry.def, amt);
    copyGroups(params, np, LOCAL_GROUPS); np.lutAmt = params.lutAmt;
    return np;
  }
  return buildPreset(entry.def, amt, params);   // preset utente: tocca solo le impostazioni salvate
}

const thumbCache = new Map();
function thumbFor(key, getParams) {
  if (thumbCache.has(key)) return thumbCache.get(key);
  const p = getParams();
  p.geo = clone(defaults().geo); p.geo.ratio = '4:3';
  const A = thumbEngine.size[0] / thumbEngine.size[1], R = 4 / 3;
  let cw = 1, ch = 1; if (R > A) ch = A / R; else cw = R / A;
  p.geo.crop = [(1 - cw) / 2, (1 - ch) / 2, (1 + cw) / 2, (1 + ch) / 2];
  p.masks = []; p.spots = [];
  thumbEngine.render(p, 160, 120);
  const url = thumbEngine.canvas.toDataURL('image/jpeg', 0.7);
  thumbCache.set(key, url);
  return url;
}

PANELS['Preset'] = p => {
  const search = el('input', { type: 'search', placeholder: 'Cerca un preset…', value: presetQuery, className: 'search' });
  const grid = el('div', { className: 'presets' });
  const fill = () => {
    grid.innerHTML = '';
    const q = presetQuery.trim().toLowerCase();
    const list = presetEntries().filter(e => (presetCat === 'Tutti' || e.cat === presetCat) && (!q || e.name.toLowerCase().includes(q)));
    if (!list.length) grid.append(note('Nessun preset trovato.'));
    for (const entry of list) {
      const img = el('img', { alt: '' });
      const card = el('button', { className: 'preset' + (curPreset && curPreset.name === entry.name && curPreset.cat === entry.cat ? ' on' : '') + (entry.user ? ' user' : '') },
        img, el('span', { textContent: entry.name }));
      card.onclick = () => {
        if (presetManage && entry.user) { managePreset(entry); return; }
        if (!loaded) return;
        commit('Preset: ' + entry.name); curPreset = entry; params = presetResult(entry, presetAmt);
        grid.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); card.classList.add('on');
        presetBase = clone(history.undo[history.undo.length - 1].state);
        redraw();
      };
      grid.append(card);
      if (loaded) setTimeout(() => { img.src = thumbFor((entry.user ? 'u:' : 'p:') + entry.cat + entry.name + (entry.user ? JSON.stringify(entry.def).length : ''),
        () => entry.user ? buildPreset(entry.def, 1) : buildPreset(entry.def, 1)); }, 0);
    }
  };
  search.oninput = () => { presetQuery = search.value; fill(); };
  const amt = slider('Intensità', 0, 1.5, 0.01, () => presetAmt, v => {
    presetAmt = v;
    if (curPreset && presetBase) { const keep = params; params = presetBase; const r = presetResult(curPreset, v); params = keep; Object.assign(params, r); }
  }, { neutral: 1 });
  p.append(search, chips(presetCats().map(c => [c, c]), presetCat, v => { presetCat = v; renderPanel(); }), amt, grid,
    actions(btn('Salva preset', savePreset), btn('Importa (.xmp, .lrtemplate, .json)', () => $('filePreset').click()),
      btn('Esporta i miei', exportPresets), toggle('Gestisci i miei', () => presetManage, v => { presetManage = v; }, true),
      btn('Copia impostazioni', copySettings), btn('Incolla', pasteSettings),
      btn('Azzera tutto', () => { commit('Azzera'); params = defaults(); curPreset = null; renderPanel(); })),
    presetManage ? note('Tocca uno dei tuoi preset per rinominarlo, spostarlo, aggiornarlo o eliminarlo.') : null);
  fill();
};
let presetBase = null;

async function savePreset() {
  const name = prompt('Nome del preset?'); if (!name) return;
  const groups = await pickGroups('Impostazioni da includere', Object.keys(GROUPS).filter(g => !LOCAL_GROUPS.includes(g) && g !== 'LUT'));
  if (!groups) return;
  const groupName = prompt('Gruppo', presetCat !== 'Tutti' && !PRESET_CATEGORIES.includes(presetCat) ? presetCat : 'Miei') || 'Miei';
  const list = userPresets();
  list.push({ name, group: groupName, values: copyGroups(params, {}, groups) });
  saveUserPresets(list); presetCat = groupName; renderPanel(); toast('Preset salvato');
}

async function managePreset(entry) {
  const list = userPresets(), i = list.findIndex(u => u.name === entry.name && u.group === entry.cat);
  if (i < 0) return;
  const r = await modal(entry.name, note('Cosa vuoi fare con questo preset?'), ['Annulla', 'Elimina', 'Aggiorna con le impostazioni attuali', 'Sposta in gruppo', 'Rinomina']);
  if (r === 1 && confirm('Eliminare il preset?')) list.splice(i, 1);
  else if (r === 2) list[i].values = copyGroups(params, {}, Object.keys(GROUPS).filter(g => Object.keys(list[i].values).some(k => GROUPS[g].includes(k))));
  else if (r === 3) { const g = prompt('Nuovo gruppo', list[i].group); if (g) list[i].group = g; }
  else if (r === 4) { const n = prompt('Nuovo nome', list[i].name); if (n) list[i].name = n; }
  else return;
  saveUserPresets(list); thumbCache.clear(); renderPanel();
}

function exportPresets() {
  const blob = new Blob([JSON.stringify(userPresets(), null, 1)], { type: 'application/json' });
  saveFile(new File([blob], 'preset-luce-stanza.json', { type: 'application/json' }));
}

/* Importazione preset Lightroom (.xmp / .lrtemplate) e JSON */
const LR_HSL = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
function lrToValues(get, curves) {
  const v = {}, n = k => { const x = get(k); return x == null || x === '' ? null : parseFloat(x); };
  const set = (key, lrKey, scale = 100, map = x => x / scale) => { const x = n(lrKey); if (x != null && !isNaN(x)) v[key] = map(x); };
  set('exp', 'Exposure2012', 1, x => Math.max(-3, Math.min(3, x))); set('contrast', 'Contrast2012'); set('hi', 'Highlights2012');
  set('sh', 'Shadows2012'); set('wh', 'Whites2012'); set('bl', 'Blacks2012'); set('texture', 'Texture'); set('clarity', 'Clarity2012');
  set('dehaze', 'Dehaze'); set('vib', 'Vibrance'); set('sat', 'Saturation');
  set('temp', 'IncrementalTemperature'); set('tint', 'IncrementalTint');
  if (v.temp == null) set('temp', 'Temperature', 1, x => Math.max(-1, Math.min(1, (x - 5500) / 5000)));
  if (v.tint == null) set('tint', 'Tint', 150);
  const hsl = new Array(24).fill(0); let anyHsl = false;
  LR_HSL.forEach((c, i) => ['HueAdjustment', 'SaturationAdjustment', 'LuminanceAdjustment'].forEach((pre, j) => {
    const x = n(pre + c); if (x != null) { hsl[i * 3 + j] = x / 100; anyHsl = true; }
  }));
  if (anyHsl) v.hsl = hsl;
  for (const [z, lr] of [['s', 'Shadow'], ['m', 'Midtone'], ['h', 'Highlight'], ['g', 'Global']]) {
    set(`g${z}H`, `ColorGrade${lr}Hue`, 1); set(`g${z}S`, `ColorGrade${lr}Sat`); set(`g${z}L`, `ColorGrade${lr}Lum`);
  }
  if (v.gsS == null) { set('gsH', 'SplitToningShadowHue', 1); set('gsS', 'SplitToningShadowSaturation'); }
  if (v.ghS == null) { set('ghH', 'SplitToningHighlightHue', 1); set('ghS', 'SplitToningHighlightSaturation'); }
  set('gBlend', 'ColorGradeBlending'); set('gBal', 'SplitToningBalance');
  set('pcSh', 'ParametricShadows'); set('pcDk', 'ParametricDarks'); set('pcLt', 'ParametricLights'); set('pcHi', 'ParametricHighlights');
  set('pcS1', 'ParametricShadowSplit'); set('pcS2', 'ParametricMidtoneSplit'); set('pcS3', 'ParametricHighlightSplit');
  set('vig', 'PostCropVignetteAmount', 1, x => -x / 100); set('vigMid', 'PostCropVignetteMidpoint', 1, x => x / 100 * 0.8);
  set('vigRound', 'PostCropVignetteRoundness'); set('vigFeather', 'PostCropVignetteFeather'); set('vigHi', 'PostCropVignetteHighlightContrast');
  set('grain', 'GrainAmount'); set('grainSize', 'GrainSize', 1, x => 0.5 + x / 100 * 2.5); set('grainRough', 'GrainFrequency');
  set('sharp', 'Sharpness'); set('sharpRad', 'SharpenRadius', 1); set('sharpDetail', 'SharpenDetail'); set('sharpMask', 'SharpenEdgeMasking');
  set('nrLum', 'LuminanceSmoothing'); set('nrLumDetail', 'LuminanceNoiseReductionDetail'); set('nrLumContrast', 'LuminanceNoiseReductionContrast');
  set('nrCol', 'ColorNoiseReduction'); set('nrColDetail', 'ColorNoiseReductionDetail'); set('nrColSmooth', 'ColorNoiseReductionSmoothness');
  set('calSh', 'ShadowTint'); set('calRH', 'RedHue'); set('calRS', 'RedSaturation'); set('calGH', 'GreenHue'); set('calGS', 'GreenSaturation');
  set('calBH', 'BlueHue'); set('calBS', 'BlueSaturation');
  set('defP', 'DefringePurpleAmount', 20); set('defG', 'DefringeGreenAmount', 20);
  set('lensDist', 'LensManualDistortionAmount', 1, x => -x / 100); set('lensVig', 'VignetteAmount'); set('lensVigMid', 'VignetteMidpoint');
  const gray = get('ConvertToGrayscale');
  if (gray && /true/i.test(gray)) {
    v.mono = 1;
    const bw = new Array(8).fill(0); LR_HSL.forEach((c, i) => { const x = n('GrayMixer' + c); if (x != null) bw[i] = x / 100; }); v.bwm = bw;
  }
  for (const [key, lr] of [['curve', 'ToneCurvePV2012'], ['cr', 'ToneCurvePV2012Red'], ['cg', 'ToneCurvePV2012Green'], ['cb', 'ToneCurvePV2012Blue']]) {
    const c = curves[lr]; if (c && c.length >= 2) v[key] = c.map(([x, y]) => [x / 255, y / 255]);
  }
  return v;
}

function parseXmp(text) {
  const attrs = {};
  for (const m of text.matchAll(/crs:(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  for (const m of text.matchAll(/<crs:(\w+)>([^<]*)<\/crs:\1>/g)) attrs[m[1]] = m[2];
  const curves = {};
  for (const m of text.matchAll(/<crs:(ToneCurvePV2012\w*)>([\s\S]*?)<\/crs:\1>/g))
    curves[m[1]] = [...m[2].matchAll(/<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g)].map(x => [+x[1], +x[2]]);
  const nm = text.match(/<crs:Name>[\s\S]*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/);
  return { name: nm && nm[1], values: lrToValues(k => attrs[k], curves) };
}

function parseLrTemplate(text) {
  const attrs = {}, curves = {};
  for (const m of text.matchAll(/(\w+)\s*=\s*("([^"]*)"|true|false|-?[\d.]+)/g)) attrs[m[1]] = m[3] ?? m[2];
  for (const m of text.matchAll(/(ToneCurvePV2012\w*)\s*=\s*\{([^}]*)\}/g)) {
    const nums = m[2].split(',').map(s => parseFloat(s)).filter(x => !isNaN(x)), pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    curves[m[1]] = pts;
  }
  const nm = text.match(/title\s*=\s*"([^"]*)"/);
  return { name: nm && nm[1], values: lrToValues(k => attrs[k], curves) };
}

async function importPresets(files) {
  const list = userPresets(); let n = 0;
  for (const f of files) {
    try {
      const text = await f.text(), base = f.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(f.name)) { for (const u of JSON.parse(text)) if (u.name && u.values) { list.push(u); n++; } continue; }
      const r = /\.lrtemplate$/i.test(f.name) ? parseLrTemplate(text) : parseXmp(text);
      if (Object.keys(r.values).length) { list.push({ name: r.name || base, group: 'Importati', values: r.values }); n++; }
    } catch (e) { console.warn(f.name, e); }
  }
  saveUserPresets(list); presetCat = n ? 'Importati' : presetCat; renderPanel();
  toast(n ? `${n} preset importati` : 'Nessun preset valido trovato');
}

/* Copia / incolla impostazioni (anche selettiva) */
async function copySettings() {
  const groups = await pickGroups('Copia impostazioni', Object.keys(GROUPS).filter(g => !LOCAL_GROUPS.includes(g)));
  if (!groups) return;
  clipboard = { groups, values: copyGroups(params, {}, groups) }; toast('Impostazioni copiate');
}
function pasteSettings() {
  if (!clipboard) { toast('Prima copia delle impostazioni'); return; }
  commit('Incolla impostazioni'); Object.assign(params, clone(clipboard.values)); renderPanel();
}

/* Versioni */
PANELS['Versioni'] = p => {
  p.append(actions(btn('+ Crea versione', () => {
    const name = prompt('Nome della versione', `Versione ${versions.length + 1}`); if (!name) return;
    versions.push({ name, state: clone(params), date: new Date().toLocaleString('it-IT') }); renderPanel();
  })));
  if (!versions.length) p.append(note('Le versioni sono istantanee con nome della modifica attuale, da riprendere quando vuoi.'));
  versions.forEach((v, i) => p.append(el('div', { className: 'listrow' },
    el('span', { textContent: `${v.name} · ${v.date}` }),
    btn('Applica', () => { commit('Versione: ' + v.name); applyState(v.state); }),
    btn('Aggiorna', () => { v.state = clone(params); toast('Versione aggiornata'); }),
    btn('Rinomina', () => { const n = prompt('Nome', v.name); if (n) { v.name = n; renderPanel(); } }),
    btn('✕', () => { versions.splice(i, 1); renderPanel(); }))));
};

/* Cronologia */
PANELS['Cronologia'] = p => {
  if (!history.undo.length) { p.append(note('Nessuna modifica ancora.')); return; }
  p.append(el('div', { className: 'listrow on' }, el('span', { textContent: 'Stato attuale' })));
  for (let i = history.undo.length - 1; i >= 0; i--)
    p.append(el('div', { className: 'listrow' }, el('span', { textContent: `${i + 1}. prima di: ${history.undo[i].label}` }), btn('Torna qui', () => jumpHistory(i))));
};

/* Info e metadati */
PANELS['Info'] = p => {
  const t = exifData.tags, [w, h] = engine.size;
  const rows = [['File', fileName], ['Dimensioni in modifica', `${w} × ${h} px`], ['Fotocamera', [t.make, t.model].filter(Boolean).join(' ')],
    ['Obiettivo', t.lens], ['Data', t.dateOriginal || t.date], ['ISO', t.iso], ['Tempo', t.exposure ? (t.exposure < 1 ? `1/${Math.round(1 / t.exposure)}` : t.exposure) + ' s' : ''],
    ['Diaframma', t.fnumber ? 'f/' + t.fnumber.toFixed(1) : ''], ['Focale', t.focal ? Math.round(t.focal) + ' mm' : ''], ['Copyright', t.copyright]];
  for (const [k, v] of rows) if (v) p.append(el('div', { className: 'listrow' }, el('span', { className: 'dim', textContent: k }), el('span', { textContent: String(v) })));
  if (!loaded) p.append(note('Apri una foto.'));
};

/* Esportazione */
PANELS['Esporta'] = p => {
  const o = exportOpts;
  const sel = (label, items, key, after) => {
    const s = el('select');
    items.forEach(([v, t]) => s.append(el('option', { value: v, textContent: t, selected: String(v) === String(o[key]) })));
    s.onchange = () => { o[key] = s.value; after ? after() : null; };
    return el('div', { className: 'row' }, el('label', { textContent: label }), s, el('span'));
  };
  const num = (label, key, min, max) => {
    const i = el('input', { type: 'number', min, max, value: o[key], className: 'num' });
    i.onchange = () => { o[key] = Math.max(min, Math.min(max, +i.value || min)); };
    return el('div', { className: 'row' }, el('label', { textContent: label }), i, el('span'));
  };
  const text = (label, key) => {
    const i = el('input', { type: 'text', value: o[key], className: 'num' });
    i.oninput = () => { o[key] = i.value; };
    return el('div', { className: 'row' }, el('label', { textContent: label }), i, el('span'));
  };
  const fmts = [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/tiff', 'TIFF (8 bit)'], ['image/webp', 'WebP'], ...(supportsAvif ? [['image/avif', 'AVIF']] : [])];
  p.append(section('File'), sel('Formato', fmts, 'fmt', renderPanel),
    ['image/jpeg', 'image/webp', 'image/avif'].includes(o.fmt) ? slider('Qualità', 0.3, 1, 0.01, () => o.quality, v => { o.quality = v; }, { neutral: 0.92 }) : null,
    text('Nome file', 'name'), note('Segnaposto: {nome} {data} {ora} {n}'),
    section('Dimensioni'), sel('Ridimensiona', [['orig', 'Originale'], ['long', 'Lato lungo (px)'], ['short', 'Lato corto (px)'], ['w', 'Larghezza (px)'], ['h', 'Altezza (px)'], ['pct', 'Percentuale']], 'sizeMode', renderPanel),
    o.sizeMode !== 'orig' ? num(o.sizeMode === 'pct' ? 'Percentuale' : 'Pixel', 'sizeVal', 1, 20000) : null,
    num('Risoluzione (DPI)', 'dpi', 1, 2400),
    note('Spazio colore: sRGB.'),
    section('Nitidezza di output'), sel('Livello', [['none', 'Nessuna'], ['low', 'Bassa'], ['std', 'Standard'], ['high', 'Alta']], 'outSharp'),
    sel('Per', [['screen', 'Schermo'], ['matte', 'Carta opaca'], ['glossy', 'Carta lucida']], 'outSharpType'),
    section('Filigrana'), sel('Tipo', [['none', 'Nessuna'], ['text', 'Testo'], ['image', 'Immagine']], 'wm', renderPanel));
  if (o.wm === 'text') p.append(text('Testo', 'wmText'), el('div', { className: 'row' }, el('label', { textContent: 'Colore' }),
    Object.assign(el('input', { type: 'color', value: o.wmColor }), { oninput: e => { o.wmColor = e.target.value; } }), el('span')));
  if (o.wm === 'image') p.append(actions(btn(o.wmImage ? 'Cambia immagine' : 'Scegli immagine (PNG)', () => $('fileWm').click())));
  if (o.wm !== 'none') p.append(slider('Dimensione', 1, 25, 0.5, () => o.wmSize, v => { o.wmSize = v; }, { neutral: 4 }),
    slider('Opacità', 0.05, 1, 0.01, () => o.wmOpacity, v => { o.wmOpacity = v; }, { neutral: 0.6 }),
    slider('Margine', 0, 15, 0.5, () => o.wmMargin, v => { o.wmMargin = v; }, { neutral: 3 }),
    sel('Posizione', [['tl', 'In alto a sinistra'], ['t', 'In alto'], ['tr', 'In alto a destra'], ['l', 'Sinistra'], ['c', 'Centro'], ['r', 'Destra'],
      ['bl', 'In basso a sinistra'], ['b', 'In basso'], ['br', 'In basso a destra']], 'wmPos'));
  p.append(section('Metadati'), sel('Includi', [['all', 'Tutti'], ['nogps', 'Tutti tranne posizione GPS'], ['copyright', 'Solo copyright'], ['none', 'Nessuno']], 'meta'),
    text('Copyright', 'copyright'), note('I metadati originali vengono copiati solo nei JPEG.'),
    actions(btn('Esporta ora', exportImage, 'primary')));
};

async function exportImage() {
  if (!loaded) return;
  toast('Esportazione in corso…');
  try { const f = await buildExport(params); await saveFile(f); toast('Esportato: ' + f.name); }
  catch (e) { alert('Errore di esportazione: ' + e.message); }
  redraw();
}

/* ---------- Caricamento ---------- */

async function openFile(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { alert('Formato non supportato dal browser (i RAW arriveranno in una fase successiva).'); return; }
  fileName = file.name.replace(/\.[^.]+$/, '');
  exifData = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  // sempre tramite canvas: con un ImageBitmap il browser ignora UNPACK_FLIP_Y e l'immagine risulterebbe capovolta
  const fit = max => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = el('canvas', { width: w, height: h }); c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return [c, w, h];
  };
  const [src, w, h] = fit(engine.maxSize);
  engine.setImage(src, w, h);
  const [ts, tw, th] = fit(256);
  thumbEngine.setImage(ts, tw, th); thumbCache.clear();
  setAnalysisImage(bmp);
  for (const k in brushCache) delete brushCache[k];
  loaded = true; params = defaults(); curPreset = null; versions = []; selSpot = -1; maskIdx = 0;
  history.undo.length = history.redo.length = 0;
  view.scale = 1; view.x = view.y = 0;
  $('empty').hidden = true; $('hist').hidden = false;
  renderPanel(); syncButtons();
}

async function openLut(file) {
  try {
    const { data, n } = parseCube(await file.text());
    engine.setLut(data, n); lutName = file.name; params.lutAmt = 1;
    renderPanel();
  } catch (e) { alert(e.message); }
}

/* ---------- Avvio ---------- */

window.addEventListener('DOMContentLoaded', () => {
  try {
    engine = new Engine($('view'));
    thumbEngine = new Engine(document.createElement('canvas'));
  } catch (e) { $('empty').textContent = 'Errore grafico: ' + e.message; console.error(e); return; }
  renderTabs(); renderPanel(); syncButtons(); setupGestures();
  $('btnOpen').onclick = () => $('file').click();
  $('file').onchange = e => { e.target.files[0] && openFile(e.target.files[0]); e.target.value = ''; };
  $('fileLut').onchange = e => { e.target.files[0] && openLut(e.target.files[0]); e.target.value = ''; };
  $('filePreset').onchange = e => { e.target.files.length && importPresets([...e.target.files]); e.target.value = ''; };
  $('fileWm').onchange = async e => { const f = e.target.files[0]; if (f) { exportOpts.wmImage = await createImageBitmap(f); renderPanel(); } e.target.value = ''; };
  $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
  $('btnExport').onclick = exportImage;
  const cmp = $('btnCompare');
  const setCmp = v => { comparing = v; cmp.classList.toggle('on', v); redraw(); };
  cmp.addEventListener('pointerdown', () => setCmp(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => setCmp(false));
  window.addEventListener('resize', redraw);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
});
