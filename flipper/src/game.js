// Règles du flipper : billes, score, cibles, bille sauvée. Pur.
import { CONFIG } from './config.js';
import { buildTable } from './table.js';
import { createWorld, stepWorld } from './physics.js';

// États : 'menu' | 'ready' (bille en attente de lancement) | 'playing' | 'over'
export function createGame(H, cfg = CONFIG) {
  const table = buildTable(H, cfg);
  return {
    cfg,
    world: createWorld(table, cfg),
    state: 'menu',
    demo: false,
    score: 0,
    balls: cfg.balls,
    multiplier: 1,
    lit: table.targets.map(() => false),
    sinceLaunch: 0,
    acc: 0,
    events: [],
  };
}

// Reconstruit le plateau pour une nouvelle forme d'écran, sans toucher au score.
export function setShape(game, H) {
  if (Math.abs(game.world.table.H - H) < 1e-6) return;
  const old = game.world;
  const k = H / old.table.H;
  game.world = createWorld(buildTable(H, game.cfg), game.cfg);
  game.world.folded = old.folded;
  Object.assign(game.world.ball, old.ball, { y: old.ball.y * k });
  game.world.flippers.forEach((f, i) => {
    f.pressed = old.flippers[i].pressed;
  });
}

function placeBall(game) {
  const { table, ball } = game.world;
  ball.x = table.launch.x;
  ball.y = table.launch.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.active = false;
  game.state = 'ready';
}

export function startGame(game, demo = false) {
  game.demo = demo;
  game.score = 0;
  game.balls = game.cfg.balls;
  game.multiplier = 1;
  game.lit.fill(false);
  game.acc = 0;
  placeBall(game);
}

// Lâche la bille en attente sous la voûte, d'un côté ou de l'autre.
export function launch(game) {
  if (game.state !== 'ready') return;
  const ball = game.world.ball;
  const dir = Math.random() < 0.5 ? -1 : 1;
  ball.vx = dir * (0.5 + Math.random() * 0.9);
  ball.vy = 0.1;
  ball.active = true;
  game.sinceLaunch = 0;
  game.state = 'playing';
  game.events.push({ type: 'launch' });
}

export function setFlipper(game, side, pressed) {
  for (const f of game.world.flippers) {
    if (f.side !== side) continue;
    if (pressed && !f.pressed) game.events.push({ type: 'flip', side });
    f.pressed = pressed;
  }
}

// Joueur automatique : lève un batteur quand la bille arrive dessus. Sert à la démo et aux tests.
export function autoPlay(game) {
  const b = game.world.ball;
  if (game.state === 'ready') launch(game);
  for (const f of game.world.flippers) {
    const mid = f.side === 'left' ? f.px + f.len * 0.55 : f.px - f.len * 0.55;
    const near = b.active && b.y > f.py - 0.1 && b.y < f.py + 0.12 && Math.abs(b.x - mid) < f.len * 0.6;
    setFlipper(game, f.side, near);
  }
}

function add(game, points) {
  game.score += points * game.multiplier;
}

function fixedStep(game, dt) {
  const ev = game.events;
  const before = ev.length;
  stepWorld(game.world, dt, ev);
  if (game.state !== 'playing') return;
  game.sinceLaunch += dt;
  const pts = game.cfg.points;
  for (let k = before; k < ev.length; k++) {
    const e = ev[k];
    if (e.type === 'bumper') add(game, e.kind === 'kicker' ? pts.kicker : pts.bumper);
    else if (e.type === 'fold' && e.up) add(game, pts.fold);
    else if (e.type === 'target') {
      if (!game.lit[e.index]) {
        game.lit[e.index] = true;
        add(game, pts.target);
        if (game.lit.every(Boolean)) {
          add(game, pts.allTargets);
          game.multiplier = Math.min(game.multiplier + 1, game.cfg.maxMultiplier);
          game.lit.fill(false);
          ev.push({ type: 'bonus', multiplier: game.multiplier });
        }
      }
    } else if (e.type === 'drain') {
      if (game.sinceLaunch < game.cfg.saveTime) {
        ev.push({ type: 'saved' });
        placeBall(game);
      } else {
        game.balls--;
        if (game.balls <= 0) {
          game.state = 'over';
          ev.push({ type: 'gameover', score: game.score });
        } else {
          placeBall(game);
        }
      }
      return;
    }
  }
}

// Avance la partie de `dt` secondes réelles. Renvoie les événements survenus.
// (Les événements ajoutés entre deux appels, par launch ou setFlipper, sont conservés.)
export function update(game, dt) {
  const h = game.cfg.step;
  if (game.demo) autoPlay(game);
  game.acc += Math.min(dt, 0.1);
  while (game.acc >= h) {
    fixedStep(game, h);
    game.acc -= h;
  }
  const out = game.events.slice();
  game.events.length = 0;
  return out;
}
