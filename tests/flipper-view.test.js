import test from 'node:test';
import assert from 'node:assert/strict';
import { computeView, decide } from '../flipper/src/view.js';

test('le pli tombe à mi-hauteur du plateau, au centre de l\'écran', () => {
  for (const [w, h] of [[626, 890], [390, 844], [1440, 800], [466, 678]]) {
    const V = computeView(w, h, { top: 47, right: 0, bottom: 21, left: 0 });
    assert.ok(Math.abs(V.y + (V.H / 2) * V.scale - h / 2) < 1e-6, `${w}x${h}`);
    assert.ok(V.x >= 0 && V.y >= 0 && V.x + V.scale <= w + 1e-6 && V.y + V.H * V.scale <= h + 1e-6);
    assert.ok(V.H >= 1.3 && V.H <= 2.2);
  }
});

test('posture : plié on joue, à plat on demande de plier, fermé on demande d\'ouvrir', () => {
  assert.deepEqual(decide(626, 890, 'folded', false), { gate: null, folded: true });
  assert.deepEqual(decide(626, 890, 'continuous', false), { gate: 'flat', folded: false });
  assert.deepEqual(decide(890, 626, 'folded', false), { gate: 'rotate', folded: true });
  assert.deepEqual(decide(466, 678, 'continuous', false), { gate: 'cover', folded: false });
});

test('sans information de posture : Duo ouvert en hauteur supposé plié, autre téléphone à plat', () => {
  assert.deepEqual(decide(626, 890, null, false), { gate: null, folded: true });
  assert.deepEqual(decide(390, 844, null, false), { gate: null, folded: false });
  assert.deepEqual(decide(390, 844, 'continuous', false), { gate: null, folded: false });
});

test('« Jouer quand même » lève le blocage sans mentir sur la gravité', () => {
  assert.deepEqual(decide(626, 890, 'continuous', true), { gate: null, folded: false });
  assert.deepEqual(decide(466, 678, null, true), { gate: null, folded: false });
});
