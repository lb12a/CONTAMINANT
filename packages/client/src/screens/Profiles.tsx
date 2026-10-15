// Profiles: the subject file every new player fills in first, and the cabinet to switch between files.
// A name ending in '#' opens a developer file: everything unlocked, nothing counts in tournaments or statistics.

import { useState } from 'react';
import { CHARACTERS, isDevName, STARTER_DECK } from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { activeProfileId, autoConnect, createProfile, deleteProfile, needsProfileSetup, profileList, profilePreview, setProfile, switchProfile, toast, useProfile } from '../store.ts';
import { LANGUAGES, loadLanguage, t, type Lang } from '../i18n.ts';
import { Avatar } from './Friends.tsx';
import { Icon } from '../ui/Icon.tsx';
import { portraitUrl } from '../render/art.ts';

/** Name, avatar and language for a new subject. Calls onCreated once the profile exists and is active. */
function NewSubjectFile({ onCreated, onCancel }: { onCreated: () => void; onCancel?: () => void }) {
  const p = useProfile();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string>(STARTER_DECK.characters[0]!);
  const [lang, setLang] = useState<Lang>(p.settings.lang);
  const dev = isDevName(name);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === '#') return toast(t('Give your subject a name'), 'bad');
    createProfile(name, { avatar, lang });
    void autoConnect();
    onCreated();
  };
  return (
    <form className="subject-file paper" onSubmit={submit}>
      <span className="file-tab display">{t('Subject file')}</span>
      <span className={`file-stamp display${dev ? ' dev' : ''}`} aria-hidden>
        {dev ? 'DEV' : t('New')}
      </span>
      <label className="file-field">
        <span className="file-label">{t('Name')}</span>
        <input type="text" value={name} maxLength={20} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} aria-describedby="dev-hint" />
      </label>
      <p id="dev-hint" className={`file-hint small${dev ? ' on' : ''}`}>
        <Icon name="ui/terminal" size={16} />{' '}
        {dev ? t('Developer file: everything unlocked, unlimited gold. Does not count in tournaments, the ladder or statistics.') : t('Testers: end the name with # (e.g. Lea#) for a developer file with everything unlocked.')}
      </p>
      <fieldset className="file-field">
        <legend className="file-label">{t('Your creature')}</legend>
        <div className="jar-row" role="radiogroup" aria-label={t('Your creature')}>
          {STARTER_DECK.characters.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={avatar === id} className={`specimen-jar${avatar === id ? ' on' : ''}`} onClick={() => setAvatar(id)} title={CHARACTERS[id]!.name}>
              <img src={portraitUrl(id, null, { size: 160 })} alt="" draggable={false} />
              <span className="jar-label">{CHARACTERS[id]!.name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="file-field">
        <span className="file-label">{t('Language')} · Language</span>
        <select
          value={lang}
          onChange={async (e) => {
            const l = e.target.value as Lang;
            await loadLanguage(l);
            setLang(l);
            // first start: the whole screen switches language right away
            if (needsProfileSetup()) setProfile((x) => ({ ...x, settings: { ...x.settings, lang: l } }));
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
        <button className="btn seal l" type="submit">
          {t('Sign the file')}
        </button>
        {onCancel && (
          <button className="btn secondary" type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
        )}
      </div>
      <p className="small file-foot">{t('You start with the four lab residents and a few cards. Chests and trophies unlock the rest.')}</p>
    </form>
  );
}

/** First start: no profile yet. Signing the file leads straight into Basic Training. */
export function ProfileWelcome({ nav }: { nav: Nav }) {
  return (
    <div className="profile-gate">
      <div className="backdrop" />
      <div className="gate-inner">
        <h1 className="hero-title gate-title">{t('Contaminant')}</h1>
        <p className="gate-tag">{t('The lab needs a new subject. Fill in your file.')}</p>
        <NewSubjectFile onCreated={() => nav({ name: 'match', training: true })} />
      </div>
    </div>
  );
}

/** The file cabinet: switch, create and delete profiles on this device. */
export function ProfilesScreen({ nav }: { nav: Nav }) {
  useProfile();
  const [creating, setCreating] = useState(false);
  const list = profileList();
  const active = activeProfileId();
  if (creating) return <NewSubjectFile onCreated={() => nav({ name: 'match', training: true })} onCancel={() => setCreating(false)} />;
  return (
    <div className="col" style={{ maxWidth: 720 }}>
      <h1>{t('Profiles')}</h1>
      <p className="muted small">{t('Every profile has its own collection, decks, trophies and online account. Profiles live on this device.')}</p>
      <div className="file-cabinet">
        {list.map((e) => {
          const pv = profilePreview(e.id);
          const on = e.id === active;
          return (
            <div key={e.id} className={`cabinet-file${on ? ' on' : ''}`}>
              <Avatar avatar={pv.avatar} color={pv.color} size={52} name={e.name} />
              <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                <b className="display cabinet-name">
                  {e.name} {isDevName(e.name) && <span className="chip dev-badge">DEV</span>}
                </b>
                <span className="small muted">
                  <Icon name="ui/trophy" size={14} /> {pv.trophies} · {pv.chars} {t('Characters')}
                </span>
              </div>
              {on ? (
                <span className="chip buff">{t('Active')}</span>
              ) : (
                <button
                  className="btn primary small"
                  onClick={async () => {
                    await loadLanguage(pv.lang ?? 'en');
                    switchProfile(e.id);
                    void autoConnect();
                    toast(`${t('Profile')}: ${e.name}`, 'good');
                    nav({ name: 'menu' });
                  }}
                >
                  {t('Switch')}
                </button>
              )}
              <button
                className="icon-btn"
                aria-label={`${t('Delete')} ${e.name}`}
                title={t('Delete')}
                onClick={() => {
                  if (!confirm(t('Delete this profile with its whole collection? This cannot be undone.'))) return;
                  deleteProfile(e.id);
                }}
              >
                <Icon name="ui/close" size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>
        <Icon name="ui/plus" size={18} /> {t('New profile')}
      </button>
    </div>
  );
}
