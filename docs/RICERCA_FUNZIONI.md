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

## Funzioni AI (aggiunte su richiesta)
| Funzione | Come funziona | Stato |
|---|---|---|
| Super Resolution ×2 / ×4 | Modelli ESRGAN (UpscalerJS, licenza MIT) inclusi nell'app, eseguiti sul telefono con TensorFlow.js. Crea una copia della foto | ✅ offline |
| Mappa di profondità | Depth Anything V2 Small via transformers.js; scaricata al primo uso (~27 MB) e poi in cache | ✅ (testato con un modello di prova: quello reale si scarica sul telefono) |
| Sfocatura obiettivo con profondità | Fuoco scelto toccando il soggetto, sfocatura proporzionale alla distanza | ✅ |
| Maschera intervallo profondità | Seleziona per distanza (vicino/lontano) | ✅ |
| Look da descrizione ("preset adattivi") | Con chiave API: Claude vede la foto e restituisce regolazioni + maschere su cielo/soggetto. Senza chiave: motore offline a parole chiave + correzione automatica dell'esposizione | ✅ |

## Fase 2 – Libreria e flusso di lavoro (completata)
| Funzione | Stato |
|---|---|
| Archivio sul telefono (IndexedDB): foto, modifiche, cronologia, versioni salvate automaticamente | ✅ |
| Importazione multipla dalla Galleria (selettore di Android) | ✅ |
| **"Condividi → Luce Stanza" dalla Galleria** (app installata) | ✅ |
| Importazione RAW (LibRaw in WebAssembly: DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2…) | ✅ (non testato su un RAW reale) |
| Libreria a griglia, colonne regolabili, filtri rapidi (scelte, valutate, modificate, rifiutate) | ✅ |
| Album: crea, rinomina, elimina, aggiungi/togli foto | ✅ |
| Stelle, contrassegni scelta/rifiuto, etichette colore, parole chiave, nome | ✅ |
| Ricerca (nome, parole chiave, fotocamera, obiettivo, album, anno, mese) e filtri combinati | ✅ |
| Ordinamento per data di scatto, importazione, nome, valutazione, ultima modifica | ✅ |
| Rilevamento duplicati all'importazione e ricerca dei duplicati | ✅ |
| Selezione multipla: valutazione, contrassegno, etichetta, parole chiave, album, preset, incolla impostazioni, esportazione, eliminazione | ✅ |
| Impostazioni: tema scuro/OLED/chiaro, preset all'importazione, esportazione predefinita, chiave e modello AI, spazio occupato, archivio permanente | ✅ |

### Limite sulla Galleria
Una web app non può sfogliare da sola tutta la Galleria del telefono: Android lo permette solo alle app native.
Le due strade disponibili sono il selettore multiplo (pulsante +) e "Condividi" dalla Galleria.
Una vera navigazione della Galleria richiederebbe di impacchettare l'app come APK nativo (fattibile in seguito con GitHub Actions).

## Fase 3 – Strumenti avanzati
| Funzione | Stato |
|---|---|
| Backup e ripristino della libreria (.zip, diviso in parti oltre 3,5 GB) | ✅ |
| Cestino con recupero per 30 giorni | ✅ |
| Confronto prima/dopo tenendo premuto sulla foto | ✅ |
| Unione HDR (2-7 foto): allineamento automatico MTB + fusione delle esposizioni multi-scala | ✅ (testato su scene sintetiche) |
| Unione panorama: proiezione cilindrica, punti caratteristici, RANSAC, compensazione esposizione, giunzioni sfumate, ritaglio automatico | ✅ (testato su scene sintetiche; panorami orizzontali) |
| Fotocamera integrata: esposizione, tempo, ISO, bilanciamento, messa a fuoco, zoom, torcia (se il telefono li espone), timer, flash, griglia, forcella HDR automatica | ✅ (testata con fotocamera simulata) |
| Curva tonale nelle maschere | ✅ |
| Rimozione dei "fantasmi" nell'HDR (oggetti in movimento) | ⬜ |
| Panorama sferico / prospettico, più righe | ⬜ |
| Più campioni per l'intervallo colore | ⬜ |
| Versione APK nativa con accesso diretto alla Galleria | ⬜ |

## Esclusi in modo definitivo
- Le funzioni AI non richieste (maschere soggetto/cielo/persone, rimozione generativa, denoise AI).
- Account, abbonamento, cloud Adobe, album condivisi Adobe: servizi Adobe, non funzioni di modifica.
- Profili Adobe originali, profili obiettivo Adobe: dati proprietari. Al loro posto ci sono profili originali e correzioni manuali.
- Acquisizione DNG dalla fotocamera: il browser riceve solo JPEG dalla fotocamera.

## Limiti tecnici attuali
- L'immagine viene elaborata fino a 4096 px sul lato lungo (limite pratico della GPU dei telefoni).
- Elaborazione a 8 bit per canale.

## Realismo e iPhone
| Funzione | Stato |
|---|---|
| Ombre/alte luci locali in luce lineare, contrasto a S, compressione morbida delle alte luci, saturazione senza tagli, vividezza che protegge la pelle | ✅ |
| Chiarezza/texture senza aloni sui bordi forti, vignettatura e bagliore fisici, alone pellicola solo attorno alle luci | ✅ |
| Limiti di realismo su preset e Look AI | ✅ |
| Sfocatura con profondità senza alone, bokeh morbido, rumore del sensore reintegrato, mappa rifinita sui bordi | ✅ |
| Azioni rapide con la profondità: sfondo sfocato, soggetto in risalto, foschia atmosferica, maschere | ✅ |
| Compatibilità iPhone (Safari): limiti dei canvas, HEIC/orientamento, icona Home, niente zoom sui campi, avviso installazione | ✅ (provata con simulazione, non su iPhone reale) |

## Moda, beauty e pubblicazione
| Funzione | Stato |
|---|---|
| Analisi del viso con AI (MediaPipe, offline): pelle, labbra, palpebre, occhi, denti, capelli, persona | ✅ |
| Beauty: levigatura solo sulla pelle vera, esalta trucco, occhi luminosi, denti più bianchi | ✅ |
| Maschere AI: persona, pelle, capelli, labbra, occhi, denti, palpebre, sopracciglia, viso | ✅ |
| Sfondo: sfocato, più scuro, meno colorato (sagoma della persona o mappa di profondità) | ✅ |
| 18 preset "Moda e beauty"; secondo tocco su un preset lo toglie | ✅ |
| Formati social (Instagram, TikTok, Facebook, Pinterest, X, LinkedIn, YouTube, WhatsApp, web, stampa) con ritaglio sul viso, bordi o sfondo sfocato; più formati insieme | ✅ |
| Scritte sulla foto (5 caratteri, modelli: nome e profilo, prodotti, promozione, titolo, firma) | ✅ |
| Prima/dopo (affiancate, sovrapposte, metà e metà), collage del look, logo o firma | ✅ |
