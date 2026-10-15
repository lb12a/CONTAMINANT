import { useState } from 'react';
import {
  CHARACTER_LIST,
  CHARACTERISTICS,
  CATEGORY_ORDER,
  ITEM_LIST,
  ITEM_TYPE_INFO,
  canLevelUp,
  duplicatesForLevel,
  expectedDamagePerAp,
  goldForLevel,
  levelUp,
  type CharacterDef,
  type ItemType,
  type Rarity,
} from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { CharacterCard, HexIcon, ItemCard, Modal, Tabs } from '../ui/components.tsx';
import { charRing } from '../ui/glyphs.ts';
import { getApi, setProfile, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { sfx } from '../audio.ts';
import { Icon } from '../ui/Icon.tsx';

export function CollectionScreen({ nav }: { nav: Nav }) {
  const p = useProfile();
  const [tab, setTab] = useState<'characters' | 'items'>('characters');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const owned = Object.keys(p.collection.chars).length;
  return (
    <div className="col">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h1>{t('Collection')}</h1>
        <span className="muted">
          {owned}/30 characters · {Object.keys(p.collection.items).length}/70 items
        </span>
      </div>
      <Tabs value={tab} onChange={setTab} options={[['characters', 'Characters'], ['items', 'Items']]} />
      <div className="panel" style={{ borderTopLeftRadius: 0 }}>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
            <option value="all">All rarities</option>
            {['common', 'uncommon', 'rare', 'epic', 'legendary'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {tab === 'items' && (
            <select value={type} onChange={(e) => setType(e.target.value as ItemType | 'all')}>
              <option value="all">All types</option>
              {Object.entries(ITEM_TYPE_INFO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {tab === 'characters' ? (
          <div className="grid-cards">
            {CHARACTER_LIST.filter((c) => rarity === 'all' || c.rarity === rarity).map((c) => {
              const o = p.collection.chars[c.id];
              return <CharacterCard key={c.id} defId={c.id} level={o?.level} locked={!o} isNew={o?.isNew} onClick={() => setOpen(c.id)} />;
            })}
          </div>
        ) : (
          <div className="grid-cards">
            {ITEM_LIST.filter((i) => (rarity === 'all' || i.rarity === rarity) && (type === 'all' || i.type === type)).map((i) => (
              <div key={i.id} className="col" style={{ gap: 4, opacity: p.collection.items[i.id] ? 1 : 0.4 }}>
                <ItemCard itemId={i.id} />
                <span className="small center muted">
                  {i.code} · owned {p.collection.items[i.id] ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {open && <CharacterDetail def={CHARACTER_LIST.find((c) => c.id === open)!} onClose={() => setOpen(null)} nav={nav} />}
    </div>
  );
}

export function CharacterDetail({ def, onClose, nav }: { def: CharacterDef; onClose: () => void; nav: Nav }) {
  const p = useProfile();
  const o = p.collection.chars[def.id];
  const next = (o?.level ?? 1) + 1;
  const chk = canLevelUp(p.collection, def.id);
  const doLevel = () => {
    if (p.online) {
      void getApi()
        .post('/api/collection/levelup', { defId: def.id })
        .then((r: unknown) => {
          setProfile((x) => ({ ...x, collection: (r as { collection: typeof x.collection }).collection }));
          toast(`${def.name} reached level ${next}`, 'good');
        })
        .catch((e: Error) => toast(e.message, 'bad'));
      return;
    }
    setProfile((x) => {
      const col = structuredClone(x.collection);
      if (levelUp(col, def.id)) {
        sfx('chest');
        toast(`${def.name} reached level ${next}`, 'good');
      }
      return { ...x, collection: col };
    });
  };
  return (
    <Modal title={`${def.num}. ${def.name}`} onClose={onClose}>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <CharacterCard defId={def.id} level={o?.level} locked={!o} width={180} />
        <div className="col grow" style={{ minWidth: 260 }}>
          <span className="muted">
            <span className={`rarity-${def.rarity} rar-text`}>{def.rarity}</span> · {def.tier} · Deploy {def.deploy} AP · {def.role}
          </span>
          <span className="small num">
            HP {def.stats.hp} · PAtk {def.stats.patk} · PDef {def.stats.pdef} · SAtk {def.stats.satk} · SDef {def.stats.sdef} · Speed {def.stats.speed} · Move {def.move} · AP/field {def.apPerField || '—'}
          </span>
          {CATEGORY_ORDER.map((cat) => {
            const ch = CHARACTERISTICS[def.chars[cat]]!;
            return (
              <div key={cat} className="row small" style={{ alignItems: 'flex-start' }}>
                <HexIcon ring={charRing(ch.id)}>{ch.name.slice(0, 2)}</HexIcon>
                <span>
                  <b>{ch.name}</b> <span className="muted">({cat})</span>: {ch.buff}. <span style={{ color: '#ff9da2' }}>{ch.weakness}.</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <h3 style={{ marginTop: 12 }}>Attacks</h3>
      {def.attacks.map((a) => (
        <div key={a.id} className="paper small" style={{ padding: 8, marginBottom: 6 }}>
          <b>{a.name}</b> — {a.category}
          {a.tag ? (
            <>
              {' / '}
              <Icon name={`tag/${a.tag}`} size={14} /> {a.tag}
            </>
          ) : null} · Power {a.power ?? '—'} · Range {a.range} · {a.ap} AP · Acc {a.acc ?? '—'} · Crit {a.crit}% · max {a.maxUses}
          {a.priority ? ` · Priority ${a.priority}` : ''}
          {a.power && a.ap ? ` · ${expectedDamagePerAp(a.power, a.acc, a.crit, a.ap).toFixed(1)} dmg/AP` : ''}
          <div>{a.text}</div>
        </div>
      ))}
      {def.altAttacks && (
        <details className="small">
          <summary>Alternative forms</summary>
          {Object.entries(def.altAttacks).map(([form, list]) => (
            <div key={form}>
              <b>{form}</b>: {list.map((a) => `${a.name} (P${a.power ?? '—'}, ${a.ap} AP)`).join(' · ')}
            </div>
          ))}
        </details>
      )}
      <h3>Ability — {def.ability.name}</h3>
      <p className="small">{def.ability.text}</p>
      {o && (
        <div className="col">
          <h3>Level {o.level}</h3>
          {o.level < 10 ? (
            <>
              <div className="bar" title={`${o.dups}/${duplicatesForLevel(next)} duplicates`}>
                <div className="fill" style={{ width: `${Math.min(100, (o.dups / duplicatesForLevel(next)) * 100)}%`, background: 'linear-gradient(180deg,#ffe27a,#D9A93A)' }} />
                <div className="shine" />
              </div>
              <span className="small">
                Next level: {o.dups}/{duplicatesForLevel(next)} duplicates · {goldForLevel(next)} gold (+10% HP and Power)
              </span>
              <button className="btn buy" disabled={!chk.ok} onClick={doLevel} title={chk.reason}>
                {t('Level up')} · <Icon name="ui/gold" size={16} /> {goldForLevel(next)}
              </button>
            </>
          ) : (
            <span className="rar-text rarity-legendary">Maximum level</span>
          )}
          <button className="btn tutorial" onClick={() => nav({ name: 'match', tutorial: def.id })}>
            {p.settings.lang === 'de' ? 'Prüfstand' : 'Test chamber'} {o.tutorialDone ? <Icon name="ui/check" size={16} /> : null}
          </button>
        </div>
      )}
    </Modal>
  );
}
