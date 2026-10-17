'use strict';

/* Compatibilità tra Android (Chrome) e iPhone (Safari).
   Safari ha limiti diversi: canvas al massimo ~16,7 milioni di pixel, createImageBitmap che non sempre rispetta
   l'orientamento EXIF, niente ImageCapture, niente "Condividi verso l'app". */

const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* App installata come APK o app iPhone (Capacitor): vedi native.js */
const IS_NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const IS_STANDALONE = IS_NATIVE || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
/* Lato massimo di un canvas: su iPhone 4096 (4096 × 4096 = limite di area di Safari), altrove 16384 */
const CANVAS_MAX_SIDE = IS_IOS ? 4096 : 16384;
const CANVAS_MAX_AREA = IS_IOS ? 16.7e6 : 260e6;

/* Decodifica un'immagine rispettando l'orientamento. Su iPhone si usa <img> (gestisce anche HEIC e l'orientamento EXIF). */
async function decodeImage(blob) {
  const viaImg = async () => {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
  };
  if (IS_IOS) { try { return await viaImg(); } catch { /* prova con createImageBitmap */ } }
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* opzione non supportata */ }
  try { return await createImageBitmap(blob); } catch { /* formato non gestito da createImageBitmap */ }
  return viaImg();
}
const imgW = im => im.naturalWidth || im.width, imgH = im => im.naturalHeight || im.height;

const supportsWebp = (() => {
  try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); }
  catch { return false; }
})();
