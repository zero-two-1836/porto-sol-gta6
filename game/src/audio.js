// Porto Sol — Streets of the Sun
// audio.js — synthesized sound, no audio files. One job: WebAudio effects and a
// small step-sequencer music loop. Everything is a no-op until the player first
// interacts (browsers block audio before a gesture), and M mutes everything.

let ctx = null;
let master = null;
let muted = false;
let musicTimer = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenFlip = null;
let step = 0;

// A minor-key street loop: Am — F — C — G, one bar each, 16th notes at 104 BPM.
const BPM = 104;
const STEP_SEC = 60 / BPM / 4;
const BASS = [55.0, 43.65, 65.41, 49.0]; // A1 F1 C2 G1, one per bar
const LEAD = [220, 261.63, 329.63, 392, 440, 329.63, 261.63, 196]; // A minor pentatonic-ish
const LEAD_PATTERN = [0, -1, 2, -1, 4, -1, 3, 5, 0, -1, 2, 6, 4, 3, 2, -1];

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}

// Call from any user gesture (key press, click). Safe to call repeatedly.
export function ensureAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      startMusic();
      startEngine();
      startSiren();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    // Audio is decoration; a failure here must never break the game.
    ctx = null;
  }
}

function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass = 1200) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

function startMusic() {
  if (musicTimer) return;
  musicTimer = window.setInterval(() => {
    if (!ctx || muted) { step = (step + 1) % 64; return; }
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    // Bass on beats 1 and 3, plus an off-beat pickup.
    if (s16 === 0 || s16 === 8 || s16 === 14) tone(BASS[bar], 0.34, 'triangle', 0.22);
    // Hats: short noise ticks on every other 16th.
    if (s16 % 2 === 0) noiseBurst(0.03, 0.05, 6000);
    // Sparse lead pluck.
    const lead = LEAD_PATTERN[s16];
    if (lead >= 0) tone(LEAD[lead % LEAD.length], 0.18, 'square', 0.045);
    // Kick on the four beats.
    if (s16 % 4 === 0) tone(120, 0.12, 'sine', 0.3, 0, 40);
    step = (step + 1) % 64;
  }, STEP_SEC * 1000);
}

function startEngine() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(f);
  f.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();
}

// speed: 0..~650 world units/s. 0 gain when the player is on foot.
export function setEngine(speed, driving) {
  if (!ctx || !engineOsc) return;
  const target = driving ? Math.min(0.085, 0.02 + (speed / 650) * 0.065) : 0;
  engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
  engineOsc.frequency.setTargetAtTime(52 + (speed / 650) * 130, ctx.currentTime, 0.1);
}

function startSiren() {
  if (!ctx || sirenOsc) return;
  sirenOsc = ctx.createOscillator();
  sirenOsc.type = 'square';
  sirenOsc.frequency.value = 720;
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(master);
  sirenOsc.start();
  sirenFlip = window.setInterval(() => {
    if (!sirenOsc) return;
    sirenOsc.frequency.value = sirenOsc.frequency.value < 800 ? 960 : 720;
  }, 420);
}

// on: true while any police unit is close and the player is wanted.
export function setSiren(on) {
  if (!ctx || !sirenGain) return;
  sirenGain.gain.setTargetAtTime(on && !muted ? 0.028 : 0, ctx.currentTime, 0.15);
}

export function sfxShot() { noiseBurst(0.14, 0.5, 2400); tone(180, 0.09, 'square', 0.2, 0, 60); }
export function sfxPunch() { tone(110, 0.1, 'sine', 0.4, 0, 55); noiseBurst(0.06, 0.2, 500); }
export function sfxChime() { tone(660, 0.14, 'sine', 0.2); tone(880, 0.22, 'sine', 0.2, 0.12); }
export function sfxCrash() { noiseBurst(0.3, 0.45, 800); tone(90, 0.25, 'sine', 0.3, 0, 45); }
export function sfxSteal() { tone(520, 0.08, 'square', 0.15); tone(780, 0.12, 'square', 0.15, 0.08); }
export function sfxBusted() { tone(392, 0.3, 'square', 0.2); tone(311, 0.5, 'square', 0.2, 0.28); }
export function sfxMission() {
  tone(523, 0.14, 'sine', 0.22); tone(659, 0.14, 'sine', 0.22, 0.12);
  tone(784, 0.3, 'sine', 0.25, 0.24);
}
