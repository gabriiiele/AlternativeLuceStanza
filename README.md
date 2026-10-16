# Luce Stanza

Editor foto per telefono, uso personale. Web app installabile (PWA) con motore WebGL: nessuna dipendenza, nessuna build.

## Provarlo
Serve un piccolo server (i file locali non permettono l'installazione come app):

    python3 -m http.server 8000

Apri `http://<ip-del-computer>:8000` dal telefono con Chrome, poi menu ⋮ → "Installa app" / "Aggiungi a schermata Home".
Per usarlo solo dal telefono, il modo più semplice è pubblicarlo con GitHub Pages.

## Funzioni
Tutte le regolazioni di Lightroom che non richiedono AI: luce, curve (punti e parametrica), colore e bilanciamento con contagocce,
profili, mixer colore, colore punto, gradazione colore, bianco e nero, effetti, dettagli, ottica, Upright e trasformazioni,
ritaglio, sfocatura obiettivo manuale, maschere (pennello, lineare, radiale, colore, luminanza, con operazioni tra componenti),
ritocco (correggi, clona, occhi rossi), calibrazione, LUT, 173 preset, importazione preset Lightroom (.xmp/.lrtemplate),
versioni, cronologia, esportazione JPEG/PNG/TIFF/WebP con filigrana, nitidezza di output, DPI e metadati.

Stato dettagliato e prossime fasi: [docs/RICERCA_FUNZIONI.md](docs/RICERCA_FUNZIONI.md)

## File
- `shaders.js` programmi GPU (pipeline, maschere, ritocco)
- `engine.js` motore: passate GPU, curve, geometria, LUT
- `state.js` valori predefiniti, gruppi di impostazioni, preset, profili
- `profiles.js` profili colore · `presets.js` libreria preset
- `tools.js` strumenti sull'immagine e analisi (linee, bilanciamento, ritocco)
- `export.js` esportazione, TIFF, EXIF, filigrana
- `app.js` interfaccia
