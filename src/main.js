// Point d'entrée : relie la partie, l'affichage, le tactile et les écrans.
import { CONFIG } from './config.js';
import { BUILD } from './version.js';
import { computeLayout, tableToScreen } from './display.js';
import { createGame, startMatch, update, pause, resume, setAspect } from './game.js';
import { createRenderer } from './renderer.js';
import { attachInput } from './input.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const panels = {
  cover: $('panel-cover'),
  menu: $('panel-menu'),
  pause: $('panel-pause'),
  over: $('panel-over'),
  error: $('panel-error'),
};
const hud = $('hud');
const scoreEls = [$('score0'), $('score1')];

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

let renderer = null;
try {
  renderer = createRenderer(canvas);
} catch (err) {
  $('error-text').textContent = 'Le rendu n\'a pas pu démarrer : ' + err.message;
  console.error(err);
}

let layout = computeLayout(window.innerWidth, window.innerHeight, readInsets());
const game = createGame(layout.aspect, CONFIG);

// Ce que le joueur a choisi, indépendamment de la démo qui tourne derrière le menu.
let match = null; // { mode, level } pendant une vraie partie
let coverBypass = false; // « Jouer sur cet écran » depuis l'écran externe
let pausedByCover = false;
let overTimer = 0;

function inMatch() {
  return match !== null;
}

function startDemo() {
  match = null;
  startMatch(game, 'demo', 2);
  hud.hidden = true;
}

function goMenu() {
  startDemo();
  show('menu');
  renderer?.power(true);
}

function beginMatch(mode, level) {
  match = { mode, level };
  startMatch(game, mode, level);
  show(null);
  hud.hidden = false;
  updateScores();
  placeHud();
  renderer?.power(true);
}

function updateScores(popped = -1) {
  for (let i = 0; i < 2; i++) {
    scoreEls[i].textContent = game.scores[i];
    scoreEls[i].classList.toggle('pop', i === popped);
  }
  if (popped >= 0) setTimeout(() => scoreEls[popped].classList.remove('pop'), 700);
}

// Scores au milieu de chaque camp, tournés vers leur joueur en duel.
function placeHud() {
  const W = game.world.W;
  const base = layout.rot ? -90 : 0;
  const duel = match?.mode === 'duel';
  for (let i = 0; i < 2; i++) {
    const s = tableToScreen(layout, i === 0 ? W * 0.25 : W * 0.75, 0.5);
    const angle = duel ? base + (i === 0 ? 90 : -90) : 0;
    scoreEls[i].style.left = s.x + 'px';
    scoreEls[i].style.top = s.y + 'px';
    scoreEls[i].style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  }
  const b = tableToScreen(layout, W / 2, 0.05);
  $('btn-pause').style.left = b.x + 'px';
  $('btn-pause').style.top = b.y + 'px';
}

function updateDiag() {
  const posture = navigator.devicePosture?.type ?? 'n/d';
  $('diag').textContent =
    `Mis à jour le ${BUILD} · ${layout.vw}×${layout.vh} @${window.devicePixelRatio}x · ${layout.mode} · posture ${posture}`;
}

function onResize() {
  const before = layout.mode;
  layout = computeLayout(window.innerWidth, window.innerHeight, readInsets());
  setAspect(game, layout.aspect);
  renderer?.resize(layout, Math.min(window.devicePixelRatio || 1, 2));
  placeHud();
  updateDiag();
  if (!renderer) return;

  const closed = layout.mode === 'cover' && !coverBypass;
  if (closed) {
    // Téléphone fermé : on éteint la table, la partie en cours attend.
    if (inMatch() && (game.state === 'playing' || game.state === 'goal')) {
      pause(game);
      pausedByCover = true;
    }
    if (!inMatch()) pause(game);
    show('cover');
    hud.hidden = true;
    renderer.power(false);
  } else if (before === 'cover' || !panels.cover.hidden) {
    // Téléphone ouvert : la table s'allume.
    renderer.power(true);
    if (inMatch() && game.state !== 'over') {
      hud.hidden = false;
      if (pausedByCover) {
        pausedByCover = false;
        resume(game);
        show(null);
      } else {
        show(game.state === 'paused' ? 'pause' : null);
      }
    } else if (inMatch()) {
      show('over');
    } else {
      goMenu();
    }
  }
}

function userPause() {
  if (!inMatch() || (game.state !== 'playing' && game.state !== 'goal')) return;
  pause(game);
  show('pause');
}

// Boutons.
panels.menu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (btn) beginMatch(btn.dataset.mode, Number(btn.dataset.level ?? 1));
});
$('btn-bypass').addEventListener('click', () => {
  coverBypass = true;
  goMenu();
});
$('btn-pause').addEventListener('click', userPause);
$('btn-resume').addEventListener('click', () => {
  resume(game);
  show(null);
});
$('btn-quit').addEventListener('click', goMenu);
$('btn-menu').addEventListener('click', goMenu);
$('btn-again').addEventListener('click', () => beginMatch(match.mode, match.level));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) userPause();
});
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

function showOver() {
  const names = ['Bleu', 'Rose'];
  let title;
  if (match.mode === 'solo') title = game.winner === 0 ? 'Gagné !' : 'Perdu';
  else title = `${names[game.winner]} gagne`;
  $('over-title').textContent = title;
  $('over-title').style.color = game.winner === 0 ? 'var(--c0)' : 'var(--c1)';
  $('over-score').textContent = `${game.scores[0]} - ${game.scores[1]}`;
  show('over');
}

function handleEvents(events) {
  for (const ev of events) {
    renderer.onEvent(ev, game);
    if (!inMatch()) continue;
    if (ev.type === 'score') updateScores(ev.scorer);
    if (ev.type === 'win') overTimer = 1.4;
  }
}

let last = performance.now();
let time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  handleEvents(update(game, dt));
  // La démo derrière le menu recommence toute seule.
  if (!inMatch() && game.state === 'over') startMatch(game, 'demo', 2);
  if (overTimer > 0) {
    overTimer -= dt;
    if (overTimer <= 0 && inMatch() && game.state === 'over') showOver();
  }

  renderer.render(game, layout, time, dt);
  requestAnimationFrame(frame);
}

if (!renderer) {
  show('error');
} else {
  attachInput(canvas, { game, layout: () => layout });
  renderer.resize(layout, Math.min(window.devicePixelRatio || 1, 2));
  updateDiag();
  if (layout.mode === 'cover') {
    show('cover');
    startDemo();
    pause(game);
    renderer.power(false);
  } else {
    goMenu();
  }
  requestAnimationFrame(frame);
}

// Accès pour les tests automatiques et le diagnostic depuis la console.
window.__airhockey = { game, getLayout: () => layout, beginMatch };
