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

// loading screen (markup in index.html): progress follows the asset preload, eerie lines rotate meanwhile
const LINES = ['Waking the specimens…', 'Sharpening the scalpels…', 'Counting the teeth…', 'Mopping up the green stuff…', 'Unlocking the cages…', 'Lighting the lab lamps…'];
const fill = document.getElementById('boot-fill');
const msg = document.getElementById('boot-msg');
let line = 0;
const rotate = window.setInterval(() => msg && (msg.textContent = LINES[++line % LINES.length]!), 1400);
const progress = (f: number) => fill && (fill.style.width = `${Math.round(8 + f * 90)}%`);

// generated sprites are decoded before the first render so card portraits can be composed synchronously
await Promise.all([loadAssetManifest(), loadLanguage(getProfile().settings.lang)]);
progress(0.08);
await preloadAssets(['tokens/', 'items/', 'backdrops/', 'icons/'], 9000, (done, total) => progress(done / Math.max(1, total)));
progress(1);
createRoot(document.getElementById('root')!).render(<App />);
// Android app: a daily evening reminder that the free reward is waiting
void scheduleDailyReminder('Contaminant', t('Your daily reward and the free chest are waiting in the lab.'));
window.setTimeout(() => {
  window.clearInterval(rotate);
  const boot = document.getElementById('boot');
  boot?.classList.add('gone');
  window.setTimeout(() => boot?.remove(), 700);
}, 250);
