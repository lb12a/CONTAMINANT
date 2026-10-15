import { useEffect, useState } from 'react';
import { CHARACTERS } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { getApi, getProfile, setProfile, toast, useProfile, type Look } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';
import { t } from '../i18n.ts';
import { Avatar, challenge, FriendCode } from './Friends.tsx';
import { ColorSwatches } from './Teams.tsx';

interface ProfileData {
  player: { id: string; name: string; mmr: number; peak: number; division: string; games: number; wins: number; losses: number; draws: number; titles: string[]; isBot: boolean; dev?: boolean };
  rank: number | null;
  team: { id: string; name: string; tag: string } | null;
  circuit: { points: number; majorWins: number; majors: { name: string; place: number; points: number }[] } | null;
  recent: { id: string; kind: string; p0: string; p1: string; p0_name: string; p1_name: string; winner: number | null; vp0: number; vp1: number; rounds: number; ended: number | null }[];
  honours: { kind: string; title: string; created: number }[];
  profile?: Look;
  code?: string;
  friend?: boolean;
}

const HONOUR_ICON: Record<string, string> = { world_champion: 'ui/crown', world_podium: 'ui/medal', season_champion: 'ui/medal', trophy: 'ui/trophy' };
const LOOK_COLORS = ['#8CFF5A', '#FF9A1F', '#4FE3FF', '#ff7ad6', '#b48cff', '#e8dfc8', '#ff4d4d', '#fff6a0'];

/** Saves the profile card locally and, when online, on the server so other players see it. */
async function saveLook(patch: Look): Promise<void> {
  setProfile((x) => ({ ...x, look: { ...x.look, ...patch } }));
  if (!getProfile().online) return;
  try {
    await getApi().post('/api/me/profile', patch);
  } catch (e) {
    toast((e as Error).message, 'bad');
  }
}

/** The player's own card: avatar creature, colour, title and motto. */
function LookEditor() {
  const p = useProfile();
  const look = p.look ?? {};
  const [motto, setMotto] = useState(look.motto ?? '');
  const [picking, setPicking] = useState(false);
  const owned = Object.keys(p.collection.chars).filter((id) => CHARACTERS[id]);
  const titles = p.collection.titles ?? [];
  return (
    <section className="panel col look-editor">
      <h2>{t('Your profile card')}</h2>
      <div className="row wrap" style={{ gap: 14, alignItems: 'center' }}>
        <button className="avatar-pick big" onClick={() => setPicking((v) => !v)} title={t('Choose avatar')}>
          <Avatar avatar={look.avatar} color={look.color} size={88} name={p.online?.name ?? p.name} />
        </button>
        <div className="col grow" style={{ gap: 2 }}>
          <b className="display" style={{ fontSize: 24, color: look.color }}>
            {p.online?.name ?? p.name}
          </b>
          {look.title && <span className="chip buff" style={{ alignSelf: 'flex-start' }}>{look.title}</span>}
          {look.motto && <span className="muted">“{look.motto}”</span>}
        </div>
      </div>
      {picking && (
        <div className="avatar-grid">
          {owned.map((id) => (
            <button key={id} className={`avatar-pick${look.avatar === id ? ' on' : ''}`} title={CHARACTERS[id]!.name} onClick={() => (setPicking(false), void saveLook({ avatar: id }))}>
              <Avatar avatar={id} color={look.color} size={46} />
            </button>
          ))}
        </div>
      )}
      <div className="col small" style={{ gap: 4 }}>
        {t('Colour')}
        <ColorSwatches value={look.color} colors={LOOK_COLORS} onChange={(color) => void saveLook({ color })} />
      </div>
      <label className="col small">
        {t('Title')}
        <select value={look.title ?? ''} onChange={(e) => void saveLook({ title: e.target.value || undefined })}>
          <option value="">{t('No title')}</option>
          {titles.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {!titles.length && <span className="muted">{t('Titles are earned in tournaments, the World Cup and seasons.')}</span>}
      </label>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          void saveLook({ motto: motto.trim() || undefined }).then(() => toast(t('Motto saved'), 'good'));
        }}
      >
        <input value={motto} maxLength={80} onChange={(e) => setMotto(e.target.value)} placeholder={t('Motto')} aria-label={t('Motto')} style={{ flex: '1 1 220px' }} />
        <button className="btn secondary small">{t('Save')}</button>
      </form>
    </section>
  );
}

/** Offline record from the local match history. */
function LocalRecord() {
  const p = useProfile();
  const h = p.history;
  const wins = h.filter((x) => x.won === true).length;
  const losses = h.filter((x) => x.won === false).length;
  return (
    <section className="panel">
      <h2>{t('Record')}</h2>
      <div className="profile-stats">
        <div>
          <b className="display num">{p.collection.trophies}</b>
          <span className="small muted">{t('Trophies')}</span>
        </div>
        <div>
          <b className="display num">
            {wins}–{losses}
          </b>
          <span className="small muted">{t('Last 50 matches')}</span>
        </div>
        <div>
          <b className="display num">{Object.keys(p.collection.chars).length}</b>
          <span className="small muted">{t('Characters')}</span>
        </div>
      </div>
    </section>
  );
}

/** Player profile: the personal card (editable for yourself), rating, record, team, honours and recent matches. */
export function ProfileScreen({ nav, id }: { nav: Nav; id?: string }) {
  const p = useProfile();
  const mine = !id || id === p.online?.playerId;
  const pid = id ?? p.online?.playerId;
  const [data, setData] = useState<ProfileData | null>(null);
  useEffect(() => {
    if (!p.online || !pid) return;
    setData(null);
    getApi()
      .get<ProfileData>(`/api/players/${pid}`)
      .then(setData)
      .catch((e: Error) => toast(e.message, 'bad'));
  }, [p.online, pid]);
  // push the local card to a server that does not know it yet
  useEffect(() => {
    if (mine && p.online && data && p.look && JSON.stringify(data.profile ?? {}) !== JSON.stringify(p.look)) void getApi().post('/api/me/profile', p.look).catch(() => undefined);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const switcher = mine && (
    <button className="btn secondary small" style={{ alignSelf: 'flex-end' }} onClick={() => nav({ name: 'profiles' })}>
      <Icon name="ui/person" size={18} /> {t('Switch profile')}
    </button>
  );
  if (!p.online)
    return (
      <div className="col profile-page">
        {switcher}
        <LookEditor />
        <LocalRecord />
        <p className="muted small">{t('Go online for a ladder rank, friends and a public profile.')}</p>
      </div>
    );
  if (!data)
    return (
      <div className="col profile-page">
        {switcher}
        {mine && <LookEditor />}
        <p className="muted">{t('Opening the file…')}</p>
      </div>
    );
  const pl = data.player;
  const look = data.profile ?? {};
  const winRate = pl.games ? Math.round((pl.wins / pl.games) * 100) : 0;
  return (
    <div className="col profile-page">
      {switcher}
      {mine && <LookEditor />}
      <section className="panel profile-head">
        {!mine && <Avatar avatar={look.avatar} color={look.color} size={84} name={pl.name} />}
        <div className="col grow" style={{ gap: 2 }}>
          <span className="small muted">{pl.isBot ? t('Laboratory bot') : pl.dev ? t('Developer account') : data.rank ? `${t('Rank')} #${data.rank}` : t('Unranked')}</span>
          <h1 style={{ margin: 0, color: look.color }}>
            {data.team && <span className="team-tag">[{data.team.tag}]</span>} {pl.name}
          </h1>
          {look.title && <span className="chip buff" style={{ alignSelf: 'flex-start' }}>{look.title}</span>}
          {!mine && look.motto && <span className="muted">“{look.motto}”</span>}
          {data.team && (
            <button className="link-name small" onClick={() => nav({ name: 'teams', id: data.team!.id })}>
              {data.team.name}
            </button>
          )}
        </div>
        <div className="profile-stats">
          <div>
            <b className="display num">{pl.mmr}</b>
            <span className="small muted">MMR · {pl.division}</span>
          </div>
          <div>
            <b className="display num">{pl.peak}</b>
            <span className="small muted">{t('Peak')}</span>
          </div>
          <div>
            <b className="display num">{winRate}%</b>
            <span className="small muted">
              {pl.wins}W {pl.losses}L {pl.draws}D
            </span>
          </div>
          <div>
            <b className="display num">{data.circuit?.points ?? 0}</b>
            <span className="small muted">{t('Circuit Points')}</span>
          </div>
        </div>
        {mine && data.code && <FriendCode code={data.code} />}
        {!mine && !pl.isBot && (
          <div className="row wrap">
            {!data.friend && (
              <button
                className="btn secondary small"
                onClick={() =>
                  getApi()
                    .post<{ status: string }>('/api/friends/add', { id: pl.id })
                    .then((r) => toast(r.status === 'friends' ? t('You are now friends') : t('Friend request sent'), 'good'))
                    .catch((e: Error) => toast(e.message, 'bad'))
                }
              >
                <Icon name="ui/friends" size={18} /> {t('Add friend')}
              </button>
            )}
            <button className="btn primary small" onClick={() => challenge({ id: pl.id, name: pl.name })}>
              <Icon name="ui/sword" size={18} /> {t('Challenge')}
            </button>
          </div>
        )}
      </section>
      <div className="wc-grid">
        <section className="panel">
          <h2>{t('Honours')}</h2>
          {!data.honours.length && !pl.titles.length && <span className="muted small">{t('No honours yet.')}</span>}
          {pl.titles.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
              {pl.titles.map((x) => (
                <span key={x} className="chip buff">
                  {x}
                </span>
              ))}
            </div>
          )}
          {data.honours.map((h, i) => (
            <div key={i} className="small">
              <Icon name={HONOUR_ICON[h.kind] ?? 'ui/medal'} size={18} /> {h.title} <span className="muted">· {new Date(h.created).toLocaleDateString()}</span>
            </div>
          ))}
          {data.circuit?.majors.length ? (
            <>
              <h3 style={{ marginTop: 12 }}>{t('Monthly Majors')}</h3>
              {data.circuit.majors.map((m) => (
                <div key={m.name} className="small">
                  {m.name}: #{m.place} <span className="muted">(+{m.points})</span>
                </div>
              ))}
            </>
          ) : null}
        </section>
        <section className="panel">
          <h2>{t('Recent matches')}</h2>
          {!data.recent.length && <span className="muted small">{t('No recorded matches.')}</span>}
          {data.recent.map((m) => {
            const side = m.p0 === pl.id ? 0 : 1;
            const res = m.winner === null || m.winner === -1 ? 'draw' : m.winner === side ? 'win' : 'loss';
            const opp = side === 0 ? m.p1_name : m.p0_name;
            return (
              <div key={m.id} className="row small" style={{ justifyContent: 'space-between' }}>
                <span>
                  <span className={`chip ${res === 'win' ? 'buff' : res === 'loss' ? 'debuff' : 'neutral'}`}>{t(res)}</span> vs {opp} · {side === 0 ? m.vp0 : m.vp1}:{side === 0 ? m.vp1 : m.vp0} · {m.kind}
                </span>
                <button className="btn secondary small" onClick={() => nav({ name: 'replay', match: m.id })}>
                  <Icon name="ui/play" size={16} /> {t('Replay')}
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
