import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../air-hockey/src/config.js';
import { createGame, startMatch, update, pause, resume, setPlayerTarget, setAspect } from '../air-hockey/src/game.js';

const A = 1.42;

function shootLeft(game) {
  const p = game.world.puck;
  p.x = 0.3;
  p.y = 0.5;
  p.vx = -4;
  p.vy = 0;
  // Maillet du joueur 0 hors du chemin.
  game.world.mallets[0].x = game.world.mallets[0].tx = 0.2;
  game.world.mallets[0].y = game.world.mallets[0].ty = 0.1;
}

test('un but compte une seule fois puis le palet est remis au joueur qui a encaissé', () => {
  const g = createGame(A);
  startMatch(g, 'duel');
  shootLeft(g);
  const seen = [];
  for (let i = 0; i < 60; i++) seen.push(...update(g, 1 / 60).map((e) => e.type));
  assert.equal(seen.filter((t) => t === 'score').length, 1);
  assert.deepEqual(g.scores, [0, 1]);
  assert.equal(g.state, 'goal');
  for (let i = 0; i < 120; i++) update(g, 1 / 60);
  assert.equal(g.state, 'playing');
  assert.ok(g.world.puckActive);
  assert.ok(g.world.puck.x < A / 2, 'remise en jeu côté joueur 0');
});

test('la partie se termine à 7 et désigne le gagnant', () => {
  const g = createGame(A);
  startMatch(g, 'duel');
  let wins = 0;
  for (let n = 0; n < 2000 && g.state !== 'over'; n++) {
    if (g.state === 'playing' && g.world.puck.vx === 0) shootLeft(g);
    wins += update(g, 1 / 60).filter((e) => e.type === 'win').length;
  }
  assert.equal(g.state, 'over');
  assert.equal(g.winner, 1);
  assert.equal(g.scores[1], CONFIG.winScore);
  assert.equal(wins, 1);
});

test('en pause rien ne bouge, puis la partie reprend', () => {
  const g = createGame(A);
  startMatch(g, 'duel');
  g.world.puck.vx = 1;
  update(g, 1 / 60);
  const x = g.world.puck.x;
  pause(g);
  for (let i = 0; i < 30; i++) update(g, 1 / 60);
  assert.equal(g.world.puck.x, x);
  resume(g);
  update(g, 1 / 60);
  assert.notEqual(g.world.puck.x, x);
});

test('en solo le joueur ne peut pas piloter le maillet de l\'IA', () => {
  const g = createGame(A);
  startMatch(g, 'solo', 1);
  const before = g.world.mallets[1].tx;
  setPlayerTarget(g, 1, A - 0.1, 0.9);
  assert.equal(g.world.mallets[1].tx, before);
});

test('une partie IA contre IA va au bout sans erreur', () => {
  const g = createGame(A);
  startMatch(g, 'demo', 2);
  let t = 0;
  while (g.state !== 'over' && t < 1800) {
    update(g, 1 / 60);
    t += 1 / 60;
  }
  assert.equal(g.state, 'over', `partie finie (score ${g.scores}) en ${t.toFixed(0)} s`);
});

test('changer la forme de la table garde tout le monde dedans', () => {
  const g = createGame(A);
  startMatch(g, 'duel');
  setAspect(g, 2.1);
  assert.equal(g.world.W, 2.1);
  assert.ok(g.world.mallets[1].x > 2.1 / 2);
  setAspect(g, 1.3);
  assert.ok(g.world.mallets[1].x < 1.3 && g.world.puck.x < 1.3);
});
