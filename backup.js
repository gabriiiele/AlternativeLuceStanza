'use strict';

/* Backup e ripristino della libreria in file .zip (senza compressione: le foto sono già compresse).
   Contenuto: manifest.json (schede foto, album, preset personali, impostazioni) + file originali, RAW decodificati,
   miniature e mappe di profondità. Oltre ~3,5 GB il backup viene diviso in più parti indipendenti. */

const BACKUP_PART_LIMIT = 3.5e9;

/* ---------- Scrittura ZIP (metodo "store") ---------- */

class ZipWriter {
  constructor() { this.parts = []; this.central = []; this.offset = 0; }
  static u16(v) { return [v & 255, (v >> 8) & 255]; }
  static u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
  async add(name, data) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const bytes = new Uint8Array(await blob.arrayBuffer()), crc = crc32(bytes), nm = new TextEncoder().encode(name);
    const { u16, u32 } = ZipWriter;
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(nm.length), ...u16(0), ...nm]);
    this.central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(this.offset), ...nm]));
    this.parts.push(local, blob);
    this.offset += local.length + bytes.length;
  }
  finish() {
    const { u16, u32 } = ZipWriter, size = this.central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(this.central.length), ...u16(this.central.length),
      ...u32(size), ...u32(this.offset), ...u16(0)]);
    return new Blob([...this.parts, ...this.central, end], { type: 'application/zip' });
  }
}

/* ---------- Lettura ZIP ---------- */

async function readZipIndex(file) {
  const tailLen = Math.min(file.size, 65557), tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Non è un file di backup valido');
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), entries = {};
  for (let i = 0, p = 0; i < count; i++) {
    const size = cd.getUint32(p + 20, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true);
    const off = cd.getUint32(p + 42, true), name = new TextDecoder().decode(new Uint8Array(cd.buffer, p + 46, nl));
    entries[name] = { off, size };
    p += 46 + nl + xl + cl;
  }
  // il dato inizia dopo l'intestazione locale (lunghezza variabile)
  const data = async name => {
    const e = entries[name]; if (!e) return null;
    const h = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
    const start = e.off + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    return file.slice(start, start + e.size);
  };
  return { entries, data };
}

/* ---------- Backup ---------- */

async function createBackup() {
  const all = await DB.all('photos');
  if (!all.length) { toast('La libreria è vuota'); return; }
  const settings = { appSettings, exportOpts: { ...exportOpts, wmImage: null }, ai: { model: aiSettings.model, effort: aiSettings.effort } };
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // suddivide le foto in parti sotto il limite di dimensione
  const groups = [[]];
  let size = 0;
  for (const p of all) {
    const s = (p.size || 0) * (p.raw ? 1.6 : 1.1);
    if (size + s > BACKUP_PART_LIMIT && groups[groups.length - 1].length) { groups.push([]); size = 0; }
    groups[groups.length - 1].push(p); size += s;
  }
  const files = [];
  for (const [gi, group] of groups.entries()) {
    const zip = new ZipWriter();
    for (const [i, p] of group.entries()) {
      libStatus(`Backup: foto ${i + 1} di ${group.length}` + (groups.length > 1 ? ` (parte ${gi + 1}/${groups.length})` : '') + '…');
      for (const store of ['files', 'decoded', 'thumbs', 'depth']) {
        const b = await DB.get(store, p.id);
        if (b) await zip.add(`${store}/${p.id}`, b);
      }
    }
    const manifest = { app: 'luce-stanza', version: 1, created: Date.now(), part: gi + 1, parts: groups.length,
      photos: group, albums, presets: userPresets(), settings };
    await zip.add('manifest.json', JSON.stringify(manifest));
    const name = `luce-stanza-backup-${date}` + (groups.length > 1 ? `-parte${gi + 1}` : '') + '.zip';
    files.push(new File([zip.finish()], name, { type: 'application/zip' }));
  }
  libStatus('');
  appSettings.lastBackup = Date.now(); saveAppSettings();
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: 'Backup Luce Stanza' }); toast('Backup pronto'); renderLibrary(); return; }
    catch (e) { if (e.name === 'AbortError') { renderLibrary(); return; } }
  }
  for (const f of files) await saveFile(f);
  toast(`Backup salvato (${files.length > 1 ? files.length + ' file' : fmtBytes(files[0].size)})`);
  renderLibrary();
}

/* ---------- Ripristino ---------- */

async function restoreBackup(fileList) {
  let added = 0, skipped = 0;
  for (const file of fileList) {
    const zip = await readZipIndex(file);
    const mf = zip.entries['manifest.json'] ? JSON.parse(await (await zip.data('manifest.json')).text()) : null;
    if (!mf || mf.app !== 'luce-stanza') throw new Error(`${file.name}: non è un backup di Luce Stanza`);
    const have = new Set(photos.map(p => p.id));
    for (const [i, p] of mf.photos.entries()) {
      libStatus(`Ripristino: foto ${i + 1} di ${mf.photos.length}…`);
      if (have.has(p.id)) { skipped++; continue; }
      for (const store of ['files', 'decoded', 'thumbs', 'depth']) {
        const b = await zip.data(`${store}/${p.id}`);
        if (b) await DB.put(store, new Blob([await b.arrayBuffer()], { type: store === 'files' ? (p.type || '') : store === 'depth' ? 'image/png' : 'image/jpeg' }), p.id);
      }
      await DB.put('photos', p); photos.push(p); added++;
    }
    for (const a of mf.albums || []) if (!albums.some(x => x.id === a.id)) { albums.push(a); await DB.put('albums', a); }
    const mine = userPresets();
    for (const u of mf.presets || []) if (!mine.some(m => m.name === u.name && m.group === u.group)) mine.push(u);
    saveUserPresets(mine);
    if (mf.settings?.appSettings) { Object.assign(appSettings, mf.settings.appSettings); saveAppSettings(); }
    if (mf.settings?.exportOpts) { Object.assign(exportOpts, mf.settings.exportOpts); try { localStorage.setItem('exportOpts', JSON.stringify(exportOpts)); } catch { /* spazio pieno */ } }
  }
  libStatus('');
  albums.sort((a, b) => a.created - b.created);
  toast(`${added} foto ripristinate` + (skipped ? ` · ${skipped} erano già presenti` : ''));
  renderLibrary();
}
