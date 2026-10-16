import { useState } from 'react';
import { assetUrl } from '../render/assets.ts';
import { CHESTS, hashString, makeRng, openChest, type ChestResult, type ChestSize } from '@contaminant/engine';
import { CharacterCard, ItemCard, Modal } from '../ui/components.tsx';
import { getApi, setProfile, toast, useProfile } from '../store.ts';
import { t } from '../i18n.ts';
import { sfx } from '../audio.ts';
import { Icon } from '../ui/Icon.tsx';
import { UnlockCutscene } from '../ui/UnlockCutscene.tsx';
import type { Nav } from '../App.tsx';


/** Generated chest art when available, the drawn chest icon otherwise. */
function ChestArt({ size, px }: { size: ChestSize; px: number }) {
  const url = assetUrl(`ui/chest_${size}`);
  return url ? <img src={url} alt="" style={{ height: px, width: 'auto', filter: 'drop-shadow(0 6px 4px rgba(0,0,0,0.55))' }} draggable={false} /> : <Icon name="ui/chest" size={px} />;
}

export function ShopScreen({ nav }: { nav?: Nav }) {
  const p = useProfile();
  const [opening, setOpening] = useState<{ size: ChestSize; result: ChestResult | null } | null>(null);
  /** new characters from the last chest: the unlock cutscene plays them one after the other */
  const [unlock, setUnlock] = useState<string[] | null>(null);

  const buy = async (size: ChestSize) => {
    if (p.online) {
      try {
        const r = await getApi().post<{ collection: typeof p.collection }>('/api/collection/buy', { chest: size });
        setProfile((x) => ({ ...x, collection: r.collection }));
      } catch (e) {
        return toast((e as Error).message, 'bad');
      }
    } else {
      if (p.collection.gold < CHESTS[size].price) return toast('Not enough gold', 'bad');
      setProfile((x) => ({ ...x, collection: { ...x.collection, gold: x.collection.gold - CHESTS[size].price, chests: [...x.collection.chests, size] } }));
    }
    sfx('card');
    toast(`${CHESTS[size].name} bought`, 'good');
  };

  const open = async (index: number) => {
    const size = p.collection.chests[index]!;
    setOpening({ size, result: null });
    sfx('chest');
    let result: ChestResult;
    if (p.online) {
      try {
        const r = await getApi().post<ChestResult & { collection: typeof p.collection }>('/api/collection/chest', { index });
        result = { gold: r.gold, drops: r.drops };
        setTimeout(() => setProfile((x) => ({ ...x, collection: r.collection })), 1500);
      } catch (e) {
        setOpening(null);
        return toast((e as Error).message, 'bad');
      }
    } else {
      const col = structuredClone(p.collection);
      col.chests.splice(index, 1);
      result = openChest(col, size, makeRng(hashString(`${Date.now()}:${Math.random()}`)));
      setTimeout(() => setProfile((x) => ({ ...x, collection: col })), 1500);
    }
    setTimeout(() => setOpening({ size, result }), 1500);
    const fresh = result.drops.filter((d) => d.kind === 'character' && !d.duplicate).map((d) => d.id);
    if (fresh.length) setTimeout(() => setUnlock(fresh), 2700);
  };

  return (
    <div className="col">
      <h1>{t('Shop')}</h1>
      <p className="muted">{t('An auction hall for coffins and chests. Rarity changes how often a card drops, not its power. Duplicates drop about four times as often as new cards.')}</p>
      <div className="row wrap">
        {(Object.keys(CHESTS) as ChestSize[]).map((size) => (
          <div key={size} className="panel rivets col" style={{ width: 230, alignItems: 'center' }}>
            <ChestArt size={size} px={110} />
            <b className="display">{CHESTS[size].name}</b>
            <span className="small muted">
              {CHESTS[size].cards} cards · {CHESTS[size].gold[0]}–{CHESTS[size].gold[1]} gold
            </span>
            <button className="btn buy" onClick={() => buy(size)} disabled={p.collection.gold < CHESTS[size].price}>
              {t('Buy')} · <Icon name="ui/gold" size={16} /> {CHESTS[size].price}
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Your chests ({p.collection.chests.length})</h3>
        {p.collection.chests.length === 0 && <span className="muted small">{t('Win matches and finish missions to earn chests.')}</span>}
        <div className="row wrap">
          {p.collection.chests.map((c, i) => (
            <button key={i} className="btn secondary" onClick={() => open(i)}>
              <Icon name="ui/chest" size={20} /> {t('Open chest')}
            </button>
          ))}
        </div>
      </div>
      <div className="panel small muted">{t('Drop shares: Common 45% · Uncommon 28% · Rare 16% · Epic 8% · Legendary 3%. New areas (Bog, Toy Room, Haunted Forest, Tomb) add their cards to the pool at trophy milestones.')}</div>

      {opening && (
        <Modal title={CHESTS[opening.size].name} onClose={() => opening.result && setOpening(null)}>
          <div className="chest-stage">
            {!opening.result ? (
              <div className="chest">
                <ChestArt size={opening.size} px={160} />
              </div>
            ) : (
              <div className="col" style={{ alignItems: 'center', width: '100%' }}>
                <div className="fog-burst" />
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  {opening.result.drops.map((d, i) => (
                    <div key={i} className="float-in col" style={{ animationDelay: `${i * 0.15}s`, alignItems: 'center', gap: 4 }}>
                      {d.kind === 'character' ? <CharacterCard defId={d.id} width={110} isNew={!d.duplicate} onClick={() => !d.duplicate && setUnlock([d.id])} /> : <ItemCard itemId={d.id} width={96} />}
                      <span className={`small rarity-${d.rarity} rar-text`}>{d.duplicate ? 'duplicate' : 'NEW'}</span>
                    </div>
                  ))}
                </div>
                <p>
              <Icon name="ui/gold" size={20} /> +{opening.result.gold} gold
            </p>
                <button className="btn primary" onClick={() => setOpening(null)}>
                  {t('Confirm')}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {unlock && <UnlockCutscene defIds={unlock} onDone={() => setUnlock(null)} onTutorial={nav ? (defId) => nav({ name: 'match', tutorial: defId }) : undefined} />}
    </div>
  );
}
