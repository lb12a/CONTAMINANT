// Tiny synthesized sound effects (no audio files needed): clicks, hits, crits, KOs, the wax seal.
import { getProfile } from './store.ts';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Sfx = 'click' | 'hit' | 'crit' | 'miss' | 'ko' | 'step' | 'deploy' | 'seal' | 'resolve' | 'win' | 'lose' | 'chest' | 'card';

export function sfx(kind: Sfx): void {
  const vol = getProfile().settings.volume;
  if (vol <= 0) return;
  const a = ac();
  if (!a) return;
  const now = a.currentTime;
  const g = a.createGain();
  g.connect(a.destination);
  const tone = (type: OscillatorType, f0: number, f1: number, dur: number, v = 0.25, delay = 0) => {
    const o = a.createOscillator();
    const gg = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now + delay);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
    gg.gain.setValueAtTime(v * vol, now + delay);
    gg.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
    o.connect(gg).connect(g);
    o.start(now + delay);
    o.stop(now + delay + dur + 0.02);
  };
  const noise = (dur: number, v = 0.2, lp = 1200) => {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const gg = a.createGain();
    gg.gain.value = v * vol;
    src.connect(f).connect(gg).connect(g);
    src.start(now);
  };
  switch (kind) {
    case 'click':
      tone('square', 600, 300, 0.05, 0.08);
      break;
    case 'card':
      noise(0.08, 0.12, 4000);
      break;
    case 'step':
      noise(0.05, 0.06, 600);
      break;
    case 'hit':
      noise(0.12, 0.25, 900);
      tone('sawtooth', 160, 60, 0.12, 0.12);
      break;
    case 'crit':
      tone('square', 880, 220, 0.18, 0.15);
      noise(0.18, 0.25, 2500);
      break;
    case 'miss':
      noise(0.15, 0.08, 5000);
      break;
    case 'ko':
      tone('sine', 220, 55, 0.6, 0.3);
      noise(0.4, 0.15, 400);
      break;
    case 'deploy':
      tone('triangle', 120, 260, 0.25, 0.2);
      break;
    case 'seal':
      noise(0.2, 0.25, 700);
      tone('sine', 90, 60, 0.3, 0.3);
      break;
    case 'resolve':
      tone('triangle', 200, 210, 0.3, 0.1);
      tone('triangle', 300, 310, 0.3, 0.08, 0.12);
      break;
    case 'chest':
      tone('sawtooth', 80, 160, 0.5, 0.15);
      noise(0.6, 0.15, 1500);
      break;
    case 'win':
      [262, 330, 392, 523].forEach((f, i) => tone('triangle', f, f, 0.35, 0.18, i * 0.12));
      break;
    case 'lose':
      [392, 330, 262, 196].forEach((f, i) => tone('sine', f, f * 0.98, 0.4, 0.16, i * 0.15));
      break;
  }
}
