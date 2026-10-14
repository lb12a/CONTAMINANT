import type { Nav, Route } from '../App.tsx';
import { MatchScreen } from './MatchScreen.tsx';
import { finishOfflineMatch } from '../game/offline.ts';
import { TutorialMatch } from './TutorialMatch.tsx';
import { BasicTraining } from './BasicTraining.tsx';

export function PlayHost({ route, nav }: { route: Extract<Route, { name: 'match' }>; nav: Nav }) {
  if (route.training) return <BasicTraining nav={nav} />;
  if (route.tutorial || !route.ctrl) return <TutorialMatch defId={route.tutorial ?? 'piggybank'} nav={nav} />;
  const ctrl = route.ctrl;
  return (
    <MatchScreen
      ctrl={ctrl}
      onExit={({ snap, log }) => {
        if (ctrl.kind === 'local') finishOfflineMatch(snap, log);
        nav(route.back ?? { name: 'menu' });
      }}
    />
  );
}
