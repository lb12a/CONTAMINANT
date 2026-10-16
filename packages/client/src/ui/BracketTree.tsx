// Tournament trees: the knockout bracket drawn as a real tree (each match sits between the two it grows
// from, lines join them and the winner's path lights up up to the champion), and the cross table of a
// round-robin group that shows who beat whom.

import type { CSSProperties } from 'react';
import type { Nav } from '../App.tsx';
import { Icon } from './Icon.tsx';
import { t } from '../i18n.ts';

export interface TreeMatch {
  id: string;
  bracket: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  scoreA: number;
  scoreB: number;
  status: string;
  roomId?: string;
  bye?: boolean;
  draw?: boolean;
  group?: string;
}

const CARD_W = 190;
const CARD_H = 60;
const COL_GAP = 46;
const SLOT = CARD_H + 20;
const HEAD = 30;

function roundName(r: number, rounds: number): string {
  const fromEnd = rounds - r;
  if (fromEnd === 0) return t('Final');
  if (fromEnd === 1) return t('Semi-finals');
  if (fromEnd === 2) return t('Quarter-finals');
  if (fromEnd === 3) return t('Round of 16');
  return `${t('Round')} ${r}`;
}

function Slot({ id, other, m, names, score }: { id: string | null; other: string | null; m: TreeMatch; names: Record<string, string>; score: number }) {
  const done = m.status === 'done' && !m.bye;
  const won = !!m.winner && m.winner === id;
  const lost = !!m.winner && !!id && m.winner !== id;
  const label = id ? (names[id] ?? id) : m.bye && other ? t('bye') : m.status === 'void' ? '—' : t('TBD');
  return (
    <div className={`bt-slot${won ? ' won' : ''}${lost ? ' lost' : ''}${id ? '' : ' empty'}`}>
      <span className="bt-name">{label}</span>
      {won && <Icon name="ui/check" size={14} />}
      <span className="bt-score num">{done ? score : ''}</span>
    </div>
  );
}

function MatchCard({ m, names, nav, style }: { m: TreeMatch; names: Record<string, string>; nav: Nav; style: CSSProperties }) {
  return (
    <div className={`bt-match status-${m.status}`} style={style}>
      <Slot id={m.a} other={m.b} m={m} names={names} score={m.scoreA} />
      <Slot id={m.b} other={m.a} m={m} names={names} score={m.scoreB} />
      {m.status === 'live' && m.roomId && (
        <button className="bt-live" onClick={() => nav({ name: 'spectate', match: m.roomId })} title={t('Watch live')}>
          <span className="bt-live-dot" /> {t('LIVE')}
        </button>
      )}
    </div>
  );
}

/** One elimination tree (winners bracket of a single or double elimination). */
function Tree({ list, names, nav, extra, champion }: { list: TreeMatch[]; names: Record<string, string>; nav: Nav; extra?: TreeMatch | null; champion?: string | null }) {
  const rounds = Math.max(...list.map((m) => m.round));
  const first = list.filter((m) => m.round === 1).length || 1;
  const x = (r: number) => (r - 1) * (CARD_W + COL_GAP);
  // each match sits halfway between the two matches that feed it
  const y = (r: number, i: number) => HEAD + (i + 0.5) * SLOT * 2 ** (r - 1);
  const finalY = y(rounds, 0);
  const extraY = finalY + SLOT * 1.35;
  const height = Math.max(HEAD + first * SLOT, extra ? extraY + CARD_H / 2 + 12 : 0);
  const champX = x(rounds + 1);
  const width = champX + (champion !== undefined ? 150 : 0);
  const lines: { d: string; won: boolean; key: string }[] = [];
  for (const m of list) {
    if (m.round >= rounds) continue;
    const x0 = x(m.round) + CARD_W;
    const y0 = y(m.round, m.index);
    const x1 = x(m.round + 1);
    const y1 = y(m.round + 1, Math.floor(m.index / 2));
    const mid = x0 + COL_GAP / 2;
    lines.push({ key: m.id, won: !!m.winner, d: `M${x0} ${y0} H${mid} V${y1} H${x1}` });
  }
  const final = list.find((m) => m.round === rounds);
  if (champion !== undefined && final) lines.push({ key: 'champ', won: !!final.winner, d: `M${x(rounds) + CARD_W} ${finalY} H${champX + 10}` });
  return (
    <div className="bt-scroll">
      <div className="bt-tree" style={{ width, height }}>
        <svg className="bt-lines" width={width} height={height} aria-hidden>
          {lines.map((l) => (
            <path key={l.key} d={l.d} className={l.won ? 'won' : ''} pathLength={1} />
          ))}
        </svg>
        {Array.from({ length: rounds }, (_, k) => (
          <span key={k} className="bt-round small" style={{ left: x(k + 1), width: CARD_W }}>
            {roundName(k + 1, rounds)}
          </span>
        ))}
        {list.map((m) => (
          <MatchCard key={m.id} m={m} names={names} nav={nav} style={{ left: x(m.round), top: y(m.round, m.index) - CARD_H / 2, width: CARD_W, height: CARD_H }} />
        ))}
        {extra && (
          <>
            <span className="bt-round small" style={{ left: x(rounds), top: extraY - CARD_H / 2 - 22, width: CARD_W }}>
              {t('Third place')}
            </span>
            <MatchCard m={extra} names={names} nav={nav} style={{ left: x(rounds), top: extraY - CARD_H / 2, width: CARD_W, height: CARD_H }} />
          </>
        )}
        {champion !== undefined && (
          <div className={`bt-champion${champion ? ' crowned' : ''}`} style={{ left: champX + 10, top: finalY - 44 }}>
            <Icon name="ui/crown" size={34} />
            <b className="display">{champion ? (names[champion] ?? champion) : '?'}</b>
            <span className="small muted">{t('Champion')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Columns for brackets that are not a clean tree (the losers bracket of a double elimination). */
function Columns({ list, names, nav }: { list: TreeMatch[]; names: Record<string, string>; nav: Nav }) {
  const rounds = [...new Set(list.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <div className="bt-scroll">
      <div className="bt-columns">
        {rounds.map((r) => (
          <div key={r} className="bt-col">
            <span className="small muted">
              {t('Round')} {r}
            </span>
            {list
              .filter((m) => m.round === r)
              .map((m) => (
                <MatchCard key={m.id} m={m} names={names} nav={nav} style={{ position: 'relative', width: CARD_W, height: CARD_H }} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole knockout stage: winners tree (with third place and champion), losers bracket and grand final. */
export function BracketTree({ matches, names, nav }: { matches: TreeMatch[]; names: Record<string, string>; nav: Nav }) {
  const W = matches.filter((m) => m.bracket === 'W');
  const L = matches.filter((m) => m.bracket === 'L');
  const GF = matches.filter((m) => m.bracket === 'GF' || m.bracket === 'GF2');
  const third = matches.find((m) => m.bracket === '3RD') ?? null;
  const single = !L.length && !GF.length;
  const finalW = W.length ? W.reduce((a, b) => (b.round > a.round ? b : a)) : null;
  const lastGF = GF.filter((m) => m.status !== 'void').sort((a, b) => b.round - a.round || b.id.localeCompare(a.id))[0];
  const champion = single ? (finalW?.winner ?? null) : (lastGF?.winner ?? null);
  return (
    <div className="col bt-wrap">
      {W.length > 0 && (
        <>
          {!single && <b className="small">{t('Winners bracket')}</b>}
          <Tree list={W} names={names} nav={nav} extra={third} champion={single ? champion : undefined} />
        </>
      )}
      {L.length > 0 && (
        <>
          <b className="small">{t('Losers bracket')}</b>
          <Columns list={L} names={names} nav={nav} />
        </>
      )}
      {GF.length > 0 && (
        <>
          <b className="small">{t('Grand final')}</b>
          <div className="row wrap" style={{ alignItems: 'center', gap: 16 }}>
            {GF.filter((m) => m.status !== 'void').map((m) => (
              <MatchCard key={m.id} m={m} names={names} nav={nav} style={{ position: 'relative', width: CARD_W, height: CARD_H }} />
            ))}
            <div className={`bt-champion inline${champion ? ' crowned' : ''}`}>
              <Icon name="ui/crown" size={30} />
              <b className="display">{champion ? (names[champion] ?? champion) : '?'}</b>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Round-robin group: every pairing as a cell, from the row player's point of view. */
export function GroupResults({ order, matches, names }: { order: { id: string; name: string }[]; matches: TreeMatch[]; names: Record<string, string> }) {
  const short = (n: string) => (n.length > 9 ? `${n.slice(0, 8)}…` : n);
  const cell = (rowId: string, colId: string) => {
    const m = matches.find((x) => (x.a === rowId && x.b === colId) || (x.a === colId && x.b === rowId));
    if (!m) return <td key={colId} className="gr-cell none" />;
    if (m.status === 'live') return <td key={colId} className="gr-cell live">{t('LIVE')}</td>;
    if (m.status !== 'done') return <td key={colId} className="gr-cell open">·</td>;
    const mine = m.a === rowId ? m.scoreA : m.scoreB;
    const theirs = m.a === rowId ? m.scoreB : m.scoreA;
    const res = m.draw || !m.winner ? 'd' : m.winner === rowId ? 'w' : 'l';
    return (
      <td key={colId} className={`gr-cell ${res}`} title={`${names[rowId] ?? rowId} – ${names[colId] ?? colId}: ${mine}:${theirs}`}>
        <b>{res === 'w' ? t('W') : res === 'l' ? t('L') : t('D')}</b>
        <span className="num">
          {mine}:{theirs}
        </span>
      </td>
    );
  };
  return (
    <div className="scroll-x">
      <table className="gr-table">
        <thead>
          <tr>
            <th />
            {order.map((o) => (
              <th key={o.id} title={o.name}>
                {short(o.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((r) => (
            <tr key={r.id}>
              <th title={r.name}>{short(r.name)}</th>
              {order.map((c) => (c.id === r.id ? <td key={c.id} className="gr-cell self" /> : cell(r.id, c.id)))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
