'use strict';

/* Libreria di preset. Ogni preset imposta solo i parametri che indica; gli altri restano a zero.
   hsl: { indiceColore: [tonalità, saturazione, luminanza] }  (0 rossi, 1 arancio, 2 gialli, 3 verdi, 4 azzurri, 5 blu, 6 viola, 7 magenta)
   bw:  { indiceColore: peso }  mix del bianco e nero
   gsH/gsS ombre, gmH/gmS medi, ghH/ghS alteluci (tonalità in gradi, saturazione 0..1), gBal bilanciamento */

const PRESET_DEFS = [];
const P = (cat, name, def) => PRESET_DEFS.push({ cat, name, def });

/* Curve di uso comune */
const S_CURVE = [[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]];
const S_STRONG = [[0, 0], [0.25, 0.16], [0.75, 0.84], [1, 1]];
const MATTE = [[0, 0.07], [0.25, 0.27], [0.75, 0.78], [1, 0.95]];
const LIFT = [[0, 0.04], [0.5, 0.5], [1, 1]];
const FILM = [[0, 0.06], [0.25, 0.24], [0.75, 0.79], [1, 0.96]];

/* ===== CINEMA ===== */
P('Cinema', 'Teal & Orange', { contrast: 0.2, sat: -0.05, gsH: 190, gsS: 0.6, ghH: 32, ghS: 0.55, gmH: 28, gmS: 0.15, curve: S_CURVE, vig: 0.2,
  hsl: { 0: [0, 0.1, 0], 1: [0, 0.15, 0.05], 3: [-0.3, -0.4, 0], 4: [0.1, 0.2, -0.1], 5: [0.1, 0.2, -0.2] } });
P('Cinema', 'Teal & Orange Soft', { contrast: 0.08, sat: -0.08, gsH: 195, gsS: 0.35, ghH: 35, ghS: 0.3, curve: LIFT, fade: 0.2, vig: 0.15 });
P('Cinema', 'Blockbuster', { contrast: 0.3, clarity: 0.25, vib: 0.2, gsH: 205, gsS: 0.5, ghH: 38, ghS: 0.5, curve: S_STRONG, vig: 0.3, sharp: 0.3 });
P('Cinema', 'Neon Noir', { contrast: 0.3, exp: -0.2, sat: 0.1, gsH: 260, gsS: 0.7, gmH: 300, gmS: 0.3, ghH: 330, ghS: 0.5, curve: S_STRONG, vig: 0.4, glow: 0.4 });
P('Cinema', 'Cyber Metropoli', { contrast: 0.25, exp: -0.15, clarity: 0.3, gsH: 200, gsS: 0.65, ghH: 320, ghS: 0.55, vib: 0.3, glow: 0.35, vig: 0.3, curve: S_CURVE });
P('Cinema', 'Orange Haze 2049', { contrast: 0.1, dehaze: -0.3, temp: 0.45, sat: -0.1, gsH: 20, gsS: 0.4, ghH: 30, ghS: 0.5, gmH: 25, gmS: 0.3, glow: 0.3, curve: LIFT });
P('Cinema', 'Codice Verde', { contrast: 0.2, tint: -0.35, temp: -0.1, sat: -0.2, gsH: 150, gsS: 0.5, gmH: 130, gmS: 0.35, ghH: 110, ghS: 0.25, curve: S_CURVE, vig: 0.25 });
P('Cinema', 'Pastello Simmetrico', { exp: 0.15, contrast: -0.1, temp: 0.25, tint: 0.05, vib: 0.2, sat: -0.05, gsH: 350, gsS: 0.2, ghH: 50, ghS: 0.3, curve: LIFT, fade: 0.2,
  hsl: { 0: [0.1, -0.1, 0.1], 2: [0, 0.1, 0.1], 5: [0, -0.3, 0.1] } });
P('Cinema', 'Favola Rosso-Verde', { contrast: 0.15, temp: 0.2, tint: -0.1, vib: 0.3, gsH: 140, gsS: 0.35, ghH: 25, ghS: 0.45,
  hsl: { 0: [0, 0.3, 0], 3: [-0.15, 0.2, -0.05] }, curve: S_CURVE });
P('Cinema', 'Rissa Sporca', { contrast: 0.3, sat: -0.35, tint: -0.2, temp: 0.05, gsH: 160, gsS: 0.35, ghH: 70, ghS: 0.3, grain: 0.5, curve: S_STRONG, vig: 0.4, clarity: 0.3 });
P('Cinema', 'Sette Peccati', { contrast: 0.35, exp: -0.3, sat: -0.5, temp: 0.1, tint: -0.1, gsH: 90, gsS: 0.3, ghH: 50, ghS: 0.3, grain: 0.35, curve: S_STRONG, vig: 0.45, dehaze: 0.25 });
P('Cinema', 'Bleach Bypass', { contrast: 0.4, sat: -0.55, clarity: 0.35, curve: S_STRONG, grain: 0.2, vig: 0.2 });
P('Cinema', 'Frontiera Calda', { exp: 0.05, contrast: 0.15, temp: 0.3, sat: -0.2, gsH: 25, gsS: 0.3, ghH: 40, ghS: 0.4, fade: 0.1, vig: 0.3, grain: 0.15, curve: S_CURVE });
P('Cinema', 'Strada Furiosa', { contrast: 0.3, vib: 0.5, sat: 0.2, temp: 0.4, gsH: 200, gsS: 0.45, ghH: 30, ghS: 0.6, clarity: 0.4, curve: S_STRONG, vig: 0.25,
  hsl: { 1: [0, 0.3, 0], 5: [0, 0.2, -0.3] } });
P('Cinema', 'Duna', { exp: 0.1, contrast: 0.05, temp: 0.3, sat: -0.35, gsH: 30, gsS: 0.3, gmH: 35, gmS: 0.3, ghH: 45, ghS: 0.35, dehaze: -0.15, curve: LIFT, fade: 0.15, vig: 0.2,
  hsl: { 1: [0, -0.2, 0.1], 2: [0, -0.1, 0] } });
P('Cinema', 'Risata Amara', { contrast: 0.25, tint: -0.15, sat: -0.1, gsH: 175, gsS: 0.5, gmH: 120, gmS: 0.2, ghH: 20, ghS: 0.45, vig: 0.4, grain: 0.25, curve: S_CURVE,
  hsl: { 0: [0, 0.35, -0.05], 3: [-0.2, 0.3, 0] } });
P('Cinema', 'Guida di Notte', { contrast: 0.2, exp: -0.1, vib: 0.2, gsH: 250, gsS: 0.5, gmH: 300, gmS: 0.35, ghH: 340, ghS: 0.55, glow: 0.4, halation: 0.2, vig: 0.3, curve: S_CURVE });
P('Cinema', 'Sogno Musicale', { exp: 0.1, vib: 0.4, sat: 0.1, temp: 0.2, gsH: 290, gsS: 0.2, ghH: 40, ghS: 0.35, glow: 0.2, curve: LIFT, fade: 0.1 });
P('Cinema', 'Spazio Profondo', { contrast: 0.2, temp: -0.3, sat: -0.3, gsH: 215, gsS: 0.45, ghH: 190, ghS: 0.2, curve: S_CURVE, vig: 0.35, clarity: 0.2, dehaze: 0.2 });
P('Cinema', 'Thriller Freddo', { contrast: 0.2, temp: -0.35, sat: -0.3, tint: -0.05, gsH: 205, gsS: 0.45, ghH: 190, ghS: 0.25, curve: S_CURVE, vig: 0.3, grain: 0.15 });
P('Cinema', 'Notte Americana', { exp: -0.5, contrast: 0.1, temp: -0.55, sat: -0.2, gsH: 225, gsS: 0.6, ghH: 210, ghS: 0.3, vig: 0.4, curve: S_CURVE });
P('Cinema', 'Luce di Luna', { exp: -0.35, contrast: 0.2, temp: -0.4, gsH: 235, gsS: 0.55, gmH: 210, gmS: 0.2, ghH: 190, ghS: 0.3, glow: 0.2, vig: 0.35, curve: S_CURVE,
  hsl: { 5: [0, 0.3, 0.1] } });
P('Cinema', 'Horror', { exp: -0.3, contrast: 0.35, sat: -0.4, tint: -0.3, gsH: 140, gsS: 0.45, ghH: 80, ghS: 0.25, vig: 0.6, grain: 0.35, curve: S_STRONG, dehaze: 0.2 });
P('Cinema', 'Kodak Vision 500T', { contrast: 0.1, temp: -0.1, sat: -0.05, gsH: 195, gsS: 0.3, ghH: 35, ghS: 0.25, grain: 0.3, halation: 0.2, curve: FILM, fade: 0.1 });
P('Cinema', 'Fuji Eterna', { contrast: -0.05, temp: -0.05, tint: -0.1, sat: -0.2, gsH: 170, gsS: 0.25, ghH: 60, ghS: 0.15, grain: 0.25, curve: LIFT, fade: 0.15 });
P('Cinema', 'Technicolor', { contrast: 0.25, vib: 0.5, sat: 0.3, gsH: 180, gsS: 0.25, ghH: 20, ghS: 0.3, curve: S_STRONG, glow: 0.1, hsl: { 0: [0, 0.3, -0.05], 3: [0, 0.2, 0], 5: [0, 0.3, -0.1] } });
P('Cinema', 'Due Strisce Tech', { contrast: 0.2, vib: 0.2, sat: 0.1, gsH: 175, gsS: 0.5, ghH: 15, ghS: 0.55, curve: S_CURVE,
  hsl: { 2: [-0.3, 0, 0], 3: [-0.6, -0.5, 0], 5: [0.2, -0.3, 0] } });
P('Cinema', 'Anni Settanta', { contrast: 0.1, temp: 0.35, tint: 0.05, sat: -0.1, gsH: 40, gsS: 0.35, ghH: 50, ghS: 0.35, grain: 0.4, fade: 0.2, curve: FILM, vig: 0.3, halation: 0.15 });
P('Cinema', 'Anamorfico', { contrast: 0.2, temp: -0.05, gsH: 205, gsS: 0.4, ghH: 30, ghS: 0.3, glow: 0.45, halation: 0.35, ca: 0.25, vig: 0.35, curve: S_CURVE });
P('Cinema', 'Tramonto Epico', { exp: -0.1, contrast: 0.25, temp: 0.4, vib: 0.4, gsH: 240, gsS: 0.35, ghH: 25, ghS: 0.65, glow: 0.3, vig: 0.3, curve: S_CURVE, dehaze: 0.15 });
P('Cinema', 'Apocalisse', { exp: -0.15, contrast: 0.3, temp: 0.3, sat: -0.35, tint: -0.1, dehaze: 0.3, gsH: 40, gsS: 0.35, ghH: 40, ghS: 0.3, grain: 0.4, vig: 0.5, curve: S_STRONG, clarity: 0.4 });
P('Cinema', 'Dramma Storico', { contrast: 0.15, temp: 0.2, sat: -0.3, gsH: 30, gsS: 0.3, ghH: 45, ghS: 0.3, grain: 0.3, fade: 0.1, vig: 0.4, curve: FILM });
P('Cinema', 'Film Muto', { mono: 1, contrast: 0.2, fade: 0.25, grain: 0.6, grainSize: 1.6, vig: 0.55, exp: 0.1, curve: S_CURVE, gsH: 40, gsS: 0.15, ghH: 45, ghS: 0.2, denoise: 0 });
P('Cinema', 'Fantascienza Anni 80', { contrast: 0.2, vib: 0.3, gsH: 270, gsS: 0.45, ghH: 190, ghS: 0.4, glow: 0.4, ca: 0.2, vig: 0.3, curve: S_CURVE });
P('Cinema', 'Poliziesco Metropolitano', { contrast: 0.25, sat: -0.25, temp: -0.1, gsH: 200, gsS: 0.4, ghH: 50, ghS: 0.25, grain: 0.3, clarity: 0.3, vig: 0.3, curve: S_STRONG });
P('Cinema', 'Cinema Indie', { exp: 0.1, contrast: -0.1, temp: 0.12, sat: -0.15, gsH: 190, gsS: 0.2, ghH: 40, ghS: 0.25, grain: 0.25, fade: 0.2, curve: MATTE });
P('Cinema', 'Anime Cinematico', { exp: 0.15, vib: 0.5, sat: 0.2, contrast: 0.15, clarity: -0.1, gsH: 215, gsS: 0.25, ghH: 40, ghS: 0.3, glow: 0.25, curve: S_CURVE });
P('Cinema', 'Documentario', { contrast: 0.1, sat: -0.2, clarity: 0.2, grain: 0.15, temp: 0.05, curve: S_CURVE, vig: 0.15 });
P('Cinema', 'Videogioco Next-Gen', { contrast: 0.2, vib: 0.35, clarity: 0.4, dehaze: 0.2, gsH: 205, gsS: 0.25, ghH: 35, ghS: 0.25, sharp: 0.5, curve: S_CURVE, vig: 0.2 });
P('Cinema', 'Survival Grigio', { contrast: 0.25, sat: -0.55, temp: -0.1, dehaze: 0.2, clarity: 0.4, grain: 0.3, vig: 0.4, curve: S_STRONG, gsH: 200, gsS: 0.2 });
P('Cinema', 'Post-Apocalisse Verde', { contrast: 0.2, sat: -0.3, tint: -0.3, temp: 0.1, gsH: 130, gsS: 0.4, ghH: 70, ghS: 0.4, clarity: 0.35, dehaze: 0.25, vig: 0.45, grain: 0.3, curve: S_CURVE });

/* ===== PELLICOLA ===== */
P('Pellicola', 'Portrait 400', { exp: 0.1, contrast: -0.05, temp: 0.1, tint: 0.05, sat: -0.05, gsH: 190, gsS: 0.12, ghH: 40, ghS: 0.2, grain: 0.25, fade: 0.1, curve: LIFT,
  hsl: { 1: [0, -0.05, 0.1], 3: [0.1, -0.2, 0] } });
P('Pellicola', 'Portrait 160', { exp: 0.15, contrast: -0.15, temp: 0.08, sat: -0.15, gsH: 200, gsS: 0.1, ghH: 45, ghS: 0.15, grain: 0.15, fade: 0.15, curve: LIFT });
P('Pellicola', 'Ektar Saturo', { contrast: 0.2, vib: 0.35, sat: 0.2, temp: 0.05, grain: 0.15, curve: S_CURVE, hsl: { 0: [0, 0.2, -0.05], 5: [0, 0.15, -0.1] } });
P('Pellicola', 'Gold 200', { exp: 0.1, contrast: 0.05, temp: 0.35, tint: 0.05, vib: 0.15, gsH: 40, gsS: 0.25, ghH: 45, ghS: 0.3, grain: 0.3, fade: 0.1, curve: FILM,
  hsl: { 2: [0, 0.2, 0.1] } });
P('Pellicola', 'Ultramax', { contrast: 0.15, temp: 0.2, vib: 0.25, sat: 0.1, grain: 0.3, gsH: 35, gsS: 0.2, ghH: 40, ghS: 0.2, curve: S_CURVE });
P('Pellicola', 'Velvia Acceso', { contrast: 0.3, vib: 0.4, sat: 0.35, clarity: 0.15, curve: S_STRONG, grain: 0.1, hsl: { 0: [0, 0.2, 0], 3: [0, 0.25, 0], 5: [0, 0.25, -0.1] } });
P('Pellicola', 'Provia Neutro', { contrast: 0.12, vib: 0.15, sat: 0.05, curve: S_CURVE, grain: 0.1 });
P('Pellicola', 'Astia Morbida', { contrast: -0.05, vib: 0.1, sat: -0.05, temp: 0.03, fade: 0.1, curve: LIFT, grain: 0.1 });
P('Pellicola', 'Superia Verde', { contrast: 0.12, temp: -0.05, tint: -0.15, vib: 0.2, gsH: 160, gsS: 0.2, ghH: 50, ghS: 0.15, grain: 0.35, curve: S_CURVE,
  hsl: { 3: [0, 0.25, 0], 5: [0, 0.1, 0] } });
P('Pellicola', 'Kodachrome', { contrast: 0.22, temp: 0.2, vib: 0.3, sat: 0.1, gsH: 25, gsS: 0.2, ghH: 45, ghS: 0.2, grain: 0.25, curve: S_CURVE,
  hsl: { 0: [0, 0.3, -0.05], 2: [0, 0.2, 0], 5: [-0.1, 0.15, -0.1] } });
P('Pellicola', 'Ektachrome', { contrast: 0.15, temp: -0.15, vib: 0.3, gsH: 200, gsS: 0.2, grain: 0.15, curve: S_CURVE, hsl: { 5: [0, 0.2, 0], 4: [0, 0.2, 0] } });
P('Pellicola', 'Tri-X Bianco e Nero', { mono: 1, contrast: 0.3, grain: 0.7, grainSize: 1.3, curve: S_STRONG, vig: 0.2, bw: { 0: 0.1, 2: 0.1 } });
P('Pellicola', 'HP5 Morbida', { mono: 1, contrast: 0.12, grain: 0.5, grainSize: 1.2, fade: 0.1, curve: LIFT, bw: { 0: 0.05 } });
P('Pellicola', 'Cinestill 800T', { contrast: 0.1, temp: -0.2, tint: 0.05, sat: -0.05, gsH: 185, gsS: 0.4, ghH: 20, ghS: 0.3, halation: 0.6, glow: 0.3, grain: 0.35, curve: FILM, fade: 0.1 });
P('Pellicola', 'Polaroid 600', { exp: 0.15, contrast: -0.1, temp: 0.1, tint: 0.1, sat: -0.2, gsH: 170, gsS: 0.25, ghH: 50, ghS: 0.3, fade: 0.35, vig: 0.4, grain: 0.3, curve: MATTE, ca: 0.1 });
P('Pellicola', 'Polaroid SX-70', { exp: 0.1, contrast: 0.05, temp: 0.3, tint: 0.08, sat: -0.1, gsH: 30, gsS: 0.3, ghH: 50, ghS: 0.35, fade: 0.3, vig: 0.45, grain: 0.35, glow: 0.15, curve: MATTE });
P('Pellicola', 'Lomo', { contrast: 0.35, sat: 0.3, vib: 0.2, vig: 0.8, vigMid: 0.25, gsH: 150, gsS: 0.2, ghH: 50, ghS: 0.3, grain: 0.3, curve: S_STRONG, ca: 0.2 });
P('Pellicola', 'Cross Process', { contrast: 0.3, sat: 0.25, gsH: 160, gsS: 0.5, gmH: 100, gmS: 0.15, ghH: 55, ghS: 0.55, curve: [[0, 0.02], [0.25, 0.14], [0.75, 0.88], [1, 1]], cr: [[0, 0], [0.5, 0.45], [1, 1]], cb: [[0, 0.05], [0.5, 0.6], [1, 0.85]], grain: 0.2 });
P('Pellicola', 'Pellicola Scaduta', { exp: 0.1, contrast: -0.2, temp: 0.15, tint: 0.2, sat: -0.3, gsH: 330, gsS: 0.35, ghH: 70, ghS: 0.3, fade: 0.4, grain: 0.55, vig: 0.35, curve: MATTE, ca: 0.15 });
P('Pellicola', 'Instax', { exp: 0.2, contrast: -0.12, temp: -0.05, tint: 0.12, vib: 0.2, gsH: 330, gsS: 0.2, ghH: 190, ghS: 0.15, fade: 0.2, grain: 0.15, glow: 0.15, curve: LIFT });
P('Pellicola', 'Usa e Getta', { exp: 0.1, contrast: 0.3, temp: 0.15, sat: 0.1, vig: 0.5, gsH: 150, gsS: 0.2, ghH: 50, ghS: 0.2, grain: 0.5, curve: S_STRONG, glow: 0.2, ca: 0.2 });
P('Pellicola', '35mm Sbiadita', { contrast: -0.1, sat: -0.2, temp: 0.1, fade: 0.35, grain: 0.4, curve: MATTE, gsH: 190, gsS: 0.2, ghH: 40, ghS: 0.2 });
P('Pellicola', 'Agfa Vista', { contrast: 0.12, temp: 0.12, vib: 0.2, sat: 0.05, gsH: 20, gsS: 0.25, ghH: 50, ghS: 0.2, grain: 0.3, curve: S_CURVE, hsl: { 0: [0, 0.25, 0], 3: [0.2, -0.1, 0] } });
P('Pellicola', 'Fujicolor C200', { contrast: 0.05, temp: -0.1, tint: -0.1, vib: 0.2, gsH: 170, gsS: 0.2, ghH: 330, ghS: 0.15, grain: 0.3, fade: 0.1, curve: LIFT });
P('Pellicola', 'Slide Retro', { contrast: 0.25, sat: 0.15, temp: 0.15, vib: 0.2, gsH: 190, gsS: 0.25, ghH: 40, ghS: 0.25, vig: 0.35, grain: 0.2, curve: S_STRONG });
P('Pellicola', 'Bianco e Nero Orto', { mono: 1, contrast: 0.45, grain: 0.15, curve: S_STRONG, bw: { 0: 0.2, 2: 0.2 }, vig: 0.15 });

/* ===== ESTETICI ===== */
P('Estetici', 'Luminoso e Arioso', { exp: 0.35, contrast: -0.15, hi: -0.2, sh: 0.4, wh: 0.1, vib: 0.1, sat: -0.1, temp: 0.05, fade: 0.1, curve: LIFT });
P('Estetici', 'Sognante', { exp: 0.2, contrast: -0.2, hi: -0.3, sh: 0.3, sat: -0.05, glow: 0.55, clarity: -0.25, temp: 0.05, tint: 0.05, curve: LIFT, fade: 0.1 });
P('Estetici', 'Caramella Pastello', { exp: 0.2, contrast: -0.2, vib: 0.35, sat: -0.05, gsH: 330, gsS: 0.2, ghH: 190, ghS: 0.2, fade: 0.2, glow: 0.2, curve: MATTE });
P('Estetici', 'Scuro e Intenso', { exp: -0.3, contrast: 0.3, sh: -0.2, sat: -0.15, temp: 0.05, gsH: 190, gsS: 0.3, ghH: 40, ghS: 0.25, vig: 0.5, curve: S_STRONG, clarity: 0.2 });
P('Estetici', 'Ora d\'Oro', { exp: 0.1, contrast: 0.1, temp: 0.5, vib: 0.3, gsH: 25, gsS: 0.3, ghH: 40, ghS: 0.45, glow: 0.25, halation: 0.15, dehaze: -0.1, curve: S_CURVE });
P('Estetici', 'Tramonto Caldo', { contrast: 0.15, temp: 0.45, tint: 0.05, vib: 0.35, gsH: 330, gsS: 0.35, ghH: 30, ghS: 0.5, glow: 0.2, curve: S_CURVE });
P('Estetici', 'Ora Blu', { exp: -0.1, contrast: 0.1, temp: -0.5, vib: 0.2, gsH: 230, gsS: 0.5, ghH: 200, ghS: 0.3, curve: S_CURVE, vig: 0.2 });
P('Estetici', 'Opaco Nero', { contrast: -0.05, bl: 0.3, fade: 0.5, sat: -0.1, curve: MATTE, grain: 0.1 });
P('Estetici', 'Opaco Crema', { exp: 0.1, contrast: -0.15, temp: 0.2, tint: 0.03, sat: -0.2, fade: 0.45, gsH: 40, gsS: 0.2, ghH: 50, ghS: 0.25, curve: MATTE });
P('Estetici', 'Vintage Anni 70', { contrast: -0.05, temp: 0.3, tint: 0.1, sat: -0.15, fade: 0.35, gsH: 30, gsS: 0.35, ghH: 55, ghS: 0.4, grain: 0.4, vig: 0.4, curve: MATTE });
P('Estetici', 'Retro Anni 80', { contrast: 0.1, vib: 0.3, temp: 0.1, gsH: 280, gsS: 0.4, ghH: 20, ghS: 0.35, grain: 0.25, glow: 0.2, ca: 0.15, fade: 0.15, curve: LIFT });
P('Estetici', 'Y2K', { exp: 0.15, contrast: 0.05, vib: 0.4, sat: 0.1, temp: -0.1, gsH: 210, gsS: 0.35, ghH: 320, ghS: 0.3, glow: 0.35, curve: LIFT, fade: 0.1, sharp: 0.2 });
P('Estetici', 'Videocassetta VHS', { contrast: -0.1, sat: -0.2, temp: -0.05, tint: 0.1, gsH: 200, gsS: 0.3, ghH: 330, ghS: 0.3, ca: 0.6, grain: 0.5, grainSize: 1.5, denoise: 0, fade: 0.3, glow: 0.25, curve: MATTE, vig: 0.3 });
P('Estetici', 'Cyberpunk', { contrast: 0.3, exp: -0.15, vib: 0.4, sat: 0.1, gsH: 200, gsS: 0.7, gmH: 290, gmS: 0.25, ghH: 320, ghS: 0.65, glow: 0.4, clarity: 0.25, vig: 0.35, curve: S_STRONG });
P('Estetici', 'Vaporwave', { exp: 0.1, contrast: -0.05, vib: 0.4, sat: 0.1, gsH: 270, gsS: 0.45, gmH: 300, gmS: 0.3, ghH: 180, ghS: 0.45, fade: 0.2, glow: 0.3, grain: 0.15, curve: LIFT });
P('Estetici', 'Synthwave', { contrast: 0.25, exp: -0.2, vib: 0.45, gsH: 260, gsS: 0.7, ghH: 330, ghS: 0.7, glow: 0.5, halation: 0.2, vig: 0.35, curve: S_STRONG });
P('Estetici', 'Notte Neon', { contrast: 0.3, exp: -0.3, vib: 0.5, gsH: 250, gsS: 0.5, ghH: 320, ghS: 0.5, glow: 0.45, ca: 0.15, curve: S_STRONG, vig: 0.35 });
P('Estetici', 'Autunno', { contrast: 0.15, temp: 0.35, vib: 0.3, gsH: 20, gsS: 0.3, ghH: 40, ghS: 0.35, curve: S_CURVE, hsl: { 3: [-0.6, 0.1, -0.05], 2: [-0.1, 0.25, 0], 1: [0, 0.25, 0] } });
P('Estetici', 'Gelo Invernale', { exp: 0.1, temp: -0.4, sat: -0.2, contrast: 0.1, gsH: 210, gsS: 0.3, ghH: 195, ghS: 0.3, clarity: 0.2, curve: S_CURVE, hsl: { 3: [0.3, -0.5, 0] } });
P('Estetici', 'Tropicale', { exp: 0.1, contrast: 0.12, temp: 0.12, vib: 0.5, sat: 0.15, gsH: 180, gsS: 0.2, ghH: 45, ghS: 0.25, curve: S_CURVE, hsl: { 3: [0.1, 0.25, 0], 4: [0, 0.35, 0] } });
P('Estetici', 'Foresta Verde', { contrast: 0.12, temp: -0.05, tint: -0.1, vib: 0.2, gsH: 150, gsS: 0.35, ghH: 80, ghS: 0.3, curve: S_CURVE, dehaze: 0.1, hsl: { 3: [-0.1, 0.2, -0.1], 2: [-0.2, 0.1, 0] } });
P('Estetici', 'Deserto Dorato', { exp: 0.1, contrast: 0.1, temp: 0.4, sat: -0.1, dehaze: 0.15, gsH: 30, gsS: 0.3, ghH: 45, ghS: 0.4, curve: S_CURVE, hsl: { 1: [0, 0.2, 0.05] } });
P('Estetici', 'Oceano', { contrast: 0.12, temp: -0.25, vib: 0.4, gsH: 200, gsS: 0.4, ghH: 180, ghS: 0.25, clarity: 0.15, curve: S_CURVE, hsl: { 4: [0, 0.3, -0.1], 5: [0, 0.2, -0.1] } });
P('Estetici', 'Oro Rosa', { exp: 0.15, contrast: -0.1, temp: 0.12, tint: 0.12, sat: -0.1, gsH: 350, gsS: 0.3, ghH: 20, ghS: 0.35, glow: 0.2, fade: 0.15, curve: LIFT });
P('Estetici', 'Pesca', { exp: 0.2, contrast: -0.1, temp: 0.22, tint: 0.08, vib: 0.2, gsH: 10, gsS: 0.2, ghH: 30, ghS: 0.3, glow: 0.2, fade: 0.1, curve: LIFT, hsl: { 1: [0, 0.2, 0.1] } });
P('Estetici', 'Lavanda', { exp: 0.1, contrast: -0.1, temp: -0.1, tint: 0.15, vib: 0.2, gsH: 270, gsS: 0.35, ghH: 320, ghS: 0.25, fade: 0.2, curve: LIFT, glow: 0.15 });
P('Estetici', 'Menta', { exp: 0.15, contrast: -0.1, temp: -0.12, tint: -0.1, vib: 0.2, gsH: 165, gsS: 0.3, ghH: 130, ghS: 0.2, fade: 0.15, curve: LIFT });
P('Estetici', 'Caffè', { contrast: 0.1, temp: 0.3, sat: -0.3, gsH: 25, gsS: 0.4, gmH: 30, gmS: 0.3, ghH: 40, ghS: 0.3, fade: 0.15, vig: 0.3, curve: MATTE });
P('Estetici', 'Sogno Seppia', { contrast: 0.05, mono: 0.85, temp: 0.3, gsH: 30, gsS: 0.5, gmH: 35, gmS: 0.4, ghH: 45, ghS: 0.4, fade: 0.2, glow: 0.2, vig: 0.3, curve: LIFT });
P('Estetici', 'Ricordo Sbiadito', { exp: 0.1, contrast: -0.25, temp: 0.1, sat: -0.3, fade: 0.45, grain: 0.2, glow: 0.2, curve: MATTE, vig: 0.25 });
P('Estetici', 'Lo-Fi', { contrast: 0.15, sat: -0.15, temp: 0.1, grain: 0.55, grainSize: 1.5, vig: 0.45, fade: 0.2, ca: 0.2, curve: MATTE, gsH: 190, gsS: 0.2, ghH: 40, ghS: 0.25 });
P('Estetici', 'Cottagecore', { exp: 0.2, contrast: -0.1, temp: 0.2, vib: 0.2, sat: -0.1, gsH: 120, gsS: 0.15, ghH: 50, ghS: 0.3, glow: 0.3, fade: 0.2, curve: LIFT, hsl: { 3: [0.1, -0.1, 0.05] } });
P('Estetici', 'Dark Academia', { exp: -0.25, contrast: 0.2, temp: 0.25, sat: -0.35, gsH: 30, gsS: 0.4, ghH: 40, ghS: 0.3, vig: 0.5, grain: 0.3, fade: 0.1, curve: S_CURVE, hsl: { 3: [-0.3, -0.2, -0.1] } });
P('Estetici', 'Minimal Pulito', { exp: 0.15, contrast: 0.05, sat: -0.35, vib: -0.1, clarity: 0.1, curve: LIFT });
P('Estetici', 'HDR Pop', { contrast: 0.2, hi: -0.5, sh: 0.5, clarity: 0.6, texture: 0.4, vib: 0.4, dehaze: 0.25, sharp: 0.5, curve: S_CURVE });
P('Estetici', 'Street Arancio-Blu', { contrast: 0.25, vib: 0.3, gsH: 210, gsS: 0.4, ghH: 30, ghS: 0.4, clarity: 0.3, curve: S_STRONG, vig: 0.2 });
P('Estetici', 'Foschia Mattutina', { exp: 0.15, contrast: -0.3, dehaze: -0.6, sat: -0.15, temp: -0.05, glow: 0.35, fade: 0.2, curve: LIFT });
P('Estetici', 'Contrasto Pop', { contrast: 0.45, vib: 0.35, sat: 0.1, clarity: 0.2, curve: S_STRONG });
P('Estetici', 'Acquerello', { exp: 0.2, contrast: -0.3, sat: -0.2, clarity: -0.5, texture: -0.4, denoise: 0.6, fade: 0.25, glow: 0.2, curve: LIFT });
P('Estetici', 'Vetro Smerigliato', { exp: 0.2, contrast: -0.2, clarity: -0.6, dehaze: -0.3, glow: 0.7, sat: -0.1, curve: LIFT });
P('Estetici', 'Noir Moderno', { contrast: 0.35, exp: -0.15, sat: -0.7, gsH: 215, gsS: 0.3, ghH: 40, ghS: 0.15, vig: 0.4, curve: S_STRONG, clarity: 0.25, grain: 0.2 });
P('Estetici', 'Morbido Instagram', { exp: 0.1, contrast: -0.08, hi: -0.15, sh: 0.2, vib: 0.2, temp: 0.08, fade: 0.1, curve: LIFT, vig: 0.15 });
P('Estetici', 'Raggio di Sole', { exp: 0.25, contrast: 0.05, temp: 0.4, vib: 0.3, glow: 0.45, halation: 0.25, dehaze: -0.15, gsH: 40, gsS: 0.2, ghH: 45, ghS: 0.4, curve: LIFT });
P('Estetici', 'Crepuscolo Viola', { exp: -0.1, contrast: 0.1, temp: -0.2, tint: 0.2, vib: 0.35, gsH: 270, gsS: 0.5, ghH: 330, ghS: 0.4, glow: 0.2, curve: S_CURVE });

/* ===== BIANCO E NERO ===== */
P('B&N', 'Contrasto Alto', { mono: 1, contrast: 0.5, clarity: 0.3, curve: S_STRONG, vig: 0.25 });
P('B&N', 'Morbido', { mono: 1, contrast: -0.15, fade: 0.25, curve: LIFT, glow: 0.2 });
P('B&N', 'Infrarosso', { mono: 1, contrast: 0.2, glow: 0.35, grain: 0.15, curve: S_CURVE, bw: { 3: 1, 2: 0.7, 4: -0.4, 5: -0.9 }, exp: 0.1 });
P('B&N', 'Seppia', { mono: 1, contrast: 0.1, gsH: 30, gsS: 0.6, gmH: 35, gmS: 0.5, ghH: 45, ghS: 0.5, fade: 0.15, vig: 0.3, curve: LIFT });
P('B&N', 'Cianotipo', { mono: 1, contrast: 0.1, gsH: 215, gsS: 0.9, gmH: 210, gmS: 0.7, ghH: 195, ghS: 0.4, fade: 0.1, curve: LIFT });
P('B&N', 'Selenio', { mono: 1, contrast: 0.2, gsH: 300, gsS: 0.35, ghH: 40, ghS: 0.15, grain: 0.2, curve: S_CURVE });
P('B&N', 'Platino', { mono: 1, contrast: -0.05, fade: 0.4, gsH: 40, gsS: 0.15, ghH: 45, ghS: 0.12, curve: MATTE });
P('B&N', 'Grana Pesante', { mono: 1, contrast: 0.3, grain: 1, grainSize: 1.8, vig: 0.4, curve: S_STRONG });
P('B&N', 'Noir Profondo', { mono: 1, exp: -0.3, contrast: 0.5, bl: -0.2, vig: 0.6, curve: S_STRONG, dehaze: 0.25 });
P('B&N', 'Argento', { mono: 1, exp: 0.1, contrast: 0.2, clarity: 0.3, texture: 0.3, curve: S_CURVE, sharp: 0.4 });
P('B&N', 'Filtro Rosso', { mono: 1, contrast: 0.35, curve: S_STRONG, bw: { 0: 0.9, 1: 0.7, 2: 0.4, 5: -0.9, 4: -0.8 } });
P('B&N', 'Filtro Giallo', { mono: 1, contrast: 0.25, curve: S_CURVE, bw: { 0: 0.4, 1: 0.5, 2: 0.6, 5: -0.4, 4: -0.3 } });
P('B&N', 'Filtro Verde', { mono: 1, contrast: 0.2, curve: S_CURVE, bw: { 3: 0.8, 2: 0.4, 0: -0.4, 7: -0.4 } });
P('B&N', 'Film Noir', { mono: 1, exp: -0.2, contrast: 0.45, grain: 0.35, vig: 0.55, glow: 0.2, curve: S_STRONG, bl: -0.1 });
P('B&N', 'Fotogiornalismo', { mono: 1, contrast: 0.35, clarity: 0.4, grain: 0.5, curve: S_STRONG, sharp: 0.3 });
P('B&N', 'Duotono Blu-Arancio', { mono: 1, contrast: 0.2, gsH: 215, gsS: 0.8, ghH: 35, ghS: 0.7, curve: S_CURVE });
P('B&N', 'Duotono Viola-Oro', { mono: 1, contrast: 0.2, gsH: 275, gsS: 0.8, ghH: 50, ghS: 0.7, curve: S_CURVE });
P('B&N', 'Duotono Rosso Nero', { mono: 1, contrast: 0.3, gsH: 0, gsS: 0.5, gmH: 355, gmS: 0.8, ghH: 5, ghS: 0.8, curve: S_STRONG });

/* ===== RITRATTO ===== */
P('Ritratto', 'Pelle Morbida', { exp: 0.15, contrast: -0.1, clarity: -0.3, texture: -0.3, denoise: 0.4, temp: 0.08, sat: -0.05, curve: LIFT, glow: 0.15, hsl: { 0: [0, -0.15, 0.1], 1: [0, -0.05, 0.1] } });
P('Ritratto', 'Pelle Calda', { exp: 0.1, temp: 0.25, vib: 0.1, gsH: 20, gsS: 0.25, ghH: 35, ghS: 0.3, clarity: -0.1, curve: LIFT, hsl: { 1: [0, 0.1, 0.1] } });
P('Ritratto', 'Bagliore', { exp: 0.2, contrast: -0.15, clarity: -0.35, glow: 0.6, halation: 0.15, temp: 0.12, curve: LIFT, hsl: { 0: [0, -0.1, 0.1] } });
P('Ritratto', 'Studio', { exp: 0.1, contrast: 0.2, clarity: 0.2, sharp: 0.3, sat: -0.05, curve: S_CURVE, vig: 0.2 });
P('Ritratto', 'Beauty', { exp: 0.2, contrast: -0.05, clarity: -0.4, texture: -0.5, denoise: 0.5, glow: 0.35, vib: 0.1, temp: 0.05, curve: LIFT, hsl: { 0: [0, -0.2, 0.1], 1: [0, -0.1, 0.1], 7: [0, -0.1, 0] } });
P('Ritratto', 'Pelle Chiara', { exp: 0.3, contrast: -0.12, hi: -0.2, sh: 0.25, sat: -0.1, temp: -0.03, fade: 0.1, curve: LIFT, hsl: { 0: [0, -0.2, 0.15], 1: [0, -0.15, 0.15] } });
P('Ritratto', 'Pelle Dorata', { exp: 0.1, contrast: 0.1, temp: 0.3, vib: 0.2, gsH: 25, gsS: 0.3, ghH: 40, ghS: 0.35, curve: S_CURVE, hsl: { 1: [0, 0.2, 0.05] } });
P('Ritratto', 'Ritratto Drammatico', { exp: -0.2, contrast: 0.35, sh: -0.25, clarity: 0.35, sat: -0.2, vig: 0.5, gsH: 200, gsS: 0.25, ghH: 40, ghS: 0.2, curve: S_STRONG });
P('Ritratto', 'Ritratto Esterno', { exp: 0.1, contrast: 0.08, sh: 0.2, hi: -0.2, vib: 0.2, temp: 0.12, clarity: 0.05, curve: S_CURVE });
P('Ritratto', 'Controluce', { exp: 0.25, contrast: -0.1, sh: 0.5, hi: -0.4, temp: 0.3, glow: 0.45, halation: 0.3, dehaze: -0.15, curve: LIFT });
P('Ritratto', 'Moda Editoriale', { contrast: 0.25, sat: -0.25, clarity: 0.25, curve: S_STRONG, gsH: 215, gsS: 0.15, ghH: 40, ghS: 0.15, vig: 0.15 });
P('Ritratto', 'Gotico', { exp: -0.2, contrast: 0.3, sat: -0.5, tint: 0.08, gsH: 280, gsS: 0.4, ghH: 330, ghS: 0.2, vig: 0.6, curve: S_STRONG, grain: 0.2 });

/* ===== PAESAGGIO E NATURA ===== */
P('Paesaggio', 'Paesaggio Vivido', { contrast: 0.2, vib: 0.4, sat: 0.1, clarity: 0.3, dehaze: 0.2, sharp: 0.5, curve: S_CURVE, hsl: { 3: [0, 0.2, -0.05], 5: [0, 0.2, -0.1] } });
P('Paesaggio', 'Alba', { exp: 0.05, contrast: 0.12, temp: 0.25, vib: 0.3, gsH: 260, gsS: 0.3, ghH: 30, ghS: 0.5, glow: 0.2, curve: S_CURVE });
P('Paesaggio', 'Tramonto Infuocato', { exp: -0.1, contrast: 0.25, temp: 0.35, vib: 0.5, gsH: 250, gsS: 0.4, ghH: 20, ghS: 0.65, clarity: 0.2, glow: 0.2, curve: S_STRONG, hsl: { 0: [0, 0.3, -0.1], 1: [0, 0.3, 0] } });
P('Paesaggio', 'Nebbia Nordica', { exp: 0.1, contrast: -0.25, dehaze: -0.55, sat: -0.35, temp: -0.12, gsH: 210, gsS: 0.15, fade: 0.2, curve: LIFT });
P('Paesaggio', 'Montagna Drammatica', { contrast: 0.35, clarity: 0.55, texture: 0.35, dehaze: 0.35, sat: -0.2, vib: 0.2, hi: -0.3, sh: 0.2, vig: 0.35, curve: S_STRONG, sharp: 0.5 });
P('Paesaggio', 'Mare Cristallino', { exp: 0.1, contrast: 0.1, temp: -0.12, vib: 0.5, sat: 0.1, dehaze: 0.15, curve: S_CURVE, hsl: { 4: [0, 0.4, 0], 5: [0, 0.2, -0.1] } });
P('Paesaggio', 'Bosco Incantato', { exp: -0.05, contrast: 0.1, tint: -0.12, vib: 0.25, dehaze: -0.1, gsH: 155, gsS: 0.4, ghH: 70, ghS: 0.3, glow: 0.3, curve: S_CURVE, hsl: { 3: [-0.2, 0.2, -0.1] } });
P('Paesaggio', 'Neve Luminosa', { exp: 0.2, contrast: 0.12, temp: -0.18, sat: -0.1, clarity: 0.25, wh: 0.15, curve: S_CURVE, gsH: 215, gsS: 0.15 });
P('Paesaggio', 'Autunno Intenso', { contrast: 0.18, temp: 0.3, vib: 0.5, clarity: 0.2, curve: S_CURVE, hsl: { 3: [-0.7, 0.1, 0], 2: [-0.1, 0.3, 0], 1: [0, 0.3, 0] } });
P('Paesaggio', 'Primavera Fiorita', { exp: 0.15, contrast: 0.02, vib: 0.45, sat: 0.1, temp: 0.08, glow: 0.2, curve: LIFT, hsl: { 3: [0.1, 0.25, 0.1], 7: [0, 0.3, 0] } });
P('Paesaggio', 'Veduta Aerea', { contrast: 0.15, clarity: 0.4, dehaze: 0.4, sat: 0.05, vib: 0.2, sharp: 0.6, texture: 0.3, curve: S_CURVE });
P('Paesaggio', 'Astrofotografia', { exp: 0.15, contrast: 0.25, dehaze: 0.35, clarity: 0.35, denoise: 0.5, temp: -0.25, vib: 0.3, gsH: 230, gsS: 0.35, ghH: 40, ghS: 0.2, vig: 0.25, curve: S_STRONG, bl: -0.15 });
P('Paesaggio', 'Deserto Rosso', { exp: 0.05, contrast: 0.25, temp: 0.35, vib: 0.3, dehaze: 0.15, gsH: 10, gsS: 0.35, ghH: 30, ghS: 0.4, curve: S_STRONG, hsl: { 0: [0, 0.3, 0], 1: [0, 0.3, 0] } });
P('Paesaggio', 'Cascata Morbida', { exp: 0.05, contrast: -0.1, clarity: -0.2, vib: 0.25, tint: -0.05, glow: 0.2, curve: LIFT, hsl: { 3: [0, 0.2, -0.1] } });
P('Paesaggio', 'Giungla', { contrast: 0.15, tint: -0.15, vib: 0.4, dehaze: 0.15, gsH: 150, gsS: 0.35, curve: S_CURVE, hsl: { 3: [-0.15, 0.3, -0.1], 2: [-0.2, 0.2, 0] } });

/* ===== CITTÀ, NOTTE, CIBO ===== */
P('Città e Cibo', 'Notte in Città', { exp: -0.1, contrast: 0.25, vib: 0.3, dehaze: 0.15, gsH: 225, gsS: 0.4, ghH: 35, ghS: 0.35, glow: 0.4, denoise: 0.3, vig: 0.25, curve: S_CURVE });
P('Città e Cibo', 'Strada Granulosa', { contrast: 0.3, sat: -0.25, clarity: 0.35, grain: 0.5, curve: S_STRONG, vig: 0.3 });
P('Città e Cibo', 'Urbano Freddo', { contrast: 0.2, temp: -0.25, sat: -0.25, clarity: 0.35, gsH: 210, gsS: 0.3, curve: S_CURVE, sharp: 0.3 });
P('Città e Cibo', 'Architettura', { contrast: 0.2, clarity: 0.45, texture: 0.3, sat: -0.2, dehaze: 0.2, sharp: 0.6, curve: S_CURVE });
P('Città e Cibo', 'Pioggia Metropolitana', { exp: -0.15, contrast: 0.15, temp: -0.2, sat: -0.25, gsH: 215, gsS: 0.35, ghH: 40, ghS: 0.25, glow: 0.3, dehaze: -0.1, curve: S_CURVE, vig: 0.3 });
P('Città e Cibo', 'Cibo Gustoso', { exp: 0.1, contrast: 0.15, temp: 0.12, vib: 0.4, sat: 0.15, clarity: 0.25, sharp: 0.4, curve: S_CURVE, hsl: { 0: [0, 0.2, 0], 1: [0, 0.25, 0.05], 2: [0, 0.2, 0] } });
P('Città e Cibo', 'Cibo Rustico', { exp: -0.05, contrast: 0.2, temp: 0.2, sat: -0.1, clarity: 0.3, vig: 0.35, grain: 0.15, curve: S_CURVE, gsH: 30, gsS: 0.3, ghH: 40, ghS: 0.2 });
P('Città e Cibo', 'Cibo Luminoso', { exp: 0.3, contrast: 0.05, hi: -0.2, sh: 0.2, vib: 0.3, temp: -0.02, clarity: 0.15, curve: LIFT });
P('Città e Cibo', 'Caffè e Dolci', { exp: 0.05, contrast: 0.1, temp: 0.22, vib: 0.2, gsH: 25, gsS: 0.25, ghH: 40, ghS: 0.2, fade: 0.1, curve: MATTE, glow: 0.15 });
P('Città e Cibo', 'Interni Caldi', { exp: 0.1, temp: 0.22, tint: 0.03, contrast: 0.05, sh: 0.25, hi: -0.15, vib: 0.1, curve: LIFT });
P('Città e Cibo', 'Immobiliare', { exp: 0.25, contrast: 0.08, hi: -0.4, sh: 0.45, vib: 0.2, clarity: 0.25, sharp: 0.4, wh: 0.1, curve: S_CURVE });
P('Città e Cibo', 'Auto Lucida', { contrast: 0.3, clarity: 0.4, vib: 0.3, sharp: 0.5, dehaze: 0.2, gsH: 210, gsS: 0.2, ghH: 40, ghS: 0.2, curve: S_STRONG, vig: 0.25 });
P('Città e Cibo', 'Concerto', { exp: -0.15, contrast: 0.25, vib: 0.5, gsH: 280, gsS: 0.5, ghH: 330, ghS: 0.4, glow: 0.5, denoise: 0.4, curve: S_STRONG, vig: 0.3 });
P('Città e Cibo', 'Sport Energico', { contrast: 0.3, vib: 0.4, clarity: 0.4, sharp: 0.5, dehaze: 0.2, curve: S_STRONG, vig: 0.15 });
P('Città e Cibo', 'Prodotto Pulito', { exp: 0.25, contrast: 0.1, sat: -0.05, clarity: 0.3, sharp: 0.5, wh: 0.15, curve: S_CURVE });
P('Città e Cibo', 'Macro Natura', { exp: 0.05, contrast: 0.15, vib: 0.4, clarity: 0.2, texture: 0.3, sharp: 0.5, glow: 0.1, curve: S_CURVE });
P('Città e Cibo', 'Vecchia Cartolina', { exp: 0.05, contrast: -0.1, temp: 0.25, sat: -0.25, fade: 0.4, grain: 0.35, vig: 0.4, gsH: 40, gsS: 0.3, ghH: 50, ghS: 0.3, curve: MATTE });

/* ===== Costruzione dei preset ===== */

const PRESET_CATEGORIES = ['Cinema', 'Pellicola', 'Estetici', 'B&N', 'Ritratto', 'Paesaggio', 'Città e Cibo'];
