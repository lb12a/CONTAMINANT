// Challenges and friend events from the server, wherever the player is in the menus: an incoming
// challenge opens a small dialog (auto-declines after a minute), the rest are toasts and, while the game
// is in the background, system notifications.

import { useEffect, useState } from 'react';
import type { ServerMsg } from '@contaminant/engine';
import { getSocket, toast, useProfile } from '../store.ts';
import { notifyUser } from '../notify.ts';
import { t } from '../i18n.ts';
import { Modal } from './components.tsx';

const WAIT_S = 60;

export function InviteHost() {
  const p = useProfile();
  const [invite, setInvite] = useState<{ from: string; name: string; code: string; mode: string; at: number } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!p.online) return;
    const s = getSocket();
    if (!s) return;
    return s.on((m: ServerMsg) => {
      if (m.t === 'invite') {
        setInvite({ from: m.from, name: m.name, code: m.code, mode: m.mode, at: Date.now() });
        notifyUser(t('Challenge!'), t('{name} challenges you to a friendly').replace('{name}', m.name));
      }
      if (m.t === 'invite_sent') toast(t('Challenge sent to {name}, waiting for an answer…').replace('{name}', m.name), 'info');
      if (m.t === 'invite_declined') toast(t('{name} declined the challenge').replace('{name}', m.name), 'bad');
      if (m.t === 'match_start') setInvite(null);
      if (m.t === 'social') {
        const text = m.event === 'request' ? t('{name} wants to be your friend') : m.event === 'accepted' ? t('{name} is now your friend') : t('{name} is online');
        toast(text.replace('{name}', m.name), m.event === 'online' ? 'info' : 'good');
        if (m.event !== 'online') notifyUser('Contaminant', text.replace('{name}', m.name));
      }
    });
  }, [p.online]);

  useEffect(() => {
    if (!invite) return;
    const i = setInterval(() => {
      if (Date.now() - invite.at > WAIT_S * 1000) {
        getSocket()?.send({ t: 'invite_decline', code: invite.code });
        setInvite(null);
      } else tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(i);
  }, [invite]);

  if (!invite) return null;
  const left = Math.max(0, WAIT_S - Math.floor((Date.now() - invite.at) / 1000));
  const decline = () => {
    getSocket()?.send({ t: 'invite_decline', code: invite.code });
    setInvite(null);
  };
  return (
    <Modal title={t('Challenge!')} onClose={decline}>
      <p>
        <b>{invite.name}</b> {t('challenges you to a friendly match.')}
      </p>
      <p className="small muted">{t('Every card plays at Level 10. Nothing is lost.')}</p>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
        <span className="small muted num" style={{ marginRight: 'auto' }}>
          {left}s
        </span>
        <button className="btn secondary" onClick={decline}>
          {t('Decline')}
        </button>
        <button
          className="btn primary"
          autoFocus
          onClick={() => {
            getSocket()?.send({ t: 'friend_join', code: invite.code });
            setInvite(null);
          }}
        >
          {t('Accept')}
        </button>
      </div>
    </Modal>
  );
}
