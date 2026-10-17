'use strict';

/* Fotocamera integrata. I controlli manuali dipendono da ciò che il telefono espone al browser
   (MediaStreamTrack.getCapabilities): vengono mostrati solo quelli disponibili.
   Scatto con ImageCapture.takePhoto (risoluzione piena) o, in mancanza, dal fotogramma video.
   Modalità forcella: 3 scatti a esposizioni diverse uniti automaticamente in HDR. */

const cam = { stream: null, track: null, ic: null, caps: {}, photoCaps: null, facing: 'environment', timer: 0, flash: 'off',
  grid: true, bracket: false, saveCopy: false, showCtl: false, busy: false, values: {} };

function camEl() {
  let v = $('cameraView');
  if (v) return v;
  v = el('div', { id: 'cameraView', className: 'view camera' });
  v.innerHTML = `
    <div class="cam-stage"><video id="camVideo" playsinline muted></video><div id="camGrid" class="cam-grid"></div>
      <div id="camCount" class="cam-count" hidden></div><div id="camFlash" class="cam-flashfx"></div></div>
    <div id="camCtl" class="cam-ctl" hidden></div>
    <div class="cam-bar">
      <button id="camClose" class="ibtn">✕</button>
      <button id="camOpts" class="ibtn" title="Controlli manuali">⚙</button>
      <button id="camShoot" class="cam-shoot" title="Scatta"></button>
      <button id="camMode" class="ibtn" title="Opzioni">≡</button>
      <button id="camSwitch" class="ibtn" title="Cambia fotocamera">⟲</button>
    </div>`;
  document.body.append(v);
  $('camClose').onclick = closeCamera;
  $('camShoot').onclick = shoot;
  $('camSwitch').onclick = () => { cam.facing = cam.facing === 'environment' ? 'user' : 'environment'; startStream(); };
  $('camOpts').onclick = () => { cam.showCtl = cam.showCtl === 'manual' ? false : 'manual'; renderCamCtl(); };
  $('camMode').onclick = () => { cam.showCtl = cam.showCtl === 'mode' ? false : 'mode'; renderCamCtl(); };
  return v;
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { alert('Fotocamera non disponibile in questo browser'); return; }
  camEl().hidden = false; $('libraryView').hidden = true;
  try { await startStream(); }
  catch (e) { alert('Impossibile aprire la fotocamera: ' + e.message); closeCamera(); }
}

function stopStream() { cam.stream?.getTracks().forEach(t => t.stop()); cam.stream = cam.track = cam.ic = null; }

async function startStream() {
  stopStream();
  cam.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: cam.facing }, width: { ideal: 4096 }, height: { ideal: 3072 } }, audio: false });
  cam.track = cam.stream.getVideoTracks()[0];
  const v = $('camVideo'); v.srcObject = cam.stream; await v.play().catch(() => {});
  cam.caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
  cam.values = {};
  cam.photoCaps = null;
  if ('ImageCapture' in window) {
    cam.ic = new ImageCapture(cam.track);
    try { cam.photoCaps = await cam.ic.getPhotoCapabilities(); } catch { /* non supportato */ }
  }
  $('camGrid').hidden = !cam.grid;
  fitCamGrid(); v.onresize = fitCamGrid;
  if (!cam.ro) { cam.ro = new ResizeObserver(fitCamGrid); cam.ro.observe(v); }
  renderCamCtl();
}

/* La griglia segue l'area effettivamente occupata dal video (che è adattato senza tagli) */
function fitCamGrid() {
  const v = $('camVideo'), g = $('camGrid'); if (!v || !v.videoWidth) return;
  const W = v.clientWidth, H = v.clientHeight, k = Math.min(W / v.videoWidth, H / v.videoHeight);
  const w = v.videoWidth * k, h = v.videoHeight * k;
  Object.assign(g.style, { left: (W - w) / 2 + 'px', top: (H - h) / 2 + 'px', width: w + 'px', height: h + 'px', right: 'auto', bottom: 'auto' });
}

function closeCamera() {
  stopStream();
  if ($('cameraView')) $('cameraView').hidden = true;
  $('libraryView').hidden = false; renderLibrary();
}

async function applyCam(c) {
  Object.assign(cam.values, c);
  try { await cam.track.applyConstraints({ advanced: [c] }); } catch (e) { toast('Non supportato: ' + e.message); }
}

/* Pannello controlli: manuali (⚙) o opzioni di scatto (≡) */
function renderCamCtl() {
  const box = $('camCtl'); box.innerHTML = ''; box.hidden = !cam.showCtl;
  if (!cam.showCtl) return;
  const C = cam.caps, set = cam.track?.getSettings?.() || {};
  const range = (key, label, fmt = v => (+v).toFixed(1), extra = {}) => {
    const r = C[key]; if (!r || r.max === undefined || r.min === r.max) return null;
    const cur = cam.values[key] ?? set[key] ?? r.min;
    const out = el('output', { textContent: fmt(cur) });
    const inp = el('input', { type: 'range', min: r.min, max: r.max, step: r.step || (r.max - r.min) / 100, value: cur });
    inp.oninput = () => { out.textContent = fmt(inp.value); applyCam({ ...extra, [key]: +inp.value }); };
    return el('div', { className: 'row' }, el('label', { textContent: label }), inp, out);
  };
  const modes = (key, label, names) => {
    const m = C[key]; if (!Array.isArray(m) || m.length < 2) return null;
    return el('div', {}, el('label', { className: 'dim', textContent: label }),
      chips(m.map(v => [v, names[v] || v]), cam.values[key] ?? set[key], v => { applyCam({ [key]: v }); renderCamCtl(); }));
  };
  if (cam.showCtl === 'manual') {
    const items = [
      range('exposureCompensation', 'Esposizione (EV)'),
      modes('exposureMode', 'Modo esposizione', { continuous: 'Auto', manual: 'Manuale', 'single-shot': 'Singola' }),
      range('exposureTime', 'Tempo', v => { const s = v / 10000; return s >= 1 ? s.toFixed(1) + ' s' : '1/' + Math.round(1 / s); }, { exposureMode: 'manual' }),
      range('iso', 'ISO', v => Math.round(v), { exposureMode: 'manual' }),
      modes('whiteBalanceMode', 'Bilanciamento', { continuous: 'Auto', manual: 'Manuale', 'single-shot': 'Singolo' }),
      range('colorTemperature', 'Temperatura', v => Math.round(v) + ' K', { whiteBalanceMode: 'manual' }),
      modes('focusMode', 'Messa a fuoco', { continuous: 'Auto', manual: 'Manuale', 'single-shot': 'Singola' }),
      range('focusDistance', 'Distanza fuoco', v => (+v).toFixed(2) + ' m', { focusMode: 'manual' }),
      range('zoom', 'Zoom', v => (+v).toFixed(1) + '×'),
    ].filter(Boolean);
    if (C.torch) items.push(actions(btn(cam.values.torch ? 'Torcia accesa' : 'Torcia', () => { applyCam({ torch: !cam.values.torch }); renderCamCtl(); }, cam.values.torch ? 'on' : '')));
    box.append(...items);
    if (!items.length) box.append(note('Questo telefono non espone controlli manuali al browser.'));
  } else {
    const fl = cam.photoCaps?.fillLightMode || [];
    box.append(
      el('label', { className: 'dim', textContent: 'Timer' }), chips([[0, 'No'], [3, '3 s'], [10, '10 s']], cam.timer, v => { cam.timer = +v; renderCamCtl(); }),
      fl.length > 1 ? el('label', { className: 'dim', textContent: 'Flash' }) : null,
      fl.length > 1 ? chips(fl.map(m => [m, { off: 'No', auto: 'Auto', flash: 'Sì' }[m] || m]), cam.flash, v => { cam.flash = v; renderCamCtl(); }) : null,
      actions(toggle('Griglia', () => cam.grid, v => { cam.grid = v; $('camGrid').hidden = !v; }, true),
        C.exposureCompensation ? toggle('Forcella HDR (3 scatti)', () => cam.bracket, v => { cam.bracket = v; }, true) : null,
        toggle('Salva copia nei Download', () => cam.saveCopy, v => { cam.saveCopy = v; }, true)),
      note('Le foto finiscono nella libreria dell\'app. La copia nei Download compare anche nella Galleria.'));
  }
}

async function captureBlob() {
  if (cam.ic) {
    try {
      const fl = cam.photoCaps?.fillLightMode || [];
      return await cam.ic.takePhoto(fl.includes(cam.flash) ? { fillLightMode: cam.flash } : {});
    } catch { /* ripiega sul fotogramma */ }
  }
  const v = $('camVideo'), c = canvasOf(v.videoWidth, v.videoHeight);
  c.getContext('2d').drawImage(v, 0, 0);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
}

async function shoot() {
  if (cam.busy || !cam.track) return;
  cam.busy = true;
  try {
    for (let s = cam.timer; s > 0; s--) { $('camCount').hidden = false; $('camCount').textContent = s; await new Promise(r => setTimeout(r, 1000)); }
    $('camCount').hidden = true;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14), files = [];
    const fx = () => { const f = $('camFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
    if (cam.bracket && cam.caps.exposureCompensation) {
      const r = cam.caps.exposureCompensation, base = cam.values.exposureCompensation ?? 0;
      const evs = [Math.max(r.min, base - 2), base, Math.min(r.max, base + 2)];
      for (const [i, ev] of evs.entries()) {
        await applyCam({ exposureCompensation: ev });
        await new Promise(r2 => setTimeout(r2, 600));            // l'esposizione si assesta
        fx(); files.push(new File([await captureBlob()], `IMG_${stamp}_${i + 1}.jpg`, { type: 'image/jpeg', lastModified: Date.now() + i }));
      }
      await applyCam({ exposureCompensation: base });
    } else {
      fx(); files.push(new File([await captureBlob()], `IMG_${stamp}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    }
    if (cam.saveCopy) for (const f of files) await saveFile(f);
    const recs = await importFiles(files, { quiet: true });
    if (cam.bracket && recs.length >= 2) {
      toast('Unione HDR…');
      const canvases = [];
      for (const r of recs) canvases.push((await photoSource(r)).canvas);
      const out = await mergeHDR(canvases);
      await addCanvasPhoto(out, `IMG_${stamp} HDR`, { taken: recs[0].taken, exif: recs[0].exif });
      toast('HDR creato');
    } else toast('Foto salvata nella libreria');
  } catch (e) { alert('Scatto non riuscito: ' + e.message); console.error(e); }
  cam.busy = false;
}
