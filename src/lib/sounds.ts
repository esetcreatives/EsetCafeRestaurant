/**
 * ESET Cafe — Sound & Notification Engine
 * Uses Web Audio API to synthesize all sounds; no audio files needed.
 * Supports browser push notifications with permission management.
 */

// ─── Internal helpers ──────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

type WaveType = 'sine' | 'square' | 'triangle' | 'sawtooth';

interface Tone {
  freq: number;
  start: number; // seconds from now
  dur: number;   // seconds
  vol?: number;  // 0-1, default 0.5
  wave?: WaveType;
  ramp?: boolean; // volume ramps to 0 at end (default true)
}

function playTones(tones: Tone[]) {
  const ctx = getCtx();
  if (!ctx) return;

  tones.forEach(({ freq, start, dur, vol = 0.5, wave = 'sine', ramp = true }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

    const t0 = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    if (ramp) {
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
    }

    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  });
}

// ─── Sound definitions ─────────────────────────────────────────────────────

/** Short pop — item added to cart */
export function playCartAdd() {
  playTones([
    { freq: 880, start: 0, dur: 0.08, vol: 0.25, wave: 'sine' },
    { freq: 1100, start: 0.07, dur: 0.1, vol: 0.2, wave: 'sine' },
  ]);
}

/** Ascending chime — order placed successfully */
export function playOrderPlaced() {
  const notes = [523, 659, 784, 1046]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    playTones([{ freq, start: i * 0.12, dur: 0.22, vol: 0.35, wave: 'sine' }]);
  });
}


/** Bright alert chime — order is READY for collection */
export function playOrderReady() {
  // Ding-ding-ding
  [0, 0.18, 0.36].forEach(offset => {
    playTones([
      { freq: 1318, start: offset,        dur: 0.15, vol: 0.45, wave: 'sine' },
      { freq: 1047, start: offset + 0.05, dur: 0.12, vol: 0.25, wave: 'sine' },
    ]);
  });
}

/** Celebratory 4-note fanfare — payment approved/confirmed */
export function playPaymentSuccess() {
  const seq: Tone[] = [
    { freq: 523, start: 0,    dur: 0.15, vol: 0.4, wave: 'sine' },
    { freq: 659, start: 0.15, dur: 0.15, vol: 0.4, wave: 'sine' },
    { freq: 784, start: 0.30, dur: 0.15, vol: 0.4, wave: 'sine' },
    { freq: 1047,start: 0.45, dur: 0.35, vol: 0.45, wave: 'sine' },
    // harmony
    { freq: 1318,start: 0.45, dur: 0.35, vol: 0.25, wave: 'sine' },
  ];
  playTones(seq);
}

/** Low buzz — error / something went wrong */
export function playError() {
  playTones([
    { freq: 200, start: 0,    dur: 0.12, vol: 0.4, wave: 'sawtooth' },
    { freq: 150, start: 0.14, dur: 0.18, vol: 0.35, wave: 'sawtooth' },
  ]);
}

/** Soft chime — generic success / info toast */
export function playSuccess() {
  playTones([
    { freq: 698, start: 0,    dur: 0.15, vol: 0.3, wave: 'sine' },
    { freq: 880, start: 0.14, dur: 0.2,  vol: 0.3, wave: 'sine' },
  ]);
}

/** New order arrives in kitchen — urgent but not alarming */
export function playNewOrder() {
  playTones([
    { freq: 880, start: 0,    dur: 0.1, vol: 0.4, wave: 'square' },
    { freq: 880, start: 0.14, dur: 0.1, vol: 0.4, wave: 'square' },
    { freq: 1100,start: 0.30, dur: 0.15, vol: 0.35, wave: 'sine' },
  ]);
}

/** Payment received in admin — positive bell */
export function playPaymentReceived() {
  playTones([
    { freq: 880, start: 0,    dur: 0.15, vol: 0.35, wave: 'sine' },
    { freq: 1100,start: 0.16, dur: 0.25, vol: 0.35, wave: 'sine' },
  ]);
}

// ─── Browser Notifications ─────────────────────────────────────────────────

let _notifGranted = false;

/** Call once (after a user gesture) to request notification permission. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') { _notifGranted = true; return true; }
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  _notifGranted = perm === 'granted';
  return _notifGranted;
}

/** Show a browser push notification (silently fails if no permission). */
export function showNotification(title: string, body: string, options?: NotificationOptions) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  } catch {
    // Firefox ESR etc. — ignore
  }
}
