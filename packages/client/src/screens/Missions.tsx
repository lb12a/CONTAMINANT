import { dailyMissions } from '@contaminant/engine';
import { useProfile } from '../store.ts';
import { t } from '../i18n.ts';

export function MissionsScreen() {
  const p = useProfile();
  const day = new Date().toISOString().slice(0, 10);
  const list = dailyMissions(day);
  const m = (p.collection as typeof p.collection & { missions?: { day: string; progress: Record<string, number>; claimed: string[] } }).missions;
  const progress = m?.day === day ? m.progress : {};
  const de = p.settings.lang === 'de';
  return (
    <div className="col" style={{ maxWidth: 720 }}>
      <h1>{t('Missions')}</h1>
      <p className="muted">A stack of files on the desk. New missions every day (UTC).</p>
      {list.map((ms) => {
        const v = progress[ms.stat] ?? 0;
        const done = v >= ms.target;
        return (
          <div key={ms.id} className="paper" style={{ padding: 12, transform: `rotate(${(ms.id.length % 3) - 1}deg)` }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b className="display">{de ? ms.textDe : ms.text}</b>
              <span className="num">
                {Math.min(v, ms.target)}/{ms.target}
              </span>
            </div>
            <div className="bar" style={{ marginTop: 6 }}>
              <div className="fill" style={{ width: `${Math.min(100, (v / ms.target) * 100)}%`, background: 'linear-gradient(180deg,#c8ffad,#4fa830)' }} />
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              Reward: 🪙 {ms.reward.gold}
              {ms.reward.chest ? ` + ${ms.reward.chest} chest` : ''} {done ? '· ✔ done' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
