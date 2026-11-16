// Transport des parties à distance : les deux téléphones se parlent en direct (WebRTC).
// PeerJS et son service public gratuit ne servent qu'à les mettre en relation au départ.
// Seule dépendance du projet, rangée dans vendor/ et chargée uniquement pour ce mode.

const PREFIX = 'airhockeyduo-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, trop faciles à confondre
const JOIN_TIMEOUT = 15000;
let loading = null;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS introuvable')));
      s.onerror = () => reject(new Error('Chargement impossible, vérifie ta connexion'));
      document.head.appendChild(s);
    });
  }
  return loading;
}

// Pour les tests : ?peerhost=127.0.0.1&peerport=9000 vise un serveur de mise en relation local.
function peerOptions() {
  const q = new URLSearchParams(location.search);
  if (!q.get('peerhost')) return { debug: 1 };
  return { host: q.get('peerhost'), port: Number(q.get('peerport') || 9000), path: '/', secure: false, debug: 1 };
}

export function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export function cleanCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function explain(err) {
  const type = err && err.type;
  if (type === 'peer-unavailable') return 'Aucune partie avec ce code';
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
    return 'Service de mise en relation injoignable';
  }
  if (type === 'browser-incompatible') return 'Ce navigateur ne permet pas le jeu à distance';
  return 'Connexion impossible';
}

// handlers = { onCode(code), onOpen(), onMessage(msg), onClose(), onError(texte) }
function makeSession(handlers) {
  const session = {
    peer: null,
    conn: null,
    closed: false,
    send(msg) {
      if (session.conn && session.conn.open) session.conn.send(msg);
    },
    close() {
      session.closed = true;
      try {
        session.peer?.destroy();
      } catch {
        /* déjà fermé */
      }
    },
  };
  session.wire = (conn) => {
    session.conn = conn;
    conn.on('open', () => !session.closed && handlers.onOpen());
    conn.on('data', (msg) => !session.closed && handlers.onMessage(msg));
    conn.on('close', () => !session.closed && handlers.onClose());
    conn.on('error', () => !session.closed && handlers.onClose());
  };
  return session;
}

// Crée une partie et attend un adversaire. Le code est donné par handlers.onCode.
export async function hostGame(handlers) {
  const session = makeSession(handlers);
  const Peer = await loadPeerJs();
  let tries = 0;
  const open = () => {
    const code = makeCode();
    const peer = new Peer(PREFIX + code, peerOptions());
    session.peer = peer;
    peer.on('open', () => !session.closed && handlers.onCode(code));
    peer.on('connection', (conn) => {
      if (session.conn) conn.close(); // partie déjà complète
      else session.wire(conn);
    });
    peer.on('error', (err) => {
      if (session.closed) return;
      if (err.type === 'unavailable-id' && tries++ < 5) {
        peer.destroy();
        open(); // code déjà pris : on en tire un autre
      } else if (!session.conn) {
        handlers.onError(explain(err));
      }
    });
  };
  open();
  return session;
}

// Rejoint la partie qui porte ce code.
export async function joinGame(code, handlers) {
  const session = makeSession(handlers);
  const Peer = await loadPeerJs();
  const peer = new Peer(peerOptions());
  session.peer = peer;
  let opened = false;
  const timer = setTimeout(() => {
    if (!opened && !session.closed) {
      handlers.onError('Pas de réponse. Vérifie le code ou réessaie sur un autre réseau');
      session.close();
    }
  }, JOIN_TIMEOUT);
  peer.on('open', () => {
    if (session.closed) return;
    const conn = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      opened = true;
      clearTimeout(timer);
    });
    session.wire(conn);
  });
  peer.on('error', (err) => {
    if (session.closed || opened) return;
    clearTimeout(timer);
    handlers.onError(explain(err));
    session.close();
  });
  return session;
}
