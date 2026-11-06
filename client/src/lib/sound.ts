// Sons synthétisés (Web Audio), aucun fichier à charger : cubes de bois qui tombent, xylophone,
// ticket glissé au guichet, coup de tampon, caisse renversée.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Un cube de bois qui heurte le bois : un choc mat et une petite résonance creuse. */
function knock(pitch = 1, gain = 1, delay = 0): void {
  noise(0.05, { gain: 0.34 * gain, freq: 900 * pitch, q: 2.2, fade: 5, delay });
  tone(260 * pitch, 0.09, { type: 'triangle', gain: 0.07 * gain, delay, slide: 0.82 });
}

/** Une lame de xylophone. */
function bar(freq: number, delay = 0, gain = 0.06): void {
  tone(freq, 0.34, { type: 'sine', gain, delay });
  tone(freq * 4, 0.07, { type: 'sine', gain: gain * 0.35, delay });
}

export const sfx = {
  /** On prend un cube dans la caisse. */
  pick: () => knock(1.7, 0.45),
  /** Un cube tombe dans le plateau ; plus il tombe bas, plus le son est grave. */
  drop: (row = 0) => knock(0.85 + row * 0.08, 0.9),
  /** On reprend un cube posé. */
  undo: () => knock(1.4, 0.4),
  /** Choisir une caisse. */
  crate: () => {
    knock(0.7, 0.7);
    knock(0.95, 0.4, 0.05);
  },
  /** C'est à moi d'aller au guichet. */
  turn: () => {
    bar(783.99);
    bar(1046.5, 0.12);
  },
  /** Le ticket glisse sous la vitre du guichet. */
  bid: () => {
    noise(0.16, { gain: 0.16, freq: 2500, sweep: 6000, type: 'highpass', fade: 1.2 });
    bar(659.25, 0.12, 0.04);
  },
  /** Un tic de l'horloge, les dernières secondes. */
  tick: () => noise(0.02, { gain: 0.1, freq: 3600, q: 4, fade: 8 }),
  /** Adjugé : le coup de tampon, puis un petit accord si c'est mon plan qui tombe. */
  stamp: (mine: boolean) => {
    noise(0.09, { gain: 0.36, freq: 340, q: 1.2, fade: 4 });
    tone(110, 0.16, { type: 'sine', gain: 0.09, slide: 0.6 });
    if (mine) [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => bar(f, 0.22 + i * 0.08, 0.05));
  },
  /** Enchère annulée : deux lames qui descendent. */
  void: () => {
    bar(523.25, 0, 0.05);
    bar(392, 0.16, 0.05);
  },
  /** Les deux lots partent : la caisse se renverse. */
  discard: () => {
    for (let i = 0; i < 5; i++) knock(0.7 + Math.random() * 0.5, 0.6, i * 0.07 + Math.random() * 0.03);
  },
  /** Fin de partie : modeste ou triomphale. */
  fanfare: (good: boolean) => {
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51] : [523.25, 440, 392, 329.63];
    notes.forEach((f, i) => bar(f, i * 0.11, 0.06));
  },
  /** Début de partie : une gamme de xylophone. */
  start: () => [523.25, 587.33, 659.25, 783.99, 880].forEach((f, i) => bar(f, i * 0.07, 0.045)),
  /** Suite validée. */
  ready: () => {
    knock(1.1, 0.6);
    bar(880, 0.05, 0.04);
  },
};
