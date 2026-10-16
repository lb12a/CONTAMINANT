import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadAssetManifest, preloadAssets } from './render/assets.ts';
import { loadLanguage } from './i18n.ts';
import { getProfile } from './store.ts';
import { scheduleDailyReminder } from './notify.ts';
import { t } from './i18n.ts';
import '@fontsource/grenze-gotisch/600.css';
import '@fontsource/grenze-gotisch/800.css';
import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './styles.css';

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

// loading screen (markup in index.html): the tube fills with the asset preload while eerie lines and tips
// fade in and out. It stays at least BOOT_MIN_MS so the walk down the corridor can play; a tap ends it early
// once everything is loaded.
const BOOT_MIN_MS = 4200;
const bootStart = performance.now();
/** marks text for the translation check; translated with t() once the language is loaded */
const tr = (s: string) => s;
const LINES = [
  tr('Waking the specimens…'),
  tr('Tip: everything resolves at once. Priority attacks go first, then the fastest creature.'),
  tr('Sharpening the scalpels…'),
  tr('Tip: spend less than half of your AP and you bank an Idle Bonus for the next round.'),
  tr('Counting the teeth…'),
  tr('Tip: chests drop new characters. More areas join the pool as your trophies climb.'),
  tr('Mopping up the green stuff…'),
  tr('Tip: plan a leap or a swap first, and the next attack starts from the new tile.'),
  tr('Unlocking the cages…'),
  tr('Tip: every character has its own Testing Chamber. Finish it for a reward.'),
  tr('Lighting the lab lamps…'),
];
const fill = document.getElementById('boot-fill');
const msg = document.getElementById('boot-msg');
let line = 0;
let say = (s: string) => s;
const rotate = window.setInterval(() => {
  if (!msg) return;
  msg.classList.add('out');
  window.setTimeout(() => {
    msg.textContent = say(LINES[++line % LINES.length]!);
    msg.classList.remove('out');
  }, 350);
}, 2300);
const progress = (f: number) => fill && (fill.style.width = `${Math.round(8 + f * 90)}%`);

// generated sprites are decoded before the first render so card portraits can be composed synchronously
await Promise.all([loadAssetManifest(), loadLanguage(getProfile().settings.lang)]);
say = t;
if (msg) msg.textContent = t(LINES[line % LINES.length]!);
progress(0.08);
await preloadAssets(['tokens/', 'items/', 'backdrops/', 'icons/'], 9000, (done, total) => progress(done / Math.max(1, total)));
progress(1);
createRoot(document.getElementById('root')!).render(<App />);
// Android app: a daily evening reminder that the free reward is waiting
void scheduleDailyReminder('Contaminant', t('Your daily reward and the free chest are waiting in the lab.'));
const boot = document.getElementById('boot');
const endBoot = () => {
  window.clearInterval(rotate);
  boot?.classList.add('gone');
  window.setTimeout(() => boot?.remove(), 850);
};
boot?.addEventListener('pointerdown', endBoot, { once: true });
window.setTimeout(endBoot, Math.max(250, BOOT_MIN_MS - (performance.now() - bootStart)));
