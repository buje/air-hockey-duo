import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../air-hockey/src/config.js';
import { createWorld, stepWorld, setTarget, placePuck, malletBounds } from '../air-hockey/src/physics.js';

const A = 1.42;
const H = CONFIG.step;
function world() {
  const w = createWorld(A, CONFIG);
  // Maillets rangés dans les coins pour ne pas gêner.
  for (let i = 0; i < 2; i++) {
    setTarget(w, i, i === 0 ? 0 : A, 0);
    w.mallets[i].x = w.mallets[i].tx;
    w.mallets[i].y = w.mallets[i].ty;
  }
  return w;
}
function run(w, seconds, ev = []) {
  for (let t = 0; t < seconds; t += H) stepWorld(w, H, ev);
  return ev;
}

test('le palet à vitesse maximale rebondit sur le bord du haut sans le traverser', () => {
  const w = world();
  placePuck(w, A / 2, 0.5);
  w.puck.vy = -CONFIG.puckMaxSpeed;
  const ev = run(w, 0.5);
  assert.ok(ev.some((e) => e.type === 'wall'));
  assert.ok(w.puck.y >= w.puck.r - 1e-9 && w.puck.y <= 1 - w.puck.r + 1e-9);
});

test('un tir à côté du but rebondit et ne marque pas', () => {
  const w = world();
  placePuck(w, A / 2, 0.5 + CONFIG.goalHalf + 0.12);
  w.puck.vx = -CONFIG.puckMaxSpeed;
  const ev = run(w, 0.5);
  assert.ok(!ev.some((e) => e.type === 'goal'));
  assert.ok(w.puck.vx > 0);
  assert.ok(w.puck.x >= w.puck.r - 1e-9);
});

test('un tir cadré à gauche donne un seul but au joueur 1', () => {
  const w = world();
  placePuck(w, A / 2, 0.5);
  w.puck.vx = -3;
  const ev = run(w, 2);
  const goals = ev.filter((e) => e.type === 'goal');
  assert.equal(goals.length, 1);
  assert.equal(goals[0].scorer, 1);
  assert.equal(w.puckActive, false);
});

test('un tir cadré à droite donne le but au joueur 0', () => {
  const w = world();
  placePuck(w, A / 2, 0.5);
  w.puck.vx = 3;
  const goals = run(w, 2).filter((e) => e.type === 'goal');
  assert.deepEqual(goals, [{ type: 'goal', scorer: 0 }]);
});

test('le palet à vitesse maximale ne traverse pas un maillet immobile', () => {
  const w = world();
  const m = w.mallets[0];
  setTarget(w, 0, A * 0.25, 0.5);
  m.x = m.tx;
  m.y = m.ty;
  placePuck(w, A * 0.45, 0.5);
  w.puck.vx = -CONFIG.puckMaxSpeed;
  const ev = run(w, 0.3);
  assert.ok(ev.some((e) => e.type === 'hit' && e.player === 0));
  assert.ok(w.puck.vx > 0, 'le palet repart vers la droite');
  assert.ok(w.puck.x > m.x);
});

test('un maillet lancé à fond transmet sa vitesse au palet', () => {
  const w = world();
  const m = w.mallets[0];
  m.x = m.tx = 0.2;
  m.y = m.ty = 0.5;
  placePuck(w, 0.45, 0.5);
  setTarget(w, 0, A, 0.5);
  run(w, 0.2);
  assert.ok(w.puck.vx > 2);
});

test('un maillet ne franchit jamais le filet ni les bords', () => {
  const w = world();
  setTarget(w, 0, A * 2, -5);
  setTarget(w, 1, -A, 5);
  run(w, 1);
  for (let i = 0; i < 2; i++) {
    const b = malletBounds(w, i);
    const m = w.mallets[i];
    assert.ok(m.x >= b.minX - 1e-9 && m.x <= b.maxX + 1e-9);
    assert.ok(m.y >= b.minY - 1e-9 && m.y <= b.maxY + 1e-9);
  }
  assert.ok(w.mallets[0].x + w.mallets[0].r < A / 2);
  assert.ok(w.mallets[1].x - w.mallets[1].r > A / 2);
});

test('30 secondes de jeu chaotique : rien ne sort, rien ne se chevauche, aucun NaN', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const w = createWorld(A, CONFIG);
  placePuck(w, A / 2 + 0.1, 0.4);
  let steps = 0;
  for (let t = 0; t < 30; t += H, steps++) {
    if (steps % 12 === 0) {
      // Doigts qui sautent n'importe où, y compris hors de la table.
      setTarget(w, 0, rnd() * A * 1.2 - 0.1, rnd() * 1.2 - 0.1);
      setTarget(w, 1, rnd() * A * 1.2 - 0.1, rnd() * 1.2 - 0.1);
    }
    const ev = [];
    stepWorld(w, H, ev);
    const p = w.puck;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy));
    if (ev.some((e) => e.type === 'goal')) {
      placePuck(w, A / 2 + (rnd() - 0.5) * 0.4, 0.2 + rnd() * 0.6);
      continue;
    }
    assert.ok(p.y >= p.r - 1e-9 && p.y <= 1 - p.r + 1e-9, 'palet dans la table en y');
    assert.ok(p.x >= -p.r - 1e-9 && p.x <= A + p.r + 1e-9, 'palet dans la table en x');
    if (Math.abs(p.y - 0.5) >= CONFIG.goalHalf) {
      assert.ok(p.x >= p.r - 1e-9 && p.x <= A - p.r + 1e-9, 'palet pas dans le mur à côté du but');
    }
    assert.ok(Math.hypot(p.vx, p.vy) <= CONFIG.puckMaxSpeed + 1e-9);
    for (const m of w.mallets) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      assert.ok(d >= (p.r + m.r) * 0.5, 'palet jamais au cœur d\'un maillet');
    }
  }
});
