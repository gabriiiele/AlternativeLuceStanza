# Funzioni: confronto con Lightroom

Stato: ✅ fatto · 🟡 parziale/approssimato · 🔜 fase successiva · ⛔ escluso (AI, servizi Adobe o limiti del browser)

Regola del progetto: **nessuna funzione basata su AI**. Dove Lightroom usa l'AI, c'è un'alternativa manuale o geometrica.

## Fase 1 – Motore di modifica (completata)

| Sezione | Contenuto | Stato |
|---|---|---|
| 1. Luce | Esposizione, contrasto, alte luci, ombre, bianchi, neri | ✅ |
| | Curva a punti RGB / R / G / B, preset di contrasto | ✅ |
| | Curva parametrica: alte luci, chiari, scuri, ombre + 3 divisioni | ✅ |
| 2. Colore | Temperatura, tinta, vividezza, saturazione | ✅ |
| | Bilanciamento: come scattato, auto, luce diurna, nuvoloso, ombra, tungsteno, fluorescente, flash, personalizzato | ✅ |
| | Contagocce bilanciamento del bianco | ✅ |
| | Profili colore con intensità (39 profili originali in 5 gruppi) + profili importati `.cube` | ✅ |
| Mixer colore | 8 colori × tonalità / saturazione / luminanza, vista per colore o per regolazione | ✅ |
| | Regolazione mirata (tocca un colore nell'immagine) | ✅ |
| 3. Gradazione colore | Ombre, mezzitoni, alte luci, globale: tonalità, saturazione, luminanza; ruote colore; fusione; bilanciamento | ✅ |
| 4. Effetti | Texture, chiarezza, rimozione foschia | ✅ |
| | Vignettatura: quantità, punto medio, rotondità, sfumatura, alte luci | ✅ |
| | Grana: quantità, dimensione, ruvidità | ✅ |
| | Extra: dissolvenza neri, bagliore, alone pellicola, aberrazione creativa | ✅ |
| 5. Dettagli | Nitidezza: quantità, raggio, dettagli, mascheratura | ✅ |
| | Disturbo luminanza: quantità, dettagli, contrasto | ✅ |
| | Disturbo colore: quantità, dettagli, uniformità | ✅ |
| | Denoise AI, Super Resolution, miglioramento RAW AI | ⛔ AI |
| 6. Ottica | Aberrazione cromatica (rosso/ciano, blu/giallo) | ✅ manuale |
| | Frange viola e verdi: quantità + intervallo tonalità | ✅ |
| | Distorsione e vignettatura obiettivo (manuali) | ✅ |
| | Profili obiettivo automatici (marca/modello) | ⛔ richiede il database Adobe |
| 7. Geometria | Upright: auto, livello, verticale, completo, guidato | ✅ con rilevamento linee (Hough), senza AI |
| | Distorsione, verticale, orizzontale, rotazione, aspetto, scala, spostamento X/Y | ✅ |
| | Vincola ritaglio | ✅ |
| 8. Calibrazione | Tinta ombre, tonalità/saturazione dei primari R/G/B | ✅ |
| 9. Colore punto | Fino a 4 campioni: tonalità, saturazione, luminanza, intervalli, sfumatura, mostra intervallo | ✅ |
| 10. Sfocatura obiettivo | Intensità, zona di fuoco circolare o a fascia, intervallo, transizione, luci del bokeh | ✅ manuale |
| | Mappa di profondità e soggetto automatico | ⛔ AI |
| 11. Maschere | Pennello (dimensione, sfumatura, flusso, gomma), sfumatura lineare, radiale, intervallo colore, intervallo luminanza | ✅ |
| | Aggiungi / sottrai / interseca, inverti, duplica, rinomina, sovrapposizione (colore e opacità) | ✅ fino a 8 maschere × 6 componenti |
| | Regolazioni: esposizione, contrasto, alte luci, ombre, bianchi, neri, temperatura, tinta, tonalità, saturazione, texture, chiarezza, foschia, nitidezza, disturbo, moiré, colore sovrapposto, quantità | ✅ |
| | Soggetto, cielo, sfondo, persone, oggetti, parti del viso | ⛔ AI |
| | Curva locale, intervallo profondità | 🔜 / ⛔ |
| 12. Ritocco | Correggi (healing), clona, occhi rossi; dimensione, sfumatura, opacità; sorgente automatica e spostabile | ✅ |
| | Rimozione generativa, distrazioni, persone, riflessi | ⛔ AI |
| 13. Ritaglio | Libero, bloccato, originale, 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 2.39:1, personalizzato | ✅ |
| | Raddrizzamento automatico e manuale, rotazione 90°, rifletti | ✅ |
| | Guide: terzi, sezione aurea, griglia, diagonali | ✅ |
| 15. Preset | 173 inclusi, ricerca, categorie, intensità, anteprime | ✅ |
| | Preset utente: crea scegliendo i gruppi, modifica, rinomina, elimina, gruppi | ✅ |
| | **Importazione preset Lightroom `.xmp` e `.lrtemplate`** + JSON; esportazione | ✅ conversione approssimata |
| | Preset adattivi AI | ⛔ AI |
| 16. Bianco e nero | Conversione, mixer 8 colori, mix automatico; gradazione/curve/grana/vignettatura | ✅ |
| 17. HDR | Modifica e visualizzazione HDR | ⛔ il browser su Android non offre un canvas HDR |
| 18. Funzioni aggiuntive | Auto, copia/incolla, copia selettiva, ripristino singolo (doppio tocco) e totale, prima/dopo | ✅ |
| | Cronologia con salto a un punto qualsiasi, versioni con nome | ✅ (per ora solo durante la sessione) |
| | Modifica in batch, sincronizzazione modifiche | 🔜 fase 2 |
| | Unione panorama, unione HDR | 🔜 fase 3 |
| 19. Esportazione | JPEG, PNG, TIFF 8 bit, WebP, AVIF (se supportato) | ✅ |
| | Qualità, dimensioni (lato lungo/corto, larghezza, altezza, %), DPI | ✅ |
| | Nitidezza di output (schermo, carta opaca, lucida × 3 livelli) | ✅ |
| | Filigrana testo o immagine: posizione, opacità, dimensione, margine | ✅ |
| | Metadati: tutti, senza GPS, solo copyright, nessuno; nome file con segnaposto | ✅ |
| | Spazi colore Adobe RGB / ProPhoto, esportazione HDR, DNG | ⛔ / 🔜 valutare |

## Fase 2 – Libreria e flusso di lavoro (prossima)
- Salvataggio automatico di foto e modifiche sul telefono (IndexedDB): cronologia e versioni persistenti
- **Importazione RAW** (LibRaw compilato in WebAssembly, libreria open source)
- Libreria: album, cartelle, stelle, contrassegni scelta/rifiuto, etichette colore, parole chiave
- Ricerca e filtri per metadati, ordinamento per data / nome / valutazione, rilevamento duplicati
- Modifica ed esportazione in batch, sincronizzazione delle impostazioni tra foto
- Impostazioni app: tema, cache, preset applicato all'importazione, preferenze di esportazione predefinite

## Fase 3 – Strumenti avanzati
- Unione HDR (esposizioni multiple) e panorama
- Fotocamera integrata: esposizione, ISO, tempi, messa a fuoco, bilanciamento, griglia, timer, flash, secondo ciò che il telefono espone al browser
- Curva locale nelle maschere, più campioni per l'intervallo colore

## Esclusi in modo definitivo
- Tutto ciò che è AI (come richiesto).
- Account, abbonamento, cloud Adobe, album condivisi Adobe: servizi Adobe, non funzioni di modifica.
- Profili Adobe originali, profili obiettivo Adobe: dati proprietari. Al loro posto ci sono profili originali e correzioni manuali.
- Acquisizione DNG dalla fotocamera: il browser riceve solo JPEG dalla fotocamera.

## Limiti tecnici attuali
- L'immagine viene elaborata fino a 4096 px sul lato lungo (limite pratico della GPU dei telefoni).
- Elaborazione a 8 bit per canale.
