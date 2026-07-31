// WebAudio synth — zero audio files. Two builders (tone, noise) compose every
// sound. Safe to call sfx.play() before init (no-ops until the context exists).
let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;
let ambientNodes = null;

function tone({ type = 'square', freq = 440, freqEnd = null, dur = 0.1, vol = 0.15, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.1, filterFreq = 2000, filterType = 'highpass', delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  jump: () => tone({ type: 'square', freq: 220, freqEnd: 440, dur: 0.09, vol: 0.14 }),
  land: () => noise({ dur: 0.05, vol: 0.06, filterFreq: 600, filterType: 'lowpass' }),
  cling: () => tone({ type: 'square', freq: 1300, dur: 0.03, vol: 0.07 }),
  rattle: () => {
    for (let i = 0; i < 4; i++) tone({ type: 'square', freq: 90 + i * 25, dur: 0.04, vol: 0.06, delay: i * 0.07 });
  },
  snap: () => {
    noise({ dur: 0.06, vol: 0.16, filterFreq: 2000, filterType: 'highpass' });
    tone({ type: 'square', freq: 90, dur: 0.12, vol: 0.16 });
  },
  hum: () => tone({ type: 'sawtooth', freq: 55, freqEnd: 110, dur: 0.4, vol: 0.05 }),
  zap: () => {
    for (let i = 0; i < 8; i++) tone({ type: 'sawtooth', freq: 50 + ((i * 37) % 60), dur: 0.03, vol: 0.1, delay: i * 0.02 });
  },
  tailLoss: () => {
    tone({ type: 'sawtooth', freq: 600, freqEnd: 120, dur: 0.45, vol: 0.2 });
    noise({ dur: 0.4, vol: 0.12, filterFreq: 800, filterType: 'lowpass' });
  },
  door: () => {
    tone({ type: 'square', freq: 523, dur: 0.07, vol: 0.12 });
    tone({ type: 'square', freq: 784, dur: 0.07, vol: 0.12, delay: 0.08 });
  },
  klaxon: () => {
    for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', freq: 320, freqEnd: 260, dur: 0.22, vol: 0.16, delay: i * 0.3 });
  },
  victory: () => {
    [523, 659, 784, 1047].forEach((f, i) => {
      tone({ type: 'square', freq: f, dur: 0.11, vol: 0.13, delay: i * 0.11 });
      tone({ type: 'square', freq: f * Math.pow(2, 4 / 1200), dur: 0.11, vol: 0.06, delay: i * 0.11 });
    });
  },
};

export const sfx = {
  init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    // deterministic pseudo-noise (no Math.random needed, and it sounds the same)
    let s = 1234567;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x3fffffff) - 1;
    }
    // browsers gate audio behind a user gesture
    const resume = () => { if (ctx.state === 'suspended') ctx.resume(); };
    window.addEventListener('keydown', resume);
    window.addEventListener('pointerdown', resume);
    // Mute lives on window, not a scene: scene-scoped key handlers die with the
    // scene that registered them (Boot hands off immediately).
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') this.setMuted(!muted);
    });
    if (import.meta.env?.DEV) window.__sfx = this;
  },
  play(name) {
    if (!ctx || muted || ctx.state === 'suspended') return;
    SOUNDS[name]?.();
  },
  setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 1;
  },
  isMuted() { return muted; },
  startAmbient() {
    if (!ctx || ambientNodes) return;
    const g = ctx.createGain();
    g.gain.value = 0.022;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 50;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 100.3;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200;
    const ng = ctx.createGain(); ng.gain.value = 0.6;
    o1.connect(g); o2.connect(g); n.connect(f).connect(ng).connect(g);
    g.connect(master);
    o1.start(); o2.start(); n.start();
    ambientNodes = [o1, o2, n, g];
  },
  stopAmbient() {
    if (!ambientNodes) return;
    ambientNodes.forEach((node) => { try { node.stop?.(); } catch { /* already stopped */ } });
    ambientNodes[3].disconnect();
    ambientNodes = null;
  },
};
