// Physique du flipper. Pure : ni DOM ni affichage. Testable sous Node.
import { flipperTip } from './table.js';

export function createWorld(table, cfg) {
  return {
    table,
    cfg,
    folded: true, // moitié du haut debout : gravité différente de part et d'autre du pli
    ball: { x: table.launch.x, y: table.launch.y, vx: 0, vy: 0, r: table.ballR, active: false },
    flippers: table.flippers.map((f) => ({ ...f, angle: f.rest, omega: 0, pressed: false })),
  };
}

function closestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: x1 + dx * t, y: y1 + dy * t };
}

// Repousse la bille hors d'un obstacle rond centré en (cx, cy) de rayon `radius`.
// (svx, svy) = vitesse de la surface touchée. Renvoie la force du choc, 0 s'il n'y a pas contact.
function bounce(b, cx, cy, radius, e, svx = 0, svy = 0) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const min = b.r + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return 0;
  let d = Math.sqrt(d2);
  let nx;
  let ny;
  if (d < 1e-9) {
    nx = 0;
    ny = -1;
    d = 0;
  } else {
    nx = dx / d;
    ny = dy / d;
  }
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    return -vn;
  }
  return 1e-6; // contact sans choc (la bille roule ou s'éloigne déjà)
}

function moveFlipper(f, cfg, dt) {
  const target = f.pressed ? f.active : f.rest;
  const speed = f.pressed ? cfg.flipUp : cfg.flipDown;
  const delta = target - f.angle;
  const max = speed * dt;
  const move = Math.abs(delta) <= max ? delta : Math.sign(delta) * max;
  f.angle += move;
  f.omega = move / dt;
}

// Avance le monde d'un pas. Événements ajoutés :
//   { type: 'wall', power, x, y }, { type: 'bumper', index, kind, x, y }, { type: 'target', index },
//   { type: 'flipper', side, power }, { type: 'fold', up, x }, { type: 'drain' }
export function stepWorld(world, dt, events) {
  const { table, cfg, ball: b } = world;
  for (const f of world.flippers) moveFlipper(f, cfg, dt);
  if (!b.active) return;

  const g = !world.folded ? cfg.gUniform : b.y < table.foldY ? cfg.gWall : cfg.gFlat;
  b.vy += g * dt;
  const prevY = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  for (const s of table.segments) {
    const c = closestOnSegment(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
    const power = bounce(b, c.x, c.y, 0, cfg.wallBounce);
    if (power > 0.6) events.push({ type: 'wall', power, x: c.x, y: c.y });
  }

  for (let i = 0; i < table.bumpers.length; i++) {
    const bp = table.bumpers[i];
    const power = bounce(b, bp.x, bp.y, bp.r, 0.2);
    if (power > 0) {
      // Un champignon renvoie toujours la bille avec force, même si elle arrive doucement.
      const nx = (b.x - bp.x) / (b.r + bp.r);
      const ny = (b.y - bp.y) / (b.r + bp.r);
      const out = b.vx * nx + b.vy * ny;
      if (out < cfg.bumperKick) {
        b.vx += (cfg.bumperKick - out) * nx;
        b.vy += (cfg.bumperKick - out) * ny;
      }
      events.push({ type: 'bumper', index: i, kind: bp.kind, x: bp.x, y: bp.y });
    }
  }

  for (let i = 0; i < table.targets.length; i++) {
    const t = table.targets[i];
    const power = bounce(b, t.x, t.y, t.r, 0.6);
    if (power > 0.2) events.push({ type: 'target', index: i, x: t.x, y: t.y });
  }

  for (const f of world.flippers) {
    const tip = flipperTip(f, f.angle);
    const c = closestOnSegment(b.x, b.y, f.px, f.py, tip.x, tip.y);
    // Vitesse du point touché : il tourne autour du pivot.
    const rx = c.x - f.px;
    const ry = c.y - f.py;
    const svx = f.side === 'left' ? -f.omega * ry : f.omega * ry;
    const svy = f.side === 'left' ? f.omega * rx : -f.omega * rx;
    const power = bounce(b, c.x, c.y, f.r, cfg.flipperBounce, svx, svy);
    if (power > 0.6) events.push({ type: 'flipper', side: f.side, power });
  }

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > cfg.maxSpeed) {
    b.vx *= cfg.maxSpeed / speed;
    b.vy *= cfg.maxSpeed / speed;
  }

  if ((prevY - table.foldY) * (b.y - table.foldY) < 0) {
    events.push({ type: 'fold', up: b.y < table.foldY, x: b.x });
  }
  if (b.y > table.H + b.r * 2) {
    b.active = false;
    events.push({ type: 'drain' });
  }
}
