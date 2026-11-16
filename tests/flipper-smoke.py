"""Test de fumée du flipper et de la page d'accueil dans Chrome sans écran. Captures dans /tmp/ah.

Usage : python3 tests/flipper-smoke.py [url de la racine du site]
"""
import http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/tmp/ah"
os.makedirs(OUT, exist_ok=True)
base = sys.argv[1] if len(sys.argv) > 1 else None
if not base:
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"

# Fausse API de posture, pilotable depuis le test (celle de Safari demande des feature flags).
POSTURE = """
(() => {
  const target = new EventTarget();
  let type = '%s';
  const api = { get type() { return type; }, addEventListener: (...a) => target.addEventListener(...a), removeEventListener: (...a) => target.removeEventListener(...a) };
  Object.defineProperty(Navigator.prototype, 'devicePosture', { get: () => api, configurable: true });
  window.__setPosture = (t) => { type = t; target.dispatchEvent(new Event('change')); };
})();
"""
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    def page(w, h, name, posture=None, touch=True):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, has_touch=touch)
        if posture: ctx.add_init_script(POSTURE % posture)
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(f"{name}: {m.text}") if m.type in ("error", "warning") and "ReadPixels" not in m.text else None)
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        return pg

    # Page d'accueil : deux jeux, deux liens, et les anciens liens d'invitation redirigés.
    home = page(626, 890, "accueil")
    home.goto(base); home.wait_for_timeout(600)
    links = home.eval_on_selector_all("a.card", "els => els.map(e => e.getAttribute('href'))")
    assert links == ["air-hockey/", "flipper/"], links
    assert "Mis à jour" in home.inner_text("#date-flipper") and "Mis à jour" in home.inner_text("#date-air-hockey")
    home.screenshot(path=f"{OUT}/accueil.png")
    home.goto(base + "?join=ABCD"); home.wait_for_url("**/air-hockey/?join=ABCD", timeout=8000)
    home.goto(base); home.click("a.card[href='flipper/']"); home.wait_for_url("**/flipper/", timeout=8000)

    # Duo ouvert à plat : le plateau est éteint et demande d'être plié.
    duo = page(626, 890, "duo", posture="continuous")
    duo.goto(base + "flipper/"); duo.wait_for_timeout(1200)
    assert duo.is_visible("#panel-gate") and duo.inner_text("#gate-title") == "Plie-moi"
    duo.screenshot(path=f"{OUT}/flipper-a-plat.png")
    # On le plie : le plateau s'allume, gravité pliée.
    duo.evaluate("() => __setPosture('folded')"); duo.wait_for_timeout(500)
    assert duo.is_visible("#panel-menu") and not duo.is_visible("#panel-gate")
    assert duo.evaluate("() => __flipper.game.world.folded") is True
    duo.screenshot(path=f"{OUT}/flipper-menu.png")

    # Une partie : lancer, batteurs, score.
    duo.click("#btn-play"); duo.wait_for_timeout(300)
    assert duo.evaluate("() => __flipper.game.state") == "ready"
    tap = """(x) => { const c = document.getElementById('stage');
      c.dispatchEvent(new PointerEvent('pointerdown', {pointerId: x, clientX: x, clientY: 800, pointerType: 'touch', bubbles: true})); }"""
    up = """(x) => document.getElementById('stage').dispatchEvent(new PointerEvent('pointerup', {pointerId: x, clientX: x, clientY: 800, pointerType: 'touch', bubbles: true}))"""
    duo.evaluate(tap, 100); duo.wait_for_timeout(100)
    st = duo.evaluate("() => ({state: __flipper.game.state, left: __flipper.game.world.flippers[0].pressed, right: __flipper.game.world.flippers[1].pressed, audio: __flipper.sound.audioState()})")
    assert st == {"state": "playing", "left": True, "right": False, "audio": "running"}, st
    duo.evaluate(up, 100); duo.evaluate(tap, 500); duo.wait_for_timeout(100)
    st = duo.evaluate("() => ({left: __flipper.game.world.flippers[0].pressed, right: __flipper.game.world.flippers[1].pressed})")
    assert st == {"left": False, "right": True}, st
    duo.evaluate(up, 500)
    # On laisse le joueur automatique marquer quelques points pour la capture.
    duo.evaluate("() => { __flipper.game.demo = true; }"); duo.wait_for_timeout(5000)
    duo.screenshot(path=f"{OUT}/flipper-jeu.png")
    assert duo.evaluate("() => __flipper.game.score") > 0
    assert duo.inner_text("#score") != "0"
    # Remis à plat en pleine partie : tout s'arrête. Replié : ça reprend.
    duo.evaluate("() => { __flipper.game.demo = false; __setPosture('continuous'); }"); duo.wait_for_timeout(400)
    y1 = duo.evaluate("() => __flipper.game.world.ball.y"); duo.wait_for_timeout(400)
    assert duo.is_visible("#panel-gate") and duo.evaluate("() => __flipper.game.world.ball.y") == y1
    duo.evaluate("() => __setPosture('folded')"); duo.wait_for_timeout(300)
    assert not duo.is_visible("#panel-gate") and duo.is_visible("#hud")

    # iPhone classique : pas de blocage, gravité uniforme, flipper normal.
    phone = page(390, 844, "iphone")
    phone.goto(base + "flipper/"); phone.wait_for_timeout(1000)
    assert phone.is_visible("#panel-menu") and phone.evaluate("() => __flipper.game.world.folded") is False
    phone.click("#btn-play"); phone.evaluate("() => { __flipper.game.demo = true; }"); phone.wait_for_timeout(2500)
    phone.screenshot(path=f"{OUT}/flipper-iphone.png")
    b.close()

if errors:
    print("ERREURS CONSOLE :"); [print(" -", e) for e in errors]; sys.exit(1)
print("OK flipper et accueil", base)
