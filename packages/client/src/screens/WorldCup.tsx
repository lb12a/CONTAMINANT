import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { BracketView, SwissView, type BMatch } from './Tournaments.tsx';

interface WorldCup {
  id: string;
  name: string;
  status: string;
  edition: number;
  schedule: { qualifiersAt: number; groupsAt: number; playoffsAt: number };
  registrations: { playerId: string; name: string }[];
  champion?: { name: string };
  podium?: { name: string; place: number }[];
  broadcastDelayRounds: number;
}

export function WorldCupScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [wc, setWc] = useState<WorldCup | null>(null);
  const [lb, setLb] = useState<Record<string, unknown> | null>(null);
  const [hall, setHall] = useState<{ title: string; player_name: string; kind: string; created: number }[]>([]);
  const [live, setLive] = useState<{ id: string; names: [string, string]; round: number; vp: [number, number]; featured: boolean; tournament?: string }[]>([]);
  useEffect(() => {
    if (!p.online) return;
    const f = () => {
      getApi()
        .get<{ worldcup: WorldCup | null }>('/api/worldcup')
        .then((r) => setWc(r.worldcup))
        .catch(() => undefined);
      getApi()
        .get<{ leaderboard: Record<string, unknown> }>('/api/worldcup/leaderboard')
        .then((r) => setLb(r.leaderboard))
        .catch(() => undefined);
      getApi()
        .get<{ matches: typeof live }>('/api/live')
        .then((r) => setLive(r.matches.filter((m) => m.featured)))
        .catch(() => undefined);
    };
    f();
    getApi()
      .get<{ entries: typeof hall }>('/api/hall-of-fame')
      .then((r) => setHall(r.entries))
      .catch(() => undefined);
    const i = setInterval(f, 6000);
    return () => clearInterval(i);
  }, [p.online]);
  if (!p.online) return <p className="muted">Go online to follow the World Cup.</p>;
  const names = Object.fromEntries((wc?.registrations ?? []).map((r) => [r.playerId, r.name]));
  const registered = wc?.registrations.some((r) => r.playerId === p.online!.playerId);
  return (
    <div className="col">
      <h1>🏆 {t('World Cup')}</h1>
      {!wc && <p className="muted">No World Cup is scheduled yet. Admins open an edition with POST /api/admin/worldcup/open.</p>}
      {wc && (
        <div className="panel rivets">
          <h2>{wc.name}</h2>
          <div className="row wrap small">
            {(['registration', 'qualifiers', 'groups', 'playoffs', 'finished'] as const).map((s) => (
              <span key={s} className={`chip ${wc.status === s ? 'buff' : 'neutral'}`}>
                {s === 'qualifiers' ? `Open qualifiers · ${new Date(wc.schedule.qualifiersAt).toLocaleDateString()}` : s === 'groups' ? `Group stage · ${new Date(wc.schedule.groupsAt).toLocaleDateString()}` : s === 'playoffs' ? `Playoffs · ${new Date(wc.schedule.playoffsAt).toLocaleDateString()}` : s}
              </span>
            ))}
          </div>
          <p className="small muted">Swiss open qualifiers → 4 round-robin groups of 4 → 8-player playoffs with a 3rd place match. Every match is broadcast with a {wc.broadcastDelayRounds}-round delay.</p>
          {wc.status === 'registration' && (registered ? <span className="chip buff">You are registered</span> : <button className="btn buy" onClick={async () => { const r = await getApi().post<{ ok: boolean; error?: string }>('/api/worldcup/register', { deckId: p.activeDeck }); toast(r.error ?? 'Registered for the World Cup', r.error ? 'bad' : 'good'); }}>{t('Register')}</button>)}
          {wc.champion && (
            <div className="col" style={{ alignItems: 'center' }}>
              <div style={{ fontSize: 64 }}>👑</div>
              <b className="display" style={{ fontSize: 26, color: 'var(--gold)' }}>
                World Champion: {wc.champion.name}
              </b>
              <span className="small">{wc.podium?.map((x) => `#${x.place} ${x.name}`).join(' · ')}</span>
            </div>
          )}
        </div>
      )}
      {live.length > 0 && (
        <div className="panel">
          <h3>Live broadcasts</h3>
          <div className="row wrap">
            {live.map((m) => (
              <button key={m.id} className="btn secondary" onClick={() => nav({ name: 'spectate', match: m.id })}>
                👁 {m.names[0]} {m.vp[0]}:{m.vp[1]} {m.names[1]} · R{m.round}
              </button>
            ))}
          </div>
        </div>
      )}
      {lb && (
        <div className="panel">
          <h3>Live leaderboard — {String(lb.stage)}</h3>
          {lb.stage === 'qualifiers' && <SwissView standings={lb.standings as never} matches={[]} names={names} nav={nav} />}
          {lb.stage === 'groups' &&
            Object.entries(lb.groups as Record<string, { id: string; name: string; points: number; wins: number; draws: number; losses: number; buchholz: number; vpDiff: number }[]>).map(([g, rows]) => (
              <div key={g}>
                <b>Group {g}</b>
                <SwissView standings={rows} matches={[]} names={names} nav={nav} />
              </div>
            ))}
          {(lb.stage === 'playoffs' || lb.stage === 'finished') && Array.isArray(lb.bracket) && <BracketView matches={lb.bracket as BMatch[]} names={names} nav={nav} />}
          {lb.stage === 'registration' && <span className="muted">{String(lb.registrations)} registered</span>}
        </div>
      )}
      <div className="panel">
        <h3>{t('Hall of Fame')}</h3>
        {hall.length === 0 && <span className="muted small">The hall is empty. The first crown is still unclaimed.</span>}
        {hall.map((h, i) => (
          <div key={i} className="small">
            {h.kind === 'world_champion' ? '👑' : h.kind === 'season_champion' ? '🎖' : '🏅'} <b>{h.player_name}</b> — {h.title}
          </div>
        ))}
      </div>
    </div>
  );
}
