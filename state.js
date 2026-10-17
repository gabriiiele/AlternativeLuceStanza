'use strict';

/* Stato delle modifiche: valori predefiniti, gruppi di impostazioni, preset, profili, cronologia. */

const IDENT = () => [[0, 0], [1, 1]];

const defMaskAdj = () => ({ exp: 0, contrast: 0, hi: 0, sh: 0, wh: 0, bl: 0, temp: 0, tint: 0, hue: 0, sat: 0,
  texture: 0, clarity: 0, dehaze: 0, sharp: 0, noise: 0, moire: 0, ovH: 30, ovS: 0, curve: [[0, 0], [1, 1]] });
const isIdentCurve = c => !c || (c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1);

let maskSeq = 1;
const newComp = (type, op = 'add') => ({
  type, op, invert: 0,
  ...({
    linear: { x: 0.5, y: 0.35, angle: 90, width: 0.3 },
    radial: { x: 0.5, y: 0.5, angle: 0, feather: 0.5, rx: 0.25, ry: 0.25 },
    brush: {},
    color: { rgb: [0.5, 0.5, 0.5], range: 0.5 },
    lum: { lo: 0.6, hi: 1, smooth: 0.15 },
    depth: { lo: 0.6, hi: 1, smooth: 0.1 },
  })[type],
});
const newMask = (type, n) => ({ id: Date.now() + '-' + maskSeq++, name: 'Maschera ' + n, on: 1, invert: 0, amount: 1,
  comps: [newComp(type)], strokes: [], adj: defMaskAdj() });

const defaults = () => ({
  // luce
  exp: 0, contrast: 0, hi: 0, sh: 0, wh: 0, bl: 0,
  // curve
  curve: IDENT(), cr: IDENT(), cg: IDENT(), cb: IDENT(),
  pcSh: 0, pcDk: 0, pcLt: 0, pcHi: 0, pcS1: 0.25, pcS2: 0.5, pcS3: 0.75,
  // colore
  wb: 'asShot', temp: 0, tint: 0, vib: 0, sat: 0, profile: 'Standard', profileAmt: 1,
  hsl: new Array(24).fill(0), pc: [],
  // gradazione
  gsH: 210, gsS: 0, gsL: 0, gmH: 40, gmS: 0, gmL: 0, ghH: 40, ghS: 0, ghL: 0, ggH: 40, ggS: 0, ggL: 0, gBal: 0, gBlend: 0.5,
  // bianco e nero
  mono: 0, bwm: new Array(8).fill(0),
  // effetti
  texture: 0, clarity: 0, dehaze: 0, vig: 0, vigMid: 0.4, vigRound: 0, vigFeather: 0.5, vigHi: 0,
  grain: 0, grainSize: 1, grainRough: 0.5, fade: 0, glow: 0, halation: 0, ca: 0,
  // dettagli
  sharp: 0, sharpRad: 1, sharpDetail: 0.25, sharpMask: 0,
  nrLum: 0, nrLumDetail: 0.5, nrLumContrast: 0, nrCol: 0, nrColDetail: 0.5, nrColSmooth: 0.5,
  // ottica
  caR: 0, caB: 0, defP: 0, defPLo: 260, defPHi: 340, defG: 0, defGLo: 75, defGHi: 165, lensDist: 0, lensVig: 0, lensVigMid: 0.5,
  // calibrazione
  calSh: 0, calRH: 0, calRS: 0, calGH: 0, calGS: 0, calBH: 0, calBS: 0,
  // sfocatura obiettivo
  lbAmt: 0, lbType: 'radial', lbX: 0.5, lbY: 0.5, lbSize: 0.15, lbAngle: 0, lbFeather: 0.3, lbBokeh: 0, lbFocus: 0.8,
  // geometria
  geo: { angle: 0, trot: 0, rot: 0, fx: 0, fy: 0, vert: 0, horiz: 0, distort: 0, aspAdj: 0, scale: 1, ox: 0, oy: 0,
    constrain: 1, ratio: 'orig', custom: [4, 5], crop: [0, 0, 1, 1], guides: [], grid: 'thirds' },
  masks: [], spots: [], lutAmt: 1,
});

const clone = o => JSON.parse(JSON.stringify(o));

/* true se le modifiche differiscono dai valori predefiniti */
const isEdited = p => !!p && JSON.stringify({ ...defaults(), ...p }) !== JSON.stringify(defaults());

/* Gruppi per copia selettiva, salvataggio preset e cronologia */
const GROUPS = {
  'Luce': ['exp', 'contrast', 'hi', 'sh', 'wh', 'bl'],
  'Curve': ['curve', 'cr', 'cg', 'cb', 'pcSh', 'pcDk', 'pcLt', 'pcHi', 'pcS1', 'pcS2', 'pcS3'],
  'Bilanciamento e presenza': ['wb', 'temp', 'tint', 'vib', 'sat'],
  'Profilo': ['profile', 'profileAmt'],
  'Mixer colore': ['hsl'],
  'Colore punto': ['pc'],
  'Gradazione colore': ['gsH', 'gsS', 'gsL', 'gmH', 'gmS', 'gmL', 'ghH', 'ghS', 'ghL', 'ggH', 'ggS', 'ggL', 'gBal', 'gBlend'],
  'Bianco e nero': ['mono', 'bwm'],
  'Effetti': ['texture', 'clarity', 'dehaze', 'vig', 'vigMid', 'vigRound', 'vigFeather', 'vigHi', 'grain', 'grainSize', 'grainRough', 'fade', 'glow', 'halation', 'ca'],
  'Dettagli': ['sharp', 'sharpRad', 'sharpDetail', 'sharpMask', 'nrLum', 'nrLumDetail', 'nrLumContrast', 'nrCol', 'nrColDetail', 'nrColSmooth'],
  'Ottica': ['caR', 'caB', 'defP', 'defPLo', 'defPHi', 'defG', 'defGLo', 'defGHi', 'lensDist', 'lensVig', 'lensVigMid'],
  'Calibrazione': ['calSh', 'calRH', 'calRS', 'calGH', 'calGS', 'calBH', 'calBS'],
  'Sfocatura obiettivo': ['lbAmt', 'lbType', 'lbX', 'lbY', 'lbSize', 'lbAngle', 'lbFeather', 'lbBokeh', 'lbFocus'],
  'Geometria e ritaglio': ['geo'],
  'Maschere': ['masks'],
  'Ritocco': ['spots'],
  'LUT': ['lutAmt'],
};
const LOCAL_GROUPS = ['Geometria e ritaglio', 'Maschere', 'Ritocco'];

function copyGroups(from, to, groups) {
  for (const g of groups) for (const k of GROUPS[g]) to[k] = clone(from[k]);
  return to;
}

/* ---------- Preset ---------- */

const ALIASES = { denoise: 'nrLum' };

function lerpCurve(pts, amt) {
  if (amt === 1) return clone(pts);
  const lut = curveLUT(pts);
  return [0, 0.25, 0.5, 0.75, 1].map(x => [x, x + (lut[Math.round(x * 255)] - x) * amt]);
}

/* Applica la definizione di un preset (formato compatto) a una base; amt = intensità */
function buildPreset(def, amt = 1, base = defaults()) {
  const out = clone(base), d0 = defaults();
  for (let [k, v] of Object.entries(def)) {
    k = ALIASES[k] || k;
    if (k === 'hsl' && !Array.isArray(v)) for (const i in v) for (let j = 0; j < 3; j++) out.hsl[i * 3 + j] = v[i][j] * amt;
    else if (k === 'bw') for (const i in v) out.bwm[i] = v[i] * amt;
    else if (['curve', 'cr', 'cg', 'cb'].includes(k)) out[k] = lerpCurve(v, amt);
    else if (typeof v === 'number' && typeof d0[k] === 'number') out[k] = /H$/.test(k) ? v : d0[k] + (v - d0[k]) * amt;
    else if (k in d0) out[k] = clone(v);
  }
  return out;
}

/* ---------- Profili: si sommano alle regolazioni dell'utente al momento del disegno ---------- */

function effectiveParams(p) {
  const prof = PROFILES.find(x => x.name === p.profile);
  if (!prof || !Object.keys(prof.def).length || !p.profileAmt) return p;
  const e = clone(p), a = p.profileAmt, d0 = defaults();
  for (const [k, v] of Object.entries(prof.def)) {
    if (k === 'hsl') { for (const i in v) for (let j = 0; j < 3; j++) e.hsl[i * 3 + j] += v[i][j] * a; }
    else if (k === 'bw') { for (const i in v) e.bwm[i] += v[i] * a; }
    else if (/H$/.test(k)) { const sk = k.slice(0, -1) + 'S'; if (!p[sk]) e[k] = v; }
    else if (typeof v === 'number') e[k] = k === 'mono' ? Math.min(1, e[k] + v * Math.min(a, 1)) : e[k] + (v - (d0[k] || 0)) * a;
  }
  return e;
}

/* ---------- Cronologia ---------- */

const history = { undo: [], redo: [] };
