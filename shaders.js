'use strict';

/* Programmi GPU (GLSL ES 1.0).
   Convenzioni: v = coordinate del risultato (y verso l'alto); uv = coordinate sorgente (y verso l'alto);
   ic = coordinate immagine (y verso il basso), usate per maschere, ritocchi e sfocatura.
   Le distanze sono in "unità di altezza" dell'immagine sorgente. */

const SH_VERT = `
attribute vec2 p; varying vec2 v;
void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

/* Vertice della pipeline principale: uTile seleziona il riquadro del risultato (esportazione a tasselli) */
const SH_VERT_MAIN = `
attribute vec2 p; varying vec2 v; uniform vec4 uTile;
void main(){ v = uTile.xy + (p * 0.5 + 0.5) * uTile.zw; gl_Position = vec4(p, 0.0, 1.0); }`;

const SH_COMMON = `
precision highp float;
varying vec2 v;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
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
vec3 hueColor(float h){ return hsl2rgb(vec3(h, 1.0, 0.5)); }
float hueDist(float a, float b){ float d = abs(a - b); return min(d, 360.0 - d); }
`;

/* ---------- Sfocatura gaussiana separabile (13 campioni, sigma 2,5 campioni) per i livelli sfocati ---------- */
const SH_BLUR = SH_COMMON + `
uniform sampler2D uImg;
uniform vec2 uDir;
void main(){
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 12.5);
    s += texture2D(uImg, v + uDir * float(i)).rgb * w; ws += w;
  }
  gl_FragColor = vec4(s / ws, 1.0);
}`;

/* ---------- Ritocco: correggi / clona / occhi rossi (fino a 16 punti per passata) ---------- */
const SH_RETOUCH = SH_COMMON + `
uniform sampler2D uImg;
uniform float uSa;
uniform int uN;
uniform vec4 uSpA[16];   // destinazione.xy, sorgente.xy (uv)
uniform vec4 uSpB[16];   // raggio, sfumatura, opacità, modo
vec3 ringMean(vec2 c, float r){
  vec3 s = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    float a = float(k) * 0.5236;
    s += texture2D(uImg, c + vec2(cos(a) * r / uSa, sin(a) * r)).rgb;
  }
  return s / 12.0;
}
void main(){
  vec3 c = texture2D(uImg, v).rgb;
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    float r = uSpB[i].x;
    float dist = length((v - uSpA[i].xy) * vec2(uSa, 1.0));
    if (dist > r) continue;
    float w = (1.0 - smoothstep(r * (1.0 - uSpB[i].y), r, dist)) * uSpB[i].z;
    vec2 off = uSpA[i].zw - uSpA[i].xy;
    vec3 res = c;
    if (uSpB[i].w < 0.5) res = texture2D(uImg, v + off).rgb + ringMean(uSpA[i].xy, r * 1.15) - ringMean(uSpA[i].zw, r * 1.15);
    else if (uSpB[i].w < 1.5) res = texture2D(uImg, v + off).rgb;
    else {
      float gb = (c.g + c.b) * 0.5;
      float red = smoothstep(1.2, 1.6, c.r / max(gb, 0.02)) * step(0.08, c.r);
      res = mix(c, vec3(gb * 0.7, c.g * 0.75, c.b * 0.75), red);
    }
    c = mix(c, res, w);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/* ---------- Maschere: calcola una maschera (fino a 6 componenti) in un canale ---------- */
const SH_MASK = SH_COMMON + `
uniform sampler2D uImg, uBrush, uDepth;
uniform float uSa;
uniform int uNC;
uniform float uInv;
uniform vec4 uCA[6];   // tipo, operazione, inverti, -
uniform vec4 uCB[6];
uniform vec4 uCC[6];
void main(){
  vec2 ic = vec2(v.x, 1.0 - v.y);
  float m = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uNC) break;
    float t = uCA[i].x, w = 0.0;
    if (t < 1.5) {                       // lineare: x, y, angolo, larghezza
      vec2 p = (ic - uCB[i].xy) * vec2(uSa, 1.0);
      float d = dot(p, vec2(cos(uCB[i].z), sin(uCB[i].z)));
      w = 1.0 - smoothstep(-uCB[i].w * 0.5, uCB[i].w * 0.5 + 1e-4, d);
    } else if (t < 2.5) {                // radiale: x, y, angolo, sfumatura | raggio x, raggio y
      vec2 p = (ic - uCB[i].xy) * vec2(uSa, 1.0);
      float ca = cos(uCB[i].z), sn = sin(uCB[i].z);
      vec2 r = vec2(ca * p.x + sn * p.y, -sn * p.x + ca * p.y);
      float d = length(r / max(uCC[i].xy, vec2(0.001)));
      w = 1.0 - smoothstep(1.0 - max(uCB[i].w, 0.01), 1.0, d);
    } else if (t < 3.5) {                // pennello
      w = texture2D(uBrush, v).a;
    } else if (t < 4.5) {                // intervallo colore: rgb di riferimento, ampiezza
      vec3 a = rgb2hsv(texture2D(uImg, v).rgb), b = rgb2hsv(uCB[i].xyz);
      float dh = abs(a.x - b.x); dh = min(dh, 1.0 - dh);
      float d = dh * 2.5 * (0.3 + 0.7 * min(a.y, b.y) * 2.0) + abs(a.y - b.y) * 0.6 + abs(a.z - b.z) * 0.35;
      float rg = uCB[i].w;
      w = 1.0 - smoothstep(rg * 0.35, rg * 0.35 + 0.05 + rg * 0.25, d);
    } else {                             // intervallo luminanza (5) o profondità (6): minimo, massimo, morbidezza
      float l = t < 5.5 ? luma(texture2D(uImg, v).rgb) : texture2D(uDepth, v).r, s = max(uCB[i].z, 0.001);
      w = smoothstep(uCB[i].x - s, uCB[i].x, l) * (1.0 - smoothstep(uCB[i].y, uCB[i].y + s, l));
    }
    if (uCA[i].z > 0.5) w = 1.0 - w;
    if (i == 0 || uCA[i].y < 0.5) m = max(m, w);
    else if (uCA[i].y < 1.5) m *= 1.0 - w;
    else m = min(m, w);
  }
  gl_FragColor = vec4(uInv > 0.5 ? 1.0 - m : m);
}`;

/* ---------- Pipeline principale ---------- */
const SH_MAIN = SH_COMMON + `
uniform sampler2D uImg, uCurve, uLut, uMask0, uMask1, uDepth;
uniform sampler2D uBlur1, uBlur2, uBlur3;   // sorgente sfocata (gaussiana) a ~0,25%, ~1,2%, ~4% dell'altezza
uniform vec2 uTexel;
uniform float uSa, uOutAspect;
// geometria
uniform vec4 uCrop;
uniform vec2 uFrame, uFlip, uOff, uPersp;
uniform float uRot, uScale, uAspAdj, uDist;
// ottica
uniform vec2 uCaFix;
uniform float uLensVig, uLensVigMid;
uniform vec3 uDefP, uDefG;
// luce e colore
uniform float uExp, uContrast, uHi, uSh, uWh, uBl, uTemp, uTint, uVib, uSat, uFade, uBW;
uniform mat3 uCal;
uniform float uCalSh;
uniform float uHSLc[8];
uniform vec3 uHSL[8];
uniform float uBWm[8];
uniform float uGrade[14];
uniform vec4 uPC[12];      // colore punto: 4 campioni x (hsv obiettivo + attivo, spostamenti, intervalli)
uniform float uPCShow;
// dettaglio
uniform vec4 uSharpP;      // quantità, raggio, dettaglio, mascheratura
uniform vec3 uNrL, uNrC;   // quantità, dettaglio, contrasto / quantità, dettaglio, uniformità
uniform float uTex, uClar, uDehaze;
// effetti
uniform vec4 uVigP;        // quantità, punto medio, rotondità, sfumatura
uniform float uVigHi;
uniform vec3 uGrainP;      // quantità, dimensione, ruvidità
uniform vec4 uGrainRes;    // risultato a piena risoluzione (l, a) e risoluzione di questo disegno (l, a), in pixel
uniform float uGlow, uHal, uCa;
uniform vec4 uBlurA;       // quantità, tipo, x, y
uniform vec4 uBlurB;       // dimensione, angolo, sfumatura, bokeh
uniform float uLbFocus;    // profondità a fuoco (modo profondità)
uniform float uNoise;      // rumore stimato del sensore (deviazione standard, 0..1)
uniform float uLutAmt, uLutSize;
// maschere
uniform vec4 uMk[40];      // 8 maschere x 5 vec4
uniform float uShowMask;
uniform vec4 uOverlay;
uniform float uClip;       // evidenzia i tagli di ombre e luci

vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
// hash senza sin(): stabile anche con coordinate grandi sulle GPU dei telefoni
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

/* Campo di grana (deviazione circa 1): due reticoli ruotati per evitare la griglia,
   più un'ottava larga che crea i grumi irregolari (ruvidità) */
float grainField(vec2 q, float rough){
  vec2 q2 = mat2(0.8, -0.6, 0.6, 0.8) * q * 1.13 + 17.31;
  vec2 q3 = mat2(0.28, 0.96, -0.96, 0.28) * q * 0.87 + 5.17;
  float fine = (vnoise(q) + vnoise(q2) + vnoise(q3) - 1.5) * 2.4;
  float clump = (vnoise(q * 0.38 + 41.7) - 0.5) * 3.4;
  float n = mix(fine, fine * 0.75 + clump * 0.75, rough);
  return sign(n) * pow(abs(n), 1.0 - 0.3 * rough);
}

vec2 srcUV(vec2 o){
  vec2 b = uCrop.xy + o * uCrop.zw;
  vec2 q = (b - 0.5) * uFrame * uFlip;
  float c = cos(uRot), s = sin(uRot);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  q = q / uScale - uOff;
  q *= vec2(1.0 + max(-uAspAdj, 0.0) * 0.5, 1.0 + max(uAspAdj, 0.0) * 0.5);
  q /= 1.0 + uPersp.x * q.x + uPersp.y * q.y;
  float r2 = dot(q, q) / (0.25 * (uSa * uSa + 1.0));
  q *= 1.0 + uDist * r2 * 0.3;
  return vec2(q.x / uSa, q.y) + 0.5;
}
vec3 tex(vec2 uv){ return texture2D(uImg, uv, -0.4).rgb; }   // leggero bias: anteprima ridotta più nitida
vec3 ring(vec2 uv, float r){
  vec2 o = vec2(r / uSa, r), d = o * 0.7071;
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
  return mix(texture2D(uLut, vec2((s0 * n + x) / (n * n), y)).rgb, texture2D(uLut, vec2((s1 * n + x) / (n * n), y)).rgb, f);
}
/* Curve a 16 bit: 1024 voci, riga alta = byte alto, riga bassa = byte basso; interpolazione manuale */
vec3 curveEntry(float i){
  float x = (i + 0.5) / 1024.0;
  // sui telefoni le texture si leggono in bassa precisione (lowp): si copia in highp e si arrotonda al byte prima di combinarle
  highp vec3 hi = texture2D(uCurve, vec2(x, 0.05)).rgb, lo = texture2D(uCurve, vec2(x, 0.15)).rgb;   // righe 0 e 1 di 10
  hi = floor(hi * 255.0 + 0.5); lo = floor(lo * 255.0 + 0.5);
  return clamp((hi * 256.0 + lo) / 65535.0, 0.0, 1.0);
}
/* Riporta un colore fuori gamma dentro [0,1] riducendo la saturazione invece di tagliare i canali (la tinta non cambia) */
vec3 fitGamut(vec3 c){
  float g = clamp(luma(c), 0.0, 1.0), t = 1.0;
  for (int i = 0; i < 3; i++) {
    float v = i == 0 ? c.r : i == 1 ? c.g : c.b;
    if (v > 1.0) t = min(t, (1.0 - g) / max(v - g, 1e-5));
    else if (v < 0.0) t = min(t, g / max(g - v, 1e-5));
  }
  return clamp(vec3(g) + (c - vec3(g)) * t, 0.0, 1.0);
}
/* Spalla morbida sulle alte luci (in luce lineare): sopra 0,8 la luce viene compressa gradualmente invece di bruciare */
vec3 softShoulder(vec3 c){
  float m = max(c.r, max(c.g, c.b));
  if (m <= 0.8) return c;
  float mm = 0.8 + 0.2 * (1.0 - exp(-(m - 0.8) / 0.2));
  return c * (mm / m);
}
float atanh1(float x){ return 0.5 * log((1.0 + x) / (1.0 - x)); }
float tanhf(float x){ float e = exp(2.0 * clamp(x, -10.0, 10.0)); return (e - 1.0) / (e + 1.0); }

float curveAt(float x, int ch){
  float f = clamp(x, 0.0, 1.0) * 1023.0, i0 = floor(f), t = f - i0;
  vec3 a = curveEntry(i0), b = curveEntry(min(i0 + 1.0, 1023.0));
  vec3 r = mix(a, b, t);
  return ch == 0 ? r.r : ch == 1 ? r.g : r.b;
}

void main(){
  vec2 uv = srcUV(v);

  // --- grana, prima parte: il campo di grana deforma e ammorbidisce leggermente l'immagine,
  //     così i dettagli si "sciolgono" nella grana invece di restarle sotto ---
  float gAmt = uGrainP.x, gN = 0.0, gCell = 1.0;
  if (gAmt > 0.0) {
    vec2 gpx = v * uGrainRes.xy;                                     // pixel del risultato a piena risoluzione
    gCell = max(uGrainP.y, 0.3) * sqrt(uGrainRes.x * uGrainRes.y) / 2000.0;
    float pxFull = uGrainRes.y / uGrainRes.w;                        // pixel pieni per pixel disegnato
    gN = grainField(gpx / gCell, uGrainP.z);
    // in anteprima ridotta la grana più fine di un pixel diventa rumore per pixel, attenuato come in una riduzione reale
    float sub = smoothstep(0.6, 1.2, pxFull / gCell);
    if (sub > 0.0) {
      vec2 rp = floor(v * uGrainRes.zw);
      float wn = (hash(rp) + hash(rp + 71.3) + hash(rp + 19.1) - 1.5) * 2.0;
      gN = mix(gN, wn * min(1.0, gCell / pxFull) * 1.2, sub);
    }
    // granuli nitidi: componente per pixel pieno (se la grana non è già sotto il pixel disegnato)
    vec2 fp = floor(gpx);
    float crisp = (hash(fp) + hash(fp + 53.7) - 1.0) * 2.45;
    gN = mix(gN * 0.8 + crisp * 0.6, gN, sub);
    vec2 d = vec2(vnoise(gpx / gCell * 0.8 + 3.7), vnoise(gpx / gCell * 0.8 + 11.3)) - 0.5;
    uv += d * gCell * gAmt * (0.2 + 0.5 * uGrainP.z) * uTexel;
  }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.16, 0.16, 0.16, 1.0); return; }
  vec2 ic = vec2(uv.x, 1.0 - uv.y);

  // --- maschere: pesi e somma delle regolazioni locali ---
  vec4 m0 = texture2D(uMask0, uv), m1 = texture2D(uMask1, uv);
  float mw[8];
  mw[0] = m0.r; mw[1] = m0.g; mw[2] = m0.b; mw[3] = m0.a; mw[4] = m1.r; mw[5] = m1.g; mw[6] = m1.b; mw[7] = m1.a;
  vec4 L0 = vec4(0.0), L1 = vec4(0.0), L2 = vec4(0.0), L3 = vec4(0.0);
  vec3 ovl = vec3(0.0); float ovlW = 0.0, showW = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = mw[i] * uMk[i * 5 + 4].z;
    if (float(i) == uShowMask) showW = mw[i];
    if (w <= 0.0) continue;
    L0 += uMk[i * 5] * w; L1 += uMk[i * 5 + 1] * w; L2 += uMk[i * 5 + 2] * w; L3 += uMk[i * 5 + 3] * w;
    vec4 e = uMk[i * 5 + 4];
    if (e.y > 0.0) { ovl += hueColor(e.x) * e.y * w; ovlW += e.y * w; }
  }
  // L0: esp, contrasto, alteluci, ombre  L1: bianchi, neri, temp, tinta
  // L2: tonalità, saturazione, texture, chiarezza  L3: foschia, nitidezza, rumore, moiré

  // --- correzione aberrazione cromatica ---
  vec3 c;
  if (uCaFix.x != 0.0 || uCaFix.y != 0.0) {
    vec2 d = uv - 0.5;
    c = vec3(tex(0.5 + d * (1.0 + uCaFix.x * 0.004)).r, tex(uv).g, tex(0.5 + d * (1.0 + uCaFix.y * 0.004)).b);
  } else c = tex(uv);
  if (uCa > 0.0) {
    vec2 d = (v - 0.5) * uCa * 0.012;
    c = vec3(tex(srcUV(v + d)).r, c.g, tex(srcUV(v - d)).b);
  }

  // --- sfocatura obiettivo (zona di messa a fuoco manuale) ---
  if (uBlurA.x > 0.0) {
    vec2 p = (ic - uBlurA.zw) * vec2(uSa, 1.0);
    float ca = cos(uBlurB.y), sn = sin(uBlurB.y), d;
    vec2 r = vec2(ca * p.x + sn * p.y, -sn * p.x + ca * p.y);
    float far = 1.0, dC = 0.0;
    bool depthMode = uBlurA.y > 1.5;                                   // 2 = mappa di profondità
    float fw = 0.02 + uBlurB.z * 0.5;
    if (depthMode) { dC = texture2D(uDepth, uv).r; d = abs(dC - uLbFocus); far = clamp(d * 2.5, 0.25, 1.0); }
    else d = uBlurA.y < 0.5 ? length(r) : abs(r.y);
    float focus = 1.0 - smoothstep(uBlurB.x, uBlurB.x + fw, d);
    float rad = uBlurA.x * (1.0 - focus) * 0.03 * far;
    if (rad > 0.0005) {
      float radPx = rad / uTexel.y;                                     // raggio in pixel della sorgente
      vec3 acc = vec3(0.0); float ws = 0.0;
      for (int k = 0; k < 32; k++) {
        float fk = float(k) + 0.5, a = fk * 2.39996, rr = sqrt(fk / 32.0) * rad;
        vec2 tuv = uv + vec2(cos(a) * rr / uSa, sin(a) * rr);
        // raggi grandi: si campionano livelli già sfocati, così il bokeh è morbido e senza puntini
        vec3 s = radPx > 40.0 ? texture2D(uBlur2, tuv).rgb : radPx > 10.0 ? texture2D(uBlur1, tuv).rgb : tex(tuv);
        float w = 1.0 + uBlurB.w * 12.0 * pow(luma(s), 4.0);
        if (depthMode) {
          // un soggetto a fuoco più vicino non deve "colare" sullo sfondo sfocato (niente alone attorno alla figura)
          float dT = texture2D(uDepth, tuv).r;
          float fT = 1.0 - smoothstep(uBlurB.x, uBlurB.x + fw, abs(dT - uLbFocus));
          w *= 1.0 - fT * smoothstep(0.0, 0.025, dT - dC);
        }
        acc += s * w; ws += w;
      }
      c = acc / max(ws, 1e-4);
      // il rumore del sensore sparisce dove si sfoca: lo si reintegra uguale al resto della foto (altrimenti sembra plastica)
      vec2 np = floor(uv / uTexel);
      c += (hash(np) + hash(np + 17.3) + hash(np + 41.9) - 1.5) * 2.0 * uNoise * smoothstep(1.5, 6.0, radPx);
    }
  }

  if (gAmt > 0.0 && uGrainP.y > 1.0) c = mix(c, texture2D(uBlur1, uv).rgb, gAmt * min((uGrainP.y - 1.0) * 0.2, 0.4));   // grana grossa: ammorbidisce

  // --- riduzione rumore luminanza e colore ---
  float nrL = clamp(uNrL.x + L3.z, 0.0, 1.0), nrC = clamp(uNrC.x + L3.w, 0.0, 1.0);
  if (nrL > 0.0 || nrC > 0.0) {
    float y0 = luma(c), ys = y0, yw = 1.0;
    vec3 ch = c - y0, cs = ch; float cw = 1.0;
    float sig = mix(20.0, 300.0, uNrL.y), rl = 1.0 + nrL * 2.0, rc = 2.0 + uNrC.z * 6.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.785398;
      vec2 dir = vec2(cos(a), sin(a)) * uTexel;
      vec3 s = tex(uv + dir * rl);
      float ly = luma(s), w = exp(-(ly - y0) * (ly - y0) * sig);
      ys += ly * w; yw += w;
      vec3 s2 = tex(uv + dir * rc);
      float w2 = exp(-abs(luma(s2) - y0) * mix(2.0, 30.0, uNrC.y));
      cs += (s2 - luma(s2)) * w2; cw += w2;
    }
    float yn = mix(y0, ys / yw, nrL);
    yn += (y0 - yn) * uNrL.z * 0.5;
    c = vec3(yn) + mix(ch, cs / cw, nrC);
  }

  // --- nitidezza (quantità, raggio, dettaglio, mascheratura) ---
  float shp = max(uSharpP.x + L3.y, 0.0);
  if (shp > 0.0) {
    vec2 o = uTexel * uSharpP.y;
    vec3 a1 = tex(uv + vec2(o.x, 0.0)), a2 = tex(uv - vec2(o.x, 0.0)), a3 = tex(uv + vec2(0.0, o.y)), a4 = tex(uv - vec2(0.0, o.y));
    float lim = mix(0.03, 1.0, uSharpP.z);
    float hp = clamp(luma(c) - luma(a1 + a2 + a3 + a4) * 0.25, -lim, lim);   // solo luminanza, come Lightroom: niente rumore di colore
    float edge = abs(luma(a1) - luma(a2)) + abs(luma(a3) - luma(a4));
    float mk = uSharpP.w > 0.0 ? smoothstep(uSharpP.w * 0.12, uSharpP.w * 0.12 + 0.04, edge) : 1.0;
    c += hp * shp * 1.5 * mk;
  }

  // --- texture, chiarezza, foschia ---
  float tx = uTex + L2.z, cl = uClar + L2.w, dz = uDehaze + L3.x;
  // contrasto locale solo sulla luminanza, rispetto a vere sfocature gaussiane (niente aloni né blocchi di colore del JPEG)
  if (tx != 0.0) { float d = luma(c) - luma(texture2D(uBlur1, uv).rgb); c += d / (1.0 + abs(d) * 8.0) * tx * 1.9; }
  if (cl != 0.0) {
    float y = luma(c), d = y - luma(texture2D(uBlur2, uv).rgb);
    d = d / (1.0 + abs(d) * 5.0);                                  // sui bordi molto contrastati l'effetto si attenua: niente aloni
    c += d * cl * 1.7 * (0.35 + 0.65 * (1.0 - abs(clamp(y, 0.0, 1.0) * 2.0 - 1.0)));
  }
  if (dz > 0.0) {
    vec3 b = texture2D(uBlur3, uv).rgb;
    float t = max(1.0 - dz * 0.8 * min(b.r, min(b.g, b.b)), 0.25), y = max(luma(c), 1e-4);
    c *= max((y - 0.9 * (1.0 - t)) / t, 0.0) / y;              // toglie la foschia sulla luminanza mantenendo i rapporti di colore
    c = mix(vec3(luma(c)), c, 1.0 + dz * 0.2);
  } else if (dz < 0.0) c = mix(c, vec3(0.8), -dz * 0.3);

  // --- rimozione frange viola / verdi (vicino ai bordi contrastati) ---
  if (uDefP.x > 0.0 || uDefG.x > 0.0) {
    vec2 o = uTexel * 2.0;
    float l1 = luma(tex(uv + vec2(o.x, 0.0))), l2 = luma(tex(uv - vec2(o.x, 0.0))), l3 = luma(tex(uv + vec2(0.0, o.y))), l4 = luma(tex(uv - vec2(0.0, o.y)));
    float edge = smoothstep(0.08, 0.3, max(max(l1, l2), max(l3, l4)) - min(min(l1, l2), min(l3, l4)));
    vec3 h = rgb2hsl(clamp(c, 0.0, 1.0));
    float wp = uDefP.x * step(uDefP.y, h.x) * step(h.x, uDefP.z);
    float wg = uDefG.x * step(uDefG.y, h.x) * step(h.x, uDefG.z);
    c = mix(c, vec3(luma(c)), clamp((wp + wg) * edge * smoothstep(0.05, 0.25, h.y), 0.0, 1.0));
  }

  vec3 glowSrc = vec3(0.0); float halSrc = 0.0;
  if (uGlow > 0.0 || uHal > 0.0) {
    vec3 gb = (texture2D(uBlur2, uv).rgb + texture2D(uBlur3, uv).rgb * 2.0) / 3.0;
    glowSrc = toLin(gb) * smoothstep(0.55, 0.95, luma(gb));          // solo le luci forti diffondono
    halSrc = smoothstep(0.6, 0.95, luma(texture2D(uBlur2, uv).rgb));   // alone rosso attorno alle luci forti (pellicola)
  }
  c = clamp(c, 0.0, 1.0);
  float lSrc = max(luma(c), 1e-4);                                 // luminanza prima delle regolazioni (per ombre/luci locali)

  // --- lineare: vignettatura obiettivo, esposizione, bilanciamento, calibrazione ---
  c = toLin(c);
  if (uLensVig != 0.0) {
    float r = length((ic - 0.5) * vec2(uSa, 1.0)) / (0.5 * sqrt(uSa * uSa + 1.0));
    c *= 1.0 + uLensVig * smoothstep(uLensVigMid * 0.8, 1.0, r) * 1.5;
  }
  c *= exp2(uExp + L0.x);
  float tm = uTemp + L1.z, tn = uTint + L1.w;
  c *= vec3(1.0 + tm * 0.3 + tn * 0.05, 1.0 - tn * 0.2, 1.0 - tm * 0.3 + tn * 0.05);
  c = max(uCal * c, 0.0);
  float ly = luma(c);
  c *= 1.0 + vec3(uCalSh * 0.1, -uCalSh * 0.2, uCalSh * 0.1) * (1.0 - smoothstep(0.0, 0.25, ly));
  // ombre / alte luci come esposizione locale: la luminanza di riferimento mescola il pixel e i suoi dintorni
  // (solo dove sono simili, così sui bordi non nascono aloni); il guadagno moltiplica la luce e conserva i colori
  float shA = uSh + L0.w, hiA = uHi + L0.z;
  if (shA != 0.0 || hiA != 0.0) {
    float lp = toSrgb(vec3(luma(c))).r;
    float lb = lp * luma(texture2D(uBlur2, uv).rgb) / lSrc;
    float lr = mix(lp, lb, 0.65 * exp(-(lp - lb) * (lp - lb) / 0.02));
    float wSh = 1.0 - smoothstep(0.0, 0.5, lr), wHi = smoothstep(0.42, 1.0, lr);
    c *= exp2(shA * 1.6 * wSh * wSh + hiA * 1.3 * wHi);
  }
  c = softShoulder(c);
  c = toSrgb(c);

  // --- neri / bianchi, contrasto ---
  float bp = -(uBl + L1.y) * 0.15, wp = 1.0 - (uWh + L1.x) * 0.15;
  c = (c - bp) / (wp - bp);
  // contrasto con curva a S sulla luminanza: estremi morbidi, nessun taglio netto di bianchi e neri
  float kc = clamp(uContrast + L0.y, -1.0, 1.0);
  if (kc != 0.0) {
    float y = clamp(luma(c), 0.0, 1.0), yc;
    if (kc > 0.0) { float a = kc * 4.5; yc = 0.5 + 0.5 * tanhf(a * (y - 0.5)) / tanhf(a * 0.5); }
    else { float b = -kc * 3.0, t = tanhf(b * 0.5); yc = 0.5 + atanh1(clamp((y - 0.5) * 2.0 * t, -0.999, 0.999)) / b; }
    c = mix(c + (yc - y), c * (yc / max(y, 1e-4)), 0.5);
  }
  c = fitGamut(c);

  // --- mixer colore HSL, mix bianco e nero, colore punto ---
  vec3 hsl = rgb2hsl(c);
  float dh = 0.0, ds = 0.0, dl = 0.0, bwAdj = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = smoothstep(50.0, 0.0, hueDist(hsl.x, uHSLc[i])) * smoothstep(0.02, 0.2, hsl.y);
    dh += uHSL[i].x * w; ds += uHSL[i].y * w; dl += uHSL[i].z * w; bwAdj += uBWm[i] * w;
  }
  hsl.x += dh * 30.0 + L2.x * 30.0;
  hsl.y = clamp(hsl.y * (1.0 + ds), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dl * 0.25 * hsl.y * (1.0 - abs(2.0 * hsl.z - 1.0)), 0.0, 1.0);
  c = hsl2rgb(hsl);

  float pcSel = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 A = uPC[i * 3], B = uPC[i * 3 + 1], R = uPC[i * 3 + 2];
    if (A.w < 0.5) continue;
    vec3 h = rgb2hsv(c);
    float hd = abs(h.x - A.x); hd = min(hd, 1.0 - hd);
    float hr = 0.02 + R.x * 0.15, sr = 0.05 + R.y * 0.6, lr = 0.05 + R.z * 0.6, fe = 0.3 + R.w;
    float w = (1.0 - smoothstep(hr, hr * (1.0 + fe), hd)) * (1.0 - smoothstep(sr, sr * (1.0 + fe), abs(h.y - A.y)))
            * (1.0 - smoothstep(lr, lr * (1.0 + fe), abs(h.z - A.z)));
    if (float(i) == uPCShow) pcSel = w;
    vec3 hs = rgb2hsl(c);
    hs.x += B.x * 40.0 * w;
    hs.y = clamp(hs.y * (1.0 + B.y * w), 0.0, 1.0);
    hs.z = clamp(hs.z + B.z * 0.3 * w * (1.0 - abs(2.0 * hs.z - 1.0)), 0.0, 1.0);
    c = hsl2rgb(hs);
  }

  // --- vividezza, saturazione, bianco e nero ---
  float g = luma(c);
  float cs = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  // la vividezza risparmia gli incarnati (tonalità 15°-50°), come in Lightroom
  float skin = smoothstep(0.08, 0.2, cs) * (1.0 - smoothstep(0.0, 22.0, hueDist(rgb2hsl(c).x, 32.0)));
  c = mix(vec3(g), c, max(1.0 + uVib * (1.0 - cs) * (1.0 - 0.6 * skin) + uSat + L2.y, 0.0));
  if (uBW > 0.0) c = mix(c, vec3(clamp(luma(c) * (1.0 + bwAdj * 0.8), 0.0, 1.0)), uBW);
  c = fitGamut(c);

  // --- gradazione colore: ombre / medi / alteluci / globale, fusione, bilanciamento ---
  float lg = luma(c), bal = uGrade[12] * 0.2, tw = 0.05 + uGrade[13] * 0.3;
  float wS = 1.0 - smoothstep(0.33 + bal - tw, 0.33 + bal + tw, lg);
  float wH = smoothstep(0.66 + bal - tw, 0.66 + bal + tw, lg);
  float wM = clamp(1.0 - wS - wH, 0.0, 1.0);
  vec3 tS = hueColor(uGrade[0]), tM = hueColor(uGrade[3]), tH = hueColor(uGrade[6]), tG = hueColor(uGrade[9]);
  c += (tS - luma(tS)) * uGrade[1] * wS * 0.35 + (tM - luma(tM)) * uGrade[4] * wM * 0.35
     + (tH - luma(tH)) * uGrade[7] * wH * 0.35 + (tG - luma(tG)) * uGrade[10] * 0.3;
  c += uGrade[2] * wS * 0.2 + uGrade[5] * wM * 0.2 + uGrade[8] * wH * 0.2 + uGrade[11] * 0.15;
  c = clamp(c, 0.0, 1.0);

  // --- curve (parametrica + punti, per canale) ---
  c = vec3(curveAt(c.r, 0), curveAt(c.g, 1), curveAt(c.b, 2));

  // --- curve locali delle maschere (righe 2-9 della texture delle curve) ---
  for (int i = 0; i < 8; i++) {
    float w = mw[i] * uMk[i * 5 + 4].z;
    if (uMk[i * 5 + 4].w < 0.5 || w <= 0.0) continue;
    float y = (2.5 + float(i)) / 10.0;
    vec3 q = clamp(c, 0.0, 1.0) * (1023.0 / 1024.0) + 0.5 / 1024.0;
    vec3 cm = vec3(texture2D(uCurve, vec2(q.r, y)).r, texture2D(uCurve, vec2(q.g, y)).r, texture2D(uCurve, vec2(q.b, y)).r);
    c = mix(c, cm, clamp(w, 0.0, 1.0));
  }

  if (uLutAmt > 0.0) c = mix(c, applyLut(c), uLutAmt);
  c = c * (1.0 - uFade * 0.15) + uFade * 0.15;

  // --- bagliore, halation, colore sovrapposto delle maschere ---
  if (uGlow > 0.0 || uHal > 0.0) {
    vec3 cl0 = toLin(clamp(c, 0.0, 1.0));
    cl0 += glowSrc * uGlow * 0.6;                                     // la luce diffusa si somma in luce lineare
    float dark = 1.0 - smoothstep(0.55, 0.9, luma(c));                // l'alone si vede sulle zone più scure attorno alle luci
    cl0 += vec3(0.9, 0.22, 0.06) * halSrc * uHal * 0.35 * dark;
    c = toSrgb(softShoulder(cl0));
  }
  if (ovlW > 0.0) c = mix(c, c * 0.6 + ovl / ovlW * 0.6 * luma(c) * 1.4, clamp(ovlW, 0.0, 1.0));

  // --- vignettatura (quantità, punto medio, rotondità, sfumatura, alteluci) ---
  if (uVigP.x != 0.0) {
    vec2 q = (v - 0.5) * 2.0;
    q.x *= mix(1.0, uOutAspect, clamp(uVigP.z, 0.0, 1.0));
    float n = uVigP.z < 0.0 ? 2.0 - uVigP.z * 4.0 : 2.0;
    float r = pow(pow(abs(q.x), n) + pow(abs(q.y), n), 1.0 / n) * 0.7071;
    float vg = smoothstep(uVigP.y, min(uVigP.y + 0.15 + uVigP.w * 0.6, 1.3), r);
    float f = exp2(-uVigP.x * vg * 1.7);                              // caduta in stop, come un obiettivo reale
    if (uVigP.x > 0.0) f = mix(f, 1.0, uVigHi * smoothstep(0.55, 1.0, luma(c)));
    c = toSrgb(softShoulder(toLin(clamp(c, 0.0, 1.0)) * f));
  }

  // --- grana (quantità, dimensione, ruvidità) ---
  // grana monocromatica, più visibile nei mezzitoni e nelle ombre, quasi nulla nei neri e bianchi puri (come la pellicola)
  if (gAmt > 0.0) {
    float lg2 = luma(clamp(c, 0.0, 1.0));
    float wg = pow(clamp(4.0 * lg2 * (1.0 - lg2), 0.0, 1.0), 0.55) * (1.15 - 0.35 * lg2);
    c += gN * gAmt * 0.12 * wg;
  }

  c = clamp(c, 0.0, 1.0);
  if (uClip > 0.5) {
    if (max(c.r, max(c.g, c.b)) > 0.998) c = vec3(1.0, 0.15, 0.15);
    else if (max(c.r, max(c.g, c.b)) < 0.004) c = vec3(0.2, 0.45, 1.0);
  }
  if (uShowMask >= 0.0) c = mix(c, uOverlay.rgb, showW * uOverlay.a);
  if (uPCShow >= 0.0) c = mix(vec3(luma(c) * 0.5), c, pcSel);
  // dithering: elimina gli scalini nei gradienti (cieli, ombre) quando il risultato torna a 8 bit
  c += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 37.1) - 1.0) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
