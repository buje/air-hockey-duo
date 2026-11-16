// Sons synthétisés en direct avec Web Audio : aucun fichier à charger.
// Le contexte audio ne démarre qu'après un premier geste du joueur (règle des navigateurs).

const KEY = 'airhockey.sound';
let ctx = null;
let master = null;
let noiseBuffer = null;
let analyser = null;
let silentEl = null;
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

// Sur iPhone, le mode silencieux coupe le son des pages web sauf si la page se déclare
// comme lecteur audio. On le fait avec l'API Audio Session, sinon avec un petit fichier
// audio muet joué en boucle (l'ancienne méthode).
function escapeSilentMode() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = 'playback';
      return;
    }
  } catch {
    /* on tente l'autre méthode */
  }
  if (silentEl) return;
  // WAV mono 8 kHz de 0,25 s de silence, fabriqué à la volée.
  const n = 2000;
  const bytes = new Uint8Array(44 + n);
  const view = new DataView(bytes.buffer);
  const text = (o, t) => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + n, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, n, true);
  bytes.fill(128, 44);
  silentEl = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
  silentEl.loop = true;
  silentEl.setAttribute('playsinline', '');
  silentEl.play().catch(() => {});
}

// À appeler depuis un geste du joueur (toucher, clic). Peut être rappelé sans risque.
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  escapeSilentMode();
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(analyser);
    analyser.connect(limiter);
    limiter.connect(ctx.destination);
    const n = Math.floor(ctx.sampleRate * 0.3);
    noiseBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') {
    // 'suspended' au départ, 'interrupted' sur iPhone après un appel ou un changement d'app.
    ctx.resume().catch(() => {});
    // Jouer un son vide pendant le geste : c'est ce qui débloque l'audio sur Safari iOS.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* sans conséquence */
    }
  }
}

// Niveau du signal qui part vers les haut-parleurs (0 = silence). Sert au diagnostic et aux tests.
export function peak() {
  if (!analyser) return 0;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  return max;
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
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
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
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
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
  if (!ctx || !enabled) return;
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    return;
  }
  const pan = ev.x !== undefined ? (ev.x / W) * 1.6 - 0.8 : 0;
  // Les haut-parleurs d'un téléphone ne rendent presque rien sous 200 Hz :
  // chaque son a donc l'essentiel de son énergie entre 400 et 3000 Hz.
  if (ev.type === 'hit') {
    if (tooSoon('hit', 0.03)) return;
    const k = Math.min(1, ev.power / 4);
    noise({ freq: 1500 + k * 2000, q: 1.8, dur: 0.07 + k * 0.05, gain: 0.5 + k * 0.5, pan });
    tone({ freq: 520 + k * 420, to: 300, dur: 0.12 + k * 0.06, type: 'triangle', gain: 0.45 + k * 0.45, pan });
    tone({ freq: 190 + k * 80, to: 90, dur: 0.12, type: 'sine', gain: 0.3 + k * 0.3, pan });
  } else if (ev.type === 'wall') {
    const k = Math.min(1, ev.power / 4);
    if (k < 0.04 || tooSoon('wall', 0.03)) return;
    noise({ freq: 2800 + k * 1500, q: 4, dur: 0.05, gain: 0.25 + k * 0.4, pan });
    tone({ freq: 900 + k * 500, to: 650, dur: 0.08, type: 'sine', gain: 0.2 + k * 0.3, pan });
  } else if (ev.type === 'net') {
    if (tooSoon('net', 0.06)) return;
    const k = Math.min(1, ev.power / 4);
    tone({ freq: 880 + k * 660, to: 1320 + k * 900, dur: 0.2, type: 'sine', gain: 0.12 + k * 0.18 });
  } else if (ev.type === 'score') {
    const p = ev.scorer === 1 ? -0.6 : 0.6;
    tone({ freq: 160, to: 45, dur: 0.6, type: 'sine', gain: 0.8, pan: p });
    tone({ freq: 900, to: 220, dur: 0.45, type: 'sawtooth', gain: 0.35, pan: p });
    noise({ freq: 900, q: 0.7, dur: 0.5, gain: 0.6, pan: p });
    const notes = ev.scorer === 0 ? [523, 659, 784, 1047] : [587, 740, 880, 1175];
    notes.forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'square', gain: 0.22, delay: 0.1 + i * 0.08 }));
  } else if (ev.type === 'win') {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      tone({ freq: f, dur: 0.6, type: 'triangle', gain: 0.4, delay: 0.6 + i * 0.11 });
      tone({ freq: f * 2, dur: 0.4, type: 'sine', gain: 0.15, delay: 0.6 + i * 0.11 });
    });
  } else if (ev.type === 'serve') {
    tone({ freq: 520, to: 780, dur: 0.14, type: 'sine', gain: 0.25 });
  } else if (ev.type === 'ui') {
    tone({ freq: 700, to: 980, dur: 0.09, type: 'sine', gain: 0.25 });
  }
}
