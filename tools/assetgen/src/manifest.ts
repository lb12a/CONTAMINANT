// Writes packages/client/public/assets/gen/manifest.json listing every generated image with its size.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reads width/height from a WebP (VP8, VP8L, VP8X) or PNG header. */
function size(file: string): { w: number; h: number } | null {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(webp|png)$/.test(e)) out.push(p);
  }
  return out;
}

export function writeManifest(dir: string): number {
  const files: Record<string, { w: number; h: number }> = {};
  for (const f of walk(dir)) {
    const s = size(f);
    if (s) files[relative(dir, f).replaceAll('\\', '/')] = s;
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), files }, null, 1));
  return Object.keys(files).length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/client/public/assets/gen');
  console.log(`manifest: ${writeManifest(dir)} file(s)`);
}
