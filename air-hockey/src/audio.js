// Sons du air hockey. Le moteur audio est dans shared/sound.js.
import { tone, noise, tooSoon, ready } from '../../shared/sound.js';

export { unlock, isEnabled, setEnabled, audioState, peak } from '../../shared/sound.js';

// Joue le son d'un événement de jeu. `W` = largeur de la table, pour placer le son à gauche ou à droite.
export function play(ev, W) {
  if (!ready()) return;
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
