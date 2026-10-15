import { useEffect, useState } from 'react';
import { Toasts } from './ui/components.tsx';
import { Icon } from './ui/Icon.tsx';
import { autoConnect, needsProfileSetup, useProfile, getSocket, toast } from './store.ts';
import { canHearWifi } from './net/discovery.ts';
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
import { ProfileScreen } from './screens/Profile.tsx';
import { TeamsScreen } from './screens/Teams.tsx';
import { ReplayScreen } from './screens/Replay.tsx';
import { Avatar, FriendsScreen } from './screens/Friends.tsx';
import { InviteHost } from './ui/InviteHost.tsx';
import { ProfilesScreen, ProfileWelcome } from './screens/Profiles.tsx';
import type { MatchController } from './game/controller.ts';

export type Route =
  | { name: 'menu' }
  | { name: 'match'; ctrl?: MatchController; back?: Route; tutorial?: string; training?: boolean }
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
  | { name: 'missions' }
  | { name: 'profile'; id?: string }
  | { name: 'teams'; id?: string }
  | { name: 'replay'; match?: string }
  | { name: 'friends' }
  | { name: 'profiles' };

export type Nav = (r: Route) => void;

/** Four sections instead of fourteen buttons: the active section shows its pages in a second row. */
export const NAV_GROUPS: { id: string; label: string; icon: string; routes: [Route['name'], string][] }[] = [
  { id: 'play', label: 'Play', icon: 'mode/contamination', routes: [['menu', 'Home'], ['tutorials', 'Testing Chambers'], ['missions', 'Missions']] },
  { id: 'collection', label: 'Collection', icon: 'ui/cards', routes: [['collection', 'Collection'], ['deck', 'Deck Builder'], ['shop', 'Shop']] },
  { id: 'compete', label: 'Compete', icon: 'ui/trophy', routes: [['online', 'Online'], ['friends', 'Friends'], ['tournaments', 'Tournaments'], ['worldcup', 'World Cup'], ['ladder', 'Ladder'], ['teams', 'Teams']] },
  { id: 'watch', label: 'Watch', icon: 'ui/eye', routes: [['replay', 'Replays'], ['spectate', 'Spectate'], ['meta', 'Meta'], ['history', 'History']] },
];

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'menu' });
  const profile = useProfile();
  const nav: Nav = (r) => {
    setRoute(r);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    document.documentElement.lang = profile.settings.lang;
  }, [profile.settings.lang]);
  // online in the background: at start, when the app comes back to the front and, while offline, now and then
  useEffect(() => {
    void autoConnect();
    const onVisible = () => document.visibilityState === 'visible' && void autoConnect();
    document.addEventListener('visibilitychange', onVisible);
    const i = window.setInterval(() => {
      if (canHearWifi() || localStorage.getItem('contaminant.server')) void autoConnect();
    }, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(i);
    };
  }, []);
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

  // first start: the subject file comes before anything else, then Basic Training
  if (needsProfileSetup())
    return (
      <>
        <ProfileWelcome nav={nav} />
        <Toasts />
      </>
    );

  if (route.name === 'match') {
    return (
      <>
        <div className="backdrop" />
        <PlayHost route={route} nav={nav} />
        <Toasts />
        <InviteHost />
      </>
    );
  }

  const group = NAV_GROUPS.find((g) => g.routes.some(([r]) => r === route.name)) ?? null;

  return (
    <div className="shell">
      <div className="backdrop" />
      <header className="topbar">
        <button className="brand" onClick={() => nav({ name: 'menu' })} aria-label={t('Contaminant home')}>
          <Icon name="mode/contamination" size={26} />
          <span>{t('Contaminant')}</span>
        </button>
        <nav className="groups" aria-label={t('Sections')}>
          {NAV_GROUPS.map((g) => (
            <button key={g.id} className={`group-tab${group?.id === g.id ? ' current' : ''}`} aria-current={group?.id === g.id ? 'page' : undefined} onClick={() => nav({ name: g.routes[0]![0] } as Route)}>
              <Icon name={g.icon} size={24} />
              <span>{t(g.label)}</span>
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {profile.dev && (
          <span className="chip dev-badge" title={t('Developer profile: everything unlocked, unlimited gold, no ranked, tournaments, ladder or meta')}>
            DEV
          </span>
        )}
        <span className="res" title={t('Gold')}>
          <Icon name="ui/gold" size={20} />
          <b className="num">{profile.dev ? '∞' : profile.collection.gold}</b>
        </span>
        <span className="res" title={t('Trophies')}>
          <Icon name="ui/trophy" size={20} />
          <b className="num">{profile.collection.trophies}</b>
        </span>
        <button className={`me-btn${profile.online ? ' online' : ''}`} onClick={() => nav({ name: 'profile' })} title={`${t('Profile')} · ${profile.online ? t('Online') : t('Offline')}`}>
          {profile.look?.avatar ? <Avatar avatar={profile.look.avatar} color={profile.look.color} size={26} /> : null}
          <span className="me-dot" />
          <span className="me-name">{profile.online ? profile.online.name : profile.name}</span>
        </button>
        <button className={`icon-btn settings-btn${route.name === 'settings' ? ' current' : ''}`} onClick={() => nav({ name: 'settings' })} aria-label={t('Settings')} title={t('Settings')}>
          <Icon name="ui/settings" size={22} />
        </button>
      </header>
      {group && group.routes.length > 1 && (
        <nav className="subnav" aria-label={t(group.label)}>
          {group.routes.map(([r, label]) => (
            <button key={r} className={`sub-tab${route.name === r ? ' current' : ''}`} aria-current={route.name === r ? 'page' : undefined} onClick={() => nav({ name: r } as Route)}>
              {t(label)}
            </button>
          ))}
        </nav>
      )}
      <main className="page">
        {route.name === 'menu' && <MenuScreen nav={nav} />}
        {route.name === 'collection' && <CollectionScreen nav={nav} />}
        {route.name === 'deck' && <DeckBuilder nav={nav} deckId={route.deckId} />}
        {route.name === 'shop' && <ShopScreen />}
        {route.name === 'settings' && <SettingsScreen nav={nav} />}
        {route.name === 'online' && <OnlineScreen nav={nav} />}
        {route.name === 'tournaments' && <TournamentsScreen nav={nav} id={route.id} />}
        {route.name === 'worldcup' && <WorldCupScreen nav={nav} />}
        {route.name === 'meta' && <MetaScreen />}
        {route.name === 'ladder' && <LadderScreen nav={nav} />}
        {route.name === 'profile' && <ProfileScreen nav={nav} id={route.id} />}
        {route.name === 'teams' && <TeamsScreen nav={nav} id={route.id} />}
        {route.name === 'replay' && <ReplayScreen nav={nav} match={route.match} />}
        {route.name === 'history' && <HistoryScreen nav={nav} />}
        {route.name === 'spectate' && <SpectateScreen nav={nav} match={route.match} />}
        {route.name === 'tutorials' && <TutorialsScreen nav={nav} defId={route.defId} />}
        {route.name === 'missions' && <MissionsScreen />}
        {route.name === 'friends' && <FriendsScreen nav={nav} />}
        {route.name === 'profiles' && <ProfilesScreen nav={nav} />}
      </main>
      <nav className="tabbar" aria-label={t('Sections')}>
        {NAV_GROUPS.map((g) => (
          <button key={g.id} className={group?.id === g.id ? 'current' : ''} onClick={() => nav({ name: g.routes[0]![0] } as Route)}>
            <Icon name={g.icon} size={26} />
            <span>{t(g.label)}</span>
          </button>
        ))}
      </nav>
      <Toasts />
      <InviteHost />
    </div>
  );
}
