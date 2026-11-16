// Shaders GLSL. La table entière est dessinée par un seul shader plein écran :
// chaque pixel calcule sa distance aux objets et en déduit la lumière.

export const TABLE_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Conversion commune pixel écran <-> table (voir display.js).
const TRANSFORM = `
uniform vec2 uRes;     // taille du canvas en px
uniform vec2 uOrigin;  // coin haut gauche de la table en px (origine en haut à gauche)
uniform float uScale;  // px par unité de table
uniform float uLong;   // grand côté de la table en px
uniform float uRot;    // 1 si la table est tournée
`;

export const TABLE_FS = `#version 300 es
precision highp float;
${TRANSFORM}
uniform float uAspect;
uniform float uTime;
uniform float uGoalHalf;
uniform float uIntro;      // 0..1 allumage de la table
uniform vec3 uPuck;        // x, y, rayon (rayon <= 0 : caché)
uniform vec3 uM0;          // maillet 0 : x, y, rayon
uniform vec3 uM1;
uniform vec4 uNet;         // impulsion, y de l'impact, phase, inutilisé
uniform vec4 uShock;       // x, y, âge (s, < 0 = éteint), force
uniform vec2 uFlash;       // éclat du but gauche, du but droit
uniform vec3 uTrail[16];   // x, y, intensité
out vec4 outColor;

const vec3 C0 = vec3(0.10, 0.80, 1.00);  // joueur 0
const vec3 C1 = vec3(1.00, 0.16, 0.52);  // joueur 1
const vec3 CN = vec3(0.50, 1.00, 0.72);  // filet
const vec3 CP = vec3(1.00, 0.86, 0.50);  // palet

vec2 toTable(vec2 s) {
  if (uRot < 0.5) return (s - uOrigin) / uScale;
  return vec2((uOrigin.y + uLong - s.y) / uScale, (s.x - uOrigin.x) / uScale);
}

float glow(float d, float w) {
  float g = w / (max(d, 0.0) + w);
  return g * g;
}

vec3 mallet(vec2 p, vec3 m, vec3 c) {
  float d = length(p - m.xy);
  float r = m.z;
  vec3 col = c * glow(abs(d - r * 0.9), 0.006) * 1.3;
  col += c * glow(abs(d - r * 0.42), 0.004) * 0.7;
  col += c * 0.16 * smoothstep(r, r - 0.01, d);
  col += c * 0.30 * exp(-max(d - r, 0.0) * 13.0);
  return col;
}

float goalDist(vec2 p, float gx) {
  return length(vec2(p.x - gx, max(abs(p.y - 0.5) - uGoalHalf, 0.0)));
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = toTable(s);
  float W = uAspect;

  // Onde de choc : déforme la table autour d'un anneau qui s'élargit.
  if (uShock.z >= 0.0) {
    vec2 d = p - uShock.xy;
    float l = length(d) + 1e-4;
    float ring = exp(-pow((l - uShock.z * 1.7) * 9.0, 2.0));
    float fade = max(0.0, 1.0 - uShock.z / 0.9);
    p -= d / l * ring * 0.04 * uShock.w * fade;
  }

  vec2 q = abs(p - vec2(W * 0.5, 0.5)) - vec2(W * 0.5, 0.5);
  float dBox = max(q.x, q.y); // < 0 dans la table
  float inside = smoothstep(0.004, -0.004, dBox);
  float side = smoothstep(-0.02, 0.02, p.x - W * 0.5);
  vec3 tint = mix(C0, C1, side);

  // Sol : fond sombre, teinte du camp, quadrillage, rond central.
  vec3 col = vec3(0.010, 0.014, 0.030);
  col += tint * 0.030 * (0.6 + 0.4 * abs(p.x - W * 0.5) / (W * 0.5));
  vec2 g = abs(fract(p * 10.0) - 0.5);
  col += tint * 0.045 * smoothstep(0.47, 0.5, max(g.x, g.y));
  col += CN * 0.22 * smoothstep(0.007, 0.0, abs(length(p - vec2(W * 0.5, 0.5)) - 0.16));
  col *= inside;

  // Bords, éteints devant les buts.
  float edgeX = min(abs(p.x), abs(p.x - W));
  float mouth = smoothstep(uGoalHalf + 0.005, uGoalHalf - 0.005, abs(p.y - 0.5));
  float wallMask = 1.0 - mouth * smoothstep(0.10, 0.0, edgeX);
  col += vec3(0.30, 0.45, 1.0) * glow(abs(dBox), 0.004) * 0.9 * wallMask;

  // Buts : chacun à la couleur de son défenseur, avec un éclat quand on marque.
  float dg0 = goalDist(p, 0.0);
  float dg1 = goalDist(p, W);
  col += C0 * glow(dg0, 0.006) * 1.2;
  col += C1 * glow(dg1, 0.006) * 1.2;
  col += C1 * uFlash.x * exp(-dg0 * 4.0) * 2.2;
  col += C0 * uFlash.y * exp(-dg1 * 4.0) * 2.2;

  // Filet : ligne de néon sur le pli, qui ondule à chaque passage du palet.
  float inY = step(0.0, p.y) * step(p.y, 1.0);
  float wave = sin(p.y * 26.0 + uTime * 2.0) * 0.0022;
  wave += uNet.x * sin((p.y - uNet.y) * 36.0 - uNet.z) * exp(-abs(p.y - uNet.y) * 4.5) * 0.030;
  float dn = abs(p.x - W * 0.5 - wave);
  col += CN * glow(dn, 0.0045) * (0.85 + 2.2 * uNet.x) * inY;
  col += CN * uNet.x * exp(-dn * 16.0) * exp(-abs(p.y - uNet.y) * 3.0) * 0.9 * inY;

  // Traînée du palet.
  for (int i = 0; i < 16; i++) {
    vec3 t = uTrail[i];
    float d = length(p - t.xy);
    col += mix(CP, vec3(1.0, 0.35, 0.15), 1.0 - t.z) * t.z * exp(-d * d * 520.0) * 0.55;
  }

  col += mallet(p, uM0, C0);
  col += mallet(p, uM1, C1);

  if (uPuck.z > 0.0) {
    float d = length(p - uPuck.xy);
    float r = uPuck.z;
    col += vec3(1.0, 0.97, 0.88) * smoothstep(r, r - 0.006, d) * 0.95;
    col -= vec3(0.5) * smoothstep(0.004, 0.0, abs(d - r * 0.55)) * step(d, r);
    col += CP * exp(-max(d - r, 0.0) * 20.0) * 0.85;
  }

  col *= uIntro;
  col = 1.0 - exp(-max(col, 0.0) * 1.5);
  outColor = vec4(col, 1.0);
}
`;

export const PARTICLE_VS = `#version 300 es
${TRANSFORM}
in vec2 aPos;    // position table
in float aSize;  // taille en unités de table
in vec4 aCol;
out vec4 vCol;
void main() {
  vec2 s;
  if (uRot < 0.5) s = uOrigin + aPos * uScale;
  else s = vec2(uOrigin.x + aPos.y * uScale, uOrigin.y + uLong - aPos.x * uScale);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, aSize * uScale);
  vCol = aCol;
}
`;

export const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 20.0) * vCol.a;
  outColor = vec4(vCol.rgb * a, a);
}
`;
