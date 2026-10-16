'use strict';

/* Esportazione: formati, dimensioni, risoluzione (DPI), nitidezza di output, filigrana, metadati EXIF. */

const exportOpts = {
  fmt: 'image/jpeg', quality: 0.92,
  sizeMode: 'orig', sizeVal: 2048,          // orig | long | short | w | h | pct
  dpi: 300,
  outSharp: 'none', outSharpType: 'screen', // none|low|std|high ; screen|matte|glossy
  wm: 'none', wmText: '© ', wmSize: 4, wmOpacity: 0.6, wmColor: '#ffffff', wmPos: 'br', wmMargin: 3, wmImage: null,
  meta: 'all',                              // all | nogps | copyright | none
  copyright: '', name: '{nome}-modificata',
};

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
    0x829A: 'exposure', 0x829D: 'fnumber', 0x8827: 'iso', 0x9003: 'dateOriginal', 0x920A: 'focal', 0xA434: 'lens' };
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

/* ---------- Esportazione ---------- */

function exportSize(w, h, o) {
  let k = 1;
  const v = Math.max(1, +o.sizeVal || 1);
  if (o.sizeMode === 'long') k = v / Math.max(w, h);
  else if (o.sizeMode === 'short') k = v / Math.min(w, h);
  else if (o.sizeMode === 'w') k = v / w;
  else if (o.sizeMode === 'h') k = v / h;
  else if (o.sizeMode === 'pct') k = v / 100;
  k = Math.min(k, 4096 / Math.max(w, h));
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

/* Esegue il rendering finale e restituisce un File */
async function buildExport(p, opts = exportOpts) {
  const [fw, fh] = engine.outputSize(p);
  const [w, h] = exportSize(fw, fh, opts);
  engine.render(effectiveParams(p), w, h, { brushes: brushCanvases().list, brushVer: brushCanvases().ver });
  const fmt = opts.fmt;
  const needs2d = opts.outSharp !== 'none' || opts.wm !== 'none' || fmt === 'image/tiff';
  let canvas = engine.canvas;
  if (needs2d) {
    canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(engine.canvas, 0, 0);
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

async function saveFile(f) {
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
