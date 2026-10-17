'use strict';

/* Unione HDR e panorama, con algoritmi classici (nessuna AI).
   HDR: allineamento MTB (bitmap a soglia mediana, robusto alle differenze di esposizione) + fusione delle esposizioni
        (per ogni zona pesa la versione più contrastata, satura e ben esposta; pesi sfumati per evitare aloni).
   Panorama: proiezione cilindrica, punti di Harris con descrittori a finestra normalizzata, accoppiamento tra foto vicine,
        spostamento stimato con RANSAC, compensazione dell'esposizione, giunzioni sfumate, ritaglio automatico. */

const tick = () => new Promise(r => setTimeout(r, 0));
const lum8 = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

function canvasOf(w, h) { return Object.assign(document.createElement('canvas'), { width: w, height: h }); }
function imageDataOf(src, w, h) {
  const c = canvasOf(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}
function grayOf(img) {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = lum8(img.data, i * 4);
  return g;
}

/* Sfocatura a box ripetuta (≈ gaussiana) su un campo float */
function boxBlur(a, w, h, r, passes = 3) {
  const t = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let s = 0; const o = y * w;
      for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        t[o + x] = s / (2 * r + 1);
        s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/* ---------- HDR ---------- */

/* Allineamento MTB di Ward: spostamento (in pixel di g) di b rispetto a a */
function mtbOffset(a, b, w, h) {
  const levels = Math.max(0, Math.floor(Math.log2(Math.min(w, h) / 48)));
  const pyr = g => {
    const out = [{ g, w, h }];
    for (let l = 0; l < levels; l++) {
      const p = out[out.length - 1], nw = p.w >> 1, nh = p.h >> 1, n = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const i = 2 * y * p.w + 2 * x;
        n[y * nw + x] = (p.g[i] + p.g[i + 1] + p.g[i + p.w] + p.g[i + p.w + 1]) / 4;
      }
      out.push({ g: n, w: nw, h: nh });
    }
    return out;
  };
  const bits = ({ g }) => {
    const s = Array.from(g).sort((x, y) => x - y), med = s[s.length >> 1];
    const t = new Uint8Array(g.length), e = new Uint8Array(g.length);
    for (let i = 0; i < g.length; i++) { t[i] = g[i] > med ? 1 : 0; e[i] = Math.abs(g[i] - med) > 4 ? 1 : 0; }
    return { t, e };
  };
  const pa = pyr(a), pb = pyr(b);
  let dx = 0, dy = 0;
  for (let l = levels; l >= 0; l--) {
    dx *= 2; dy *= 2;
    const A = bits(pa[l]), B = bits(pb[l]), lw = pa[l].w, lh = pa[l].h;
    let best = Infinity, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const sx = dx + ox, sy = dy + oy;
      let err = 0;
      for (let y = Math.max(0, -sy); y < Math.min(lh, lh - sy); y++) for (let x = Math.max(0, -sx); x < Math.min(lw, lw - sx); x++) {
        const i = y * lw + x, j = (y + sy) * lw + x + sx;
        if (A.e[i] & B.e[j]) err += A.t[i] ^ B.t[j];
      }
      if (err < best) { best = err; bx = sx; by = sy; }
    }
    dx = bx; dy = by;
  }
  return [dx, dy];
}

/* canvases: foto sorgente (stessa inquadratura, esposizioni diverse). Restituisce un canvas fuso. */
/* Piramidi su immagini float a più canali (dati interleaved) */
function pyrDown(a, w, h, ch) {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Float32Array(nw * nh * ch);
  const at = (x, y, c) => a[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * ch + c];
  const K = [1, 4, 6, 4, 1];
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < ch; c++) {
    let s = 0;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) s += K[j] * K[i] * at(2 * x + i - 2, 2 * y + j - 2, c);
    o[(y * nw + x) * ch + c] = s / 256;
  }
  return { a: o, w: nw, h: nh };
}
function pyrUp(a, w, h, ch, W, H) {
  const o = new Float32Array(W * H * ch);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * h / H - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * w / W - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < ch; c++)
        o[(y * W + x) * ch + c] = (a[(y0 * w + x0) * ch + c] * (1 - tx) + a[(y0 * w + x1) * ch + c] * tx) * (1 - ty)
          + (a[(y1 * w + x0) * ch + c] * (1 - tx) + a[(y1 * w + x1) * ch + c] * tx) * ty;
    }
  }
  return o;
}

/* canvases: foto sorgente (stessa inquadratura, esposizioni diverse). Restituisce un canvas fuso.
   Fusione delle esposizioni multi-scala (piramide laplaciana) a risoluzione ridotta, poi il dettaglio fine
   di ogni foto viene riaggiunto a piena risoluzione con gli stessi pesi. */
async function mergeHDR(canvases, onProgress = () => {}) {
  if (canvases.length < 2) throw new Error('Servono almeno 2 foto');
  const N = canvases.length;
  const W = Math.min(...canvases.map(c => c.width)), H = Math.min(...canvases.map(c => c.height));
  const ar = W / H;
  if (canvases.some(c => Math.abs(c.width / c.height - ar) > 0.02)) throw new Error('Le foto hanno proporzioni diverse: servono scatti della stessa inquadratura');
  // allineamento su anteprime
  const k = Math.min(1, 1024 / Math.max(W, H)), aw = Math.round(W * k), ah = Math.round(H * k);
  const grays = canvases.map(c => grayOf(imageDataOf(c, aw, ah)));
  const means = grays.map(g => g.reduce((s, v) => s + v, 0) / g.length);
  const ref = means.map((m, i) => [m, i]).sort((a, b) => a[0] - b[0])[N >> 1][1];   // esposizione centrale
  onProgress(0.05, 'Allineamento');
  const offs = [];
  for (let i = 0; i < N; i++) {
    const o = i === ref ? [0, 0] : mtbOffset(grays[ref], grays[i], aw, ah);
    offs.push([Math.round(o[0] / k), Math.round(o[1] / k)]);
    await tick();
  }
  const x0 = Math.max(0, ...offs.map(o => -o[0])), y0 = Math.max(0, ...offs.map(o => -o[1]));
  const x1 = Math.min(W, ...offs.map(o => W - o[0])), y1 = Math.min(H, ...offs.map(o => H - o[1]));
  const OW = x1 - x0, OH = y1 - y0;
  if (OW < W * 0.7 || OH < H * 0.7) throw new Error('Le foto sono troppo spostate tra loro per essere unite');
  // sorgenti allineate e ritagliate sulla zona comune
  const aligned = canvases.map((c, n) => {
    const t = canvasOf(OW, OH), ctx = t.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(c, (x0 + offs[n][0]) * c.width / W, (y0 + offs[n][1]) * c.height / H, OW * c.width / W, OH * c.height / H, 0, 0, OW, OH);
    return ctx;
  });
  // livello di lavoro per la piramide
  onProgress(0.15, 'Pesi');
  const ks = Math.min(1, 1536 / Math.max(OW, OH)), lw = Math.max(8, Math.round(OW * ks)), lh = Math.max(8, Math.round(OH * ks));
  const L = [], Wt = [];
  for (const ctx of aligned) {
    const d = imageDataOf(ctx.canvas, lw, lh).data, img = new Float32Array(lw * lh * 3), wt = new Float32Array(lw * lh);
    for (let i = 0; i < lw * lh; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = d[i * 4 + c] / 255;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const i = y * lw + x, r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2], m = (r + g + b) / 3;
      const lum = j => 0.2126 * img[j * 3] + 0.7152 * img[j * 3 + 1] + 0.0722 * img[j * 3 + 2];
      const xm = Math.max(0, x - 1), xp = Math.min(lw - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(lh - 1, y + 1);
      const lap = Math.abs(4 * lum(i) - lum(y * lw + xm) - lum(y * lw + xp) - lum(ym * lw + x) - lum(yp * lw + x));
      const sat = Math.sqrt(((r - m) ** 2 + (g - m) ** 2 + (b - m) ** 2) / 3);
      const we = Math.exp(-((r - 0.5) ** 2 + (g - 0.5) ** 2 + (b - 0.5) ** 2) / (2 * 0.2 * 0.2));
      wt[i] = (lap + 0.01) * (sat + 0.03) * we + 1e-12;
    }
    L.push(img); Wt.push(wt);
    await tick();
  }
  for (let i = 0; i < lw * lh; i++) { let s = 0; for (const w of Wt) s += w[i]; for (const w of Wt) w[i] /= s; }
  // piramide laplaciana delle immagini, gaussiana dei pesi, fusione livello per livello
  onProgress(0.3, 'Fusione multi-scala');
  const levels = Math.max(1, Math.floor(Math.log2(Math.min(lw, lh) / 8)));
  let fused = null;
  for (let n = 0; n < N; n++) {
    let gI = { a: L[n], w: lw, h: lh }, gW = { a: Wt[n], w: lw, h: lh };
    const lapI = [], gWs = [];
    for (let l = 0; l < levels; l++) {
      const dI = pyrDown(gI.a, gI.w, gI.h, 3), up = pyrUp(dI.a, dI.w, dI.h, 3, gI.w, gI.h);
      const lp = new Float32Array(gI.a.length); for (let i = 0; i < lp.length; i++) lp[i] = gI.a[i] - up[i];
      lapI.push({ a: lp, w: gI.w, h: gI.h }); gWs.push(gW);
      gI = dI; gW = pyrDown(gW.a, gW.w, gW.h, 1);
    }
    lapI.push(gI); gWs.push(gW);
    if (!fused) fused = lapI.map(x => ({ a: new Float32Array(x.a.length), w: x.w, h: x.h }));
    for (let l = 0; l <= levels; l++) {
      const F = fused[l].a, P = lapI[l].a, G = gWs[l].a;
      for (let i = 0; i < G.length; i++) { const w = G[i]; F[i * 3] += P[i * 3] * w; F[i * 3 + 1] += P[i * 3 + 1] * w; F[i * 3 + 2] += P[i * 3 + 2] * w; }
    }
    await tick();
  }
  let res = fused[levels];
  for (let l = levels - 1; l >= 0; l--) {
    const up = pyrUp(res.a, res.w, res.h, 3, fused[l].w, fused[l].h), F = fused[l].a;
    for (let i = 0; i < up.length; i++) up[i] += F[i];
    res = { a: up, w: fused[l].w, h: fused[l].h };
  }
  const base = res.a;
  // piena risoluzione: risultato della piramide + dettaglio fine di ogni foto pesato
  const out = canvasOf(OW, OH), octx = out.getContext('2d');
  const STRIP = 128;
  for (let ys = 0; ys < OH; ys += STRIP) {
    const sh = Math.min(STRIP, OH - ys);
    const strips = aligned.map(ctx => ctx.getImageData(0, ys, OW, sh).data);
    const im = octx.createImageData(OW, sh), rd = im.data;
    for (let y = 0; y < sh; y++) {
      const fy = Math.min(lh - 1, Math.max(0, (ys + y + 0.5) * lh / OH - 0.5)), iy = Math.floor(fy), iy1 = Math.min(lh - 1, iy + 1), ty = fy - iy;
      for (let x = 0; x < OW; x++) {
        const fx = Math.min(lw - 1, Math.max(0, (x + 0.5) * lw / OW - 0.5)), ix = Math.floor(fx), ix1 = Math.min(lw - 1, ix + 1), tx = fx - ix;
        const a = iy * lw + ix, b = iy * lw + ix1, c2 = iy1 * lw + ix, d2 = iy1 * lw + ix1;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const j = (y * OW + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          let v = base[a * 3 + ch] * w00 + base[b * 3 + ch] * w10 + base[c2 * 3 + ch] * w01 + base[d2 * 3 + ch] * w11;
          if (ks < 1) for (let n = 0; n < N; n++) {               // dettaglio sotto la risoluzione della piramide
            const Ln = L[n], Wn = Wt[n];
            const lowv = Ln[a * 3 + ch] * w00 + Ln[b * 3 + ch] * w10 + Ln[c2 * 3 + ch] * w01 + Ln[d2 * 3 + ch] * w11;
            const wn = Wn[a] * w00 + Wn[b] * w10 + Wn[c2] * w01 + Wn[d2] * w11;
            v += (strips[n][j + ch] / 255 - lowv) * wn;
          }
          rd[j + ch] = Math.max(0, Math.min(255, v * 255 + 0.5));
        }
        rd[j + 3] = 255;
      }
    }
    octx.putImageData(im, 0, ys);
    onProgress(0.6 + 0.4 * (ys + sh) / OH, 'Dettaglio');
    await tick();
  }
  return out;
}

/* ---------- Panorama ---------- */

/* Proiezione cilindrica: dimensioni del risultato per un'immagine w×h con focale f (pixel) */
const cylSize = (w, h, f) => [Math.round(2 * f * Math.atan(w / (2 * f))), h];

/* Proietta img (ImageData) sul cilindro */
function cylWarp(img, f) {
  const { width: w, height: h, data: d } = img, [cw, ch] = cylSize(w, h, f);
  const out = new ImageData(cw, ch), o = out.data;
  for (let x = 0; x < cw; x++) {
    const th = (x - cw / 2) / f, xs = f * Math.tan(th) + w / 2, ic = 1 / Math.cos(th);
    if (xs < 0 || xs > w - 1) continue;
    const x0 = Math.floor(xs), tx = xs - x0, x1 = Math.min(w - 1, x0 + 1);
    for (let y = 0; y < ch; y++) {
      const ys = (y - ch / 2) * ic + h / 2;
      if (ys < 0 || ys > h - 1) continue;
      const y0 = Math.floor(ys), ty = ys - y0, y1 = Math.min(h - 1, y0 + 1), j = (y * cw + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[j + c] = (d[(y0 * w + x0) * 4 + c] * (1 - tx) + d[(y0 * w + x1) * 4 + c] * tx) * (1 - ty)
                 + (d[(y1 * w + x0) * 4 + c] * (1 - tx) + d[(y1 * w + x1) * 4 + c] * tx) * ty;
      }
      o[j + 3] = 255;
    }
  }
  return out;
}

/* Punti di Harris + descrittore 9×9 normalizzato */
function features(img, max = 600) {
  const { width: w, height: h } = img, g = boxBlur(grayOf(img), w, h, 1, 1), alpha = img.data;
  const ixx = new Float32Array(w * h), iyy = new Float32Array(w * h), ixy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
    ixx[i] = gx * gx; iyy[i] = gy * gy; ixy[i] = gx * gy;
  }
  boxBlur(ixx, w, h, 2, 1); boxBlur(iyy, w, h, 2, 1); boxBlur(ixy, w, h, 2, 1);
  const R = new Float32Array(w * h), M = 10;
  for (let y = M; y < h - M; y++) for (let x = M; x < w - M; x++) {
    const i = y * w + x;
    if (alpha[i * 4 + 3] === 0 || alpha[(i - 8 * w) * 4 + 3] === 0 || alpha[(i + 8 * w) * 4 + 3] === 0 || alpha[(i - 8) * 4 + 3] === 0 || alpha[(i + 8) * 4 + 3] === 0) continue;
    R[i] = ixx[i] * iyy[i] - ixy[i] * ixy[i] - 0.05 * (ixx[i] + iyy[i]) ** 2;
  }
  const pts = [];
  for (let y = M; y < h - M; y += 1) for (let x = M; x < w - M; x += 1) {
    const i = y * w + x, v = R[i]; if (v <= 1e3) continue;
    let ok = true;
    for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if (R[i + dy * w + dx] > v) { ok = false; break; }
    if (ok) pts.push({ x, y, v });
  }
  pts.sort((a, b) => b.v - a.v);
  return pts.slice(0, max).map(p => {
    const desc = new Float32Array(81); let m = 0, s = 0, k = 0;
    for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const v = g[(p.y + dy) * w + p.x + dx]; desc[k++] = v; m += v; }
    m /= 81; for (let i = 0; i < 81; i++) { desc[i] -= m; s += desc[i] ** 2; }
    s = Math.sqrt(s) || 1; for (let i = 0; i < 81; i++) desc[i] /= s;
    return { x: p.x, y: p.y, desc };
  });
}

/* Spostamento di b rispetto a a (coordinate cilindriche) con RANSAC su traslazione */
function matchShift(fa, fb) {
  const matches = [];
  for (const p of fa) {
    let b1 = -2, b2 = -2, bi = null;
    for (const q of fb) {
      let d = 0; for (let i = 0; i < 81; i++) d += p.desc[i] * q.desc[i];
      if (d > b1) { b2 = b1; b1 = d; bi = q; } else if (d > b2) b2 = d;
    }
    if (bi && b1 > 0.8 && b1 - b2 > 0.03) matches.push([p.x - bi.x, p.y - bi.y]);
  }
  if (matches.length < 6) return null;
  let best = null, bestN = 0;
  for (const m of matches) {
    const inl = matches.filter(q => Math.abs(q[0] - m[0]) < 3 && Math.abs(q[1] - m[1]) < 3);
    if (inl.length > bestN) { bestN = inl.length; best = inl; }
  }
  if (bestN < 6) return null;
  return { dx: best.reduce((s, q) => s + q[0], 0) / bestN, dy: best.reduce((s, q) => s + q[1], 0) / bestN, inliers: bestN };
}

/* canvases in ordine di scatto; focal35 = focale equivalente 35 mm (se nota). Restituisce un canvas. */
async function mergePanorama(canvases, { focal35 = 26, crop = true, onProgress = () => {} } = {}) {
  if (canvases.length < 2) throw new Error('Servono almeno 2 foto');
  // analisi a bassa risoluzione
  const LS = 800;
  const lows = canvases.map(c => { const k = Math.min(1, LS / Math.max(c.width, c.height)); return { k, img: imageDataOf(c, Math.round(c.width * k), Math.round(c.height * k)) }; });
  const fLow = lows.map((l, i) => Math.max(l.img.width, l.img.height) * focal35 / 36);
  onProgress(0.05, 'Punti caratteristici');
  const warpedLow = lows.map((l, i) => cylWarp(l.img, fLow[i]));
  const feats = [];
  for (const wl of warpedLow) { feats.push(features(wl)); await tick(); }
  // posizioni relative tra foto consecutive
  onProgress(0.25, 'Accoppiamento');
  const pos = [[0, 0]];
  for (let i = 1; i < canvases.length; i++) {
    const s = matchShift(feats[i - 1], feats[i]);
    if (!s) throw new Error(`Non trovo abbastanza punti in comune tra la foto ${i} e la ${i + 1}: servono sovrapposizioni di circa un terzo`);
    pos.push([pos[i - 1][0] + s.dx, pos[i - 1][1] + s.dy]);
    await tick();
  }
  // esposizione: guadagno relativo dalle zone sovrapposte
  const gains = [1];
  for (let i = 1; i < canvases.length; i++) {
    const a = warpedLow[i - 1], b = warpedLow[i], [ox, oy] = [pos[i][0] - pos[i - 1][0], pos[i][1] - pos[i - 1][1]];
    let sa = 0, sb = 0, n = 0;
    for (let y = 0; y < b.height; y += 3) for (let x = 0; x < b.width; x += 3) {
      const ax = Math.round(x + ox), ay = Math.round(y + oy);
      if (ax < 0 || ay < 0 || ax >= a.width || ay >= a.height) continue;
      const ia = (ay * a.width + ax) * 4, ib = (y * b.width + x) * 4;
      if (!a.data[ia + 3] || !b.data[ib + 3]) continue;
      sa += lum8(a.data, ia); sb += lum8(b.data, ib); n++;
    }
    gains.push(gains[i - 1] * (n && sb ? Math.min(2, Math.max(0.5, sa / sb)) : 1));
  }
  const gm = Math.exp(gains.reduce((s, g) => s + Math.log(g), 0) / gains.length);
  for (let i = 0; i < gains.length; i++) gains[i] /= gm;
  // scala finale (limite memoria): lato lungo ≤ 8192 e ≤ 32 MP
  const lowSizes = warpedLow.map(w => [w.width, w.height]);
  const minX = Math.min(...pos.map(p => p[0])), minY = Math.min(...pos.map(p => p[1]));
  const maxX = Math.max(...pos.map((p, i) => p[0] + lowSizes[i][0])), maxY = Math.max(...pos.map((p, i) => p[1] + lowSizes[i][1]));
  const fullK = Math.min(...lows.map(l => 1 / l.k));                     // scala piena rispetto all'analisi
  let S = Math.min(fullK, Math.min(8192, CANVAS_MAX_SIDE) / Math.max(maxX - minX, maxY - minY), Math.sqrt(Math.min(32e6, CANVAS_MAX_AREA * 0.95) / ((maxX - minX) * (maxY - minY))));
  const OW = Math.round((maxX - minX) * S), OH = Math.round((maxY - minY) * S);
  const out = canvasOf(OW, OH), octx = out.getContext('2d', { willReadFrequently: true });
  const fin = octx.createImageData(OW, OH), fd = fin.data;
  // ordine da sinistra a destra per le giunzioni
  const order = pos.map((p, i) => i).sort((a, b) => pos[a][0] - pos[b][0]);
  let prevRight = -Infinity;
  for (const [n, i] of order.entries()) {
    onProgress(0.35 + 0.6 * n / order.length, `Unione ${n + 1}/${order.length}`);
    await tick();
    const c = canvases[i], k = lows[i].k * S;                             // scala della sorgente per il risultato
    const sw = Math.round(c.width * k), sh = Math.round(c.height * k), f = fLow[i] * S;
    const warped = cylWarp(imageDataOf(c, sw, sh), f), wd = warped.data;
    const ox = Math.round((pos[i][0] - minX) * S), oy = Math.round((pos[i][1] - minY) * S), g = gains[i];
    const left = ox, right = prevRight;
    for (let y = 0; y < warped.height; y++) {
      const Y = y + oy; if (Y < 0 || Y >= OH) continue;
      for (let x = 0; x < warped.width; x++) {
        const s = (y * warped.width + x) * 4; if (!wd[s + 3]) continue;
        const X = x + ox; if (X < 0 || X >= OW) continue;
        const t = (Y * OW + X) * 4;
        let a = 1;
        if (fd[t + 3] && right > left) a = Math.min(1, Math.max(0, (X - left) / (right - left)));
        fd[t] = fd[t] * (1 - a) + Math.min(255, wd[s] * g) * a;
        fd[t + 1] = fd[t + 1] * (1 - a) + Math.min(255, wd[s + 1] * g) * a;
        fd[t + 2] = fd[t + 2] * (1 - a) + Math.min(255, wd[s + 2] * g) * a;
        fd[t + 3] = 255;
      }
    }
    prevRight = Math.max(prevRight, ox + warped.width);
  }
  octx.putImageData(fin, 0, 0);
  if (!crop) return out;
  // ritaglio automatico: rettangolo interamente coperto
  onProgress(0.97, 'Ritaglio');
  const tops = new Int32Array(OW).fill(OH), bots = new Int32Array(OW).fill(-1);
  for (let x = 0; x < OW; x++) {
    for (let y = 0; y < OH; y++) if (fd[(y * OW + x) * 4 + 3]) { tops[x] = y; break; }
    for (let y = OH - 1; y >= 0; y--) if (fd[(y * OW + x) * 4 + 3]) { bots[x] = y; break; }
  }
  let best = null;
  for (const frac of [0.98, 0.95, 0.9, 0.85, 0.8, 0.7]) {      // larghezza utile decrescente finché l'altezza è ragionevole
    const cols = [...Array(OW).keys()].filter(x => bots[x] - tops[x] > OH * 0.5);
    if (!cols.length) break;
    const xL = cols[Math.floor(cols.length * (1 - frac) / 2)], xR = cols[Math.ceil(cols.length * (1 + frac) / 2) - 1];
    let yT = 0, yB = OH - 1;
    for (let x = xL; x <= xR; x++) { yT = Math.max(yT, tops[x]); yB = Math.min(yB, bots[x]); }
    if (yB - yT > OH * 0.55) { best = [xL, yT, xR - xL + 1, yB - yT + 1]; break; }
  }
  if (!best) return out;
  const cropped = canvasOf(best[2], best[3]);
  cropped.getContext('2d').drawImage(out, best[0], best[1], best[2], best[3], 0, 0, best[2], best[3]);
  onProgress(1, 'Fatto');
  return cropped;
}
