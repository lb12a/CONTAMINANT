// Meta-analysis dashboard: tier list, win/pick rates, archetypes, zones and automatic anomaly flags.
// Chart colours validated for the dark surface (dataviz validator): win-rate diverging pair
// #4fa830 / #d0353d (CVD floor band → always paired with signed direct labels + a table view),
// pick-rate single hue #6b86d0.
import { useEffect, useMemo, useState } from 'react';
import { CHARACTERS } from '@contaminant/engine';
import { getApi, toast, useProfile } from '../store.ts';
import { portraitUrl } from '../render/art.ts';
import { Tabs } from '../ui/components.tsx';
import { t } from '../i18n.ts';
import { Icon } from '../ui/Icon.tsx';

interface CardStat {
  id: string;
  name: string;
  games: number;
  pickRate: number;
  deployRate: number;
  banRate: number;
  winRate: number;
  winLow: number;
  winHigh: number;
  avgDamage: number;
  tier: string;
}
interface Anomaly {
  kind: string;
  ids: string[];
  names: string[];
  games: number;
  winRate: number;
  expected: number;
  z: number;
  severity: 'watch' | 'warning' | 'critical';
  suggestion: string;
}
interface Snapshot {
  generated: number;
  matches: number;
  characters: CardStat[];
  items: CardStat[];
  zones: { zone: string; mode: string; games: number; leftWins: number; avgRounds: number }[];
  archetypes: { id: string; name: string; games: number; share: number; winRate: number; winLow: number }[];
  anomalies: Anomaly[];
  tierList: Record<string, string[]>;
}

const UP = '#4fa830';
const DOWN = '#d0353d';
const PICK = '#6b86d0';
const TIER_COL: Record<string, string> = { S: '#D9A93A', A: '#8CFF5A', B: '#9FB7FF', C: '#B5562B', D: '#8B1A1F' };
const SEVERITY: Record<Anomaly['severity'], { icon: string; label: string; color: string }> = {
  watch: { icon: 'ui/eye', label: 'Watch', color: '#9FB7FF' },
  warning: { icon: 'ui/warning', label: 'Warning', color: '#FF9A1F' },
  critical: { icon: 'ui/close', label: 'Critical', color: '#c22b33' },
};

export function MetaScreen() {
  const p = useProfile();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState('');
  const [zone, setZone] = useState('');
  const [minMmr, setMinMmr] = useState('');
  const [tab, setTab] = useState<'tiers' | 'characters' | 'items' | 'archetypes' | 'anomalies'>('tiers');
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  // developer accounts may look at the bot simulations; the public meta is human matches only
  const [sims, setSims] = useState(false);
  useEffect(() => {
    if (!p.online) return;
    const q = new URLSearchParams();
    if (sims) q.set('bots', '1');
    if (mode) q.set('mode', mode);
    if (zone) q.set('zone', zone);
    if (minMmr) q.set('minMmr', minMmr);
    const f = () =>
      getApi()
        .get<Snapshot>(`/api/meta?${q}`)
        .then(setSnap)
        .catch((e: Error) => toast(e.message, 'bad'));
    f();
    const i = setInterval(f, 15_000);
    return () => clearInterval(i);
  }, [p.online, mode, zone, minMmr, sims]);

  const chars = useMemo(() => (snap?.characters ?? []).filter((c) => c.games > 0).sort((a, b) => b.winRate - a.winRate), [snap]);
  if (!p.online) return <p className="muted">Go online to see the live meta.</p>;
  if (!snap) return <p className="muted">Loading the meta…</p>;
  const empty = snap.matches === 0;

  return (
    <div className="col" onMouseLeave={() => setTip(null)}>
      <div className="row wrap">
        <h1 style={{ margin: 0 }}>{t('Meta')}</h1>
        <span className="spacer" />
        <span className="small muted">
          {snap.matches} {sims ? 'matches incl. bot simulations' : 'human matches'} · updated {new Date(snap.generated).toLocaleTimeString()}
        </span>
        {p.dev && (
          <label className="row small" title="Developer view: bot-vs-bot simulations, never part of the public meta">
            <input type="checkbox" checked={sims} onChange={(e) => setSims(e.target.checked)} /> bot simulations
          </label>
        )}
      </div>
      {empty && <p className="panel muted">No human matches recorded yet. The meta only counts matches between players; bots and developer accounts never influence it.</p>}
      {/* filters: one row above the charts */}
      <div className="row wrap">
        <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
          <option value="">All modes</option>
          {['contamination', 'elimination', 'domination', 'research', 'escape', 'anomaly'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone">
          <option value="">All zones</option>
          {['laboratory', 'graveyard', 'bog', 'toyroom', 'forest', 'tomb'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={minMmr} onChange={(e) => setMinMmr(e.target.value)} aria-label="Minimum MMR">
          <option value="">All MMR</option>
          {[1000, 1200, 1400, 1600, 1800, 2000].map((m) => (
            <option key={m} value={m}>
              ≥ {m}
            </option>
          ))}
        </select>
      </div>
      <Tabs value={tab} onChange={setTab} options={[['tiers', t('Tier list')], ['characters', 'Characters'], ['items', 'Items'], ['archetypes', 'Archetypes & zones'], ['anomalies', `${t('Anomalies')} (${snap.anomalies.length})`]]} />
      <div className="panel" style={{ borderTopLeftRadius: 0, position: 'relative' }}>
        {tab === 'tiers' && (
          <div className="col">
            {Object.entries(snap.tierList).map(([tier, ids]) => (
              <div key={tier} className="row" style={{ alignItems: 'stretch' }}>
                <div style={{ width: 44, display: 'grid', placeItems: 'center', background: TIER_COL[tier], color: '#0E0A12', fontFamily: 'var(--font-display)', fontSize: 24, borderRadius: 6 }}>{tier}</div>
                <div className="row wrap grow" style={{ gap: 6, background: '#ffffff08', borderRadius: 6, padding: 6, minHeight: 60 }}>
                  {ids.map((id) => (
                    <img key={id} src={portraitUrl(id, null, { size: 80 })} alt={CHARACTERS[id]?.name} title={CHARACTERS[id]?.name} style={{ width: 52, height: 52, borderRadius: 6 }} />
                  ))}
                </div>
              </div>
            ))}
            <p className="small muted">Tiers use a Bayesian-adjusted win rate plus a small pick-rate bonus.</p>
          </div>
        )}
        {tab === 'characters' && (
          <div className="col">
            <h3 style={{ margin: 0 }}>Win rate vs 50% (characters in deck)</h3>
            <DivergingBars rows={chars} onTip={setTip} />
            <h3 style={{ margin: '10px 0 0' }}>Pick rate</h3>
            <MagnitudeBars rows={[...chars].sort((a, b) => b.pickRate - a.pickRate)} onTip={setTip} />
            <StatTable rows={chars} />
          </div>
        )}
        {tab === 'items' && (
          <div className="col">
            <h3 style={{ margin: 0 }}>Item popularity (share of decks)</h3>
            <MagnitudeBars rows={(snap.items ?? []).filter((i) => i.games > 0).slice(0, 30)} onTip={setTip} />
            <StatTable rows={(snap.items ?? []).filter((i) => i.games > 0)} items />
          </div>
        )}
        {tab === 'archetypes' && (
          <div className="col">
            <table className="table">
              <thead>
                <tr>
                  <th>Archetype</th>
                  <th className="num">Share</th>
                  <th className="num">Games</th>
                  <th className="num">Win rate</th>
                  <th className="num">95% low</th>
                </tr>
              </thead>
              <tbody>
                {snap.archetypes.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td className="num">{(a.share * 100).toFixed(1)}%</td>
                    <td className="num">{a.games}</td>
                    <td className="num">{(a.winRate * 100).toFixed(1)}%</td>
                    <td className="num">{(a.winLow * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Maps & modes</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Mode</th>
                  <th className="num">Games</th>
                  <th className="num">First-seat win %</th>
                  <th className="num">Avg rounds</th>
                </tr>
              </thead>
              <tbody>
                {snap.zones.map((z) => (
                  <tr key={z.zone + z.mode}>
                    <td>{z.zone}</td>
                    <td>{z.mode}</td>
                    <td className="num">{z.games}</td>
                    <td className="num">{(z.leftWins * 100).toFixed(1)}%</td>
                    <td className="num">{z.avgRounds.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'anomalies' && (
          <div className="col">
            <p className="small muted">Automatic flags: single cards and combinations whose win rate is significantly above what their parts predict (z ≥ 2.5, win rate ≥ 58%, at least 20 games). Each flag suggests the first balance lever from the Game Plan.</p>
            {snap.anomalies.length === 0 && <span className="muted">No anomalies at the current sample size.</span>}
            {snap.anomalies.map((a, i) => {
              const sev = SEVERITY[a.severity];
              return (
                <div key={i} className="paper" style={{ padding: 10, borderLeft: `6px solid ${sev.color}` }}>
                  <b>
                    <Icon name={sev.icon} size={16} /> {sev.label}
                  </b>{' '}
                  · {a.kind} · <b>{a.names.join(' + ')}</b>
                  <div className="small num">
                    win rate {(a.winRate * 100).toFixed(1)}% vs expected {(a.expected * 100).toFixed(1)}% · z = {a.z.toFixed(2)} · {a.games} games
                  </div>
                  <div className="small">Suggested lever: {a.suggestion}</div>
                </div>
              );
            })}
          </div>
        )}
        {tip && (
          <div className="panel small" style={{ position: 'fixed', left: tip.x + 12, top: tip.y + 12, pointerEvents: 'none', zIndex: 60, maxWidth: 260 }} dangerouslySetInnerHTML={{ __html: tip.html }} />
        )}
      </div>
    </div>
  );
}

type Tip = (t: { x: number; y: number; html: string } | null) => void;

function tipHtml(r: CardStat): string {
  return `<b>${r.name}</b><br/>win ${(r.winRate * 100).toFixed(1)}% (95% CI ${(r.winLow * 100).toFixed(0)}–${(r.winHigh * 100).toFixed(0)}%)<br/>pick ${(r.pickRate * 100).toFixed(1)}% · ${r.games} games${r.avgDamage ? `<br/>avg damage ${Math.round(r.avgDamage)}` : ''}`;
}

/** Diverging horizontal bars around the 50% midpoint; signed value labels at the tip (secondary encoding). */
function DivergingBars({ rows, onTip }: { rows: CardStat[]; onTip: Tip }) {
  const max = Math.max(0.05, ...rows.map((r) => Math.abs(r.winRate - 0.5)));
  return (
    <div className="col" style={{ gap: 2 }} role="img" aria-label="Win rate difference from 50% per character">
      {rows.map((r) => {
        const d = r.winRate - 0.5;
        const w = (Math.abs(d) / max) * 45;
        return (
          <div key={r.id} className="row small" style={{ gap: 6, minHeight: 22 }} onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, html: tipHtml(r) })} onMouseLeave={() => onTip(null)}>
            <span style={{ width: 150, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <div style={{ position: 'relative', flex: 1, height: 16 }}>
              <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#4a4254' }} />
              <div style={{ position: 'absolute', top: 0, height: 16, left: d >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: d >= 0 ? UP : DOWN, borderRadius: d >= 0 ? '0 4px 4px 0' : '4px 0 0 4px' }} />
            </div>
            <span className="num" style={{ width: 70, color: 'var(--bone)' }}>
              {d >= 0 ? '+' : '−'}
              {Math.abs(d * 100).toFixed(1)} pp
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MagnitudeBars({ rows, onTip }: { rows: CardStat[]; onTip: Tip }) {
  const max = Math.max(0.01, ...rows.map((r) => r.pickRate));
  return (
    <div className="col" style={{ gap: 2 }} role="img" aria-label="Pick rate per card">
      {rows.map((r) => (
        <div key={r.id} className="row small" style={{ gap: 6, minHeight: 20 }} onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, html: tipHtml(r) })} onMouseLeave={() => onTip(null)}>
          <span style={{ width: 150, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
          <div style={{ flex: 1, height: 14 }}>
            <div style={{ height: 14, width: `${(r.pickRate / max) * 100}%`, background: PICK, borderRadius: '0 4px 4px 0' }} />
          </div>
          <span className="num" style={{ width: 56 }}>
            {(r.pickRate * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function StatTable({ rows, items }: { rows: CardStat[]; items?: boolean }) {
  return (
    <details>
      <summary className="small">Table view</summary>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>{items ? 'Item' : 'Character'}</th>
              <th>Tier</th>
              <th className="num">Games</th>
              <th className="num">Pick</th>
              <th className="num">{items ? 'Played' : 'Deployed'}</th>
              <th className="num">Win</th>
              <th className="num">95% CI</th>
              {!items && <th className="num">Avg dmg</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.tier}</td>
                <td className="num">{r.games}</td>
                <td className="num">{(r.pickRate * 100).toFixed(1)}%</td>
                <td className="num">{(r.deployRate * 100).toFixed(0)}%</td>
                <td className="num">{(r.winRate * 100).toFixed(1)}%</td>
                <td className="num">
                  {(r.winLow * 100).toFixed(0)}–{(r.winHigh * 100).toFixed(0)}%
                </td>
                {!items && <td className="num">{Math.round(r.avgDamage)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
