# Luce Stanza – note per Claude

Editor fotografico personale in stile Lightroom per Android, scritto come PWA (HTML/JS puro, nessuna build).
L'utente non è un programmatore: spiegazioni in italiano, brevi e pratiche. Interfaccia e commenti nel codice in italiano.
Uso solo personale: niente reverse engineering o copia di codice/dati Adobe, solo implementazioni originali.

## Stato
- Fasi 1, 2 e 3 completate: motore, libreria, RAW, AI richieste, backup .zip, cestino (30 giorni), confronto tenendo
  premuto sulla foto (il pulsante ◐ è stato tolto su richiesta), unione HDR/panorama, fotocamera, curva nelle maschere.
- Possibili passi successivi: deghosting HDR, panorami sferici, APK nativo per la Galleria. Stato completo: `docs/RICERCA_FUNZIONI.md`.
- PRIORITÀ DELL'UTENTE: le foto non devono mai sembrare finte. Ombre/luci sono un guadagno locale moltiplicativo in luce lineare
  (riferimento = pixel/dintorni solo dove simili, niente aloni), contrasto = curva a S (tanh) sulla luminanza, `softShoulder` sulle
  alte luci, `fitGamut` al posto di clamp (desatura invece di tagliare i canali), vividezza che risparmia la pelle, vignettatura
  e bagliore in luce lineare. Preset e Look AI passano da `limitRealism` (presets.js). Non reintrodurre effetti additivi in sRGB.
- Sfocatura con profondità: raccolta che esclude i campioni del soggetto a fuoco (niente alone), livelli presfocati per raggi grandi,
  rumore del sensore reintegrato (`engine.noise` da `estimateNoise`); mappa rifinita con filtro guidato (`refineDepth`).
  Pannello Profondità: azioni rapide (sfondo sfocato, soggetto in risalto, foschia, maschere primo piano/sfondo).
- Modalità semplice (`appSettings.simpleMode`, `TOOLS_SIMPLE`, `activeTools()`), pensata per moda/beauty: Look (Preset con categoria
  "Moda e beauty" + Look AI), Regola (`Semplice`, con "Colori fedeli"), Beauty, Sfondo, Ritaglia, Pubblica. Si cambia dal menu ⋮ o dalle Impostazioni.
- Analisi del viso (AI consentita dall'utente): `faceMap` in ai.js con MediaPipe tasks-vision 0.10.21 in `vendor/face` (Face Landmarker +
  Selfie Multiclass, CPU, offline; il service worker li mette in cache `luce-face-1` al primo uso). Risultato: canvas w × 3h, fasce
  [pelle, labbra, occhi] [denti, capelli, persona] [palpebre, sopracciglia, viso] (`FACE_PARTS`), salvato in store `depth` con chiave
  `id + '#face'` (anche nel backup come `face/<id>`). `setFaceCanvas` → `engine.setFace` (unità 9, `uHasFace`) + `faceData` in JS.
  Shader: pelle dalla mappa, `uBeauty2` = trucco (labbra+palpebre), occhi, denti. Maschere: componente `face` (parte 0-8).
- Preset: secondo tocco sul preset attivo lo toglie (torna a `presetBase`). I preset inclusi non azzerano `KEEP_ON_PRESET`
  (geometria, maschere, ritocco, testi, beauty, sfocatura).
- Pubblica (export.js + app.js): `SOCIAL` formati (Instagram, TikTok, Facebook, Pinterest, X, LinkedIn, YouTube, WhatsApp, web, stampa),
  `composeFrame` ritaglia secondo `params.frames[id]` ({x, y, z, fit}, riquadro trascinabile sulla foto col modo `frame`, `frameRect`;
  senza scelta: centrato sul viso con `exportFocus`), bordi o sfondo sfocato; anteprime esatte per formato (`socialPreview`);
  modelli di scritta mostrati come anteprime; `params.texts` (scritte, `drawTexts`, font OFL in
  `vendor/fonts`, trascinabili con il modo `text`); `buildBeforeAfter`, `buildCollage`. Sfondo: maschera `Sfondo (AI)` (persona invertita)
  e sfocatura con profondità o con la sagoma della persona (`personDepth`).
- Beauty (`bSmooth`, `bEven`, `bBright`, `bShine`): pelle riconosciuta dal colore in YCbCr con soglia di crominanza (niente soglie di
  luminosità, per non escludere le carnagioni scure); separazione delle frequenze tra `uBlur1` e `uBlur2`, lineamenti protetti dal
  bordo, grana fine sostituita con grana uniforme pari a `uNoise`; lucidità = più chiaro dei dintorni. Capelli biondi/castani
  possono rientrare nella maschera (limite del solo colore).
- iPhone: `compat.js` (IS_IOS, CANVAS_MAX_SIDE 4096 / area 16,7 MP su Safari, `decodeImage` via <img> per HEIC/EXIF, `supportsWebp`).
  Niente share target su iOS: si importa con + → Libreria foto. Avviso "Aggiungi alla schermata Home" (Safari cancella i dati dopo 7 giorni).
  Icone PNG (icon-180 per iOS). WebKit non è disponibile nell'ambiente: test fatti con Chromium + user agent iPhone.
- AI: Super Resolution, look da descrizione, mappa di profondità e (dall'ultima richiesta) analisi del viso per beauty/maschere/sfondo.
- Pubblicazione: GitHub Pages dal branch `claude/lightroom-mobile-reverse-engineer-717gjz` → https://gabriiiele.github.io/AlternativeLuceStanza/

## Struttura
- `shaders.js` GLSL ES 1.0: pipeline principale, maschere (1 maschera per canale RGBA, max 8 × 6 componenti), ritocco
- `engine.js` passate WebGL1, curve, geometria (`geoInfo`, `srcUV`, `outUV` devono restare identiche allo shader), LUT, profondità
- `state.js` `defaults()` = schema completo dei parametri; `GROUPS` per copia selettiva/preset; `effectiveParams` applica il profilo
- `presets.js` 173 preset (formato compatto: `hsl`/`bw` sparsi), `profiles.js` profili
- `tools.js` strumenti sull'immagine, Hough/Upright, pennello (tratti vettoriali in `params.masks[].strokes`)
- `export.js` formati, TIFF, EXIF, filigrana · `ai.js` SR (TF.js, modelli in `vendor/sr`), profondità (transformers.js da CDN), look (Claude SDK o regole offline)
- `backup.js` zip "store" scritto/letto a mano (manifest.json + files/ decoded/ thumbs/ depth/), ripristino senza doppioni (per id)
- `merge.js` HDR (MTB + Mertens multi-scala a ≤1536 px + dettaglio a piena risoluzione) e panorama (cilindrico, Harris + RANSAC)
- `camera.js` getUserMedia + ImageCapture; controlli solo se presenti in `getCapabilities()`; forcella → `mergeHDR`
- Cestino: `photo.trashed` = timestamp; `livePhotos()` esclude il cestino; vista libreria `trash`
- Curve delle maschere: righe 2-9 della texture delle curve (`CURVE_ROWS = 10`), flag in `uMk[i*5+4].w`
- `db.js` IndexedDB · `library.js` libreria, import, impostazioni · `app.js` editor (pannelli in `PANELS`, barra in `TOOLS`)
- Risoluzione: il motore lavora a piena risoluzione fino a `engine.maxSize` (MAX_TEXTURE_SIZE, max 16384). Anteprima con mipmap
  (WebGL2); esportazione a tasselli con `engine.renderToCanvas`. Shader principale usa `SH_VERT_MAIN` con `uTile`.
- Grana: definita in pixel del risultato a piena risoluzione (`uGrainRes`), deforma/ammorbidisce l'immagine e poi si somma
  pesata sui mezzitoni; in anteprima ridotta viene attenuata come in una riduzione reale.
- Qualità: texture/chiarezza/nitidezza agiscono solo sulla luminanza (niente rumore di colore del JPEG); usano livelli
  sfocati gaussiani precalcolati (`updateBlurs`, `uBlur1..3`), non campionamenti sparsi. Curve a 16 bit (1024 voci), dithering finale.
- Interfaccia: `slider()` si regola solo trascinando in orizzontale (relativo), doppio tocco = neutro, tocco sul numero = valore preciso;
  `group()` = sezione richiudibile. Menu ⋮ (`openMenu`) apre i pannelli fuori barra (Esporta, Organizza, Versioni, Cronologia, Info).
- Editor in stile Lightroom: barra in basso solo icone (attiva = pillola con nome), riga pannelli sopra (con AUTO per
  `auto: true`), tendina `#panel` richiudibile (`sheetOpen`, `showTab(name)`, `closeSheet()`, maniglia `.grip`). `sheet: false`
  = resta chiusa finché non si sceglie un pannello. Barra in alto solo icone SVG. Istogramma nascosto di default (`appSettings.ui = 2`).
- Skill di design installate in `.claude/skills/` (taste-skill, MIT): `redesign-existing-projects` (quella adatta all'app) e `design-taste-frontend`.
- Tutti gli script sono classici e condividono lo scope globale; ordine in `index.html`.

## Convenzioni importanti
- Coordinate: `v` risultato (y su), `uv` sorgente (y su), `ic` immagine (y giù) per maschere/ritocchi/sfocatura.
- Caricare immagini nel motore SEMPRE tramite canvas: con ImageBitmap `UNPACK_FLIP_Y` viene ignorato (immagine capovolta).
- Ogni modifica registrata passa da `commit(label)`/`pushHistory`, che attiva anche il salvataggio automatico.
- Nuovi file statici vanno aggiunti a `FILES` in `sw.js` (e incrementare `CACHE`).
- Look con Claude: modello predefinito `claude-opus-5-5`, fallback lato server, chiave dell'utente in localStorage.

## Ambiente di sviluppo (sessioni cloud)
- Rete: npm, Maven Central e storage.googleapis.com (modelli MediaPipe) raggiungibili; Hugging Face, jsdelivr, maven Google e api.anthropic.com bloccati.
- Test: Playwright con Chromium (`/opt/node22/lib/node_modules/playwright`, flag `--use-angle=swiftshader`),
  servendo l'app con `python3 -m http.server` (moduli e service worker non funzionano da file://).
- GitHub: push protection ha bloccato `transformers.min.js` (falso positivo "Mistral API key") → non includerlo in `vendor/`.
- Non testati su dispositivo reale: modello di profondità vero, chiamate a Claude, decodifica di RAW reali.
