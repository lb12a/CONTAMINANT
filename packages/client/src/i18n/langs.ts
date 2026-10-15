// The languages the interface speaks. Game data names (characters, abilities, items) stay English.

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' },
  { id: 'pt', name: 'Português' },
  { id: 'pl', name: 'Polski' },
  { id: 'tr', name: 'Türkçe' },
  { id: 'ru', name: 'Русский' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
  { id: 'zh', name: '简体中文' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];

export function isLang(x: unknown): x is Lang {
  return LANGUAGES.some((l) => l.id === x);
}

/** The first browser/system language the game speaks, else English. */
export function detectLanguage(): Lang {
  const prefs = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const p of prefs) {
    const c = String(p ?? '').slice(0, 2).toLowerCase();
    if (isLang(c)) return c;
  }
  return 'en';
}
