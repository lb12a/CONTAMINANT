import { useEffect, useState } from 'react';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';

interface TeamRow {
  id: string;
  rank?: number;
  name: string;
  tag: string;
  motto: string;
  open: boolean;
  rating: number;
  division: string;
  wins: number;
  losses: number;
  draws: number;
  captain: string;
  roster: { playerId: string; name: string; role: string; mmr: number; teamMmr: number; games: number; wins: number }[];
}

/** Team ladder, team pages, create / join / leave. */
export function TeamsScreen({ nav, id }: { nav: Nav; id?: string }) {
  const p = useProfile();
  const [ladder, setLadder] = useState<TeamRow[]>([]);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [form, setForm] = useState({ name: '', tag: '', motto: '' });
  const [tick, setTick] = useState(0);
  const me = p.online?.playerId;
  useEffect(() => {
    if (!p.online) return;
    getApi()
      .get<{ teams: TeamRow[] }>('/api/teams')
      .then((r) => setLadder(r.teams))
      .catch(() => undefined);
    if (id)
      getApi()
        .get<{ team: TeamRow }>(`/api/teams/${id}`)
        .then((r) => setTeam(r.team))
        .catch((e: Error) => toast(e.message, 'bad'));
    else setTeam(null);
  }, [p.online, id, tick]);
  if (!p.online) return <p className="muted">Go online to found or join a team.</p>;
  const mine = ladder.find((t) => t.roster.some((r) => r.playerId === me));
  const act = async (path: string, body: unknown = {}) => {
    try {
      const r = await getApi().post<{ ok: boolean; error?: string; team?: TeamRow }>(path, body);
      if (!r.ok) return toast(r.error ?? 'Failed', 'bad');
      toast(r.team ? `Welcome to ${r.team.name}` : 'Done', 'good');
      if (r.team) nav({ name: 'teams', id: r.team.id });
      setTick((x) => x + 1);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  if (id && team) {
    const member = team.roster.some((r) => r.playerId === me);
    return (
      <div className="col">
        <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => nav({ name: 'teams' })}>
          ← Team ladder
        </button>
        <section className="panel profile-head">
          <div className="col" style={{ gap: 2 }}>
            <span className="small muted">{team.open ? 'Open team' : 'Invite only'}</span>
            <h1 style={{ margin: 0 }}>
              <span className="team-tag">[{team.tag}]</span> {team.name}
            </h1>
            {team.motto && <span className="muted">“{team.motto}”</span>}
          </div>
          <div className="profile-stats">
            <div>
              <b className="display num">{team.rating}</b>
              <span className="small muted">Team rating · {team.division}</span>
            </div>
            <div>
              <b className="display num">
                {team.wins}–{team.losses}
              </b>
              <span className="small muted">Team Battles</span>
            </div>
            <div>
              <b className="display num">{team.roster.length}</b>
              <span className="small muted">Members</span>
            </div>
          </div>
          <div className="row">
            {member ? (
              <button className="btn danger small" onClick={() => confirm(`Leave ${team.name}?`) && act('/api/teams/leave')}>
                Leave team
              </button>
            ) : (
              !mine && team.open && (
                <button className="btn primary" onClick={() => act(`/api/teams/${team.id}/join`)}>
                  Join team
                </button>
              )
            )}
          </div>
        </section>
        <section className="panel">
          <h2>Roster</h2>
          <table className="table">
            <tbody>
              {team.roster.map((r) => (
                <tr key={r.playerId} className={r.playerId === me ? 'me' : ''}>
                  <td>{r.role === 'captain' ? <Icon name="ui/crown" size={16} label="Captain" /> : null}</td>
                  <td>
                    <button className="link-name" onClick={() => nav({ name: 'profile', id: r.playerId })}>
                      {r.name}
                    </button>
                  </td>
                  <td className="num">{r.mmr} MMR</td>
                  <td className="num muted">{r.teamMmr} team</td>
                  <td className="num muted">
                    {r.wins}/{r.games}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Queue for Team Battles together from the Online screen (party code) to play for your team.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="col">
      <h1>Teams</h1>
      <div className="wc-grid">
        <section className="panel">
          <h2>Team ladder</h2>
          {!ladder.length && <span className="muted small">No team has been founded yet.</span>}
          <table className="table">
            <tbody>
              {ladder.map((t) => (
                <tr key={t.id} className={t.id === mine?.id ? 'me' : ''}>
                  <td className="num">{t.rank}</td>
                  <td>
                    <button className="link-name" onClick={() => nav({ name: 'teams', id: t.id })}>
                      <span className="team-tag">[{t.tag}]</span> {t.name}
                    </button>
                  </td>
                  <td className="num">{t.rating}</td>
                  <td className="small muted">{t.division}</td>
                  <td className="num muted">{t.roster.length} <Icon name="ui/person" size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          {mine ? (
            <>
              <h2>Your team</h2>
              <button className="btn primary" onClick={() => nav({ name: 'teams', id: mine.id })}>
                [{mine.tag}] {mine.name}
              </button>
            </>
          ) : (
            <>
              <h2>Found a team</h2>
              <form
                className="col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act('/api/teams', form);
                }}
              >
                <label className="col small">
                  Name
                  <input value={form.name} maxLength={24} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Night Shift" />
                </label>
                <label className="col small">
                  Tag (2–4)
                  <input value={form.tag} maxLength={4} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} placeholder="NSH" />
                </label>
                <label className="col small">
                  Motto
                  <input value={form.motto} maxLength={80} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder="We never sleep." />
                </label>
                <button className="btn primary" type="submit">
                  Found team
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
