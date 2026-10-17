import Phaser from "phaser";

/**
 * Office sound effects, synthesised once at boot straight into Web Audio buffers (no files):
 * a reception desk bell, a rubber stamp, a cash register, PA chimes, a punch clock, a dot-matrix
 * printer, polite applause, a ringing desk phone, an error buzz, keypad tones and more.
 * Each one is registered under a name the AudioManager plays like any other sound group.
 */
type Synth = (sr: number) => Float32Array;

const TAU = Math.PI * 2;
const rnd = () => Math.random() * 2 - 1;

/** Struck metal: a few inharmonic partials, each with its own decay. */
function bellInto(out: Float32Array, sr: number, at: number, f0: number, amp: number, partials: [number, number, number][]) {
  const s0 = Math.floor(at * sr);
  for (const [ratio, a, decay] of partials) {
    const f = f0 * ratio, k = 1 / (decay * sr);
    for (let i = s0, n = 0; i < out.length; i++, n++) {
      const e = Math.exp(-n * k);
      if (e < 0.0005) break;
      const atk = Math.min(1, n / (sr * 0.0015));
      out[i] += Math.sin((TAU * f * n) / sr) * a * amp * e * atk;
    }
  }
}

/** A burst of filtered noise (one-pole low/high pass) with an exponential tail. */
function noiseInto(out: Float32Array, sr: number, at: number, dur: number, amp: number, lp: number, hp: number, decay = dur / 3) {
  const s0 = Math.floor(at * sr), n1 = Math.floor(dur * sr);
  const al = Math.min(1, (TAU * lp) / sr), ah = Math.min(1, (TAU * hp) / sr);
  let l = 0, h = 0;
  for (let n = 0; n < n1 && s0 + n < out.length; n++) {
    l += (rnd() - l) * al;
    h += (l - h) * ah;
    const v = l - h;
    out[s0 + n] += v * amp * Math.exp(-n / (decay * sr)) * Math.min(1, n / (sr * 0.001));
  }
}

/** A sine "thump" sliding from f0 to f1. */
function thumpInto(out: Float32Array, sr: number, at: number, f0: number, f1: number, dur: number, amp: number) {
  const s0 = Math.floor(at * sr), n1 = Math.floor(dur * sr);
  let ph = 0;
  for (let n = 0; n < n1 && s0 + n < out.length; n++) {
    const t = n / n1;
    ph += (TAU * (f0 + (f1 - f0) * Math.min(1, t * 2.5))) / sr;
    out[s0 + n] += Math.sin(ph) * amp * Math.exp(-t * 5) * Math.min(1, n / (sr * 0.002));
  }
}

/** Soft tone (sine plus a little of the octave and the 4th harmonic, like a vibraphone bar). */
function toneInto(out: Float32Array, sr: number, at: number, f: number, dur: number, amp: number, decay: number, trem = 0) {
  const s0 = Math.floor(at * sr), n1 = Math.floor(dur * sr);
  for (let n = 0; n < n1 && s0 + n < out.length; n++) {
    const t = n / sr;
    const e = Math.exp(-t / decay) * Math.min(1, t / 0.006);
    const tr = 1 - trem * (0.5 + 0.5 * Math.sin(TAU * 5.6 * t));
    out[s0 + n] += (Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / 0.35) + 0.22 * Math.sin(TAU * f * 4 * t) * Math.exp(-t / 0.12)) * amp * e * tr;
  }
}

/** Square-ish beep made of the first odd harmonics (soft, not harsh). */
function beepInto(out: Float32Array, sr: number, at: number, f: number, dur: number, amp: number) {
  const s0 = Math.floor(at * sr), n1 = Math.floor(dur * sr);
  for (let n = 0; n < n1 && s0 + n < out.length; n++) {
    const t = n / sr;
    const e = Math.min(1, n / (sr * 0.004)) * Math.min(1, (n1 - n) / (sr * 0.01));
    out[s0 + n] += (Math.sin(TAU * f * t) + Math.sin(TAU * 3 * f * t) / 3 + Math.sin(TAU * 5 * f * t) / 5) * amp * e;
  }
}

const buf = (sr: number, sec: number) => new Float32Array(Math.floor(sr * sec));

const BELL: [number, number, number][] = [[1, 1, 1.25], [2.32, 0.42, 0.55], [4.25, 0.22, 0.3], [6.63, 0.1, 0.16], [1.004, 0.35, 1.1]];

const SYNTHS: Record<string, Synth> = {
  // Reception desk bell: "ding!"
  bell: (sr) => { const o = buf(sr, 1.6); noiseInto(o, sr, 0, 0.006, 0.5, 9000, 2500); bellInto(o, sr, 0, 1568, 0.32, BELL); return o; },
  // Two quick taps on the bell.
  bell2: (sr) => { const o = buf(sr, 1.9); for (const t of [0, 0.16]) { noiseInto(o, sr, t, 0.006, 0.5, 9000, 2500); bellInto(o, sr, t, 1568, 0.27, BELL); } return o; },
  // Rubber stamp: a slap on paper with a dull thud underneath.
  stamp: (sr) => { const o = buf(sr, 0.32); thumpInto(o, sr, 0, 150, 70, 0.16, 0.75); noiseInto(o, sr, 0, 0.05, 0.9, 1800, 120, 0.012); noiseInto(o, sr, 0.012, 0.09, 0.18, 6500, 2200, 0.03); return o; },
  // Cash register: key clack, drawer thunk, bright "ching" and a few coins.
  register: (sr) => {
    const o = buf(sr, 1.25);
    noiseInto(o, sr, 0, 0.03, 0.55, 3000, 600, 0.008);
    thumpInto(o, sr, 0.06, 120, 70, 0.14, 0.55);
    noiseInto(o, sr, 0.06, 0.08, 0.35, 900, 120, 0.02);
    bellInto(o, sr, 0.13, 2637, 0.26, [[1, 1, 0.75], [2.01, 0.5, 0.4], [3.03, 0.25, 0.22], [1.005, 0.4, 0.7]]);
    for (let k = 0; k < 6; k++) bellInto(o, sr, 0.2 + Math.random() * 0.35, 3800 + Math.random() * 2600, 0.06, [[1, 1, 0.035], [1.7, 0.5, 0.02]]);
    return o;
  },
  // PA chime, rising (good news) and falling minor (bad news).
  chime_up: (sr) => { const o = buf(sr, 2.3); [523.25, 659.25, 783.99].forEach((f, i) => toneInto(o, sr, i * 0.36, f, 2.3 - i * 0.36, 0.3, 0.9, 0.22)); return o; },
  chime_down: (sr) => { const o = buf(sr, 2.5); [783.99, 622.25, 523.25].forEach((f, i) => toneInto(o, sr, i * 0.42, f, 2.5 - i * 0.42, 0.3, 1.0, 0.22)); return o; },
  // Punch clock: ratchet, heavy "ka-CHUNK", a little bell.
  punch: (sr) => {
    const o = buf(sr, 1.0);
    for (let k = 0; k < 6; k++) noiseInto(o, sr, k * 0.022, 0.008, 0.4, 5000, 1500, 0.003);
    thumpInto(o, sr, 0.15, 95, 55, 0.2, 0.9);
    noiseInto(o, sr, 0.15, 0.12, 0.6, 1100, 90, 0.025);
    bellInto(o, sr, 0.24, 2093, 0.16, [[1, 1, 0.45], [2.4, 0.4, 0.2]]);
    return o;
  },
  // Dot-matrix printer: three lines of pin-strike buzz, carriage returns between.
  printer: (sr) => {
    const o = buf(sr, 1.45);
    for (let line = 0; line < 3; line++) {
      const t0 = line * 0.46;
      for (let t = 0; t < 0.34; t += 1 / 110) if (Math.random() < 0.8) noiseInto(o, sr, t0 + t, 0.004, 0.32, 6000, 900, 0.0015);
      thumpInto(o, sr, t0 + 0.36, 260, 420, 0.09, 0.12);
    }
    return o;
  },
  // Polite office applause (a handful of people, not a stadium).
  applause: (sr) => {
    const o = buf(sr, 2.1);
    for (let p = 0; p < 9; p++) {
      const rate = 3.6 + Math.random() * 1.8, bright = 1400 + Math.random() * 1800;
      for (let t = Math.random() * 0.25; t < 1.75; t += 1 / rate + (Math.random() - 0.5) * 0.05) {
        const fade = t < 0.15 ? t / 0.15 : t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.55) : 1;
        noiseInto(o, sr, t, 0.03, 0.22 * fade * (0.6 + Math.random() * 0.4), bright * 2.2, bright * 0.45, 0.007);
      }
    }
    return o;
  },
  // Old desk phone: a hammer trilling between two bells.
  phone: (sr) => {
    const o = buf(sr, 0.75);
    for (let k = 0; k < 13; k++) bellInto(o, sr, k * 0.045, k % 2 ? 1180 : 1420, 0.15 * (k < 11 ? 1 : 0.5), [[1, 1, 0.07], [2.7, 0.3, 0.03]]);
    return o;
  },
  // Computer says no: two descending soft beeps.
  err: (sr) => { const o = buf(sr, 0.3); beepInto(o, sr, 0, 330, 0.09, 0.22); beepInto(o, sr, 0.1, 233, 0.17, 0.24); return o; },
  // Copier jam alarm: three quick high beeps.
  copier_alarm: (sr) => { const o = buf(sr, 0.5); for (let k = 0; k < 3; k++) beepInto(o, sr, k * 0.14, 2150, 0.08, 0.12); return o; },
  // A typewriter key.
  type: (sr) => { const o = buf(sr, 0.07); noiseInto(o, sr, 0, 0.03, 0.55, 5200, 1500, 0.006); thumpInto(o, sr, 0, 220, 140, 0.04, 0.2); return o; },
  // Lock clacks open, then two happy notes.
  unlock: (sr) => {
    const o = buf(sr, 1.1);
    noiseInto(o, sr, 0, 0.02, 0.6, 4000, 900, 0.005);
    thumpInto(o, sr, 0.09, 180, 90, 0.1, 0.5);
    noiseInto(o, sr, 0.09, 0.05, 0.4, 2500, 300, 0.012);
    toneInto(o, sr, 0.25, 659.25, 0.8, 0.22, 0.4);
    toneInto(o, sr, 0.37, 987.77, 0.7, 0.22, 0.45);
    return o;
  },
  // PA system switching on: thump and a hiss.
  pa_on: (sr) => { const o = buf(sr, 0.45); thumpInto(o, sr, 0, 80, 50, 0.12, 0.5); noiseInto(o, sr, 0.02, 0.4, 0.06, 7000, 1500, 0.2); return o; },
  // Peeling a sticky note.
  sticky: (sr) => {
    const o = buf(sr, 0.22);
    for (let k = 0; k < 14; k++) noiseInto(o, sr, k * 0.011, 0.012, 0.2 * (1 - k / 16), 2500 + k * 400, 900 + k * 120, 0.004);
    return o;
  },
  // Paper whoosh (sliding a sheet across the desk).
  slide: (sr) => { const o = buf(sr, 0.3); noiseInto(o, sr, 0, 0.28, 0.25, 3500, 500, 0.1); return o; },
  // The Hatchet Man stomping the floor before he charges.
  stomp: (sr) => { const o = buf(sr, 0.4); thumpInto(o, sr, 0, 70, 38, 0.32, 1.0); noiseInto(o, sr, 0, 0.1, 0.5, 500, 40, 0.03); return o; }
};

// Phone keypad tones (DTMF) for the door keypad.
const DTMF_ROW = [697, 770, 852, 941], DTMF_COL = [1209, 1336, 1477];
const DTMF_POS: Record<number, [number, number]> = { 1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2], 7: [2, 0], 8: [2, 1], 9: [2, 2], 0: [3, 1] };
for (let d = 0; d <= 9; d++) {
  const [r, c] = DTMF_POS[d];
  SYNTHS[`dtmf_${d}`] = (sr) => {
    const o = buf(sr, 0.13);
    for (let n = 0; n < o.length; n++) {
      const t = n / sr, e = Math.min(1, n / (sr * 0.004)) * Math.min(1, (o.length - n) / (sr * 0.012));
      o[n] = (Math.sin(TAU * DTMF_ROW[r] * t) + Math.sin(TAU * DTMF_COL[c] * t)) * 0.16 * e;
    }
    return o;
  };
}

/** Builds every buffer into the scene's audio cache; returns { groupName: [cacheKeys] }. */
export function buildOfficeSfx(scene: Phaser.Scene): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const mgr = scene.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = (mgr as unknown as { context?: AudioContext }).context;
  if (!ctx || typeof ctx.createBuffer !== "function") return groups;
  const sr = ctx.sampleRate;
  for (const [name, fn] of Object.entries(SYNTHS)) {
    const key = `osfx_${name}`;
    try {
      const data = fn(sr);
      // Normalise loud mixes so nothing clips.
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      if (peak > 0.95) for (let i = 0; i < data.length; i++) data[i] *= 0.95 / peak;
      const ab = ctx.createBuffer(1, data.length, sr);
      ab.getChannelData(0).set(data);
      if (!scene.cache.audio.exists(key)) scene.cache.audio.add(key, ab);
      groups[name] = [key];
    } catch { /* this one just stays silent */ }
  }
  return groups;
}
