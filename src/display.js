// Géométrie d'écran : où est la table, dans quel sens, et sur quel type d'écran on est.
// Pur (testable sous Node). Aucune dimension d'appareil n'est codée en dur.

const MARGIN = 10; // marge en px CSS autour de la table
const MIN_ASPECT = 1.25;
const MAX_ASPECT = 2.3;

// 'cover' : petit écran presque carré (écran externe du Duo fermé)
// 'open'  : grand écran presque carré (Duo ouvert, tablette)
// 'other' : écran allongé (téléphone classique, ordinateur)
export function classify(vw, vh) {
  const short = Math.min(vw, vh);
  const long = Math.max(vw, vh);
  if (long / short >= 1.6) return 'other';
  return short < 520 ? 'cover' : 'open';
}

// insets = { top, right, bottom, left } zones sûres en px CSS.
// La table est toujours centrée sur l'écran : le filet tombe sur le pli.
// forcedAspect : forme de table imposée (parties à distance, la même sur les deux téléphones).
export function computeLayout(vw, vh, insets = { top: 0, right: 0, bottom: 0, left: 0 }, forcedAspect = 0) {
  const padX = Math.max(insets.left, insets.right) + MARGIN;
  const padY = Math.max(insets.top, insets.bottom) + MARGIN;
  const availW = Math.max(50, vw - 2 * padX);
  const availH = Math.max(50, vh - 2 * padY);
  const rot = availH > availW; // table tournée : son grand axe suit la hauteur de l'écran
  const long = rot ? availH : availW;
  const short = rot ? availW : availH;
  let aspect = long / short;
  let scale = short; // px CSS par unité de table
  if (aspect > MAX_ASPECT) aspect = MAX_ASPECT;
  if (aspect < MIN_ASPECT) {
    aspect = MIN_ASPECT;
    scale = long / aspect;
  }
  if (forcedAspect > 0) {
    aspect = forcedAspect;
    scale = Math.min(short, long / aspect);
  }
  const tableLong = aspect * scale;
  const tableShort = scale;
  const w = rot ? tableShort : tableLong;
  const h = rot ? tableLong : tableShort;
  return {
    vw,
    vh,
    rot,
    aspect,
    scale,
    x: (vw - w) / 2,
    y: (vh - h) / 2,
    w,
    h,
    mode: classify(vw, vh),
  };
}

// Écran (px CSS) vers table. En mode tourné le joueur 0 est en bas de l'écran.
export function screenToTable(L, sx, sy) {
  if (!L.rot) return { x: (sx - L.x) / L.scale, y: (sy - L.y) / L.scale };
  return { x: (L.y + L.h - sy) / L.scale, y: (sx - L.x) / L.scale };
}

export function tableToScreen(L, tx, ty) {
  if (!L.rot) return { x: L.x + tx * L.scale, y: L.y + ty * L.scale };
  return { x: L.x + ty * L.scale, y: L.y + L.h - tx * L.scale };
}
