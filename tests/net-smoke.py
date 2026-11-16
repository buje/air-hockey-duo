"""Test de fumée du jeu à distance : deux navigateurs sans écran jouent l'un contre l'autre
en passant par un serveur de mise en relation PeerJS local.

Préparation (hors dépôt) : mkdir /tmp/pj && cd /tmp/pj && npm i peer
Usage : python3 tests/net-smoke.py          (code local + serveur PeerJS local)
        python3 tests/net-smoke.py <url>    (version en ligne + vrai service PeerJS, demande un accès réseau complet)
"""
import http.server, os, socketserver, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PEER_BIN = os.environ.get("PEER_BIN", "/tmp/pj/node_modules/.bin/peerjs")
PEER_PORT = 9471

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}/air-hockey/"
if len(sys.argv) > 1:
    base, q, peer = sys.argv[1], "live=1", None
else:
    peer = subprocess.Popen([PEER_BIN, "--host", "127.0.0.1", "--port", str(PEER_PORT), "--path", "/"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    q = f"peerhost=127.0.0.1&peerport={PEER_PORT}"
errors = []
STATE = "() => { const g = __airhockey.game; return {mode: g.mode, state: g.state, W: g.world.W, scores: g.scores, owner: g.net && g.net.owner, m0: [g.world.mallets[0].x, g.world.mallets[0].y], m1: [g.world.mallets[1].x, g.world.mallets[1].y], puck: [g.world.puck.x, g.world.puck.y], active: g.world.puckActive}; }"

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=[
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        def page(w, h, name):
            pg = b.new_context(viewport={"width": w, "height": h}).new_page()
            pg.on("console", lambda m: errors.append(f"{name}: {m.text}") if m.type == "error" and "ReadPixels" not in m.text else None)
            pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
            return pg
        host = page(890, 626, "hôte")      # iPhone Duo ouvert
        guest = page(844, 390, "invité")   # téléphone classique à l'horizontale

        host.goto(base + "?" + q)
        host.wait_for_timeout(1500)
        host.click("#btn-net"); host.click("#btn-host")
        host.wait_for_selector("#net-wait:not([hidden])", timeout=15000)
        code = host.inner_text("#net-code-show")
        assert len(code) == 4, code

        guest.goto(base + f"?join={code}&" + q)
        guest.wait_for_function("() => window.__airhockey && __airhockey.game.mode === 'net'", timeout=20000)
        host.wait_for_function("() => __airhockey.game.mode === 'net'", timeout=5000)
        hs, gs = host.evaluate(STATE), guest.evaluate(STATE)
        assert abs(hs["W"] - gs["W"]) < 1e-9, f"même forme de table des deux côtés : {hs['W']} / {gs['W']}"
        assert hs["owner"] != gs["owner"], "un seul téléphone a la main sur le palet"

        # L'hôte bouge son maillet : l'invité doit le voir, retourné, dans le camp d'en face.
        host.evaluate("""() => { const c = document.getElementById('gl');
          const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {pointerId: 1, clientX: x, clientY: y, pointerType: 'touch', bubbles: true}));
          ev('pointerdown', 120, 150); ev('pointermove', 120, 150); }""")
        host.wait_for_timeout(700)
        hs, gs = host.evaluate(STATE), guest.evaluate(STATE)
        W = hs["W"]
        assert abs(gs["m1"][0] - (W - hs["m0"][0])) < 0.03 and abs(gs["m1"][1] - (1 - hs["m0"][1])) < 0.03, f"maillet adverse mal reçu : hôte {hs['m0']} invité {gs['m1']}"

        # Celui qui a la main encaisse un but : le score arrive chez les deux.
        owner, other = (host, guest) if hs["owner"] else (guest, host)
        owner.evaluate("() => { const g = __airhockey.game, p = g.world.puck; g.world.mallets[0].y = g.world.mallets[0].ty = 0.12; p.x = 0.3; p.y = 0.5; p.vx = -4; p.vy = 0; }")
        owner.wait_for_timeout(900)
        os_, ot = owner.evaluate(STATE), other.evaluate(STATE)
        assert os_["scores"] == [0, 1], os_
        assert ot["scores"] == [1, 0], ot
        host.screenshot(path="/tmp/ah/net-hote.png"); guest.screenshot(path="/tmp/ah/net-invite.png")

        # Remise en jeu chez celui qui a encaissé, visible chez l'autre.
        owner.wait_for_timeout(1500)
        os_, ot = owner.evaluate(STATE), other.evaluate(STATE)
        assert os_["state"] == "playing" and ot["state"] == "playing" and ot["active"], (os_, ot)
        assert abs(ot["puck"][0] - (W - os_["puck"][0])) < 0.05, (os_["puck"], ot["puck"])

        # L'invité part : l'hôte est prévenu et revient au menu du jeu à distance.
        guest.close()
        host.wait_for_selector("#panel-net:not([hidden])", timeout=30000)
        assert "quitté" in host.inner_text("#net-status"), host.inner_text("#net-status")
        b.close()
finally:
    if peer: peer.terminate()

if errors:
    print("ERREURS CONSOLE :"); [print(" -", e) for e in errors]; sys.exit(1)
print("OK jeu à distance")
