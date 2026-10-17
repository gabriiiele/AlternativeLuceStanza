'use strict';

/* Funzioni AI:
   - Super Resolution: modelli ESRGAN (TensorFlow.js) inclusi nell'app, funzionano offline
   - Mappa di profondità: Depth Anything V2 Small (transformers.js), scaricato al primo uso (~27 MB) e poi in cache
   - Analisi del viso: MediaPipe (incluso, offline) per beauty, trucco, occhi, denti e maschere persona/pelle/capelli
   - Look da descrizione: motore offline a parole chiave, oppure Claude (con chiave API personale) che vede la foto */

const aiSettings = (() => {
  const d = { apiKey: '', model: 'claude-opus-5-5', effort: 'medium' };
  try { return { ...d, ...JSON.parse(localStorage.getItem('aiSettings') || '{}') }; } catch { return d; }
})();
function saveAiSettings() { try { localStorage.setItem('aiSettings', JSON.stringify(aiSettings)); } catch { /* spazio pieno */ } }

const loadedScripts = {};
function loadScript(src) {
  return loadedScripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Impossibile caricare ' + src));
    document.head.append(s);
  });
}
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ---------- Super Resolution ---------- */

const SR_MODELS = { fast: 'vendor/sr/slim-x2/model.json', quality: 'vendor/sr/medium-x2/model.json', x4: 'vendor/sr/medium-x4/model.json' };
const SR_LIMIT = CANVAS_MAX_SIDE;   // lato massimo di un canvas nel browser (4096 su iPhone)
const srCache = {};

/* Passaggi per arrivare al lato lungo voluto: ingrandimenti AI ×2 / ×4 in sequenza,
   poi un ricampionamento finale di qualità per centrare i pixel esatti */
function srPlan(w, h, target) {
  const steps = []; let L = Math.max(w, h);
  target = Math.min(SR_LIMIT, target);
  while (L * 1.15 < target) {
    const scale = target / L > 2 ? 4 : 2;   // poi il risultato viene ridotto ai pixel esatti
    if (L * scale > SR_LIMIT) { L = Math.min(Math.floor(SR_LIMIT / scale), Math.ceil(target / scale)); steps.push({ shrink: L }); }
    steps.push({ scale, from: L }); L *= scale;
  }
  return { steps, target, k: target / Math.max(w, h) };
}

/* Ridimensionamento di qualità (a metà per volta quando si riduce molto) */
function resizeCanvas(src, w, h) {
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(cur.width / 2), height: Math.round(cur.height / 2) });
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, c.width, c.height); cur = c;
  }
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h);
  return c;
}

/* Un passaggio del modello ESRGAN a tasselli */
async function srPass(tf, input, mode, scale, onProgress) {
  const model = srCache[mode] ||= await tf.loadLayersModel(SR_MODELS[mode]);
  const w = input.width, h = input.height;
  const ictx = input.getContext('2d', { willReadFrequently: true });
  const out = Object.assign(document.createElement('canvas'), { width: w * scale, height: h * scale });
  const octx = out.getContext('2d');
  const T = 128, P = 10, tiles = Math.ceil(w / T) * Math.ceil(h / T);
  let done = 0;
  for (let ty = 0; ty < h; ty += T) for (let tx = 0; tx < w; tx += T) {
    const x0 = Math.max(0, tx - P), y0 = Math.max(0, ty - P), x1 = Math.min(w, tx + T + P), y1 = Math.min(h, ty + T + P);
    const img = ictx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const tw = Math.min(T, w - tx), th = Math.min(T, h - ty);
    const res = tf.tidy(() => {
      const t = tf.browser.fromPixels(img).toFloat().expandDims(0);
      const y = model.predict(t);
      return y.slice([0, (ty - y0) * scale, (tx - x0) * scale, 0], [1, th * scale, tw * scale, 3]).clipByValue(0, 255);
    });
    const data = await res.data(); res.dispose();
    const id = octx.createImageData(tw * scale, th * scale);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) { id.data[j] = data[i]; id.data[j + 1] = data[i + 1]; id.data[j + 2] = data[i + 2]; id.data[j + 3] = 255; }
    octx.putImageData(id, tx * scale, ty * scale);
    onProgress(++done / tiles);
    if (done % 4 === 0) await nextFrame();
  }
  return out;
}

/* src: canvas con l'originale a piena risoluzione; target: lato lungo voluto in pixel.
   fast = modello leggero per i passaggi ×2. Restituisce un canvas. */
async function superResolution(src, { target, fast = false, onProgress = () => {} } = {}) {
  await loadScript('vendor/tf.min.js');
  const tf = window.tf;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();
  const plan = srPlan(src.width, src.height, target);
  // peso di ogni passaggio = pixel elaborati, per una barra di avanzamento uniforme
  const passes = plan.steps.filter(s => s.scale), tot = passes.reduce((a, s) => a + s.from * s.from, 0) || 1;
  let cur = src, doneW = 0;
  for (const s of plan.steps) {
    if (s.shrink) { const k = s.shrink / Math.max(cur.width, cur.height); cur = resizeCanvas(cur, Math.round(cur.width * k), Math.round(cur.height * k)); continue; }
    const wgt = s.from * s.from / tot;
    cur = await srPass(tf, cur, s.scale === 4 ? 'x4' : fast ? 'fast' : 'quality', s.scale, v => onProgress((doneW + v * wgt) * 0.97));
    doneW += wgt;
  }
  const k = plan.target / Math.max(cur.width, cur.height);
  if (Math.abs(k - 1) > 1e-3) cur = resizeCanvas(cur, Math.round(cur.width * k), Math.round(cur.height * k));
  onProgress(1);
  return cur;
}

/* ---------- Mappa di profondità ---------- */

let depthPipe = null;
const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';

async function depthMap(src, onProgress = () => {}) {
  const test = window.__aiTest;                       // solo per i test automatici (libreria e modello locali)
  // libreria caricata dalla CDN al primo uso: il modello va comunque scaricato da internet
  const T = await import(test?.lib || 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js');
  if (test) {
    T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.localModelPath = test.localModelPath;
    T.env.backends.onnx.wasm.wasmPaths = test.wasmPaths;
  }
  if (!depthPipe) {
    const files = {};
    const load = device => T.pipeline('depth-estimation', test ? test.model : DEPTH_MODEL, {
      device, dtype: device === 'webgpu' ? 'fp16' : 'q8',
      progress_callback: p => {
        if (p.status === 'progress' && p.total) { files[p.file] = p.loaded / p.total; const v = Object.values(files); onProgress(0.9 * v.reduce((a, b) => a + b, 0) / v.length, 'download'); }
      },
    });
    // WebGPU è più veloce ma non tutti i telefoni (o tutti gli iPhone) lo supportano: in caso di errore si usa WebAssembly
    if (!test && navigator.gpu) { try { depthPipe = await load('webgpu'); } catch (e) { console.warn('WebGPU non disponibile', e); } }
    if (!depthPipe) depthPipe = await load('wasm');
  }
  onProgress(0.92, 'calcolo');
  const k = Math.min(1, 1024 / Math.max(src.width, src.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(src.width * k), height: Math.round(src.height * k) });
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const out = await depthPipe(await T.RawImage.fromBlob(blob));
  const res = Array.isArray(out) ? out[0] : out;
  // tensore -> canvas normalizzato (chiaro = vicino)
  const t = res.predicted_depth, dims = t.dims, dh = dims[dims.length - 2], dw = dims[dims.length - 1], d = t.data;
  let mn = Infinity, mx = -Infinity;
  for (const x of d) { if (x < mn) mn = x; if (x > mx) mx = x; }
  const dc = Object.assign(document.createElement('canvas'), { width: dw, height: dh }), dctx = dc.getContext('2d');
  const id = dctx.createImageData(dw, dh);
  for (let i = 0; i < dw * dh; i++) { const v = Math.round((d[i] - mn) / (mx - mn || 1) * 255); id.data.set([v, v, v, 255], i * 4); }
  dctx.putImageData(id, 0, 0);
  // riporta alle proporzioni della foto
  const fc = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height });
  const fctx = fc.getContext('2d'); fctx.imageSmoothingQuality = 'high'; fctx.drawImage(dc, 0, 0, fc.width, fc.height);
  refineDepth(fc, c);
  onProgress(1, 'fatto');
  return fc;
}

/* Filtro guidato (He et al.): i bordi della mappa di profondità vengono allineati ai bordi reali della foto,
   così la sfocatura segue capelli e contorni invece di lasciare un alone attorno al soggetto */
function refineDepth(depthCanvas, guideCanvas) {
  const w = depthCanvas.width, h = depthCanvas.height, n = w * h;
  const dctx = depthCanvas.getContext('2d', { willReadFrequently: true }), dd = dctx.getImageData(0, 0, w, h);
  const gd = guideCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const I = new Float32Array(n), P = new Float32Array(n);
  for (let i = 0; i < n; i++) { I[i] = (0.2126 * gd[i * 4] + 0.7152 * gd[i * 4 + 1] + 0.0722 * gd[i * 4 + 2]) / 255; P[i] = dd.data[i * 4] / 255; }
  const r = Math.max(2, Math.round(Math.max(w, h) / 120)), eps = 2e-3;
  const box = a => boxBlur(a, w, h, r, 1);
  const mI = box(I.slice()), mP = box(P.slice());
  const II = new Float32Array(n), IP = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; IP[i] = I[i] * P[i]; }
  box(II); box(IP);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = II[i] - mI[i] * mI[i], cov = IP[i] - mI[i] * mP[i];
    A[i] = cov / (varI + eps); B[i] = mP[i] - A[i] * mI[i];
  }
  box(A); box(B);
  for (let i = 0; i < n; i++) {
    const q = Math.round(Math.max(0, Math.min(1, A[i] * I[i] + B[i])) * 255);
    dd.data[i * 4] = dd.data[i * 4 + 1] = dd.data[i * 4 + 2] = q;
  }
  dctx.putImageData(dd, 0, 0);
}

/* ---------- Analisi del viso (beauty e maschere) ----------
   MediaPipe (incluso nell'app, funziona offline): Face Landmarker trova 478 punti per ogni viso (contorni di occhi,
   labbra, sopracciglia, iride), Selfie Multiclass separa pelle, capelli, vestiti e sfondo.
   Risultato: un'immagine con 9 zone in 3 fasce (alto: pelle, labbra, occhi · centro: denti, capelli, persona ·
   basso: palpebre, sopracciglia, viso), letta dagli shader. */

const FACE_PARTS = ['Pelle', 'Labbra', 'Occhi', 'Denti', 'Capelli', 'Persona', 'Palpebre', 'Sopracciglia', 'Viso'];
const FACE_DIR = 'vendor/face/';
let faceTasks = null;

async function loadFaceTasks() {
  if (faceTasks) return faceTasks;
  const V = await import('./' + FACE_DIR + 'vision_bundle.mjs');
  const fileset = { wasmLoaderPath: new URL(FACE_DIR + 'vision_wasm_internal.js', location.href).href,
    wasmBinaryPath: new URL(FACE_DIR + 'vision_wasm_internal.wasm', location.href).href };
  const opts = file => ({ baseOptions: { modelAssetPath: new URL(FACE_DIR + file, location.href).href, delegate: 'CPU' }, runningMode: 'IMAGE' });
  const landmarker = await V.FaceLandmarker.createFromOptions(fileset, { ...opts('face_landmarker.task'), numFaces: 6,
    minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4 });
  const segmenter = await V.ImageSegmenter.createFromOptions(fileset, { ...opts('selfie_multiclass.tflite'),
    outputCategoryMask: false, outputConfidenceMasks: true });
  return (faceTasks = { landmarker, segmenter });
}

// contorni dei punti di MediaPipe Face Mesh
const FM = {
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  lipsOut: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  lipsIn: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  eyeR: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeL: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  browR: [46, 53, 52, 65, 55, 107, 66, 105, 63, 70],
  browL: [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
  lidR: [33, 246, 161, 160, 159, 158, 157, 173, 133, 55, 65, 52, 53, 46],     // palpebra: dal bordo superiore dell'occhio al sopracciglio
  lidL: [263, 466, 388, 387, 386, 385, 384, 398, 362, 285, 295, 282, 283, 276],
};

/* src: canvas della foto. Restituisce { canvas (w × 3h), faces } */
async function faceMap(src, onProgress = () => {}) {
  onProgress(0.05, 'Caricamento modelli…');
  const { landmarker, segmenter } = await loadFaceTasks();
  onProgress(0.4, 'Ricerca dei visi…');
  const k = Math.min(1, 1024 / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k)), n = w * h;
  const img = canvasOf(w, h); const ictx = img.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingQuality = 'high'; ictx.drawImage(src, 0, 0, w, h);
  // i punti si cercano su un'immagine più grande (visi piccoli nelle foto a figura intera)
  const big = scaledCanvas(src, 2048);
  const faces = landmarker.detect(big).faceLandmarks || [];
  await nextFrame();

  // segmentazione: tutta la foto, poi di nuovo su ogni viso ingrandito per avere bordi precisi
  onProgress(0.6, 'Pelle e capelli…');
  const Z = { hair: new Float32Array(n), skin: new Float32Array(n), person: new Float32Array(n) };
  const segment = (canvas, put) => {
    const r = segmenter.segment(canvas), m = r.confidenceMasks.map(x => x.getAsFloat32Array());
    const mw = r.confidenceMasks[0].width, mh = r.confidenceMasks[0].height;
    put(m, mw, mh); r.close();
  };
  // categorie: 0 sfondo, 1 capelli, 2 pelle del corpo, 3 pelle del viso, 4 vestiti, 5 accessori
  segment(img, (m, mw, mh) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = Math.min(mh - 1, Math.floor(y * mh / h)) * mw + Math.min(mw - 1, Math.floor(x * mw / w)), i = y * w + x;
      Z.hair[i] = m[1][j]; Z.skin[i] = m[2][j] + m[3][j]; Z.person[i] = 1 - m[0][j];
    }
  });
  for (const lm of faces) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const s = Math.max((x1 - x0) * w, (y1 - y0) * h) * 2.2, cx = (x0 + x1) / 2 * w, cy = (y0 + y1) / 2 * h;
    const bx = Math.max(0, Math.round(cx - s / 2)), by = Math.max(0, Math.round(cy - s / 2));
    const bw = Math.min(w, Math.round(cx + s / 2)) - bx, bh = Math.min(h, Math.round(cy + s / 2)) - by;
    if (bw < 32 || bh < 32 || bw * bh > n * 0.6) continue;    // viso già grande: basta la prima passata
    const sc = Math.min(512, Math.round(s / k)) / Math.max(bw, bh);   // il ritaglio dalla foto originale
    const crop = canvasOf(Math.round(bw * sc), Math.round(bh * sc));
    crop.getContext('2d').drawImage(src, bx / k, by / k, bw / k, bh / k, 0, 0, crop.width, crop.height);
    segment(crop, (m, mw, mh) => {
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        // sfumatura verso i bordi del ritaglio, così non si vede la giunzione
        const e = Math.min(x, y, bw - 1 - x, bh - 1 - y) / (Math.min(bw, bh) * 0.12), a = Math.min(1, e);
        const j = Math.min(mh - 1, Math.floor(y * mh / bh)) * mw + Math.min(mw - 1, Math.floor(x * mw / bw)), i = (by + y) * w + bx + x;
        Z.hair[i] += (m[1][j] - Z.hair[i]) * a; Z.skin[i] += (m[2][j] + m[3][j] - Z.skin[i]) * a; Z.person[i] += (1 - m[0][j] - Z.person[i]) * a;
      }
    });
  }

  // zone dei punti del viso, disegnate come poligoni
  onProgress(0.8, 'Occhi e labbra…');
  const zone = (draw) => {
    const c = canvasOf(w, h), x = c.getContext('2d'); x.fillStyle = '#fff';
    for (const lm of faces) draw(x, (ids, close = true) => {
      x.beginPath(); ids.forEach((id, t) => { const p = lm[id]; t ? x.lineTo(p.x * w, p.y * h) : x.moveTo(p.x * w, p.y * h); });
      if (close) x.closePath();
    }, lm);
    const d = x.getImageData(0, 0, w, h).data, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = d[i * 4] / 255;
    return out;
  };
  const fill = ids => (x, path) => { path(ids); x.fill(); };
  const mouth = zone(fill(FM.lipsIn)), lips = zone(fill(FM.lipsOut));
  for (let i = 0; i < n; i++) lips[i] = Math.max(0, lips[i] - mouth[i]);
  const eyes = zone((x, path, lm) => {
    path(FM.eyeR); x.fill(); path(FM.eyeL); x.fill();
    if (lm.length > 477) for (const c of [468, 473]) {          // iride intera, anche se la palpebra la copre in parte
      const r = Math.hypot((lm[c + 1].x - lm[c + 3].x) * w, (lm[c + 1].y - lm[c + 3].y) * h) / 2;
      x.save(); path(c === 468 ? FM.eyeR : FM.eyeL); x.clip(); x.beginPath(); x.arc(lm[c].x * w, lm[c].y * h, r, 0, 7); x.fill(); x.restore();
    }
  });
  const brows = zone((x, path) => { path(FM.browR); x.fill(); path(FM.browL); x.fill(); });
  const lids = zone((x, path) => { path(FM.lidR); x.fill(); path(FM.lidL); x.fill(); });
  const oval = zone(fill(FM.oval));
  // il trucco delle palpebre sfuma oltre il contorno: zona allargata e morbida; occhi e labbra con bordi appena morbidi
  const fs = Math.max(1, Math.round(Math.max(w, h) / 700));
  boxBlur(lips, w, h, fs, 2); boxBlur(mouth, w, h, fs, 2); boxBlur(eyes, w, h, fs, 2); boxBlur(brows, w, h, fs, 2);
  boxBlur(lids, w, h, fs * 3, 3); boxBlur(oval, w, h, fs * 2, 2);
  for (let i = 0; i < n; i++) lids[i] = Math.min(1, lids[i] * 1.6) * (1 - eyes[i]) * (1 - brows[i] * 0.7);

  // pelle: segmentazione allineata ai bordi della foto (filtro guidato), senza occhi, labbra, bocca e sopracciglia
  const guided = a => {
    const cv = canvasOf(w, h), x = cv.getContext('2d'), id = x.createImageData(w, h);
    for (let i = 0; i < n; i++) { const v = Math.round(Math.max(0, Math.min(1, a[i])) * 255); id.data[i * 4] = v; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0); refineDepth(cv, img);
    const d = x.getImageData(0, 0, w, h).data; for (let i = 0; i < n; i++) a[i] = d[i * 4] / 255;
  };
  guided(Z.skin); guided(Z.hair); guided(Z.person);
  // bordo della pelle sfumato: il ritocco svanisce gradualmente invece di fermarsi su una linea
  for (let i = 0; i < n; i++) Z.skin[i] = Math.min(1, Math.max(0, (Z.skin[i] - 0.2) / 0.5));
  boxBlur(Z.skin, w, h, fs * 3, 2);
  for (let i = 0; i < n; i++) {
    const s = Z.skin[i];
    Z.skin[i] = s * (1 - Math.min(1, eyes[i] * 1.5)) * (1 - Math.min(1, lips[i] * 1.5)) * (1 - mouth[i]) * (1 - brows[i]);
  }

  const out = canvasOf(w, h * 3), octx = out.getContext('2d'), od = octx.createImageData(w, h * 3), D = od.data;
  const bands = [[Z.skin, lips, eyes], [mouth, Z.hair, Z.person], [lids, brows, oval]];
  bands.forEach((b, t) => {
    for (let i = 0; i < n; i++) {
      const o = (t * n + i) * 4;
      D[o] = Math.round(Math.max(0, Math.min(1, b[0][i])) * 255); D[o + 1] = Math.round(Math.max(0, Math.min(1, b[1][i])) * 255);
      D[o + 2] = Math.round(Math.max(0, Math.min(1, b[2][i])) * 255); D[o + 3] = 255;
    }
  });
  octx.putImageData(od, 0, 0);
  onProgress(1, 'Fatto');
  return { canvas: out, faces: faces.length };
}

/* ---------- Look da descrizione ---------- */

/* Schema della risposta: regolazioni globali + maschere adattive opzionali */
const num = d => ({ type: 'number', description: d });
const LOOK_SCHEMA = (() => {
  const props = {
    name: { type: 'string', description: 'Nome breve del look, in italiano' },
    explanation: { type: 'string', description: 'Una o due frasi in italiano su cosa è stato fatto e perché, riferite a questa foto' },
    exp: num('Esposizione in EV, da -3 a 3'), contrast: num('-1..1'), hi: num('Alte luci -1..1'), sh: num('Ombre -1..1'),
    wh: num('Bianchi -1..1'), bl: num('Neri -1..1'), temp: num('Temperatura -1 (blu) .. 1 (caldo)'), tint: num('Tinta -1 (verde) .. 1 (magenta)'),
    vib: num('Vividezza -1..1'), sat: num('Saturazione -1..1'), texture: num('-1..1'), clarity: num('-1..1'), dehaze: num('-1..1'),
    vig: num('Vignettatura 0..1 scurisce i bordi, negativo schiarisce'), grain: num('Grana 0..1'), fade: num('Dissolvenza dei neri 0..1'),
    glow: num('Bagliore 0..1'), halation: num('Alone rosso delle alte luci tipo pellicola 0..1'), mono: num('0 colore, 1 bianco e nero'),
    gsH: num('Tonalità ombre 0..360'), gsS: num('Saturazione ombre 0..1 (0.3 è già forte)'), gsL: num('Luminanza ombre -1..1'),
    gmH: num('Tonalità mezzitoni 0..360'), gmS: num('0..1'), gmL: num('-1..1'),
    ghH: num('Tonalità alte luci 0..360'), ghS: num('0..1'), ghL: num('-1..1'), gBal: num('Bilanciamento gradazione -1..1'),
    calRH: num('Calibrazione rosso tonalità -1..1'), calRS: num('-1..1'), calGH: num('-1..1'), calGS: num('-1..1'), calBH: num('-1..1'), calBS: num('-1..1'),
    hsl: {
      type: 'array', description: 'Esattamente 8 voci in ordine: rosso, arancione, giallo, verde, acquamarina, blu, viola, magenta',
      items: { type: 'object', additionalProperties: false, required: ['hue', 'sat', 'lum'],
        properties: { hue: num('Spostamento tonalità -1..1 (±30°)'), sat: num('-1..1'), lum: num('-1..1') } },
    },
    curve: {
      type: 'array', description: 'Curva dei toni RGB: punti x,y in 0..1 ordinati per x, da x=0 a x=1. Identità: [[0,0],[1,1]]',
      items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: num('0..1'), y: num('0..1') } },
    },
    masks: {
      type: 'array', description: 'Regolazioni locali adattate a questa foto (0-3). Coordinate normalizzate: x verso destra, y verso il basso, 0..1',
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'label', 'x', 'y', 'angle', 'width', 'rx', 'ry', 'feather', 'invert', 'exp', 'contrast', 'hi', 'sh', 'temp', 'tint', 'sat', 'clarity', 'dehaze'],
        properties: {
          type: { type: 'string', enum: ['linear', 'radial'] },
          label: { type: 'string', description: 'Cosa copre, es. "Cielo", "Soggetto"' },
          x: num('Centro x'), y: num('Centro y'),
          angle: num('Gradi. Lineare: 90 = influenza la parte sopra la linea (cielo), -90 = sotto, 0 = a sinistra, 180 = a destra'),
          width: num('Lineare: ampiezza della transizione 0.05..1'), rx: num('Radiale: semiasse orizzontale in frazione dell\'altezza'),
          ry: num('Radiale: semiasse verticale in frazione dell\'altezza'), feather: num('Radiale: sfumatura 0..1'),
          invert: { type: 'boolean', description: 'Radiale: true = influenza l\'esterno' },
          exp: num('-2..2'), contrast: num('-1..1'), hi: num('-1..1'), sh: num('-1..1'), temp: num('-1..1'), tint: num('-1..1'),
          sat: num('-1..1'), clarity: num('-1..1'), dehaze: num('-1..1'),
        },
      },
    },
  };
  return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
})();

const LOOK_SYSTEM = `Sei un colorist e fotoritoccatore esperto che usa un editor in stile Lightroom.
Ricevi una foto e la descrizione di un look desiderato. Restituisci i valori delle regolazioni che producono quel look SU QUESTA FOTO:
adatta l'esposizione e il bilanciamento a ciò che vedi (correggi foto sottoesposte o con dominanti), proteggi gli incarnati, non bruciare le alte luci.
Scale: 0 = neutro su tutti gli slider; ±1 equivale a ±100 in Lightroom, quindi valori tipici stanno tra -0.5 e 0.5.
Per la gradazione colore la saturazione 0.15-0.35 è già evidente. Usa la curva per contrasto o neri sollevati (punto iniziale y>0).
Le maschere servono solo se migliorano davvero la foto (es. cielo con lineare angolo 90 posizionata sull'orizzonte, soggetto con radiale): massimo 3.
PRIORITÀ ASSOLUTA: il risultato deve sembrare una fotografia professionale e naturale, mai "filtrata" o finta.
Preferisci molte regolazioni piccole a poche forti; evita pelle arancione o grigia, cieli al neon, aloni, HDR esasperato.
Restituisci sempre tutte le 8 voci hsl. Rispondi solo con il JSON richiesto.`;

function jpegBase64(src, max = 768) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(src.width * k), height: Math.round(src.height * k) });
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1'];

async function lookFromClaude(prompt, image) {
  await loadScript('vendor/anthropic-sdk.js');
  const Anthropic = window.Anthropic;
  const client = new Anthropic({ apiKey: aiSettings.apiKey, dangerouslyAllowBrowser: true });
  const req = {
    model: aiSettings.model, max_tokens: 16000, system: LOOK_SYSTEM,
    output_config: { effort: aiSettings.effort, format: { type: 'json_schema', schema: LOOK_SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64(image) } },
      { type: 'text', text: 'Look desiderato: ' + prompt },
    ] }],
  };
  let res;
  try {
    // fallback lato server: se il modello rifiuta, un altro modello completa la richiesta
    res = FALLBACK_MODELS.includes(aiSettings.model)
      ? await client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(req);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Chiave API non valida');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('La chiave non ha accesso a questo modello');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Troppe richieste: riprova tra poco');
    if (e instanceof Anthropic.BadRequestError) throw new Error('Richiesta non valida: ' + e.message);
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Connessione assente o bloccata');
    if (e instanceof Anthropic.APIError) throw new Error(`Errore del servizio (${e.status ?? '?'}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Il modello ha rifiutato la richiesta');
  if (res.stop_reason === 'max_tokens') throw new Error('Risposta troppo lunga, riprova');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

/* Motore offline: parole chiave -> regolazioni. Gratuito e senza rete. */
const LOOK_RULES = [
  [/cald[oaie]|warm|dorat|oro\b|golden/, { temp: 0.25, ghH: 40, ghS: 0.15 }],
  [/fredd[oaie]|cold|cool|gelid|ghiacc/, { temp: -0.25, gsH: 210, gsS: 0.15 }],
  [/scur[oaie]|dark|moody|cupo|notturn/, { exp: -0.35, sh: -0.15, vig: 0.3 }],
  [/luminos|chiar[oaie]|bright|arios|airy|solare/, { exp: 0.3, sh: 0.25, hi: -0.15, contrast: -0.05 }],
  [/contrast|drammatic|dramatic|forte|incisiv|punch/, { contrast: 0.3, clarity: 0.2, curve: S_CURVE }],
  [/morbid|soft|delicat|tenue|sognant|dream/, { contrast: -0.15, clarity: -0.2, glow: 0.2, curve: LIFT }],
  [/desatur|spent|muted|smorz|slavat/, { sat: -0.35, vib: -0.1 }],
  [/vivac|satur|vivid|accesi|pop\b|colorat/, { vib: 0.35, sat: 0.1 }],
  [/gran[ao]|grain|pellicol|film|analogic|35 ?mm/, { grain: 0.35, fade: 0.1, curve: FILM }],
  [/vintage|retr[oò]|vecchi|antic|nostalg/, { fade: 0.3, sat: -0.2, temp: 0.15, grain: 0.3, vig: 0.3, curve: MATTE }],
  [/opac|matte|sbiadit|faded/, { fade: 0.35, curve: MATTE }],
  [/bianco ?e ?nero|b\s?&\s?n|b\/n|black ?and ?white|monocrom|\bbw\b/, { mono: 1, contrast: 0.2 }],
  [/seppia|sepia/, { mono: 0.9, gsH: 30, gsS: 0.5, ghH: 40, ghS: 0.4 }],
  [/teal|turchese|ottanio|arancio.*blu|blu.*arancio|orange/, { gsH: 190, gsS: 0.45, ghH: 32, ghS: 0.4 }],
  [/cinemat|cinema|film look|hollywood|blockbuster/, { contrast: 0.15, gsH: 195, gsS: 0.35, ghH: 35, ghS: 0.3, vig: 0.25, curve: S_CURVE }],
  [/anni ?70|seventies|\b70s/, { temp: 0.3, fade: 0.3, gsH: 30, gsS: 0.3, grain: 0.4, curve: MATTE }],
  [/anni ?80|eighties|\b80s|synth/, { gsH: 280, gsS: 0.4, ghH: 330, ghS: 0.3, glow: 0.3, vib: 0.3 }],
  [/anni ?90|nineties|\b90s|vhs|videocassett/, { ca: 0.5, grain: 0.5, fade: 0.25, sat: -0.15 }],
  [/cyberpunk|neon/, { gsH: 200, gsS: 0.6, ghH: 320, ghS: 0.55, glow: 0.4, contrast: 0.25, exp: -0.15 }],
  [/pastell|pastel|candy|zucchero/, { exp: 0.2, contrast: -0.2, vib: 0.3, fade: 0.2, curve: MATTE }],
  [/verd[ei]|green|bosco|forest/, { tint: -0.15, gsH: 150, gsS: 0.3, hsl: { 3: [-0.1, 0.2, -0.05] } }],
  [/ros[ae]|pink|magenta/, { tint: 0.15, gsH: 330, gsS: 0.25, ghH: 345, ghS: 0.2 }],
  [/viola|purple|lavanda/, { gsH: 270, gsS: 0.35, tint: 0.1 }],
  [/nebbi|foschi|fog|mist|haze/, { dehaze: -0.4, contrast: -0.15, glow: 0.2 }],
  [/nitid|dettagli|sharp|crisp|definit/, { sharp: 0.6, texture: 0.3, clarity: 0.25, dehaze: 0.1 }],
  [/hdr/, { hi: -0.5, sh: 0.5, clarity: 0.5, vib: 0.3 }],
  [/horror|inquietant|spavent/, { exp: -0.3, sat: -0.4, tint: -0.25, gsH: 140, gsS: 0.4, vig: 0.6, grain: 0.3 }],
  [/western|desert|polver/, { temp: 0.35, sat: -0.2, gsH: 30, gsS: 0.3, ghH: 40, ghS: 0.3, dehaze: -0.1 }],
  [/notte americana|day for night/, { exp: -0.5, temp: -0.55, gsH: 225, gsS: 0.6 }],
  [/tramont|sunset|alba|sunrise/, { temp: 0.4, vib: 0.35, gsH: 260, gsS: 0.3, ghH: 25, ghS: 0.55, glow: 0.2 }],
  [/autunn|autumn|fall\b/, { temp: 0.3, vib: 0.3, hsl: { 3: [-0.6, 0.1, 0], 1: [0, 0.25, 0] } }],
  [/invern|winter|nev/, { temp: -0.35, sat: -0.2, hsl: { 3: [0.3, -0.5, 0] } }],
  [/estat|summer|tropic/, { temp: 0.12, vib: 0.45, exp: 0.1, hsl: { 4: [0, 0.35, 0] } }],
  [/ritratt|portrait|pelle|volto/, { clarity: -0.15, hsl: { 0: [0, -0.1, 0.08], 1: [0, -0.08, 0.1] } }],
  [/polaroid|istantane/, { fade: 0.35, temp: 0.1, tint: 0.1, sat: -0.2, vig: 0.4, curve: MATTE }],
  [/bleach|candeggi/, { contrast: 0.4, sat: -0.55, clarity: 0.35 }],
  [/glow|bagliore|alone|halation|cinestill/, { glow: 0.35, halation: 0.45 }],
];

function lookFromRules(prompt) {
  const t = prompt.toLowerCase();
  const strength = /molto|tanto|forte|estrem|very|super/.test(t) ? 1.5 : /leggerm|poco|appena|slight|lieve|sottile/.test(t) ? 0.5 : 1;
  // un preset il cui nome compare nella descrizione fa da base
  const words = s => s.toLowerCase().split(/[^a-zà-ù0-9]+/).filter(w => w.length > 3);
  let base = null, bestScore = 0;
  for (const e of PRESET_DEFS) {
    const score = words(e.name).filter(w => t.includes(w)).length / words(e.name).length;
    if (score > bestScore && score >= 0.5) { bestScore = score; base = e; }
  }
  const acc = {}, used = [];
  if (base) { used.push(`preset «${base.name}»`); Object.assign(acc, clone(base.def)); }
  for (const [re, adj] of LOOK_RULES) {
    if (!re.test(t)) continue;
    used.push(t.match(re)[0].trim());
    for (const [k, v] of Object.entries(adj)) {
      if (k === 'hsl') { acc.hsl = acc.hsl || {}; for (const i in v) acc.hsl[i] = (acc.hsl[i] || [0, 0, 0]).map((x, j) => x + v[i][j] * strength); }
      else if (k === 'curve') acc.curve = acc.curve || v;
      else if (/H$/.test(k)) acc[k] = v;
      else acc[k] = (acc[k] || 0) + v * strength;
    }
  }
  // parte adattiva: corregge l'esposizione della foto
  if (imgInfo.small && acc.exp == null) { const s = lumaStats(); acc.exp = Math.max(-1, Math.min(1, (0.45 - s.mean) * 1.5)); }
  return { def: acc, used };
}

/* Converte la risposta (Claude o regole) in parametri dell'editor */
function lookToParams(look, current) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, Number(x) || 0));
  const p = defaults();
  copyGroups(current, p, LOCAL_GROUPS);
  p.lutAmt = current.lutAmt; p.profile = current.profile; p.profileAmt = current.profileAmt;
  for (const k of ['exp']) p[k] = clamp(look[k], -3, 3);
  look = limitRealism({ ...look });
  for (const k of ['contrast', 'hi', 'sh', 'wh', 'bl', 'temp', 'tint', 'vib', 'sat', 'texture', 'clarity', 'dehaze', 'vig', 'gsL', 'gmL', 'ghL', 'gBal',
    'calRH', 'calRS', 'calGH', 'calGS', 'calBH', 'calBS']) p[k] = clamp(look[k], -1, 1);
  for (const k of ['grain', 'fade', 'glow', 'halation', 'mono', 'gsS', 'gmS', 'ghS']) p[k] = clamp(look[k], 0, 1);
  for (const k of ['gsH', 'gmH', 'ghH']) p[k] = ((Number(look[k]) || 0) % 360 + 360) % 360;
  (look.hsl || []).slice(0, 8).forEach((b, i) => { p.hsl[i * 3] = clamp(b.hue, -1, 1); p.hsl[i * 3 + 1] = clamp(b.sat, -1, 1); p.hsl[i * 3 + 2] = clamp(b.lum, -1, 1); });
  const pts = (look.curve || []).map(q => [clamp(q.x, 0, 1), clamp(q.y, 0, 1)]).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) { pts[0][0] = 0; pts[pts.length - 1][0] = 1; p.curve = pts; }
  // maschere adattive: sostituiscono quelle create in precedenza dall'AI
  p.masks = p.masks.filter(m => !m.ai);
  for (const m of (look.masks || []).slice(0, 3)) {
    if (p.masks.length >= MAX_MASKS) break;
    const mk = newMask(m.type === 'radial' ? 'radial' : 'linear', p.masks.length + 1);
    mk.name = 'AI: ' + (m.label || 'zona'); mk.ai = 1;
    const c = mk.comps[0];
    Object.assign(c, { x: clamp(m.x, 0, 1), y: clamp(m.y, 0, 1), angle: Number(m.angle) || 0 });
    if (c.type === 'linear') c.width = clamp(m.width, 0.02, 1);
    else { c.rx = clamp(m.rx, 0.02, 1.5); c.ry = clamp(m.ry, 0.02, 1.5); c.feather = clamp(m.feather, 0, 1); c.invert = m.invert ? 1 : 0; }
    for (const k of ['contrast', 'hi', 'sh', 'temp', 'tint', 'sat', 'clarity', 'dehaze']) mk.adj[k] = clamp(m[k], -1, 1);
    mk.adj.exp = clamp(m.exp, -2, 2);
    p.masks.push(mk);
  }
  return p;
}
