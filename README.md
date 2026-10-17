# Luce Stanza

Editor foto per telefono in stile Lightroom, uso personale. Web app installabile (PWA) con motore WebGL; nessuna build necessaria.

## Provarlo
Serve un piccolo server (i file locali non permettono l'installazione come app):

    python3 -m http.server 8000

Apri `http://<ip-del-computer>:8000` dal telefono con Chrome, poi menu ⋮ → "Installa app" / "Aggiungi a schermata Home".
Per usarlo solo dal telefono, il modo più semplice è pubblicarlo con GitHub Pages.
Una volta installata, l'app compare nel menu "Condividi" della Galleria: selezioni le foto, Condividi → Luce Stanza.

## App Android (APK) e iPhone
GitHub Actions (`.github/workflows/app.yml`) compila le app a ogni modifica e le mette nella release
[app](https://github.com/gabriiiele/AlternativeLuceStanza/releases/tag/app).

- **Android**: dal telefono scarica `LuceStanza.apk`, aprilo e consenti "Installa app sconosciute" per il browser.
  Le nuove versioni si installano sopra la vecchia senza perdere le foto. In più rispetto alla web app:
  scheda **Galleria** (sfogli e importi le foto del telefono), esportazioni salvate direttamente in Immagini › Luce Stanza
  (backup e TIFF in Download › Luce Stanza), "Condividi → Luce Stanza" e "Apri con".
- **iPhone**: `LuceStanza.ipa` non è firmata (Apple chiede un account sviluppatore). Si installa dal computer con
  [Sideloadly](https://sideloadly.io) o [AltStore](https://altstore.io) usando il proprio Apple ID: con un Apple ID gratuito
  l'app va rinnovata ogni 7 giorni (Sideloadly/AltStore lo fanno con un clic); con l'Apple Developer Program (99 €/anno) dura un anno.
  Sul telefono: Impostazioni › Generali › VPN e gestione dispositivi → autorizza il tuo Apple ID, e attiva la Modalità sviluppatore.
  Le esportazioni finiscono nell'app File › Luce Stanza e si apre il foglio di condivisione ("Salva immagine" le mette in Foto).

Struttura: `package.json` + `capacitor.config.json` (Capacitor), `scripts/build-www.mjs` copia l'app web in `www/`,
`android/` e `ios/` sono i progetti nativi, `native.js` è il collegamento tra l'app web e le funzioni native.

## Funzioni
Tutte le regolazioni di Lightroom che non richiedono AI: luce, curve (punti e parametrica), colore e bilanciamento con contagocce,
profili, mixer colore, colore punto, gradazione colore, bianco e nero, effetti, dettagli, ottica, Upright e trasformazioni,
ritaglio, sfocatura obiettivo manuale, maschere (pennello, lineare, radiale, colore, luminanza, con operazioni tra componenti),
ritocco (correggi, clona, occhi rossi), calibrazione, LUT, 173 preset, importazione preset Lightroom (.xmp/.lrtemplate),
versioni, cronologia, esportazione JPEG/PNG/TIFF/WebP con filigrana, nitidezza di output, DPI e metadati.

Libreria con album, stelle, contrassegni, etichette, parole chiave, ricerca, filtri, duplicati, modifica ed esportazione in blocco, RAW.
AI: Super Resolution (offline), mappa di profondità per sfocatura e maschere, look da descrizione (offline o con Claude).

Stato dettagliato e prossime fasi: [docs/RICERCA_FUNZIONI.md](docs/RICERCA_FUNZIONI.md)

## File
- `shaders.js` programmi GPU (pipeline, maschere, ritocco)
- `engine.js` motore: passate GPU, curve, geometria, LUT
- `state.js` valori predefiniti, gruppi di impostazioni, preset, profili
- `profiles.js` profili colore · `presets.js` libreria preset
- `tools.js` strumenti sull'immagine e analisi (linee, bilanciamento, ritocco)
- `export.js` esportazione, TIFF, EXIF, filigrana
- `ai.js` Super Resolution, profondità, look da descrizione
- `db.js` archivio locale · `library.js` libreria, importazione, impostazioni
- `app.js` interfaccia dell'editor
- `vendor/` librerie incluse (versioni e licenze in `vendor/VERSIONS.txt`)
