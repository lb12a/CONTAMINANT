// Translation coverage: every string the client passes through t()/tx() should exist in every dictionary.
//   node tools/qa/i18n.ts            (prints missing keys per language, exits 1 when any language misses more than 2 %)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'packages/client/src';
const keys = new Set<string>();
const LIT = /\b(?:t|tr|tx)\(\s*'((?:[^'\\]|\\.)*)'/g;
function walk(dir: string): void {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'i18n') walk(p);
    } else if (/\.tsx?$/.test(f)) {
      for (const m of readFileSync(p, 'utf8').matchAll(LIT)) keys.add(m[1]!.replace(/\\'/g, "'"));
    }
  }
}
walk(root);

const langs = readdirSync(join(root, 'i18n')).filter((f) => f.endsWith('.ts') && f !== 'langs.ts');
let failed = false;
for (const f of langs) {
  const src = readFileSync(join(root, 'i18n', f), 'utf8');
  const dict = new Function(`return {${src.slice(src.indexOf('{') + 1, src.lastIndexOf('};'))}}`)() as Record<string, string>;
  const missing = [...keys].filter((k) => /[A-Za-z]{2}/.test(k) && !(k in dict) && !/^[a-z]+\/[a-z_]+$/.test(k));
  const share = missing.length / keys.size;
  if (share > 0.02) failed = true;
  console.log(`${f.replace('.ts', '')}: ${keys.size - missing.length}/${keys.size}${missing.length ? `  missing: ${missing.slice(0, 8).map((m) => JSON.stringify(m)).join(', ')}${missing.length > 8 ? ' …' : ''}` : ''}`);
}
process.exit(failed ? 1 : 0);
