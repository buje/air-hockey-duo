// Sons du flipper. Le moteur audio est dans shared/sound.js.
import { tone, noise, tooSoon, ready } from '../../shared/sound.js';

export { unlock, isEnabled, setEnabled, audioState, peak } from '../../shared/sound.js';

export function play(ev) {
  if (!ready()) return;
  const pan = ev.x !== undefined ? ev.x * 1.4 - 0.7 : ev.side === 'left' ? -0.5 : ev.side === 'right' ? 0.5 : 0;
  switch (ev.type) {
    case 'flip':
      noise({ freq: 900, q: 1.2, dur: 0.05, gain: 0.35, pan });
      tone({ freq: 260, to: 170, dur: 0.06, type: 'square', gain: 0.18, pan });
      break;
    case 'flipper': {
      if (tooSoon('flipper', 0.04)) return;
      const k = Math.min(1, ev.power / 4);
      noise({ freq: 1400 + k * 1200, q: 1.5, dur: 0.07, gain: 0.4 + k * 0.4, pan });
      tone({ freq: 420 + k * 260, to: 240, dur: 0.12, type: 'triangle', gain: 0.4 + k * 0.4, pan });
      break;
    }
    case 'bumper':
      if (tooSoon('bumper', 0.04)) return;
      if (ev.kind === 'kicker') {
        tone({ freq: 620, to: 1240, dur: 0.1, type: 'square', gain: 0.22, pan });
      } else {
        tone({ freq: 880, to: 1760, dur: 0.12, type: 'square', gain: 0.25, pan });
        tone({ freq: 440, to: 220, dur: 0.16, type: 'triangle', gain: 0.4, pan });
      }
      break;
    case 'target':
      tone({ freq: 1320, dur: 0.25, type: 'sine', gain: 0.35, pan });
      tone({ freq: 1980, dur: 0.2, type: 'sine', gain: 0.15, pan, delay: 0.03 });
      break;
    case 'bonus':
      [659, 784, 988, 1319, 1568].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'square', gain: 0.22, delay: i * 0.07 }));
      break;
    case 'wall': {
      const k = Math.min(1, ev.power / 4);
      if (tooSoon('wall', 0.05)) return;
      noise({ freq: 2600, q: 4, dur: 0.04, gain: 0.1 + k * 0.3, pan });
      break;
    }
    case 'fold':
      if (tooSoon('fold', 0.08)) return;
      if (ev.up) tone({ freq: 700, to: 1400, dur: 0.18, type: 'sine', gain: 0.22, pan });
      else tone({ freq: 900, to: 500, dur: 0.14, type: 'sine', gain: 0.12, pan });
      break;
    case 'launch':
      tone({ freq: 300, to: 900, dur: 0.25, type: 'sawtooth', gain: 0.2 });
      break;
    case 'saved':
      [784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.3, delay: i * 0.1 }));
      break;
    case 'drain':
      tone({ freq: 500, to: 110, dur: 0.6, type: 'sawtooth', gain: 0.3 });
      break;
    case 'gameover':
      [523, 440, 349, 262].forEach((f, i) => tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.35, delay: 0.3 + i * 0.18 }));
      break;
    case 'ui':
      tone({ freq: 700, to: 980, dur: 0.09, type: 'sine', gain: 0.25 });
      break;
    default:
  }
}
