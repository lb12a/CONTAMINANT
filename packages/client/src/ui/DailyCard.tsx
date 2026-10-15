// The daily rewards panel on the home screen: a seven-day login calendar, the free chest of the day and
// the rewards for matches played today.

import { DAILY_CALENDAR, PLAY_TIERS } from '@contaminant/engine';
import { claimDailyReward, takeFreeChest, useDaily } from '../game/daily.ts';
import { toast } from '../store.ts';
import { sfx } from '../audio.ts';
import { t } from '../i18n.ts';
import { Icon } from './Icon.tsx';

export function DailyCard() {
  const { status, reload } = useDaily();
  if (!status) return null;
  const claimed = !status.canClaim;
  const claim = async () => {
    try {
      const r = await claimDailyReward();
      if (r) {
        sfx('chest');
        toast(`${t('Daily reward')}: +${r.gold} ${t('gold')}${r.chest ? ` + ${t('chest')}` : ''}`, 'good');
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    reload();
  };
  const chest = async () => {
    try {
      if (await takeFreeChest()) {
        sfx('card');
        toast(t('Free chest added — open it in the Shop'), 'good');
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    reload();
  };
  const tierIndex = status.nextTier ? PLAY_TIERS.indexOf(status.nextTier) : PLAY_TIERS.length;
  const prevGames = tierIndex > 0 ? PLAY_TIERS[tierIndex - 1]!.games : 0;
  return (
    <section className="panel daily">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>
          <Icon name="ui/calendar" size={22} /> {t('Daily rewards')}
        </h3>
        <span className="small muted">
          {t('Streak')}: <b className="num">{status.streak}</b> {status.streak === 1 ? t('day') : t('days')}
        </span>
      </div>
      <ol className="daily-strip" aria-label={t('Login calendar')}>
        {DAILY_CALENDAR.map((d, i) => {
          const state = i < status.slot || (i === status.slot && claimed) ? 'done' : i === status.slot ? 'today' : 'later';
          return (
            <li key={i} className={`daily-day ${state}`}>
              <span className="small">
                {t('Day')} {i + 1}
              </span>
              <Icon name={d.chest ? 'ui/gift' : 'ui/gold'} size={28} />
              <b className="num small">{d.gold}</b>
            </li>
          );
        })}
      </ol>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary" disabled={claimed} onClick={() => void claim()}>
          {claimed ? t('Come back tomorrow') : t('Claim today’s reward')}
        </button>
        <button className="btn secondary" disabled={!status.freeChest} onClick={() => void chest()}>
          <Icon name="ui/gift" size={20} /> {status.freeChest ? t('Free chest of the day') : t('Free chest taken')}
        </button>
      </div>
      <div className="col" style={{ gap: 4, marginTop: 4 }}>
        <span className="small">
          {t('Matches today')}: <b className="num">{status.played}</b>
          {status.nextTier ? (
            <span className="muted">
              {' '}
              · {t('next reward at')} {status.nextTier.games}: +{status.nextTier.gold} {t('gold')}
              {status.nextTier.chest ? ` + ${t('chest')}` : ''}
            </span>
          ) : (
            <span className="muted"> · {t('all play rewards collected today')}</span>
          )}
        </span>
        {status.nextTier && (
          <div className="bar" style={{ height: 8 }}>
            <div className="fill" style={{ width: `${((status.played - prevGames) / (status.nextTier.games - prevGames)) * 100}%`, background: 'linear-gradient(180deg,#c8ffad,#8CFF5A)' }} />
          </div>
        )}
      </div>
    </section>
  );
}
