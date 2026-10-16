# Catalogo funzioni degli editor foto

Ricerca basata sulla conoscenza di Lightroom (mobile e desktop), Snapseed, VSCO, Photoshop Express, Capture One,
darktable, RawTherapee, Polarr, Afterlight, Pixlr, PicsArt, Photoleap e Facetune.
Non è una ricerca web in tempo reale: è un inventario delle funzioni note. Stato: ✅ fatto · 🟡 parziale · ⬜ da fare.

## 1. Luce e tono
| Funzione | Stato | Note |
|---|---|---|
| Esposizione | ✅ | In spazio lineare, come i programmi professionali |
| Contrasto | ✅ | |
| Alteluci / Ombre / Bianchi / Neri | ✅ | |
| Curva dei toni (RGB, R, G, B) | ✅ | Curva monotona, punti trascinabili |
| Curva a parametri (regioni) | ⬜ | |
| Chiarezza, Texture | ✅ | Contrasto locale a due scale |
| Foschia (Dehaze) | ✅ | Positiva e negativa |
| Auto tono | 🟡 | Base statistica; versione con modello AI da fare |
| Istogramma | ✅ | RGB, in tempo reale |
| Clipping (avviso zone bruciate/chiuse) | ⬜ | |
| Esposizione HDR / unione scatti | ⬜ | |

## 2. Colore
| Funzione | Stato | Note |
|---|---|---|
| Temperatura e tinta | ✅ | Gli slider sono relativi, non in Kelvin |
| Contagocce bilanciamento bianco | ⬜ | |
| Vividezza, Saturazione | ✅ | |
| HSL su 8 colori | ✅ | |
| Gradazione colore a 3 toni | ✅ | Ombre / medi / luci + bilanciamento |
| Calibrazione primari (stile Lightroom) | ⬜ | |
| Bianco e nero con mix per colore | ✅ | |
| Duotono / splittoning | ✅ | Tramite Gradazione + B&N |
| Dissolvenza dei neri (fade) | ✅ | |
| LUT 3D `.cube` | ✅ | Importazione con intensità |
| Selettore di colore (modifica selettiva) | ⬜ | Stile Snapseed "Selettivo" |

## 3. Dettaglio ed effetti
| Funzione | Stato |
|---|---|
| Nitidezza | ✅ |
| Riduzione rumore (luminanza) | ✅ |
| Riduzione rumore colore | ⬜ |
| Maschera di nitidezza avanzata (raggio/dettaglio/mascheratura) | ⬜ |
| Grana (quantità, dimensione) | ✅ |
| Vignettatura (quantità, centro, sfumatura) | ✅ |
| Bagliore (glow / bloom) | ✅ |
| Alone di alteluci (halation, tipico della pellicola) | ✅ |
| Aberrazione cromatica (effetto creativo) | ✅ |
| Correzione aberrazione cromatica | ⬜ |
| Correzione distorsione lente / profili obiettivo | ⬜ |
| Sfocatura (tilt-shift, radiale, bokeh) | ⬜ |
| Doppia esposizione | ⬜ |
| Pixel / glitch / mosaico | ⬜ |
| Sovrapposizioni: polvere, luce, graffi, bordi pellicola | ⬜ |
| Testo e adesivi | ⬜ |
| Cornici | ⬜ |

## 4. Geometria
| Funzione | Stato |
|---|---|
| Ritaglio con proporzioni (1:1, 4:5, 3:2, 16:9, 2.39:1…) | ✅ |
| Raddrizza (rotazione fine) con riempimento automatico | ✅ |
| Rotazione 90° e specchio | ✅ |
| Zoom di ritaglio | ✅ |
| Ritaglio libero con trascinamento | ⬜ |
| Prospettiva (verticale, orizzontale) / Upright | ⬜ |
| Spostamento della zona di ritaglio | ⬜ |

## 5. Modifiche locali
| Funzione | Stato | Note |
|---|---|---|
| Maschera lineare | ✅ | 2 maschere |
| Maschera radiale | ✅ | |
| Pennello | ⬜ | |
| Maschera per intervallo di colore / luminosità | ⬜ | |
| Maschera soggetto / cielo / sfondo (AI) | ⬜ | Richiede un modello di segmentazione |
| Maschera persone (volto, pelle, occhi) | ⬜ | |
| Più di 2 maschere, opzioni per maschera | ⬜ | |

## 6. Ritocco
| Funzione | Stato |
|---|---|
| Rimozione macchie (clone/heal) | ⬜ |
| Rimozione oggetti (AI) | ⬜ |
| Correzione occhi rossi | ⬜ |
| Levigatura pelle / ritocco volto | 🟡 (preset Ritratto, senza maschera pelle) |
| Aumento risoluzione (AI) | ⬜ |
| Riduzione rumore (AI) | ⬜ |

## 7. Flusso di lavoro
| Funzione | Stato |
|---|---|
| Annulla / ripeti | ✅ |
| Prima/dopo | ✅ |
| Zoom e spostamento | ✅ |
| Preset con anteprima, ricerca, categorie, intensità | ✅ |
| Preset personali | ✅ |
| Copia / incolla impostazioni | ✅ |
| Doppio tocco sullo slider = azzera | ✅ |
| Esportazione JPEG / PNG / WebP, qualità e dimensione | ✅ |
| Apertura di file RAW | ⬜ (LibRaw) |
| Libreria / catalogo, valutazioni, etichette | ⬜ |
| Modifica in blocco (più foto) | ⬜ |
| Salvataggio delle modifiche per foto | ⬜ |
| Funzionamento offline | ✅ |
| Video | ⬜ |

## 8. Preset inclusi
Categorie: 173 preset: Cinema (41), Pellicola (26), Estetici (44), B&N (18), Ritratto (12), Paesaggio (15), Città e Cibo (17), più i tuoi.
Sono look originali ispirati a stili noti; non sono copie dei preset di alcun prodotto.

## 9. Proposte per la prossima fase (in ordine di impatto)
1. **Salvataggio per foto** e ripresa del lavoro (oggi le modifiche si perdono chiudendo l'app).
2. **RAW** con LibRaw compilato in WebAssembly.
3. **Ritaglio libero** trascinando i bordi e **pennello** per le maschere.
4. **Maschere AI** (soggetto, cielo) con un modello leggero eseguito sul telefono.
5. **Clone/ripara** e **rimozione oggetti**.
6. **Sovrapposizioni** (polvere, luce, bordi pellicola) e **cornici**.
7. **Modifica in blocco** e catalogo.
