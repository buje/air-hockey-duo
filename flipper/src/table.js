// Géométrie du plateau. Pur. Tout est calculé à partir de H pour s'adapter à la forme de l'écran :
// le haut du plateau est accroché en haut, les batteurs en bas, le milieu s'étire.

function arc(cx, cy, rx, ry, from, to, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

function chain(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push({ x1: points[i][0], y1: points[i][1], x2: points[i + 1][0], y2: points[i + 1][1] });
  }
  return segs;
}

export function buildTable(H, cfg) {
  const L = 0.03; // bord gauche
  const R = 0.97; // bord droit
  const pivotY = H - 0.25;
  const funnelY = H - 0.48;
  const foldY = H / 2;
  const upper = foldY; // hauteur de la moitié debout

  const outline = [
    [0.25, pivotY - 0.012], // fin de l'entonnoir gauche, au pivot du batteur
    [L, funnelY],
    ...arc(0.5, 0.25, 0.47, 0.22, Math.PI, 2 * Math.PI, 18), // voûte du haut
    [R, funnelY],
    [0.75, pivotY - 0.012],
  ];

  return {
    H,
    foldY,
    left: L,
    right: R,
    segments: chain(outline),
    // Champignons de la moitié debout, puis deux petits kickers au-dessus des batteurs.
    bumpers: [
      { x: 0.3, y: 0.3 + upper * 0.12, r: 0.062, kind: 'bumper' },
      { x: 0.7, y: 0.3 + upper * 0.12, r: 0.062, kind: 'bumper' },
      { x: 0.5, y: 0.3 + upper * 0.42, r: 0.062, kind: 'bumper' },
      { x: 0.17, y: H - 0.62, r: 0.036, kind: 'kicker' },
      { x: 0.83, y: H - 0.62, r: 0.036, kind: 'kicker' },
    ],
    // Quatre cibles sous la voûte : toutes allumées = gros bonus et multiplicateur.
    targets: [0.32, 0.44, 0.56, 0.68].map((x) => ({ x, y: 0.19, r: 0.022 })),
    // angle : 0 = horizontal vers le centre, positif = pointe vers le bas.
    flippers: [
      { side: 'left', px: 0.25, py: pivotY, len: 0.17, r: 0.022, rest: 0.5, active: -0.5 },
      { side: 'right', px: 0.75, py: pivotY, len: 0.17, r: 0.022, rest: 0.5, active: -0.5 },
    ],
    launch: { x: 0.5, y: 0.1 },
    ballR: cfg.ballR,
  };
}

// Extrémité d'un batteur pour un angle donné.
export function flipperTip(f, angle) {
  const dir = f.side === 'left' ? 1 : -1;
  return { x: f.px + dir * Math.cos(angle) * f.len, y: f.py + Math.sin(angle) * f.len };
}
