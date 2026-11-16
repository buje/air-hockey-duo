// Mesure combien de temps le palet reste dans le camp de l'IA en mode solo,
// avec un joueur humain simulé (immobile, ou qui renvoie le palet au hasard).
// Usage : node tests/stuck-sim.mjs
import { createGame, startMatch, update, setPlayerTarget } from '../air-hockey/src/game.js';

export function simulate(level, human, seconds = 240, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const realRandom = Math.random;
  Math.random = rnd;
  const g = createGame(1.42);
  startMatch(g, 'solo', level);
  let inHalf = 0;
  let worst = 0;
  let over3 = 0;
  let pinned = 0;
  let worstPinned = 0;
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    const w = g.world;
    const p = w.puck;
    if (human === 'random' && Math.round(t / dt) % 20 === 0) {
      // Un joueur brouillon : il fonce vers le palet quand il est chez lui, sinon il bouge au hasard.
      if (p.x < w.W / 2) setPlayerTarget(g, 0, p.x + (rnd() - 0.3) * 0.2, p.y + (rnd() - 0.5) * 0.2);
      else setPlayerTarget(g, 0, 0.1 + rnd() * 0.4, 0.2 + rnd() * 0.6);
    }
    update(g, dt);
    if (g.state === 'over') startMatch(g, 'solo', level);
    const m = w.mallets[1];
    if (w.puckActive && p.x > w.W / 2) {
      inHalf += dt;
      if (inHalf > worst) worst = inHalf;
      if (Math.abs(inHalf - 3) < dt / 2) over3++;
    } else inHalf = 0;
    const touching = w.puckActive && Math.hypot(p.x - m.x, p.y - m.y) < p.r + m.r + 0.01;
    if (touching && Math.hypot(p.vx, p.vy) < 0.6) {
      pinned += dt;
      if (pinned > worstPinned) worstPinned = pinned;
    } else pinned = 0;
  }
  Math.random = realRandom;
  return { worst, over3, worstPinned };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const human of ['idle', 'random']) {
    for (let level = 0; level < 3; level++) {
      let worst = 0, over3 = 0, wp = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const r = simulate(level, human, 240, seed);
        worst = Math.max(worst, r.worst); over3 += r.over3; wp = Math.max(wp, r.worstPinned);
      }
      console.log(`${human} niveau ${level} : pire séjour chez l'IA ${worst.toFixed(1)} s, séjours > 3 s : ${over3}, pire collage au maillet ${wp.toFixed(1)} s`);
    }
  }
}
