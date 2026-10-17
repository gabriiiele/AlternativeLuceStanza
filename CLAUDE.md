# Luce Stanza – note per Claude

Editor fotografico personale in stile Lightroom per Android, scritto come PWA (HTML/JS puro, nessuna build).
L'utente non è un programmatore: spiegazioni in italiano, brevi e pratiche. Interfaccia e commenti nel codice in italiano.
Uso solo personale: niente reverse engineering o copia di codice/dati Adobe, solo implementazioni originali.

## Stato
- Fase 1 (motore di modifica completo senza AI) e Fase 2 (libreria, RAW, AI richieste) completate.
- Prossimo: Fase 3 (unione HDR/panorama, fotocamera integrata, curva locale nelle maschere, eventuale APK nativo
  per sfogliare direttamente la Galleria). Elenco completo e stato: `docs/RICERCA_FUNZIONI.md`.
- AI: l'utente vuole SOLO Super Resolution, look da descrizione ("preset adattivi") e mappa di profondità. Niente altre funzioni AI.
- Pubblicazione: GitHub Pages dal branch `claude/lightroom-mobile-reverse-engineer-717gjz` → https://gabriiiele.github.io/AlternativeLuceStanza/

## Struttura
- `shaders.js` GLSL ES 1.0: pipeline principale, maschere (1 maschera per canale RGBA, max 8 × 6 componenti), ritocco
- `engine.js` passate WebGL1, curve, geometria (`geoInfo`, `srcUV`, `outUV` devono restare identiche allo shader), LUT, profondità
- `state.js` `defaults()` = schema completo dei parametri; `GROUPS` per copia selettiva/preset; `effectiveParams` applica il profilo
- `presets.js` 173 preset (formato compatto: `hsl`/`bw` sparsi), `profiles.js` profili
- `tools.js` strumenti sull'immagine, Hough/Upright, pennello (tratti vettoriali in `params.masks[].strokes`)
- `export.js` formati, TIFF, EXIF, filigrana · `ai.js` SR (TF.js, modelli in `vendor/sr`), profondità (transformers.js da CDN), look (Claude SDK o regole offline)
- `db.js` IndexedDB · `library.js` libreria, import, impostazioni · `app.js` editor (pannelli in `PANELS`, barra in `TOOLS`)
- Tutti gli script sono classici e condividono lo scope globale; ordine in `index.html`.

## Convenzioni importanti
- Coordinate: `v` risultato (y su), `uv` sorgente (y su), `ic` immagine (y giù) per maschere/ritocchi/sfocatura.
- Caricare immagini nel motore SEMPRE tramite canvas: con ImageBitmap `UNPACK_FLIP_Y` viene ignorato (immagine capovolta).
- Ogni modifica registrata passa da `commit(label)`/`pushHistory`, che attiva anche il salvataggio automatico.
- Nuovi file statici vanno aggiunti a `FILES` in `sw.js` (e incrementare `CACHE`).
- Look con Claude: modello predefinito `claude-opus-5-5`, fallback lato server, chiave dell'utente in localStorage.

## Ambiente di sviluppo (sessioni cloud)
- Rete: npm e Maven Central raggiungibili; Hugging Face, jsdelivr, maven Google e api.anthropic.com bloccati.
- Test: Playwright con Chromium (`/opt/node22/lib/node_modules/playwright`, flag `--use-angle=swiftshader`),
  servendo l'app con `python3 -m http.server` (moduli e service worker non funzionano da file://).
- GitHub: push protection ha bloccato `transformers.min.js` (falso positivo "Mistral API key") → non includerlo in `vendor/`.
- Non testati su dispositivo reale: modello di profondità vero, chiamate a Claude, decodifica di RAW reali.
