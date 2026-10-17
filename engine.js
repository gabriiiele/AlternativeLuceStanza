'use strict';

/* Motore di elaborazione: tre passate GPU
   1. ritocco (correggi / clona / occhi rossi) -> texture sorgente ritoccata
   2. maschere -> due texture RGBA (8 maschere, una per canale)
   3. pipeline principale -> canvas */

const MAX_MASKS = 8, MAX_COMPS = 6;
const HSL_CENTERS = [0, 30, 60, 120, 180, 230, 275, 320];

/* ---------- Curve ---------- */

/* Curva monotona (Fritsch–Carlson) -> tabella da N valori in 0..1 */
function curveLUT(pts, N = 256) {
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
  const out = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const x = k / (N - 1);
    let y;
    if (x <= P[0][0]) y = P[0][1];
    else if (x >= P[n - 1][0]) y = P[n - 1][1];
    else {
      let i = 0; while (x > P[i + 1][0]) i++;
      const h = P[i + 1][0] - P[i][0], t = (x - P[i][0]) / h, t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * P[i][1] + (t3 - 2 * t2 + t) * h * m[i] +
          (-2 * t3 + 3 * t2) * P[i + 1][1] + (t3 - t2) * h * m[i + 1];
    }
    out[k] = Math.min(1, Math.max(0, y));
  }
  return out;
}

/* Curva parametrica: ombre, scuri, chiari, alteluci con tre punti di divisione */
function parametricLUT(p, N = 256) {
  const out = new Float32Array(N);
  const s = [0, p.pcS1, p.pcS2, p.pcS3, 1], amt = [p.pcSh, p.pcDk, p.pcLt, p.pcHi];
  for (let k = 0; k < N; k++) {
    const x = k / (N - 1);
    let d = 0;
    for (let r = 0; r < 4; r++) {
      if (!amt[r]) continue;
      const a = s[r], b = s[r + 1], w = b - a, a2 = a - w * 0.5, b2 = b + w * 0.5;
      const t = Math.min(1, Math.max(0, (x - a2) / (b2 - a2)));
      d += amt[r] * Math.sin(Math.PI * t) * 0.18;
    }
    out[k] = Math.min(1, Math.max(0, x + d * Math.min(1, 8 * x) * Math.min(1, 8 * (1 - x))));
  }
  return out;
}

/* ---------- Calibrazione: matrice dei primari ---------- */

function calMatrix(p) {
  const lw = [0.2126, 0.7152, 0.0722], hue = [p.calRH, p.calGH, p.calBH], sat = [p.calRS, p.calGS, p.calBS], M = [];
  for (let i = 0; i < 3; i++) {
    const col = [0, 0, 0]; col[i] = 1;
    const h = hue[i];
    if (h > 0) col[(i + 1) % 3] += h * 0.35; else col[(i + 2) % 3] += -h * 0.35;
    let Y = col[0] * lw[0] + col[1] * lw[1] + col[2] * lw[2];
    for (let k = 0; k < 3; k++) col[k] = Y + (col[k] - Y) * (1 + sat[i] * 0.6);
    Y = col[0] * lw[0] + col[1] * lw[1] + col[2] * lw[2];
    const s = Y > 1e-4 ? lw[i] / Y : 1;
    M.push(...col.map(c => c * s));
  }
  return new Float32Array(M);
}

/* ---------- Geometria ---------- */

const ASPECTS = { orig: 0, free: -1, '1:1': 1, '4:5': 4 / 5, '5:4': 5 / 4, '3:2': 3 / 2, '2:3': 2 / 3,
  '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16, '2.39:1': 2.39, custom: -2 };

/* Calcola tutti i parametri geometrici; full = ignora il ritaglio (per la modalità ritaglio) */
function geoInfo(geo, sw, sh, full = false) {
  const Sa = sw / sh, odd = geo.rot % 2 !== 0, ar0 = odd ? 1 / Sa : Sa;
  const th = (geo.angle + geo.trot) * Math.PI / 180 + geo.rot * Math.PI / 2;
  const thFit = geo.constrain ? th : geo.rot * Math.PI / 2;
  const co = Math.abs(Math.cos(thFit)), si = Math.abs(Math.sin(thFit));
  const s = Math.min(Sa / (ar0 * co + si), 1 / (ar0 * si + co));
  const cr = full ? [0, 0, 1, 1] : geo.crop, cw = cr[2] - cr[0], ch = cr[3] - cr[1];
  return {
    Sa, th, baseAr: ar0,
    frame: [ar0 * s, s],
    crop: [cr[0], 1 - cr[3], cw, ch],
    flip: [geo.fx ? -1 : 1, geo.fy ? -1 : 1],
    scale: geo.scale, off: [geo.ox * 0.3, -geo.oy * 0.3], aspAdj: geo.aspAdj,
    persp: [geo.horiz * 0.6, geo.vert * 0.6], dist: geo.distort,
    outW: ar0 * s * cw * sh, outH: s * ch * sh, ar: (ar0 * s * cw) / (s * ch),
  };
}

/* Stessa trasformazione dello shader: coordinate risultato (y su) -> coordinate sorgente (y su) */
function srcUV(G, o) {
  const b = [G.crop[0] + o[0] * G.crop[2], G.crop[1] + o[1] * G.crop[3]];
  let x = (b[0] - 0.5) * G.frame[0] * G.flip[0], y = (b[1] - 0.5) * G.frame[1] * G.flip[1];
  const c = Math.cos(G.th), s = Math.sin(G.th);
  [x, y] = [c * x - s * y, s * x + c * y];
  x = x / G.scale - G.off[0]; y = y / G.scale - G.off[1];
  x *= 1 + Math.max(-G.aspAdj, 0) * 0.5; y *= 1 + Math.max(G.aspAdj, 0) * 0.5;
  const w = 1 + G.persp[0] * x + G.persp[1] * y; x /= w; y /= w;
  const r2 = (x * x + y * y) / (0.25 * (G.Sa * G.Sa + 1)), k = 1 + G.dist * r2 * 0.3;
  return [x * k / G.Sa + 0.5, y * k + 0.5];
}

/* Inversa numerica (Newton): coordinate sorgente -> coordinate risultato */
function outUV(G, target) {
  let o = [0.5, 0.5];
  for (let it = 0; it < 12; it++) {
    const f = srcUV(G, o), e = 1e-4;
    const fx = srcUV(G, [o[0] + e, o[1]]), fy = srcUV(G, [o[0], o[1] + e]);
    const a = (fx[0] - f[0]) / e, b = (fy[0] - f[0]) / e, c = (fx[1] - f[1]) / e, d = (fy[1] - f[1]) / e;
    const det = a * d - b * c; if (Math.abs(det) < 1e-12) break;
    const rx = target[0] - f[0], ry = target[1] - f[1];
    o = [o[0] + (d * rx - b * ry) / det, o[1] + (-c * rx + a * ry) / det];
    if (Math.abs(rx) + Math.abs(ry) < 1e-7) break;
  }
  return o;
}

/* ---------- Motore ---------- */

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // WebGL2 permette le mipmap anche su immagini di qualsiasi dimensione: anteprima ridotta senza scalettature
    const o = { preserveDrawingBuffer: true, antialias: false };
    const gl = this.gl = canvas.getContext('webgl2', o) || canvas.getContext('webgl', o);
    if (!gl) throw new Error('WebGL non disponibile');
    this.gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 16384);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.main = this.program(SH_MAIN, SH_VERT_MAIN);
    this.retouch = this.program(SH_RETOUCH);
    this.maskP = this.program(SH_MASK);
    this.blurP = this.program(SH_BLUR);
    this.units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.imgTex = this.makeTex();
    this.curveTex = this.makeTex();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.lutTex = this.makeTex(); this.blank(this.lutTex);
    this.maskTex = [this.makeTex(), this.makeTex()]; this.maskTex.forEach(t => this.blank(t));
    this.brushTex = this.makeTex(); this.blank(this.brushTex);
    this.depthTex = this.makeTex(); this.blank(this.depthTex); this.hasDepth = false;
    this.size = [1, 1]; this.lutSize = 0;
    this.srcTex = this.imgTex;
    this.rtKey = ''; this.mkKey = ''; this.maskRes = [1, 1];
  }

  program(fs, vs = SH_VERT) {
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
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  use(prog) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return prog.u;
  }

  makeTex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, val] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
    return t;
  }
  blank(t) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
  bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (loc) gl.uniform1i(loc, unit);
  }

  /* Texture vuota di dimensioni date con framebuffer associato */
  target(w, h) {
    const gl = this.gl, tex = this.makeTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  /* Mipmap per la riduzione di qualità nell'anteprima (solo WebGL2) */
  mipmap(tex) {
    if (!this.gl2) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
  freeTarget(t) { if (!t) return; this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fb); }

  setImage(source, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.mipmap(this.imgTex);
    this.size = [w, h];
    [this.rtA, this.rtB, this.mkA, this.mkB].forEach(t => this.freeTarget(t));
    this.rtA = this.rtB = null;
    const k = Math.min(1, 1024 / Math.max(w, h));
    this.maskRes = [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
    this.mkA = this.target(...this.maskRes); this.mkB = this.target(...this.maskRes);
    this.maskTex = [this.mkA.tex, this.mkB.tex];
    this.srcTex = this.imgTex; this.rtKey = ''; this.mkKey = 'x'; this.blurDirty = true;
    this.clearDepth();
  }

  /* Mappa di profondità (canvas in scala di grigi, chiaro = vicino) */
  setDepth(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.hasDepth = true; this.mkKey = 'x';
  }
  clearDepth() { this.blank(this.depthTex); this.hasDepth = false; this.mkKey = 'x'; }

  /* data: Uint8Array RGBA con indice (g * N*N + b * N + r) * 4 */
  setLut(data, n) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.lutSize = n;
  }
  clearLut() { this.lutSize = 0; }

  /* Passata 1: ritocchi. Ricalcola solo se i punti sono cambiati. */
  updateRetouch(spots) {
    const key = JSON.stringify(spots);
    if (key === this.rtKey) return;
    this.rtKey = key;
    this.blurDirty = true;
    if (!spots.length) { this.srcTex = this.imgTex; this.mkKey = 'x'; return; }
    const gl = this.gl, [w, h] = this.size;
    if (!this.rtA) { this.rtA = this.target(w, h); this.rtB = this.target(w, h); }
    const u = this.use(this.retouch);
    gl.viewport(0, 0, w, h);
    gl.uniform1f(u.uSa, w / h);
    let input = this.imgTex, out = this.rtA;
    for (let i = 0; i < spots.length; i += 16) {
      const chunk = spots.slice(i, i + 16), A = new Float32Array(64), B = new Float32Array(64);
      chunk.forEach((s, j) => {
        A.set([s.x, 1 - s.y, s.sx, 1 - s.sy], j * 4);
        B.set([s.r, s.feather, s.opacity, { heal: 0, clone: 1, redeye: 2 }[s.mode]], j * 4);
      });
      gl.uniform1i(u.uN, chunk.length);
      gl.uniform4fv(u.uSpA, A); gl.uniform4fv(u.uSpB, B);
      this.bind(0, input, u.uImg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      input = out.tex; out = out === this.rtA ? this.rtB : this.rtA;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.mipmap(input);
    this.srcTex = input; this.mkKey = 'x';
  }

  /* Passata 2: maschere. brushes[i] = canvas del pennello della maschera i (o null) */
  updateMasks(masks, brushes, brushVer) {
    const key = JSON.stringify(masks.map(m => [m.on, m.invert, m.comps])) + brushVer;
    if (key === this.mkKey) return;
    this.mkKey = key;
    const gl = this.gl, u = this.use(this.maskP), [w, h] = this.maskRes;
    gl.viewport(0, 0, w, h);
    for (const t of [this.mkA, this.mkB]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.uniform1f(u.uSa, this.size[0] / this.size[1]);
    this.bind(0, this.srcTex, u.uImg);
    masks.slice(0, MAX_MASKS).forEach((m, i) => {
      if (!m.on || !m.comps.length) return;
      const comps = m.comps.slice(0, MAX_COMPS), A = new Float32Array(24), B = new Float32Array(24), C = new Float32Array(24);
      const T = { linear: 1, radial: 2, brush: 3, color: 4, lum: 5, depth: 6 }, OP = { add: 0, sub: 1, int: 2 };
      comps.forEach((c, j) => {
        A.set([T[c.type], OP[c.op], c.invert ? 1 : 0, 0], j * 4);
        if (c.type === 'linear') B.set([c.x, c.y, c.angle * Math.PI / 180, c.width], j * 4);
        else if (c.type === 'radial') { B.set([c.x, c.y, c.angle * Math.PI / 180, c.feather], j * 4); C.set([c.rx, c.ry, 0, 0], j * 4); }
        else if (c.type === 'color') B.set([...c.rgb, c.range], j * 4);
        else if (c.type === 'lum' || c.type === 'depth') B.set([c.lo, c.hi, c.smooth, 0], j * 4);
      });
      if (brushes[i]) {
        gl.bindTexture(gl.TEXTURE_2D, this.brushTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, brushes[i]);
      } else this.blank(this.brushTex);
      this.bind(1, this.brushTex, u.uBrush); this.bind(2, this.depthTex, u.uDepth);
      this.bind(0, this.srcTex, u.uImg);
      gl.uniform1i(u.uNC, comps.length); gl.uniform1f(u.uInv, m.invert ? 1 : 0);
      gl.uniform4fv(u.uCA, A); gl.uniform4fv(u.uCB, B); gl.uniform4fv(u.uCC, C);
      gl.bindFramebuffer(gl.FRAMEBUFFER, (i < 4 ? this.mkA : this.mkB).fb);
      const ch = i % 4;
      gl.colorMask(ch === 0, ch === 1, ch === 2, ch === 3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Curve combinate a 16 bit (1024 voci): riga 0 byte alti, riga 1 byte bassi */
  setCurves(p) {
    const N = 1024, key = JSON.stringify([p.curve, p.cr, p.cg, p.cb, p.pcSh, p.pcDk, p.pcLt, p.pcHi, p.pcS1, p.pcS2, p.pcS3]);
    if (key === this.curveKey) return;
    this.curveKey = key;
    const P = parametricLUT(p, N), M = curveLUT(p.curve, N), R = curveLUT(p.cr, N), G = curveLUT(p.cg, N), B = curveLUT(p.cb, N);
    const at = (lut, y) => {   // interpolazione lineare nella tabella
      const f = Math.min(1, Math.max(0, y)) * (N - 1), i = Math.floor(f), t = f - i;
      return lut[i] + ((lut[Math.min(i + 1, N - 1)] ?? lut[i]) - lut[i]) * t;
    };
    const data = new Uint8Array(N * 2 * 4);
    for (let i = 0; i < N; i++) {
      const m = at(M, P[i]);
      [at(R, m), at(G, m), at(B, m)].forEach((x, k) => {
        const v = Math.round(Math.min(1, Math.max(0, x)) * 65535);
        data[i * 4 + k] = v >> 8; data[(N + i) * 4 + k] = v & 255;
      });
      data[i * 4 + 3] = data[(N + i) * 4 + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /* Livelli sfocati della sorgente (texture, chiarezza, foschia, bagliore): ricalcolati solo quando cambia l'immagine o i ritocchi */
  updateBlurs() {
    if (!this.blurDirty) return;
    this.blurDirty = false;
    const gl = this.gl, [sw, sh] = this.size, u = this.use(this.blurP);
    (this.blurT || []).flat().forEach(t => this.freeTarget(t));
    this.blurT = [0.0025, 0.012, 0.04].map(frac => {
      const k = Math.max(1, frac * sh / 2.5), w = Math.max(1, Math.ceil(sw / k)), h = Math.max(1, Math.ceil(sh / k));
      const a = this.target(w, h), b = this.target(w, h);
      gl.viewport(0, 0, w, h);
      this.bind(0, this.srcTex, u.uImg); gl.uniform2fv(u.uDir, [1 / w, 0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.bind(0, a.tex, u.uImg); gl.uniform2fv(u.uDir, [0, 1 / h]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return [b, a];
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Dimensioni in pixel del risultato a piena risoluzione */
  outputSize(p, full = false) {
    const G = geoInfo(p.geo, this.size[0], this.size[1], full);
    return [Math.max(1, Math.round(G.outW)), Math.max(1, Math.round(G.outH)), G.ar];
  }

  /* opts: { full, showMask, overlay:[r,g,b,a], pcShow, clip, brushes, brushVer, tile: { x, y, w, h, fb } }
     Con tile disegna solo il riquadro (x, y dall'alto) di un risultato width × height nel framebuffer dato. */
  render(p, width, height, opts = {}) {
    const gl = this.gl, [sw, sh] = this.size, t = opts.tile;
    this.updateRetouch(p.spots);
    this.updateMasks(p.masks, opts.brushes || [], opts.brushVer || '');
    this.updateBlurs();
    const u = this.use(this.main);
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
      gl.uniform4fv(u.uTile, [t.x / width, 1 - (t.y + t.h) / height, t.w / width, t.h / height]);
    } else {
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.uniform4fv(u.uTile, [0, 0, 1, 1]);
    }
    this.setCurves(p);
    this.bind(0, this.srcTex, u.uImg); this.bind(1, this.curveTex, u.uCurve); this.bind(2, this.lutTex, u.uLut);
    this.bind(3, this.maskTex[0], u.uMask0); this.bind(4, this.maskTex[1], u.uMask1); this.bind(5, this.depthTex, u.uDepth);
    this.bind(6, this.blurT[0][0].tex, u.uBlur1); this.bind(7, this.blurT[1][0].tex, u.uBlur2);
    if (this.units > 8) this.bind(8, this.blurT[2][0].tex, u.uBlur3); else gl.uniform1i(u.uBlur3, 7);   // GPU con 8 unità: riusa il livello medio

    const G = this.lastGeo = geoInfo(p.geo, sw, sh, !!opts.full);
    const f1 = (n, x) => gl.uniform1f(u[n], x), f2 = (n, a) => gl.uniform2fv(u[n], a);
    f2('uTexel', [1 / sw, 1 / sh]); f1('uSa', G.Sa); f1('uOutAspect', G.ar);
    gl.uniform4fv(u.uCrop, G.crop); f2('uFrame', G.frame); f2('uFlip', G.flip); f2('uOff', G.off); f2('uPersp', G.persp);
    f1('uRot', G.th); f1('uScale', G.scale); f1('uAspAdj', G.aspAdj); f1('uDist', G.dist + p.lensDist);
    f2('uCaFix', [p.caR, p.caB]); f1('uLensVig', p.lensVig); f1('uLensVigMid', p.lensVigMid);
    gl.uniform3fv(u.uDefP, [p.defP, p.defPLo, p.defPHi]); gl.uniform3fv(u.uDefG, [p.defG, p.defGLo, p.defGHi]);
    const map = { uExp: 'exp', uContrast: 'contrast', uHi: 'hi', uSh: 'sh', uWh: 'wh', uBl: 'bl', uTemp: 'temp', uTint: 'tint',
      uVib: 'vib', uSat: 'sat', uFade: 'fade', uBW: 'mono', uTex: 'texture', uClar: 'clarity', uDehaze: 'dehaze',
      uGlow: 'glow', uHal: 'halation', uCa: 'ca', uVigHi: 'vigHi', uCalSh: 'calSh' };
    for (const k in map) f1(k, p[map[k]]);
    gl.uniformMatrix3fv(u.uCal, false, calMatrix(p));
    gl.uniform1fv(u.uHSLc, new Float32Array(HSL_CENTERS));
    gl.uniform3fv(u.uHSL, new Float32Array(p.hsl));
    gl.uniform1fv(u.uBWm, new Float32Array(p.bwm));
    gl.uniform1fv(u.uGrade, new Float32Array([p.gsH, p.gsS, p.gsL, p.gmH, p.gmS, p.gmL, p.ghH, p.ghS, p.ghL, p.ggH, p.ggS, p.ggL, p.gBal, p.gBlend]));
    const PC = new Float32Array(48);
    p.pc.slice(0, 4).forEach((c, i) => PC.set([c.h, c.s, c.v, c.on ? 1 : 0, c.dh, c.ds, c.dl, 0, c.hr, c.sr, c.lr, c.fe], i * 12));
    gl.uniform4fv(u.uPC, PC);
    f1('uPCShow', opts.pcShow ?? -1);
    gl.uniform4fv(u.uSharpP, [p.sharp, p.sharpRad, p.sharpDetail, p.sharpMask]);
    gl.uniform3fv(u.uNrL, [p.nrLum, p.nrLumDetail, p.nrLumContrast]);
    gl.uniform3fv(u.uNrC, [p.nrCol, p.nrColDetail, p.nrColSmooth]);
    gl.uniform4fv(u.uVigP, [p.vig, p.vigMid, p.vigRound, p.vigFeather]);
    gl.uniform3fv(u.uGrainP, [p.grain, p.grainSize, p.grainRough]);
    gl.uniform4fv(u.uGrainRes, [G.outW, G.outH, width, height]);
    gl.uniform4fv(u.uBlurA, [p.lbAmt, { radial: 0, linear: 1, depth: this.hasDepth ? 2 : 0 }[p.lbType], p.lbX, p.lbY]);
    f1('uLbFocus', p.lbFocus);
    gl.uniform4fv(u.uBlurB, [p.lbSize, p.lbAngle * Math.PI / 180, p.lbFeather, p.lbBokeh]);
    f1('uLutAmt', this.lutSize > 0 ? p.lutAmt : 0); f1('uLutSize', this.lutSize || 2);
    const MK = new Float32Array(MAX_MASKS * 20);
    p.masks.slice(0, MAX_MASKS).forEach((m, i) => {
      const a = m.adj;
      MK.set([a.exp, a.contrast, a.hi, a.sh, a.wh, a.bl, a.temp, a.tint, a.hue, a.sat, a.texture, a.clarity,
        a.dehaze, a.sharp, a.noise, a.moire, a.ovH, a.ovS, m.on ? m.amount : 0, 0], i * 20);
    });
    gl.uniform4fv(u.uMk, MK);
    f1('uShowMask', opts.showMask ?? -1);
    gl.uniform4fv(u.uOverlay, opts.overlay || [1, 0, 0, 0.5]);
    f1('uClip', opts.clip ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (t) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Rendering a tasselli in un canvas 2D: per l'esportazione a piena risoluzione senza limiti del canvas WebGL */
  renderToCanvas(p, width, height, opts = {}) {
    const gl = this.gl, T = 1024, tgt = this.target(T, T);
    const out = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = out.getContext('2d');
    const buf = new Uint8Array(T * T * 4);
    try {
      for (let y = 0; y < height; y += T) for (let x = 0; x < width; x += T) {
        const w = Math.min(T, width - x), h = Math.min(T, height - y);
        this.render(p, width, height, { ...opts, tile: { x, y, w, h, fb: tgt.fb } });
        gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fb);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const id = ctx.createImageData(w, h), row = w * 4;
        for (let r = 0; r < h; r++) id.data.set(buf.subarray((h - 1 - r) * row, (h - r) * row), r * row);   // GL ha le righe dal basso
        ctx.putImageData(id, x, y);
      }
    } finally { this.freeTarget(tgt); }
    return out;
  }
}

/* Lettura di un file .cube (LUT 3D) */
function parseCube(text) {
  let n = 0; const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    if (line.startsWith('LUT_3D_SIZE')) n = parseInt(line.split(/\s+/)[1], 10);
    else if (line.startsWith('LUT_1D_SIZE')) throw new Error('LUT 1D non supportate');
    else if (/^[-\d.]/.test(line)) { const p = line.split(/\s+/).map(Number); if (p.length >= 3) vals.push(p[0], p[1], p[2]); }
  }
  if (!n || vals.length < n * n * n * 3) throw new Error('File .cube non valido');
  const data = new Uint8Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const src = (r + g * n + b * n * n) * 3, dst = (g * n * n + b * n + r) * 4;
    for (let k = 0; k < 3; k++) data[dst + k] = Math.round(Math.min(1, Math.max(0, vals[src + k])) * 255);
    data[dst + 3] = 255;
  }
  return { data, n };
}
