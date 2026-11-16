import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../flipper/src/config.js';
import { buildTable } from '../flipper/src/table.js';
import { createWorld, stepWorld } from '../flipper/src/physics.js';
import { createGame, startGame, launch, setFlipper, update, autoPlay, setShape } from '../flipper/src/game.js';

const H = 1.42;
const DT = CONFIG.step;

function seeded(seed) {
  let s = seed;
  const real = Math.random;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return () => (Math.random = real);
}

test('la bille tombe plus vite sur la moitié debout que sur la moitié posée', () => {
  const fall = (y, folded) => {
    const w = createWorld(buildTable(H, CONFIG), CONFIG);
    w.folded = folded;
    Object.assign(w.ball, { x: 0.5, y, vx: 0, vy: 0, active: true });
    for (let i = 0; i < 48; i++) stepWorld(w, DT, []);
    return w.ball.vy;
  };
  const wall = fall(0.45, true);
  const flat = fall(0.8, true);
  assert.ok(wall > flat * 1.8, `debout ${wall.toFixed(2)} contre à plat ${flat.toFixed(2)}`);
  assert.ok(Math.abs(fall(0.45, false) - fall(0.8, false)) < 1e-9, 'à plat : même gravité partout');
});

test('un coup de batteur renvoie la bille jusque sur la moitié debout', () => {
  const g = createGame(H);
  startGame(g);
  const b = g.world.ball;
  Object.assign(b, { x: 0.34, y: H - 0.33, vx: 0, vy: 0.5, active: true });
  g.state = 'playing';
  setFlipper(g, 'left', true);
  let top = b.y;
  const seen = [];
  for (let i = 0; i < 240; i++) {
    seen.push(...update(g, 1 / 120).map((e) => e.type));
    top = Math.min(top, b.y);
  }
  assert.ok(seen.includes('flipper'));
  assert.ok(top < g.world.table.foldY, `la bille est montée jusqu'à y=${top.toFixed(2)}`);
  assert.ok(seen.includes('fold'));
});

test('une bille perdue après le temps de grâce coûte une bille, la troisième finit la partie', () => {
  const g = createGame(H);
  startGame(g);
  for (let n = 3; n > 0; n--) {
    assert.equal(g.balls, n);
    launch(g);
    g.sinceLaunch = 99;
    Object.assign(g.world.ball, { x: 0.5, y: H - 0.05, vx: 0, vy: 1 });
    for (let i = 0; i < 120 && g.state === 'playing'; i++) update(g, 1 / 120);
  }
  assert.equal(g.state, 'over');
  assert.equal(g.balls, 0);
});

test('une bille perdue tout de suite est rendue', () => {
  const g = createGame(H);
  startGame(g);
  launch(g);
  Object.assign(g.world.ball, { x: 0.5, y: H - 0.05, vx: 0, vy: 1 });
  const seen = [];
  for (let i = 0; i < 120 && g.state === 'playing'; i++) seen.push(...update(g, 1 / 120).map((e) => e.type));
  assert.ok(seen.includes('saved'));
  assert.equal(g.balls, 3);
  assert.equal(g.state, 'ready');
});

test('les quatre cibles allumées donnent le bonus et augmentent le multiplicateur', () => {
  const g = createGame(H);
  startGame(g);
  launch(g);
  const seen = [];
  for (const t of g.world.table.targets) {
    Object.assign(g.world.ball, { x: t.x, y: t.y + 0.1, vx: 0, vy: -2, active: true });
    for (let i = 0; i < 30; i++) seen.push(...update(g, 1 / 120).map((e) => e.type));
  }
  assert.ok(seen.includes('bonus'));
  assert.equal(g.multiplier, 2);
  assert.ok(g.score >= 4 * CONFIG.points.target + CONFIG.points.allTargets);
  assert.ok(CONFIG.maxMultiplier >= 2);
});

for (const shape of [1.3, 1.42, 2.16]) {
  test(`10 minutes de jeu automatique sur un écran ${shape} : la bille ne sort que par le bas`, () => {
    const restore = seeded(11);
    const g = createGame(shape);
    startGame(g);
    const t = g.world.table;
    let games = 0;
    let best = 0;
    let flips = 0;
    for (let i = 0; i < 600 * 120; i++) {
      // Le joueur automatique joue 20 s, lâche tout 8 s (la bille finit par tomber),
      // et par moments tape n'importe comment.
      const phase = i % (28 * 120);
      if (phase < 20 * 120) autoPlay(g);
      else {
        if (g.state === 'ready') launch(g);
        setFlipper(g, 'left', false);
        setFlipper(g, 'right', false);
      }
      if (i % 700 < 40) setFlipper(g, i % 2 ? 'left' : 'right', i % 3 === 0);
      for (const e of update(g, 1 / 120)) if (e.type === 'flipper') flips++;
      const b = g.world.ball;
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy));
      if (b.active) {
        assert.ok(b.x > t.left - 0.01 && b.x < t.right + 0.01, `bille sortie sur le côté : x=${b.x}`);
        assert.ok(b.y > 0, `bille sortie par le haut : y=${b.y}`);
        assert.ok(Math.hypot(b.vx, b.vy) <= CONFIG.maxSpeed + 1e-9);
      }
      if (g.state === 'over') {
        games++;
        best = Math.max(best, g.score);
        startGame(g);
      }
    }
    restore();
    assert.ok(games >= 1, 'au moins une partie complète');
    assert.ok(flips > 20, `les batteurs touchent la bille (${flips} fois)`);
    assert.ok(best > 1000, `on marque des points (meilleur score ${best})`);
  });
}

test('changer de forme d\'écran en cours de partie garde la bille dans le plateau', () => {
  const g = createGame(1.42);
  startGame(g);
  launch(g);
  for (let i = 0; i < 60; i++) update(g, 1 / 120);
  setShape(g, 2.1);
  assert.equal(g.world.table.H, 2.1);
  assert.ok(g.world.ball.y < 2.1 && g.world.ball.active);
});
