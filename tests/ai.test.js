import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './stuck-sim.mjs';

// Régression : le palet restait indéfiniment coincé dans un coin contre le maillet de l'IA.
test('en solo le palet ne reste jamais coincé chez l\'IA', () => {
  for (let level = 0; level < 3; level++) {
    for (let seed = 1; seed <= 3; seed++) {
      const r = simulate(level, 'random', 180, seed);
      assert.ok(r.worst < 6, `niveau ${level}, graine ${seed} : palet resté ${r.worst.toFixed(1)} s chez l'IA`);
    }
  }
});
