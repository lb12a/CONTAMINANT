import { useEffect, useState } from 'react';
import { setProfile, toast, useProfile } from '../store.ts';
import { starterCollection, EXAMPLE_DECKS } from '@contaminant/engine';
import { LANGUAGES, loadLanguage, t, type Lang } from '../i18n.ts';
import { askNotifications, notificationsAllowed, notificationsSupported } from '../notify.ts';
import { loadAssetManifest } from '../render/assets.ts';
import { desktop } from '../net/discovery.ts';

/** Desktop app only: host the game server on this PC so friends in the same network can join. */
function LanServer() {
  const [st, setSt] = useState<{ running: boolean; port: number; lan: string[] } | null>(null);
  useEffect(() => {
    void desktop?.server('status').then(setSt);
  }, []);
  if (!desktop || !st) return null;
  const urls = st.lan.map((a) => `http://${a}:${st.port}`);
  return (
    <div className="panel col">
      <h3>{t('LAN server')}</h3>
      <p className="small muted">{t('Host matches, tournaments and the ladder on this PC. Friends in your network enter one of these addresses on the Online screen.')}</p>
      {st.running && <code className="small">{urls.join('  ·  ') || `http://localhost:${st.port}`}</code>}
      <button className={`btn ${st.running ? 'danger' : 'primary'} small`} style={{ alignSelf: 'flex-start' }} onClick={async () => desktop && setSt(await desktop.server(st.running ? 'stop' : 'start'))}>
        {st.running ? t('Stop server') : t('Host server')}
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const p = useProfile();
  const [notifyOn, setNotifyOn] = useState(notificationsAllowed());
  const s = p.settings;
  const set = (patch: Partial<typeof s>) => setProfile((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  return (
    <div className="col" style={{ maxWidth: 640 }}>
      <h1>{t('Settings')}</h1>
      <div className="panel col">
        <label className="col small">
          {t('Name')}
          <input type="text" value={p.name} maxLength={20} onChange={(e) => setProfile((x) => ({ ...x, name: e.target.value }))} />
        </label>
        <label className="col small">
          {t('Language')} · Language
          <select
            value={s.lang}
            onChange={async (e) => {
              const l = e.target.value as Lang;
              await loadLanguage(l);
              set({ lang: l });
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id} lang={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="col small">
          {t('Planning time vs bots')}: {s.planningSeconds === 0 ? t('unlimited') : `${s.planningSeconds} s`}
          <input className="spine" type="range" min={0} max={90} step={5} value={s.planningSeconds} onChange={(e) => set({ planningSeconds: Number(e.target.value) < 15 && Number(e.target.value) > 0 ? 15 : Number(e.target.value) })} />
          <span className="muted">{t('0 = unlimited practice. Friends can choose 15–90 s.')}</span>
        </label>
        <label className="col small">
          Resolution playback speed: ×{s.animSpeed}
          <input className="spine" type="range" min={0.5} max={4} step={0.5} value={s.animSpeed} onChange={(e) => set({ animSpeed: Number(e.target.value) })} />
        </label>
        <label className="col small">
          Volume: {Math.round(s.volume * 100)}%
          <input className="spine" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
        </label>
        <div className="row">
          <span className="small grow">{t('Show tile coordinates on hover')}</span>
          <button className={`toggle${s.showCoords ? ' on' : ''}`} onClick={() => set({ showCoords: !s.showCoords })} aria-pressed={s.showCoords} aria-label={t('Show tile coordinates on hover')} />
        </div>
        {notificationsSupported() && (
          <div className="row">
            <span className="small grow">{t('Notifications for challenges, friend requests and the daily reward')}</span>
            <button
              className={`toggle${s.notifications !== false && notifyOn ? ' on' : ''}`}
              aria-pressed={s.notifications !== false && notifyOn}
              aria-label={t('Notifications for challenges, friend requests and the daily reward')}
              onClick={async () => {
                if (s.notifications !== false && notifyOn) return set({ notifications: false });
                const ok = await askNotifications();
                setNotifyOn(ok);
                set({ notifications: ok });
                if (!ok) toast(t('Notifications are blocked in the system settings'), 'bad');
              }}
            />
          </div>
        )}
      </div>
      <LanServer />
      <div className="panel col">
        <h3>{t('Generated art')}</h3>
        <p className="small muted">{t('Portraits, tokens, tiles and items generated by the ComfyUI pipeline (tools/assetgen) replace the procedural art automatically.')}</p>
        <button className="btn secondary small" onClick={async () => toast(`${await loadAssetManifest()} generated assets loaded`)}>
          {t('Reload asset manifest')}
        </button>
      </div>
      <div className="panel col">
        <h3>{t('Profile')}</h3>
        <p className="small muted">{t('The offline profile lives in this browser. Online accounts keep their collection on the server.')}</p>
        <div className="row wrap">
          {EXAMPLE_DECKS.map((d, i) => (
            <button
              key={d.id}
              className="btn danger small"
              onClick={() => {
                if (!confirm(`Reset the offline profile and start with ${d.name}?`)) return;
                setProfile((x) => ({ ...x, collection: starterCollection(i), activeDeck: d.id, history: [], onboarded: false }));
                toast('Offline profile reset', 'good');
              }}
            >
              Reset with {d.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
