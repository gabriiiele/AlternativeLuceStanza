'use strict';

/* Profili colore: un "punto di partenza" sotto le regolazioni, con intensità 0..2.
   Sono profili originali, non copie di quelli Adobe. Stesso formato dei preset. */

const PROFILES = [
  // Base
  { group: 'Base', name: 'Standard', def: {} },
  { group: 'Base', name: 'Colore', def: { contrast: 0.08, vib: 0.1, sat: 0.03 } },
  { group: 'Base', name: 'Vivido', def: { contrast: 0.15, vib: 0.3, sat: 0.12, clarity: 0.05 } },
  { group: 'Base', name: 'Paesaggio', def: { contrast: 0.12, vib: 0.2, hsl: { 3: [0, 0.2, -0.05], 4: [0, 0.15, 0], 5: [0, 0.2, -0.1] } } },
  { group: 'Base', name: 'Ritratto', def: { contrast: 0.02, vib: 0.05, hsl: { 0: [0, -0.1, 0.05], 1: [0, -0.08, 0.08] } } },
  { group: 'Base', name: 'Neutro', def: { contrast: -0.18, sat: -0.08, hi: 0.05, sh: 0.08 } },
  { group: 'Base', name: 'Monocromatico', def: { mono: 1, contrast: 0.1 } },
  // Artistici
  { group: 'Artistici', name: 'Artistico 01 – Acqua', def: { temp: -0.15, gsH: 190, gsS: 0.4, ghH: 170, ghS: 0.2, sat: -0.1 } },
  { group: 'Artistici', name: 'Artistico 02 – Ambra', def: { temp: 0.3, gsH: 30, gsS: 0.3, ghH: 45, ghS: 0.35 } },
  { group: 'Artistici', name: 'Artistico 03 – Magenta', def: { tint: 0.25, gsH: 300, gsS: 0.35, ghH: 330, ghS: 0.2 } },
  { group: 'Artistici', name: 'Artistico 04 – Smeraldo', def: { tint: -0.25, gsH: 150, gsS: 0.4, ghH: 90, ghS: 0.2 } },
  { group: 'Artistici', name: 'Artistico 05 – Crepuscolo', def: { gsH: 250, gsS: 0.5, ghH: 25, ghS: 0.5, contrast: 0.1 } },
  { group: 'Artistici', name: 'Artistico 06 – Inverso', def: { gsH: 40, gsS: 0.5, ghH: 210, ghS: 0.45 } },
  { group: 'Artistici', name: 'Artistico 07 – Elettrico', def: { vib: 0.5, sat: 0.2, gsH: 260, gsS: 0.4, ghH: 180, ghS: 0.4, contrast: 0.15 } },
  { group: 'Artistici', name: 'Artistico 08 – Polvere', def: { sat: -0.4, temp: 0.15, fade: 0.25, gsH: 35, gsS: 0.25 } },
  // B&N
  { group: 'B&N', name: 'B&N 01 – Neutro', def: { mono: 1 } },
  { group: 'B&N', name: 'B&N 02 – Contrasto', def: { mono: 1, contrast: 0.35 } },
  { group: 'B&N', name: 'B&N 03 – Morbido', def: { mono: 1, contrast: -0.15, sh: 0.15 } },
  { group: 'B&N', name: 'B&N 04 – Filtro rosso', def: { mono: 1, contrast: 0.2, bw: { 0: 0.8, 1: 0.6, 5: -0.8, 4: -0.6 } } },
  { group: 'B&N', name: 'B&N 05 – Filtro verde', def: { mono: 1, bw: { 3: 0.8, 2: 0.4, 0: -0.4 } } },
  { group: 'B&N', name: 'B&N 06 – Filtro blu', def: { mono: 1, bw: { 5: 0.7, 4: 0.5, 0: -0.5, 1: -0.4 } } },
  { group: 'B&N', name: 'B&N 07 – Infrarosso', def: { mono: 1, bw: { 3: 1, 2: 0.6, 5: -0.9 }, glow: 0.2 } },
  { group: 'B&N', name: 'B&N 08 – Caldo', def: { mono: 1, gsH: 35, gsS: 0.3, ghH: 45, ghS: 0.25 } },
  { group: 'B&N', name: 'B&N 09 – Freddo', def: { mono: 1, gsH: 215, gsS: 0.3, ghH: 200, ghS: 0.15 } },
  // Moderni
  { group: 'Moderni', name: 'Moderno 01 – Pulito', def: { contrast: 0.1, sat: -0.15, clarity: 0.1 } },
  { group: 'Moderni', name: 'Moderno 02 – Desaturato', def: { sat: -0.35, contrast: 0.12 } },
  { group: 'Moderni', name: 'Moderno 03 – Freddo', def: { temp: -0.2, sat: -0.1, gsH: 210, gsS: 0.25 } },
  { group: 'Moderni', name: 'Moderno 04 – Caldo opaco', def: { temp: 0.15, fade: 0.2, sat: -0.1 } },
  { group: 'Moderni', name: 'Moderno 05 – Contrasto pop', def: { contrast: 0.3, vib: 0.2 } },
  { group: 'Moderni', name: 'Moderno 06 – Teal', def: { gsH: 185, gsS: 0.35, ghH: 35, ghS: 0.25 } },
  { group: 'Moderni', name: 'Moderno 07 – Luminoso', def: { exp: 0.15, sh: 0.2, contrast: -0.05, vib: 0.1 } },
  { group: 'Moderni', name: 'Moderno 08 – Notturno', def: { exp: -0.15, temp: -0.2, gsH: 230, gsS: 0.4, contrast: 0.15 } },
  // Vintage
  { group: 'Vintage', name: 'Vintage 01 – Seppia leggera', def: { sat: -0.4, temp: 0.2, gsH: 30, gsS: 0.3, ghH: 40, ghS: 0.3 } },
  { group: 'Vintage', name: 'Vintage 02 – Sbiadito', def: { fade: 0.35, sat: -0.2, contrast: -0.1 } },
  { group: 'Vintage', name: 'Vintage 03 – Ciano', def: { gsH: 180, gsS: 0.4, ghH: 50, ghS: 0.3, fade: 0.15 } },
  { group: 'Vintage', name: 'Vintage 04 – Rosato', def: { tint: 0.15, gsH: 340, gsS: 0.3, fade: 0.2 } },
  { group: 'Vintage', name: 'Vintage 05 – Giallo', def: { temp: 0.25, gsH: 55, gsS: 0.3, ghH: 50, ghS: 0.35, sat: -0.1 } },
  { group: 'Vintage', name: 'Vintage 06 – Verde pellicola', def: { tint: -0.15, gsH: 140, gsS: 0.35, fade: 0.2 } },
  { group: 'Vintage', name: 'Vintage 07 – Cartolina', def: { sat: -0.25, temp: 0.2, fade: 0.3, vig: 0.3 } },
  { group: 'Vintage', name: 'Vintage 08 – Diapositiva', def: { contrast: 0.2, sat: 0.1, gsH: 200, gsS: 0.3, ghH: 40, ghS: 0.3 } },
];

const PROFILE_GROUPS = ['Base', 'Artistici', 'B&N', 'Moderni', 'Vintage'];
