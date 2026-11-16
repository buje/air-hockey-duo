"""Test de fumée : charge le jeu dans Chrome sans écran, vérifie que WebGL démarre,
qu'aucune erreur ne sort en console et qu'une partie se joue. Produit des captures dans /tmp/ah.

Usage : python3 tests/smoke.py [url]   (sans url : sert le dossier courant en local)
"""
import http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/tmp/ah"
os.makedirs(OUT, exist_ok=True)

url = sys.argv[1] if len(sys.argv) > 1 else None
if not url:
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/"

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=[
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = b.new_context(viewport={"width": 890, "height": 626}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") and "ReadPixels" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(url)
    page.wait_for_timeout(2500)
    assert page.is_visible("#panel-menu"), "le menu doit s'afficher sur un écran ouvert"
    assert not page.is_visible("#panel-error"), page.inner_text("#panel-error")
    page.screenshot(path=f"{OUT}/1-menu.png")

    # Duel : deux doigts, un par camp.
    page.click("button[data-mode=duel]")
    page.wait_for_timeout(300)
    page.evaluate("""() => {
      const c = document.getElementById('gl');
      const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, {pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true}));
      window.__ev = ev;
      ev('pointerdown', 1, 150, 313); ev('pointerdown', 2, 740, 313);
      const g = window.__airhockey.game; const p = g.world.puck;
      ev('pointermove', 1, p.x * window.__airhockey.getLayout().scale + window.__airhockey.getLayout().x + 40, 313);
    }""")
    page.wait_for_timeout(120)
    page.evaluate("() => { __ev('pointermove', 1, 430, 300); __ev('pointermove', 2, 460, 330); }")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/2-duel.png")
    st = page.evaluate("() => { const g = __airhockey.game; return {state: g.state, mode: g.mode, m0: g.world.mallets[0].x, m1: g.world.mallets[1].x, W: g.world.W}; }")
    assert st["mode"] == "duel" and st["state"] in ("playing", "goal"), st
    assert st["m0"] < st["W"] / 2 < st["m1"], f"chaque maillet reste dans son camp : {st}"

    # But forcé : score et éclat.
    page.evaluate("() => { const g = __airhockey.game, p = g.world.puck; __ev('pointerup', 1, 0, 0); __ev('pointerup', 2, 0, 0); g.world.mallets[0].y = g.world.mallets[0].ty = 0.1; g.world.puckActive = true; p.x = 0.3; p.y = 0.5; p.vx = -4; p.vy = 0; }")
    page.wait_for_timeout(250)
    page.screenshot(path=f"{OUT}/3-but.png")
    assert page.inner_text("#score1") == "1", page.inner_text("#score1")

    # Fermeture du téléphone en plein match : pause. Réouverture : reprise.
    page.set_viewport_size({"width": 466, "height": 678})
    page.wait_for_timeout(600)
    assert page.is_visible("#panel-cover")
    assert page.evaluate("() => __airhockey.game.state") == "paused"
    page.screenshot(path=f"{OUT}/4-ferme.png")
    page.set_viewport_size({"width": 890, "height": 626})
    page.wait_for_timeout(600)
    assert not page.is_visible("#panel-cover")
    assert page.evaluate("() => __airhockey.game.state") in ("playing", "goal")

    # Solo sur un téléphone classique tenu droit : la table est tournée.
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(300)
    page.click("#btn-pause"); page.click("#btn-quit"); page.click("button[data-level='1']")
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{OUT}/5-solo-portrait.png")

    # Une partie IA contre IA derrière le menu tourne sans erreur.
    page.set_viewport_size({"width": 890, "height": 626})
    page.click("#btn-pause"); page.click("#btn-quit")
    page.wait_for_timeout(4000)
    page.screenshot(path=f"{OUT}/6-demo.png")
    b.close()

if errors:
    print("ERREURS CONSOLE :"); [print(" -", e) for e in errors]; sys.exit(1)
print("OK", url)
