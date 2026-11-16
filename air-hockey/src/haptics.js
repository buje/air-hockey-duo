// Vibrations. Safari sur iPhone n'expose aucune API de vibration aux pages web :
// ce module n'a d'effet que sur les navigateurs qui proposent navigator.vibrate (Android).
// Sur iPhone il faudrait une app native pour accéder au moteur haptique.

export const hapticsSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function buzz(ev) {
  if (!hapticsSupported) return;
  try {
    if (ev.type === 'hit') navigator.vibrate(Math.round(6 + Math.min(1, ev.power / 4) * 18));
    else if (ev.type === 'score') navigator.vibrate([40, 50, 90]);
    else if (ev.type === 'win') navigator.vibrate([60, 60, 60, 60, 160]);
  } catch {
    /* refusé par le navigateur : sans conséquence */
  }
}
