import { useEffect, useRef, useState } from 'react';
import type { QueueKind, ServerMsg } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { activeDeck, connectOnline, disconnectOnline, getApi, getSocket, toast, useProfile } from '../store.ts';
import { defaultServerUrl, Api } from '../net/api.ts';
import { t } from '../i18n.ts';
import { PeerLink, startP2P, type P2PMatch, type PeerInfo } from '../game/p2p.ts';

interface Me {
  player: { name: string; mmr: number; division: string; divisionId: string; games: number; wins: number; losses: number; titles: string[] };
  division: { label: string; progress: number; next: number | null; division: { color: string; name: string } };
  season: { name: string; end: number };
  queue: QueueKind | null;
}

export function OnlineScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [server, setServer] = useState(p.online?.server ?? defaultServerUrl());
  const [name, setName] = useState(p.name === 'Subject' ? '' : p.name);
  const [up, setUp] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [queue, setQueue] = useState<QueueKind | null>(null);
  const [since, setSince] = useState(0);
  const [code, setCode] = useState('');
  const [lobby, setLobby] = useState<string | null>(null);
  const [party, setParty] = useState<{ code: string; members: string[] } | null>(null);
  const [planSecs, setPlanSecs] = useState(30);

  useEffect(() => {
    void new Api(server, null).health().then(setUp);
  }, [server]);

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
      <div className="col" style={{ maxWidth: 560 }}>
        <h1>{t('Go online')}</h1>
        <p className="muted">Connect to a Contaminant server for the ranked ladder, automatic tournaments, the online World Cup, spectating and the live meta. Start one locally with <code>npm run start:server</code>.</p>
        <label className="col small">
          Server
          <input type="text" value={server} onChange={(e) => setServer(e.target.value)} />
        </label>
        <span className="small">{up === null ? 'Checking…' : up ? '● Server reachable' : '○ Server not reachable'}</span>
        <label className="col small">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} />
        </label>
        <button
          className="btn primary"
          disabled={!up}
          onClick={async () => {
            try {
              await connectOnline(server, name || p.name);
              toast('Connected', 'good');
            } catch (e) {
              toast((e as Error).message, 'bad');
            }
          }}
        >
          {t('Go online')}
        </button>
      </div>
    );
  }

  const deck = activeDeck(p);
  const join = (q: QueueKind) => {
    getSocket()?.send({ t: 'queue', queue: q, deck: { characters: deck.characters, items: deck.items } });
  };

  return (
    <div className="col">
      <div className="row wrap">
        <h1 style={{ margin: 0 }}>{t('Online')}</h1>
        <span className="spacer" />
        <button className="btn secondary small" onClick={() => { disconnectOnline(); toast('Disconnected'); }}>
          Disconnect
        </button>
      </div>
      {me && (
        <div className="panel rivets row wrap" style={{ gap: 16 }}>
          <div style={{ width: 64, height: 72, clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)', background: me.division.division.color, display: 'grid', placeItems: 'center', color: '#0E0A12', fontFamily: 'var(--font-display)', fontSize: 22 }}>{me.player.divisionId.slice(0, 2).toUpperCase()}</div>
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
              {me.season.name} · ends {new Date(me.season.end).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
      <div className="panel">
        <h3>{t('Queue')} — deck: {deck.name}</h3>
        {queue ? (
          <div className="row wrap">
            <span className="chip buff">
              Searching {queue}… <QueueTimer since={since} />
            </span>
            <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'leave_queue' })}>
              {t('Leave queue')}
            </button>
          </div>
        ) : (
          <div className="row wrap">
            <button className="btn primary" onClick={() => join('ranked')}>
              ⚔ {t('Ranked')}
            </button>
            <button className="btn secondary" onClick={() => join('casual')}>
              {t('Casual')}
            </button>
            <button className="btn secondary" onClick={() => join('team')} title="2v2: each member plays a 1v1, most wins decide">
              👥 {t('Team Battle')}
            </button>
            <button className="btn secondary" onClick={() => join('bot')}>
              🤖 Practice bot
            </button>
          </div>
        )}
        <p className="small muted">Ranked uses an MMR window that widens while you wait. Casual fills with a bot after a short wait.</p>
      </div>
      <div className="row wrap" style={{ alignItems: 'stretch' }}>
        <div className="panel grow" style={{ minWidth: 280 }}>
          <h3>{t('Friendly')}</h3>
          <label className="col small">
            Planning time: {planSecs} s
            <input className="spine" type="range" min={15} max={90} step={5} value={planSecs} onChange={(e) => setPlanSecs(Number(e.target.value))} />
          </label>
          <div className="row wrap">
            <button className="btn primary small" onClick={() => getSocket()?.send({ t: 'friend_create', planningSeconds: planSecs })}>
              Create lobby
            </button>
            {lobby && (
              <span className="chip neutral">
                Code: <b className="num">{lobby}</b>
              </span>
            )}
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ width: 120 }} />
            <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'friend_join', code })}>
              Join
            </button>
          </div>
          <p className="small muted">Friendly matches run every card at Level 10.</p>
        </div>
        <PeerPanel nav={nav} />
        <div className="panel grow" style={{ minWidth: 280 }}>
          <h3>Party (Team Battle)</h3>
          {party ? (
            <span>
              Party <b className="num">{party.code}</b> · {party.members.length}/2 members
            </span>
          ) : (
            <button className="btn secondary small" onClick={() => getSocket()?.send({ t: 'party_create' })}>
              Create party
            </button>
          )}
          <div className="row wrap" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Party code" onKeyDown={(e) => e.key === 'Enter' && getSocket()?.send({ t: 'party_join', code: (e.target as HTMLInputElement).value })} style={{ width: 140 }} />
          </div>
        </div>
        <div className="panel grow" style={{ minWidth: 220 }}>
          <h3>More</h3>
          <div className="col">
            <button className="btn secondary small" onClick={() => nav({ name: 'ladder' })}>
              {t('Ladder')}
            </button>
            <button className="btn secondary small" onClick={() => nav({ name: 'tournaments' })}>
              {t('Tournaments')}
            </button>
            <button className="btn secondary small" onClick={() => nav({ name: 'worldcup' })}>
              {t('World Cup')}
            </button>
            <button className="btn secondary small" onClick={() => nav({ name: 'spectate' })}>
              {t('Spectate')}
            </button>
            <button className="btn secondary small" onClick={() => nav({ name: 'meta' })}>
              {t('Meta')}
            </button>
          </div>
        </div>
      </div>
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
      <h3>Direct match (P2P)</h3>
      <p className="small muted">Play a friend over a direct connection. Plans are sealed with a hash before they are revealed, so nobody can react to the other side.</p>
      <div className="row wrap">
        <span className="chip neutral">
          Your code: <b className="num p2p-code">{p.online.playerId}</b>
        </span>
        <button className="btn secondary small" onClick={() => void navigator.clipboard?.writeText(p.online!.playerId).then(() => toast('Code copied', 'good'))}>
          Copy
        </button>
        <button className="btn primary small" onClick={() => open('host')}>
          Wait for a friend
        </button>
      </div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <input type="text" placeholder="Friend’s code" aria-label="Friend’s P2P code" value={friend} onChange={(e) => setFriend(e.target.value)} style={{ width: 170 }} />
        <button className="btn secondary small" disabled={!friend.trim()} onClick={() => open('joiner')}>
          Connect
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
