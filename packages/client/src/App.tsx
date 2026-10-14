import { useEffect, useState } from 'react';
import { Toasts } from './ui/components.tsx';
import { useProfile, getSocket, toast } from './store.ts';
import { OnlineMatch } from './game/controller.ts';
import { t } from './i18n.ts';
import { MenuScreen } from './screens/Menu.tsx';
import { PlayHost } from './screens/PlayHost.tsx';
import { CollectionScreen } from './screens/CollectionScreen.tsx';
import { DeckBuilder } from './screens/DeckBuilder.tsx';
import { ShopScreen } from './screens/Shop.tsx';
import { SettingsScreen } from './screens/Settings.tsx';
import { OnlineScreen } from './screens/Online.tsx';
import { TournamentsScreen } from './screens/Tournaments.tsx';
import { WorldCupScreen } from './screens/WorldCup.tsx';
import { MetaScreen } from './screens/Meta.tsx';
import { LadderScreen } from './screens/Ladder.tsx';
import { HistoryScreen } from './screens/History.tsx';
import { SpectateScreen } from './screens/Spectate.tsx';
import { TutorialsScreen } from './screens/Tutorials.tsx';
import { MissionsScreen } from './screens/Missions.tsx';
import type { MatchController } from './game/controller.ts';

export type Route =
  | { name: 'menu' }
  | { name: 'match'; ctrl?: MatchController; back?: Route; tutorial?: string }
  | { name: 'collection' }
  | { name: 'deck'; deckId?: string }
  | { name: 'shop' }
  | { name: 'settings' }
  | { name: 'online' }
  | { name: 'tournaments'; id?: string }
  | { name: 'worldcup' }
  | { name: 'meta' }
  | { name: 'ladder' }
  | { name: 'history' }
  | { name: 'spectate'; match?: string }
  | { name: 'tutorials'; defId?: string }
  | { name: 'missions' };

export type Nav = (r: Route) => void;

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'menu' });
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = useProfile();
  const nav: Nav = (r) => {
    setMenuOpen(false);
    setRoute(r);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    document.documentElement.lang = profile.settings.lang;
  }, [profile.settings.lang]);
  // keep the socket alive while online: matches found by the queue, friend lobbies and tournament
  // calls all arrive here and open the match screen
  useEffect(() => {
    if (!profile.online) return;
    const s = getSocket();
    if (!s) return;
    return s.on((m) => {
      if (m.t === 'match_start') setRoute({ name: 'match', ctrl: new OnlineMatch(s, m), back: { name: 'online' } });
      if (m.t === 'tournament') toast(`${m.event.replace(/_/g, ' ')}${m.data && typeof m.data === 'object' && 'name' in m.data ? `: ${(m.data as { name: string }).name}` : ''}`, 'info');
    });
  }, [profile.online]);

  if (route.name === 'match') {
    return (
      <>
        <div className="backdrop" />
        <PlayHost route={route} nav={nav} />
        <Toasts />
      </>
    );
  }

  const links: [Route['name'], string][] = [
    ['collection', t('Collection')],
    ['deck', t('Deck Builder')],
    ['tutorials', t('Testing Chambers')],
    ['shop', t('Shop')],
    ['missions', t('Missions')],
    ['online', t('Online')],
    ['tournaments', t('Tournaments')],
    ['worldcup', t('World Cup')],
    ['meta', t('Meta')],
    ['ladder', t('Ladder')],
    ['history', t('History')],
    ['settings', t('Settings')],
  ];

  return (
    <div className="shell">
      <div className="backdrop" />
      <nav className={`topnav${menuOpen ? ' open' : ''}`}>
        <span className="brand" onClick={() => nav({ name: 'menu' })}>
          ☣ CONTAMINANT
        </span>
        <div className="navlinks row wrap" style={{ gap: 4 }}>
          {links.map(([n, label]) => (
            <button key={n} className={`btn secondary small${route.name === n ? ' active' : ''}`} onClick={() => nav({ name: n } as Route)}>
              {label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="chip num" title="Gold">🪙 {profile.collection.gold}</span>
        <span className="chip num" title="Trophies">🏆 {profile.collection.trophies}</span>
        <span className={`chip ${profile.online ? 'buff' : 'neutral'}`}>{profile.online ? `● ${profile.online.name}` : t('Offline')}</span>
        <button className="icon-btn menu-burger" onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
          ☰
        </button>
      </nav>
      <main className="page">
        {route.name === 'menu' && <MenuScreen nav={nav} />}
        {route.name === 'collection' && <CollectionScreen nav={nav} />}
        {route.name === 'deck' && <DeckBuilder nav={nav} deckId={route.deckId} />}
        {route.name === 'shop' && <ShopScreen />}
        {route.name === 'settings' && <SettingsScreen />}
        {route.name === 'online' && <OnlineScreen nav={nav} />}
        {route.name === 'tournaments' && <TournamentsScreen nav={nav} id={route.id} />}
        {route.name === 'worldcup' && <WorldCupScreen nav={nav} />}
        {route.name === 'meta' && <MetaScreen />}
        {route.name === 'ladder' && <LadderScreen />}
        {route.name === 'history' && <HistoryScreen />}
        {route.name === 'spectate' && <SpectateScreen nav={nav} match={route.match} />}
        {route.name === 'tutorials' && <TutorialsScreen nav={nav} defId={route.defId} />}
        {route.name === 'missions' && <MissionsScreen />}
      </main>
      <Toasts />
    </div>
  );
}
