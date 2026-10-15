import { useEffect, useRef, useState } from 'react';
import type { QueueKind, ServerMsg } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { activeDeck, connectAuto, disconnectOnline, getApi, getSocket, setProfile, toast, useProfile } from '../store.ts';
import { desktop } from '../net/discovery.ts';
import { t } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';
import { PeerLink, startP2P, type P2PMatch, type PeerInfo } from '../game/p2p.ts';
import { NearbyPanel, OnlineFriends } from './Friends.tsx';

interface Me {
  player: { name: string; mmr: number; division: string; divisionId: string; games: number; wins: number; losses: number; titles: string[] };
  division: { label: string; progress: number; next: number | null; division: { color: string; name: string } };
  season: { name: string; end: number };
  queue: QueueKind | null;
}


/**
 * One button to go online. Finding a server, signing in or (desktop app) hosting one all happen by
 * themselves; there are no addresses or server lists here (those live in Settings → Advanced).
 */
export function OnlineConnect() {
  const p = useProfile();
  const [name, setName] = useState(p.name === 'Subject' ? '' : p.name);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);

  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      if (name.trim() && name.trim() !== p.name) setProfile((x) => ({ ...x, name: name.trim().slice(0, 20) }));
      const r = await connectAuto(name.trim() || p.name, (m) => setStatus(t(m)));
      if (r.ok) toast(t('You are online'), 'good');
      else setFailed(true);
    } catch {
      setFailed(true);
    }
    setStatus('');
    setBusy(false);
  };

  return (
    <div className="panel col online-connect">
      <label className="col small">
        {t('Your name')}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} maxLength={20} />
      </label>
      <button className="btn primary big" disabled={busy} onClick={() => void go()}>
        <Icon name="ui/online" size={24} /> {busy ? status || t('Connecting…') : t('Play online')}
      </button>
      {failed && (
        <div className="paper small online-hint" role="status">
          <b>{t('Nobody is hosting a game right now.')}</b>{' '}
          {desktop
            ? t('This PC could not start its game server. Allow Contaminant in the Windows firewall prompt and press Play online again.')
            : t('Open Contaminant on a PC in the same Wi-Fi: this device joins it by itself. You can keep playing against bots meanwhile.')}
        </div>
      )}
    </div>
  );
}

/** Shown in the desktop app while it hosts: the address friends on other devices can use. */
function HostingCard() {
  const [st, setSt] = useState<{ running: boolean; port: number; lan: string[] } | null>(null);
  useEffect(() => {
    void desktop?.server('status').then(setSt);
  }, []);
  if (!st?.running) return null;
  return (
    <div className="panel small hosting">
      <Icon name="ui/online" size={20} /> {t('This PC hosts the game. Desktop apps on your Wi-Fi find it by themselves; phones can search the Wi-Fi or enter')} <code>{st.lan.map((a) => `${a}:${st.port}`).join(' · ') || `localhost:${st.port}`}</code>
    </div>
  );
}

export function OnlineScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [me, setMe] = useState<Me | null>(null);
  const [queue, setQueue] = useState<QueueKind | null>(null);
  const [since, setSince] = useState(0);
  const [code, setCode] = useState('');
  const [lobby, setLobby] = useState<string | null>(null);
  const [party, setParty] = useState<{ code: string; members: string[] } | null>(null);
  const [planSecs, setPlanSecs] = useState(30);

  const refresh = () => {
    if (!p.online) return;
    getApi()
      .get<Me>('/api/me')
      .then((m) => {
        setMe(m);
        setQueue(m.queue);
      })
      .catch((e: Error) => toast(e.message, 'bad'));
  };
  useEffect(refresh, [p.online]);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    return s.on((m: ServerMsg) => {
      if (m.t === 'queued') {
        setQueue(m.queue);
        setSince(Date.now());
      }
      if (m.t === 'queue_left') setQueue(null);
      if (m.t === 'match_start') setQueue(null);
      if (m.t === 'friend_code') setLobby(m.code);
      if (m.t === 'party') setParty({ code: m.code, members: m.members });
      if (m.t === 'error') toast(m.msg, 'bad');
    });
  }, [p.online]);

  if (!p.online) {
    return (
      <div className="col" style={{ maxWidth: 620 }}>
        <h1>{t('Go online')}</h1>
        <p className="muted">{t('Ranked ladder, tournaments, the World Cup, friends and players nearby. One click finds a server, or the desktop app hosts one for your Wi-Fi.')}</p>
        <OnlineConnect />
      </div>
    );
  }

  const deck = activeDeck(p);
  const join = (q: QueueKind) => {
    getSocket()?.send({ t: 'queue', queue: q, deck: { characters: deck.characters, items: deck.items } });
  };

  return (
    <div className="col">
      <HostingCard />
      {me && (
        <div className="panel rivets row wrap" style={{ gap: 16 }}>
          <div className="division-hex" style={{ background: me.division.division.color }}>
            {me.player.divisionId.slice(0, 2).toUpperCase()}
          </div>
          <div className="col grow" style={{ gap: 4 }}>
            <b className="display">{me.player.name}</b>
            <span>
              {me.division.label} · <span className="num">{me.player.mmr} MMR</span> · {me.player.wins}W {me.player.losses}L
            </span>
            <div className="bar" style={{ maxWidth: 360 }} title={me.division.next ? `next tier at ${me.division.next}` : 'top division'}>
              <div className="fill" style={{ width: `${me.division.progress * 100}%`, background: me.division.division.color }} />
              <div className="shine" />
            </div>
            <span className="small muted">
              {me.season.name} · {t('ends')} {new Date(me.season.end).toLocaleDateString()} · {t('Server')}: {p.online.serverName ?? p.online.server}
            </span>
          </div>
          <button
            className="btn ghost small"
            onClick={() => {
              disconnectOnline();
              toast(t('Disconnected'));
            }}
          >
            {t('Disconnect')}
          </button>
        </div>
      )}
      <div className="panel">
        <h3>
          {t('Find a match')} <span className="small muted">· {t('deck')}: {deck.name}</span>
        </h3>
        {queue ? (
          <div className="row wrap">
            <span className="chip buff">
              {t('Searching')} {t(queue)}… <QueueTimer since={since} />
            </span>
            <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'leave_queue' })}>
              {t('Leave queue')}
            </button>
          </div>
        ) : (
          <div className="row wrap">
            <button className="btn primary" disabled={p.dev} title={p.dev ? t('Developer accounts (name ending in #) cannot play ranked') : undefined} onClick={() => join('ranked')}>
              <Icon name="ui/sword" size={20} /> {t('Ranked')}
            </button>
            <button className="btn secondary" onClick={() => join('casual')}>
              {t('Casual')}
            </button>
            <button className="btn secondary" disabled={p.dev} onClick={() => join('team')} title={p.dev ? t('Developer accounts cannot play Team Battles') : t('2v2: each member plays a 1v1, most wins decide')}>
              <Icon name="ui/team" size={20} /> {t('Team Battle')}
            </button>
            <button className="btn secondary" onClick={() => join('bot')}>
              <Icon name="ui/gear" size={20} /> {t('Practice bot')}
            </button>
          </div>
        )}
        <p className="small muted">{t('Ranked uses an MMR window that widens while you wait. Casual fills with a bot after a short wait.')}</p>
      </div>
      <div className="row wrap" style={{ alignItems: 'stretch' }}>
        <NearbyPanel nav={nav} />
        <OnlineFriends nav={nav} />
      </div>
      <details className="panel more-ways">
        <summary>
          <b>{t('More ways to play with friends')}</b> <span className="small muted">· {t('lobby codes, direct connection, Team Battle party')}</span>
        </summary>
        <div className="row wrap" style={{ alignItems: 'stretch', marginTop: 10 }}>
          <div className="panel grow" style={{ minWidth: 260 }}>
            <h3>{t('Private lobby')}</h3>
            <label className="col small">
              {t('Planning time')}: {planSecs} s
              <input className="spine" type="range" min={15} max={90} step={5} value={planSecs} onChange={(e) => setPlanSecs(Number(e.target.value))} />
            </label>
            <div className="row wrap">
              <button className="btn primary small" onClick={() => getSocket()?.send({ t: 'friend_create', planningSeconds: planSecs })}>
                {t('Create lobby')}
              </button>
              {lobby && (
                <span className="chip neutral">
                  {t('Code')}: <b className="num">{lobby}</b>
                </span>
              )}
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <input type="text" placeholder={t('Code')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ width: 120 }} />
              <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'friend_join', code })}>
                {t('Join')}
              </button>
            </div>
            <p className="small muted">{t('Friendly matches run every card at Level 10.')}</p>
          </div>
          <PeerPanel nav={nav} />
          <div className="panel grow" style={{ minWidth: 240 }}>
            <h3>{t('Party (Team Battle)')}</h3>
            {party ? (
              <span>
                {t('Party')} <b className="num">{party.code}</b> · {party.members.length}/2
              </span>
            ) : (
              <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'party_create' })}>
                {t('Create party')}
              </button>
            )}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <input type="text" placeholder={t('Party code')} onKeyDown={(e) => e.key === 'Enter' && getSocket()?.send({ t: 'party_join', code: (e.target as HTMLInputElement).value })} style={{ width: 140 }} />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function QueueTimer({ since }: { since: number }) {
  const [, setN] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  return <span className="num">{Math.floor((Date.now() - since) / 1000)}s</span>;
}

/** Peer-to-peer friendly: a direct WebRTC connection, the server only introduces the two players. */
function PeerPanel({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [status, setStatus] = useState<{ s: string; detail?: string }>({ s: 'idle' });
  const [friend, setFriend] = useState('');
  const link = useRef<PeerLink | null>(null);
  useEffect(
    () => () => {
      // keep the link alive once a match runs on it (the match screen owns it then)
      if (link.current && link.current.status !== 'connected') link.current.close();
    },
    [],
  );
  if (!p.online) return null;
  const deck = activeDeck(p);
  const mine: PeerInfo = { name: p.online.name, deck: { characters: deck.characters.map((c) => ({ defId: c.defId, level: 10 })), items: deck.items } };
  const open = (role: 'host' | 'joiner') => {
    const s = getSocket();
    if (!s) return toast('Not connected to the server', 'bad');
    link.current?.close();
    const l = new PeerLink(s);
    link.current = l;
    l.onStatus = (st, detail) => setStatus({ s: st, detail });
    l.onOpen = (r) =>
      startP2P(l, r, mine, (m: P2PMatch) => {
        if (import.meta.env.DEV) (window as unknown as { __p2p?: P2PMatch }).__p2p = m;
        nav({ name: 'match', ctrl: m, back: { name: 'online' } });
      });
    if (role === 'host') l.host();
    else void l.connect(friend.trim()).catch((e: Error) => setStatus({ s: 'failed', detail: e.message }));
  };
  return (
    <div className="panel grow" style={{ minWidth: 280 }}>
      <h3>{t('Direct match (P2P)')}</h3>
      <p className="small muted">{t('Play a friend over a direct connection. Plans are sealed with a hash before they are revealed, so nobody can react to the other side.')}</p>
      <div className="row wrap">
        <span className="chip neutral">
          Your code: <b className="num p2p-code">{p.online.playerId}</b>
        </span>
        <button className="btn secondary small" onClick={() => void navigator.clipboard?.writeText(p.online!.playerId).then(() => toast('Code copied', 'good'))}>
          {t('Copy')}
        </button>
        <button className="btn primary small" onClick={() => open('host')}>
          {t('Wait for a friend')}
        </button>
      </div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <input type="text" placeholder={t('Friend’s code')} aria-label={t('Friend’s P2P code')} value={friend} onChange={(e) => setFriend(e.target.value)} style={{ width: 170 }} />
        <button className="btn secondary small" disabled={!friend.trim()} onClick={() => open('joiner')}>
          {t('Connect')}
        </button>
      </div>
      {status.s !== 'idle' && (
        <p className={`small ${status.s === 'failed' ? 'bad-text' : 'muted'}`} aria-live="polite">
          {status.s === 'waiting' ? 'Waiting for your friend to connect…' : status.s === 'connecting' ? 'Connecting…' : status.s === 'connected' ? 'Connected' : status.detail ?? 'Connection failed'}
        </p>
      )}
    </div>
  );
}
