// Copia i file dell'app web in www/, la cartella che Capacitor mette dentro l'APK / l'app iPhone.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const ESCLUSI = new Set(['package.json', 'package-lock.json', 'capacitor.config.json']);
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of readdirSync('.')) {
  if (!ESCLUSI.has(f) && /\.(html|js|css|json|png|svg)$/.test(f)) cpSync(f, `www/${f}`);
}
cpSync('vendor', 'www/vendor', { recursive: true });
console.log('www pronta');
