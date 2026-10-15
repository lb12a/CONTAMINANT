// Interface strings in twelve languages. English text is the key; each other language is a dictionary in
// ./i18n/<lang>.ts, loaded when it is chosen. Missing entries fall back to English.

import { getProfile } from './store.ts';
import { isLang, type Lang } from './i18n/langs.ts';

export { LANGUAGES, detectLanguage, type Lang } from './i18n/langs.ts';

const loaders = import.meta.glob<{ default: Record<string, string> }>(['./i18n/*.ts', '!./i18n/langs.ts']);
const dicts: Partial<Record<Lang, Record<string, string>>> = {};

function lang(): Lang {
  const l = getProfile().settings.lang;
  return isLang(l) ? l : 'en';
}

/** Loads a language's dictionary (call before switching to it). */
export async function loadLanguage(l: Lang): Promise<void> {
  if (l === 'en' || dicts[l]) return;
  const load = loaders[`./i18n/${l}.ts`];
  if (load) dicts[l] = (await load()).default;
}

export function t(s: string): string {
  const l = lang();
  if (l === 'en') return s;
  return dicts[l]?.[s] ?? s;
}

/** For text that ships with its own German version (tutorial scripts, missions): German from the data, other languages from the dictionaries. */
export function tx(en: string, de?: string): string {
  const l = lang();
  if (l === 'de' && de) return de;
  return t(en);
}
