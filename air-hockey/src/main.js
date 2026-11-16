// Point d'entrée : relie la partie, l'affichage, le tactile et les écrans.
import { CONFIG } from './config.js';
import { BUILD } from './version.js';
import { computeLayout, tableToScreen } from './display.js';
import { createGame, startMatch, update, pause, resume, setAspect } from './game.js';
import { createRenderer } from './renderer.js';
import { attachInput } from './input.js';
import * as sound from './audio.js';
import { buzz, hapticsSupported } from './haptics.js';
import { netStart, netOutgoing, netIncoming } from './netgame.js';
import { hostGame, joinGame, cleanCode } from './net.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const panels = {
  cover: $('panel-cover'),
  menu: $('panel-menu'),
  pause: $('panel-pause'),
  over: $('panel-over'),
  net: $('panel-net'),
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

// Partie à distance : forme de table commune aux deux téléphones (0 = forme libre).
let netAspect = 0;
let session = null; // connexion à l'adversaire
let isHost = false;

function measure() {
  return computeLayout(window.innerWidth, window.innerHeight, readInsets(), netAspect);
}

let layout = measure();
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
  leaveNet();
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
    `Mis à jour le ${BUILD} · ${layout.vw}×${layout.vh} @${window.devicePixelRatio}x · ${layout.mode} · posture ${posture} · vibration ${hapticsSupported ? 'oui' : 'non'} · audio ${sound.audioState()}`;
}

function onResize() {
  const before = layout.mode;
  layout = measure();
  setAspect(game, layout.aspect);
  renderer?.resize(layout, Math.min(window.devicePixelRatio || 1, 2));
  placeHud();
  updateDiag();
  if (!renderer) return;

  const closed = layout.mode === 'cover' && !coverBypass;
  if (closed) {
    // Téléphone fermé : on éteint la table, la partie en cours attend.
    // (à distance on ne peut pas mettre l'adversaire en pause : la partie continue)
    if (inMatch() && match.mode !== 'net' && (game.state === 'playing' || game.state === 'goal')) {
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
  if (match.mode !== 'net') pause(game);
  show('pause');
}

// Boutons.
panels.menu.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (btn) beginMatch(btn.dataset.mode, Number(btn.dataset.level ?? 1));
});
// Le son ne peut démarrer qu'après un geste : on le débloque au premier toucher.
for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'click', 'keydown']) {
  document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) sound.play({ type: 'ui' }, 1);
});
function updateSoundButton() {
  $('btn-sound').textContent = sound.isEnabled() ? 'Son activé' : 'Son coupé';
}
$('btn-sound').addEventListener('click', () => {
  sound.setEnabled(!sound.isEnabled());
  updateSoundButton();
});
updateSoundButton();
// Bouton de test : joue le son du but et affiche l'état du moteur audio.
$('btn-soundtest').addEventListener('click', () => {
  sound.unlock();
  setTimeout(() => {
    sound.play({ type: 'score', scorer: 0 }, 1);
    updateDiag();
  }, 60);
});
setInterval(() => {
  if (!panels.menu.hidden) updateDiag();
}, 1000);
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
$('btn-again').addEventListener('click', () => {
  if (match.mode !== 'net') beginMatch(match.mode, match.level);
  else if (isHost) hostStartsMatch();
  else session?.send({ t: 'again' });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) userPause();
});
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

// ---------- Jeu à distance ----------

function netStatus(text) {
  $('net-status').textContent = text;
}

function openNetPanel() {
  leaveNet();
  $('net-choice').hidden = false;
  $('net-wait').hidden = true;
  netStatus('');
  show('net');
  renderer?.power(true);
}

function leaveNet() {
  if (session) {
    session.send({ t: 'bye' });
    session.close();
    session = null;
  }
  if (netAspect) {
    netAspect = 0;
    layout = measure();
    setAspect(game, layout.aspect);
    renderer?.resize(layout, Math.min(window.devicePixelRatio || 1, 2));
  }
}

// La forme de table que ce téléphone prendrait seul.
function naturalAspect() {
  return computeLayout(window.innerWidth, window.innerHeight, readInsets()).aspect;
}

function beginNetMatch(aspect, iServe) {
  netAspect = aspect;
  layout = measure();
  setAspect(game, aspect);
  renderer.resize(layout, Math.min(window.devicePixelRatio || 1, 2));
  match = { mode: 'net', level: 0 };
  lastNetMessage = performance.now();
  netStart(game, iServe);
  show(null);
  hud.hidden = false;
  updateScores();
  placeHud();
  renderer.power(true);
}

let guestAspect = 0;
function hostStartsMatch() {
  // La table la moins allongée des deux tient sur les deux écrans.
  const aspect = Math.round(Math.min(naturalAspect(), guestAspect || 99) * 10000) / 10000;
  const hostServes = Math.random() < 0.5;
  session.send({ t: 'start', a: aspect, serve: !hostServes });
  beginNetMatch(aspect, hostServes);
}

// Sans nouvelles de l'adversaire : on prévient au bout de 1,5 s, on arrête au bout de 15 s.
// (Une fermeture brutale de page ou une perte de réseau ne sont pas toujours signalées.)
const NET_LAG_MS = 1500;
const NET_LOST_MS = 15000;
let lastNetMessage = 0;

function onNetMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  lastNetMessage = performance.now();
  if (msg.t === 'bye') {
    onNetClosed();
    return;
  }
  if (msg.t === 'hello' && isHost) {
    guestAspect = Number(msg.a) || 0;
    hostStartsMatch();
  } else if (msg.t === 'start' && !isHost && Number(msg.a) > 1) {
    beginNetMatch(Number(msg.a), Boolean(msg.serve));
  } else if (msg.t === 'again' && isHost && game.state === 'over') {
    hostStartsMatch();
  } else if (match?.mode === 'net') {
    handleEvents(netIncoming(game, msg));
  }
}

function onNetClosed() {
  if (!session) return;
  const wasPlaying = match?.mode === 'net';
  goMenu();
  openNetPanel();
  netStatus(wasPlaying ? "L'adversaire a quitté la partie" : 'Connexion perdue');
}

function netHandlers() {
  return {
    onCode(code) {
      $('net-choice').hidden = true;
      $('net-wait').hidden = false;
      $('net-code-show').textContent = code;
      netStatus("En attente de l'adversaire…");
    },
    onOpen() {
      if (!isHost) session.send({ t: 'hello', a: naturalAspect() });
    },
    onMessage: onNetMessage,
    onClose: onNetClosed,
    onError(text) {
      $('net-choice').hidden = false;
      $('net-wait').hidden = true;
      netStatus(text);
    },
  };
}

async function hostFlow() {
  netStatus('Création de la partie…');
  isHost = true;
  try {
    session = await hostGame(netHandlers());
  } catch (err) {
    netStatus(err.message);
  }
}

async function joinFlow(rawCode) {
  const code = cleanCode(rawCode);
  if (code.length !== 4) {
    netStatus('Le code fait 4 lettres');
    return;
  }
  netStatus('Connexion…');
  isHost = false;
  try {
    session = await joinGame(code, netHandlers());
  } catch (err) {
    netStatus(err.message);
  }
}

function shareLink() {
  const code = $('net-code-show').textContent;
  const url = `${location.origin}${location.pathname}?join=${code}`;
  if (navigator.share) {
    navigator.share({ title: 'Air Hockey Duo', text: `Rejoins ma partie (code ${code})`, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => netStatus('Lien copié'), () => netStatus(url));
  } else {
    netStatus(url);
  }
}

// Prévenir l'adversaire quand on quitte la page (au mieux : pas garanti par le navigateur).
window.addEventListener('pagehide', () => session?.send({ t: 'bye' }));
$('btn-net').addEventListener('click', openNetPanel);
$('btn-host').addEventListener('click', hostFlow);
$('btn-join').addEventListener('click', () => joinFlow($('net-code').value));
$('net-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinFlow($('net-code').value);
});
$('btn-share').addEventListener('click', shareLink);
$('btn-net-cancel').addEventListener('click', goMenu);

function showOver() {
  const names = ['Bleu', 'Rose'];
  let title;
  if (match.mode !== 'duel') title = game.winner === 0 ? 'Gagné !' : 'Perdu';
  else title = `${names[game.winner]} gagne`;
  $('over-title').textContent = title;
  $('over-title').style.color = game.winner === 0 ? 'var(--c0)' : 'var(--c1)';
  $('over-score').textContent = `${game.scores[0]} - ${game.scores[1]}`;
  show('over');
}

function handleEvents(events) {
  for (const ev of events) {
    renderer.onEvent(ev, game);
    if (!inMatch()) continue; // la démo derrière le menu reste silencieuse
    sound.play(ev, game.world.W);
    buzz(ev);
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

  const events = update(game, dt);
  handleEvents(events);
  if (match?.mode === 'net' && session) {
    for (const msg of netOutgoing(game, dt, events)) session.send(msg);
    const silence = now - lastNetMessage;
    $('net-lag').hidden = silence < NET_LAG_MS;
    if (silence > NET_LOST_MS) onNetClosed();
  } else if (!$('net-lag').hidden) {
    $('net-lag').hidden = true;
  }
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
  const joinCode = cleanCode(new URLSearchParams(location.search).get('join'));
  if (joinCode.length === 4) {
    // Arrivée par un lien d'invitation : on rejoint directement la partie.
    coverBypass = true;
    startDemo();
    openNetPanel();
    $('net-code').value = joinCode;
    joinFlow(joinCode);
  } else if (layout.mode === 'cover') {
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
window.__airhockey = { game, getLayout: () => layout, beginMatch, sound, getMatch: () => match };
