/**
 * Audio synthesizer & feedback helper using Web Audio API (offline, no external audio files).
 * Success: short high-pitched pleasant chime + green flash
 * Error: low buzzy tone + red flash + error message
 */

export type FeedbackType = 'success' | 'error';

export interface FeedbackEvent {
  type: FeedbackType;
  title: string;
  subtitle?: string;
  timestamp: number;
}

type FeedbackListener = (event: FeedbackEvent | null) => void;
const listeners = new Set<FeedbackListener>();

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play synthesized sound using pure Web Audio API
 */
export function playTone(type: FeedbackType): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Pleasant upward two-tone chime (880Hz -> 1320Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      // Low buzz tone (140Hz with sawtooth harmonic bite)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.25);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (err) {
    console.warn('Web Audio playback error:', err);
  }
}

/**
 * Trigger both visual feedback (flash + toast) and audio tone
 */
export function triggerFeedback(
  type: FeedbackType,
  title?: string,
  subtitle?: string
): void {
  // Play sound
  playTone(type);

  // Set default messages if not specified
  const eventTitle =
    title || (type === 'success' ? 'Manzoor ho gaya' : 'PIN galat hai');
  const eventSubtitle =
    subtitle || (type === 'success' ? 'Success' : 'Galat hai, dobara try karein');

  const event: FeedbackEvent = {
    type,
    title: eventTitle,
    subtitle: eventSubtitle,
    timestamp: Date.now(),
  };

  listeners.forEach((listener) => listener(event));
}

export function subscribeFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
