// Sons synthétisés en direct avec Web Audio : aucun fichier à charger.
// Le contexte audio ne démarre qu'après un premier geste du joueur (règle des navigateurs).

const KEY = 'airhockey.sound';
let ctx = null;
let master = null;
let noiseBuffer = null;
let enabled = true;
const lastPlayed = {};

try {
  enabled = localStorage.getItem(KEY) !== '0';
} catch {
  /* stockage indisponible : le son reste activé */
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(value) {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* sans conséquence */
  }
  if (master) master.gain.value = enabled ? 0.9 : 0;
}

export function audioState() {
  return ctx ? ctx.state : 'none';
}

// À appeler depuis un geste du joueur (toucher, clic).
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
    const n = Math.floor(ctx.sampleRate * 0.3);
    noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

function out(pan) {
  if (!ctx.createStereoPanner) return master;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}

function tone({ freq, to = freq, dur, type = 'sine', gain = 0.3, pan = 0, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(out(pan));
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ freq, q = 4, dur, gain = 0.3, pan = 0, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out(pan));
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Évite l'effet mitraillette quand plusieurs chocs tombent dans la même image.
function tooSoon(name, gap) {
  const now = ctx.currentTime;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return true;
  lastPlayed[name] = now;
  return false;
}

// Joue le son d'un événement de jeu. `W` = largeur de la table, pour placer le son à gauche ou à droite.
export function play(ev, W) {
  if (!ctx || !enabled || ctx.state !== 'running') return;
  const pan = ev.x !== undefined ? (ev.x / W) * 1.6 - 0.8 : 0;
  if (ev.type === 'hit') {
    if (tooSoon('hit', 0.03)) return;
    const k = Math.min(1, ev.power / 4);
    noise({ freq: 1800 + k * 2200, q: 2.5, dur: 0.05 + k * 0.04, gain: 0.25 + k * 0.5, pan });
    tone({ freq: 240 + k * 160, to: 90, dur: 0.09 + k * 0.05, type: 'triangle', gain: 0.25 + k * 0.4, pan });
  } else if (ev.type === 'wall') {
    const k = Math.min(1, ev.power / 4);
    if (k < 0.04 || tooSoon('wall', 0.03)) return;
    noise({ freq: 3200 + k * 1500, q: 6, dur: 0.035, gain: 0.12 + k * 0.3, pan });
    tone({ freq: 620 + k * 380, to: 420, dur: 0.05, type: 'sine', gain: 0.08 + k * 0.18, pan });
  } else if (ev.type === 'net') {
    if (tooSoon('net', 0.06)) return;
    const k = Math.min(1, ev.power / 4);
    tone({ freq: 880 + k * 660, to: 1320 + k * 900, dur: 0.16, type: 'sine', gain: 0.05 + k * 0.1 });
  } else if (ev.type === 'score') {
    const p = ev.scorer === 1 ? -0.6 : 0.6;
    tone({ freq: 160, to: 38, dur: 0.6, type: 'sine', gain: 0.9, pan: p });
    noise({ freq: 500, q: 0.8, dur: 0.45, gain: 0.5, pan: p });
    const notes = ev.scorer === 0 ? [523, 659, 784, 1047] : [587, 740, 880, 1175];
    notes.forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'square', gain: 0.1, delay: 0.08 + i * 0.07 }));
  } else if (ev.type === 'win') {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.22, delay: 0.5 + i * 0.11 });
      tone({ freq: f / 2, dur: 0.5, type: 'sine', gain: 0.18, delay: 0.5 + i * 0.11 });
    });
  } else if (ev.type === 'serve') {
    tone({ freq: 440, to: 660, dur: 0.1, type: 'sine', gain: 0.12 });
  } else if (ev.type === 'ui') {
    tone({ freq: 700, to: 980, dur: 0.07, type: 'sine', gain: 0.12 });
  }
}
