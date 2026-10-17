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

/* Barra strumenti in stile Lightroom: ogni strumento raggruppa uno o più pannelli, che si aprono in una
   tendina richiudibile sopra la barra (l'immagine resta protagonista). sheet: false = la tendina resta chiusa
   finché non si sceglie un pannello; auto: pulsante AUTO in testa alla riga dei pannelli.
   Versioni, Cronologia, Info, Organizza ed Esporta si aprono dal menu ⋮ in alto. */
const TOOLS = [
  { label: 'Preset', icon: 'M4 6h16M4 12h16M4 18h10', subs: ['Preset', 'Profili', 'LUT'] },
  { label: 'Modifica', icon: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4', auto: true, sheet: false, subs: ['Luce', 'Curva', 'Colore', 'Mixer', 'Colore punto', 'Gradazione', 'B&N', 'Effetti', 'Dettagli', 'Ottica', 'Sfocatura', 'Calibrazione'] },
  { label: 'Ritaglia', icon: 'M6 2v16h16M2 6h16v16', subs: ['Ritaglio', 'Trasforma'] },
  { label: 'Maschere', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18', subs: ['Maschere'] },
  { label: 'Ritocco', icon: 'M4 20l10-10M14 4l6 6-4 4-6-6zM4 20h5', subs: ['Ritocco', 'Beauty', 'Sfondo'] },
  { label: 'AI', icon: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z', subs: ['Look AI', 'Super Resolution', 'Profondità'] },
  { label: 'Pubblica', icon: 'M12 3v12M8 7l4-4 4 4M5 12v7h14v-7', subs: ['Social', 'Testo', 'Prima/Dopo'] },
];
/* Modalità semplice, pensata per foto di moda e beauty: look, regolazioni essenziali, beauty, sfondo, ritaglio, pubblicazione */
const ICON_FACE = 'M12 3a8 9 0 1 0 0.01 0zM9 10h.01M15 10h.01M9 14.5c1.6 1.6 4.4 1.6 6 0';
const ICON_BG = 'M3 3h18v18H3zM12 6.5a2.5 2.5 0 1 0 0.01 0zM7 21c.5-4 2.5-6 5-6s4.5 2 5 6';
const TOOLS_SIMPLE = [
  { label: 'Look', icon: 'M4 6h16M4 12h16M4 18h10', subs: ['Preset', 'Look AI'] },
  { label: 'Regola', icon: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4', subs: ['Semplice'] },
  { label: 'Beauty', icon: ICON_FACE, subs: ['Beauty'] },
  { label: 'Sfondo', icon: ICON_BG, subs: ['Sfondo'] },
  { label: 'Ritaglia', icon: 'M6 2v16h16M2 6h16v16', subs: ['Ritaglio'] },
  { label: 'Pubblica', icon: 'M12 3v12M8 7l4-4 4 4M5 12v7h14v-7', subs: ['Social', 'Testo', 'Prima/Dopo'] },
];
const activeTools = () => (appSettings.simpleMode ? TOOLS_SIMPLE : TOOLS);
function setSimpleMode(on) {
  appSettings.simpleMode = !!on; saveAppSettings();
  if (!activeTools().some(t => t.subs?.includes(curTab))) curTab = on ? 'Semplice' : 'Luce';
  if (on && presetCat === 'Tutti') presetCat = 'Moda e beauty';
  renderTabs(); renderPanel();
  toast(on ? 'Modalità semplice: solo gli strumenti essenziali' : 'Modalità completa: tutti gli strumenti');
}
const SUB_LABEL = { 'Preset': 'Preset', 'Trasforma': 'Geometria', 'Colore punto': 'Punto', 'Super Resolution': 'Super Res.', 'Calibrazione': 'Calibraz.' };

/* Icone (tratti su griglia 24×24) */
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const ICONS = {
  'Preset': 'M4 6h16M4 12h16M4 18h10', 'Profili': 'M4 4h11v11H4zM9 9h11v11H9z', 'LUT': 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  'Luce': circ(12, 12, 4) + 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  'Curva': 'M4 4v16h16M5 19C10 19 11 5 19 5', 'Colore': 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 11v6',
  'Mixer': 'M6 4v16M12 4v16M18 4v16M4 8h4M10 15h4M16 10h4', 'Colore punto': circ(12, 12, 3) + 'M12 3v5M12 16v5M3 12h5M16 12h5',
  'Gradazione': circ(9, 9, 5) + circ(15, 9, 5) + circ(12, 15, 5), 'B&N': circ(12, 12, 9) + 'M12 3v18M12 7h6M12 11h8M12 15h7',
  'Effetti': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z',
  'Dettagli': 'M12 3l9 17H3z', 'Ottica': circ(12, 12, 9) + circ(12, 12, 4) + 'M12 3v5M12 16v5',
  'Sfocatura': 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11zM9 15a3 3 0 0 0 3 3', 'Calibrazione': 'M3 12h4l2-6 4 12 2-6h6',
  'Ritaglio': 'M6 2v16h16M2 6h16v16', 'Trasforma': 'M4 20L8 4h8l4 16zM9 12h6M12 4v16',
  'Maschere': circ(12, 12, 9) + 'M12 3v18', 'Ritocco': 'M4 20l10-10M14 4l6 6-4 4-6-6zM4 20h5',
  'Look AI': 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  'Super Resolution': 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7', 'Profondità': 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  'Versioni': 'M7 3h10v4H7zM4 9h16v12H4z', 'Cronologia': circ(12, 12, 9) + 'M12 7v5l3 3', 'Info': circ(12, 12, 9) + 'M12 11v6M12 7.5v.01',
  'Organizza': 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', 'Esporta': 'M12 3v12M7 10l5 5 5-5M5 20h14',
  // sezioni
  'Presenza': 'M12 3l9 17H3zM12 10v4', 'Granulosità': 'M6 6h.01M12 5h.01M18 7h.01M7 12h.01M13 11h.01M17 13h.01M5 18h.01M11 17h.01M18 18h.01M9 8.5h.01M15 15h.01',
  'Vignettatura': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' + circ(12, 12, 5), 'Creativi': 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  'Nitidezza': 'M12 3l9 17H3z', 'Riduzione disturbo luminanza': 'M4 12c2-4 4-4 6 0s4 4 6 0 3-3 4-1', 'Riduzione disturbo colore': 'M4 12c2-4 4-4 6 0s4 4 6 0 3-3 4-1M4 18h16',
  'Aberrazione cromatica': circ(10, 12, 6) + circ(14, 12, 6), 'Frange viola': circ(12, 12, 8) + 'M12 4v16', 'Frange verdi': circ(12, 12, 8) + 'M4 12h16',
  'Correzione obiettivo manuale': circ(12, 12, 9) + circ(12, 12, 4), 'Ombre': 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  'Primario rosso': circ(12, 12, 7), 'Primario verde': circ(12, 12, 7), 'Primario blu': circ(12, 12, 7), 'Sovrapposizione': 'M4 8h12v12H4zM8 4h12v12',
  'Luce (maschera)': circ(12, 12, 4) + 'M12 2v3M12 19v3M2 12h3M19 12h3', 'Colore (maschera)': 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z',
  'Effetti (maschera)': 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
};
ICONS.Beauty = ICON_FACE; ICONS.Semplice = 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4'; ICONS.Sfondo = ICON_BG;
ICONS.Social = 'M4 4h16v16H4zM4 15l4-4 4 4 3-3 5 5M15.5 8.5h.01'; ICONS.Testo = 'M5 5h14M12 5v14M9 19h6';
ICONS['Prima/Dopo'] = 'M4 4h16v16H4zM12 4v16M7 9l-2 3 2 3M17 9l2 3-2 3';
const GROUP_COL = { 'Primario rosso': '#ff5252', 'Primario verde': '#4caf50', 'Primario blu': '#448aff' };
function svgIcon(d, size = 22) {
  const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('width', size); sv.setAttribute('height', size); sv.classList.add('ic');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); sv.append(path);
  return sv;
}
const TAB_ORDER = [...TOOLS, ...TOOLS_SIMPLE].flatMap(t => t.subs || []);

const $ = id => document.getElementById(id);
let params = defaults();
let engine, thumbEngine, loaded = false, curTab = 'Preset', comparing = false;
let fileName = 'foto', lutName = '', exifData = { app1: null, tags: {} };
let bandIdx = 0, hslMode = 'color', curveMode = 'point', curveCh = 'curve', gradeZone = 'all';
let maskIdx = 0, compIdx = 0, overlayOn = true, overlayCol = [1, 0.2, 0.2, 0.5], brushMode = false;
let pcIdx = 0, pcShowRange = false, guidedOn = false;
let curPreset = null, presetAmt = 1, presetCat = 'Tutti', presetQuery = '', presetManage = false, profGroup = 'Base';
let clipboard = null, versions = [], prevEdits = null, menuTab = 'Preset', sheetOpen = false;
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

/* Formato del valore mostrato: valori piccoli come in Lightroom (−100…+100), il resto con decimali */
function sliderFmt(min, max, step, o) {
  if (step >= 1) return { show: v => String(Math.round(v)), parse: t => parseFloat(t) };
  const sign = v => (min < 0 && v > 0 ? '+' : '');
  if (o.dec || max - min > 4) { const d = o.dec || 2; return { show: v => sign(v) + (+v).toFixed(d), parse: t => parseFloat(t.replace(',', '.')) }; }
  return { show: v => sign(v) + Math.round(v * 100), parse: t => parseFloat(t.replace(',', '.')) / 100 };
}

/* Slider a prova di tocchi accidentali:
   - si regola solo trascinando in orizzontale (in modo relativo: un tocco non fa saltare il valore)
   - un trascinamento verticale scorre il pannello
   - doppio tocco = valore neutro, tocco sul numero = inserimento preciso */
function slider(label, min, max, step, get, set, o = {}) {
  const neutral = o.neutral ?? 0, fmt = sliderFmt(min, max, step, o);
  const rail = el('i', { className: 'rail' + (o.bg ? ' grad' : '') }), fill = el('i', { className: 'fill' }), knob = el('i', { className: 'knob' });
  if (o.bg) rail.style.background = o.bg;
  const track = el('div', { className: 'track' }, el('div', { className: 'tin' }, rail, fill, knob));
  const out = el('output');
  const row = el('div', { className: 'sl' }, el('label', { textContent: label }), out, track);
  const z = Math.min(1, Math.max(0, (neutral - min) / (max - min)));
  const paint = v => {
    const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
    knob.style.left = t * 100 + '%'; fill.style.left = Math.min(t, z) * 100 + '%'; fill.style.width = Math.abs(t - z) * 100 + '%';
    out.textContent = fmt.show(v);
    row.classList.toggle('mod', Math.abs(v - neutral) > 1e-9);
    const g = row.closest('.grp'); if (g) g.classList.toggle('mod', !!g.querySelector('.sl.mod'));
  };
  const setV = v => {
    v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
    v = +v.toFixed(6); set(v); paint(v); o.onInput?.(); redraw();
  };
  let st = null, lastTap = 0;
  track.addEventListener('pointerdown', e => { st = { x: e.clientX, y: e.clientY, v: +get(), active: false, w: Math.max(1, track.clientWidth - 20) }; });
  track.addEventListener('pointermove', e => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
      if (Math.abs(dx) < 8) return;
      st.active = true; st.x = e.clientX; st.before = clone(params);
      track.setPointerCapture(e.pointerId); row.classList.add('drag');
      return;
    }
    setV(st.v + dx / st.w * (max - min));
  });
  const up = e => {
    if (!st) return;
    if (st.active) pushHistory(label, st.before);
    else if (e.type === 'pointerup') {
      const now = Date.now();
      if (now - lastTap < 350) { commit(label); setV(neutral); lastTap = 0; } else lastTap = now;
    }
    row.classList.remove('drag'); st = null;
  };
  track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
  out.addEventListener('click', () => {
    const t = prompt(label, fmt.show(get())); if (t == null) return;
    const v = fmt.parse(t); if (isNaN(v)) return;
    commit(label); setV(v);
  });
  paint(+get());
  return row;
}

/* Sezione richiudibile; il puntino segnala che contiene valori modificati */
const groupOpen = {};
function group(title, open, ...kids) {
  const d = el('details', { className: 'grp' });
  d.open = groupOpen[title] ?? open;
  const ic = ICONS[title] ? svgIcon(ICONS[title], 18) : null;
  if (ic && GROUP_COL[title]) ic.style.color = GROUP_COL[title];
  d.append(el('summary', {}, ic, el('span', { textContent: title }), el('i', { className: 'dot' })), ...kids.filter(k => k != null));
  d.addEventListener('toggle', () => { groupOpen[title] = d.open; });
  d.classList.toggle('mod', !!d.querySelector('.sl.mod'));
  return d;
}
/* Slider legato a una chiave di params */
const S = (k, label, min, max, step = 0.01, o = {}) =>
  slider(label, min, max, step, () => params[k], v => { params[k] = v; }, { neutral: defaults()[k], bg: BG[k], ...o });

/* ui = true: interruttore dell'interfaccia, non entra nella cronologia */
function toggle(label, get, set, ui = false) {
  // nella libreria si ridisegna la libreria, nell'editor il pannello aperto
  return btn(label, () => { if (!ui) commit(label); set(!get()); if ($('editorView').hidden) renderLibrary(); else renderPanel(); }, 'tog' + (get() ? ' on' : ''));
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
  setTimeout(syncButtons); scheduleSave();
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
  $('btnReset').disabled = !loaded || !isEdited(params);
  $('btnExport').disabled = !loaded;
}
/* Ripristina tutte le modifiche (annullabile) */
function resetAll() {
  if (!loaded || !isEdited(params)) return;
  commit('Ripristina tutto'); params = defaults(); curPreset = null; lookLast = null;
  renderPanel(); syncButtons(); toast('Modifiche ripristinate · ↶ per annullare');
}
function applyState(s) { params = clone(s); renderPanel(); redraw(); syncButtons(); scheduleSave(); }

/* ---------- Disegno ---------- */

function viewSize() {
  const st = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const [ow, oh] = engine.outputSize(params, tool.mode === 'crop');
  const s = Math.min(st.width / ow, st.height / oh);
  const k = Math.min(1, (ow * s * dpr * Math.max(1, view.scale)) / ow, engine.maxSize / Math.max(ow, oh));
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
      showSkin: curTab === 'Beauty' && showSkin,
      clip: appSettings.viewClip && !comparing,
    });
    const cv = $('view');
    cv.style.width = Math.round(cw) + 'px'; cv.style.height = Math.round(ch) + 'px';
    applyView(); if (appSettings.viewHist) drawHistogram(); drawOverlay();
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
    : curTab === 'Maschere' && m ? (brushMode && m.comps.some(c => c.type === 'brush') ? 'brush' : 'maskHandle')
    : curTab === 'Testo' && params.texts.length ? 'text'
    : curTab === 'Social' && socialCur && socialFit(socialCur) === 'crop' && frameRect(params, socialCur) ? 'frame' : null;
  if (tool.mode === 'crop' && prev !== 'crop') { view.scale = 1; view.x = view.y = 0; }
  if (prev !== tool.mode) redraw();
}

/* ---------- Schede ---------- */

function renderTabs() {
  const tool = activeTools().find(t => t.subs?.includes(curTab));
  if (tool) menuTab = curTab;
  const nav = $('tools'); nav.innerHTML = '';
  for (const t of activeTools()) {
    const on = t === tool;
    const b = el('button', { className: 'toolbtn' + (on ? ' on' : ''), title: t.label, onclick: () => {
      if (on) sheetOpen = !sheetOpen;                    // secondo tocco: apre/chiude la tendina
      else { curTab = t.lastSub || t.subs[0]; sheetOpen = t.sheet !== false; }
      renderTabs(); renderPanel();
    } });
    b.setAttribute('aria-label', t.label);
    b.append(svgIcon(t.icon), el('span', { textContent: t.label }));
    nav.append(b);
  }
  const sub = $('tabs'); sub.innerHTML = ''; sub.hidden = !tool || (tool.subs.length < 2 && !tool.auto);
  if (tool) {
    tool.lastSub = curTab;
    if (tool.auto) sub.append(el('button', { className: 'auto', onclick: autoTone }, el('span', { textContent: 'AUTO' })));
    for (const name of tool.subs) {
      const b = el('button', { className: name === curTab && sheetOpen ? 'on' : '', onclick: () => {
        if (name === curTab) sheetOpen = !sheetOpen; else { curTab = name; sheetOpen = true; }
        renderTabs(); renderPanel();
      } });
      if (ICONS[name]) b.append(svgIcon(ICONS[name], 20));
      b.append(el('span', { textContent: SUB_LABEL[name] || name }));
      sub.append(b);
    }
    sub.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
}
/* Apre un pannello qualsiasi nella tendina (usato dal menu e dai collegamenti tra pannelli) */
function showTab(name) { curTab = name; sheetOpen = true; renderTabs(); renderPanel(); }
function closeSheet() {
  if (!activeTools().some(t => t.subs?.includes(curTab))) curTab = menuTab;   // pannello del menu: torna allo strumento
  sheetOpen = false; renderTabs(); renderPanel();
}

const PANELS = {};
function renderPanel() {
  const panel = $('panel');
  const fromMenu = !activeTools().some(t => t.subs?.includes(curTab));
  panel.hidden = !sheetOpen; panel.classList.toggle('tall', fromMenu);
  if (sheetOpen) {
    const same = panel.dataset.tab === curTab, top = panel.scrollTop;
    panel.innerHTML = ''; panel.dataset.tab = curTab;
    const append = panel.append.bind(panel);
    const grip = el('div', { className: 'grip', title: 'Chiudi', onclick: closeSheet }, el('i'));
    let y0 = null;                                       // trascinando la maniglia verso il basso si chiude
    grip.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    grip.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 30) closeSheet(); y0 = null; });
    append(grip);
    if (fromMenu)                                        // pannello aperto dal menu: titolo e chiusura
      append(el('div', { className: 'phead' }, el('b', {}, ICONS[curTab] ? svgIcon(ICONS[curTab], 20) : null, curTab),
        btn('✕', closeSheet, 'ibtn')));
    PANELS[curTab]({ append: (...k) => append(...k.filter(x => x != null)) });
    panel.scrollTop = same ? top : 0;
  }
  syncToolMode(); redraw();
}

/* Luce */
/* Modalità semplice: i controlli essenziali, con nomi comprensibili */
PANELS['Semplice'] = p => {
  p.append(actions(btn('Auto', autoTone, 'primary'), btn('Colori fedeli (tocca un grigio o un bianco)', () => startPick('Tocca un punto che dovrebbe essere grigio o bianco', ({ rgb }) => {
      commit('Colori fedeli'); const t = wbFromColor(rgb); Object.assign(params, { wb: 'custom', temp: t.temp, tint: t.tint }); renderPanel();
    }))),
    S('exp', 'Luminosità', -3, 3, 0.01, { bg: BG.exp }), S('contrast', 'Contrasto', -1, 1),
    S('hi', 'Alte luci', -1, 1), S('sh', 'Ombre', -1, 1),
    S('temp', 'Calore', -1, 1, 0.01, { bg: BG.temp }), S('tint', 'Tinta (verde ↔ rosa)', -1, 1, 0.01, { bg: BG.tint }),
    S('vib', 'Vividezza', -1, 1), S('sat', 'Saturazione', -1, 1, 0.01, { bg: BG.sat }),
    S('texture', 'Texture', -1, 1), S('clarity', 'Definizione', -1, 1), S('glow', 'Bagliore morbido', 0, 1), S('vig', 'Vignettatura', -1, 1),
    note('Per tutti gli strumenti passa alla modalità completa dal menu ⋮.'));
};

/* Beauty: la pelle viene ritoccata con la separazione delle frequenze. Senza analisi del viso è riconosciuta dal colore;
   con l'analisi (AI, MediaPipe) pelle, labbra, palpebre, occhi e denti sono zone precise e si sbloccano trucco, occhi e denti */
let showSkin = false, faceBusy = false;
const BEAUTY_KEYS = ['bSmooth', 'bEven', 'bBright', 'bShine', 'bMakeup', 'bEyes', 'bTeeth'];
const BEAUTY_LEVELS = { none: [0, 0, 0, 0, 0, 0, 0], soft: [0.35, 0.25, 0.08, 0.2, 0.2, 0.2, 0.2],
  medium: [0.55, 0.4, 0.12, 0.35, 0.35, 0.35, 0.3], strong: [0.8, 0.55, 0.18, 0.5, 0.5, 0.5, 0.45] };

async function runFaceAnalysis(bar) {
  if (faceBusy || !curSrc || !curPhoto) return false;
  faceBusy = true; if (bar) bar.hidden = false;
  try {
    const r = await faceMap(curSrc, (v, label) => bar?.set(v, label));
    setFaceCanvas(r.canvas);
    await DB.put('depth', await new Promise(res => r.canvas.toBlob(res, 'image/png')), curPhoto.id + '#face');
    toast(r.faces ? (r.faces === 1 ? 'Viso riconosciuto' : `${r.faces} visi riconosciuti`) : 'Nessun viso trovato: riconosciute pelle e persona');
    return true;
  } catch (e) { alert('Analisi del viso: ' + e.message); console.error(e); return false; }
  finally { faceBusy = false; if (bar) bar.hidden = true; redraw(); }
}

PANELS['Beauty'] = p => {
  const cur = BEAUTY_KEYS.map(k => params[k]);
  const level = Object.keys(BEAUTY_LEVELS).find(k => BEAUTY_LEVELS[k].every((v, i) => Math.abs(v - cur[i]) < 1e-3)) || '';
  const bar = progressBar(); bar.hidden = true;
  p.append(chips([['none', 'Nessuno'], ['soft', 'Naturale'], ['medium', 'Medio'], ['strong', 'Intenso']], level, async v => {
    commit('Beauty'); BEAUTY_KEYS.forEach((k, i) => { params[k] = BEAUTY_LEVELS[v][i]; }); renderPanel();
    if (v !== 'none' && !engine.hasFace && !faceBusy) { await runFaceAnalysis(); renderPanel(); }   // la prima volta analizza il viso
  }));
  if (!engine.hasFace) p.append(actions(btn(faceBusy ? 'Analisi in corso…' : 'Riconosci viso (AI)', async () => { await runFaceAnalysis(bar); renderPanel(); }, 'primary')), bar,
    note('L\'AI trova pelle, labbra, occhi, denti e capelli: il ritocco tocca solo la pelle e si sbloccano trucco, occhi e denti. Funziona offline, sul telefono.'));
  p.append(group('Pelle', true, S('bSmooth', 'Levigatura pelle', 0, 1), S('bEven', 'Uniforma incarnato', 0, 1),
    S('bBright', 'Luminosità pelle', -0.5, 1), S('bShine', 'Riduci lucidità', 0, 1)));
  if (engine.hasFace) p.append(group('Trucco, occhi e denti', true, S('bMakeup', 'Esalta trucco', 0, 1), S('bEyes', 'Occhi luminosi', 0, 1),
    S('bTeeth', 'Denti più bianchi', 0, 1)));
  p.append(actions(toggle(engine.hasFace ? 'Mostra zone riconosciute' : 'Mostra pelle rilevata', () => showSkin, v => { showSkin = v; }, true),
    engine.hasFace ? btn(faceBusy ? 'Analisi in corso…' : 'Rianalizza viso', async () => { await runFaceAnalysis(bar); renderPanel(); }) : null), engine.hasFace ? bar : null,
    note(engine.hasFace ? 'Leviga le imperfezioni conservando i pori. Esalta trucco agisce su labbra e palpebre, Occhi su iride e bianco dell\'occhio.'
      : 'Senza analisi la pelle è riconosciuta dal colore: può toccare anche capelli chiari, legno o sabbia.'));
};

PANELS['Luce'] = p => {
  p.append(S('exp', 'Esposizione', -3, 3, 0.01, { bg: BG.exp }), S('contrast', 'Contrasto', -1, 1), S('hi', 'Alte luci', -1, 1), S('sh', 'Ombre', -1, 1),
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

/* getPts: restituisce l'array di punti da modificare (curva globale o curva di una maschera) */
function curveCanvas(readOnly, getPts = () => params[curveCh], color) {
  const col = color || { curve: '#4da3ff', cr: '#ff5252', cg: '#4caf50', cb: '#448aff' }[curveCh];
  const cv = el('canvas', { id: 'curve', width: 260, height: 260 }), ctx = cv.getContext('2d');
  let drag = -1, before = null;
  const pts = getPts;
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
  p.append(group('Presenza', true, S('texture', 'Texture', -1, 1), S('clarity', 'Chiarezza', -1, 1), S('dehaze', 'Rimozione foschia', -1, 1)),
    group('Granulosità', true, S('grain', 'Quantità', 0, 1), S('grainSize', 'Dimensione', 0.5, 3, 0.01, { dec: 2 }), S('grainRough', 'Ruvidità', 0, 1),
      note('La grana spezza leggermente i dettagli come la pellicola; con dimensione alta li ammorbidisce. Valutala ingrandendo al 100%.')),
    group('Vignettatura', false, S('vig', 'Quantità', -1, 1), S('vigMid', 'Punto medio', 0, 1), S('vigRound', 'Rotondità', -1, 1),
      S('vigFeather', 'Sfumatura', 0, 1), S('vigHi', 'Alte luci', 0, 1)),
    group('Creativi', false, S('fade', 'Dissolvenza neri', 0, 1), S('glow', 'Bagliore', 0, 1), S('halation', 'Alone pellicola', 0, 1),
      S('ca', 'Aberrazione cromatica', 0, 1)));
};

/* Dettagli */
PANELS['Dettagli'] = p => {
  p.append(group('Nitidezza', true, S('sharp', 'Quantità', 0, 2), S('sharpRad', 'Raggio', 0.5, 3, 0.01, { dec: 1 }), S('sharpDetail', 'Dettagli', 0, 1),
    S('sharpMask', 'Mascheratura', 0, 1)),
    group('Riduzione disturbo luminanza', false, S('nrLum', 'Luminanza', 0, 1), S('nrLumDetail', 'Dettagli', 0, 1), S('nrLumContrast', 'Contrasto', 0, 1)),
    group('Riduzione disturbo colore', false, S('nrCol', 'Colore', 0, 1), S('nrColDetail', 'Dettagli', 0, 1), S('nrColSmooth', 'Uniformità', 0, 1)),
    note('Suggerimento: ingrandisci con due dita per valutare nitidezza e rumore.'));
};

/* Ottica */
PANELS['Ottica'] = p => {
  p.append(group('Aberrazione cromatica', true, S('caR', 'Rosso / ciano', -1, 1), S('caB', 'Blu / giallo', -1, 1)),
    group('Frange viola', false, S('defP', 'Quantità', 0, 1), S('defPLo', 'Tonalità da', 220, 360, 1, { bg: HUE_BG }), S('defPHi', 'Tonalità a', 220, 360, 1, { bg: HUE_BG })),
    group('Frange verdi', false, S('defG', 'Quantità', 0, 1), S('defGLo', 'Tonalità da', 40, 200, 1, { bg: HUE_BG }), S('defGHi', 'Tonalità a', 40, 200, 1, { bg: HUE_BG })),
    group('Correzione obiettivo manuale', false, S('lensDist', 'Distorsione', -1, 1), S('lensVig', 'Vignettatura obiettivo', -1, 1), S('lensVigMid', 'Punto medio', 0, 1),
      note('I profili automatici degli obiettivi richiederebbero un database esterno: qui la correzione è manuale.')));
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
    chips([['depth', 'Profondità AI'], ['radial', 'Fuoco circolare'], ['linear', 'Fuoco a fascia (tilt-shift)']], params.lbType, v => {
      if (v === 'depth' && !engine.hasDepth) { showTab('Profondità'); toast('Calcola prima la mappa di profondità'); return; }
      commit('Sfocatura'); params.lbType = v; renderPanel();
    }),
    params.lbType === 'depth' ? S('lbFocus', 'Profondità a fuoco', 0, 1, 0.01, { bg: 'linear-gradient(90deg,#000,#fff)' }) : null,
    S('lbSize', 'Intervallo di fuoco', 0, 0.8), S('lbFeather', 'Transizione', 0, 1),
    params.lbType === 'linear' ? S('lbAngle', 'Angolo', -90, 90, 1) : null,
    S('lbBokeh', 'Luci del bokeh', 0, 1),
    note(params.lbType === 'depth' ? 'Tocca il soggetto da mettere a fuoco: la sfocatura segue la distanza stimata dalla mappa di profondità.'
      : 'Tocca o trascina sull\'immagine per scegliere il punto a fuoco.'));
};

/* Maschere */
const MASK_TYPES = [['brush', 'Pennello'], ['linear', 'Sfumatura lineare'], ['radial', 'Sfumatura radiale'], ['color', 'Intervallo colore'], ['lum', 'Intervallo luminanza'], ['depth', 'Intervallo profondità'], ['face', 'Persona e viso (AI)']];
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
      if (sel.value === 'face') { params.masks[maskIdx].name = FACE_PARTS[5]; if (!engine.hasFace) runFaceAnalysis().then(() => renderPanel()); }
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
  group('Sovrapposizione', false, actions(toggle('Mostra sovrapposizione', () => overlayOn, v => { overlayOn = v; }, true),
    ...[[1, 0.2, 0.2], [0.2, 1, 0.3], [0.3, 0.5, 1], [1, 1, 1]].map(c => el('button', { className: 'chip' + (c.every((v, i) => v === overlayCol[i]) ? ' on' : ''),
      style: `background:rgb(${c.map(v => v * 255).join(',')})`, onclick: () => { overlayCol = [...c, overlayCol[3]]; renderPanel(); } }))),
  slider('Opacità sovrapposizione', 0.1, 1, 0.01, () => overlayCol[3], v => { overlayCol[3] = v; }, { neutral: 0.5 })));

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
      if (t === 'face' && !engine.hasFace) runFaceAnalysis().then(() => renderPanel());
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
    if (c.type === 'depth') {
      if (!engine.hasDepth) p.append(note('Serve la mappa di profondità: AI → Profondità.'));
      C('lo', 'Da (lontano)', 0, 1); C('hi', 'A (vicino)', 0, 1, 0.01, 1); C('smooth', 'Morbidezza', 0, 0.5, 0.01, 0.1);
      p.append(actions(btn('Campiona profondità', () => startPick('Tocca la zona da selezionare', ({ ic }) => {
        const d = depthAt(ic); commit('Campiona'); c.lo = Math.max(0, d - 0.12); c.hi = Math.min(1, d + 0.12); renderPanel();
      }))));
    }
    if (c.type === 'face') {
      if (!engine.hasFace) p.append(note(faceBusy ? 'Analisi del viso in corso…' : 'Serve l\'analisi del viso.'), actions(btn('Riconosci viso (AI)', () => runFaceAnalysis().then(() => renderPanel()), 'primary')));
      p.append(chips(FACE_PARTS.map((n, i) => [i, n]), c.part, v => {
        commit('Maschera'); c.part = +v;
        if (m.comps.length === 1 && (FACE_PARTS.includes(m.name) || /^Maschera \d+$/.test(m.name))) m.name = FACE_PARTS[c.part];
        renderPanel();
      }));
    }
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
  const A = (k, label, min, max, step = 0.01, o = {}) => slider(label, min, max, step, () => a[k], v => { a[k] = v; }, { neutral: defMaskAdj()[k], ...o });
  p.append(section('Regolazioni della maschera'), slider('Quantità', 0, 2, 0.01, () => m.amount, v => { m.amount = v; }, { neutral: 1 }),
    group('Luce (maschera)', true, A('exp', 'Esposizione', -3, 3), A('contrast', 'Contrasto', -1, 1), A('hi', 'Alte luci', -1, 1), A('sh', 'Ombre', -1, 1),
      A('wh', 'Bianchi', -1, 1), A('bl', 'Neri', -1, 1)),
    group('Colore (maschera)', false, A('temp', 'Temperatura', -1, 1, 0.01, { bg: BG.temp }), A('tint', 'Tinta', -1, 1, 0.01, { bg: BG.tint }),
      A('hue', 'Tonalità', -1, 1), A('sat', 'Saturazione', -1, 1),
      A('ovH', 'Colore sovrapposto: tinta', 0, 360, 1, { bg: HUE_BG }), A('ovS', 'Colore sovrapposto: forza', 0, 1)),
    group('Effetti (maschera)', false, A('texture', 'Texture', -1, 1), A('clarity', 'Chiarezza', -1, 1), A('dehaze', 'Rimozione foschia', -1, 1),
      A('sharp', 'Nitidezza', -1, 2), A('noise', 'Riduzione disturbo', 0, 1), A('moire', 'Moiré', 0, 1)),
    group('Curva (maschera)', !isIdentCurve(a.curve), curveCanvas(false, () => (a.curve ||= IDENT()), '#ffd54f'),
      actions(btn('Azzera curva', () => { commit('Curva maschera'); a.curve = IDENT(); renderPanel(); }))),
    actions(btn('Azzera regolazioni', () => { commit('Maschera'); m.adj = defMaskAdj(); renderPanel(); })));
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
let depthData = null;
function depthAt(ic) {
  if (!depthData) return 0.5;
  const { w, h, d } = depthData, x = Math.round(ic[0] * (w - 1)), y = Math.round(ic[1] * (h - 1));
  return d[(Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4] / 255;
}
function setDepthCanvas(c) {
  engine.setDepth(c);
  depthData = { w: c.width, h: c.height, d: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data };
}

/* ---------- AI ---------- */

function progressBar() {
  const bar = el('div', { className: 'progress' }, el('i'));
  bar.set = (v, label) => { bar.firstChild.style.width = Math.round(v * 100) + '%'; bar.dataset.label = label || ''; };
  return bar;
}

let lookPrompt = '', lookLast = null, aiBusy = false;
PANELS['Look AI'] = p => {
  const ta = el('textarea', { className: 'prompt', placeholder: 'Descrivi il look: es. "cinematografico freddo con ombre verde petrolio e pelle calda", "pellicola anni 70 sbiadita", "notte cyberpunk con neon rosa"', value: lookPrompt });
  ta.oninput = () => { lookPrompt = ta.value; };
  const usingClaude = !!aiSettings.apiKey;
  p.append(ta, actions(btn(aiBusy ? 'Elaborazione…' : 'Crea look', () => runLook(), 'primary'),
    lookLast ? btn('Salva come preset', saveLookAsPreset) : null),
    note(usingClaude ? `Interpretato da ${aiSettings.model.replace('claude-', 'Claude ').replace(/-/g, ' ')}, che guarda la foto e adatta il look (anche con maschere su cielo o soggetto).`
      : 'Motore offline a parole chiave. Per far interpretare la richiesta a Claude, che vede la foto, inserisci la chiave API in Libreria → Impostazioni.'),
    lookLast ? el('div', { className: 'card' }, el('b', { textContent: lookLast.name }), el('p', { textContent: lookLast.explanation })) : null,
    lookLast ? slider('Intensità', 0, 1.5, 0.01, () => lookLast.amt, v => { lookLast.amt = v; params = blendLook(lookLast, v); }, { neutral: 1 }) : null);
};

function blendLook(L, amt) {
  const out = clone(L.base), d0 = defaults();
  for (const k of Object.keys(d0)) {
    if (typeof d0[k] !== 'number' || /H$/.test(k)) { if (/H$/.test(k)) out[k] = L.result[k]; continue; }
    out[k] = L.base[k] + (L.result[k] - L.base[k]) * amt;
  }
  out.hsl = L.base.hsl.map((v, i) => v + (L.result.hsl[i] - v) * amt);
  out.curve = lerpCurve(L.result.curve, amt);
  out.masks = clone(L.result.masks);
  for (const m of out.masks) if (m.ai) m.amount = amt;
  return out;
}

async function runLook() {
  if (aiBusy || !lookPrompt.trim()) { if (!lookPrompt.trim()) toast('Scrivi prima una descrizione'); return; }
  aiBusy = true; renderPanel();
  const before = clone(params);
  try {
    let result, name, explanation;
    if (aiSettings.apiKey) {
      const look = await lookFromClaude(lookPrompt, curSrc);
      result = lookToParams(look, params); name = look.name; explanation = look.explanation;
    } else {
      const r = lookFromRules(lookPrompt);
      result = buildPreset(r.def, 1); copyGroups(params, result, LOCAL_GROUPS); result.lutAmt = params.lutAmt;
      name = lookPrompt.slice(0, 40); explanation = r.used.length ? 'Riconosciuto: ' + r.used.join(', ') + '.' : 'Nessuna parola chiave riconosciuta: ho solo corretto l\'esposizione.';
    }
    pushHistory('Look AI', before);
    lookLast = { name, explanation, result, base: before, amt: 1 };
    params = clone(result);
  } catch (e) { alert('Look AI: ' + e.message); console.error(e); }
  aiBusy = false; renderPanel();
}

function saveLookAsPreset() {
  const list = userPresets();
  const groups = Object.keys(GROUPS).filter(g => !['Geometria e ritaglio', 'Ritocco', 'LUT'].includes(g));
  const values = copyGroups(params, {}, groups);
  values.masks = values.masks.filter(m => m.ai);
  list.push({ name: lookLast.name, group: 'Look AI', values });
  saveUserPresets(list); toast('Salvato nel gruppo "Look AI"');
}

/* Super Resolution: lavora sull'originale a piena risoluzione e arriva ai pixel scelti */
const sr = { id: null, w: 0, h: 0, target: 0, fast: false };
async function srDims() {
  if (sr.id === curPhoto.id) return;
  const blob = (curPhoto.raw && await DB.get('decoded', curPhoto.id)) || await DB.get('files', curPhoto.id);
  const bmp = await decodeImage(blob), bw = imgW(bmp), bh = imgH(bmp);
  Object.assign(sr, { id: curPhoto.id, w: bw, h: bh, target: Math.min(SR_LIMIT, Math.max(bw, bh) * 2) });
  bmp.close?.();
}

PANELS['Super Resolution'] = p => {
  if (sr.id !== curPhoto?.id) { p.append(note('Lettura dimensioni originali…')); srDims().then(renderPanel).catch(e => toast(e.message)); return; }
  const L = Math.max(sr.w, sr.h), k = sr.target / L, ow = Math.round(sr.w * k), oh = Math.round(sr.h * k), mp = ow * oh / 1e6;
  const bar = progressBar(); bar.hidden = true;
  const inp = el('input', { type: 'number', className: 'num', min: L + 1, max: SR_LIMIT, step: 1, value: sr.target });
  inp.onchange = () => { sr.target = Math.max(L + 1, Math.min(SR_LIMIT, Math.round(+inp.value || L * 2))); renderPanel(); };
  const plan = srPlan(sr.w, sr.h, sr.target), passes = plan.steps.filter(s => s.scale).map(s => '×' + s.scale);
  p.append(note(`Originale: ${sr.w} × ${sr.h} px (${(sr.w * sr.h / 1e6).toFixed(1)} MP)`),
    chips([[1.5, '×1,5'], [2, '×2'], [3, '×3'], [4, '×4']].filter(([f]) => L * f <= SR_LIMIT).map(([f, t]) => [Math.round(L * f), t]), sr.target,
      v => { sr.target = +v; renderPanel(); }),
    el('div', { className: 'row' }, el('label', { textContent: 'Lato lungo (px)' }), inp, el('span')),
    note(`Risultato: ${ow} × ${oh} px (${mp.toFixed(1)} MP) · passaggi AI: ${passes.join(' + ') || '—'}`
      + (mp > 100 ? ' · Molto pesante: il telefono potrebbe non avere memoria sufficiente.' : '')
      + (Math.max(ow, oh) > engine.maxSize ? ` · L'editor di questo telefono arriva a ${engine.maxSize} px: verrà salvata subito anche una copia a piena risoluzione.` : '')),
    actions(toggle('Modalità veloce', () => sr.fast, v => { sr.fast = v; }, true)),
    actions(btn(aiBusy ? 'Elaborazione…' : 'Migliora risoluzione', async () => {
      if (aiBusy) return; aiBusy = true; bar.hidden = false;
      const t0 = Date.now();
      try {
        const src = await photoSource(curPhoto, SR_LIMIT);
        const out = await superResolution(src.canvas, { target: sr.target, fast: sr.fast, onProgress: v => {
          const sec = (Date.now() - t0) / 1000, rest = v > 0.03 ? Math.round(sec / v - sec) : 0;
          bar.set(v, Math.round(v * 100) + '%' + (rest ? ` · circa ${rest < 90 ? rest + ' s' : Math.round(rest / 60) + ' min'}` : ''));
        } });
        await saveCurrent();
        const rec = await addDerivedPhoto(out, ` (SR ${out.width}px)`);
        if (Math.max(out.width, out.height) > engine.maxSize)
          await saveFile(new File([await DB.get('files', rec.id)], rec.file, { type: 'image/jpeg' }));
        toast('Creata una nuova foto con risoluzione migliorata');
        aiBusy = false; await loadIntoEditor(rec);
      } catch (e) { aiBusy = false; alert('Super Resolution: ' + e.message); console.error(e); renderPanel(); }
    }, 'primary')), bar,
    note('Usa la foto originale a piena risoluzione e un modello AI (ESRGAN) che ricostruisce i dettagli, non un semplice ingrandimento. Funziona offline. Crea una copia: l\'originale resta invariato. Con foto grandi servono diversi minuti.'));
};

PANELS['Profondità'] = p => {
  const bar = progressBar(); bar.hidden = true;
  p.append(note(engine.hasDepth ? 'Mappa di profondità pronta: usala in Sfocatura (modo Profondità AI) e nelle Maschere (Intervallo profondità).'
    : 'Stima la distanza di ogni punto della foto. Al primo uso scarica il modello (circa 27 MB, poi resta sul telefono).'),
  actions(btn(aiBusy ? 'Elaborazione…' : engine.hasDepth ? 'Ricalcola' : 'Calcola mappa di profondità', async () => {
    if (aiBusy) return; aiBusy = true; bar.hidden = false;
    try {
      const c = await depthMap(curSrc, (v, phase) => bar.set(v, phase === 'download' ? `Download modello ${Math.round(v / 0.9 * 100)}%` : 'Calcolo…'));
      setDepthCanvas(c);
      await DB.put('depth', await new Promise(r => c.toBlob(r, 'image/png')), curPhoto.id);
      toast('Mappa di profondità calcolata');
    } catch (e) { alert('Profondità: ' + e.message + '\n(serve una connessione la prima volta)'); console.error(e); }
    aiBusy = false; renderPanel();
  }, 'primary'), engine.hasDepth ? toggle('Mostra mappa', () => showDepth, v => { showDepth = v; }, true) : null), bar);
  if (engine.hasDepth) p.append(section('Usa la profondità'), note('Un tocco applica l\'effetto; poi puoi rifinirlo nella sua sezione.'),
    actions(btn('Sfondo sfocato (ritratto)', depthPortrait, 'primary'), btn('Soggetto in risalto', depthSubjectPop),
      btn('Foschia atmosferica', depthHaze)),
    actions(btn('Maschera primo piano', () => depthMask(true)), btn('Maschera sfondo', () => depthMask(false))));
  if (engine.hasDepth && showDepth && depthData) {
    const c = el('canvas', { className: 'depthprev', width: depthData.w, height: depthData.h });
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(depthData.d), depthData.w, depthData.h), 0, 0);
    p.append(c);
  }
};
let showDepth = false;

/* Profondità del soggetto principale: le zone più vicine che occupano una parte significativa della foto */
function subjectDepth() {
  const d = depthData.d, v = [];
  for (let i = 0; i < d.length; i += 4 * 7) v.push(d[i]);
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length * 0.85)] / 255;
}
function addDepthMask(name, lo, hi, smooth, adj) {
  if (params.masks.length >= MAX_MASKS) { toast('Hai già il numero massimo di maschere'); return null; }
  const m = newMask('depth', params.masks.length + 1);
  m.name = name; Object.assign(m.comps[0], { lo: Math.max(0, lo), hi: Math.min(1, hi), smooth });
  Object.assign(m.adj, adj);
  params.masks.push(m);
  return m;
}
function depthPortrait() {
  commit('Sfondo sfocato');
  Object.assign(params, { lbType: 'depth', lbAmt: 0.55, lbFocus: subjectDepth(), lbSize: 0.1, lbFeather: 0.35, lbBokeh: 0.3 });
  showTab('Sfocatura');
  toast('Tocca il soggetto per scegliere cosa resta a fuoco');
}
function depthSubjectPop() {
  commit('Soggetto in risalto');
  const s = subjectDepth();
  addDepthMask('Soggetto (profondità)', s - 0.15, 1, 0.12, { exp: 0.15, clarity: 0.08, sat: 0.05 });
  addDepthMask('Sfondo (profondità)', 0, s - 0.15, 0.12, { exp: -0.25, sat: -0.1, clarity: -0.05 });
  renderPanel(); toast('Soggetto schiarito, sfondo leggermente attenuato');
}
function depthHaze() {
  commit('Foschia atmosferica');
  addDepthMask('Foschia (profondità)', 0, subjectDepth() * 0.6, 0.25, { dehaze: -0.35, contrast: -0.12, sat: -0.15, exp: 0.06 });
  renderPanel(); toast('Foschia aggiunta sulle zone lontane');
}
function depthMask(front) {
  commit('Maschera profondità');
  const s = subjectDepth();
  const m = front ? addDepthMask('Primo piano', s - 0.15, 1, 0.12, {}) : addDepthMask('Sfondo', 0, s - 0.15, 0.12, {});
  if (!m) return;
  maskIdx = params.masks.length - 1; compIdx = 0;
  showTab('Maschere');
  toast('Maschera creata: ora scegli le regolazioni');
}

PANELS['Calibrazione'] = p => {
  p.append(group('Ombre', true, S('calSh', 'Tinta', -1, 1, 0.01, { bg: BG.tint })),
    group('Primario rosso', true, S('calRH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#f0f,#f00,#fa0)' }), S('calRS', 'Saturazione', -1, 1)),
    group('Primario verde', false, S('calGH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#fd0,#0c0,#0dd)' }), S('calGS', 'Saturazione', -1, 1)),
    group('Primario blu', false, S('calBH', 'Tonalità', -1, 1, 0.01, { bg: 'linear-gradient(90deg,#0dd,#00f,#a0f)' }), S('calBS', 'Saturazione', -1, 1)),
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
    const base = copyGroups(params, defaults(), KEEP_ON_PRESET); base.lutAmt = params.lutAmt;
    return buildPreset(entry.def, amt, base);
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
        if (card.classList.contains('on') && presetBase) {     // secondo tocco sul preset attivo: lo toglie
          commit('Togli preset'); params = clone(presetBase); curPreset = null; presetBase = null;
          card.classList.remove('on'); redraw(); syncButtons(); return;
        }
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
      btn('Esporta i miei', exportPresets), toggle('Gestisci i miei', () => presetManage, v => { presetManage = v; }, true)),
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
};

/* Organizza: valutazione, contrassegno, etichetta, parole chiave */
PANELS['Organizza'] = p => {
  const r = curPhoto; if (!r) return;
  const upd = () => { DB.put('photos', r); renderPanel(); };
  p.append(
    chips([[0, '–'], [1, '★'], [2, '★★'], [3, '★★★'], [4, '★★★★'], [5, '★★★★★']], r.rating, v => { r.rating = +v; upd(); }),
    chips([[1, '⚑ Scelta'], [0, 'Nessun contrassegno'], [-1, '✕ Rifiutata']], r.flag, v => { r.flag = +v; upd(); }),
    chips([['', 'Nessuna etichetta'], ['red', 'Rossa'], ['yellow', 'Gialla'], ['green', 'Verde'], ['blue', 'Blu'], ['purple', 'Viola']], r.label, v => { r.label = v; upd(); }),
    el('div', { className: 'row' }, el('label', { textContent: 'Parole chiave' }),
      Object.assign(el('input', { type: 'text', className: 'num', value: r.keywords.join(', ') }),
        { onchange: e => { r.keywords = e.target.value.split(',').map(w => w.trim().toLowerCase()).filter(Boolean); upd(); } }), el('span')),
    el('div', { className: 'row' }, el('label', { textContent: 'Nome' }),
      Object.assign(el('input', { type: 'text', className: 'num', value: r.name }), { onchange: e => { r.name = e.target.value || r.name; fileName = r.name; $('edTitle').textContent = r.name; upd(); } }), el('span')));
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
  const fmts = [['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/tiff', 'TIFF (8 bit)'], ...(supportsWebp ? [['image/webp', 'WebP']] : []), ...(supportsAvif ? [['image/avif', 'AVIF']] : [])];
  p.append(actions(btn('Formati per Instagram, Facebook, TikTok… →', () => showTab('Social'))),
    section('File'), sel('Formato', fmts, 'fmt', renderPanel),
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

/* ---------- Analisi del viso: dati in memoria (inquadratura intelligente, collage, sfondo) ---------- */

let faceData = null;
function setFaceCanvas(c) {
  engine.setFace(c);
  faceData = { w: c.width, h: c.height / 3, d: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data };
}
/* Baricentro e riquadro di una zona (fascia 0-2, canale 0-2) in coordinate immagine (y in giù) */
function faceStats(band, ch, thr = 0.5) {
  if (!faceData) return null;
  const { w, h, d } = faceData;
  let s = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const v = d[((band * h + y) * w + x) * 4 + ch] / 255; if (v < thr) continue;
    s += v; sx += x * v; sy += y * v; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (s < 3) return null;
  return { c: [sx / s / w, sy / s / h], box: [x0 / w, y0 / h, (x1 + 2) / w, (y1 + 2) / h] };
}
/* Da coordinate immagine a coordinate della foto finita (dopo ritaglio, rotazione, prospettiva) */
function icToOut(p, ic) {
  const G = geoInfo(p.geo, engine.size[0], engine.size[1]), o = outUV(G, [ic[0], 1 - ic[1]]);
  return [o[0], 1 - o[1]];
}
function boxToOut(p, b) {
  const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(q => icToOut(p, q));
  return [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))];
}
/* Punto da tenere al centro quando un formato social ritaglia la foto: il viso, altrimenti la persona */
function exportFocus(p) {
  const f = faceStats(2, 2) || faceStats(1, 2);
  return f ? icToOut(p, f.c).map(v => Math.max(0, Math.min(1, v))) : [0.5, 0.5];
}

/* ---------- Pubblica: formati social ---------- */

async function saveFiles(files) {
  if (IS_NATIVE) return nativeSave(files);
  if (files.length > 1 && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) await saveFile(f);
}
function saveExportOpts() { try { localStorage.setItem('exportOpts', JSON.stringify({ ...exportOpts, wmImage: null })); } catch { /* spazio pieno */ } }

/* Ritaglio scelto per ogni formato (per foto, nella cronologia): params.frames[id] = { x, y (centro), z (zoom), fit } */
let socialCur = null, socialPlat = null;
const socialFit = (id, p = params) => p.frames?.[id]?.fit || exportOpts.fit;
/* Riquadro del formato sulla foto finita (0..1). Con "bordi"/"sfondo sfocato" il riquadro contiene tutta la foto */
function frameRect(p, id) {
  const t = SOCIAL.find(x => x.id === id); if (!t || t.long || !loaded) return null;
  const [fw, fh] = engine.outputSize(p), [W, H] = socialSize(t, fw, fh), A = fw / fh, R = W / H;
  if (socialFit(id, p) !== 'crop') {
    const cw = Math.max(1, R / A), ch = Math.max(1, A / R);
    return { x0: 0.5 - cw / 2, y0: 0.5 - ch / 2, x1: 0.5 + cw / 2, y1: 0.5 + ch / 2, cw, ch, W, H, t, fit: socialFit(id, p) };
  }
  const f = p.frames?.[id] || {}, z = Math.max(1, f.z || 1);
  const cw = Math.min(1, R / A) / z, ch = Math.min(1, A / R) / z;
  const c = f.x != null ? [f.x, f.y] : exportFocus(p);
  const cx = Math.max(cw / 2, Math.min(1 - cw / 2, c[0])), cy = Math.max(ch / 2, Math.min(1 - ch / 2, c[1]));
  return { x0: cx - cw / 2, y0: cy - ch / 2, x1: cx + cw / 2, y1: cy + ch / 2, cw, ch, W, H, t, fit: 'crop' };
}
/* Anteprima esatta di un formato (stessa composizione dell'esportazione, in piccolo) */
function socialPreview(id, maxSide = 220) {
  const t = SOCIAL.find(x => x.id === id), [fw, fh] = engine.outputSize(params), [W, H] = socialSize(t, fw, fh);
  const k = maxSide / Math.max(W, H), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  return t.long ? renderFinal(params, w, h) : composeFrame(params, fw, fh, w, h, socialFit(id), exportOpts.padColor, id);
}
PANELS['Social'] = p => {
  const [fw, fh] = loaded ? engine.outputSize(params) : [1, 1];
  const groups = [...new Set(SOCIAL.map(t => t.group))];
  const cur = SOCIAL.find(t => t.id === socialCur);
  const thumb = (box, make) => setTimeout(() => { if (!loaded) return; const c = make(); c.className = 'pv'; box.prepend(c); redraw(); }, 30);
  const go = () => { renderPanel(); $('panel').scrollTop = 0; };   // ogni passo riparte dall'alto
  const back = (label, fn) => el('button', { className: 'back', onclick: fn }, '‹ ' + label);

  // 1) dove la pubblichi
  if (!cur && !socialPlat) {
    p.append(el('h3', { className: 'ask', textContent: 'Dove vuoi pubblicarla?' }),
      el('div', { className: 'tiles' }, ...groups.map(g => el('button', { className: 'tile', onclick: () => {
        socialPlat = g; const f = SOCIAL.filter(t => t.group === g);
        if (f.length === 1) socialCur = f[0].id;
        go();
      } }, el('b', { textContent: g }), el('span', { textContent: SOCIAL.filter(t => t.group === g).map(t => t.name.split(' (')[0]).slice(0, 2).join(', ') })))));
    return;
  }
  // 2) che formato
  if (!cur) {
    p.append(back('Tutti i social', () => { socialPlat = null; go(); }),
      el('h3', { className: 'ask', textContent: `${socialPlat}: che formato?` }));
    const row = el('div', { className: 'cards' });
    for (const t of SOCIAL.filter(x => x.group === socialPlat)) {
      const [w, h] = socialSize(t, fw, fh);
      const card = el('button', { className: 'card', onclick: () => { socialCur = t.id; go(); } },
        el('b', { textContent: t.name }), el('span', { textContent: `${w} × ${h} px` }));
      thumb(card, () => socialPreview(t.id, 150)); row.append(card);
    }
    p.append(row);
    return;
  }
  // 3) adatta e salva
  const r = frameRect(params, cur.id), fit = socialFit(cur.id);
  p.append(back(cur.group, () => { socialCur = null; socialPlat = SOCIAL.filter(t => t.group === cur.group).length > 1 ? cur.group : null; go(); }),
    el('h3', { className: 'ask', textContent: `${cur.group} · ${cur.name}` }),
    actions(btn(`Salva per ${cur.group}`, async () => {
      toast('Preparazione…');
      try { const f = await buildExport(params, { ...exportOpts, target: cur.id }); await saveFile(f); toast('Salvata: ' + f.name); }
      catch (e) { alert('Errore di esportazione: ' + e.message); console.error(e); }
      redraw();
    }, 'primary big')));
  if (!r) { p.append(note('La foto resta intera: cambia solo la risoluzione.')); return; }
  const A = fw / fh, R = r.W / r.H;
  if (Math.abs(A - R) / R < 0.02) { p.append(note('La foto ha già la forma giusta.')); return; }
  p.append(el('p', { className: 'q', textContent: 'La foto ha una forma diversa. Come vuoi adattarla?' }));
  const opts = el('div', { className: 'cards fit' });
  for (const [v, label] of [['crop', 'Taglia'], ['pad', 'Bordi'], ['blur', 'Sfondo sfocato']]) {
    const card = el('button', { className: 'card' + (fit === v ? ' on' : ''), onclick: () => { commit('Formato'); (params.frames[cur.id] ||= {}).fit = v; go(); } },
      el('b', { textContent: label }));
    thumb(card, () => { const [W, H] = socialSize(cur, fw, fh), k = 120 / Math.max(W, H); return composeFrame(params, fw, fh, Math.round(W * k), Math.round(H * k), v, exportOpts.padColor, cur.id); });
    opts.append(card);
  }
  p.append(opts);
  if (fit === 'crop') p.append(note('Sposta il riquadro sulla foto con il dito per scegliere cosa tenere.'),
    slider('Avvicina', 1, 3, 0.01, () => params.frames[cur.id]?.z || 1, v => { (params.frames[cur.id] ||= {}).z = v; drawOverlay(); }, { neutral: 1 }));
  if (fit === 'pad') p.append(el('div', { className: 'chips' }, ...[['#ffffff', 'Bianco'], ['#f3efe9', 'Crema'], ['#000000', 'Nero']].map(([c, n]) =>
    el('button', { className: exportOpts.padColor === c ? 'on' : '', onclick: () => { exportOpts.padColor = c; saveExportOpts(); go(); } }, n))));
};

/* ---------- Pubblica: scritte ---------- */

let textIdx = 0, textBoxes = [], textEditing = false;
const TEXT_TEMPLATES = [
  ['Nome e profilo', () => newText({ text: 'NOME COGNOME\n@profilo', font: 'elegante', size: 0.055, y: 0.88, spacing: 0.08 })],
  ['Prodotti usati', () => newText({ text: 'Prodotti usati\nFondotinta · Rossetto · Mascara', font: 'moderno', size: 0.032, x: 0.5, y: 0.9, box: 1, boxColor: '#000000', boxOpacity: 0.4 })],
  ['Promozione', () => newText({ text: '-20%', font: 'titolo', size: 0.12, x: 0.2, y: 0.14, box: 1, boxColor: '#e8505b', boxOpacity: 0.9 })],
  ['Titolo copertina', () => newText({ text: 'BEAUTY ISSUE', font: 'elegante', bold: 1, size: 0.11, y: 0.1, spacing: 0.04, shadow: 0.3 })],
  ['Firma', () => newText({ text: 'Make-up by Nome', font: 'firma', size: 0.07, x: 0.72, y: 0.92 })],
  ['Testo libero', () => newText({ text: 'Scrivi qui', y: 0.5 })],
];
PANELS['Testo'] = p => {
  const L = params.texts, t = textEditing ? L[textIdx] : null;
  // senza scritta selezionata: scegli uno stile (anteprime sulla foto) oppure una delle scritte già messe
  if (!t) {
    textEditing = false;
    p.append(el('h3', { className: 'ask', textContent: 'Scegli uno stile di scritta' }));
    const grid = el('div', { className: 'cards tgrid2' });
    for (const [name, make] of TEXT_TEMPLATES) {
      const cv = el('canvas', { width: 300, height: 200 });
      grid.append(el('button', { className: 'card', onclick: () => {
        commit('Aggiungi scritta'); L.push(make()); textIdx = L.length - 1; textEditing = true; renderPanel(); toast('Scritta aggiunta: ora scrivi il tuo testo');
      } }, cv, el('b', { textContent: name })));
    }
    setTimeout(() => {                                     // foto in piccolo + modello, con i caratteri veri
      if (!loaded) return;
      const [fw, fh] = engine.outputSize(params), k = Math.max(300 / fw, 200 / fh);
      const base = renderFinal({ ...params, texts: [] }, Math.round(fw * k), Math.round(fh * k));
      loadTextFonts().then(() => grid.querySelectorAll('canvas').forEach((cv, i) => {
        const x = cv.getContext('2d'); x.drawImage(base, (300 - base.width) / 2, (200 - base.height) / 2);
        drawTexts(x, 300, 200, [{ ...TEXT_TEMPLATES[i][1](), x: 0.5, y: 0.5, size: TEXT_TEMPLATES[i][1]().size * 1.6 }]);
      }));
      redraw();
    }, 30);
    p.append(grid);
    if (L.length) p.append(el('p', { className: 'q', textContent: 'Le tue scritte (tocca per modificarla):' }),
      el('div', { className: 'chips' }, ...L.map((x, i) => btn((x.text.split('\n')[0] || 'Scritta').slice(0, 22), () => { textIdx = i; textEditing = true; renderPanel(); }))));
    return;
  }
  // modifica della scritta scelta: solo l'essenziale in vista, il resto in "Altre opzioni"
  const T2 = (k, label, min, max, step = 0.01, neutral = 0) => slider(label, min, max, step, () => t[k], v => { t[k] = v; drawOverlay(); }, { neutral });
  const flag = (k, label) => toggle(label, () => !!t[k], v => { t[k] = v ? 1 : 0; });
  const area = el('textarea', { className: 'txt', value: t.text, rows: 2, placeholder: 'Scrivi qui' });
  let typing = false;
  area.oninput = () => { if (!typing) { commit('Testo'); typing = true; } t.text = area.value; drawOverlay(); };
  area.onblur = () => { typing = false; };
  const fonts = chips(Object.entries(TEXT_FONTS).map(([k, v]) => [k, v[1]]), t.font, v => { commit('Carattere'); t.font = v; renderPanel(); });
  [...fonts.children].forEach((b, i) => { b.classList.add('font'); b.style.fontFamily = Object.values(TEXT_FONTS)[i][0]; });
  const colors = [['#ffffff', 'Bianco'], ['#000000', 'Nero'], ['#f3e3d3', 'Crema'], ['#d4af37', 'Oro'], ['#e8505b', 'Rosso'], ['#c8a2c8', 'Lilla']];
  const ci = el('input', { type: 'color', value: t.color, title: 'Altro colore' }); ci.oninput = () => { t.color = ci.value; drawOverlay(); }; ci.onchange = () => commit('Colore testo');
  p.append(
    el('div', { className: 'bar' }, el('button', { className: 'back', onclick: () => { textEditing = false; renderPanel(); } }, '‹ Fatto'),
      btn('Elimina', () => { commit('Elimina scritta'); L.splice(textIdx, 1); textIdx = Math.max(0, textIdx - 1); textEditing = false; renderPanel(); }, 'danger')),
    area, note('Trascina la scritta sulla foto per spostarla.'),
    el('p', { className: 'q', textContent: 'Carattere' }), fonts,
    el('p', { className: 'q', textContent: 'Colore' }),
    el('div', { className: 'chips' }, ...colors.map(([c, n]) => el('button', { className: 'chip swatch' + (t.color === c ? ' on' : ''), style: `background:${c}`, title: n,
      onclick: () => { commit('Colore testo'); t.color = c; renderPanel(); } })), ci),
    T2('size', 'Dimensione', 0.015, 0.25, 0.001, 0.06),
    group('Altre opzioni', false,
      chips([['left', 'Allinea a sinistra'], ['center', 'Al centro'], ['right', 'A destra']], t.align, v => { commit('Allineamento'); t.align = v; renderPanel(); }),
      actions(flag('bold', 'Grassetto'), flag('italic', 'Corsivo'), flag('upper', 'Tutto maiuscolo'), flag('box', 'Sfondo dietro il testo')),
      t.box ? T2('boxOpacity', 'Opacità dello sfondo', 0.05, 1, 0.01, 0.45) : null,
      T2('spacing', 'Spazio tra le lettere', -0.05, 0.5, 0.005), T2('shadow', 'Ombra', 0, 1, 0.01, 0.4), T2('opacity', 'Trasparenza', 0.1, 1, 0.01, 1),
      actions(btn('Duplica', () => { commit('Duplica scritta'); L.splice(textIdx + 1, 0, { ...clone(t), id: newText().id, y: Math.min(0.95, t.y + 0.08) }); textIdx++; renderPanel(); }))));
};

/* ---------- Pubblica: prima/dopo e collage ---------- */

let baLayout = 'side', baLabels = true;
PANELS['Prima/Dopo'] = p => {
  const prev = el('div', { className: 'bigprev' });
  p.append(el('h3', { className: 'ask', textContent: 'Prima e dopo' }), prev,
    chips([['side', 'Affiancate'], ['stack', 'Una sopra l\'altra'], ['split', 'Metà e metà']], baLayout, v => { baLayout = v; renderPanel(); }),
    actions(toggle('Scritte "Prima" e "Dopo"', () => baLabels, v => { baLabels = v; }, true)),
    actions(btn('Salva prima/dopo', async () => {
      if (!loaded) return; toast('Preparazione…');
      try { await saveFile(await buildBeforeAfter(params, baLayout, baLabels)); } catch (e) { alert(e.message); console.error(e); }
      redraw();
    }, 'primary big')),
    el('h3', { className: 'ask', textContent: 'Collage del look' }),
    note('La foto in alto e, sotto, i dettagli di occhi e labbra (formato Instagram 4:5). Serve un viso ben visibile.'),
    actions(btn(faceBusy ? 'Analisi in corso…' : 'Salva collage', async () => {
      if (!loaded) return;
      if (!engine.hasFace && !(await runFaceAnalysis())) return;
      const eyes = faceStats(0, 2, 0.3), lips = faceStats(0, 1, 0.3);
      if (!eyes || !lips) { alert('Non trovo occhi e labbra in questa foto: serve un viso ben visibile.'); return; }
      const grow = (b, k) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, w = (b[2] - b[0]) * k / 2, h = (b[3] - b[1]) * k / 2; return [cx - w, cy - h, cx + w, cy + h]; };
      toast('Preparazione…');
      const f = exportFocus(params), main = [0, f[1] - 0.01, 1, f[1] + 0.01];
      try { await saveFile(await buildCollage(params, { main, eyes: boxToOut(params, grow(eyes.box, 1.3)), lips: boxToOut(params, grow(lips.box, 1.6)) })); }
      catch (e) { alert(e.message); console.error(e); }
      redraw(); renderPanel();
    }, 'big')));
  // anteprima del prima/dopo con la disposizione scelta (in piccolo)
  setTimeout(async () => {
    if (!loaded) return;
    const [fw, fh] = engine.outputSize(params), k = 160 / Math.max(fw, fh), w = Math.round(fw * k), h = Math.round(fh * k);
    const a = renderFinal(Object.assign(defaults(), { geo: clone(params.geo) }), w, h), b = renderFinal({ ...params, texts: [] }, w, h);
    const W = baLayout === 'side' ? w * 2 + 2 : w, H = baLayout === 'stack' ? h * 2 + 2 : h, c = canvasOf(W, H), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(a, 0, 0);
    if (baLayout === 'split') { x.drawImage(b, w / 2, 0, w / 2, h, w / 2, 0, w / 2, h); x.fillRect(w / 2 - 1, 0, 2, h); }
    else x.drawImage(b, baLayout === 'side' ? w + 2 : 0, baLayout === 'stack' ? h + 2 : 0);
    prev.append(c); redraw();
  }, 30);
};

/* ---------- Sfondo: sfocato, più scuro o meno colorato, per far risaltare la persona ---------- */

const BG_MASK = 'Sfondo (AI)';
let depthFromPerson = false;
function bgMask(create) {
  let m = params.masks.find(x => x.name === BG_MASK);
  if (!m && create) {
    if (params.masks.length >= MAX_MASKS) { toast('Hai già il numero massimo di maschere'); return null; }
    m = newMask('face', params.masks.length + 1); m.name = BG_MASK; m.comps[0].part = 5; m.comps[0].invert = 1;
    params.masks.push(m);
  }
  return m;
}
/* Senza mappa di profondità si usa la sagoma della persona come profondità (persona vicina, sfondo lontano) */
function personDepth() {
  const { w, h, d } = faceData, c = canvasOf(w, h), x = c.getContext('2d'), id = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = 25 + Math.round(d[(h * w + i) * 4 + 2] * 0.8); id.data.set([v, v, v, 255], i * 4); }
  x.putImageData(id, 0, 0); setDepthCanvas(c); depthFromPerson = true;
  c.toBlob(b => curPhoto && DB.put('depth', b, curPhoto.id));
}
PANELS['Sfondo'] = p => {
  const ready = engine.hasDepth || engine.hasFace;
  if (!ready) {
    const bar = progressBar(); bar.hidden = true;
    p.append(note('L\'AI riconosce la persona e separa lo sfondo. Funziona offline, sul telefono.'),
      actions(btn(faceBusy ? 'Analisi in corso…' : 'Riconosci la persona (AI)', async () => { await runFaceAnalysis(bar); renderPanel(); }, 'primary')), bar);
    return;
  }
  const blur = slider('Sfocatura dello sfondo', 0, 1, 0.01, () => (params.lbType === 'depth' ? params.lbAmt : 0), v => {
    if (!engine.hasDepth) personDepth();
    if (params.lbType !== 'depth' || !params.lbAmt) Object.assign(params, { lbType: 'depth', lbFocus: depthFromPerson ? 0.9 : subjectDepth(), lbSize: 0.1, lbFeather: 0.3, lbBokeh: 0.25 });
    params.lbAmt = v;
  });
  const adj = (k, label, min, max) => slider(label, min, max, 0.01, () => bgMask(false)?.adj[k] || 0, v => { const m = bgMask(true); if (m) m.adj[k] = v; });
  p.append(blur);
  if (engine.hasFace) p.append(adj('exp', 'Luminosità dello sfondo', -2, 1), adj('sat', 'Colore dello sfondo', -1, 0.5), adj('clarity', 'Dettaglio dello sfondo', -1, 0.5));
  else p.append(note('Per schiarire, scurire o togliere colore allo sfondo serve "Riconosci la persona" (Beauty → Riconosci viso).'));
  p.append(note('La sfocatura usa la mappa di profondità se c\'è (AI → Profondità), altrimenti la sagoma della persona.'));
};

/* ---------- Menu ⋮ in alto ---------- */

function openMenu() {
  if (document.querySelector('.menu-wrap')) return;
  const canPrev = prevEdits && prevEdits.id !== curPhoto?.id;
  const items = [
    [ICONS.Esporta, 'Salva copia sul dispositivo', exportImage],
    [circ(12, 12, 3) + 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', 'Opzioni di esportazione', () => openPanel('Esporta')],
    null,
    [ICONS.Organizza, 'Organizza', () => openPanel('Organizza')],
    ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z' + circ(12, 12, 3), 'Visualizza opzioni', viewOptions],
    null,
    [ICONS.Profili + 'M18 2v6M15 5h6', 'Crea predefinito', savePreset],
    ['M9 9h11v11H9zM5 15H4V4h11v1', 'Copia impostazioni', copySettings],
    ['M8 4h8v3H8zM6 5H4v16h16V5h-2M9 14h6', 'Incolla impostazioni', pasteSettings, !clipboard],
    ['M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4', 'Applica da precedente', applyPrevious, !canPrev],
    null,
    [ICONS.Versioni, 'Versioni', () => openPanel('Versioni')],
    [ICONS.Cronologia, 'Cronologia', () => openPanel('Cronologia')],
    [ICONS.Info, 'Info foto', () => openPanel('Info')],
    null,
    [ICON_FACE, appSettings.simpleMode ? 'Passa alla modalità completa' : 'Passa alla modalità semplice', () => setSimpleMode(!appSettings.simpleMode)],
    ['M7 4l13 8-13 8z', 'Avvia presentazione', startSlideshow],
  ];
  const box = el('div', { className: 'menu' });
  for (const it of items) {
    if (!it) { box.append(el('hr')); continue; }
    const [ic, label, fn, off] = it;
    box.append(el('button', { disabled: !!off, onclick: () => { wrap.remove(); fn(); } }, el('span', { className: 'mi' }, svgIcon(ic)), label));
  }
  const wrap = el('div', { className: 'menu-wrap', onclick: e => { if (e.target === wrap) wrap.remove(); } }, box);
  document.body.append(wrap);
}
function openPanel(name) { if (loaded) showTab(name); }

async function viewOptions() {
  const o = appSettings, box = el('div', { className: 'checks one' });
  const opt = (key, label) => {
    const cb = el('input', { type: 'checkbox', checked: !!o[key] });
    cb.onchange = () => { o[key] = cb.checked; saveAppSettings(); syncViewOpts(); redraw(); };
    box.append(el('label', {}, cb, ' ' + label));
  };
  opt('viewHist', 'Istogramma'); opt('viewInfo', 'Informazioni sulla foto'); opt('viewClip', 'Evidenzia i tagli (rosso = luci bruciate, blu = ombre chiuse)');
  await modal('Visualizza opzioni', box, ['Chiudi']);
}
function syncViewOpts() {
  $('hist').hidden = !loaded || !appSettings.viewHist;
  const ov = $('infoOv'); ov.hidden = !loaded || !appSettings.viewInfo;
  if (ov.hidden || !curPhoto) return;
  const t = exifData.tags, list = visiblePhotos(), i = list.findIndex(x => x.id === curPhoto.id);
  const [w, h] = engine.size;
  ov.textContent = [i >= 0 ? `${i + 1} di ${list.length}` : '',
    [t.exposure ? (t.exposure < 1 ? `1/${Math.round(1 / t.exposure)}` : t.exposure) + ' s' : '', t.fnumber ? 'f/' + (+t.fnumber).toFixed(1).replace('.', ',') : '', t.iso ? 'ISO ' + t.iso : ''].filter(Boolean).join(' · '),
    `${w} × ${h}`, curPhoto.taken ? new Date(curPhoto.taken).toLocaleString('it-IT') : ''].filter(Boolean).join('\n');
}

/* Applica le impostazioni della foto modificata prima di questa (esclusi ritaglio, maschere e ritocchi) */
function applyPrevious() {
  if (!prevEdits) return;
  commit('Applica da precedente');
  const keep = copyGroups(params, {}, LOCAL_GROUPS);
  params = Object.assign(defaults(), clone(prevEdits.values), keep);
  renderPanel(); toast('Impostazioni della foto precedente applicate');
}
function rememberPrevious() {
  if (curPhoto && isEdited(params)) prevEdits = { id: curPhoto.id, values: clone(params) };
}

/* Presentazione a schermo intero delle foto visibili nella libreria, con le modifiche */
async function startSlideshow() {
  const list = visiblePhotos(); if (!list.length) return;
  if (curPhoto) await saveCurrent();
  let i = Math.max(0, list.findIndex(p => p.id === curPhoto?.id)), alive = true, timer = 0;
  const img = el('img'), cap = el('div', { className: 'cap' });
  const wrap = el('div', { className: 'slideshow' }, img, cap, el('div', { className: 'hint', textContent: 'Tocca per uscire' }));
  document.body.append(wrap);
  document.documentElement.requestFullscreen?.().catch(() => {});
  const size = Math.round(Math.max(screen.width, screen.height) * Math.min(2, window.devicePixelRatio || 1));
  const render = async rec => {
    const src = await photoSource(rec, size * 1.5);
    return URL.createObjectURL(await makeThumb(src.canvas, Object.assign(defaults(), rec.edits || {}), libEngine, undefined, size));
  };
  let next = render(list[i]);
  const show = async () => {
    if (!alive) return;
    const url = await next.catch(() => null);
    if (!alive) return;
    if (url) { const old = img.src; img.src = url; if (old) URL.revokeObjectURL(old); }
    cap.textContent = `${list[i].name} · ${i + 1} di ${list.length}`;
    i = (i + 1) % list.length; next = render(list[i]);
    timer = setTimeout(show, 3500);
  };
  wrap.onclick = () => { alive = false; clearTimeout(timer); wrap.remove(); if (img.src) URL.revokeObjectURL(img.src); if (document.fullscreenElement) document.exitFullscreen?.(); };
  show();
}

/* ---------- Caricamento dalla libreria e salvataggio automatico ---------- */

let curSrc = null, saveTimer = 0;

/* Carica la foto nel motore; show = passa all'editor */
async function loadIntoEditor(rec, show = true) {
  if (show && curPhoto && curPhoto.id !== rec.id) rememberPrevious();
  const src = await photoSource(rec);
  curPhoto = rec; curSrc = src.canvas;
  fileName = rec.name;
  exifData = { app1: src.app1 || null, tags: rec.exif || src.tags || {} };
  engine.setImage(src.canvas, src.canvas.width, src.canvas.height);
  engine.noise = estimateNoise(src.canvas);
  const ts = scaledCanvas(src.canvas, 256);
  thumbEngine.setImage(ts, ts.width, ts.height); thumbCache.clear();
  setAnalysisImage(src.canvas);
  for (const k in brushCache) delete brushCache[k];
  depthData = null; depthFromPerson = false;
  const dep = await DB.get('depth', rec.id);
  if (dep) setDepthCanvas(scaledCanvas(await decodeImage(dep), 1024));
  const fm = await DB.get('depth', rec.id + '#face');
  faceData = null;
  if (fm) setFaceCanvas(scaledCanvas(await decodeImage(fm), 4096));
  loaded = true;
  params = Object.assign(defaults(), rec.edits ? clone(rec.edits) : {});
  history.undo = clone(rec.history || []); history.redo = [];
  versions = clone(rec.versions || []);
  curPreset = null; selSpot = -1; maskIdx = 0;
  if (!show) return;
  view.scale = 1; view.x = view.y = 0;
  $('libraryView').hidden = true; $('editorView').hidden = false;
  $('empty').hidden = true; $('edTitle').textContent = rec.name;
  if (!activeTools().some(t => t.subs?.includes(curTab))) curTab = menuTab;
  sheetOpen = false;                                     // all'apertura si vede solo la foto
  renderTabs(); renderPanel(); syncButtons(); syncViewOpts();
}
const openPhoto = async id => { const rec = photos.find(p => p.id === id); if (rec) { toast('Apertura…'); await loadIntoEditor(rec); } };

function scheduleSave() {
  if (!curPhoto) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrent, 800);
}
async function saveCurrent() {
  if (!curPhoto) return;
  clearTimeout(saveTimer);
  const rec = curPhoto;
  const before = JSON.stringify(rec.edits || defaults());
  rec.edits = clone(params); rec.history = clone(history.undo.slice(-40)); rec.versions = clone(versions);
  if (JSON.stringify(rec.edits) !== before) rec.edited = isEdited(params) ? Date.now() : 0;
  await DB.put('photos', rec);
  const b = brushCanvases();
  await DB.put('thumbs', await makeThumb(curSrc, params, libEngine, { brushes: b.list, brushVer: b.ver }), rec.id);
  dropThumb(rec.id);
}

async function closeEditor() {
  rememberPrevious();
  await saveCurrent();
  curPhoto = null; loaded = false;
  $('editorView').hidden = true; $('libraryView').hidden = false;
  renderLibrary();
}

/* Sostituisce l'immagine della foto (Super Resolution): crea una nuova foto nella libreria */
async function addDerivedPhoto(canvas, suffix) {
  const id = uid(), blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.96));
  const rec = { ...clone(curPhoto), id, name: curPhoto.name + suffix, file: curPhoto.name + suffix + '.jpg', type: 'image/jpeg', raw: false,
    size: blob.size, hash: id, added: Date.now(), w: canvas.width, h: canvas.height, edits: clone(params), history: [], versions: [], edited: Date.now() };
  await DB.put('files', blob, id);
  await DB.put('thumbs', await makeThumb(canvas, params), id);
  await DB.put('photos', rec);
  photos.push(rec);
  return rec;
}

async function openLut(file) {
  try {
    const { data, n } = parseCube(await file.text());
    engine.setLut(data, n); lutName = file.name; params.lutAmt = 1;
    renderPanel();
  } catch (e) { alert(e.message); }
}

/* ---------- Avvio ---------- */

window.addEventListener('DOMContentLoaded', async () => {
  try {
    engine = new Engine($('view'));
    thumbEngine = new Engine(document.createElement('canvas'));
  } catch (e) { document.body.textContent = 'Errore grafico: ' + e.message; console.error(e); return; }
  setupGestures();
  // se il telefono libera la memoria grafica (foto molto grandi) il disegno diventerebbe nero: si ricrea il motore
  $('view').addEventListener('webglcontextlost', e => { e.preventDefault(); loaded = false; toast('Memoria grafica esaurita: ricarico la foto…'); });
  $('view').addEventListener('webglcontextrestored', async () => {
    engine = new Engine($('view'));
    if (curPhoto) { const keep = clone(params), h = clone(history.undo); await loadIntoEditor(curPhoto); params = keep; history.undo = h; renderPanel(); }
  });
  $('fab').onclick = () => $('file').click();
  $('file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) importFiles(f); };
  $('fileLut').onchange = e => { e.target.files[0] && openLut(e.target.files[0]); e.target.value = ''; };
  $('filePreset').onchange = e => { e.target.files.length && importPresets([...e.target.files]); e.target.value = ''; };
  $('fileWm').onchange = async e => { const f = e.target.files[0]; if (f) { exportOpts.wmImage = await decodeImage(f); renderPanel(); } e.target.value = ''; };
  $('btnBack').onclick = closeEditor;
  $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
  $('btnReset').onclick = resetAll; $('btnMenu').onclick = openMenu;
  $('btnExport').onclick = exportImage;
  window.addEventListener('resize', redraw);
  new ResizeObserver(() => redraw()).observe($('stage'));   // la tendina che si apre/chiude cambia lo spazio della foto
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveCurrent(); });
  if (!IS_NATIVE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  await initLibrary();
  if (appSettings.simpleMode) presetCat = 'Moda e beauty';
  loadTextFonts().then(() => loaded && drawOverlay());
});
