'use strict';

/* Motore di elaborazione WebGL: tutta la pipeline è in un unico shader. */

const VERT = `
attribute vec2 p; varying vec2 v;
void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 v;
uniform sampler2D uImg, uCurve, uLut;
uniform vec2 uTexel, uFrame, uFlip, uSrc;
uniform float uRot, uOutAspect, uLutAmt, uLutSize;
uniform float uExp, uContrast, uHi, uSh, uWh, uBl, uTemp, uTint, uVib, uSat, uFade, uBW;
uniform float uSharp, uDenoise, uTex, uClar, uDehaze, uVig, uVigMid, uVigFeather;
uniform float uGrain, uGrainSize, uGlow, uHal, uCa;
uniform float uGrade[7];
uniform vec3 uHSL[8];
uniform float uBWm[8];
uniform vec4 uMkA[2], uMkB[2], uMkC[2], uMkD[2];

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

// coordinate dell'immagine sorgente a partire da quelle del risultato (ritaglio, rotazione, specchio)
vec2 srcUV(vec2 o){
  vec2 q = (o - 0.5) * uFrame * uFlip;
  float c = cos(uRot), s = sin(uRot);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return q / uSrc + 0.5;
}
vec3 tex(vec2 uv){ return texture2D(uImg, uv).rgb; }

// media su un anello di 8 punti; r è in unità di altezza dell'immagine
vec3 ring(vec2 uv, float r){
  vec2 o = vec2(r / uSrc.x, r), d = o * 0.7071;
  vec3 s = tex(uv);
  s += tex(uv + vec2(o.x, 0.0)) + tex(uv - vec2(o.x, 0.0)) + tex(uv + vec2(0.0, o.y)) + tex(uv - vec2(0.0, o.y));
  s += tex(uv + d) + tex(uv - d) + tex(uv + vec2(d.x, -d.y)) + tex(uv + vec2(-d.x, d.y));
  return s / 9.0;
}

vec3 applyLut(vec3 c){
  float n = uLutSize;
  float b = clamp(c.b, 0.0, 1.0) * (n - 1.0);
  float s0 = floor(b), s1 = min(s0 + 1.0, n - 1.0), f = b - s0;
  float x = clamp(c.r, 0.0, 1.0) * (n - 1.0) + 0.5, y = (clamp(c.g, 0.0, 1.0) * (n - 1.0) + 0.5) / n;
  vec3 a = texture2D(uLut, vec2((s0 * n + x) / (n * n), y)).rgb;
  vec3 d = texture2D(uLut, vec2((s1 * n + x) / (n * n), y)).rgb;
  return mix(a, d, f);
}

void main(){
  vec2 uv = srcUV(v);
  vec3 c;
  if (uCa > 0.0) {
    vec2 d = (v - 0.5) * uCa * 0.012;
    c = vec3(tex(srcUV(v + d)).r, tex(uv).g, tex(srcUV(v - d)).b);
  } else c = tex(uv);

  // riduzione del rumore (filtro che rispetta i bordi)
  if (uDenoise > 0.0) {
    vec3 acc = c; float ws = 1.0;
    float rad = 1.0 + uDenoise * 2.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec3 s = tex(uv + vec2(cos(a), sin(a)) * uTexel * rad);
      vec3 df = s - c;
      float w = exp(-dot(df, df) * 60.0);
      acc += s * w; ws += w;
    }
    c = mix(c, acc / ws, min(uDenoise, 1.0));
  }

  // nitidezza, texture, chiarezza, foschia
  if (uSharp > 0.0) {
    vec3 b = (tex(uv + vec2(uTexel.x, 0.0)) + tex(uv - vec2(uTexel.x, 0.0)) +
              tex(uv + vec2(0.0, uTexel.y)) + tex(uv - vec2(0.0, uTexel.y))) * 0.25;
    c += (c - b) * uSharp * 1.5;
  }
  if (uTex != 0.0) c += (c - ring(uv, 0.0025)) * uTex * 1.2;
  if (uClar != 0.0) {
    vec3 b = (ring(uv, 0.01) + ring(uv, 0.02)) * 0.5;
    c += (c - b) * uClar * (0.4 + 0.6 * (1.0 - abs(luma(c) * 2.0 - 1.0)));
  }
  if (uDehaze != 0.0) {
    if (uDehaze > 0.0) {
      vec3 b = ring(uv, 0.02);
      float t = max(1.0 - uDehaze * 0.8 * min(b.r, min(b.g, b.b)), 0.2);
      c = (c - 0.9 * (1.0 - t)) / t;
    } else c = mix(c, vec3(0.8), -uDehaze * 0.3);
  }
  vec3 glowSrc = vec3(0.0); float halSrc = 0.0;
  if (uGlow > 0.0 || uHal > 0.0) {
    vec3 gb = (ring(uv, 0.03) + ring(uv, 0.06)) * 0.5;
    glowSrc = max(gb - 0.55, 0.0);
    halSrc = max(luma(gb) - 0.6, 0.0);
  }
  c = clamp(c, 0.0, 1.0);

  // maschere locali: sommano le loro regolazioni, pesate, a quelle globali
  float eX = uExp, kC = uContrast, hiV = uHi, shV = uSh, tmV = uTemp, tnV = uTint, saV = uSat;
  for (int i = 0; i < 2; i++) {
    float t = uMkA[i].x;
    if (t < 0.5) continue;
    vec2 p = v - uMkA[i].yz;
    p.x *= uOutAspect;
    float ca = cos(uMkA[i].w), sn = sin(uMkA[i].w);
    vec2 r = vec2(ca * p.x + sn * p.y, -sn * p.x + ca * p.y);
    float f = max(uMkB[i].y, 0.01), w;
    if (t < 1.5) w = 1.0 - smoothstep(-f * 0.5, f * 0.5, r.x);
    else {
      float d = length(vec2(r.x / (uMkB[i].x * uMkB[i].w), r.y / uMkB[i].x));
      w = 1.0 - smoothstep(1.0 - f, 1.0, d);
    }
    if (uMkB[i].z > 0.5) w = 1.0 - w;
    eX += w * uMkC[i].x; kC += w * uMkC[i].y; hiV += w * uMkC[i].z; shV += w * uMkC[i].w;
    tmV += w * uMkD[i].x; tnV += w * uMkD[i].y; saV += w * uMkD[i].z;
  }

  // esposizione e bilanciamento del bianco in lineare
  c = toLin(c);
  c *= exp2(eX);
  c *= vec3(1.0 + tmV * 0.3 + tnV * 0.05, 1.0 - tnV * 0.2, 1.0 - tmV * 0.3 + tnV * 0.05);
  c = toSrgb(c);

  // neri / bianchi
  float bp = -uBl * 0.15, wp = 1.0 - uWh * 0.15;
  c = (c - bp) / (wp - bp);

  // ombre / alteluci
  float l = luma(c);
  c += shV * 0.35 * (1.0 - smoothstep(0.0, 0.55, l)) * (1.0 - l) + hiV * 0.35 * smoothstep(0.45, 1.0, l) * l;

  // contrasto
  float k = kC >= 0.0 ? 1.0 + kC * 1.2 : 1.0 + kC * 0.8;
  c = clamp((c - 0.5) * k + 0.5, 0.0, 1.0);

  // HSL per colore (e mix del bianco e nero)
  vec3 hsl = rgb2hsl(c);
  float dh = 0.0, ds = 0.0, dl = 0.0, bwAdj = 0.0;
  for (int i = 0; i < 8; i++) {
    float center = i == 0 ? 0.0 : i == 1 ? 30.0 : i == 2 ? 60.0 : i == 3 ? 120.0
                 : i == 4 ? 180.0 : i == 5 ? 230.0 : i == 6 ? 275.0 : 320.0;
    float d = abs(hsl.x - center); d = min(d, 360.0 - d);
    float w = smoothstep(50.0, 0.0, d) * smoothstep(0.02, 0.2, hsl.y);
    dh += uHSL[i].x * w; ds += uHSL[i].y * w; dl += uHSL[i].z * w; bwAdj += uBWm[i] * w;
  }
  hsl.x += dh * 30.0;
  hsl.y = clamp(hsl.y * (1.0 + ds), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dl * 0.25 * hsl.y * (1.0 - abs(2.0 * hsl.z - 1.0)), 0.0, 1.0);
  c = hsl2rgb(hsl);

  // vividezza, saturazione, bianco e nero
  float g = luma(c);
  float cs = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(g), c, max(1.0 + uVib * (1.0 - cs) + saV, 0.0));
  if (uBW > 0.0) c = mix(c, vec3(clamp(luma(c) * (1.0 + bwAdj * 0.8), 0.0, 1.0)), uBW);
  c = clamp(c, 0.0, 1.0);

  // gradazione colore a tre toni: ombre / medi / alteluci
  float lg = luma(c), bal = uGrade[6] * 0.25;
  float wS = 1.0 - smoothstep(0.15 + bal, 0.6 + bal, lg);
  float wH = smoothstep(0.4 + bal, 0.85 + bal, lg);
  float wM = max(1.0 - wS - wH, 0.0);
  vec3 tS = hsl2rgb(vec3(uGrade[0], 1.0, 0.5)), tM = hsl2rgb(vec3(uGrade[2], 1.0, 0.5)), tH = hsl2rgb(vec3(uGrade[4], 1.0, 0.5));
  c += (tS - luma(tS)) * uGrade[1] * wS * 0.35 + (tM - luma(tM)) * uGrade[3] * wM * 0.35 + (tH - luma(tH)) * uGrade[5] * wH * 0.35;
  c = clamp(c, 0.0, 1.0);

  // curva dei toni (canale per canale, già composta con la curva generale)
  c = vec3(texture2D(uCurve, vec2(c.r * 0.99609375 + 0.001953125, 0.5)).r,
           texture2D(uCurve, vec2(c.g * 0.99609375 + 0.001953125, 0.5)).g,
           texture2D(uCurve, vec2(c.b * 0.99609375 + 0.001953125, 0.5)).b);

  // LUT 3D
  if (uLutAmt > 0.0) c = mix(c, applyLut(c), uLutAmt);

  // dissolvenza dei neri
  c = c * (1.0 - uFade * 0.15) + uFade * 0.15;

  // bagliore e alone (halation)
  c = 1.0 - (1.0 - c) * (1.0 - glowSrc * uGlow * 1.2);
  c += vec3(1.0, 0.3, 0.12) * halSrc * uHal * 1.6;

  // vignettatura
  float r = length(v - 0.5) * 1.4142;
  float vg = smoothstep(uVigMid, min(uVigMid + 0.15 + uVigFeather * 0.6, 1.2), r);
  c *= uVig < 0.0 ? 1.0 - uVig * vg * 0.8 : 1.0 - uVig * vg * 0.9;

  // grana (indipendente dalla risoluzione)
  vec2 gp = floor(v * vec2(uOutAspect, 1.0) * (900.0 / max(uGrainSize, 0.3)));
  c += (hash(gp) - 0.5) * uGrain * 0.25 * (0.3 + 0.7 * (1.0 - abs(luma(c) * 2.0 - 1.0)));

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ---------- Curve ---------- */

/* Curva monotona (Fritsch–Carlson) -> tabella da 256 valori in 0..1 */
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
  const out = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
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

/* ---------- Geometria ---------- */

const ASPECTS = { orig: 0, '1:1': 1, '4:5': 4 / 5, '5:4': 5 / 4, '3:2': 3 / 2, '2:3': 2 / 3,
  '4:3': 4 / 3, '3:4': 3 / 4, '16:9': 16 / 9, '9:16': 9 / 16, '2.39:1': 2.39 };

/* Calcola il riquadro di ritaglio: rapporto, altezza (in unità di altezza sorgente) e angolo */
function frameFor(geo, srcW, srcH) {
  const Sa = srcW / srcH, odd = geo.rot % 2 !== 0;
  let ar = ASPECTS[geo.aspect] || (odd ? 1 / Sa : Sa);
  const th = geo.angle * Math.PI / 180 + geo.rot * Math.PI / 2;
  const co = Math.abs(Math.cos(th)), si = Math.abs(Math.sin(th));
  const s = Math.min(Sa / (ar * co + si), 1 / (ar * si + co)) / Math.max(geo.zoom, 1);
  return { ar, s, th, outW: ar * s * srcH, outH: s * srcH };
}

/* ---------- Motore ---------- */

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL non disponibile');
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    this.prog = this.link(VERT, FRAG);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(this.prog, i).name.replace(/\[0\]$/, '');
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    this.imgTex = this.makeTex(0);
    this.curveTex = this.makeTex(1);
    this.lutTex = this.makeTex(2);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.uniform1i(this.u.uImg, 0); gl.uniform1i(this.u.uCurve, 1); gl.uniform1i(this.u.uLut, 2);
    this.size = [1, 1];
    this.lutSize = 0;
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

  /* data: Uint8Array RGBA con indice (g * N*N + b * N + r) * 4 */
  setLut(data, n) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n * n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.lutSize = n;
  }
  clearLut() { this.lutSize = 0; }

  setCurves(p) {
    const M = curveLUT(p.curve), R = curveLUT(p.cr), G = curveLUT(p.cg), B = curveLUT(p.cb);
    const at = (lut, y) => lut[Math.round(Math.min(1, Math.max(0, y)) * 255)];
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++)
      data.set([at(M, R[i]) * 255, at(M, G[i]) * 255, at(M, B[i]) * 255, 255].map(Math.round), i * 4);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /* Dimensioni in pixel del risultato a piena risoluzione */
  outputSize(p) {
    const f = frameFor(p.geo, this.size[0], this.size[1]);
    return [Math.max(1, Math.round(f.outW)), Math.max(1, Math.round(f.outH)), f.ar];
  }

  render(p, width, height) {
    const gl = this.gl, u = this.u, [sw, sh] = this.size;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    this.setCurves(p);
    const f = frameFor(p.geo, sw, sh), Sa = sw / sh;
    gl.uniform2f(u.uTexel, 1 / sw, 1 / sh);
    gl.uniform2f(u.uFrame, f.ar * f.s, f.s);
    gl.uniform2f(u.uFlip, p.geo.fx ? -1 : 1, p.geo.fy ? -1 : 1);
    gl.uniform2f(u.uSrc, Sa, 1);
    gl.uniform1f(u.uRot, f.th);
    gl.uniform1f(u.uOutAspect, f.ar);
    const useLut = this.lutSize > 0 && p.lutAmt > 0;
    gl.uniform1f(u.uLutAmt, useLut ? p.lutAmt : 0);
    gl.uniform1f(u.uLutSize, this.lutSize || 2);
    const map = { uExp: 'exp', uContrast: 'contrast', uHi: 'hi', uSh: 'sh', uWh: 'wh', uBl: 'bl',
      uTemp: 'temp', uTint: 'tint', uVib: 'vib', uSat: 'sat', uFade: 'fade', uBW: 'mono',
      uSharp: 'sharp', uDenoise: 'denoise', uTex: 'texture', uClar: 'clarity', uDehaze: 'dehaze',
      uVig: 'vig', uVigMid: 'vigMid', uVigFeather: 'vigFeather', uGrain: 'grain', uGrainSize: 'grainSize',
      uGlow: 'glow', uHal: 'halation', uCa: 'ca' };
    for (const k in map) gl.uniform1f(u[k], p[map[k]]);
    gl.uniform1fv(u.uGrade, new Float32Array([p.gsH, p.gsS, p.gmH, p.gmS, p.ghH, p.ghS, p.gBal]));
    gl.uniform3fv(u.uHSL, new Float32Array(p.hsl));
    gl.uniform1fv(u.uBWm, new Float32Array(p.bwm));
    const A = [], B = [], C = [], D = [];
    for (const m of p.masks) {
      A.push(m.type, m.x, 1 - m.y, m.angle * Math.PI / 180);
      B.push(m.size, m.feather, m.invert ? 1 : 0, m.ratio);
      C.push(m.exp, m.contrast, m.hi, m.sh);
      D.push(m.temp, m.tint, m.sat, 0);
    }
    gl.uniform4fv(u.uMkA, new Float32Array(A)); gl.uniform4fv(u.uMkB, new Float32Array(B));
    gl.uniform4fv(u.uMkC, new Float32Array(C)); gl.uniform4fv(u.uMkD, new Float32Array(D));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
