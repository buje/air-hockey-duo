// Partie à distance entre deux téléphones. Pur : ne connaît ni le réseau ni l'écran.
// Ce module transforme l'état du jeu en messages à envoyer et applique les messages reçus.
// Le transport (PeerJS) est dans net.js.
//
// Principes :
// - Chaque téléphone se voit comme le joueur 0 (camp de gauche). Tout ce qui voyage est
//   retourné à l'arrivée (demi-tour de la table).
// - Le palet est calculé par le téléphone du camp où il se trouve : c'est lui qui « a la main »
//   (owner). Ses frappes répondent donc sans aucun retard. Quand le palet passe le filet,
//   il passe la main à l'autre avec un message 'h'.
// - Seul celui qui a la main compte les buts (toujours contre son camp) et remet en jeu.
// - Le canal doit être fiable et ordonné, sinon un passage de main pourrait se perdre.
//
// Messages :
//   { t: 's', m: [x, y, vx, vy], o: 0|1, e, a: 0|1, p: [x, y, vx, vy] }  état, 60 fois par seconde
//   { t: 'h', e, p: [x, y, vx, vy] }                                      je te passe la main
//   { t: 'g', s: [mon score, ton score] }                                 j'ai encaissé un but
import { startMatch } from './game.js';
import { placePuck, setTarget } from './physics.js';

const SEND_EVERY = 1 / 60;
const HANDOFF_MARGIN = 0.02; // le palet doit avoir franchi le filet de cette distance

// Démarre une partie à distance. `iServe` : c'est moi qui engage.
export function netStart(game, iServe) {
  startMatch(game, 'net');
  const { W } = game.world;
  game.net = { owner: iServe, epoch: 0, sendAcc: 0, out: [] };
  placePuck(game.world, iServe ? W * 0.3 : W * 0.7, 0.5);
}

function mirror(world, v) {
  return [world.W - v[0], 1 - v[1], -v[2], -v[3]];
}

const round = (v) => Math.round(v * 10000) / 10000;
const pack = (o) => [round(o.x), round(o.y), round(o.vx), round(o.vy)];

function setPuck(world, v) {
  const p = world.puck;
  [p.x, p.y, p.vx, p.vy] = v;
}

// À appeler après chaque update(game, dt) avec les événements qu'il a renvoyés.
// Renvoie les messages à envoyer à l'adversaire.
export function netOutgoing(game, dt, events) {
  const net = game.net;
  const w = game.world;
  const out = net.out;
  out.length = 0;

  for (const ev of events) {
    // Un but compté ici est forcément contre mon camp : je préviens l'adversaire.
    if (ev.type === 'score') out.push({ t: 'g', s: [game.scores[0], game.scores[1]] });
  }

  // Le palet a franchi le filet : l'adversaire prend la main.
  if (net.owner && w.puckActive && game.state === 'playing' && w.puck.x > w.W / 2 + HANDOFF_MARGIN) {
    net.owner = false;
    net.epoch++;
    out.push({ t: 'h', e: net.epoch, p: pack(w.puck) });
  }

  net.sendAcc += dt;
  if (net.sendAcc >= SEND_EVERY) {
    net.sendAcc = Math.min(net.sendAcc - SEND_EVERY, SEND_EVERY);
    const msg = { t: 's', m: pack(w.mallets[0]), o: net.owner ? 1 : 0, e: net.epoch };
    if (net.owner) {
      msg.a = w.puckActive && game.state === 'playing' ? 1 : 0;
      msg.p = pack(w.puck);
    }
    out.push(msg);
  }
  return out;
}

// Applique un message reçu. Renvoie les événements à jouer (son, étincelles, score).
export function netIncoming(game, msg) {
  const net = game.net;
  const w = game.world;
  const events = [];
  if (!net || !msg || typeof msg !== 'object') return events;

  if (msg.t === 's' && Array.isArray(msg.m)) {
    // Maillet adverse : on le pose où il est et on vise un peu plus loin dans son élan.
    const [x, y, vx, vy] = mirror(w, msg.m);
    const m = w.mallets[1];
    setTarget(w, 1, x, y);
    m.x = m.tx;
    m.y = m.ty;
    m.vx = vx;
    m.vy = vy;
    setTarget(w, 1, x + vx * 0.03, y + vy * 0.03);

    if (!net.owner && msg.o === 1 && msg.e === net.epoch && Array.isArray(msg.p)) {
      const target = mirror(w, msg.p);
      if (msg.a === 1) {
        const p = w.puck;
        const far = !w.puckActive || Math.hypot(target[0] - p.x, target[1] - p.y) > 0.12;
        if (far) {
          setPuck(w, target);
        } else {
          // Petit écart : on se rapproche en douceur pour éviter les sauts à l'image.
          p.x += (target[0] - p.x) * 0.5;
          p.y += (target[1] - p.y) * 0.5;
          p.vx = target[2];
          p.vy = target[3];
        }
        w.puckActive = true;
        if (game.state === 'goal') game.state = 'playing';
      } else {
        w.puckActive = false;
      }
    }
  } else if (msg.t === 'h' && Array.isArray(msg.p)) {
    // L'adversaire me passe la main : je calcule le palet à partir de maintenant.
    net.owner = true;
    net.epoch = msg.e;
    const sent = mirror(w, msg.p);
    const p = w.puck;
    // Si mon image du palet est déjà dans mon camp et proche de ce qu'on m'envoie, je la garde :
    // c'est moi qui fais foi désormais, et ça évite un retour en arrière visible au filet.
    const keepMine = w.puckActive && p.x < w.W / 2 && Math.hypot(sent[0] - p.x, sent[1] - p.y) < 0.15;
    if (!keepMine) setPuck(w, sent);
    w.puckActive = true;
    game.state = 'playing';
    game.stuck = 0;
  } else if (msg.t === 'g' && Array.isArray(msg.s)) {
    // L'adversaire a encaissé : j'ai marqué.
    game.scores = [msg.s[1], msg.s[0]];
    w.puckActive = false;
    events.push({ type: 'score', scorer: 0, scores: game.scores.slice() });
    if (game.scores[0] >= game.cfg.winScore) {
      game.winner = 0;
      game.state = 'over';
      events.push({ type: 'win', winner: 0 });
    } else {
      game.state = 'goal';
    }
  }
  return events;
}
