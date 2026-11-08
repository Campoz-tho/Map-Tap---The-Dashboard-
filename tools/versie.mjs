// Zet een nieuw versienummer achter alle eigen .js/.css-verwijzingen (?v=...),
// zodat browsers na een update meteen de nieuwe bestanden ophalen in plaats van oude uit hun cache.
// Gebruik: node tools/versie.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = Date.now().toString(36);
const files = ['index.html', 'kaart.html', 'beheer.html', ...readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`)];
const RE = /((?:\.\/|assets\/)[\w-]+\.(?:js|css))(?:\?v=\w+)?(['"])/g;
for (const f of files) {
  const p = join(root, f);
  const before = readFileSync(p, 'utf8');
  const after = before.replace(RE, `$1?v=${v}$2`);
  if (after !== before) writeFileSync(p, after);
}
console.log(`versie ${v}`);
