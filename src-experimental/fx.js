import * as THREE from 'three';
import { scene, camera, renderer, onUpdate } from './world.js';
import { Q } from './quality.js';
import { $, rand, V3 } from './util.js';

/* =====================================================================
   FX: GPU point-cloud particles (one draw call per kind) with colour ramps,
   persistent emitters, wind, physics debris + glass shards, shockwaves, flash.
   ===================================================================== */
export const WIND = V3(2.6, 0, 1.1); // m/s, smoke / ash / steam drift

function radialTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const puffTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
const smokeTex = (() => { // lumpy smoke puff
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const px = 64 + rand(-30, 30), py = 64 + rand(-30, 30), r = rand(14, 34);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const paperTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(6, 3, 20, 26); x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 6; i++) x.fillRect(9, 8 + i * 3.4, 14, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

/** additive glow sprite (lights, beacons) */
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1); return s;
}

const ramp = (stops) => stops.map(([t, hex]) => [t, new THREE.Color(hex)]);
const KINDS = {
  fire:  { n: 900, add: true, tex: puffTex, gravity: -3, drag: 0.6, wind: 0.3, ramp: ramp([[0, '#fff4c8'], [0.18, '#ffc35a'], [0.45, '#ff6a1e'], [0.75, '#a02c10'], [1, '#2a1712']]) },
  ember: { n: 300, add: true, tex: puffTex, gravity: -1.5, drag: 0.2, wind: 0.8, flutter: 2.5, ramp: ramp([[0, '#ffe08a'], [0.6, '#ff7a2a'], [1, '#601a08']]) },
  spark: { n: 400, add: true, tex: puffTex, gravity: 18, drag: 0.1, wind: 0, ramp: ramp([[0, '#fffbe0'], [0.4, '#ffd27a'], [1, '#ff5a10']]) },
  smoke: { n: 1100, add: false, tex: smokeTex, gravity: -1.2, drag: 0.35, wind: 1, fog: true, ramp: ramp([[0, '#6a4a3c'], [0.15, '#4a3e40'], [0.5, '#35313a'], [1, '#2a2830']]) },
  dust:  { n: 500, add: false, tex: smokeTex, gravity: 0.3, drag: 1.2, wind: 0.5, fog: true, ramp: ramp([[0, '#9a8e80'], [1, '#6e665e']]) },
  steam: { n: 400, add: false, tex: smokeTex, gravity: -2.2, drag: 0.6, wind: 0.8, fog: true, ramp: ramp([[0, '#f2f2f6'], [1, '#c8c8d0']]) },
  water: { n: 1400, add: false, tex: puffTex, gravity: 9.8, drag: 0.15, wind: 0.15, ramp: ramp([[0, '#e4f0ff'], [1, '#b6cde6']]) },
  ash:   { n: 500, add: false, tex: puffTex, gravity: 0.6, drag: 1.5, wind: 1, flutter: 1.2, ramp: ramp([[0, '#3a3634'], [1, '#55504c']]) },
  paper: { n: 260, add: false, tex: paperTex, gravity: 0.7, drag: 1.4, wind: 1, flutter: 1.8, ramp: ramp([[0, '#f4efe6'], [1, '#c9c2b6']]) },
  trail: { n: 240, add: false, tex: puffTex, gravity: 0, drag: 0.4, wind: 0.6, fog: true, ramp: ramp([[0, '#d9d4e6'], [1, '#b8b4c4']]) },
};

const pointVert = `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor; varying float vDepth;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z; vAlpha = aAlpha; vColor = aColor;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const pointFrag = `
  uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float uFog; uniform float uAdd;
  varying float vAlpha; varying vec3 vColor; varying float vDepth;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    float f = uFog * smoothstep(fogNear, fogFar, vDepth);
    vec3 col = mix(vColor * t.rgb, fogColor, f * (1.0 - uAdd));
    float a = t.a * vAlpha * (1.0 - f * uAdd);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`;

const systems = {};
for (const [k, cfg] of Object.entries(KINDS)) {
  const n = Math.max(32, Math.floor(cfg.n * Q.particles));
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), color = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cfg.tex }, uScale: { value: 400 }, fogColor: { value: scene.fog.color }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far }, uFog: { value: cfg.fog ? 1 : 0.4 }, uAdd: { value: cfg.add ? 1 : 0 } },
    vertexShader: pointVert, fragmentShader: pointFrag, transparent: true, depthWrite: false,
    blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = cfg.add ? 6 : 5; scene.add(pts);
  const P = Array.from({ length: n }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, op: 1, seed: Math.random() * 10 }));
  systems[k] = { cfg, n, geo, mat, P, next: 0, pos, size, alpha, color };
}

/** spawn one particle: kind, position, velocity, life (s), size (m), grow (x size at end), opacity */
export function spawn(kind, p, v, life, size, grow = 0, op = 1) {
  const s = systems[kind]; if (!s) return;
  // ring buffer: reuse the next slot (oldest particle) so heavy emitters never stall
  const q = s.P[s.next]; s.next = (s.next + 1) % s.n;
  q.alive = true; q.x = p.x; q.y = p.y; q.z = p.z; q.vx = v.x; q.vy = v.y; q.vz = v.z;
  q.age = 0; q.life = life; q.size = size; q.grow = grow; q.op = op;
}

const _c = new THREE.Color();
function rampColor(r, t) {
  for (let i = 1; i < r.length; i++) if (t <= r[i][0]) { const a = r[i - 1], b = r[i]; return _c.copy(a[1]).lerp(b[1], (t - a[0]) / (b[0] - a[0])); }
  return _c.copy(r[r.length - 1][1]);
}

/* ---------- persistent emitters ---------- */
const emitters = new Set();
/** opts: { kind, pos: Vector3 | () => Vector3, rate (per s), spread [x,y,z], vel [x,y,z], velJ [x,y,z], life [a,b], size [a,b], grow, op, active?: () => bool } */
export function addEmitter(opts) { const e = { acc: 0, rate: 10, spread: [0, 0, 0], vel: [0, 0, 0], velJ: [0, 0, 0], life: [1, 2], size: [1, 2], grow: 1, op: 1, ...opts }; emitters.add(e); return e; }
export function removeEmitter(e) { emitters.delete(e); }
export function clearEmitters() { emitters.clear(); }
const _ep = V3(0, 0, 0), _ev = V3(0, 0, 0);
function runEmitters(dt) {
  for (const e of emitters) {
    if (e.active && !e.active()) continue;
    e.acc += dt * e.rate * Q.particles;
    if (e.acc < 1) continue;
    const base = typeof e.pos === 'function' ? e.pos() : e.pos; if (!base) { e.acc = 0; continue; }
    while (e.acc >= 1) {
      e.acc -= 1;
      _ep.set(base.x + rand(-1, 1) * e.spread[0], base.y + rand(-1, 1) * e.spread[1], base.z + rand(-1, 1) * e.spread[2]);
      _ev.set(e.vel[0] + rand(-1, 1) * e.velJ[0], e.vel[1] + rand(-1, 1) * e.velJ[1], e.vel[2] + rand(-1, 1) * e.velJ[2]);
      spawn(e.kind, _ep, _ev, rand(e.life[0], e.life[1]), rand(e.size[0], e.size[1]), e.grow, e.op);
    }
  }
}

onUpdate((dt, now) => {
  runEmitters(dt);
  const scale = (renderer.domElement.height * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  for (const s of Object.values(systems)) {
    const { cfg, P, pos, size, alpha, color } = s;
    s.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < s.n; i++) {
      const q = P[i];
      if (!q.alive) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      q.age += dt;
      if (q.age >= q.life) { q.alive = false; alpha[i] = 0; size[i] = 0; continue; }
      const k = q.age / q.life;
      q.vy -= cfg.gravity * dt;
      const d = Math.exp(-cfg.drag * dt);
      q.vx = q.vx * d + WIND.x * cfg.wind * (1 - d); q.vz = q.vz * d + WIND.z * cfg.wind * (1 - d);
      if (cfg.drag > 0.3) q.vy *= d;
      if (cfg.flutter) { q.vx += Math.sin(now * 3 + q.seed * 7) * cfg.flutter * dt; q.vz += Math.cos(now * 2.3 + q.seed * 5) * cfg.flutter * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05 && cfg.gravity > 0) { q.y = 0.05; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; }
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
      size[i] = q.size * (1 + q.grow * k);
      alpha[i] = q.op * Math.min(1, k * 8) * (1 - k);
      const c = rampColor(cfg.ramp, k); color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;
    }
    s.geo.attributes.position.needsUpdate = true; s.geo.attributes.aSize.needsUpdate = true;
    s.geo.attributes.aAlpha.needsUpdate = true; s.geo.attributes.aColor.needsUpdate = true;
  }
});

export function clearParticles() {
  for (const s of Object.values(systems)) { s.P.forEach((q) => (q.alive = false)); s.alpha.fill(0); s.size.fill(0); s.geo.attributes.aAlpha.needsUpdate = true; }
  clearDebris(); clearEmitters();
}

/* ---------- physics debris: concrete chunks + glass shards that bounce and settle ---------- */
let groundFn = () => 0.25;
export function setGroundFn(fn) { groundFn = fn; }
const chunkMat = new THREE.MeshStandardMaterial({ color: 0x77716c, roughness: 0.95 });
const shardMat = new THREE.MeshStandardMaterial({ color: 0xbfd4e6, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75, side: THREE.DoubleSide, envMapIntensity: 2 });
const chunkGeo = new THREE.DodecahedronGeometry(0.5, 0);
const shardGeo = new THREE.BufferGeometry().setFromPoints([V3(-0.5, -0.4, 0), V3(0.5, -0.2, 0), V3(0.05, 0.55, 0)]); shardGeo.computeVertexNormals();
const DEB = {
  chunk: { mesh: new THREE.InstancedMesh(chunkGeo, chunkMat, Math.floor(320 * Q.destruction)), list: [], next: 0, half: 0.3, bounce: 0.25 },
  shard: { mesh: new THREE.InstancedMesh(shardGeo, shardMat, Math.floor(520 * Q.destruction)), list: [], next: 0, half: 0.02, bounce: 0.15 },
};
for (const d of Object.values(DEB)) {
  d.mesh.count = 0; d.mesh.castShadow = d === DEB.chunk; d.mesh.receiveShadow = true; d.mesh.frustumCulled = false; scene.add(d.mesh);
  d.list = Array.from({ length: d.mesh.instanceMatrix.count }, () => ({ alive: false, p: V3(0, 0, 0), v: V3(0, 0, 0), r: new THREE.Euler(), w: V3(0, 0, 0), s: V3(1, 1, 1), rest: false }));
}
/** throw a piece of debris: 'chunk' (concrete) or 'shard' (glass) */
export function debris(type, p, v, scale = 1) {
  const d = DEB[type], q = d.list[d.next]; d.next = (d.next + 1) % d.list.length;
  q.alive = true; q.rest = false; q.p.copy(p); q.v.copy(v);
  q.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); q.w.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
  if (type === 'chunk') q.s.set(rand(0.4, 1.4), rand(0.3, 0.9), rand(0.4, 1.3)).multiplyScalar(scale);
  else q.s.set(rand(0.15, 0.6), rand(0.15, 0.6), 1).multiplyScalar(scale);
  d.mesh.count = Math.max(d.mesh.count, Math.min(d.list.length, d.list.indexOf(q) + 1));
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
onUpdate((dt) => {
  for (const [type, d] of Object.entries(DEB)) {
    let dirty = false;
    d.list.forEach((q, i) => {
      if (!q.alive || q.rest) return;
      dirty = true;
      q.v.y -= 9.8 * dt; q.p.addScaledVector(q.v, dt);
      q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      if (type === 'shard') { q.v.multiplyScalar(Math.exp(-0.25 * dt)); }
      const g = groundFn(q.p.x, q.p.z) + d.half * q.s.y;
      if (q.p.y < g) {
        q.p.y = g; q.v.y = -q.v.y * d.bounce; q.v.x *= 0.55; q.v.z *= 0.55; q.w.multiplyScalar(0.5);
        if (Math.abs(q.v.y) < 0.8) { q.rest = true; if (type === 'shard') q.r.x = -Math.PI / 2 + rand(-0.15, 0.15); }
      }
      _q.setFromEuler(q.r); _m.compose(q.p, _q, q.s); d.mesh.setMatrixAt(i, _m);
    });
    if (dirty) d.mesh.instanceMatrix.needsUpdate = true;
  }
});
function clearDebris() {
  for (const d of Object.values(DEB)) { d.list.forEach((q) => { q.alive = false; }); d.mesh.count = 0; d.next = 0; }
}
/** place debris already at rest (for scattered rubble) */
export function restingDebris(type, x, z, scale = 1) {
  debris(type, V3(x, groundFn(x, z) + 0.05, z), V3(0, 0, 0), scale);
  const d = DEB[type], q = d.list[(d.next - 1 + d.list.length) % d.list.length];
  q.rest = true; if (type === 'shard') q.r.x = -Math.PI / 2;
  _q.setFromEuler(q.r); q.p.y = groundFn(x, z) + d.half * q.s.y; _m.compose(q.p, _q, q.s);
  d.mesh.setMatrixAt(d.list.indexOf(q), _m); d.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- shockwave ring ---------- */
const rings = [];
export function shockwave(p, normal, maxR = 60, life = 1.1, color = 0xffd8a8) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.position.copy(p); m.lookAt(p.clone().add(normal)); scene.add(m); rings.push({ m, age: 0, life, maxR });
}
onUpdate((dt) => {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.age += dt; const k = r.age / r.life;
    if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const s = 1 + r.maxR * (1 - Math.pow(1 - k, 3)); r.m.scale.set(s, s, s); r.m.material.opacity = 0.6 * (1 - k);
  }
});

export function flash() {
  const el = $('flash'); el.style.transition = 'none'; el.style.opacity = '1'; void el.offsetWidth;
  el.style.transition = 'opacity 1.6s ease-out'; el.style.opacity = '0';
}
