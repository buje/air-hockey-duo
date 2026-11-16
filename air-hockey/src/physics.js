// Physique pure : aucun accès au DOM ni à l'affichage. Testable sous Node.
// Repère : x de 0 à W (W = aspect), y de 0 à 1. Le filet est en x = W / 2.
// Joueur 0 défend le but en x = 0, joueur 1 celui en x = W.

function makeMallet(x, r) {
  return { x, y: 0.5, vx: 0, vy: 0, r, tx: x, ty: 0.5 };
}

export function createWorld(aspect, cfg) {
  const W = aspect;
  return {
    W,
    H: 1,
    cfg,
    puckActive: true,
    puck: { x: W / 2, y: 0.5, vx: 0, vy: 0, r: cfg.puckR },
    mallets: [makeMallet(W * 0.18, cfg.malletR), makeMallet(W * 0.82, cfg.malletR)],
  };
}

export function malletBounds(world, i) {
  const { W, cfg } = world;
  const r = cfg.malletR;
  const half = W / 2;
  return i === 0
    ? { minX: r, maxX: half - r - cfg.netGap, minY: r, maxY: 1 - r }
    : { minX: half + r + cfg.netGap, maxX: W - r, minY: r, maxY: 1 - r };
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function setTarget(world, i, x, y) {
  const b = malletBounds(world, i);
  const m = world.mallets[i];
  m.tx = clamp(x, b.minX, b.maxX);
  m.ty = clamp(y, b.minY, b.maxY);
}

export function placePuck(world, x, y) {
  const p = world.puck;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  world.puckActive = true;
}

function moveMallet(world, i, dt) {
  const m = world.mallets[i];
  const b = malletBounds(world, i);
  const dx = m.tx - m.x;
  const dy = m.ty - m.y;
  const dist = Math.hypot(dx, dy);
  const maxMove = world.cfg.malletMaxSpeed * dt;
  let nx = m.tx;
  let ny = m.ty;
  if (dist > maxMove) {
    nx = m.x + (dx / dist) * maxMove;
    ny = m.y + (dy / dist) * maxMove;
  }
  nx = clamp(nx, b.minX, b.maxX);
  ny = clamp(ny, b.minY, b.maxY);
  m.vx = (nx - m.x) / dt;
  m.vy = (ny - m.y) / dt;
  m.x = nx;
  m.y = ny;
}

// Renvoie la force du choc (vitesse relative le long de la normale) ou 0.
function collidePuckMallet(p, m, e) {
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const rsum = p.r + m.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rsum * rsum) return 0;
  let dist = Math.sqrt(d2);
  let nx;
  let ny;
  if (dist < 1e-9) {
    nx = 1;
    ny = 0;
    dist = 0;
  } else {
    nx = dx / dist;
    ny = dy / dist;
  }
  p.x = m.x + nx * rsum;
  p.y = m.y + ny * rsum;
  const vn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (vn < 0) {
    p.vx -= (1 + e) * vn * nx;
    p.vy -= (1 + e) * vn * ny;
    return -vn;
  }
  return 0;
}

function collidePuckPoint(p, qx, qy, e) {
  const dx = p.x - qx;
  const dy = p.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= p.r * p.r || d2 < 1e-18) return 0;
  const dist = Math.sqrt(d2);
  const nx = dx / dist;
  const ny = dy / dist;
  p.x = qx + nx * p.r;
  p.y = qy + ny * p.r;
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= (1 + e) * vn * nx;
    p.vy -= (1 + e) * vn * ny;
    return -vn;
  }
  return 0;
}

// Avance le monde d'un pas. Ajoute dans `events` :
//   { type: 'hit', power, x, y, player }   palet contre maillet
//   { type: 'wall', power, x, y }          palet contre un bord ou un poteau
//   { type: 'net', power, y }              palet qui traverse le filet
//   { type: 'goal', scorer }               but (le palet devient inactif)
export function stepWorld(world, dt, events) {
  const { W, cfg, puck: p } = world;
  moveMallet(world, 0, dt);
  moveMallet(world, 1, dt);
  if (!world.puckActive) return;

  const damp = Math.exp(-cfg.damping * dt);
  p.vx *= damp;
  p.vy *= damp;
  const prevX = p.x;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  for (let i = 0; i < 2; i++) {
    const power = collidePuckMallet(p, world.mallets[i], cfg.restitutionMallet);
    if (power > 0) events.push({ type: 'hit', power, x: p.x, y: p.y, player: i });
  }

  // Poteaux des buts.
  const gh = cfg.goalHalf;
  const eW = cfg.restitutionWall;
  for (let k = 0; k < 4; k++) {
    const qx = k < 2 ? 0 : W;
    const qy = k % 2 === 0 ? 0.5 - gh : 0.5 + gh;
    const power = collidePuckPoint(p, qx, qy, eW);
    if (power > 0.05) events.push({ type: 'wall', power, x: qx, y: qy });
  }

  // Bords haut et bas.
  if (p.y < p.r) {
    p.y = p.r;
    if (p.vy < 0) {
      events.push({ type: 'wall', power: -p.vy, x: p.x, y: 0 });
      p.vy = -p.vy * eW;
    }
  } else if (p.y > 1 - p.r) {
    p.y = 1 - p.r;
    if (p.vy > 0) {
      events.push({ type: 'wall', power: p.vy, x: p.x, y: 1 });
      p.vy = -p.vy * eW;
    }
  }

  // Bords gauche et droit, ouverts au niveau des buts.
  const inMouth = Math.abs(p.y - 0.5) < gh;
  if (!inMouth) {
    if (p.x < p.r) {
      p.x = p.r;
      if (p.vx < 0) {
        events.push({ type: 'wall', power: -p.vx, x: 0, y: p.y });
        p.vx = -p.vx * eW;
      }
    } else if (p.x > W - p.r) {
      p.x = W - p.r;
      if (p.vx > 0) {
        events.push({ type: 'wall', power: p.vx, x: W, y: p.y });
        p.vx = -p.vx * eW;
      }
    }
  } else if (p.x < -p.r) {
    world.puckActive = false;
    events.push({ type: 'goal', scorer: 1 });
    return;
  } else if (p.x > W + p.r) {
    world.puckActive = false;
    events.push({ type: 'goal', scorer: 0 });
    return;
  }

  // Palet coincé entre un maillet et un bord : c'est le maillet qui recule.
  for (let i = 0; i < 2; i++) {
    const m = world.mallets[i];
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const rsum = p.r + m.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < rsum * rsum && d2 > 1e-18) {
      const dist = Math.sqrt(d2);
      const b = malletBounds(world, i);
      m.x = clamp(p.x + (dx / dist) * rsum, b.minX, b.maxX);
      m.y = clamp(p.y + (dy / dist) * rsum, b.minY, b.maxY);
    }
  }

  // Vitesse plafonnée.
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > cfg.puckMaxSpeed) {
    const k = cfg.puckMaxSpeed / speed;
    p.vx *= k;
    p.vy *= k;
  }

  const half = W / 2;
  if ((prevX - half) * (p.x - half) < 0) {
    events.push({ type: 'net', power: Math.abs(p.vx), y: p.y });
  }
}
