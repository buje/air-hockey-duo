// Affichage WebGL2. Lit l'état du jeu, ne le modifie jamais.
import { TABLE_VS, TABLE_FS, PARTICLE_VS, PARTICLE_FS } from './shaders.js';

const MAX_PARTICLES = 500;
const TRAIL = 16;
const STRIDE = 7; // x, y, taille, r, g, b, a
const COLORS = [
  [0.1, 0.8, 1.0],
  [1.0, 0.16, 0.52],
];
const PUCK_COLOR = [1.0, 0.86, 0.5];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader : ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Programme : ' + gl.getProgramInfoLog(p));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace('[0]', '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

// Renvoie null si WebGL2 n'est pas disponible.
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const table = program(gl, TABLE_VS, TABLE_FS);
  const parts = program(gl, PARTICLE_VS, PARTICLE_FS);

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(table.p, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const partData = new Float32Array(MAX_PARTICLES * STRIDE);
  const partVao = gl.createVertexArray();
  gl.bindVertexArray(partVao);
  const partBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
  gl.bufferData(gl.ARRAY_BUFFER, partData.byteLength, gl.DYNAMIC_DRAW);
  const bind = (name, size, offset) => {
    const loc = gl.getAttribLocation(parts.p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
  };
  bind('aPos', 2, 0);
  bind('aSize', 1, 2);
  bind('aCol', 4, 3);
  gl.bindVertexArray(null);

  // État purement visuel.
  const particles = []; // { x, y, vx, vy, life, max, size, c }
  const trail = new Float32Array(TRAIL * 3);
  let trailTimer = 0;
  let netPulse = 0;
  let netY = 0.5;
  let netPhase = 0;
  let shock = { x: 0, y: 0, age: -1, force: 0 };
  const flash = [0, 0];
  let shake = 0;
  let intro = 0;
  let introTarget = 0;
  let pixelScale = 1;

  function spawn(x, y, count, speed, color, size = 0.03) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.25 + Math.random() * 0.75);
      const life = 0.25 + Math.random() * 0.45;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), c: color });
    }
  }

  function setTransform(u, L) {
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 14 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 14 : 0;
    gl.uniform2f(u.uOrigin, (L.x + sx) * pixelScale, (L.y + sy) * pixelScale);
    gl.uniform1f(u.uScale, L.scale * pixelScale);
    gl.uniform1f(u.uLong, L.h * pixelScale);
    gl.uniform1f(u.uRot, L.rot ? 1 : 0);
  }

  return {
    // `scale` = px du canvas par px CSS.
    resize(L, scale) {
      pixelScale = scale;
      const w = Math.max(1, Math.round(L.vw * scale));
      const h = Math.max(1, Math.round(L.vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    },

    // Allume (1) ou éteint (0) la table en fondu.
    power(on) {
      introTarget = on ? 1 : 0;
    },

    onEvent(ev, game) {
      const W = game.world.W;
      if (ev.type === 'hit') {
        const k = Math.min(1, ev.power / 4);
        spawn(ev.x, ev.y, 4 + Math.round(k * 22), 0.4 + k * 1.6, COLORS[ev.player]);
        if (k > 0.55) shock = { x: ev.x, y: ev.y, age: 0, force: 0.35 * k };
      } else if (ev.type === 'wall') {
        const k = Math.min(1, ev.power / 4);
        if (k > 0.08) spawn(ev.x, ev.y, 2 + Math.round(k * 10), 0.3 + k, [0.5, 0.65, 1.0], 0.022);
      } else if (ev.type === 'net') {
        netPulse = Math.min(1, 0.35 + ev.power / 4);
        netY = ev.y;
        netPhase = 0;
        spawn(W / 2, ev.y, 6, 0.5, [0.5, 1.0, 0.72], 0.02);
      } else if (ev.type === 'score') {
        const gx = ev.scorer === 1 ? 0 : W;
        flash[ev.scorer === 1 ? 0 : 1] = 1;
        shock = { x: gx, y: 0.5, age: 0, force: 1 };
        shake = 1;
        spawn(gx, 0.5, 90, 2.4, COLORS[ev.scorer], 0.04);
        spawn(gx, 0.5, 40, 1.2, PUCK_COLOR, 0.03);
      } else if (ev.type === 'win') {
        for (let i = 0; i < 6; i++) spawn(Math.random() * W, Math.random(), 30, 1.5, COLORS[ev.winner], 0.04);
      }
    },

    render(game, L, time, dt) {
      const w = game.world;
      const p = w.puck;

      // Animations visuelles.
      intro += (introTarget - intro) * Math.min(1, dt * 5);
      netPulse *= Math.exp(-dt * 3.2);
      netPhase += dt * 22;
      if (shock.age >= 0) {
        shock.age += dt;
        if (shock.age > 0.9) shock.age = -1;
      }
      flash[0] *= Math.exp(-dt * 2.5);
      flash[1] *= Math.exp(-dt * 2.5);
      shake = Math.max(0, shake - dt * 2.5);

      // Traînée : un échantillon toutes les 8 ms, les plus anciens s'effacent.
      trailTimer += dt;
      const speed = w.puckActive ? Math.hypot(p.vx, p.vy) : 0;
      while (trailTimer >= 0.008) {
        trailTimer -= 0.008;
        trail.copyWithin(3, 0, (TRAIL - 1) * 3);
        trail[0] = p.x;
        trail[1] = p.y;
        trail[2] = w.puckActive ? Math.min(1, speed / 3.2) : 0;
        for (let i = 1; i < TRAIL; i++) trail[i * 3 + 2] *= 0.86;
      }

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
        q.vx *= Math.exp(-dt * 3);
        q.vy *= Math.exp(-dt * 3);
      }

      // Passe 1 : la table.
      gl.disable(gl.BLEND);
      gl.useProgram(table.p);
      setTransform(table.u, L);
      const u = table.u;
      gl.uniform1f(u.uAspect, w.W);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uGoalHalf, game.cfg.goalHalf);
      gl.uniform1f(u.uIntro, intro);
      gl.uniform3f(u.uPuck, p.x, p.y, w.puckActive ? p.r : 0);
      gl.uniform3f(u.uM0, w.mallets[0].x, w.mallets[0].y, w.mallets[0].r);
      gl.uniform3f(u.uM1, w.mallets[1].x, w.mallets[1].y, w.mallets[1].r);
      gl.uniform4f(u.uNet, netPulse, netY, netPhase, 0);
      gl.uniform4f(u.uShock, shock.x, shock.y, shock.age, shock.force);
      gl.uniform2f(u.uFlash, flash[0], flash[1]);
      gl.uniform3fv(u.uTrail, trail);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Passe 2 : les étincelles, en lumière additive.
      const n = particles.length;
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          const q = particles[i];
          const o = i * STRIDE;
          partData[o] = q.x;
          partData[o + 1] = q.y;
          partData[o + 2] = q.size;
          partData[o + 3] = q.c[0];
          partData[o + 4] = q.c[1];
          partData[o + 5] = q.c[2];
          partData[o + 6] = (q.life / q.max) * intro;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(parts.p);
        setTransform(parts.u, L);
        gl.bindVertexArray(partVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, partData, 0, n * STRIDE);
        gl.drawArrays(gl.POINTS, 0, n);
      }
      gl.bindVertexArray(null);
    },
  };
}
