// Point d'entrée du flipper : relie la partie, l'affichage, les commandes et les écrans.
import { CONFIG } from './config.js';
import { BUILD } from './version.js';
import { computeView, decide, readPosture, watchPosture } from './view.js';
import { createGame, startGame, launch, setFlipper, update, setShape } from './game.js';
import { createRenderer } from './renderer.js';
import * as sound from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const panels = { menu: $('panel-menu'), gate: $('panel-gate'), pause: $('panel-pause'), over: $('panel-over') };
const hud = $('hud');
const BEST_KEY = 'flipper.best';

function show(name) {
  for (const key in panels) panels[key].hidden = key !== name;
}

function readInsets() {
  const cs = getComputedStyle($('safe-probe'));
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* stockage indisponible : le record ne sera pas gardé */
  }
}

const fmt = (n) => n.toLocaleString('fr-FR');
const pixelScale = () => Math.min(window.devicePixelRatio || 1, 2);

const renderer = createRenderer(canvas);
let view = computeView(window.innerWidth, window.innerHeight, readInsets());
const game = createGame(view.H, CONFIG);

let playing = false; // une vraie partie est en cours (sinon c'est la démo derrière le menu)
let paused = false;
let bypass = false; // « Jouer quand même » malgré la posture
let gate = null;
let best = loadBest();

const GATES = {
  cover: ['Ouvre-moi', 'Ouvre ton iPhone puis plie-le comme un ordinateur portable'],
  flat: ['Plie-moi', 'Relève la moitié du haut, comme un écran d\'ordinateur portable'],
  rotate: ['Tourne-moi', 'Pose le téléphone avec la charnière à l\'horizontale'],
};

function updateHud() {
  $('score').textContent = fmt(game.score);
  $('hud-balls').textContent = ' ' + '●'.repeat(Math.max(0, game.balls));
  $('hud-mult').textContent = game.multiplier > 1 ? `×${game.multiplier}` : '';
}

function placeHud() {
  const s = view.scale;
  const set = (el, x, y, right) => {
    el.style.top = view.y + y * s + 'px';
    if (right) el.style.right = view.vw - (view.x + x * s) + 'px';
    else el.style.left = view.x + x * s + 'px';
  };
  // Les coins du haut sont libres : la voûte du plateau est arrondie.
  set($('hud-score'), 0.02, 0.012, false);
  set($('hud-right'), 0.98, 0.012, true);
  const p = $('btn-pause');
  p.style.left = view.x + 0.5 * s + 'px';
  p.style.top = view.y + (game.world.table.H - 0.05) * s + 'px';
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

function updateDiag() {
  const posture = readPosture() ?? 'inconnue';
  $('diag').textContent =
    `Mis à jour le ${BUILD} · ${view.vw}×${view.vh} @${window.devicePixelRatio}x · posture ${posture} · gravité ${game.world.folded ? 'pliée' : 'à plat'} · audio ${sound.audioState()}`;
  $('best').textContent = best > 0 ? `Record ${fmt(best)}` : '';
}

function goMenu() {
  playing = false;
  paused = false;
  startGame(game, true);
  hud.hidden = true;
  show('menu');
  updateDiag();
}

function beginGame() {
  playing = true;
  paused = false;
  startGame(game, false);
  show(null);
  hud.hidden = false;
  updateHud();
  placeHud();
  toast('Touche pour lancer');
}

// Recalcule tout ce qui dépend de l'écran et de la posture du téléphone.
function refresh() {
  view = computeView(window.innerWidth, window.innerHeight, readInsets());
  setShape(game, view.H);
  const d = decide(view.vw, view.vh, readPosture(), bypass);
  game.world.folded = d.folded;
  renderer.resize(view, pixelScale());
  placeHud();
  updateDiag();

  const before = gate;
  gate = d.gate;
  if (gate) {
    // Mauvaise posture : le plateau s'éteint et la partie attend.
    $('gate-title').textContent = GATES[gate][0];
    $('gate-text').textContent = GATES[gate][1];
    show('gate');
    hud.hidden = true;
    renderer.power(false);
  } else if (before) {
    // Le téléphone vient d'être plié : le plateau s'allume.
    renderer.power(true);
    if (playing && game.state !== 'over') {
      hud.hidden = false;
      show(paused ? 'pause' : null);
    } else if (playing) {
      show('over');
    } else {
      show('menu');
    }
  }
}

function showOver() {
  const record = game.score > best;
  if (record) {
    best = game.score;
    saveBest(best);
  }
  $('over-score').textContent = fmt(game.score);
  $('over-best').textContent = record ? 'Nouveau record !' : `Record ${fmt(best)}`;
  show('over');
}

// Commandes : moitié gauche de l'écran = batteur gauche, moitié droite = batteur droit.
const touches = new Map(); // pointerId -> côté
function press(side) {
  if (!playing || paused || gate) return;
  if (game.state === 'ready') launch(game);
  setFlipper(game, side, true);
}
function releaseSide(side) {
  if ([...touches.values()].includes(side)) return; // un autre doigt tient encore ce batteur
  if (playing) setFlipper(game, side, false);
}
canvas.addEventListener('pointerdown', (e) => {
  const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
  touches.set(e.pointerId, side);
  press(side);
});
function pointerEnd(e) {
  const side = touches.get(e.pointerId);
  if (!side) return;
  touches.delete(e.pointerId);
  releaseSide(side);
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

const KEYS = { ArrowLeft: 'left', KeyQ: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyM: 'right' };
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    if (playing && !paused && !gate) launch(game);
  } else if (KEYS[e.code]) press(KEYS[e.code]);
});
document.addEventListener('keyup', (e) => {
  if (KEYS[e.code] && playing) setFlipper(game, KEYS[e.code], false);
});

// Bloque zoom, défilement et menus contextuels pendant le jeu.
for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => {
    if (e.target.closest && e.target.closest('button, a, input')) return;
    e.preventDefault();
  }, { passive: false });
}

// Le son ne peut démarrer qu'après un geste : on le débloque au premier toucher.
for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click', 'keydown']) {
  document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) sound.play({ type: 'ui' });
});
function updateSoundButton() {
  $('btn-sound').textContent = sound.isEnabled() ? 'Son activé' : 'Son coupé';
}
$('btn-sound').addEventListener('click', () => {
  sound.setEnabled(!sound.isEnabled());
  updateSoundButton();
});
updateSoundButton();

function userPause() {
  if (!playing || paused || game.state === 'over') return;
  paused = true;
  if (!gate) show('pause');
}
$('btn-play').addEventListener('click', beginGame);
$('btn-again').addEventListener('click', beginGame);
$('btn-menu').addEventListener('click', goMenu);
$('btn-quit').addEventListener('click', goMenu);
$('btn-pause').addEventListener('click', userPause);
$('btn-resume').addEventListener('click', () => {
  paused = false;
  show(null);
});
$('btn-bypass').addEventListener('click', () => {
  bypass = true;
  refresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) userPause();
});
window.addEventListener('resize', refresh);
window.visualViewport?.addEventListener('resize', refresh);
watchPosture(refresh);

const TOASTS = { saved: 'Bille sauvée', bonus: 'Bonus cibles' };
let overTimer = 0;
function handleEvents(events) {
  for (const ev of events) {
    renderer.onEvent(ev, game);
    if (!playing) continue; // la démo derrière le menu reste silencieuse
    sound.play(ev);
    if (TOASTS[ev.type]) toast(ev.type === 'bonus' ? `Bonus cibles ×${ev.multiplier}` : TOASTS[ev.type]);
    if (ev.type === 'drain' && game.state === 'ready') toast('Touche pour lancer');
    if (ev.type === 'gameover') overTimer = 1.2;
  }
}

let last = performance.now();
let time = 0;
let shownScore = -1;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (!paused && !gate) handleEvents(update(game, dt));
  if (!playing && game.state === 'over') startGame(game, true); // la démo recommence toute seule
  if (playing && game.score !== shownScore) {
    shownScore = game.score;
    updateHud();
  }
  if (overTimer > 0) {
    overTimer -= dt;
    if (overTimer <= 0 && playing && game.state === 'over') showOver();
  }

  renderer.render(game, view, time, dt);
  requestAnimationFrame(frame);
}

goMenu();
renderer.power(true);
refresh();
if (gate) renderer.power(false);
setInterval(() => {
  if (!panels.menu.hidden) updateDiag();
}, 1000);
requestAnimationFrame(frame);

// Accès pour les tests automatiques et le diagnostic depuis la console.
window.__flipper = { game, getView: () => view, getGate: () => gate, beginGame, sound };
