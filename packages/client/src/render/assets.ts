// Generated asset manifest (written by tools/assetgen after a ComfyUI run).
// When an image exists it replaces the procedural art; otherwise the game stays fully playable.

let files: Set<string> | null = null;

export async function loadAssetManifest(): Promise<number> {
  try {
    const r = await fetch('./assets/gen/manifest.json', { cache: 'no-cache' });
    if (!r.ok) return 0;
    const m = (await r.json()) as { files?: Record<string, unknown> };
    files = new Set(Object.keys(m.files ?? {}));
    return files.size;
  } catch {
    return 0;
  }
}

export function assetUrl(path: string): string | null {
  return files?.has(path) ? `./assets/gen/${path}` : null;
}

const images = new Map<string, HTMLImageElement>();
export function assetImage(path: string): HTMLImageElement | null {
  const url = assetUrl(path);
  if (!url) return null;
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
