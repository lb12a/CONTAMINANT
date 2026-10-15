// Drawn interface icons. They replace every emoji in the interface: generated art from
// assets/gen/icons/<name> when it exists, otherwise the hand-built SVG set in iconset.ts.

import { assetUrl } from '../render/assets.ts';
import { svgIconUrl } from './iconset.ts';

export function iconUrl(name: string): string | null {
  return assetUrl(`icons/${name}`) ?? svgIconUrl(name);
}

export function Icon({ name, size = 20, label, className }: { name: string; size?: number; label?: string; className?: string }) {
  const url = iconUrl(name);
  const style = { width: size, height: size };
  if (!url) return <span className={`icon icon-missing${className ? ` ${className}` : ''}`} style={style} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
  return <img className={`icon${className ? ` ${className}` : ''}`} src={url} alt={label ?? ''} aria-hidden={label ? undefined : true} title={label} style={style} draggable={false} />;
}
