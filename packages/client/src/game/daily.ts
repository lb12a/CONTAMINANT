// Daily rewards on the client: the offline profile keeps its own calendar; online accounts use the
// server's (so the reward lands in the server collection the shop and ranked play use).

import { useEffect, useState } from 'react';
import { claimDaily, claimFreeChest, dailyStatus, type Collection, type DailyStatus } from '@contaminant/engine';
import { getApi, getProfile, setProfile, useProfile } from '../store.ts';

const tz = () => new Date().getTimezoneOffset();

export function useDaily(): { status: DailyStatus | null; reload: () => void } {
  const p = useProfile();
  const [remote, setRemote] = useState<DailyStatus | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!p.online) return setRemote(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    // the server may still be starting (desktop host) or briefly unreachable: keep asking
    const load = () =>
      getApi()
        .get<DailyStatus>('/api/daily')
        .then((s) => alive && setRemote(s))
        .catch(() => {
          if (alive) timer = setTimeout(load, 5000);
        });
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [p.online, n]);
  const local = dailyStatus(p.daily ?? {}, Date.now(), tz());
  return { status: p.online ? remote : local, reload: () => setN((x) => x + 1) };
}

export async function claimDailyReward(): Promise<{ gold: number; chest?: string } | null> {
  const p = getProfile();
  if (p.online) {
    const r = await getApi().post<{ ok: boolean; reward?: { gold: number; chest?: string }; collection: Collection }>('/api/daily/claim', {});
    setProfile((x) => ({ ...x, collection: r.collection }));
    return r.reward ?? null;
  }
  const r = claimDaily(p.daily ?? {}, Date.now(), tz());
  if (!r.reward) return null;
  const reward = r.reward;
  setProfile((x) => ({ ...x, daily: r.state, collection: { ...x.collection, gold: x.collection.gold + reward.gold, chests: reward.chest ? [...x.collection.chests, reward.chest] : x.collection.chests } }));
  return reward;
}

export async function takeFreeChest(): Promise<boolean> {
  const p = getProfile();
  if (p.online) {
    const r = await getApi().post<{ ok: boolean; collection: Collection }>('/api/daily/free-chest', {});
    setProfile((x) => ({ ...x, collection: r.collection }));
    return r.ok;
  }
  const r = claimFreeChest(p.daily ?? {}, Date.now(), tz());
  if (!r.chest) return false;
  const chest = r.chest;
  setProfile((x) => ({ ...x, daily: r.state, collection: { ...x.collection, chests: [...x.collection.chests, chest] } }));
  return true;
}
