// Generated asset manifest (written by tools/assetgen after a ComfyUI run).
// When an image exists it replaces the procedural art; otherwise the game stays fully playable.

let files: Map<string, { w: number; h: number }> | null = null;

export async function loadAssetManifest(): Promise<number> {
  try {
    const r = await fetch('./assets/gen/manifest.json', { cache: 'no-cache' });
    if (!r.ok) return 0;
    const m = (await r.json()) as { files?: Record<string, { w: number; h: number }> };
    files = new Map(Object.entries(m.files ?? {}));
    return files.size;
  } catch {
    return 0;
  }
}

/** Resolves `tokens/vile`, `tokens/vile.png` or `tokens/vile.webp` to the generated file, if any. */
function resolvePath(path: string): string | null {
  if (!files) return null;
  const base = path.replace(/\.(png|webp)$/, '');
  for (const ext of ['.webp', '.png']) if (files.has(base + ext)) return base + ext;
  return null;
}

export function assetUrl(path: string): string | null {
  const p = resolvePath(path);
  return p ? `./assets/gen/${p}` : null;
}

export function assetSize(path: string): { w: number; h: number } | null {
  const p = resolvePath(path);
  return p ? files!.get(p)! : null;
}

export function assetList(prefix: string): string[] {
  return files ? [...files.keys()].filter((k) => k.startsWith(prefix)) : [];
}

const images = new Map<string, HTMLImageElement>();

function load(url: string): Promise<HTMLImageElement> {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    images.set(url, img);
  }
  const el = img;
  if (el.complete && el.naturalWidth) return Promise.resolve(el);
  return new Promise((res) => {
    el.addEventListener('load', () => res(el), { once: true });
    el.addEventListener('error', () => res(el), { once: true });
  });
}

export function assetImage(path: string): HTMLImageElement | null {
  const url = assetUrl(path);
  if (!url) return null;
  const img = images.get(url);
  if (!img) void load(url);
  return img && img.complete && img.naturalWidth ? img : null;
}

/** Decodes all images below the given prefixes (used before the first render so portraits can be composed synchronously). */
export async function preloadAssets(prefixes: string[], timeoutMs = 6000): Promise<void> {
  const urls = prefixes.flatMap((p) => assetList(p)).map((p) => `./assets/gen/${p}`);
  await Promise.race([Promise.all(urls.map(load)), new Promise((r) => setTimeout(r, timeoutMs))]);
}
