// WebAudio notification sounds + call ringtones — no audio files needed.
// All tones are synthesized with a single shared AudioContext, lazily created
// on first use (browsers require a user gesture before audio can start).
//
// Global kill switch: localStorage['controlpoint-sound-enabled'] — '0' disables
// every sound (functions become no-ops). Defaults to enabled.

export const SOUND_ENABLED_KEY = 'controlpoint-sound-enabled';

const VOLUME = 0.15;

let ctx: AudioContext | null = null;

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* storage unavailable — ignore */
  }
  if (!enabled) stopRingtone();
}

/** Lazily create (or resume) the shared AudioContext. Null when unavailable. */
function getCtx(): AudioContext | null {
  if (!soundsEnabled()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Play a single sine blip. Returns when the tone finishes. */
function blip(
  ac: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  volume: number = VOLUME,
  type: OscillatorType = 'sine',
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Gentle envelope: quick attack, smooth decay — no clicks.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** Short pleasant two-tone chime (~0.4s). Used for toast notifications. */
export function playNotificationSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  blip(ac, 880, t, 0.18); // A5
  blip(ac, 1318.5, t + 0.12, 0.28); // E6
}

// --- Ringtone (classic dual-tone phone ring, loops until stopped) ---

let ringTimer: ReturnType<typeof setInterval> | null = null;

/** One ring burst: dual-tone (like a classic phone ring). */
function ringBurst(ac: AudioContext): void {
  const t = ac.currentTime;
  // Two quick bursts of 440+480Hz, the classic US ring cadence (short-short).
  for (const offset of [0, 0.25]) {
    blip(ac, 440, t + offset, 0.2, VOLUME, 'sine');
    blip(ac, 480, t + offset, 0.2, VOLUME, 'sine');
  }
}

/** Start the looping ringtone. Safe to call repeatedly — only one loop runs. */
export function startRingtone(): void {
  if (ringTimer != null) return;
  const ac = getCtx();
  if (!ac) return;
  ringBurst(ac);
  ringTimer = setInterval(() => {
    const c = getCtx();
    if (!c) {
      stopRingtone();
      return;
    }
    ringBurst(c);
  }, 2000);
}

/** Stop the ringtone if it's playing. */
export function stopRingtone(): void {
  if (ringTimer != null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

/** Subtle rising blip — someone joined your voice channel. */
export function playJoinSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  blip(ac, 660, t, 0.12, VOLUME * 0.8);
  blip(ac, 990, t + 0.09, 0.16, VOLUME * 0.8);
}

/** Subtle falling blip — someone left your voice channel. */
export function playLeaveSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  blip(ac, 990, t, 0.12, VOLUME * 0.8);
  blip(ac, 660, t + 0.09, 0.16, VOLUME * 0.8);
}

/** Test-only: reset module state between tests. */
export function __resetSoundsForTests(): void {
  stopRingtone();
  ctx = null;
}
