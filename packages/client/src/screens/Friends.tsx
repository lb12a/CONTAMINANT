// Friends and players nearby: a short friend code to share, requests, who is online, and a one-tap
// challenge to a friendly match. Players on the same Wi-Fi show up by themselves.

import { useCallback, useEffect, useState } from 'react';
import type { ServerMsg } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { getApi, getSocket, toast, useProfile } from '../store.ts';
import { portraitUrl } from '../render/art.ts';
import { Icon } from '../ui/Icon.tsx';
import { t } from '../i18n.ts';
import { OnlineConnect } from './Online.tsx';

export interface FriendCard {
  id: string;
  name: string;
  code: string;
  division: string;
  online: boolean;
  inMatch: boolean;
  friend?: boolean;
  profile: { avatar?: string; title?: string; motto?: string; color?: string };
}

interface FriendList {
  code: string;
  friends: FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
}

export function Avatar({ avatar, color, size = 44, name }: { avatar?: string; color?: string; size?: number; name?: string }) {
  return (
    <span className="avatar" style={{ width: size, height: size * 1.1, ['--ring' as string]: color ?? 'var(--bone-dim)' }} aria-hidden>
      {avatar ? <img src={portraitUrl(avatar, null, { size: 128 })} alt="" draggable={false} /> : <b className="display">{(name ?? '?').slice(0, 1).toUpperCase()}</b>}
    </span>
  );
}

export function challenge(f: { id: string; name: string }): void {
  const s = getSocket();
  if (!s) return toast(t('Go online first'), 'bad');
  s.send({ t: 'invite', to: f.id });
}

function presence(f: FriendCard): { cls: string; text: string } {
  if (f.inMatch) return { cls: 'busy', text: t('In a match') };
  if (f.online) return { cls: 'on', text: t('Online') };
  return { cls: 'off', text: t('Offline') };
}

function PersonRow({ f, nav, children }: { f: FriendCard; nav: Nav; children?: React.ReactNode }) {
  const pr = presence(f);
  return (
    <div className="person">
      <Avatar avatar={f.profile.avatar} color={f.profile.color} name={f.name} />
      <button className="person-main" onClick={() => nav({ name: 'profile', id: f.id })}>
        <b>{f.name}</b>
        <span className="small muted">
          <span className={`pdot ${pr.cls}`} /> {pr.text} · {f.division}
          {f.profile.title ? ` · ${f.profile.title}` : ''}
        </span>
      </button>
      <div className="person-actions">{children}</div>
    </div>
  );
}

/** Polls the friend list and refreshes when the server reports a request or an acceptance. */
export function useFriends(): { data: FriendList | null; reload: () => void } {
  const p = useProfile();
  const [data, setData] = useState<FriendList | null>(null);
  const reload = useCallback(() => {
    if (!p.online) return;
    getApi()
      .get<FriendList>('/api/friends')
      .then(setData)
      .catch(() => undefined);
  }, [p.online]);
  useEffect(() => {
    reload();
    const i = setInterval(reload, 15_000);
    const off = getSocket()?.on((m: ServerMsg) => m.t === 'social' && reload());
    return () => {
      clearInterval(i);
      off?.();
    };
  }, [reload]);
  return { data, reload };
}

/** Players connected from the same network right now. */
export function NearbyPanel({ nav, compact }: { nav: Nav; compact?: boolean }) {
  const p = useProfile();
  const [list, setList] = useState<FriendCard[] | null>(null);
  useEffect(() => {
    if (!p.online) return;
    const load = () =>
      getApi()
        .get<{ players: FriendCard[] }>('/api/nearby')
        .then((r) => setList(r.players))
        .catch(() => setList([]));
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [p.online]);
  const add = (f: FriendCard) =>
    getApi()
      .post<{ status: string }>('/api/friends/add', { id: f.id })
      .then((r) => toast(r.status === 'friends' ? t('You are now friends') : t('Friend request sent'), 'good'))
      .catch((e: Error) => toast(e.message, 'bad'));
  return (
    <section className="panel grow nearby">
      <h3>
        <Icon name="ui/online" size={22} /> {t('Players nearby')}
      </h3>
      {!compact && <p className="small muted">{t('Everyone on the same Wi-Fi who is online right now.')}</p>}
      {list === null && <span className="small muted">{t('Looking around…')}</span>}
      {list?.length === 0 && <span className="small muted">{t('Nobody else on this network yet. Friends who open the game on the same Wi-Fi appear here.')}</span>}
      {list?.map((f) => (
        <PersonRow key={f.id} f={f} nav={nav}>
          {!f.friend && (
            <button className="btn secondary small" onClick={() => add(f)} title={t('Add friend')}>
              +
            </button>
          )}
          <button className="btn primary small" disabled={f.inMatch} onClick={() => challenge(f)}>
            {t('Challenge')}
          </button>
        </PersonRow>
      ))}
    </section>
  );
}

const canShare = typeof (navigator as Partial<Navigator>).share === 'function';

export function FriendCode({ code }: { code: string }) {
  const share = async () => {
    const text = `${t('Add me in Contaminant')}: ${code}`;
    if (canShare) await navigator.share({ text }).catch(() => undefined);
    else await navigator.clipboard?.writeText(code).then(() => toast(t('Code copied'), 'good'));
  };
  return (
    <div className="friend-code">
      <span className="small muted">{t('Your friend code')}</span>
      <b className="code num">{code}</b>
      <button className="btn secondary small" onClick={() => void share()}>
        {canShare ? t('Share') : t('Copy')}
      </button>
    </div>
  );
}

/** Online friends with a challenge button (for the Online page). */
export function OnlineFriends({ nav }: { nav: Nav }) {
  const { data } = useFriends();
  const on = data?.friends.filter((f) => f.online) ?? [];
  return (
    <section className="panel grow">
      <h3>
        <Icon name="ui/friends" size={22} /> {t('Friends online')}
      </h3>
      {!data && <span className="small muted">…</span>}
      {data && !on.length && (
        <span className="small muted">
          {data.friends.length ? t('None of your friends is online.') : t('No friends yet.')}{' '}
          <button className="link-name" onClick={() => nav({ name: 'friends' })}>
            {t('Add friends')}
          </button>
        </span>
      )}
      {on.map((f) => (
        <PersonRow key={f.id} f={f} nav={nav}>
          <button className="btn primary small" disabled={f.inMatch} onClick={() => challenge(f)}>
            {t('Challenge')}
          </button>
        </PersonRow>
      ))}
    </section>
  );
}

export function FriendsScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const { data, reload } = useFriends();
  const [code, setCode] = useState('');
  if (!p.online) {
    return (
      <div className="col" style={{ maxWidth: 620 }}>
        <h1>{t('Friends')}</h1>
        <p className="muted">{t('Friends, challenges and players nearby need a server. One click finds one (or hosts one on this PC).')}</p>
        <OnlineConnect />
      </div>
    );
  }
  const act = (path: string, id: string, msg?: string) =>
    getApi()
      .post(path, { id })
      .then(() => {
        if (msg) toast(msg, 'good');
        reload();
      })
      .catch((e: Error) => toast(e.message, 'bad'));
  const add = () =>
    getApi()
      .post<{ status: string }>('/api/friends/add', /^[A-Za-z0-9]{6}$/.test(code.trim()) ? { code } : { name: code })
      .then((r) => {
        toast(r.status === 'friends' ? t('You are now friends') : t('Friend request sent'), 'good');
        setCode('');
        reload();
      })
      .catch((e: Error) => toast(e.message, 'bad'));
  return (
    <div className="col friends-page">
      <div className="row wrap" style={{ alignItems: 'stretch' }}>
        <section className="panel grow" style={{ minWidth: 280 }}>
          <h2>{t('Add a friend')}</h2>
          {data && <FriendCode code={data.code} />}
          <form
            className="row wrap"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) add();
            }}
          >
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('Friend code or exact name')} aria-label={t('Friend code or exact name')} maxLength={20} style={{ flex: '1 1 160px' }} />
            <button className="btn primary small" disabled={!code.trim()}>
              {t('Add')}
            </button>
          </form>
        </section>
        <NearbyPanel nav={nav} compact />
      </div>
      {!!data?.incoming.length && (
        <section className="panel">
          <h3>{t('Friend requests')}</h3>
          {data.incoming.map((f) => (
            <PersonRow key={f.id} f={f} nav={nav}>
              <button className="btn primary small" onClick={() => act('/api/friends/accept', f.id, t('You are now friends'))}>
                {t('Accept')}
              </button>
              <button className="btn secondary small" onClick={() => act('/api/friends/remove', f.id)}>
                {t('Decline')}
              </button>
            </PersonRow>
          ))}
        </section>
      )}
      <section className="panel">
        <h3>
          {t('Friends')} {data ? <span className="muted small num">({data.friends.length})</span> : null}
        </h3>
        {data && !data.friends.length && <span className="small muted">{t('Share your code or add someone nearby to fill this list.')}</span>}
        {data?.friends.map((f) => (
          <PersonRow key={f.id} f={f} nav={nav}>
            <button className="btn primary small" disabled={!f.online || f.inMatch} onClick={() => challenge(f)}>
              {t('Challenge')}
            </button>
            {f.inMatch && (
              <button className="btn secondary small" onClick={() => nav({ name: 'spectate' })}>
                {t('Watch')}
              </button>
            )}
            <button className="btn ghost small" onClick={() => confirm(t('Remove {name} from your friends?').replace('{name}', f.name)) && act('/api/friends/remove', f.id)} aria-label={t('Remove friend')}>
              ×
            </button>
          </PersonRow>
        ))}
      </section>
      {!!data?.outgoing.length && (
        <section className="panel">
          <h3>{t('Sent requests')}</h3>
          {data.outgoing.map((f) => (
            <PersonRow key={f.id} f={f} nav={nav}>
              <button className="btn secondary small" onClick={() => act('/api/friends/remove', f.id)}>
                {t('Cancel')}
              </button>
            </PersonRow>
          ))}
        </section>
      )}
    </div>
  );
}
