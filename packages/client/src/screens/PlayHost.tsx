import type { Nav, Route } from '../App.tsx';
import { MatchScreen } from './MatchScreen.tsx';
import { finishOfflineMatch } from '../game/offline.ts';
import { TutorialMatch } from './TutorialMatch.tsx';

export function PlayHost({ route, nav }: { route: Extract<Route, { name: 'match' }>; nav: Nav }) {
  if (route.tutorial) return <TutorialMatch defId={route.tutorial} nav={nav} />;
  return (
    <MatchScreen
      ctrl={route.ctrl}
      onExit={({ snap, log }) => {
        if (route.ctrl.kind === 'local') finishOfflineMatch(snap, log);
        nav(route.back ?? { name: 'menu' });
      }}
    />
  );
}
