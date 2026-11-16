// Adversaire du mode solo. Pur : lit le monde et renvoie une cible pour son maillet.
import { malletBounds } from './physics.js';

// `i` = joueur piloté, `level` = 0 facile, 1 moyen, 2 difficile.
export function aiTarget(world, i, level, dt) {
  const { W, cfg, puck: p } = world;
  const m = world.mallets[i];
  const b = malletBounds(world, i);
  const dir = i === 0 ? 1 : -1; // sens d'attaque
  const homeX = i === 0 ? W * 0.14 : W * 0.86;
  const inMyHalf = world.puckActive && (i === 0 ? p.x < W / 2 : p.x > W / 2);
  const comingAtMe = world.puckActive && p.vx * dir < -0.2;

  let tx = homeX;
  let ty = 0.5;
  if (inMyHalf) {
    const behind = (m.x - p.x) * dir < -0.03; // le maillet est côté but par rapport au palet
    const tooFast = Math.hypot(p.vx, p.vy) > 2.2 && comingAtMe;
    if (tooFast) {
      // Défense : se placer sur la trajectoire, près du but.
      tx = homeX;
      ty = p.y + p.vy * 0.12;
    } else if (behind) {
      // Viser un coin du but adverse, en tir croisé, avec une erreur selon le niveau.
      const cross = p.y < 0.5 ? 1 : -1;
      const err = [0.9, 0.45, 0.12][level] * Math.sin(p.x * 71 + p.y * 53);
      const gx = i === 0 ? W : 0;
      const gy = 0.5 + (cross * 0.55 + err) * cfg.goalHalf;
      let ax = gx - p.x;
      let ay = gy - p.y;
      const an = Math.hypot(ax, ay) || 1;
      ax /= an;
      ay /= an;
      const back = p.r + m.r + 0.03;
      const sx = p.x - ax * back;
      const sy = p.y - ay * back;
      if (Math.hypot(m.x - sx, m.y - sy) < 0.07) {
        // Aligné : frapper à travers le palet.
        tx = p.x + ax * 0.1;
        ty = p.y + ay * 0.1;
      } else {
        // Se placer derrière le palet, dans l'axe du tir.
        tx = sx;
        ty = sy;
      }
    } else {
      // Contourner le palet pour repasser derrière lui.
      tx = p.x - dir * 0.17;
      const sideY = p.y < 0.5 ? 1 : -1;
      ty = p.y + sideY * 0.15;
      if (tx < b.minX || tx > b.maxX) {
        // Palet collé au fond : le pousser de côté.
        tx = p.x;
        ty = p.y;
      }
    }
  } else if (world.puckActive) {
    // Le palet est en face : suivre en y devant le but, avec un peu d'anticipation.
    const lead = level === 2 ? 0.25 : level === 1 ? 0.12 : 0;
    const gh = cfg.goalHalf * 1.1;
    ty = Math.min(0.5 + gh, Math.max(0.5 - gh, p.y + p.vy * lead));
  }

  // Le niveau limite la vitesse de déplacement.
  const maxMove = cfg.aiSpeed[level] * dt;
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dist = Math.hypot(dx, dy);
  if (dist > maxMove) {
    tx = m.x + (dx / dist) * maxMove;
    ty = m.y + (dy / dist) * maxMove;
  }
  return { x: tx, y: ty };
}
