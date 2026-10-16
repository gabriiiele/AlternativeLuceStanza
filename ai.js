'use strict';

/* Funzioni AI:
   - Super Resolution: modelli ESRGAN (TensorFlow.js) inclusi nell'app, funzionano offline
   - Mappa di profondità: Depth Anything V2 Small (transformers.js), scaricato al primo uso (~27 MB) e poi in cache
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
const srCache = {};

/* src: canvas con l'immagine originale. Restituisce un canvas ingrandito. */
async function superResolution(src, { mode = 'quality', maxSide = 4096, onProgress = () => {} } = {}) {
  await loadScript('vendor/tf.min.js');
  const tf = window.tf;
  try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
  await tf.ready();
  const model = srCache[mode] ||= await tf.loadLayersModel(SR_MODELS[mode]);
  const scale = mode === 'x4' ? 4 : 2;

  // riduce l'ingresso se il risultato supererebbe il limite
  let w = src.width, h = src.height;
  const k = Math.min(1, maxSide / (Math.max(w, h) * scale));
  let input = src;
  if (k < 1) {
    w = Math.round(w * k); h = Math.round(h * k);
    input = Object.assign(document.createElement('canvas'), { width: w, height: h });
    input.getContext('2d').drawImage(src, 0, 0, w, h);
  }
  const ictx = input.getContext('2d', { willReadFrequently: true });
  const out = Object.assign(document.createElement('canvas'), { width: w * scale, height: h * scale });
  const octx = out.getContext('2d');
  const T = 96, P = 8, tiles = Math.ceil(w / T) * Math.ceil(h / T);
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
    await nextFrame();
  }
  return out;
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
    const device = !test && navigator.gpu ? 'webgpu' : 'wasm';
    const files = {};
    depthPipe = await T.pipeline('depth-estimation', test ? test.model : DEPTH_MODEL, {
      device, dtype: device === 'webgpu' ? 'fp16' : 'q8',
      progress_callback: p => {
        if (p.status === 'progress' && p.total) { files[p.file] = p.loaded / p.total; const v = Object.values(files); onProgress(0.9 * v.reduce((a, b) => a + b, 0) / v.length, 'download'); }
      },
    });
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
  onProgress(1, 'fatto');
  return fc;
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
