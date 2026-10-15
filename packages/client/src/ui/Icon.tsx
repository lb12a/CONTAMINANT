// Drawn interface icons (generated with the rest of the art, see tools/assetgen/src/icons.ts).
// They replace every emoji in the interface. Until an icon exists a small ink blot keeps the layout.

import { assetUrl } from '../render/assets.ts';

export function iconUrl(name: string): string | null {
  return assetUrl(`icons/${name}`);
}

export function Icon({ name, size = 20, label, className }: { name: string; size?: number; label?: string; className?: string }) {
  const url = iconUrl(name);
  const style = { width: size, height: size };
  if (!url) return <span className={`icon icon-missing${className ? ` ${className}` : ''}`} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
  return <img className={`icon${className ? ` ${className}` : ''}`} src={url} alt={label ?? ''} aria-hidden={label ? undefined : true} style={style} draggable={false} />;
}
