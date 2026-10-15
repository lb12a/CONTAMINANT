import { useMemo, useState } from 'react';
import {
  CHARACTERS,
  CHARACTER_LIST,
  DEPLOY_BUDGET,
  EXAMPLE_DECKS,
  ITEMS,
  ITEM_COPIES,
  ITEM_LIST,
  TUNE_STEPS,
  validateCharDeck,
  validateItemDeck,
  validateTuning,
  type Tuning,
} from '@contaminant/engine';
import type { Nav } from '../App.tsx';
import { CharacterCard, ItemCard, Modal } from '../ui/components.tsx';
import { getApi, setProfile, toast, useProfile, type SavedDeck } from '../store.ts';
import { t } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';

const TIER_COLOR: Record<string, string> = { swarm: '#8aa07a', standard: '#9FB7FF', elite: '#D9A93A' };

export function DeckBuilder({ deckId }: { nav: Nav; deckId?: string }) {
  const p = useProfile();
  const start = p.decks.find((d) => d.id === (deckId ?? p.activeDeck)) ?? p.decks[0]!;
  const [deck, setDeck] = useState<SavedDeck>(structuredClone(start));
  const [tuneFor, setTuneFor] = useState<number | null>(null);
  const cc = validateCharDeck(deck.characters);
  const ic = validateItemDeck(deck.items);
  const ownedChars = (id: string) => !!p.collection.chars[id];
  const charCount = (id: string) => deck.characters.filter((c) => c.defId === id).length;
  const itemCount = (id: string) => deck.items.filter((x) => x === id).length;
  const budget = deck.characters.reduce((s, c) => s + (CHARACTERS[c.defId]?.deploy ?? 0), 0);

  const addChar = (id: string) => {
    if (deck.characters.length >= 10) return toast('The Character Deck holds exactly 10 characters', 'bad');
    if (charCount(id) >= (CHARACTERS[id]?.maxCopies ?? 1)) return toast('No more copies allowed', 'bad');
    setDeck((d) => ({ ...d, characters: [...d.characters, { defId: id, level: p.collection.chars[id]?.level ?? 1 }] }));
  };
  const addItem = (id: string) => {
    if (deck.items.length >= 20) return toast('The Item Deck holds exactly 20 cards', 'bad');
    const it = ITEMS[id]!;
    if (itemCount(id) >= Math.min(ITEM_COPIES[it.rarity], p.collection.items[id] ?? 0)) return toast(`Copy limit (${ITEM_COPIES[it.rarity]}) or not enough owned copies`, 'bad');
    setDeck((d) => ({ ...d, items: [...d.items, id] }));
  };
  const save = async () => {
    if (!cc.ok || !ic.ok) return toast([...cc.errors, ...ic.errors][0]!, 'bad');
    setProfile((x) => ({ ...x, decks: [deck, ...x.decks.filter((d) => d.id !== deck.id)], activeDeck: deck.id }));
    if (p.online) {
      try {
        await getApi().post('/api/decks', deck);
      } catch (e) {
        return toast(`Server rejected the deck: ${(e as Error).message}`, 'bad');
      }
    }
    toast(`Deck "${deck.name}" saved and active`, 'good');
  };

  const segments = useMemo(() => deck.characters.map((c) => CHARACTERS[c.defId]!).filter(Boolean), [deck.characters]);

  return (
    <div className="col">
      <div className="row wrap">
        <h1 style={{ margin: 0 }}>{t('Deck Builder')}</h1>
        <span className="spacer" />
        <select value={deck.id} onChange={(e) => setDeck(structuredClone(p.decks.find((d) => d.id === e.target.value)!))}>
          {p.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="btn secondary small" onClick={() => setDeck({ id: `d${Date.now().toString(36)}`, name: 'New Deck', characters: [], items: [] })}>
          + New
        </button>
        <button className="btn primary" onClick={save}>
          {t('Confirm')}
        </button>
      </div>
      <div className="panel col">
        <input type="text" value={deck.name} onChange={(e) => setDeck((d) => ({ ...d, name: e.target.value.slice(0, 24) }))} />
        <div className="row small">
          <b>{t('Deploy budget')}</b> <span className="num">{budget}/{DEPLOY_BUDGET}</span>
          <span className="muted">{t('(typical decks land at 42–50)')}</span>
        </div>
        <div style={{ position: 'relative', height: 22, background: '#160f12', border: '2px solid #0b080e', borderRadius: 6, overflow: 'hidden', display: 'flex' }} title={t('Ribs as dividers, segment colour by tier')}>
          {segments.map((d, i) => (
            <div key={i} style={{ width: `${(d.deploy / 64) * 100}%`, background: TIER_COLOR[d.tier], borderRight: '2px solid #0b080e' }} title={`${d.name} ${d.deploy}`} />
          ))}
          <div style={{ position: 'absolute', left: `${(DEPLOY_BUDGET / 64) * 100}%`, top: 0, bottom: 0, width: 3, background: '#c22b33' }} title="58" />
        </div>
        {[...cc.errors, ...ic.errors].map((e) => (
          <span key={e} className="small" style={{ color: '#ff9da2' }}>
            <Icon name="ui/warning" size={16} /> {e}
          </span>
        ))}
        {cc.ok && ic.ok && <span className="small" style={{ color: 'var(--spore)' }}><Icon name="ui/check" size={16} /> {t('Deck is legal')}</span>}
      </div>

      <div className="panel">
        <h3>Character Deck ({deck.characters.length}/10)</h3>
        <div className="row wrap">
          {deck.characters.map((c, i) => (
            <div key={i} className="col" style={{ gap: 4 }}>
              <CharacterCard defId={c.defId} level={p.collection.chars[c.defId]?.level} width={110} onClick={() => setDeck((d) => ({ ...d, characters: d.characters.filter((_, j) => j !== i) }))} />
              <button className="btn secondary small" onClick={() => setTuneFor(i)}>
                Tune {Object.values(c.tuning ?? {}).filter(Boolean).length ? '✎' : ''}
              </button>
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 12 }}>{t('Add characters')}</h3>
        <div className="row wrap" style={{ gap: 8 }}>
          {CHARACTER_LIST.filter((c) => ownedChars(c.id)).map((c) => (
            <CharacterCard key={c.id} defId={c.id} level={p.collection.chars[c.id]?.level} width={92} onClick={() => addChar(c.id)} />
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Item Deck ({deck.items.length}/20)</h3>
        <div className="row wrap">
          {deck.items.map((id, i) => (
            <ItemCard key={i} itemId={id} width={86} onClick={() => setDeck((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))} />
          ))}
        </div>
        <h3 style={{ marginTop: 12 }}>{t('Add items')}</h3>
        <div className="row wrap" style={{ gap: 8 }}>
          {ITEM_LIST.filter((i) => (p.collection.items[i.id] ?? 0) > 0).map((i) => (
            <div key={i.id} className="col" style={{ gap: 2 }}>
              <ItemCard itemId={i.id} width={86} onClick={() => addItem(i.id)} />
              <span className="small center muted">
                {itemCount(i.id)}/{Math.min(ITEM_COPIES[i.rarity], p.collection.items[i.id] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>{t('Example decks')}</h3>
        {EXAMPLE_DECKS.map((d) => (
          <div key={d.id} className="row wrap small" style={{ marginBottom: 6 }}>
            <b>{d.name}</b> <span className="muted">{d.plan}</span>
            <button className="btn secondary small" onClick={() => setDeck({ id: d.id, name: d.name, characters: d.characters.map((defId) => ({ defId, level: p.collection.chars[defId]?.level ?? 1 })), items: d.items })}>
              {t('Load')}
            </button>
          </div>
        ))}
      </div>

      {tuneFor !== null && deck.characters[tuneFor] && (
        <TuningModal
          defId={deck.characters[tuneFor]!.defId}
          tuning={deck.characters[tuneFor]!.tuning ?? {}}
          onClose={() => setTuneFor(null)}
          onChange={(tu) => setDeck((d) => ({ ...d, characters: d.characters.map((c, j) => (j === tuneFor ? { ...c, tuning: tu } : c)) }))}
        />
      )}
    </div>
  );
}

function TuningModal({ defId, tuning, onChange, onClose }: { defId: string; tuning: Tuning; onChange: (t: Tuning) => void; onClose: () => void }) {
  const def = CHARACTERS[defId]!;
  const stats = ['hp', 'patk', 'pdef', 'satk', 'sdef', 'speed'] as const;
  const used = stats.reduce((s, k) => s + Math.max(0, tuning[k] ?? 0), 0);
  const refunds = stats.reduce((s, k) => s + Math.max(0, -(tuning[k] ?? 0)), 0);
  const v = validateTuning(tuning);
  const set = (k: (typeof stats)[number], d: number) => {
    const nt = { ...tuning, [k]: (tuning[k] ?? 0) + d };
    if (validateTuning(nt).ok) onChange(nt);
    else toast(validateTuning(nt).error!, 'bad');
  };
  return (
    <Modal title={`Tuning · ${def.name}`} onClose={onClose}>
      <p className="small muted">
        {TUNE_STEPS} Tune Steps: each step is +2%. Max 5 steps (+10%) per stat. Lowering a stat refunds a step (up to 3).
      </p>
      <p className="num">
        Steps used {used}/{TUNE_STEPS + refunds} {v.ok ? '' : `· ${v.error}`}
      </p>
      {stats.map((k) => {
        const base = k === 'hp' ? def.stats.hp : def.stats[k];
        const steps = tuning[k] ?? 0;
        return (
          <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ width: 70 }}>{k.toUpperCase()}</span>
            <button className="btn secondary small" onClick={() => set(k, -1)}>
              −
            </button>
            <span className="num" style={{ width: 120, textAlign: 'center' }}>
              {steps > 0 ? `+${steps}` : steps} → {Math.round(base * (1 + 0.02 * steps))}
            </span>
            <button className="btn secondary small" onClick={() => set(k, 1)}>
              +
            </button>
          </div>
        );
      })}
    </Modal>
  );
}
