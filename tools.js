'use strict';

/* Strumenti sull'immagine (ritaglio, pennello, ritocco, contagocce, maniglie maschere, guide Upright)
   e analisi dell'immagine senza AI (linee per Upright, bilanciamento automatico, sorgente del ritocco). */

/* ---------- Dati dell'immagine ridotta ---------- */

const imgInfo = { small: null, med: null };   // ImageData a 256 e 512 px

function setAnalysisImage(bmp) {
  const make = max => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return x.getImageData(0, 0, c.width, c.height);
  };
  imgInfo.small = make(256); imgInfo.med = make(512);
}

/* Rumore del sensore (deviazione standard 0..1), stimato con la mediana del laplaciano su un ritaglio a piena risoluzione:
   serve a reintegrare la stessa grana nelle zone sfocate, così non sembrano finte */
function estimateNoise(canvas) {
  const s = Math.min(512, canvas.width, canvas.height);
  if (s < 16) return 0;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData((canvas.width - s) >> 1, (canvas.height - s) >> 1, s, s).data, g = new Float32Array(s * s), v = [];
  for (let i = 0; i < s * s; i++) g[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  for (let y = 1; y < s - 1; y += 2) for (let x = 1; x < s - 1; x += 2) {
    const i = y * s + x;
    v.push(Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - s] - g[i + s]));
  }
  v.sort((a, b) => a - b);
  return Math.min(0.04, v[v.length >> 1] / 0.6745 / Math.sqrt(20) / 255);
}

/* Colore medio (0..1) attorno a un punto in coordinate immagine */
function sampleIc(ic, rad = 2, d = imgInfo.small) {
  const cx = Math.round(ic[0] * (d.width - 1)), cy = Math.round(ic[1] * (d.height - 1));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) continue;
    const i = (y * d.width + x) * 4;
    r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++;
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
}

const lin = c => Math.pow(c, 2.2);

/* Temperatura e tinta che rendono neutro un colore (stessa formula dello shader) */
function wbFromColor(rgb) {
  const [r, g, b] = rgb.map(lin);
  const t = Math.max(-1, Math.min(1, (b - r) / (0.3 * (r + b) + 1e-6)));
  const m = (r * (1 + 0.3 * t) + b * (1 - 0.3 * t)) / 2;
  const n = Math.max(-1, Math.min(1, (1 - m / (g + 1e-6)) / 0.2));
  return { temp: t, tint: n };
}

/* Bilanciamento automatico: "mondo grigio" sui toni medi */
function autoWB() {
  const d = imgInfo.small.data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 765;
    if (l < 0.08 || l > 0.95) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  return n ? wbFromColor([r / n / 255, g / n / 255, b / n / 255]) : { temp: 0, tint: 0 };
}

/* Statistiche per l'Auto tono */
function lumaStats() {
  const d = imgInfo.small.data, L = [];
  for (let i = 0; i < d.length; i += 4) L.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
  L.sort((a, b) => a - b);
  return { mean: L.reduce((a, b) => a + b, 0) / L.length, p1: L[Math.floor(L.length * 0.01)], p99: L[Math.floor(L.length * 0.99)] };
}

/* Sceglie la zona sorgente più simile ai bordi della zona da correggere */
function autoSource(x, y, r, Sa) {
  const ringCol = (cx, cy) => {
    let acc = [0, 0, 0];
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, c = sampleIc([cx + Math.cos(a) * r * 1.2 / Sa, cy + Math.sin(a) * r * 1.2], 1);
      acc = acc.map((v, i) => v + c[i] / 12);
    }
    return acc;
  };
  const ref = ringCol(x, y);
  let best = null, bestD = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, sx = x + Math.cos(a) * r * 2.4 / Sa, sy = y + Math.sin(a) * r * 2.4;
    if (sx - r / Sa < 0 || sx + r / Sa > 1 || sy - r < 0 || sy + r > 1) continue;
    const c = ringCol(sx, sy), d = c.reduce((s, v, i) => s + (v - ref[i]) ** 2, 0);
    if (d < bestD) { bestD = d; best = [sx, sy]; }
  }
  return best || [Math.min(1, x + r * 2.4 / Sa), y];
}

/* ---------- Rilevamento linee (Hough) per Upright e raddrizzamento automatico ---------- */

function detectLines() {
  const d = imgInfo.med, W = d.width, H = d.height, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.2126 * d.data[i * 4] + 0.7152 * d.data[i * 4 + 1] + 0.0722 * d.data[i * 4 + 2];
  const mag = new Float32Array(W * H), ang = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = -g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1] + g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1];
    const gy = -g[i - W - 1] - 2 * g[i - W] - g[i - W + 1] + g[i + W - 1] + 2 * g[i + W] + g[i + W + 1];
    mag[i] = Math.hypot(gx, gy); ang[i] = Math.atan2(gy, gx);
  }
  const sorted = Array.from(mag).sort((a, b) => a - b), thr = Math.max(40, sorted[Math.floor(sorted.length * 0.9)]);
  const D = Math.ceil(Math.hypot(W, H)), NT = 180, acc = new Uint32Array(NT * (2 * D + 1));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (mag[i] < thr) continue;
    let t0 = Math.round(((ang[i] * 180 / Math.PI) + 360) % 180);
    for (let dt = -3; dt <= 3; dt++) {
      const t = (t0 + dt + NT) % NT, th = t * Math.PI / 180;
      const rho = Math.round(x * Math.cos(th) + y * Math.sin(th));
      acc[t * (2 * D + 1) + rho + D]++;
    }
  }
  const lines = [], minVotes = Math.max(40, Math.min(W, H) * 0.25);
  for (let t = 0; t < NT; t++) for (let r = 0; r <= 2 * D; r++) {
    const v = acc[t * (2 * D + 1) + r]; if (v < minVotes) continue;
    let isMax = true;
    for (let dt = -3; dt <= 3 && isMax; dt++) for (let dr = -6; dr <= 6; dr++) {
      const tt = (t + dt + NT) % NT, rr = r + dr; if (rr < 0 || rr > 2 * D || (!dt && !dr)) continue;
      if (acc[tt * (2 * D + 1) + rr] > v) { isMax = false; break; }
    }
    if (isMax) lines.push({ t, rho: r - D, votes: v });
  }
  // segmento della retta dentro l'immagine (in coordinate immagine 0..1)
  const seg = l => {
    const th = l.t * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), pts = [];
    if (Math.abs(s) > 1e-6) for (const x of [0, W - 1]) { const y = (l.rho - x * c) / s; if (y >= 0 && y <= H - 1) pts.push([x, y]); }
    if (Math.abs(c) > 1e-6) for (const y of [0, H - 1]) { const x = (l.rho - y * s) / c; if (x >= 0 && x <= W - 1) pts.push([x, y]); }
    if (pts.length < 2) return null;
    const [a, b] = pts, lerp = k => [(a[0] + (b[0] - a[0]) * k) / (W - 1), (a[1] + (b[1] - a[1]) * k) / (H - 1)];
    return [...lerp(0.2), ...lerp(0.8)];
  };
  const out = { vert: [], horiz: [] };
  lines.sort((a, b) => b.votes - a.votes);
  for (const l of lines) {
    const dv = Math.min(l.t, 180 - l.t), dh = Math.abs(l.t - 90), sg = seg(l);
    if (!sg) continue;
    if (dv < 25 && out.vert.length < 8) out.vert.push(sg);
    else if (dh < 25 && out.horiz.length < 8) out.horiz.push(sg);
  }
  return out;
}

/* Errore di allineamento delle guide con la geometria data */
function guideError(geo, guides) {
  const G = geoInfo(geo, engine.size[0], engine.size[1], true);
  let e = 0;
  for (const g of guides) {
    const a = outUV(G, [g[0], 1 - g[1]]), b = outUV(G, [g[2], 1 - g[3]]);
    const dx = (b[0] - a[0]) * G.ar, dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const vertical = Math.abs(g[3] - g[1]) > Math.abs(g[2] - g[0]) * engine.size[0] / engine.size[1];
    e += (vertical ? dx / len : dy / len) ** 2;
  }
  return e;
}

/* Ottimizza i parametri indicati (ricerca a coordinate) per allineare le guide */
function solveGeo(geo, guides, keys) {
  const step = { angle: 2, trot: 2, vert: 0.15, horiz: 0.15 }, lim = { angle: 45, trot: 45, vert: 1, horiz: 1 };
  const g = clone(geo);
  let best = guideError(g, guides);
  for (let it = 0; it < 80; it++) {
    let improved = false;
    for (const k of keys) for (const dir of [1, -1]) {
      const old = g[k];
      g[k] = Math.max(-lim[k], Math.min(lim[k], old + dir * step[k]));
      const e = guideError(g, guides);
      if (e < best - 1e-9) { best = e; improved = true; } else g[k] = old;
    }
    if (!improved) { for (const k of keys) step[k] *= 0.5; if (Math.max(...keys.map(k => step[k] / lim[k])) < 1e-4) break; }
  }
  return g;
}

/* modo: level | vertical | full | auto | straighten */
function autoUpright(mode) {
  const L = detectLines();
  const base = clone(params.geo);
  Object.assign(base, { vert: 0, horiz: 0, trot: 0 });
  if (mode === 'straighten') base.angle = 0;
  let guides, keys;
  if (mode === 'straighten') { guides = [...L.horiz, ...L.vert]; keys = ['angle']; }
  else if (mode === 'level') { guides = [...L.horiz, ...L.vert]; keys = ['trot']; }
  else if (mode === 'vertical') { guides = L.vert.length ? [...L.vert, ...L.horiz.slice(0, 2)] : L.horiz; keys = ['trot', 'vert']; }
  else { guides = [...L.vert, ...L.horiz]; keys = ['trot', 'vert', 'horiz']; }
  if (!guides.length) return false;
  const g = solveGeo(base, guides, keys);
  if (mode === 'auto') { g.vert *= 0.7; g.horiz *= 0.7; }
  Object.assign(params.geo, { angle: g.angle, trot: g.trot, vert: g.vert, horiz: g.horiz });
  return true;
}

function guidedUpright() {
  const gs = params.geo.guides;
  if (!gs.length) return;
  const nv = gs.filter(g => Math.abs(g[3] - g[1]) > Math.abs(g[2] - g[0])).length, nh = gs.length - nv;
  const keys = ['trot', ...(nv ? ['vert'] : []), ...(nh ? ['horiz'] : [])];
  const base = clone(params.geo); Object.assign(base, { vert: 0, horiz: 0, trot: 0 });
  const g = solveGeo(base, gs, keys);
  Object.assign(params.geo, { trot: g.trot, vert: g.vert, horiz: g.horiz });
}

/* ---------- Pennello: disegno dei tratti nelle maschere ---------- */

const brushCache = {};   // id maschera -> { cv, n }
let liveVer = 0;

function drawStroke(ctx, s, W, H, from = 0) {
  const r = Math.max(0.5, s.size * H), inner = r * (1 - s.feather);
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  const dab = (x, y) => {
    const gr = ctx.createRadialGradient(x, y, inner, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${s.flow})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  };
  const P = s.pts, step = Math.max(1, r * 0.25);
  if (from === 0 && P.length >= 2) dab(P[0] * W, P[1] * H);
  for (let i = Math.max(2, from); i < P.length; i += 2) {
    const x0 = P[i - 2] * W, y0 = P[i - 1] * H, x1 = P[i] * W, y1 = P[i + 1] * H;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) dab(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function brushCanvases() {
  const [W, H] = engine.maskRes, list = [];
  let ver = String(liveVer);
  params.masks.forEach((m, i) => {
    if (!m.comps.some(c => c.type === 'brush')) { list[i] = null; return; }
    let b = brushCache[m.id];
    if (!b || b.cv.width !== W || b.cv.height !== H) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      b = brushCache[m.id] = { cv, n: -1, sig: '' };
    }
    const sig = m.strokes.length + ':' + (m.strokes.length ? m.strokes[m.strokes.length - 1].pts.length : 0);
    if (b.sig !== sig && !b.live) {
      const ctx = b.cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
      for (const s of m.strokes) drawStroke(ctx, s, W, H);
      b.sig = sig;
    }
    list[i] = b.cv; ver += '|' + m.id + ':' + b.sig;
  });
  return { list, ver };
}

/* ---------- Coordinate schermo <-> immagine ---------- */

const T = {
  rect: () => $('view').getBoundingClientRect(),
  toOut(x, y) { const r = T.rect(); return [(x - r.left) / r.width, 1 - (y - r.top) / r.height]; },
  toIc(x, y) { const uv = srcUV(engine.lastGeo, T.toOut(x, y)); return [uv[0], 1 - uv[1]]; },
  fromIc(ic) {
    const o = outUV(engine.lastGeo, [ic[0], 1 - ic[1]]), r = T.rect(), s = $('stage').getBoundingClientRect();
    return [r.left + o[0] * r.width - s.left, r.top + (1 - o[1]) * r.height - s.top];
  },
  stageXY(e) { const s = $('stage').getBoundingClientRect(); return [e.clientX - s.left, e.clientY - s.top]; },
};

/* ---------- Strumenti attivi ---------- */

const tool = { mode: null, drag: null, pick: null, cursor: null };
const brushOpts = { size: 0.05, feather: 0.5, flow: 0.8, erase: false };
const spotOpts = { mode: 'heal', size: 0.03, feather: 0.4, opacity: 1 };
let selSpot = -1, guideDraft = null;

/* Contagocce: cb riceve { ic, rgb (sorgente), out (colore visualizzato) } */
function startPick(label, cb) {
  tool.pick = cb; tool.mode = 'pick';
  toast(label);
}

function displayedColor(x, y) {
  const r = T.rect(), cv = $('view');
  const px = Math.floor((x - r.left) / r.width * cv.width), py = Math.floor((y - r.top) / r.height * cv.height);
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, px, py, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

const CROP_HANDLE = 28;

function cropHit(x, y) {
  const r = T.rect(), [x0, y0, x1, y1] = params.geo.crop;
  const L = r.left + x0 * r.width, R = r.left + x1 * r.width, Tp = r.top + y0 * r.height, B = r.top + y1 * r.height;
  const nl = Math.abs(x - L) < CROP_HANDLE, nr = Math.abs(x - R) < CROP_HANDLE, nt = Math.abs(y - Tp) < CROP_HANDLE, nb = Math.abs(y - B) < CROP_HANDLE;
  const inX = x > L - CROP_HANDLE && x < R + CROP_HANDLE, inY = y > Tp - CROP_HANDLE && y < B + CROP_HANDLE;
  if (!inX || !inY) return null;
  const h = (nt ? 't' : nb ? 'b' : '') + (nl ? 'l' : nr ? 'r' : '');
  return h || (x > L && x < R && y > Tp && y < B ? 'move' : null);
}

function cropRatio() {
  const g = params.geo;
  if (g.ratio === 'free') return 0;
  if (g.ratio === 'orig') return engine.lastGeo.baseAr;
  if (g.ratio === 'custom') return g.custom[0] / g.custom[1];
  return ASPECTS[g.ratio];
}

/* Imposta un ritaglio centrato con il rapporto scelto */
function resetCrop() {
  const R = cropRatio(), A = geoInfo(params.geo, engine.size[0], engine.size[1], true).baseAr;
  if (!R) { params.geo.crop = [0, 0, 1, 1]; return; }
  let cw = 1, ch = 1;
  if (R > A) ch = A / R; else cw = R / A;
  params.geo.crop = [(1 - cw) / 2, (1 - ch) / 2, (1 + cw) / 2, (1 + ch) / 2];
}

function cropDrag(h, start, x, y) {
  const r = T.rect(), dx = (x - start.x) / r.width, dy = (y - start.y) / r.height;
  let [x0, y0, x1, y1] = start.crop;
  const R = cropRatio(), A = engine.lastGeo.baseAr, min = 0.05;
  if (h === 'move') {
    const w = x1 - x0, hh = y1 - y0;
    x0 = Math.max(0, Math.min(1 - w, x0 + dx)); y0 = Math.max(0, Math.min(1 - hh, y0 + dy));
    params.geo.crop = [x0, y0, x0 + w, y0 + hh]; return;
  }
  if (h.includes('l')) x0 = Math.min(x1 - min, Math.max(0, x0 + dx));
  if (h.includes('r')) x1 = Math.max(x0 + min, Math.min(1, x1 + dx));
  if (h.includes('t')) y0 = Math.min(y1 - min, Math.max(0, y0 + dy));
  if (h.includes('b')) y1 = Math.max(y0 + min, Math.min(1, y1 + dy));
  if (R) {                                          // rapporto bloccato: l'altezza segue la larghezza
    const horizontalEdge = h === 't' || h === 'b';
    if (horizontalEdge) {
      const w = (y1 - y0) * R / A, cx = (start.crop[0] + start.crop[2]) / 2;
      x0 = cx - w / 2; x1 = cx + w / 2;
    } else {
      const hh = (x1 - x0) * A / R;
      if (h.includes('t')) y0 = y1 - hh; else if (h.includes('b') || h === 'l' || h === 'r') {
        if (h === 'l' || h === 'r') { const cy = (start.crop[1] + start.crop[3]) / 2; y0 = cy - hh / 2; y1 = cy + hh / 2; }
        else y1 = y0 + hh;
      }
    }
    if (x0 < 0 || x1 > 1 || y0 < 0 || y1 > 1) return;   // fuori dall'immagine: ignora il movimento
  }
  params.geo.crop = [x0, y0, x1, y1];
}

/* Gestione dei tocchi sull'area dell'immagine */
function toolDown(e) {
  if (!loaded) return false;
  const x = e.clientX, y = e.clientY;
  if (tool.mode === 'pick') {
    const ic = T.toIc(x, y);
    tool.pick({ ic, rgb: sampleIc(ic), out: displayedColor(x, y) });
    tool.mode = null; tool.pick = null; syncToolMode(); return true;
  }
  if (tool.mode === 'crop') {
    const h = cropHit(x, y); if (!h) return false;
    tool.drag = { h, x, y, crop: [...params.geo.crop], before: clone(params) }; return true;
  }
  if (tool.mode === 'brush') {
    const m = params.masks[maskIdx]; if (!m) return false;
    const ic = T.toIc(x, y), b = brushCache[m.id];
    const s = { erase: brushOpts.erase ? 1 : 0, size: brushOpts.size, feather: brushOpts.feather, flow: brushOpts.flow, pts: [ic[0], ic[1]] };
    tool.drag = { stroke: s, before: clone(params) };
    if (b) { b.live = true; drawStroke(b.cv.getContext('2d'), s, b.cv.width, b.cv.height); liveVer++; redraw(); }
    return true;
  }
  if (tool.mode === 'spot') {
    const ic = T.toIc(x, y), [sx, sy] = T.stageXY(e);
    let hit = null;
    params.spots.forEach((s, i) => {
      const d = T.fromIc([s.x, s.y]), q = T.fromIc([s.sx, s.sy]), rr = spotScreenR(s);
      if (Math.hypot(d[0] - sx, d[1] - sy) < Math.max(rr, 18)) hit = { i, part: 'dst' };
      else if (s.mode !== 'redeye' && Math.hypot(q[0] - sx, q[1] - sy) < Math.max(rr, 18)) hit = hit || { i, part: 'src' };
    });
    const before = clone(params);
    if (!hit) {
      const Sa = engine.size[0] / engine.size[1], r = spotOpts.size;
      const [srcX, srcY] = spotOpts.mode === 'redeye' ? ic : autoSource(ic[0], ic[1], r, Sa);
      params.spots.push({ mode: spotOpts.mode, x: ic[0], y: ic[1], sx: srcX, sy: srcY, r, feather: spotOpts.feather, opacity: spotOpts.opacity });
      selSpot = params.spots.length - 1;
      history.undo.push({ label: 'Ritocco', state: before }); history.redo.length = 0;
      syncButtons(); renderPanel(); redraw(); return true;
    }
    selSpot = hit.i;
    tool.drag = { spot: hit, ic, start: clone(params.spots[hit.i]), before };
    renderPanel(); redraw(); return true;
  }
  if (tool.mode === 'maskHandle') {
    const c = selectedComp(); if (!c || !['linear', 'radial'].includes(c.type)) return false;
    const [sx, sy] = T.stageXY(e), ctr = T.fromIc([c.x, c.y]);
    let part = Math.hypot(ctr[0] - sx, ctr[1] - sy) < 34 ? 'center' : null;
    if (!part && c.type === 'radial') {
      const hs = radialHandles(c);
      if (Math.hypot(hs[0][0] - sx, hs[0][1] - sy) < 28) part = 'rx';
      else if (Math.hypot(hs[1][0] - sx, hs[1][1] - sy) < 28) part = 'ry';
    }
    if (!part) return false;
    tool.drag = { part, before: clone(params) }; return true;
  }
  if (tool.mode === 'text') {                       // scritte: tocco su una scritta = selezione e spostamento
    const [sx, sy] = T.stageXY(e);
    const hit = textBoxes.slice().reverse().find(b => sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h);
    if (!hit) return false;
    const i = params.texts.findIndex(t => t.id === hit.id); if (i < 0) return false;
    if (i !== textIdx || !textEditing) { textIdx = i; textEditing = true; renderPanel(); }
    const t = params.texts[i];
    tool.drag = { x, y, tx: t.x, ty: t.y, before: clone(params) }; return true;
  }
  if (tool.mode === 'frame') {                      // riquadro del formato social: trascinandolo si sceglie il taglio
    const fr = frameRect(params, socialCur), r = T.rect(); if (!fr) return false;
    const u = (x - r.left) / r.width, v = (y - r.top) / r.height;
    if (u < fr.x0 - 0.05 || u > fr.x1 + 0.05 || v < fr.y0 - 0.05 || v > fr.y1 + 0.05) return false;
    tool.drag = { x, y, cx: (fr.x0 + fr.x1) / 2, cy: (fr.y0 + fr.y1) / 2, cw: fr.cw, ch: fr.ch, before: clone(params) }; return true;
  }
  if (tool.mode === 'blur') { tool.drag = { before: clone(params) }; toolMove(e); return true; }
  if (tool.mode === 'guide') { const ic = T.toIc(x, y); guideDraft = [ic[0], ic[1], ic[0], ic[1]]; tool.drag = { before: clone(params) }; return true; }
  return false;
}

function toolMove(e) {
  const d = tool.drag; if (!d) return;
  const x = e.clientX, y = e.clientY;
  if (tool.mode === 'crop') { cropDrag(d.h, d, x, y); redraw(); }
  else if (tool.mode === 'brush') {
    const ic = T.toIc(x, y), s = d.stroke, m = params.masks[maskIdx], b = m && brushCache[m.id];
    const n = s.pts.length; s.pts.push(ic[0], ic[1]);
    if (b) { drawStroke(b.cv.getContext('2d'), s, b.cv.width, b.cv.height, n); liveVer++; redraw(); }
  } else if (tool.mode === 'spot') {
    const ic = T.toIc(x, y), s = params.spots[d.spot.i], dx = ic[0] - d.ic[0], dy = ic[1] - d.ic[1];
    if (d.spot.part === 'dst') { s.x = d.start.x + dx; s.y = d.start.y + dy; if (s.mode === 'redeye') { s.sx = s.x; s.sy = s.y; } }
    else { s.sx = d.start.sx + dx; s.sy = d.start.sy + dy; }
    redraw();
  } else if (tool.mode === 'maskHandle') {
    const c = selectedComp(), ic = T.toIc(x, y), Sa = engine.size[0] / engine.size[1];
    if (d.part === 'center') { c.x = ic[0]; c.y = ic[1]; }
    else {
      const px = (ic[0] - c.x) * Sa, py = ic[1] - c.y, a = c.angle * Math.PI / 180;
      const lx = Math.cos(a) * px + Math.sin(a) * py, ly = -Math.sin(a) * px + Math.cos(a) * py;
      if (d.part === 'rx') c.rx = Math.max(0.01, Math.abs(lx)); else c.ry = Math.max(0.01, Math.abs(ly));
    }
    redraw();
  } else if (tool.mode === 'blur') {
    const ic = T.toIc(x, y); params.lbX = ic[0]; params.lbY = ic[1];
    if (params.lbType === 'depth') params.lbFocus = depthAt(ic);
    redraw();
  }
  else if (tool.mode === 'guide') { const ic = T.toIc(x, y); guideDraft[2] = ic[0]; guideDraft[3] = ic[1]; drawOverlay(); }
  else if (tool.mode === 'frame') {
    const r = T.rect(), f = (params.frames[socialCur] ||= {});
    f.x = Math.max(d.cw / 2, Math.min(1 - d.cw / 2, d.cx + (x - d.x) / r.width));
    f.y = Math.max(d.ch / 2, Math.min(1 - d.ch / 2, d.cy + (y - d.y) / r.height));
    drawOverlay();
  }
  else if (tool.mode === 'text') {
    const r = T.rect(), t = params.texts[textIdx]; if (!t) return;
    t.x = Math.max(0, Math.min(1, d.tx + (x - d.x) / r.width)); t.y = Math.max(0, Math.min(1, d.ty + (y - d.y) / r.height));
    drawOverlay();
  }
}

function toolUp() {
  const d = tool.drag; if (!d) return;
  tool.drag = null;
  const labels = { crop: 'Ritaglio', brush: 'Pennello', spot: 'Ritocco', maskHandle: 'Maschera', blur: 'Sfocatura', guide: 'Guida Upright', text: 'Sposta scritta', frame: 'Taglio formato' };
  if (tool.mode === 'brush') {
    const m = params.masks[maskIdx];
    if (m) { m.strokes.push(d.stroke); const b = brushCache[m.id]; if (b) { b.live = false; b.sig = m.strokes.length + ':' + d.stroke.pts.length; } }
  }
  if (tool.mode === 'guide' && guideDraft) {
    const len = Math.hypot(guideDraft[2] - guideDraft[0], guideDraft[3] - guideDraft[1]);
    if (len > 0.05) { params.geo.guides = [...params.geo.guides.slice(-3), guideDraft]; guidedUpright(); }
    guideDraft = null;
  }
  history.undo.push({ label: labels[tool.mode] || 'Modifica', state: d.before }); history.redo.length = 0;
  syncButtons(); renderPanel(); redraw();
}

function spotScreenR(s) {
  const Sa = engine.size[0] / engine.size[1], a = T.fromIc([s.x, s.y]), b = T.fromIc([s.x + s.r / Sa, s.y]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function radialHandles(c) {
  const Sa = engine.size[0] / engine.size[1], a = c.angle * Math.PI / 180;
  const pt = (lx, ly) => T.fromIc([c.x + (Math.cos(a) * lx - Math.sin(a) * ly) / Sa, c.y + Math.sin(a) * lx + Math.cos(a) * ly]);
  return [pt(c.rx, 0), pt(0, c.ry)];
}

/* ---------- Disegno della sovrapposizione ---------- */

function drawOverlay() {
  const ov = $('ov'), st = $('stage').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (ov.width !== Math.round(st.width * dpr) || ov.height !== Math.round(st.height * dpr)) {
    ov.width = Math.round(st.width * dpr); ov.height = Math.round(st.height * dpr);
  }
  const ctx = ov.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, st.width, st.height);
  if (!loaded) return;
  const r = T.rect(), L = r.left - st.left, Tp = r.top - st.top;
  ctx.lineWidth = 1.5;

  if (tool.mode === 'crop') {
    const [x0, y0, x1, y1] = params.geo.crop;
    const a = [L + x0 * r.width, Tp + y0 * r.height], b = [L + x1 * r.width, Tp + y1 * r.height], w = b[0] - a[0], h = b[1] - a[1];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.rect(L, Tp, r.width, r.height); ctx.rect(a[0], a[1], w, h); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    const grid = params.geo.grid, lines = [];
    if (grid === 'thirds') lines.push(1 / 3, 2 / 3);
    else if (grid === 'golden') lines.push(0.382, 0.618);
    else if (grid === 'grid') for (let i = 1; i < 6; i++) lines.push(i / 6);
    for (const k of lines) {
      ctx.beginPath(); ctx.moveTo(a[0] + w * k, a[1]); ctx.lineTo(a[0] + w * k, b[1]);
      ctx.moveTo(a[0], a[1] + h * k); ctx.lineTo(b[0], a[1] + h * k); ctx.stroke();
    }
    if (grid === 'diagonal') { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(b[0], a[1]); ctx.lineTo(a[0], b[1]); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], w, h);
    ctx.lineWidth = 4;
    for (const [px, py, sx, sy] of [[a[0], a[1], 1, 1], [b[0], a[1], -1, 1], [a[0], b[1], 1, -1], [b[0], b[1], -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(px + 18 * sx, py); ctx.lineTo(px, py); ctx.lineTo(px, py + 18 * sy); ctx.stroke();
    }
  }

  if (tool.mode === 'spot') {
    params.spots.forEach((s, i) => {
      const d = T.fromIc([s.x, s.y]), rr = spotScreenR(s);
      ctx.strokeStyle = i === selSpot ? '#4da3ff' : '#fff';
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(d[0], d[1], rr, 0, 7); ctx.stroke();
      if (s.mode !== 'redeye') {
        const q = T.fromIc([s.sx, s.sy]);
        ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    });
    ctx.setLineDash([]);
  }

  if (tool.mode === 'maskHandle' || tool.mode === 'brush') {
    const c = selectedComp();
    if (c && c.type === 'radial') {
      const ctr = T.fromIc([c.x, c.y]), hs = radialHandles(c);
      const rx = Math.hypot(hs[0][0] - ctr[0], hs[0][1] - ctr[1]), ry = Math.hypot(hs[1][0] - ctr[0], hs[1][1] - ctr[1]);
      const ang = Math.atan2(hs[0][1] - ctr[1], hs[0][0] - ctr[0]);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ctr[0], ctr[1], rx, ry, ang, 0, 7); ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(ctr[0], ctr[1], rx * (1 - c.feather), ry * (1 - c.feather), ang, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#4da3ff';
      for (const h of [ctr, ...hs]) { ctx.beginPath(); ctx.arc(h[0], h[1], 7, 0, 7); ctx.fill(); }
    } else if (c && c.type === 'linear') {
      const Sa = engine.size[0] / engine.size[1], a = c.angle * Math.PI / 180, n = [Math.cos(a), Math.sin(a)], t = [-n[1], n[0]];
      const P = (k, s) => T.fromIc([c.x + (n[0] * k + t[0] * s) / Sa, c.y + n[1] * k + t[1] * s]);
      ctx.strokeStyle = '#fff';
      for (const [k, dash] of [[-c.width / 2, []], [0, [4, 4]], [c.width / 2, []]]) {
        const p1 = P(k, -2), p2 = P(k, 2);
        ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.fillStyle = '#4da3ff';
      const ctr = T.fromIc([c.x, c.y]); ctx.beginPath(); ctx.arc(ctr[0], ctr[1], 7, 0, 7); ctx.fill();
    }
    if (tool.mode === 'brush' && tool.cursor) {
      const [cx, cy] = tool.cursor, Sa = engine.size[0] / engine.size[1];
      const ic = T.toIc(cx + st.left, cy + st.top), e = T.fromIc([ic[0] + brushOpts.size / Sa, ic[1]]);
      const rr = Math.hypot(e[0] - cx, e[1] - cy);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke();
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(cx, cy, rr * (1 - brushOpts.feather), 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  if (tool.mode === 'blur' && params.lbAmt > 0 && params.lbType !== 'depth') {
    const ctr = T.fromIc([params.lbX, params.lbY]);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#4da3ff';
    ctx.beginPath(); ctx.arc(ctr[0], ctr[1], 8, 0, 7); ctx.fill();
  }

  // scritte sulla foto (come verranno esportate); con la sezione Testo aperta, quella scelta è riquadrata
  textBoxes = [];
  if (params.texts?.length && tool.mode !== 'crop') {
    textBoxes = drawTexts(ctx, r.width, r.height, params.texts, L, Tp);
    const b = curTab === 'Testo' && textEditing && textBoxes[textIdx];
    if (b) { ctx.save(); ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore(); }
  }

  // formato social: zona tagliata scurita (o bordi/sfondo aggiunti), riquadro con terzi e nome del formato
  const fr = curTab === 'Social' && socialCur && frameRect(params, socialCur);
  if (fr) {
    const X = u => L + u * r.width, Y = v => Tp + v * r.height;
    const fx = X(fr.x0), fy = Y(fr.y0), fw = (fr.x1 - fr.x0) * r.width, fh = (fr.y1 - fr.y0) * r.height;
    ctx.save();
    if (fr.fit === 'crop') {
      ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.beginPath(); ctx.rect(L, Tp, r.width, r.height); ctx.rect(fx, fy, fw, fh); ctx.fill('evenodd');
    } else {
      ctx.fillStyle = fr.fit === 'pad' ? exportOpts.padColor : 'rgba(120,120,120,0.55)';
      ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.rect(L, Tp, r.width, r.height); ctx.fill('evenodd');
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    for (const k of [1, 2]) {
      ctx.beginPath(); ctx.moveTo(fx + fw * k / 3, fy); ctx.lineTo(fx + fw * k / 3, fy + fh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, fy + fh * k / 3); ctx.lineTo(fx + fw, fy + fh * k / 3); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(fx, fy, fw, fh);
    const label = `${fr.t.group} · ${fr.t.name}`;
    ctx.font = '600 12px system-ui, sans-serif'; const lw = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(fx + 6, fy + 6, lw, 22);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, fx + 13, fy + 17);
    ctx.restore();
  }

  if (tool.mode === 'guide') {
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
    for (const g of [...params.geo.guides, ...(guideDraft ? [guideDraft] : [])]) {
      const a = T.fromIc([g[0], g[1]]), b = T.fromIc([g[2], g[3]]);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 7); ctx.fill(); }
    }
  }
}

/* ---------- Gesti: zoom/spostamento + strumenti ---------- */

function setupGestures() {
  const st = $('stage'), ptrs = new Map();
  let lastDist = 0, toolActive = false;
  // tenere premuto sulla foto (senza strumenti attivi) mostra l'originale finché non si solleva il dito
  let pressTimer = 0, pressAt = null;
  const setCompare = v => { if (comparing === v) return; comparing = v; $('stage').classList.toggle('comparing', v); redraw(); };
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = 0; pressAt = null; };
  const clampView = () => {
    if (view.scale <= 1) { view.scale = 1; view.x = view.y = 0; return; }
    const r = st.getBoundingClientRect(), mx = r.width * (view.scale - 1) / 2, my = r.height * (view.scale - 1) / 2;
    view.x = Math.max(-mx, Math.min(mx, view.x)); view.y = Math.max(-my, Math.min(my, view.y));
  };
  const update = () => { clampView(); applyView(); redraw(); };
  st.addEventListener('pointerdown', e => {
    st.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); lastDist = 0;
    if (ptrs.size === 1) {
      toolActive = toolDown(e);
      if (!toolActive && !tool.mode && loaded) { pressAt = [e.clientX, e.clientY]; pressTimer = setTimeout(() => { pressTimer = 0; setCompare(true); }, 350); }
    } else { cancelPress(); setCompare(false); if (toolActive) { toolUp(); toolActive = false; } }
  });
  st.addEventListener('pointermove', e => {
    if (tool.mode === 'brush') { tool.cursor = T.stageXY(e); if (!toolActive) drawOverlay(); }
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 10) cancelPress();
    if (toolActive) { toolMove(e); return; }
    if (ptrs.size === 1 && view.scale > 1 && tool.mode !== 'crop') { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; update(); }
    else if (ptrs.size === 2 && tool.mode !== 'crop') {
      const [a, b] = [...ptrs.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastDist) { view.scale = Math.max(1, Math.min(8, view.scale * dist / lastDist)); update(); }
      lastDist = dist;
    }
  });
  const end = e => {
    ptrs.delete(e.pointerId); lastDist = 0;
    if (!ptrs.size) { cancelPress(); setCompare(false); }
    if (toolActive && !ptrs.size) { toolUp(); toolActive = false; }
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('contextmenu', e => e.preventDefault());   // niente menu "Salva immagine" tenendo premuto (iPhone/Android)
  st.addEventListener('pointerleave', () => { tool.cursor = null; drawOverlay(); });
  st.addEventListener('wheel', e => {
    e.preventDefault();
    if (tool.mode === 'crop') return;
    view.scale = Math.max(1, Math.min(8, view.scale * (e.deltaY < 0 ? 1.15 : 0.87))); update();
  }, { passive: false });
  st.addEventListener('dblclick', () => {
    if (tool.mode) return;
    view.scale = view.scale > 1 ? 1 : 2.5; if (view.scale === 1) view.x = view.y = 0; update();
  });
}
