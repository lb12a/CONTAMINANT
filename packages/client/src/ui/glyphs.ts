// Colours that carry meaning in the interface (damage tags, statuses, characteristics, fields, item types).
// The symbols themselves are drawn icons: see Icon.tsx and iconset.ts.
import { CATEGORY_COLORS, CHARACTERISTICS, STATUSES, FIELDS, ITEM_TYPE_INFO, type DamageTag, type StatusId, type FieldId, type ItemType } from '@contaminant/engine';

export const TAG_COLOR: Record<DamageTag, string> = {
  blunt: '#c9c3b4',
  slash: '#e8dfc8',
  pierce: '#9FB7FF',
  fire: '#FF9A1F',
  electric: '#4FE3FF',
  toxic: '#8CFF5A',
  acid: '#c8e04a',
  sonic: '#b48cff',
  psychic: '#ff7ad6',
  soul: '#9FB7FF',
  radiant: '#fff6a0',
};

export function statusKind(id: StatusId): 'buff' | 'debuff' | 'neutral' {
  return STATUSES[id]?.kind ?? 'neutral';
}

export function charRing(id: string): string {
  const c = CHARACTERISTICS[id];
  return c ? CATEGORY_COLORS[c.category] : '#e8dfc8';
}

export function fieldColor(id: FieldId): string {
  return FIELDS[id]?.color ?? '#888';
}

export function itemTypeColor(t: ItemType): string {
  return ITEM_TYPE_INFO[t].color;
}

