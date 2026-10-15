import { useEffect, useState, type ReactNode } from 'react';
import { CHARACTERISTICS, CHARACTERS, ITEMS, ITEM_TYPE_INFO, STATUSES, type CharacterDef, type ItemDef, type StatusInst } from '@contaminant/engine';
import { itemArtUrl, portraitUrl } from '../render/art.ts';
import { charRing, statusKind } from './glyphs.ts';
import { Icon } from './Icon.tsx';
import { useToasts } from '../store.ts';
import { t } from '../i18n.ts';

export function HexIcon({ ring, children, title }: { ring?: string; children: ReactNode; title?: string }) {
  return (
    <span className="hexicon" style={{ ['--ring' as string]: ring }} title={title}>
      <span>{children}</span>
    </span>
  );
}

export function CharTraits({ def, chars }: { def?: CharacterDef; chars?: Record<string, string> }) {
  const c: Record<string, string> = chars ?? def?.chars ?? {};
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {Object.values(c).map((id) => {
        const ch = CHARACTERISTICS[id];
        return (
          <HexIcon key={id} ring={charRing(id)} title={ch ? `${ch.name}: ${ch.buff} / ${ch.weakness}` : id}>
            {(ch?.name ?? id).slice(0, 2)}
          </HexIcon>
        );
      })}
    </div>
  );
}

export function CharacterCard({ defId, level, onClick, selected, locked, isNew, width, form, children }: { defId: string; level?: number; onClick?: () => void; selected?: boolean; locked?: boolean; isNew?: boolean; width?: number | string; form?: string | null; children?: ReactNode }) {
  const def = CHARACTERS[defId];
  if (!def) return null;
  return (
    <div
      className={`card rarity-${def.rarity}${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
      style={width ? ({ ['--w' as string]: typeof width === 'number' ? `${width}px` : width } as React.CSSProperties) : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      title={`${def.name} — ${def.title}`}
    >
      {isNew && <div className="new-glow" />}
      <div className="cost">{def.deploy}</div>
      <div className="tier" title={def.tier}>
        <Icon name={`tier/${def.tier}`} size={18} />
      </div>
      <div className="portrait">
        <img src={portraitUrl(defId, form, { silhouette: locked })} alt={def.name} draggable={false} />
      </div>
      <div className="name">{locked ? '???' : def.name}</div>
      <div className="stats num">
        <span title={t('HP')}><Icon name="ui/heart" size={12} />{def.stats.hp}</span>
        <span title={t('PAtk / PDef')}><Icon name="ui/sword" size={12} />{def.stats.patk}/{def.stats.pdef}</span>
        <span title={t('SAtk / SDef')}><Icon name="ui/rune" size={12} />{def.stats.satk}/{def.stats.sdef}</span>
      </div>
      {level ? <div className="level">L{level}</div> : null}
      {children}
    </div>
  );
}

export function ItemCard({ itemId, onClick, selected, tarnished, width, attached, hidden }: { itemId: string; onClick?: () => void; selected?: boolean; tarnished?: boolean; width?: number | string; attached?: boolean; hidden?: boolean }) {
  const it: ItemDef | undefined = ITEMS[itemId];
  if (hidden || !it) {
    return (
      <div className="card item rarity-common" style={width ? ({ ['--w' as string]: typeof width === 'number' ? `${width}px` : width } as React.CSSProperties) : undefined} title={t('Hidden card')}>
        <div className="portrait" style={{ display: 'grid', placeItems: 'center', fontSize: '2.4em' }}>
          <Icon name="ui/envelope" size={44} />
        </div>
        <div className="name">?</div>
      </div>
    );
  }
  const info = ITEM_TYPE_INFO[it.type];
  return (
    <div
      className={`card item rarity-${it.rarity}${selected ? ' selected' : ''}${attached ? ' attached' : ''}`}
      style={{ ...(width ? { ['--w' as string]: typeof width === 'number' ? `${width}px` : width } : {}), borderColor: info.color } as React.CSSProperties}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      title={`${it.name} (${info.name}, ${it.rarity}) — ${it.text}${it.free ? `\nFree: ${it.free}` : ''}`}
    >
      <div className="cost">{it.cost || '0'}</div>
      <div className="gem" />
      <div className="portrait">
        <img src={itemArtUrl(it.id, info.color)} alt={it.name} draggable={false} />
      </div>
      <div className="name">{it.name}</div>
      {it.free ? <div className="free">FREE · {it.free}</div> : <div className="small center" style={{ fontSize: '0.75em', opacity: 0.85 }}>{info.name}</div>}
      {tarnished && <div className="tarnish">{t('TARNISHED')}</div>}
    </div>
  );
}

export function StatusChips({ statuses }: { statuses: StatusInst[] }) {
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {statuses
        .filter((s) => !STATUSES[s.id]?.internal)
        .map((s) => (
          <span key={s.id} className={`chip ${statusKind(s.id)}`} title={`${STATUSES[s.id]?.name}: ${STATUSES[s.id]?.text}`}>
            <Icon name={`status/${s.id}`} size={16} /> {STATUSES[s.id]?.name}
            {s.stacks > 1 ? ` ×${s.stacks}` : ''}
            {s.duration > 0 ? ` (${s.duration})` : ''}
          </span>
        ))}
    </div>
  );
}

export function HpBar({ hp, max, shield }: { hp: number; max: number; shield?: number }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const [trail, setTrail] = useState(pct);
  useEffect(() => {
    const t = setTimeout(() => setTrail(pct), 50);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="bar" title={`${hp}/${max} HP${shield ? ` +${shield} shield` : ''}`}>
      <div className="trail" style={{ width: `${Math.max(pct, trail)}%` }} />
      <div className="fill" style={{ width: `${pct}%` }} />
      {shield ? <div className="fill" style={{ width: `${Math.min(100, (shield / max) * 100)}%`, background: '#4FE3FF99', height: '45%' }} /> : null}
      <div className="marks" />
      <div className="shine" />
    </div>
  );
}

/** 30-cell AP battery: full, planned (flickering) and idle-bonus cells. */
export function ApBattery({ ap, planned, idle }: { ap: number; planned: number; idle: number }) {
  const cells = [];
  for (let i = 0; i < 30; i++) {
    let cls = 'ap-cell';
    if (i < ap - planned) cls += i >= ap - idle - planned && idle > 0 ? ' idle' : ' full';
    else if (i < ap) cls += ' planned';
    cells.push(<div key={i} className={cls} />);
  }
  return (
    <div className="col" style={{ gap: 2 }} title={`${ap - planned} AP left of ${ap} (planned ${planned})`}>
      <div className="ap-cells">{cells}</div>
    </div>
  );
}

export function IdleSteps({ bonus }: { bonus: number }) {
  return (
    <div className="row" style={{ gap: 3 }} title={`Idle Bonus next round: +${bonus}`}>
      {[3, 6, 9, 12].map((v) => (
        <div key={v} style={{ width: 14, height: 8 + v, background: bonus >= v ? 'var(--spore)' : '#2a3326', border: '1px solid #000', borderRadius: 2, alignSelf: 'flex-end' }} />
      ))}
    </div>
  );
}

export function VpRace({ me, them, target = 100 }: { me: number; them: number; target?: number }) {
  const w = (v: number) => `${Math.min(50, (v / target) * 50)}%`;
  return (
    <div className="vp-race" title={`${me} : ${them} VP (first to ${target})`}>
      <div className="me" style={{ width: w(me) }} />
      <div className="them" style={{ width: w(them) }} />
      {[25, 50, 75].map((m) => (
        <div key={m} className="tick" style={{ left: `${(m / target) * 50}%` }} />
      ))}
      {[25, 50, 75].map((m) => (
        <div key={-m} className="tick" style={{ right: `${(m / target) * 50}%` }} />
      ))}
    </div>
  );
}

export function Fuse({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  if (!deadline) return <div className="fuse"><div style={{ width: '100%', opacity: 0.25 }} /></div>;
  const left = Math.max(0, deadline - now);
  const pct = Math.min(100, (left / (total * 1000)) * 100);
  return (
    <div className={`fuse${left < 5000 ? ' hot' : ''}`} title={`${Math.ceil(left / 1000)} s`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Live countdown ("2d 04h", "13:07", "now") that re-renders every second while it is close. */
export function Countdown({ to, prefix, done = 'now' }: { to: number; prefix?: string; done?: string }) {
  const [now, setNow] = useState(Date.now());
  const left = to - now;
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), left < 3600_000 ? 1000 : 30_000);
    return () => clearInterval(i);
  }, [left < 3600_000]); // eslint-disable-line react-hooks/exhaustive-deps
  if (left <= 0) return <span className="countdown done">{done}</span>;
  const d = Math.floor(left / 86400_000);
  const h = Math.floor((left % 86400_000) / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  const text = d > 0 ? `${d}d ${String(h).padStart(2, '0')}h` : h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return (
    <span className={`countdown num${left < 600_000 ? ' soon' : ''}`} title={new Date(to).toLocaleString()}>
      {prefix ? `${prefix} ` : ''}
      {text}
    </span>
  );
}

export function secondsLeft(deadline: number): number {
  return deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
}

export function Modal({ children, onClose, title, icon }: { children: ReactNode; onClose?: () => void; title?: string; icon?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel rivets" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {title && (
          <h2>
            {icon && <Icon name={icon} size={30} className="title-icon" />} {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const list = useToasts();
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} className={`tab${v === value ? ' active' : ''}`} role="tab" aria-selected={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Pct({ v }: { v: number }) {
  return <span className="num">{(v * 100).toFixed(1)}%</span>;
}
