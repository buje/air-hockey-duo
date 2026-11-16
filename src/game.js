// Règles et déroulé d'une partie. Pur : ne connaît ni l'écran ni WebGL.
import { CONFIG } from './config.js';
import { createWorld, stepWorld, setTarget, placePuck } from './physics.js';
import { aiTarget } from './ai.js';

// États : 'menu' | 'playing' | 'goal' | 'over' | 'paused'
export function createGame(aspect, cfg = CONFIG) {
  return {
    cfg,
    world: createWorld(aspect, cfg),
    state: 'menu',
    resumeState: 'playing',
    mode: 'duel', // 'duel' | 'solo' | 'demo' (IA contre IA)
    level: 1,
    scores: [0, 0],
    winner: -1,
    timer: 0,
    acc: 0,
    stuck: 0,
    lastConceder: 0,
    events: [],
  };
}

function serve(game, toPlayer) {
  const { W } = game.world;
  placePuck(game.world, toPlayer === 0 ? W * 0.3 : W * 0.7, 0.5);
  game.stuck = 0;
  game.events.push({ type: 'serve', player: toPlayer });
}

export function startMatch(game, mode, level = 1) {
  game.mode = mode;
  game.level = level;
  game.scores = [0, 0];
  game.winner = -1;
  game.acc = 0;
  const { W } = game.world;
  for (let i = 0; i < 2; i++) {
    const m = game.world.mallets[i];
    m.x = m.tx = i === 0 ? W * 0.18 : W * 0.82;
    m.y = m.ty = 0.5;
    m.vx = m.vy = 0;
  }
  game.state = 'playing';
  serve(game, Math.random() < 0.5 ? 0 : 1);
}

export function toMenu(game) {
  game.state = 'menu';
  game.world.puckActive = false;
}

export function pause(game) {
  if (game.state === 'playing' || game.state === 'goal') {
    game.resumeState = game.state;
    game.state = 'paused';
  }
}

export function resume(game) {
  if (game.state === 'paused') {
    game.state = game.resumeState;
    game.acc = 0;
  }
}

// Le joueur `i` vise le point (x, y). Ignoré pour un maillet piloté par l'IA.
export function setPlayerTarget(game, i, x, y) {
  if (game.mode === 'demo') return;
  if (game.mode === 'solo' && i === 1) return;
  setTarget(game.world, i, x, y);
}

// Garde les positions proportionnelles quand la table change de forme.
export function setAspect(game, aspect) {
  const w = game.world;
  if (Math.abs(w.W - aspect) < 1e-6) return;
  const k = aspect / w.W;
  w.puck.x *= k;
  for (const m of w.mallets) {
    m.x *= k;
    m.tx *= k;
  }
  w.W = aspect;
  for (let i = 0; i < 2; i++) setTarget(w, i, w.mallets[i].tx, w.mallets[i].ty);
}

function fixedStep(game, dt) {
  const w = game.world;
  const ev = game.events;
  if (game.mode === 'solo' || game.mode === 'demo') {
    const t = aiTarget(w, 1, game.level, dt);
    setTarget(w, 1, t.x, t.y);
  }
  if (game.mode === 'demo') {
    const t = aiTarget(w, 0, game.level, dt);
    setTarget(w, 0, t.x, t.y);
  }
  const before = ev.length;
  stepWorld(w, dt, ev);

  if (game.state === 'playing') {
    for (let k = before; k < ev.length; k++) {
      if (ev[k].type !== 'goal') continue;
      const scorer = ev[k].scorer;
      game.scores[scorer]++;
      game.lastConceder = 1 - scorer;
      ev.push({ type: 'score', scorer, scores: game.scores.slice() });
      if (game.scores[scorer] >= game.cfg.winScore) {
        game.winner = scorer;
        game.state = 'over';
        ev.push({ type: 'win', winner: scorer });
      } else {
        game.state = 'goal';
        game.timer = game.cfg.goalPause;
      }
      return;
    }
    // Palet immobile sur le filet, hors de portée des deux maillets : on le relance.
    const p = w.puck;
    const onNet = Math.abs(p.x - w.W / 2) < p.r;
    if (onNet && Math.hypot(p.vx, p.vy) < game.cfg.stuckSpeed) {
      game.stuck += dt;
      if (game.stuck > game.cfg.stuckTime) {
        p.vx = (Math.random() < 0.5 ? -1 : 1) * 0.5;
        p.vy = (Math.random() - 0.5) * 0.4;
        game.stuck = 0;
      }
    } else {
      game.stuck = 0;
    }
  } else if (game.state === 'goal') {
    game.timer -= dt;
    if (game.timer <= 0) {
      game.state = 'playing';
      serve(game, game.lastConceder);
    }
  }
}

// Avance la partie de `dt` secondes réelles. Renvoie les événements survenus.
export function update(game, dt) {
  game.events.length = 0;
  if (game.state === 'paused') return game.events;
  const h = game.cfg.step;
  game.acc += Math.min(dt, 0.1);
  while (game.acc >= h) {
    fixedStep(game, h);
    game.acc -= h;
  }
  return game.events;
}
