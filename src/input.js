// Doigts et souris vers les maillets. Un doigt par joueur.
import { screenToTable } from './display.js';
import { setPlayerTarget } from './game.js';

// ctx = { game, layout: () => L }
export function attachInput(el, ctx) {
  const owners = new Map(); // pointerId -> joueur
  const busy = [false, false];

  function playerFor(t) {
    const g = ctx.game;
    if (g.mode === 'solo' || g.mode === 'net') return 0; // tout l'écran pilote le maillet du joueur
    return t.x < g.world.W / 2 ? 0 : 1;
  }

  function aim(player, e) {
    const t = screenToTable(ctx.layout(), e.clientX, e.clientY);
    setPlayerTarget(ctx.game, player, t.x, t.y);
  }

  el.addEventListener('pointerdown', (e) => {
    if (ctx.game.state !== 'playing' && ctx.game.state !== 'goal') return;
    const t = screenToTable(ctx.layout(), e.clientX, e.clientY);
    const player = playerFor(t);
    if (busy[player]) return;
    busy[player] = true;
    owners.set(e.pointerId, player);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture indisponible : sans conséquence */
    }
    aim(player, e);
  });

  el.addEventListener('pointermove', (e) => {
    if (owners.has(e.pointerId)) {
      aim(owners.get(e.pointerId), e);
    } else if (e.pointerType === 'mouse' && (ctx.game.mode === 'solo' || ctx.game.mode === 'net') && ctx.game.state !== 'over') {
      aim(0, e); // à la souris, le maillet suit le curseur sans cliquer
    }
  });

  function release(e) {
    if (!owners.has(e.pointerId)) return;
    const player = owners.get(e.pointerId);
    owners.delete(e.pointerId);
    busy[player] = false;
    // Le maillet s'arrête où il est au lieu de finir sa course vers le dernier point.
    const m = ctx.game.world.mallets[player];
    m.tx = m.x;
    m.ty = m.y;
  }
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // Bloque zoom, défilement, sélection et menus contextuels pendant le jeu.
  const stop = (e) => e.preventDefault();
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) {
    document.addEventListener(type, (e) => {
      if (e.target.closest && e.target.closest('button, a, input')) return;
      stop(e);
    }, { passive: false });
  }
}
