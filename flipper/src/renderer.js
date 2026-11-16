// Affichage du flipper en Canvas 2D. Lit l'état du jeu, ne le modifie jamais.
// Le plateau fixe est dessiné une fois dans une image de fond, seuls les objets mobiles
// sont redessinés à chaque image.
import { flipperTip } from './table.js';

const C = {
  bgTop: '#120a26',
  bgBottom: '#06101e',
  wall: '#6f8cff',
  fold: '#80ffb8',
  ball: '#fff3d6',
  bumper: '#ff2985',
  kicker: '#ffb020',
  target: '#1accff',
  flipper: '#1accff',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const bg = document.createElement('canvas');
  let bgKey = '';
  let px = 1; // px du canvas par px CSS

  // État purement visuel.
  const particles = [];
  const flash = []; // éclat par champignon
  const trail = [];
  let foldPulse = 0;
  let foldX = 0.5;
  let shake = 0;
  let power = 0; // 0 = plateau éteint, 1 = allumé
  let powerTarget = 1;

  function spawn(x, y, count, speed, color) {
    for (let i = 0; i < count && particles.length < 300; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.4;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color });
    }
  }

  function glowLine(c, color, width, blur) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.shadowColor = color;
    c.shadowBlur = blur;
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  // Passe en coordonnées plateau : 1 unité = la largeur du plateau.
  function toTable(c, V, ox = 0, oy = 0) {
    c.setTransform(V.scale * px, 0, 0, V.scale * px, (V.x + ox) * px, (V.y + oy) * px);
  }

  function drawBackground(game, V, folded) {
    const t = game.world.table;
    bg.width = canvas.width;
    bg.height = canvas.height;
    const c = bg.getContext('2d');
    c.fillStyle = '#04050b';
    c.fillRect(0, 0, bg.width, bg.height);
    toTable(c, V);
    const blur = 0.02 * V.scale * px;

    // Fond : la moitié debout et la moitié posée n'ont pas la même teinte.
    c.save();
    c.beginPath();
    c.moveTo(t.segments[0].x1, t.segments[0].y1);
    for (const s of t.segments) c.lineTo(s.x2, s.y2);
    c.lineTo(t.right, t.H + 0.1);
    c.lineTo(t.left, t.H + 0.1);
    c.closePath();
    c.clip();
    const grad = c.createLinearGradient(0, 0, 0, t.H);
    grad.addColorStop(0, folded ? '#1d0f3d' : C.bgTop);
    grad.addColorStop(0.499, folded ? '#150b2c' : C.bgTop);
    grad.addColorStop(0.501, C.bgBottom);
    grad.addColorStop(1, '#03070f');
    c.fillStyle = grad;
    c.fillRect(0, 0, 1, t.H + 0.1);
    c.lineWidth = 0.002;
    for (let gx = 0.1; gx < 1; gx += 0.1) {
      c.strokeStyle = 'rgba(120,140,255,0.07)';
      c.beginPath();
      c.moveTo(gx, 0);
      c.lineTo(gx, t.H);
      c.stroke();
    }
    for (let gy = t.foldY % 0.1; gy < t.H; gy += 0.1) {
      c.strokeStyle = gy < t.foldY ? 'rgba(255,60,160,0.07)' : 'rgba(40,200,255,0.07)';
      c.beginPath();
      c.moveTo(0, gy);
      c.lineTo(1, gy);
      c.stroke();
    }
    c.restore();

    // Bords.
    glowLine(c, C.wall, 0.008, blur);
    c.beginPath();
    c.moveTo(t.segments[0].x1, t.segments[0].y1);
    for (const s of t.segments) c.lineTo(s.x2, s.y2);
    c.stroke();
    c.shadowBlur = 0;
  }

  return {
    resize(V, scale) {
      px = scale;
      const w = Math.max(1, Math.round(V.vw * scale));
      const h = Math.max(1, Math.round(V.vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      bgKey = '';
    },

    power(on) {
      powerTarget = on ? 1 : 0;
    },

    onEvent(ev, game) {
      const t = game.world.table;
      const b = game.world.ball;
      if (ev.type === 'bumper') {
        flash[ev.index] = 1;
        spawn(ev.x, ev.y, 14, 1.2, ev.kind === 'kicker' ? C.kicker : C.bumper);
        shake = Math.max(shake, 0.35);
      } else if (ev.type === 'target') {
        spawn(ev.x, ev.y, 10, 0.8, C.target);
      } else if (ev.type === 'bonus') {
        for (const tg of t.targets) spawn(tg.x, tg.y, 24, 1.6, C.fold);
        shake = 1;
      } else if (ev.type === 'fold') {
        foldPulse = 1;
        foldX = ev.x;
        spawn(ev.x, t.foldY, 8, 0.6, C.fold);
      } else if (ev.type === 'flipper') {
        spawn(b.x, b.y, 6, 0.8, C.flipper);
      } else if (ev.type === 'wall' && ev.power > 1.5) {
        spawn(ev.x, ev.y, 4, 0.6, C.wall);
      } else if (ev.type === 'drain' || ev.type === 'gameover') {
        shake = Math.max(shake, 0.6);
      }
    },

    render(game, V, time, dt) {
      const w = game.world;
      const t = w.table;
      const b = w.ball;
      const key = `${canvas.width}x${canvas.height}:${t.H}:${V.x}:${V.y}:${w.folded}`;
      if (key !== bgKey) {
        drawBackground(game, V, w.folded);
        bgKey = key;
      }

      power += (powerTarget - power) * Math.min(1, dt * 5);
      foldPulse *= Math.exp(-dt * 3.5);
      shake = Math.max(0, shake - dt * 3);
      for (let i = 0; i < t.bumpers.length; i++) flash[i] = (flash[i] || 0) * Math.exp(-dt * 7);

      if (b.active) trail.unshift({ x: b.x, y: b.y });
      else trail.length = Math.max(0, trail.length - 1);
      if (trail.length > 14) trail.length = 14;

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life -= dt;
        if (q.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }

      const ox = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0;
      const oy = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.drawImage(bg, ox * px, oy * px);
      toTable(ctx, V, ox, oy);
      const blur = 0.025 * V.scale * px;

      // Le pli : ligne de néon qui s'illumine au passage de la bille.
      glowLine(ctx, C.fold, 0.006 + foldPulse * 0.008, blur * (1 + foldPulse * 2));
      ctx.globalAlpha = 0.55 + foldPulse * 0.45;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = t.left + ((t.right - t.left) * i) / 40;
        const wave = Math.sin(x * 26 + time * 2) * 0.002 + foldPulse * Math.sin((x - foldX) * 34 - time * 22) * Math.exp(-Math.abs(x - foldX) * 5) * 0.02;
        if (i === 0) ctx.moveTo(x, t.foldY + wave);
        else ctx.lineTo(x, t.foldY + wave);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Cibles.
      for (let i = 0; i < t.targets.length; i++) {
        const tg = t.targets[i];
        const lit = game.lit[i];
        ctx.shadowColor = C.target;
        ctx.shadowBlur = lit ? blur * 1.5 : blur * 0.4;
        ctx.fillStyle = lit ? C.target : 'rgba(26,204,255,0.18)';
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Champignons et kickers.
      for (let i = 0; i < t.bumpers.length; i++) {
        const bp = t.bumpers[i];
        const color = bp.kind === 'kicker' ? C.kicker : C.bumper;
        const f = flash[i] || 0;
        const r = bp.r * (1 + f * 0.12);
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * (1 + f * 2.5);
        ctx.fillStyle = f > 0.05 ? color : 'rgba(10,8,20,0.9)';
        ctx.globalAlpha = f > 0.05 ? 0.35 + f * 0.65 : 1;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.009;
        ctx.stroke();
        ctx.lineWidth = 0.004;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Batteurs.
      for (const f of w.flippers) {
        const tip = flipperTip(f, f.angle);
        glowLine(ctx, C.flipper, f.r * 2, blur * (f.pressed ? 1.8 : 1));
        ctx.beginPath();
        ctx.moveTo(f.px, f.py);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }

      // Traînée et bille.
      ctx.shadowBlur = 0;
      for (let i = trail.length - 1; i >= 1; i--) {
        const k = 1 - i / trail.length;
        ctx.globalAlpha = k * 0.35;
        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.arc(trail[i].x, trail[i].y, b.r * (0.4 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (b.active || game.state === 'ready') {
        if (game.state === 'ready') {
          // Bille en attente : un anneau qui bat pour inviter à lancer.
          const beat = 0.5 + 0.5 * Math.sin(time * 5);
          glowLine(ctx, C.ball, 0.004, blur);
          ctx.globalAlpha = 0.3 + beat * 0.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * (1.6 + beat * 0.8), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.shadowColor = '#ffd27a';
        ctx.shadowBlur = blur * 1.6;
        ctx.fillStyle = C.ball;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Étincelles.
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'lighter';
      for (const q of particles) {
        ctx.globalAlpha = q.life / q.max;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Plateau éteint (téléphone pas encore plié) : voile sombre.
      if (power < 0.99) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(3,4,10,${(1 - power) * 0.88})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  };
}
