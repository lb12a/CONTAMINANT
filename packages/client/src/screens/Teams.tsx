import { useEffect, useState } from 'react';
import { CHARACTER_LIST } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { getApi, toast, useProfile } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';
import { t as tr } from '../i18n.ts';
import { Avatar } from './Friends.tsx';
import { OnlineConnect } from './Online.tsx';

const TEAM_COLORS = ['#8CFF5A', '#FF9A1F', '#4FE3FF', '#ff7ad6', '#b48cff', '#e8dfc8', '#ff4d4d', '#fff6a0'];

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
  color?: string;
  emblem?: string;
  inviteCode?: string;
  roster: { playerId: string; name: string; role: 'captain' | 'officer' | 'member'; mmr: number; teamMmr: number; games: number; wins: number }[];
}

const ROLE_ICON: Record<string, string | null> = { captain: 'ui/crown', officer: 'ui/medal', member: null };

/** Team ladder, team pages, create / join / leave and, for captain and officers, running the team. */
export function TeamsScreen({ nav, id }: { nav: Nav; id?: string }) {
  const p = useProfile();
  const [ladder, setLadder] = useState<TeamRow[]>([]);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [form, setForm] = useState({ name: '', tag: '', motto: '', open: true, color: TEAM_COLORS[0]! });
  const [code, setCode] = useState('');
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
  if (!p.online)
    return (
      <div className="col" style={{ maxWidth: 620 }}>
        <h1>{tr('Teams')}</h1>
        <p className="muted">{tr('Teams need a server. One click finds one.')}</p>
        <OnlineConnect />
      </div>
    );
  const mine = ladder.find((t) => t.roster.some((r) => r.playerId === me));
  const act = async (path: string, body: unknown = {}, done?: string) => {
    try {
      const r = await getApi().post<{ ok: boolean; error?: string; team?: TeamRow }>(path, body);
      if (!r.ok) return toast(r.error ?? 'Failed', 'bad');
      toast(done ?? (r.team ? `${tr('Welcome to')} ${r.team.name}` : tr('Done')), 'good');
      if (r.team && r.team.id !== id) nav({ name: 'teams', id: r.team.id });
      if (r.team) setTeam(r.team);
      setTick((x) => x + 1);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  if (id && team) {
    const myRole = team.roster.find((r) => r.playerId === me)?.role;
    const staff = myRole === 'captain' || myRole === 'officer';
    const manage = (action: string, body: Record<string, unknown> = {}, done?: string) => act(`/api/teams/${team.id}/manage`, { action, ...body }, done);
    return (
      <div className="col">
        <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => nav({ name: 'teams' })}>
          ← {tr('Team ladder')}
        </button>
        <section className="panel profile-head team-head" style={{ ['--team' as string]: team.color ?? 'var(--bone-dim)' }}>
          <Avatar avatar={team.emblem} color={team.color} size={84} name={team.tag} />
          <div className="col grow" style={{ gap: 2 }}>
            <span className="small muted">{team.open ? tr('Open team') : tr('Invite only')}</span>
            <h1 style={{ margin: 0 }}>
              <span className="team-tag" style={{ color: team.color }}>
                [{team.tag}]
              </span>{' '}
              {team.name}
            </h1>
            {team.motto && <span className="muted">“{team.motto}”</span>}
          </div>
          <div className="profile-stats">
            <div>
              <b className="display num">{team.rating}</b>
              <span className="small muted">
                {tr('Team rating')} · {team.division}
              </span>
            </div>
            <div>
              <b className="display num">
                {team.wins}–{team.losses}
              </b>
              <span className="small muted">{tr('Team Battles')}</span>
            </div>
            <div>
              <b className="display num">{team.roster.length}</b>
              <span className="small muted">{tr('Members')}</span>
            </div>
          </div>
          <div className="row">
            {myRole ? (
              <button className="btn danger small" onClick={() => confirm(`${tr('Leave')} ${team.name}?`) && act('/api/teams/leave', {}, tr('You left the team'))}>
                {tr('Leave team')}
              </button>
            ) : (
              !mine &&
              team.open && (
                <button className="btn primary" onClick={() => act(`/api/teams/${team.id}/join`)}>
                  {tr('Join team')}
                </button>
              )
            )}
          </div>
        </section>
        <div className="wc-grid">
          <section className="panel">
            <h2>{tr('Roster')}</h2>
            {team.roster.map((r) => (
              <div key={r.playerId} className={`person${r.playerId === me ? ' me' : ''}`}>
                <span style={{ width: 20 }}>{ROLE_ICON[r.role] && <Icon name={ROLE_ICON[r.role]!} size={18} label={r.role} />}</span>
                <button className="person-main" onClick={() => nav({ name: 'profile', id: r.playerId })}>
                  <b>{r.name}</b>
                  <span className="small muted">
                    {tr(r.role)} · {r.mmr} MMR · {r.teamMmr} {tr('team')} · {r.wins}/{r.games}
                  </span>
                </button>
                {staff && r.playerId !== me && r.role !== 'captain' && (
                  <div className="person-actions">
                    {myRole === 'captain' && (
                      <>
                        {r.role === 'member' ? (
                          <button className="btn secondary small" onClick={() => manage('promote', { playerId: r.playerId }, `${r.name}: ${tr('officer')}`)}>
                            {tr('Promote')}
                          </button>
                        ) : (
                          <button className="btn secondary small" onClick={() => manage('demote', { playerId: r.playerId }, `${r.name}: ${tr('member')}`)}>
                            {tr('Demote')}
                          </button>
                        )}
                        <button className="btn secondary small" onClick={() => confirm(`${tr('Make')} ${r.name} ${tr('captain')}?`) && manage('captain', { playerId: r.playerId })}>
                          {tr('Make captain')}
                        </button>
                      </>
                    )}
                    {(myRole === 'captain' || r.role === 'member') && (
                      <button className="btn ghost small" aria-label={`${tr('Remove')} ${r.name}`} onClick={() => confirm(`${tr('Remove')} ${r.name}?`) && manage('kick', { playerId: r.playerId })}>
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="small muted">{tr('Queue for Team Battles together from the Online page (party code) to play for your team.')}</p>
          </section>
          {staff && <TeamSettings team={team} manage={manage} />}
        </div>
      </div>
    );
  }

  return (
    <div className="col">
      <h1>{tr('Teams')}</h1>
      <div className="wc-grid">
        <section className="panel">
          <h2>{tr('Team ladder')}</h2>
          {!ladder.length && <span className="muted small">{tr('No team has been founded yet.')}</span>}
          {ladder.map((t) => (
            <div key={t.id} className={`person${t.id === mine?.id ? ' me' : ''}`}>
              <b className="num" style={{ width: 24 }}>
                {t.rank}
              </b>
              <Avatar avatar={t.emblem} color={t.color} size={36} name={t.tag} />
              <button className="person-main" onClick={() => nav({ name: 'teams', id: t.id })}>
                <b>
                  <span className="team-tag" style={{ color: t.color }}>
                    [{t.tag}]
                  </span>{' '}
                  {t.name}
                </b>
                <span className="small muted">
                  {t.rating} · {t.division} · {t.roster.length} {tr('members')} · {t.open ? tr('open') : tr('invite only')}
                </span>
              </button>
            </div>
          ))}
        </section>
        <section className="panel col">
          {mine ? (
            <>
              <h2>{tr('Your team')}</h2>
              <button className="btn primary" onClick={() => nav({ name: 'teams', id: mine.id })}>
                [{mine.tag}] {mine.name}
              </button>
            </>
          ) : (
            <>
              <h2>{tr('Join with an invite code')}</h2>
              <form
                className="row wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act('/api/teams/join-code', { code });
                }}
              >
                <input value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC234" aria-label={tr('Invite code')} style={{ width: 120 }} />
                <button className="btn secondary small" disabled={code.length < 6}>
                  {tr('Join')}
                </button>
              </form>
              <h2 style={{ marginTop: 12 }}>{tr('Found a team')}</h2>
              <form
                className="col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act('/api/teams', form);
                }}
              >
                <label className="col small">
                  {tr('Name')}
                  <input value={form.name} maxLength={24} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr('Night Shift')} />
                </label>
                <label className="col small">
                  {tr('Tag (2–4)')}
                  <input value={form.tag} maxLength={4} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} placeholder="NSH" />
                </label>
                <label className="col small">
                  {tr('Motto')}
                  <input value={form.motto} maxLength={80} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder={tr('We never sleep.')} />
                </label>
                <ColorSwatches value={form.color} onChange={(color) => setForm({ ...form, color })} />
                <label className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" checked={form.open} onChange={(e) => setForm({ ...form, open: e.target.checked })} /> {tr('Anyone can join (otherwise invite code only)')}
                </label>
                <button className="btn primary" type="submit">
                  {tr('Found team')}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function ColorSwatches({ value, onChange, colors = TEAM_COLORS }: { value?: string; onChange: (c: string) => void; colors?: string[] }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={tr('Colour')}>
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} className={`swatch${value === c ? ' on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
    </div>
  );
}

function TeamSettings({ team, manage }: { team: TeamRow; manage: (action: string, body?: Record<string, unknown>, done?: string) => Promise<void> }) {
  const [motto, setMotto] = useState(team.motto);
  const [picking, setPicking] = useState(false);
  return (
    <section className="panel col">
      <h2>{tr('Run the team')}</h2>
      <div className="col small" style={{ gap: 4 }}>
        {tr('Invite code')}
        <div className="row wrap">
          <b className="code num friend-code-inline">{team.inviteCode}</b>
          <button className="btn secondary small" onClick={() => void navigator.clipboard?.writeText(team.inviteCode ?? '').then(() => toast(tr('Code copied'), 'good'))}>
            {tr('Copy')}
          </button>
          <button className="btn ghost small" onClick={() => manage('new-code', {}, tr('New invite code'))}>
            {tr('New code')}
          </button>
        </div>
      </div>
      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={team.open} onChange={(e) => manage('settings', { open: e.target.checked }, e.target.checked ? tr('Team is open') : tr('Team is invite-only'))} /> {tr('Anyone can join (otherwise invite code only)')}
      </label>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void manage('settings', { motto }, tr('Motto saved'));
        }}
      >
        <input value={motto} maxLength={80} onChange={(e) => setMotto(e.target.value)} placeholder={tr('Motto')} aria-label={tr('Motto')} style={{ flex: '1 1 200px' }} />
        <button className="btn secondary small">{tr('Save')}</button>
      </form>
      <div className="col small" style={{ gap: 4 }}>
        {tr('Banner colour')}
        <ColorSwatches value={team.color} onChange={(color) => manage('settings', { color }, tr('Colour saved'))} />
      </div>
      <div className="col small" style={{ gap: 4 }}>
        {tr('Emblem creature')}
        <button className="btn secondary small" style={{ alignSelf: 'flex-start' }} onClick={() => setPicking((v) => !v)}>
          {picking ? tr('Close') : tr('Choose emblem')}
        </button>
        {picking && (
          <div className="avatar-grid">
            {CHARACTER_LIST.map((c) => (
              <button key={c.id} className={`avatar-pick${team.emblem === c.id ? ' on' : ''}`} title={c.name} onClick={() => (setPicking(false), manage('settings', { emblem: c.id }, tr('Emblem saved')))}>
                <Avatar avatar={c.id} color={team.color} size={44} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
