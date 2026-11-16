import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update } from '../src/game.js';
import { setTarget } from '../src/physics.js';
import { aiTarget, createAiState } from '../src/ai.js';
import { netStart, netOutgoing, netIncoming } from '../src/netgame.js';

// Deux téléphones simulés reliés par un canal fiable et ordonné avec du retard.
// Chaque joueur est tenu par l'IA, dans son propre repère (il se voit joueur 0).
function playMatch(latency, seed) {
  let s = seed;
  const realRandom = Math.random;
  Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const games = [createGame(1.42), createGame(1.42)];
  const brains = [createAiState(), createAiState()];
  netStart(games[0], true);
  netStart(games[1], false);
  const wires = [[], []]; // wires[i] = messages en route vers le joueur i
  const dt = 1 / 120;
  let bothOwners = 0;
  let noOwner = 0;
  let worstNoOwner = 0;
  let t = 0;
  for (; t < 600 && !(games[0].state === 'over' && games[1].state === 'over'); t += dt) {
    for (let i = 0; i < 2; i++) {
      const g = games[i];
      while (wires[i].length && wires[i][0].at <= t) netIncoming(g, wires[i].shift().msg);
      const target = aiTarget(g.world, 0, 2, dt, brains[i]);
      setTarget(g.world, 0, target.x, target.y);
      const events = update(g, dt);
      for (const msg of netOutgoing(g, dt, events)) {
        wires[1 - i].push({ at: t + latency, msg: JSON.parse(JSON.stringify(msg)) });
      }
    }
    if (games[0].net.owner && games[1].net.owner) bothOwners++;
    if (!games[0].net.owner && !games[1].net.owner) {
      noOwner += dt;
      worstNoOwner = Math.max(worstNoOwner, noOwner);
    } else noOwner = 0;
  }
  Math.random = realRandom;
  return { games, t, bothOwners, worstNoOwner };
}

for (const latency of [0.02, 0.08, 0.25]) {
  test(`partie à distance complète avec ${latency * 1000} ms de retard`, () => {
    const { games, t, bothOwners, worstNoOwner } = playMatch(latency, 7);
    const [a, b] = games;
    assert.equal(a.state, 'over', `partie finie côté A (${a.scores}) après ${t.toFixed(0)} s`);
    assert.equal(b.state, 'over', `partie finie côté B (${b.scores})`);
    assert.deepEqual(a.scores, [b.scores[1], b.scores[0]], 'les deux téléphones affichent le même score');
    assert.equal(a.winner, 1 - b.winner, 'un gagnant et un perdant');
    assert.equal(Math.max(...a.scores), a.cfg.winScore);
    assert.equal(bothOwners, 0, 'jamais deux téléphones qui calculent le palet en même temps');
    assert.ok(worstNoOwner <= latency + 0.02, `le passage de main dure le temps du trajet (${worstNoOwner.toFixed(3)} s)`);
  });
}

test('un message abîmé est ignoré sans casser la partie', () => {
  const g = createGame(1.42);
  netStart(g, true);
  for (const bad of [null, 42, 'x', {}, { t: 's' }, { t: 'h' }, { t: 'g', s: 3 }, { t: 's', m: 'non' }]) {
    assert.deepEqual(netIncoming(g, bad), []);
  }
  update(g, 1 / 60);
  assert.equal(g.state, 'playing');
  assert.ok(g.net.owner);
});
