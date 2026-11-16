import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, computeLayout, screenToTable, tableToScreen } from '../src/display.js';

test('classement des écrans', () => {
  assert.equal(classify(466, 678), 'cover');
  assert.equal(classify(890, 626), 'open');
  assert.equal(classify(626, 890), 'open');
  assert.equal(classify(844, 390), 'other');
  assert.equal(classify(1440, 800), 'other');
});

test('le filet tombe au centre de l\'écran même avec des zones sûres inégales', () => {
  const L = computeLayout(890, 626, { top: 0, right: 0, bottom: 21, left: 44 });
  const net = tableToScreen(L, L.aspect / 2, 0.5);
  assert.ok(Math.abs(net.x - 445) < 1e-6);
  assert.ok(Math.abs(net.y - 313) < 1e-6);
  assert.equal(L.rot, false);
});

test('aller-retour écran / table, à plat et tourné', () => {
  for (const [w, h] of [[890, 626], [626, 890], [390, 844], [1440, 800]]) {
    const L = computeLayout(w, h);
    const t = screenToTable(L, w * 0.3, h * 0.7);
    const s = tableToScreen(L, t.x, t.y);
    assert.ok(Math.abs(s.x - w * 0.3) < 1e-6 && Math.abs(s.y - h * 0.7) < 1e-6);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= w + 1e-6 && L.y + L.h <= h + 1e-6);
    assert.ok(L.aspect >= 1.25 && L.aspect <= 2.3);
  }
});

test('écran tourné : le joueur 0 est en bas', () => {
  const L = computeLayout(390, 844);
  assert.equal(L.rot, true);
  const p0 = tableToScreen(L, 0.1, 0.5);
  const p1 = tableToScreen(L, L.aspect - 0.1, 0.5);
  assert.ok(p0.y > p1.y);
});
