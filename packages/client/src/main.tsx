import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { loadAssetManifest } from './render/assets.ts';
import './styles.css';

void loadAssetManifest();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(<App />);
