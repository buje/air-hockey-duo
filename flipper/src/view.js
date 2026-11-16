// Géométrie d'écran du flipper et lecture de la posture du téléphone. La partie calcul est pure.

const MARGIN = 6;
const MIN_H = 1.3;
const MAX_H = 2.2;
const DEFAULT_H = 1.42; // écran large (ordinateur) : plateau de la forme d'un Duo ouvert

// Le plateau est centré : le pli de l'écran tombe à mi-hauteur du plateau.
export function computeView(vw, vh, insets = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const padX = Math.max(insets.left, insets.right) + MARGIN;
  const padY = Math.max(insets.top, insets.bottom) + MARGIN;
  const availW = Math.max(50, vw - 2 * padX);
  const availH = Math.max(50, vh - 2 * padY);
  const ratio = availH / availW;
  let H;
  let scale; // px CSS par unité de plateau (le plateau fait 1 de large)
  if (ratio < MIN_H) {
    H = DEFAULT_H;
    scale = availH / H;
  } else {
    H = Math.min(ratio, MAX_H);
    scale = Math.min(availW, availH / H);
  }
  return { vw, vh, H, scale, x: (vw - scale) / 2, y: (vh - H * scale) / 2 };
}

// 'cover' : petit écran presque carré (Duo fermé), 'open' : grand écran presque carré, 'other' : le reste.
export function classify(vw, vh) {
  const short = Math.min(vw, vh);
  const long = Math.max(vw, vh);
  if (long / short >= 1.6) return 'other';
  return short < 520 ? 'cover' : 'open';
}

// Décide quoi afficher et quelle gravité appliquer.
//   posture : 'folded' | 'continuous' | null (API absente, cas normal sans les feature flags Safari)
// Renvoie { gate, folded } où gate vaut null (on joue) ou 'cover' | 'flat' | 'rotate'.
export function decide(vw, vh, posture, bypass) {
  const kind = classify(vw, vh);
  if (bypass) return { gate: null, folded: posture === 'folded' };
  if (kind === 'cover') return { gate: 'cover', folded: false };
  if (posture === 'folded') return { gate: vw > vh ? 'rotate' : null, folded: true };
  if (posture === 'continuous') return { gate: kind === 'open' ? 'flat' : null, folded: false };
  // Posture inconnue : sur un écran de type Duo ouvert tenu en hauteur on suppose qu'il est plié.
  return { gate: null, folded: kind === 'open' && vh > vw };
}

export function readPosture() {
  try {
    const p = navigator.devicePosture;
    if (p && typeof p.type === 'string') return p.type === 'folded' ? 'folded' : 'continuous';
  } catch {
    /* API absente */
  }
  return null;
}

export function watchPosture(callback) {
  try {
    navigator.devicePosture?.addEventListener?.('change', callback);
    window.matchMedia?.('(device-posture: folded)')?.addEventListener?.('change', callback);
  } catch {
    /* API absente */
  }
}
