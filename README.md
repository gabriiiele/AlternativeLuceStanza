# Luce Stanza

Editor foto per telefono, uso personale. Web app installabile (PWA) con motore WebGL: nessuna dipendenza, nessuna build.

## Provarlo
Serve un piccolo server (i file locali non permettono l'installazione come app):

    python3 -m http.server 8000

Apri `http://<ip-del-computer>:8000` dal telefono con Chrome, poi menu ⋮ → "Installa app" / "Aggiungi a schermata Home".
Per usarlo solo dal telefono, il modo più semplice è pubblicarlo con GitHub Pages.

## Funzioni
- **Luce:** esposizione, contrasto, alteluci, ombre, bianchi, neri, chiarezza, texture, foschia, auto
- **Colore:** temperatura, tinta, vividezza, saturazione, dissolvenza
- **Gradazione** a tre toni, **B&N** con mix per colore, **HSL** su 8 colori
- **Curve** RGB / R / G / B
- **Dettaglio:** nitidezza, riduzione rumore. **Effetti:** vignettatura, grana, bagliore, halation, aberrazione cromatica
- **Geometria:** ritaglio con proporzioni, raddrizza, zoom, rotazione, specchio
- **Maschere** lineari e radiali (2), **LUT .cube**
- **173 preset** con anteprima, ricerca, categorie e intensità regolabile; preset personali
- Istogramma, zoom a due dita, annulla/ripeti, prima/dopo, copia/incolla impostazioni
- Esportazione JPEG / PNG / WebP

Catalogo completo e prossimi passi: [docs/RICERCA_FUNZIONI.md](docs/RICERCA_FUNZIONI.md)

## File
- `engine.js` motore WebGL (shader, curve, geometria, LUT)
- `presets.js` libreria dei preset
- `app.js` interfaccia
