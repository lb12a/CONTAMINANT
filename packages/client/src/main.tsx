import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadAssetManifest, preloadAssets } from './render/assets.ts';
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

// generated sprites are decoded before the first render so card portraits can be composed synchronously
await loadAssetManifest();
await preloadAssets(['tokens/', 'items/', 'backdrops/']);
createRoot(document.getElementById('root')!).render(<App />);
