// System notifications (friend requests, challenges, daily rewards) when the game is in the background.
// Browsers and the desktop app use the Notification API; the Android app uses local notifications
// through Capacitor when that plugin is present.

import { getProfile } from './store.ts';

interface LocalNotifications {
  requestPermissions(): Promise<{ display: string }>;
  schedule(o: { notifications: { id: number; title: string; body: string; schedule?: { at?: Date; repeats?: boolean; every?: string; on?: { hour: number; minute: number } } }[] }): Promise<unknown>;
  cancel(o: { notifications: { id: number }[] }): Promise<unknown>;
}

function capacitorNotifications(): LocalNotifications | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { LocalNotifications?: LocalNotifications } } }).Capacitor;
  return cap?.Plugins?.LocalNotifications ?? null;
}

export function notificationsSupported(): boolean {
  return !!capacitorNotifications() || 'Notification' in window;
}

export function notificationsAllowed(): boolean {
  if (capacitorNotifications()) return getProfile().settings.notifications !== false;
  return 'Notification' in window && Notification.permission === 'granted' && getProfile().settings.notifications !== false;
}

/** Ask once, from a click (browsers ignore requests that are not caused by the player). */
export async function askNotifications(): Promise<boolean> {
  const cap = capacitorNotifications();
  if (cap) return (await cap.requestPermissions()).display === 'granted';
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

let nextId = 100;

/** Shows a system notification while the game is hidden (in the foreground the toast is enough). */
export function notifyUser(title: string, body: string): void {
  if (!notificationsAllowed() || document.visibilityState === 'visible') return;
  const cap = capacitorNotifications();
  if (cap) {
    void cap.schedule({ notifications: [{ id: nextId++, title, body }] }).catch(() => undefined);
    return;
  }
  try {
    const n = new Notification(title, { body, icon: './icons/icon-192.png', tag: title });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Android app: a daily reminder at 18:00 that the free reward is waiting (replaced on every start). */
export async function scheduleDailyReminder(title: string, body: string): Promise<void> {
  const cap = capacitorNotifications();
  if (!cap || getProfile().settings.notifications === false) return;
  await cap.cancel({ notifications: [{ id: 1 }] }).catch(() => undefined);
  await cap.schedule({ notifications: [{ id: 1, title, body, schedule: { on: { hour: 18, minute: 0 }, repeats: true } }] }).catch(() => undefined);
}
