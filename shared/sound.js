// Noyau audio commun aux jeux : sons synthétisés en direct avec Web Audio, aucun fichier à charger.
// Le contexte audio ne démarre qu'après un premier geste du joueur (règle des navigateurs).
// Chaque jeu décrit ses propres sons dans son audio.js à partir de tone() et noise().

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

export function tone({ freq, to = freq, dur, type = 'sine', gain = 0.3, pan = 0, delay = 0 }) {
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

export function noise({ freq, q = 4, dur, gain = 0.3, pan = 0, delay = 0 }) {
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
export function tooSoon(name, gap) {
  const now = ctx.currentTime;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return true;
  lastPlayed[name] = now;
  return false;
}

// Vrai quand un son peut être joué. Relance le moteur s'il a été interrompu.
export function ready() {
  if (!ctx || !enabled) return false;
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    return false;
  }
  return true;
}
