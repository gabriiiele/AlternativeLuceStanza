'use strict';

/* Esportazione: formati, dimensioni, risoluzione (DPI), nitidezza di output, filigrana, metadati EXIF,
   formati per i social (con ritaglio intelligente, bordi o sfondo sfocato), scritte, prima/dopo e collage. */

const exportOpts = {
  fmt: 'image/jpeg', quality: 0.92,
  sizeMode: 'orig', sizeVal: 2048,          // orig | long | short | w | h | pct
  dpi: 300,
  outSharp: 'none', outSharpType: 'screen', // none|low|std|high ; screen|matte|glossy
  wm: 'none', wmText: '© ', wmSize: 4, wmOpacity: 0.6, wmColor: '#ffffff', wmPos: 'br', wmMargin: 3, wmImage: null,
  meta: 'all',                              // all | nogps | copyright | none
  copyright: '', name: '{nome}-modificata',
  target: '', fit: 'crop', padColor: '#ffffff', // formato social: ritaglia | bordi | sfondo sfocato
};

/* Formati dei social (dimensioni consigliate). w×h = dimensione esatta; long = lato lungo, proporzioni libere.
   rotate: segue l'orientamento della foto. JPEG sRGB: i social ricomprimono tutto ciò che è più grande. */
const SOCIAL = [
  { id: 'ig45', group: 'Instagram', name: 'Post verticale 4:5', w: 1080, h: 1350 },
  { id: 'ig34', group: 'Instagram', name: 'Post 3:4 (griglia del profilo)', w: 1080, h: 1440 },
  { id: 'ig11', group: 'Instagram', name: 'Post quadrato', w: 1080, h: 1080 },
  { id: 'igl', group: 'Instagram', name: 'Post orizzontale', w: 1080, h: 566 },
  { id: 'igs', group: 'Instagram', name: 'Storie e Reel 9:16', w: 1080, h: 1920 },
  { id: 'tt', group: 'TikTok', name: 'Foto e copertina 9:16', w: 1080, h: 1920 },
  { id: 'fb', group: 'Facebook', name: 'Post (proporzioni della foto)', long: 2048 },
  { id: 'fb45', group: 'Facebook', name: 'Post verticale 4:5', w: 1080, h: 1350 },
  { id: 'fbs', group: 'Facebook', name: 'Storie 9:16', w: 1080, h: 1920 },
  { id: 'fbc', group: 'Facebook', name: 'Copertina pagina', w: 1640, h: 624 },
  { id: 'pin', group: 'Pinterest', name: 'Pin 2:3', w: 1000, h: 1500 },
  { id: 'x', group: 'X / Threads', name: 'Post 16:9', w: 1600, h: 900 },
  { id: 'li', group: 'LinkedIn', name: 'Post orizzontale', w: 1200, h: 627 },
  { id: 'li45', group: 'LinkedIn', name: 'Post verticale 4:5', w: 1080, h: 1350 },
  { id: 'yt', group: 'YouTube', name: 'Miniatura 16:9', w: 1280, h: 720 },
  { id: 'wa', group: 'WhatsApp', name: 'Foto e stato (lato lungo 1600)', long: 1600 },
  { id: 'web', group: 'Web', name: 'Sito o portfolio (lato lungo 2048)', long: 2048, quality: 0.85 },
  { id: 'a4', group: 'Stampa', name: 'A4 a 300 DPI', w: 2480, h: 3508, rotate: true, dpi: 300, quality: 0.95 },
  { id: 'a3', group: 'Stampa', name: 'A3 a 300 DPI', w: 3508, h: 4961, rotate: true, dpi: 300, quality: 0.95 },
  { id: '10x15', group: 'Stampa', name: 'Foto 10×15 cm a 300 DPI', w: 1200, h: 1800, rotate: true, dpi: 300, quality: 0.95 },
];
const socialTarget = o => SOCIAL.find(t => t.id === o.target) || null;
/* Dimensione finale di un formato per una foto fw × fh */
function socialSize(t, fw, fh) {
  if (t.long) { const k = Math.min(1, t.long / Math.max(fw, fh)); return [Math.round(fw * k), Math.round(fh * k)]; }
  let W = t.w, H = t.h;
  if (t.rotate && (fw > fh) !== (W > H)) [W, H] = [H, W];
  const k = Math.min(1, CANVAS_MAX_SIDE / Math.max(W, H), Math.sqrt(CANVAS_MAX_AREA / (W * H)));
  return [Math.round(W * k), Math.round(H * k)];
}

const supportsAvif = (() => {
  try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/avif').startsWith('data:image/avif'); }
  catch { return false; }
})();

/* ---------- EXIF: lettura essenziale e modifica ---------- */

/* Restituisce { app1: Uint8Array (segmento completo) | null, tags: {...} } */
function readExif(buf) {
  const b = new Uint8Array(buf), out = { app1: null, tags: {} };
  if (b[0] !== 0xFF || b[1] !== 0xD8) return out;
  let p = 2;
  while (p < b.length - 4) {
    if (b[p] !== 0xFF) break;
    const mk = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
    if (mk === 0xE1 && String.fromCharCode(...b.slice(p + 4, p + 8)) === 'Exif') {
      out.app1 = b.slice(p, p + 2 + len);
      try { out.tags = parseTiff(out.app1, 10); } catch { /* EXIF danneggiato */ }
      break;
    }
    if (mk === 0xDA) break;
    p += 2 + len;
  }
  return out;
}

function tiffView(seg, base) {
  const dv = new DataView(seg.buffer, seg.byteOffset);
  const le = seg[base] === 0x49;
  return { dv, le, u16: o => dv.getUint16(base + o, le), u32: o => dv.getUint32(base + o, le) };
}

function parseTiff(seg, base) {
  const t = tiffView(seg, base), tags = {};
  const NAMES = { 0x010F: 'make', 0x0110: 'model', 0x0112: 'orientation', 0x0132: 'date', 0x8298: 'copyright',
    0x829A: 'exposure', 0x829D: 'fnumber', 0x8827: 'iso', 0x9003: 'dateOriginal', 0x920A: 'focal', 0xA405: 'focal35', 0xA434: 'lens' };
  const readIfd = (off, depth) => {
    const n = t.u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12, tag = t.u16(e), type = t.u16(e + 2), cnt = t.u32(e + 4);
      const valOff = (type === 2 && cnt > 4) || (type === 5 || type === 10) || (type === 3 && cnt > 2) ? t.u32(e + 8) : e + 8;
      if ((tag === 0x8769 || tag === 0x8825) && depth < 2) { readIfd(t.u32(e + 8), depth + 1); continue; }
      const name = NAMES[tag]; if (!name) continue;
      if (type === 2) tags[name] = String.fromCharCode(...seg.slice(base + valOff, base + valOff + cnt - 1)).trim();
      else if (type === 3) tags[name] = t.u16(valOff);
      else if (type === 4) tags[name] = t.u32(valOff);
      else if (type === 5 || type === 10) { const d = t.u32(valOff + 4); tags[name] = d ? t.u32(valOff) / d : 0; }
    }
  };
  readIfd(t.u32(4), 0);
  return tags;
}

/* Copia del segmento EXIF con orientamento = 1 ed eventualmente senza GPS */
function editExif(app1, removeGps) {
  const seg = app1.slice(), base = 10, t = tiffView(seg, base);
  const off0 = t.u32(4), n = t.u16(off0);
  for (let i = 0; i < n; i++) {
    const e = off0 + 2 + i * 12, tag = t.u16(e);
    if (tag === 0x0112) t.dv.setUint16(base + e + 8, 1, t.le);
    if (tag === 0x8825 && removeGps) t.dv.setUint16(base + t.u32(e + 8), 0, t.le);
  }
  return seg;
}

/* Segmento EXIF minimo con solo il copyright */
function copyrightExif(text) {
  const str = new TextEncoder().encode(text + '\0'), n = 1;
  const tiff = new Uint8Array(8 + 2 + n * 12 + 4 + str.length), dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2A, 0x00]); dv.setUint32(4, 8, true);
  dv.setUint16(8, n, true);
  dv.setUint16(10, 0x8298, true); dv.setUint16(12, 2, true); dv.setUint32(14, str.length, true);
  dv.setUint32(18, 8 + 2 + 12 + 4, true);
  dv.setUint32(22, 0, true);
  tiff.set(str, 26);
  const len = 2 + 6 + tiff.length, seg = new Uint8Array(2 + len);
  seg.set([0xFF, 0xE1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]); seg.set(tiff, 10);
  return seg;
}

/* Inserisce EXIF e DPI in un JPEG generato dal browser */
function patchJpeg(bytes, app1, dpi) {
  let b = bytes;
  // JFIF APP0: unità = pollici, densità = dpi
  if (b[2] === 0xFF && b[3] === 0xE0 && String.fromCharCode(...b.slice(6, 10)) === 'JFIF') {
    b = b.slice(); b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  }
  if (!app1) return b;
  const at = b[2] === 0xFF && b[3] === 0xE0 ? 4 + ((b[4] << 8) | b[5]) : 2;
  const out = new Uint8Array(b.length + app1.length);
  out.set(b.slice(0, at)); out.set(app1, at); out.set(b.slice(at), at + app1.length);
  return out;
}

/* ---------- PNG: blocco pHYs per i DPI ---------- */

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function patchPng(bytes, dpi) {
  const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.slice(4, 17)));
  const at = 8 + 25;   // firma + blocco IHDR
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.slice(0, at)); out.set(chunk, at); out.set(bytes.slice(at), at + 21);
  return out;
}

/* ---------- TIFF non compresso RGB 8 bit ---------- */

function encodeTiff(img, dpi) {
  const { width: w, height: h, data } = img, n = 11, ifdOff = 8, dataOff = ifdOff + 2 + n * 12 + 4;
  const extra = 6 + 16, pixOff = dataOff + extra, size = w * h * 3;
  const out = new Uint8Array(pixOff + size), dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 0x2A, 0x00]); dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, n, true);
  const bpsOff = dataOff, resOff = dataOff + 6;
  const entries = [[256, 4, 1, w], [257, 4, 1, h], [258, 3, 3, bpsOff], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, pixOff],
    [277, 3, 1, 3], [278, 4, 1, h], [279, 4, 1, size], [282, 5, 1, resOff], [283, 5, 1, resOff + 8]];
  entries.forEach(([tag, type, cnt, val], i) => {
    const e = ifdOff + 2 + i * 12;
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, cnt, true);
    if (type === 3 && cnt === 1) dv.setUint16(e + 8, val, true); else dv.setUint32(e + 8, val, true);
  });
  dv.setUint32(ifdOff + 2 + n * 12, 0, true);
  for (let k = 0; k < 3; k++) dv.setUint16(bpsOff + k * 2, 8, true);
  dv.setUint32(resOff, dpi, true); dv.setUint32(resOff + 4, 1, true); dv.setUint32(resOff + 8, dpi, true); dv.setUint32(resOff + 12, 1, true);
  // la risoluzione è in pollici (valore predefinito del tag 296)
  for (let i = 0, j = pixOff; i < data.length; i += 4, j += 3) { out[j] = data[i]; out[j + 1] = data[i + 1]; out[j + 2] = data[i + 2]; }
  return out;
}

/* ---------- Nitidezza di output e filigrana ---------- */

function outputSharpen(img, level, type) {
  const k = { low: 0.35, std: 0.7, high: 1.1 }[level]; if (!k) return;
  const r = type === 'matte' ? 2 : 1, amt = type === 'glossy' ? k * 0.8 : k;
  const { width: w, height: h, data: d } = img, src = new Uint8ClampedArray(d), tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {          // sfocatura orizzontale
    for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let dx = -r; dx <= r; dx++) { const xx = Math.min(w - 1, Math.max(0, x + dx)); s += src[(y * w + xx) * 4 + c]; n++; }
      tmp[(y * w + x) * 3 + c] = s / n;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {          // verticale + maschera di contrasto
    for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); s += tmp[(yy * w + x) * 3 + c]; n++; }
      const i = (y * w + x) * 4 + c;
      d[i] = src[i] + (src[i] - s / n) * amt;
    }
  }
}

function drawWatermark(ctx, w, h, o) {
  if (o.wm === 'none') return;
  const m = Math.min(w, h) * o.wmMargin / 100;
  const pos = o.wmPos, ax = pos.includes('l') ? 0 : pos.includes('r') ? 1 : 0.5, ay = pos.includes('t') ? 0 : pos.includes('b') ? 1 : 0.5;
  ctx.save(); ctx.globalAlpha = o.wmOpacity;
  if (o.wm === 'text' && o.wmText) {
    const fs = Math.max(8, w * o.wmSize / 100);
    ctx.font = `${fs}px system-ui, sans-serif`; ctx.fillStyle = o.wmColor;
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = fs * 0.15;
    const tw = ctx.measureText(o.wmText).width;
    ctx.textBaseline = 'top';
    ctx.fillText(o.wmText, m + (w - 2 * m - tw) * ax, m + (h - 2 * m - fs) * ay);
  } else if (o.wm === 'image' && o.wmImage) {
    const iw = w * o.wmSize * 4 / 100, ih = iw * o.wmImage.height / o.wmImage.width;
    ctx.drawImage(o.wmImage, m + (w - 2 * m - iw) * ax, m + (h - 2 * m - ih) * ay, iw, ih);
  }
  ctx.restore();
}

/* ---------- Scritte sulla foto ----------
   Ogni scritta: testo (anche su più righe), carattere, dimensione (rispetto al lato corto), colore, posizione del centro
   (0..1 sulla foto finita), allineamento, maiuscolo, spaziatura, ombra, riquadro di sfondo, opacità. */
const TEXT_FONTS = {
  moderno: ['"LS Montserrat", system-ui, sans-serif', 'Moderno'],
  elegante: ['"LS Playfair", Georgia, "Times New Roman", serif', 'Elegante'],
  titolo: ['"LS Bebas", Impact, "Arial Narrow", sans-serif', 'Titolo'],
  firma: ['"LS Vibes", "Brush Script MT", cursive', 'Firma'],
  classico: ['"LS Cormorant", Georgia, serif', 'Classico'],
};
const newText = (o = {}) => ({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), text: 'Testo', font: 'moderno', bold: 0, italic: 0,
  size: 0.06, color: '#ffffff', x: 0.5, y: 0.85, align: 'center', upper: 0, spacing: 0, shadow: 0.4, box: 0, boxColor: '#000000', boxOpacity: 0.45, opacity: 1, ...o });
let fontsReady = null;
function loadTextFonts() {
  if (!document.fonts) return Promise.resolve();
  return (fontsReady ||= Promise.all(['400 20px "LS Montserrat"', '600 20px "LS Montserrat"', '400 20px "LS Playfair"', '700 20px "LS Playfair"',
    'italic 400 20px "LS Playfair"', '400 20px "LS Bebas"', '400 20px "LS Vibes"', '400 20px "LS Cormorant"', '600 20px "LS Cormorant"']
    .map(f => document.fonts.load(f).catch(() => null))));
}

/* Disegna le scritte su un'area w × h (con origine ox, oy); restituisce i riquadri occupati (per selezionarle e spostarle) */
function drawTexts(ctx, w, h, texts, ox = 0, oy = 0) {
  const boxes = [];
  for (const t of texts || []) {
    if (!t.text) continue;
    const fs = Math.max(4, t.size * Math.min(w, h));
    const weight = t.bold ? (t.font === 'moderno' || t.font === 'classico' ? 600 : 700) : 400;
    ctx.save();
    ctx.font = `${t.italic ? 'italic ' : ''}${weight} ${fs}px ${(TEXT_FONTS[t.font] || TEXT_FONTS.moderno)[0]}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (t.spacing * fs) + 'px';
    const lines = (t.upper ? t.text.toUpperCase() : t.text).split('\n'), lh = fs * 1.18;
    const widths = lines.map(l => ctx.measureText(l).width), tw = Math.max(...widths), th = lh * lines.length;
    const cx = ox + t.x * w, cy = oy + t.y * h;
    const pad = fs * 0.45, bx = cx - tw / 2 - pad, by = cy - th / 2 - pad * 0.7, bw = tw + pad * 2, bh = th + pad * 1.4;
    ctx.globalAlpha = t.opacity;
    if (t.box) {
      ctx.save(); ctx.globalAlpha = t.opacity * t.boxOpacity; ctx.fillStyle = t.boxColor;
      const r = Math.min(bh / 2, fs * 0.25);
      ctx.beginPath(); ctx.moveTo(bx + r, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, r); ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r); ctx.arcTo(bx, by, bx + bw, by, r); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (t.shadow > 0 && !t.box) { ctx.shadowColor = `rgba(0,0,0,${0.25 + t.shadow * 0.45})`; ctx.shadowBlur = fs * 0.12 * (0.5 + t.shadow); ctx.shadowOffsetY = fs * 0.03; }
    ctx.fillStyle = t.color; ctx.textBaseline = 'middle';
    ctx.textAlign = t.align === 'left' ? 'left' : t.align === 'right' ? 'right' : 'center';
    const ax = t.align === 'left' ? cx - tw / 2 : t.align === 'right' ? cx + tw / 2 : cx;
    lines.forEach((l, i) => ctx.fillText(l, ax, cy - th / 2 + lh * (i + 0.5)));
    ctx.restore();
    boxes.push({ id: t.id, x: bx, y: by, w: bw, h: bh });
  }
  return boxes;
}

/* ---------- Esportazione ---------- */

function exportSize(w, h, o) {
  let k = 1;
  const v = Math.max(1, +o.sizeVal || 1);
  if (o.sizeMode === 'long') k = v / Math.max(w, h);
  else if (o.sizeMode === 'short') k = v / Math.min(w, h);
  else if (o.sizeMode === 'w') k = v / w;
  else if (o.sizeMode === 'h') k = v / h;
  else if (o.sizeMode === 'pct') k = v / 100;
  k = Math.min(k, CANVAS_MAX_SIDE / Math.max(w, h), Math.sqrt(CANVAS_MAX_AREA / (w * h)));   // limite dei canvas del browser
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

function fileNameFor(o, ext) {
  const d = new Date(), pad = x => String(x).padStart(2, '0');
  exportCounter++;
  return o.name
    .replace('{nome}', fileName).replace('{data}', `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`)
    .replace('{ora}', `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`)
    .replace('{n}', String(exportCounter).padStart(3, '0'))
    .replace(/[\\/:*?"<>|]/g, '_') + '.' + ext;
}
let exportCounter = 0;

/* Foto finita (regolazioni + scritte) a w × h */
function renderFinal(p, w, h) {
  const b = brushCanvases();
  const canvas = engine.renderToCanvas(effectiveParams(p), w, h, { brushes: b.list, brushVer: b.ver });
  if (p.texts?.length) drawTexts(canvas.getContext('2d'), w, h, p.texts);
  return canvas;
}

/* Inserisce la foto (fw × fh) in un formato W × H: ritaglio attorno al soggetto, bordi colorati o sfondo sfocato */
function composeFrame(p, fw, fh, W, H, fit, padColor, id) {
  const out = canvasOf(W, H), ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const lim = (w, h) => Math.min(1, CANVAS_MAX_SIDE / Math.max(w, h), Math.sqrt(CANVAS_MAX_AREA / (w * h)));
  if (fit === 'crop') {
    // riquadro scelto dall'utente per questo formato (o centrato sul viso)
    const r = id && typeof frameRect === 'function' ? frameRect(p, id) : null;
    let x0, y0, cw, ch;
    if (r && r.fit === 'crop') ({ x0, y0, cw, ch } = r);
    else { const s0 = Math.max(W / fw, H / fh); cw = W / (fw * s0); ch = H / (fh * s0); x0 = (1 - cw) / 2; y0 = (1 - ch) / 2; }
    const s = W / (fw * cw), k = lim(fw * s, fh * s);
    const rw = Math.max(1, Math.round(fw * s * k)), rh = Math.max(1, Math.round(fh * s * k)), img = renderFinal(p, rw, rh);
    ctx.drawImage(img, x0 * rw, y0 * rh, cw * rw, ch * rh, 0, 0, W, H);
    return out;
  }
  const s = Math.min(W / fw, H / fh), iw = Math.round(fw * s), ih = Math.round(fh * s), img = renderFinal(p, iw, ih);
  if (fit === 'blur') {
    // sfondo: la stessa foto ingrandita e molto sfocata (rimpicciolita e riallargata in due passi), un po' più scura
    const c = Math.max(W / iw, H / ih), small = canvasOf(Math.max(4, Math.round(W / 40)), Math.max(4, Math.round(H / 40)));
    const sx = small.getContext('2d'); sx.imageSmoothingQuality = 'high';
    const sw = W / c, sh = H / c; sx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, small.width, small.height);
    const mid = canvasOf(Math.round(W / 8), Math.round(H / 8)), mx = mid.getContext('2d'); mx.imageSmoothingQuality = 'high';
    mx.drawImage(small, 0, 0, mid.width, mid.height);
    ctx.drawImage(mid, 0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H);
  } else { ctx.fillStyle = padColor || '#ffffff'; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(img, Math.round((W - iw) / 2), Math.round((H - ih) / 2));
  return out;
}

/* Esegue il rendering finale e restituisce un File */
async function buildExport(p, opts = exportOpts) {
  await loadTextFonts();
  const [fw, fh] = engine.outputSize(p), t = socialTarget(opts);
  let canvas, w, h;
  if (t) {
    [w, h] = socialSize(t, fw, fh);
    const fit = p.frames?.[t.id]?.fit || opts.fit;
    canvas = t.long ? renderFinal(p, w, h) : composeFrame(p, fw, fh, w, h, fit, opts.padColor, t.id);
    // per i social: JPEG di qualità alta, leggera nitidezza per lo schermo (i social ammorbidiscono le foto)
    opts = { ...opts, fmt: 'image/jpeg', quality: t.quality || 0.9, dpi: t.dpi || opts.dpi,
      outSharp: opts.outSharp === 'none' && !t.dpi ? 'low' : opts.outSharp, outSharpType: t.dpi ? 'glossy' : 'screen',
      name: opts.name + '-' + t.id };
  } else {
    [w, h] = exportSize(fw, fh, opts);
    canvas = renderFinal(p, w, h);
  }
  return finishExport(canvas, w, h, opts);
}

/* Nitidezza di output, filigrana, codifica e metadati */
async function finishExport(canvas, w, h, opts) {
  const fmt = opts.fmt;
  if (opts.outSharp !== 'none' || opts.wm !== 'none') {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (opts.outSharp !== 'none') {
      const img = ctx.getImageData(0, 0, w, h); outputSharpen(img, opts.outSharp, opts.outSharpType); ctx.putImageData(img, 0, 0);
    }
    drawWatermark(ctx, w, h, opts);
  }
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/tiff': 'tif' }[fmt];
  let bytes;
  if (fmt === 'image/tiff') bytes = encodeTiff(canvas.getContext('2d').getImageData(0, 0, w, h), opts.dpi);
  else {
    const blob = await new Promise(res => canvas.toBlob(res, fmt, opts.quality));
    bytes = new Uint8Array(await blob.arrayBuffer());
    if (fmt === 'image/jpeg') {
      let app1 = null;
      if (opts.meta === 'all' || opts.meta === 'nogps') app1 = exifData.app1 ? editExif(exifData.app1, opts.meta === 'nogps') : null;
      if (!app1 && opts.copyright && opts.meta !== 'none') app1 = copyrightExif(opts.copyright);
      bytes = patchJpeg(bytes, app1, opts.dpi);
    } else if (fmt === 'image/png') bytes = patchPng(bytes, opts.dpi);
  }
  return new File([bytes], fileNameFor(opts, ext), { type: fmt });
}

/* ---------- Prima / dopo ----------
   layout: side (affiancate) | stack (una sopra l'altra) | split (metà e metà con una linea) */
async function buildBeforeAfter(p, layout = 'side', labels = true, opts = exportOpts) {
  await loadTextFonts();
  const [fw, fh] = engine.outputSize(p);
  const orig = Object.assign(defaults(), { geo: clone(p.geo) });       // stessa inquadratura, nessuna regolazione
  const long = 1600, k = Math.min(1, long / Math.max(fw, fh)), w = Math.round(fw * k), h = Math.round(fh * k);
  const gap = layout === 'split' ? 0 : Math.round(Math.max(w, h) * 0.008);
  const W = layout === 'side' ? w * 2 + gap : w, H = layout === 'stack' ? h * 2 + gap : h;
  const out = canvasOf(W, H), ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const a = renderFinal({ ...orig, texts: [] }, w, h); ctx.drawImage(a, 0, 0);
  const b = renderFinal({ ...p, texts: [] }, w, h);           // senza scritte: il confronto resta pulito
  if (layout === 'split') {
    ctx.drawImage(b, w / 2, 0, w / 2, h, w / 2, 0, w / 2, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - Math.max(1, w * 0.002), 0, Math.max(2, w * 0.004), h);
  } else ctx.drawImage(b, layout === 'side' ? w + gap : 0, layout === 'stack' ? h + gap : 0);
  if (labels) {                                      // etichette nell'angolo in basso di ciascuna foto
    const lab = o => newText({ font: 'moderno', bold: 1, upper: 1, spacing: 0.18, size: 0.04, shadow: 0.7, color: '#ffffff', y: 0.93, ...o });
    if (layout === 'split') drawTexts(ctx, w, h, [lab({ text: 'Prima', align: 'left', x: 0.12 }), lab({ text: 'Dopo', align: 'right', x: 0.88 })]);
    else {
      drawTexts(ctx, w, h, [lab({ text: 'Prima', align: 'left', x: 0.12 })]);
      drawTexts(ctx, w, h, [lab({ text: 'Dopo', align: 'left', x: 0.12 })], layout === 'side' ? w + gap : 0, layout === 'stack' ? h + gap : 0);
    }
  }
  return finishExport(out, W, H, { ...opts, fmt: 'image/jpeg', quality: 0.92, outSharp: 'low', outSharpType: 'screen', name: opts.name + '-prima-dopo' });
}

/* ---------- Collage del look: foto + dettagli di occhi e labbra (serve l'analisi del viso) ---------- */
async function buildCollage(p, details, opts = exportOpts) {
  await loadTextFonts();
  const W = 1080, H = 1350, g = 10, out = canvasOf(W, H), ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  const [fw, fh] = engine.outputSize(p), k = Math.min(1, 3000 / Math.max(fw, fh)), rw = Math.round(fw * k), rh = Math.round(fh * k);
  const img = renderFinal(p, rw, rh);
  const draw = (r, x, y, w, h) => {                 // r: zona da mostrare (0..1), allargata alle proporzioni del riquadro
    let cw = r[2] - r[0], ch = r[3] - r[1]; const A = w / h;
    if (cw * rw / (ch * rh) > A) ch = cw * rw / A / rh; else cw = ch * rh * A / rw;
    if (cw > 1) { cw = 1; ch = rw / A / rh; }
    if (ch > 1) { ch = 1; cw = rh * A / rw; }
    const cx = Math.max(cw / 2, Math.min(1 - cw / 2, (r[0] + r[2]) / 2)), cy = Math.max(ch / 2, Math.min(1 - ch / 2, (r[1] + r[3]) / 2));
    ctx.drawImage(img, (cx - cw / 2) * rw, (cy - ch / 2) * rh, cw * rw, ch * rh, x, y, w, h);
  };
  // in alto la foto (centrata sul viso), sotto i due dettagli affiancati
  const mh = Math.round((H - 3 * g) * 0.64), dw = (W - 3 * g) / 2, dh = H - 3 * g - mh;
  draw(details.main || [0, 0, 1, 1], g, g, W - 2 * g, mh);
  draw(details.eyes, g, 2 * g + mh, dw, dh);
  draw(details.lips, 2 * g + dw, 2 * g + mh, dw, dh);
  return finishExport(out, W, H, { ...opts, fmt: 'image/jpeg', quality: 0.92, outSharp: 'low', outSharpType: 'screen', name: opts.name + '-collage' });
}

async function saveFile(f) {
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
