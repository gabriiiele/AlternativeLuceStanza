'use strict';

/* ---------- Parametri ---------- */

const HSL_BANDS = [
  ['Rossi', '#e53935'], ['Arancio', '#fb8c00'], ['Gialli', '#fdd835'], ['Verdi', '#43a047'],
  ['Azzurri', '#00acc1'], ['Blu', '#1e88e5'], ['Viola', '#8e24aa'], ['Magenta', '#d81b60'],
];

// [chiave, etichetta, min, max, passo]
const TABS = {
  Luce: [
    ['exp', 'Esposizione', -3, 3, 0.01], ['contrast', 'Contrasto', -1, 1, 0.01],
    ['hi', 'Alteluci', -1, 1, 0.01], ['sh', 'Ombre', -1, 1, 0.01],
    ['wh', 'Bianchi', -1, 1, 0.01], ['bl', 'Neri', -1, 1, 0.01],
  ],
  Colore: [
    ['temp', 'Temperatura', -1, 1, 0.01], ['tint', 'Tinta', -1, 1, 0.01],
    ['vib', 'Vividezza', -1, 1, 0.01], ['sat', 'Saturazione', -1, 1, 0.01],
  ],
  Effetti: [
    ['sharp', 'Nitidezza', 0, 2, 0.01], ['vig', 'Vignettatura', -1, 1, 0.01],
    ['grain', 'Grana', 0, 1, 0.01],
  ],
};

const defaults = () => ({
  exp: 0, contrast: 0, hi: 0, sh: 0, wh: 0, bl: 0,
  temp: 0, tint: 0, vib: 0, sat: 0,
  sharp: 0, vig: 0, grain: 0,
  hsl: new Array(HSL_BANDS.length * 3).fill(0),   // per banda: tonalità, saturazione, luminanza
  curve: [[0, 0], [1, 1]],
});

const clone = o => JSON.parse(JSON.stringify(o));

const PRESETS = {
  'Cinema': { contrast: 0.2, sh: 0.2, temp: 0.1, sat: -0.1, vig: 0.3, grain: 0.2,
    hsl: [0,0.1,0, 0.05,0.15,0.05, 0,0,0, -0.1,-0.4,-0.1, 0.1,0.2,-0.2, 0.05,0.1,-0.2, 0,0,0, 0,0,0],
    curve: [[0,0.05],[0.25,0.22],[0.75,0.8],[1,0.96]] },
  'Bianco e nero': { sat: -1, contrast: 0.25, wh: 0.15, bl: -0.1, grain: 0.25, vig: 0.2 },
  'Pellicola': { contrast: -0.1, bl: 0.2, wh: -0.1, temp: 0.15, tint: 0.05, sat: -0.15, grain: 0.4,
    curve: [[0,0.08],[0.5,0.52],[1,0.94]] },
  'Vivace': { vib: 0.5, sat: 0.15, contrast: 0.15, sharp: 0.4 },
  'Morbido': { contrast: -0.25, hi: -0.3, sh: 0.3, sat: -0.1 },
};

let params = defaults();
const history = { undo: [], redo: [] };

/* ---------- Motore WebGL ---------- */

const VERT = `
attribute vec2 p; varying vec2 v;
void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 v;
uniform sampler2D uImg, uCurve;
uniform vec2 uTexel;
uniform float uExp, uContrast, uHi, uSh, uWh, uBl, uTemp, uTint, uVib, uSat, uSharp, uVig, uGrain;
uniform vec3 uHSL[8];

vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rgb2hsl(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5, d = mx - mn, h = 0.0, s = 0.0;
  if (d > 1e-5) {
    s = d / (1.0 - abs(2.0 * l - 1.0) + 1e-5);
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, clamp(s, 0.0, 1.0), l);
}
vec3 hsl2rgb(vec3 c){
  float h = mod(c.x, 360.0) / 60.0;
  float ch = (1.0 - abs(2.0 * c.z - 1.0)) * c.y;
  float x = ch * (1.0 - abs(mod(h, 2.0) - 1.0));
  vec3 r = h < 1.0 ? vec3(ch, x, 0.0) : h < 2.0 ? vec3(x, ch, 0.0) : h < 3.0 ? vec3(0.0, ch, x)
         : h < 4.0 ? vec3(0.0, x, ch) : h < 5.0 ? vec3(x, 0.0, ch) : vec3(ch, 0.0, x);
  return r + (c.z - ch * 0.5);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec3 c = texture2D(uImg, v).rgb;

  // nitidezza (unsharp mask)
  if (uSharp > 0.0) {
    vec3 b = (texture2D(uImg, v + vec2(uTexel.x, 0.0)).rgb + texture2D(uImg, v - vec2(uTexel.x, 0.0)).rgb +
              texture2D(uImg, v + vec2(0.0, uTexel.y)).rgb + texture2D(uImg, v - vec2(0.0, uTexel.y)).rgb) * 0.25;
    c += (c - b) * uSharp * 1.5;
  }

  // esposizione e bilanciamento del bianco in lineare
  c = toLin(clamp(c, 0.0, 1.0));
  c *= exp2(uExp);
  c *= vec3(1.0 + uTemp * 0.3 + uTint * 0.05, 1.0 - uTint * 0.2, 1.0 - uTemp * 0.3 + uTint * 0.05);
  c = toSrgb(c);

  // neri / bianchi
  float bp = -uBl * 0.15, wp = 1.0 - uWh * 0.15;
  c = (c - bp) / (wp - bp);

  // ombre / alteluci
  float l = luma(c);
  float shW = 1.0 - smoothstep(0.0, 0.55, l);
  float hiW = smoothstep(0.45, 1.0, l);
  c += uSh * 0.35 * shW * (1.0 - l) + uHi * 0.35 * hiW * l;

  // contrasto
  float k = uContrast >= 0.0 ? 1.0 + uContrast * 1.2 : 1.0 + uContrast * 0.8;
  c = (c - 0.5) * k + 0.5;
  c = clamp(c, 0.0, 1.0);

  // HSL per colore
  vec3 hsl = rgb2hsl(c);
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 8; i++) {
    float center = i == 0 ? 0.0 : i == 1 ? 30.0 : i == 2 ? 60.0 : i == 3 ? 120.0
                 : i == 4 ? 180.0 : i == 5 ? 230.0 : i == 6 ? 275.0 : 320.0;
    float d = abs(hsl.x - center); d = min(d, 360.0 - d);
    float w = smoothstep(50.0, 0.0, d) * smoothstep(0.02, 0.2, hsl.y);
    dh += uHSL[i].x * w; ds += uHSL[i].y * w; dl += uHSL[i].z * w;
  }
  hsl.x += dh * 30.0;
  hsl.y = clamp(hsl.y * (1.0 + ds), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dl * 0.25 * hsl.y * (1.0 - abs(2.0 * hsl.z - 1.0)), 0.0, 1.0);
  c = hsl2rgb(hsl);

  // vividezza e saturazione
  float g = luma(c);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float cs = mx - mn;
  c = mix(vec3(g), c, 1.0 + uVib * (1.0 - cs) + uSat);

  // curva dei toni
  c = clamp(c, 0.0, 1.0);
  c = vec3(texture2D(uCurve, vec2(c.r * 0.99609375 + 0.001953125, 0.5)).r,
           texture2D(uCurve, vec2(c.g * 0.99609375 + 0.001953125, 0.5)).r,
           texture2D(uCurve, vec2(c.b * 0.99609375 + 0.001953125, 0.5)).r);

  // vignettatura
  vec2 q = v - 0.5;
  float vg = smoothstep(0.25, 0.85, length(q) * 1.4);
  c *= uVig < 0.0 ? 1.0 - uVig * vg * 0.8 : 1.0 - uVig * vg * 0.9;

  // grana
  c += (hash(v / uTexel) - 0.5) * uGrain * 0.25 * (0.3 + 0.7 * (1.0 - abs(luma(c) * 2.0 - 1.0)));

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL non disponibile');
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    this.prog = this.link(VERT, FRAG);
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uImg', 'uCurve', 'uTexel', 'uExp', 'uContrast', 'uHi', 'uSh', 'uWh', 'uBl', 'uTemp',
      'uTint', 'uVib', 'uSat', 'uSharp', 'uVig', 'uGrain', 'uHSL']) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.imgTex = this.makeTex(0);
    this.curveTex = this.makeTex(1);
    gl.uniform1i(this.u.uImg, 0);
    gl.uniform1i(this.u.uCurve, 1);
    this.size = [1, 1];
  }

  link(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  makeTex(unit) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    return t;
  }

  setImage(source, w, h) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.size = [w, h];
  }

  setCurve(points) {
    const lut = curveLUT(points), data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) data.set([lut[i], lut[i], lut[i], 255], i * 4);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  render(p, width, height) {
    const gl = this.gl, u = this.u;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    this.setCurve(p.curve);
    gl.uniform2f(u.uTexel, 1 / this.size[0], 1 / this.size[1]);
    gl.uniform1f(u.uExp, p.exp);       gl.uniform1f(u.uContrast, p.contrast);
    gl.uniform1f(u.uHi, p.hi);         gl.uniform1f(u.uSh, p.sh);
    gl.uniform1f(u.uWh, p.wh);         gl.uniform1f(u.uBl, p.bl);
    gl.uniform1f(u.uTemp, p.temp);     gl.uniform1f(u.uTint, p.tint);
    gl.uniform1f(u.uVib, p.vib);       gl.uniform1f(u.uSat, p.sat);
    gl.uniform1f(u.uSharp, p.sharp);   gl.uniform1f(u.uVig, p.vig);
    gl.uniform1f(u.uGrain, p.grain);
    gl.uniform3fv(u.uHSL, new Float32Array(p.hsl));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/* Curva monotona (Fritsch–Carlson) -> tabella da 256 valori */
function curveLUT(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0]);
  const n = P.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / Math.max(P[i + 1][0] - P[i][0], 1e-6));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const out = new Uint8Array(256);
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    let y;
    if (x <= P[0][0]) y = P[0][1];
    else if (x >= P[n - 1][0]) y = P[n - 1][1];
    else {
      let i = 0; while (x > P[i + 1][0]) i++;
      const h = P[i + 1][0] - P[i][0], t = (x - P[i][0]) / h;
      const t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * P[i][1] + (t3 - 2 * t2 + t) * h * m[i] +
          (-2 * t3 + 3 * t2) * P[i + 1][1] + (t3 - t2) * h * m[i + 1];
    }
    out[k] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return out;
}

/* ---------- Interfaccia ---------- */

const $ = id => document.getElementById(id);
let engine, loaded = false, bandIdx = 0, curTab = 'Luce', comparing = false, imgBitmap = null, fileName = 'foto';

function viewSize() {
  const st = $('stage').getBoundingClientRect(), [w, h] = engine.size, dpr = window.devicePixelRatio || 1;
  const s = Math.min(st.width / w, st.height / h);
  return [Math.max(1, Math.round(w * Math.min(s * dpr, 1))), Math.max(1, Math.round(h * Math.min(s * dpr, 1))), s];
}

let raf = 0;
function redraw() {
  if (!loaded || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const [w, h, s] = viewSize();
    engine.render(comparing ? defaults() : params, w, h);
    const cv = $('view');
    cv.style.width = Math.round(engine.size[0] * s) + 'px';
    cv.style.height = Math.round(engine.size[1] * s) + 'px';
  });
}

function commit() {                    // salva lo stato per annulla/ripeti
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

function slider(label, min, max, step, get, set) {
  const row = document.createElement('div'); row.className = 'row';
  const lab = document.createElement('label'); lab.textContent = label;
  const inp = document.createElement('input');
  Object.assign(inp, { type: 'range', min, max, step, value: get() });
  const out = document.createElement('output'); out.textContent = (+get()).toFixed(2);
  let before;
  inp.addEventListener('pointerdown', () => { before = clone(params); });
  inp.addEventListener('input', () => { set(+inp.value); out.textContent = (+inp.value).toFixed(2); redraw(); });
  inp.addEventListener('change', () => {
    if (before) { history.undo.push(before); history.redo.length = 0; before = null; syncButtons(); }
  });
  inp.addEventListener('dblclick', () => {   // doppio tocco = azzera
    history.undo.push(clone(params)); history.redo.length = 0;
    set(0); inp.value = 0; out.textContent = '0.00'; redraw(); syncButtons();
  });
  row.append(lab, inp, out);
  return row;
}

function renderTabs() {
  const nav = $('tabs'); nav.innerHTML = '';
  for (const name of [...Object.keys(TABS), 'HSL', 'Curva', 'Preset']) {
    const b = document.createElement('button');
    b.textContent = name; b.className = name === curTab ? 'on' : '';
    b.onclick = () => { curTab = name; renderTabs(); renderPanel(); };
    nav.append(b);
  }
}

function renderPanel() {
  const panel = $('panel'); panel.innerHTML = '';
  if (TABS[curTab]) {
    for (const [k, label, min, max, step] of TABS[curTab])
      panel.append(slider(label, min, max, step, () => params[k], v => { params[k] = v; }));
  } else if (curTab === 'HSL') {
    const chips = document.createElement('div'); chips.className = 'chips';
    HSL_BANDS.forEach(([name, col], i) => {
      const c = document.createElement('button');
      c.className = 'chip' + (i === bandIdx ? ' on' : ''); c.title = name; c.style.background = col;
      c.onclick = () => { bandIdx = i; renderPanel(); };
      chips.append(c);
    });
    panel.append(chips);
    ['Tonalità', 'Saturazione', 'Luminanza'].forEach((label, j) =>
      panel.append(slider(label, -1, 1, 0.01, () => params.hsl[bandIdx * 3 + j], v => { params.hsl[bandIdx * 3 + j] = v; })));
  } else if (curTab === 'Curva') {
    renderCurve(panel);
  } else {
    renderPresets(panel);
  }
}

function renderCurve(panel) {
  const cv = document.createElement('canvas'); cv.id = 'curve'; cv.width = cv.height = 260;
  const ctx = cv.getContext('2d');
  let drag = -1, before = null;
  const draw = () => {
    ctx.clearRect(0, 0, 260, 260);
    ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 65, 0); ctx.lineTo(i * 65, 260);
      ctx.moveTo(0, i * 65); ctx.lineTo(260, i * 65); ctx.stroke();
    }
    const lut = curveLUT(params.curve);
    ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 256; i++) ctx[i ? 'lineTo' : 'moveTo'](i / 255 * 260, 260 - lut[i] / 255 * 260);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [x, y] of params.curve) { ctx.beginPath(); ctx.arc(x * 260, 260 - y * 260, 6, 0, 7); ctx.fill(); }
  };
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    before = clone(params);
    const [x, y] = pos(e);
    drag = params.curve.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.07);
    if (drag < 0) { params.curve.push([x, y]); params.curve.sort((a, b) => a[0] - b[0]); drag = params.curve.findIndex(p => p[0] === x); }
    draw(); redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (drag < 0) return;
    const [x, y] = pos(e), last = params.curve.length - 1;
    if (drag > 0 && drag < last)
      params.curve[drag][0] = Math.min(params.curve[drag + 1][0] - 0.02, Math.max(params.curve[drag - 1][0] + 0.02, x));
    params.curve[drag][1] = y;
    draw(); redraw();
  });
  cv.addEventListener('pointerup', () => {
    if (drag >= 0 && before) { history.undo.push(before); history.redo.length = 0; syncButtons(); }
    drag = -1; before = null;
  });
  cv.addEventListener('dblclick', e => {    // doppio tocco su un punto = rimuovi
    const [x, y] = pos(e);
    const i = params.curve.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 0.07);
    if (i > 0 && i < params.curve.length - 1) {
      history.undo.push(clone(params)); history.redo.length = 0;
      params.curve.splice(i, 1); draw(); redraw(); syncButtons();
    }
  });
  const reset = document.createElement('button'); reset.textContent = 'Azzera curva';
  reset.onclick = () => { commit(); params.curve = [[0, 0], [1, 1]]; draw(); redraw(); };
  panel.append(cv, Object.assign(document.createElement('div'), { className: 'actions' }));
  panel.lastChild.append(reset);
  draw();
}

const userPresets = () => { try { return JSON.parse(localStorage.getItem('presets') || '{}'); } catch { return {}; } };

function renderPresets(panel) {
  const all = { ...PRESETS, ...userPresets() };
  const grid = document.createElement('div'); grid.className = 'presets';
  for (const [name, p] of Object.entries(all)) {
    const b = document.createElement('button'); b.textContent = name;
    b.onclick = () => { commit(); params = { ...defaults(), ...clone(p) }; redraw(); };
    grid.append(b);
  }
  const actions = document.createElement('div'); actions.className = 'actions';
  const save = document.createElement('button'); save.textContent = 'Salva impostazioni come preset';
  save.onclick = () => {
    const name = prompt('Nome del preset?'); if (!name) return;
    const u = userPresets(); u[name] = clone(params);
    try { localStorage.setItem('presets', JSON.stringify(u)); } catch {}
    renderPanel();
  };
  const reset = document.createElement('button'); reset.textContent = 'Azzera tutto';
  reset.onclick = () => { commit(); params = defaults(); renderPanel(); redraw(); };
  actions.append(save, reset);
  panel.append(grid, actions);
}

/* ---------- Caricamento ed esportazione ---------- */

async function openFile(file) {
  try {
    imgBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch { alert('Formato non supportato dal browser (i RAW arriveranno in una versione successiva).'); return; }
  fileName = file.name.replace(/\.[^.]+$/, '');
  let { width: w, height: h } = imgBitmap, src = imgBitmap;
  const m = engine.maxSize, k = Math.min(1, m / Math.max(w, h));
  if (k < 1) {
    w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(imgBitmap, 0, 0, w, h); src = c;
  }
  engine.setImage(src, w, h);
  loaded = true; params = defaults(); history.undo.length = history.redo.length = 0;
  $('empty').hidden = true;
  renderPanel(); syncButtons(); redraw();
}

function exportImage() {
  const [w, h] = engine.size;
  engine.render(params, w, h);
  $('view').toBlob(async blob => {
    const f = new File([blob], `${fileName}-luce.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f] }); redraw(); return; } catch { /* annullato: scarico */ }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    redraw();
  }, 'image/jpeg', 0.95);
}

/* ---------- Avvio ---------- */

window.addEventListener('DOMContentLoaded', () => {
  try { engine = new Engine($('view')); } catch (e) { $('empty').textContent = e.message; return; }
  renderTabs(); renderPanel(); syncButtons();
  $('btnOpen').onclick = () => $('file').click();
  $('file').onchange = e => e.target.files[0] && openFile(e.target.files[0]);
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
