import * as THREE from 'three';
import { scene, onUpdate } from './world.js';
import { TOWER_W, FLOOR_H, IMPACT_FLOOR, TOWER_BASE } from './config.js';
import { groundY } from './tower.js';
import { people, Humanoid, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, TOPS, BOTTOMS } from './people.js';
import { Sound } from './audio.js';

/* =====================================================================
   EMERGENCY RESPONSE: what happens after the impact (fictional city).
   Police, ambulances and fire trucks arrive with sirens and flashing
   lights, aerial ladders and hoses attack the fires, paramedics tend to
   seated survivors under silver blankets, police tape goes up and a
   helicopter circles with a searchlight.
   main.js calls startResponders() when the evacuation begins, or press
   the "Send responders" button to test it any time.
   All responders and survivors here are generic characters (no photos).
   ===================================================================== */
export const EMERGENCY = {
  autoStart: false,    // true = also start by itself once people have been reacting for armDelay seconds
  armDelay: 6,         // seconds after the impact before the first siren (autoStart only)
  roadWest: -12,       // x of the road running along the tower's impact face
  roadEast: 12,        // x of the road on the plaza side (evacuees cross it near z = 0)
  startDist: 120,      // how far out vehicles start driving from
  triage: { x: 14.6, z: -5.6 },  // paramedics' spot; the survivors' bench sits 3.2 east of it
  benchLen: 6.2,
  hoseZ: [-6, 3],      // where the two ground hose crews stand along the impact face
  tapeZ: [-30, 30],    // police tape across the west road, north and south of the scene
  tapeHalf: 3.5,
  survivors: 10,
  helicopter: true,
};

/* ---------- helpers ---------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const IMPACT = V3(-TOWER_W / 2, (IMPACT_FLOOR - 0.5) * FLOOR_H + TOWER_BASE, 0);
const seatZ = (i) => EMERGENCY.triage.z - (EMERGENCY.benchLen - 0.8) / 2 + i * ((EMERGENCY.benchLen - 0.8) / Math.max(1, EMERGENCY.survivors - 1));

const matCache = new Map();
function mat(hex, rough = 0.6, metal = 0.1, extra = {}) {
  const key = `${hex}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}
function box(w, h, d, color, x, y, z, parent, rough, metal) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? mat(color, rough, metal) : color);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
function cyl(r, h, color, x, y, z, parent, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), typeof color === 'string' ? mat(color, 0.8, 0) : color);
  m.rotation.z = rotZ; m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const puffTex = canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
const tapeTex = canvasTex(256, 32, (x, w, h) => {
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, w, h); x.fillStyle = '#16151c';
  for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 32, h); x.lineTo(i * 32 + 16, h); x.fill(); }
});
tapeTex.wrapS = THREE.RepeatWrapping;
const labelTex = (text, bg, fg) => canvasTex(256, 64, (x, w, h) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = '800 40px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
});

/* ---------- scene layer (everything except the water pool lives here and is rebuilt on each start) ---------- */
let layer = new THREE.Group(); scene.add(layer);

/* ---------- water + steam particle pool (persistent) ---------- */
const waterGroup = new THREE.Group(); scene.add(waterGroup);
const waterMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xcfe6ff, transparent: true, opacity: 0.5, depthWrite: false });
const steamMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xe8eaf0, transparent: true, opacity: 0.22, depthWrite: false });
const pool = [], live = [];
for (let i = 0; i < 560; i++) { const s = new THREE.Sprite(waterMat); s.visible = false; waterGroup.add(s); pool.push(s); }

function spawnWater(from, to, tau, spread) {
  const s = pool.pop(); if (!s) return;
  s.material = waterMat; s.visible = true; s.position.copy(from);
  const v = to.clone().sub(from).divideScalar(tau); v.y += 4.9 * tau;
  v.x += rand(-spread, spread); v.y += rand(-spread, spread) * 0.5; v.z += rand(-spread, spread);
  live.push({ s, v, age: 0, life: tau * 1.15 + 0.2, size: rand(0.5, 0.9), steam: false });
}
function spawnSteam(pos) {
  const s = pool.pop(); if (!s) return;
  s.material = steamMat; s.visible = true; s.position.copy(pos);
  live.push({ s, v: V3(rand(1, 3), rand(2, 4), rand(-1, 1)), age: 0, life: rand(2.5, 3.5), size: rand(3, 5), steam: true });
}
function updateWater(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i]; p.age += dt;
    if (p.age >= p.life || (!p.steam && p.s.position.y < 0.1)) {
      if (!p.steam && p.s.position.y > 10 && Math.random() < 0.18) spawnSteam(p.s.position);
      p.s.visible = false; pool.push(p.s); live.splice(i, 1); continue;
    }
    if (!p.steam) p.v.y -= 9.8 * dt;
    p.s.position.addScaledVector(p.v, dt);
    const k = p.age / p.life, sz = p.steam ? p.size * (1 + k * 2.2) : p.size * (1 + p.age * 0.6);
    p.s.scale.set(sz, sz, 1);
  }
}
function clearWater() { live.forEach((p) => { p.s.visible = false; pool.push(p.s); }); live.length = 0; }

/* =====================================================================
   VEHICLES (built in code, forward = +Z)
   ===================================================================== */
function buildVehicle(kind) {
  const g = new THREE.Group();
  const isFire = kind === 'aerial' || kind === 'pumper';
  const spec = isFire ? { L: 9.5, W: 2.6, color: '#c4221d', label: 'FIRE', lbg: '#c4221d', lfg: '#f6f6f8' }
    : kind === 'ambulance' ? { L: 6.2, W: 2.3, color: '#f2f2f4', label: 'MEDIC', lbg: '#f2f2f4', lfg: '#d83a2e' }
    : { L: 4.7, W: 1.95, color: '#17181f', label: 'POLICE', lbg: '#17181f', lfg: '#f6f6f8' };
  const { L, W } = spec;
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 }), blueMat = new THREE.MeshBasicMaterial({ color: 0x2a5cff });
  let roofY;

  if (kind === 'police') {
    box(W, 0.75, L, spec.color, 0, 0.75, 0, g, 0.4, 0.3);
    box(W * 0.9, 0.62, L * 0.5, spec.color, 0, 1.4, -0.1, g, 0.4, 0.3);
    box(W * 0.9 + 0.02, 0.5, L * 0.5 + 0.02, '#202833', 0, 1.42, -0.1, g, 0.2, 0.6);       // glass band
    box(W + 0.02, 0.5, 1.5, '#f2f2f4', 0, 0.78, 0.7, g, 0.5, 0.1); box(W + 0.02, 0.5, 1.5, '#f2f2f4', 0, 0.78, -0.9, g, 0.5, 0.1); // white doors
    [[1, 1.4], [1, -1.5], [-1, 1.4], [-1, -1.5]].forEach(([s, z]) => cyl(0.36, 0.28, '#101014', s * W / 2, 0.36, z, g, Math.PI / 2));
    roofY = 1.75;
  } else if (kind === 'ambulance') {
    box(W, 2.1, L * 0.62, spec.color, 0, 1.55, -L * 0.18, g, 0.4, 0.2);
    box(W * 0.96, 1.5, L * 0.3, spec.color, 0, 1.15, L * 0.33, g, 0.4, 0.2);
    box(W * 0.9, 0.55, 0.06, '#202833', 0, 1.5, L * 0.48, g, 0.2, 0.6);                    // windscreen
    box(W + 0.02, 0.24, L * 0.9, '#d83a2e', 0, 1.1, 0, g, 0.5, 0.1);                        // stripe
    [[1, 1.9], [1, -1.9], [-1, 1.9], [-1, -1.9]].forEach(([s, z]) => cyl(0.5, 0.32, '#101014', s * W / 2, 0.5, z, g, Math.PI / 2));
    roofY = 2.6;
  } else {
    box(W, 2.2, 2.6, spec.color, 0, 1.6, L * 0.34, g, 0.45, 0.2);                           // cab
    box(W * 0.9, 0.7, 0.06, '#202833', 0, 2.0, L * 0.34 + 1.32, g, 0.2, 0.6);               // windscreen
    box(W, 2.4, L * 0.55, spec.color, 0, 1.7, -L * 0.1, g, 0.45, 0.2);                      // body
    box(W + 0.02, 0.22, L * 0.55, '#f6f6f8', 0, 1.25, -L * 0.1, g, 0.5, 0.1);               // stripe
    [[1, L * 0.34], [-1, L * 0.34], [1, -L * 0.05], [-1, -L * 0.05], [1, -L * 0.3], [-1, -L * 0.3]].forEach(([s, z]) => cyl(0.55, 0.36, '#101014', s * W / 2, 0.55, z, g, Math.PI / 2));
    roofY = 3.0;
  }
  // side labels
  const lt = new THREE.MeshBasicMaterial({ map: labelTex(spec.label, spec.lbg, spec.lfg), toneMapped: false });
  [1, -1].forEach((s) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), lt); p.position.set(s * (W / 2 + 0.02), kind === 'police' ? 0.8 : 1.7, -0.1); p.rotation.y = s * Math.PI / 2; g.add(p); });
  // light bar + glow
  const bar = new THREE.Group(); bar.position.set(0, roofY, kind === 'police' ? -0.1 : L * (isFire ? 0.34 : 0.33)); g.add(bar);
  box(0.55, 0.14, 0.3, redMat, -0.4, 0, 0, bar); box(0.55, 0.14, 0.3, blueMat, 0.4, 0, 0, bar);
  const glow = (c, x) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(3.4, 3.4, 1); s.position.set(x, 0.1, 0); bar.add(s); return s; };
  const glowR = glow(0xff2020, -0.4), glowB = glow(0x2a5cff, 0.4);
  // head and tail lights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), tl = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const fz = kind === 'police' ? L / 2 : (kind === 'ambulance' ? L * 0.48 : L * 0.34 + 1.3);
  [-1, 1].forEach((s) => { box(0.3, 0.16, 0.06, hl, s * W * 0.32, kind === 'police' ? 0.8 : 0.95, fz, g); box(0.3, 0.16, 0.06, tl, s * W * 0.32, kind === 'police' ? 0.85 : 1.1, -L / 2, g); });

  const v = { g, kind, L, W, redMat, blueMat, glowR, glowB, bar, path: null, driving: false, parked: false, speed: 0, heading: 0, parkHeading: 0, onPark: null, light: null, ladder: null };
  if (kind === 'aerial') {
    const LAD = 34, pivot = new THREE.Group(); pivot.position.set(0, 3.25, -L * 0.33); pivot.rotation.z = 1.46; g.add(pivot);
    const geo = new THREE.BoxGeometry(LAD, 0.4, 0.7); geo.translate(LAD / 2, 0, 0);
    const arm = new THREE.Mesh(geo, mat('#dcdce0', 0.5, 0.4)); arm.scale.x = 0.05; arm.castShadow = true; pivot.add(arm);
    v.ladder = { pivot, arm, LAD, k: 0.05, startAt: 0 };
  }
  g.visible = false; layer.add(g);
  return v;
}

function placeVehicle(v, start, park, parkHeading) {
  v.start = start.clone(); v.park = park.clone(); v.parkHeading = parkHeading;
  v.g.position.copy(start); v.heading = Math.atan2(park.x - start.x, park.z - start.z); v.g.rotation.y = v.heading;
}
function dispatch(v, withLight) {
  v.g.visible = true; v.driving = true; v.speed = 17;
  if (withLight && !v.light) { v.light = new THREE.PointLight(0xff2020, 300, 32, 2); v.light.position.set(0, 3.5, 0); v.g.add(v.light); }
}
function updateVehicle(v, dt, now) {
  if (!v.g.visible) return;
  const flash = Math.floor(now * 6) % 2 === 0;
  v.redMat.color.setHex(flash ? 0xff2020 : 0x3a0505); v.blueMat.color.setHex(flash ? 0x0b1a44 : 0x2a5cff);
  v.glowR.visible = flash; v.glowB.visible = !flash;
  if (v.light) { v.light.color.setHex(flash ? 0xff2020 : 0x2a5cff); }
  if (v.driving) {
    const pos = v.g.position, dx = v.park.x - pos.x, dz = v.park.z - pos.z, d = Math.hypot(dx, dz);
    const target = Math.min(17, 2 + d * 0.45);
    v.speed += (target - v.speed) * Math.min(1, dt * 2.5);
    const want = d > 6 ? Math.atan2(dx, dz) : v.parkHeading;
    v.heading += angDiff(v.heading, want) * Math.min(1, dt * 4);
    const step = Math.min(d, v.speed * dt);
    pos.x += (dx / (d || 1)) * step; pos.z += (dz / (d || 1)) * step; pos.y = 0.06;
    v.g.rotation.y = v.heading;
    if (d < 0.12) { v.driving = false; v.parked = true; v.g.rotation.y = v.parkHeading; v.parkedAt = now; v.onPark?.(v); }
  }
  if (v.ladder && v.parked) {
    const l = v.ladder;
    if (now - v.parkedAt > 1.2 && l.k < 1) l.k = Math.min(1, l.k + dt / 7);
    l.arm.scale.x = l.k;
  }
}
const ladderTip = (v) => v.ladder.arm.localToWorld(V3(v.ladder.LAD * v.ladder.arm.scale.x, 0, 0));

/* =====================================================================
   RESPONDERS AND SURVIVORS (Humanoid rigs from people.js, generic looks)
   ===================================================================== */
const KEYS = ['drop', 'spineX', 'headX', 'headY', 'shLX', 'shLZ', 'elLX', 'shRX', 'shRZ', 'elRX', 'hipLX', 'knLX', 'hipRX', 'knRX'];
const clearPose = (t) => { for (const k of KEYS) t[k] = 0; };
function gait(t, phi, k = 1) {
  const s = Math.sin(phi), c = Math.cos(phi); clearPose(t);
  t.hipLX = -0.42 * s * k; t.hipRX = 0.42 * s * k; t.knLX = 0.1 + 0.85 * Math.max(0, c) * k; t.knRX = 0.1 + 0.85 * Math.max(0, -c) * k;
  t.shLX = 0.38 * s * k; t.shRX = -0.38 * s * k; t.elLX = t.elRX = -0.3; t.shLZ = 0.08; t.shRZ = -0.08; t.spineX = 0.05; t.drop = -0.03 * Math.abs(c);
}
const POSES = {
  stand(t, now, s) { clearPose(t); t.shLZ = 0.08; t.shRZ = -0.08; t.elLX = t.elRX = -0.2; t.headY = Math.sin(now * 0.3 + s) * 0.4; t.spineX = Math.sin(now * 1.5 + s) * 0.01; },
  spray(t, now, s) { clearPose(t); t.spineX = 0.1 + Math.sin(now * 9 + s) * 0.01; t.headX = -0.05; t.shLX = -1.35; t.shRX = -1.2; t.elLX = -0.5; t.elRX = -0.7; t.shLZ = 0.1; t.shRZ = -0.12; t.hipLX = -0.22; t.knLX = 0.25; t.hipRX = 0.28; t.knRX = 0.12; },
  kneel(t, now, s) { clearPose(t); t.drop = -0.42; t.hipLX = -1.15; t.knLX = 1.3; t.hipRX = -1.45; t.knRX = 2.3; t.spineX = 0.25; t.headX = 0.15; t.shLX = -0.7; t.shRX = -0.55; t.elLX = -0.8; t.elRX = -0.9; t.headY = Math.sin(now * 0.4 + s) * 0.1; },
  sit(t, now, s) { clearPose(t); t.drop = -0.45; t.hipLX = t.hipRX = -1.5; t.knLX = t.knRX = 1.5; t.spineX = 0.28 + Math.sin(now * 1.3 + s) * 0.01; t.headX = 0.35; t.shLX = t.shRX = -0.5; t.shLZ = 0.12; t.shRZ = -0.12; t.elLX = t.elRX = -0.9; },
  direct(t, now, s) { clearPose(t); t.shRX = -1.5 + Math.sin(now * 2.2 + s) * 0.2; t.shRZ = -0.2; t.elRX = -0.2; t.shLZ = 0.08; t.elLX = -0.2; t.headY = Math.sin(now * 0.5 + s) * 0.5; },
  operate(t, now, s) { clearPose(t); t.shRX = -2.3; t.shRZ = -0.15; t.elRX = -0.2; t.shLX = -0.9; t.elLX = -1.1; t.headX = -0.4; t.headY = Math.sin(now * 0.3 + s) * 0.2; },
};

const LOOKS = {
  fire:   () => ({ outfitTop: '#bf9d3a', outfitBottom: '#8a6a2a', accessory: 'hardhat' }),
  police: () => ({ outfitTop: '#1e2a4a', outfitBottom: '#1a2036', accessory: 'cap' }),
  medic:  () => ({ outfitTop: '#2c7a5a', outfitBottom: '#1f2b3a', accessory: 'none' }),
  civ:    () => ({ outfitTop: pick(TOPS), outfitBottom: pick(BOTTOMS), accessory: Math.random() < 0.2 ? 'glasses' : 'none' }),
};
const actors = [], carriers = [];
class Actor {
  constructor(role) {
    this.h = new Humanoid({ skinTone: pick(SKIN_TONES), hairStyle: pick(HAIR_STYLES), hairColor: pick(HAIR_COLORS), heightScale: rand(0.95, 1.07), headPhoto: null, ...LOOKS[role]() });
    layer.add(this.h.root);
    this.role = role; this.pose = 'stand'; this.path = []; this.phi = 0; this.speed = 1.6; this.heading = rand(-3, 3); this.seed = Math.random() * 10; this.then = 'stand'; this.hold = false;
    this.nozzle = null; this.hose = null; this.h.root.visible = true; actors.push(this);
  }
  at(x, z) { this.h.root.position.set(x, groundY(x, z), z); return this; }
  face(x, z) { const p = this.h.root.position; this.heading = Math.atan2(x - p.x, z - p.z); return this; }
  walk(points, speed, then) { this.path = points.map((p) => ({ x: p.x, z: p.z })); this.speed = speed; this.then = then || 'stand'; this.pose = 'walk'; return this; }
  update(dt, now) {
    const h = this.h, pos = h.root.position;
    if (this.hold) { h.root.rotation.y = this.heading; h.apply(dt, 10); return; } // driven by a Carrier
    if (this.pose === 'walk' && this.path.length) {
      let budget = this.speed * dt;
      while (budget > 0 && this.path.length) {
        const wp = this.path[0], dx = wp.x - pos.x, dz = wp.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.02) this.heading += angDiff(this.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
        if (d <= budget) { pos.x = wp.x; pos.z = wp.z; budget -= d; this.path.shift(); this.phi += d * Math.PI * 2 / (this.speed > 2.5 ? 2.2 : 1.4); }
        else { pos.x += (dx / d) * budget; pos.z += (dz / d) * budget; this.phi += budget * Math.PI * 2 / (this.speed > 2.5 ? 2.2 : 1.4); budget = 0; }
      }
      pos.y = groundY(pos.x, pos.z);
      gait(h.target, this.phi, this.speed > 2.5 ? 1.5 : 1);
      if (!this.path.length) { this.pose = this.then; this.onArrive?.(this); }
    } else (POSES[this.pose] || POSES.stand)(h.target, now, this.seed);
    h.root.rotation.y = this.heading;
    h.apply(dt, this.pose === 'walk' ? 14 : 6);
  }
  hand() { const p = this.h.root.position; return V3(p.x + Math.sin(this.heading) * 0.9, p.y + 1.25, p.z + Math.cos(this.heading) * 0.9); }
}

/* stretcher carried by two paramedics (empty, non-graphic) */
function buildStretcher() {
  const g = new THREE.Group();
  box(0.62, 0.06, 1.9, '#3a3f4a', 0, 0, 0, g); box(0.58, 0.08, 1.8, '#6aa0d8', 0, 0.06, 0, g);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => box(0.05, 0.4, 0.05, '#2a2d36', a * 0.28, -0.2, b * 0.8, g));
  layer.add(g); return g;
}
class Carrier {
  constructor(a, b, stretcher, path, speed, done) {
    this.a = a; this.b = b; this.s = stretcher; this.path = path; this.speed = speed; this.done = done; this.phi = 0; this.dir = 0;
    a.hold = b.hold = true; carriers.push(this);
    const p = V3(path[0].x, 0, path[0].z); this.pos = p;
  }
  update(dt) {
    if (!this.path.length) return;
    const wp = this.path[0], dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, this.speed * dt);
    if (d > 0.01) { this.dir += angDiff(this.dir, Math.atan2(dx, dz)) * Math.min(1, dt * 8); this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; this.phi += step * Math.PI * 2 / 1.4; }
    if (d <= step + 0.01) this.path.shift();
    const fx = Math.sin(this.dir), fz = Math.cos(this.dir);
    [[this.a, 0.95], [this.b, -0.95]].forEach(([ac, off]) => {
      const x = this.pos.x + fx * off, z = this.pos.z + fz * off;
      ac.h.root.position.set(x, groundY(x, z), z); ac.heading = this.dir;
      gait(ac.h.target, this.phi, 0.8); ac.h.target.shLX = ac.h.target.shRX = -0.35; ac.h.target.elLX = ac.h.target.elRX = -0.2;
    });
    const y = groundY(this.pos.x, this.pos.z) + 0.95;
    this.s.position.set(this.pos.x, y, this.pos.z); this.s.rotation.y = this.dir;
    if (!this.path.length) { this.a.hold = this.b.hold = false; this.done?.(); }
  }
}

/* =====================================================================
   SCENE PIECES: tent, bench, tape, helicopter
   ===================================================================== */
function buildTent(x, z) {
  const g = new THREE.Group(), y = groundY(x, z);
  [[-2.6, -1.5], [2.6, -1.5], [-2.6, 1.5], [2.6, 1.5]].forEach(([a, b]) => cyl(0.05, 2.4, '#8a8f99', x + a, y + 1.2, z + b, g));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 0.9, 4), mat('#f4f1ea', 0.9, 0)); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.6); roof.position.set(x, y + 2.85, z); roof.castShadow = true; g.add(roof);
  box(5.2, 0.12, 0.05, '#d83a2e', x, y + 2.45, z + 1.5, g);
  box(1.4, 0.7, 0.8, '#2f3340', x - 1.2, y + 0.35, z - 0.6, g); box(1.0, 0.5, 0.7, '#6aa0d8', x + 1.1, y + 0.25, z - 0.7, g);
  layer.add(g);
}
function buildBench(x, z, len) {
  const y = groundY(x, z);
  const b = box(0.55, 0.08, len, '#6b5a48', x, y + 0.42, z, layer, 0.8, 0);
  box(0.06, 0.4, 0.06, '#3a3f4a', x, y + 0.2, z - len / 2 + 0.2, layer); box(0.06, 0.4, 0.06, '#3a3f4a', x, y + 0.2, z + len / 2 - 0.2, layer);
  return b;
}
const tapes = [];
function buildTape(cx, cz, half) {
  const geo = new THREE.PlaneGeometry(half * 2, 0.14), tex = tapeTex.clone(); tex.needsUpdate = true; tex.repeat.set(half * 2 / 1.5, 1); tex.wrapS = THREE.RepeatWrapping;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  const y = groundY(cx, cz) + 1.0; m.position.set(cx, y, cz); m.scale.x = 0.02; layer.add(m);
  const posts = [-half, 0, half].map((o) => { const p = cyl(0.05, 1.15, '#8a8f99', cx + o, groundY(cx + o, cz) + 0.58, cz, layer); p.visible = o === 0; return p; });
  tapes.push({ m, k: 0.02, posts, cx, half });
}
function updateTape(dt) { tapes.forEach((t) => { t.k = Math.min(1, t.k + dt / 8); t.m.scale.x = t.k; if (t.k > 0.95) t.posts.forEach((p) => (p.visible = true)); }); }

let heli = null;
function buildHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat('#1d2230', 0.4, 0.5)); body.scale.set(1.3, 1.2, 3); g.add(body);
  box(0.4, 0.4, 6, '#1d2230', 0, 0.3, -5, g, 0.5, 0.4);
  const rotor = new THREE.Group(); rotor.position.y = 1.5; g.add(rotor);
  box(13, 0.05, 0.35, '#0e1017', 0, 0, 0, rotor); box(0.35, 0.05, 13, '#0e1017', 0, 0, 0, rotor);
  const tr = new THREE.Group(); tr.position.set(0.3, 0.8, -7.8); g.add(tr); box(0.05, 2.4, 0.2, '#0e1017', 0, 0, 0, tr);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 })); strobe.position.set(0, 1.9, -0.5); g.add(strobe);
  const spot = new THREE.SpotLight(0xfff4d6, 8000, 180, 0.13, 0.5, 2); spot.position.set(0, -1, 3); g.add(spot);
  const tgt = new THREE.Object3D(); layer.add(tgt); spot.target = tgt;
  const coneGeo = new THREE.CylinderGeometry(0.05, 1, 1, 24, 1, true); coneGeo.translate(0, -0.5, 0);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  layer.add(cone);
  g.visible = false; layer.add(g);
  heli = { g, rotor, tr, strobe, tgt, cone, a: Math.PI * 0.2, on: false };
}
const _a = V3(0, 0, 0), _b = V3(0, 0, 0), _up = V3(0, -1, 0);
function updateHeli(dt, now) {
  if (!heli || !heli.on) return;
  heli.a += dt * 0.22;
  const r = 58, y = 92, x = Math.cos(heli.a) * r, z = Math.sin(heli.a) * r;
  heli.g.position.set(x, y + Math.sin(now * 0.7) * 1.2, z);
  heli.g.rotation.y = Math.atan2(-Math.sin(heli.a), Math.cos(heli.a)); heli.g.rotation.z = -0.12; // nose along the circle
  heli.rotor.rotation.y += dt * 38; heli.tr.rotation.x += dt * 45;
  heli.strobe.visible = Math.floor(now * 1.6) % 2 === 0;
  heli.tgt.position.set(IMPACT.x - 3, IMPACT.y - 6, IMPACT.z + Math.sin(now * 0.4) * 5);
  _a.copy(heli.g.position).add(V3(0, -1.2, 0)); _b.copy(heli.tgt.position).sub(_a);
  const dist = _b.length(); heli.cone.position.copy(_a); heli.cone.quaternion.setFromUnitVectors(_up, _b.normalize()); heli.cone.scale.set(dist * 0.1, dist, dist * 0.1);
}

/* =====================================================================
   TIMELINE
   ===================================================================== */
let active = false, manual = false, T = 0, evIdx = 0, events = [], armed = 0;
let police = [], ambs = [], trucks = [], hoses = [];
const tapeCrews = [];

function siren() { try { Sound.init?.(); Sound.siren?.(); } catch { /* audio is optional */ } }

function spawnCrew(role, v, offsets) {
  return offsets.map(([ox, oz]) => {
    const p = v.g.position, c = Math.cos(v.g.rotation.y), s = Math.sin(v.g.rotation.y);
    const x = p.x + ox * c + oz * s, z = p.z - ox * s + oz * c;
    return new Actor(role).at(x, z);
  });
}

function setup() {
  const E = EMERGENCY, TR = E.triage, benchX = TR.x + 3.2;
  // vehicles. Ambulances park clear of z = 0 where evacuees cross the east road; each later one stops short of the one before
  const mk = (kind, sx, sz, px, pz, hd) => { const v = buildVehicle(kind); placeVehicle(v, V3(sx, 0.06, sz), V3(px, 0.06, pz), hd); return v; };
  police = [mk('police', E.roadWest, -E.startDist, E.roadWest, -24, 0), mk('police', E.roadWest, -E.startDist, E.roadWest, 24, 0)];
  ambs = [mk('ambulance', E.roadEast, E.startDist, E.roadEast, -14.5, Math.PI), mk('ambulance', E.roadEast, E.startDist, E.roadEast, -7, Math.PI), mk('ambulance', E.roadEast, E.startDist, E.roadEast, 8, Math.PI)];
  trucks = [mk('aerial', E.roadWest, -E.startDist, E.roadWest, 9, 0), mk('aerial', E.roadWest, -E.startDist, E.roadWest, -3, 0), mk('pumper', E.roadWest, -E.startDist, E.roadWest, -13, 0)];

  buildTent(TR.x + 2.6, TR.z - 6); buildBench(benchX, TR.z, E.benchLen);
  if (E.helicopter) buildHeli();

  // survivors walk in from the plaza and sit on the bench under silver blankets
  const survivorEvent = () => {
    for (let i = 0; i < E.survivors; i++) {
      const z = seatZ(i), a = new Actor('civ').at(30 + rand(-1, 1), -4 + rand(-3, 3));
      a.onArrive = (ac) => {
        ac.heading = -Math.PI / 2; ac.pose = 'sit';
        const bl = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 3, 8), mat('#c9d1d8', 0.4, 0.6, { emissive: '#222831' }));
        bl.scale.set(1.35, 1.05, 1.0); bl.position.set(0, 0.3, -0.01); ac.h.spine.add(bl);
      };
      setTimeout(() => { if (active) a.walk([{ x: benchX + 4, z }, { x: benchX + 0.2, z }], 1.0, 'sit'); }, i * 450);
    }
  };

  // vehicle arrival handlers
  trucks.forEach((v, i) => { v.onPark = () => {
    if (v.kind === 'aerial') {
      const ops = spawnCrew('fire', v, [[2.6, -3.5], [2.6, -4.6]]);
      ops[0].face(IMPACT.x, v.g.position.z); ops[0].pose = 'operate'; ops[1].face(IMPACT.x, v.g.position.z); ops[1].pose = 'stand';
      v.aim = V3(IMPACT.x + 0.3, IMPACT.y + (i === 0 ? 2 : -3), IMPACT.z + (i === 0 ? 2 : -2));
    } else {
      const ffs = spawnCrew('fire', v, [[2.6, -2.5], [2.6, -3.6], [2.6, -4.7], [2.6, -1.4]]);
      [[ffs[0], E.hoseZ[0]], [ffs[1], E.hoseZ[1]]].forEach(([ff, z]) => {
        ff.walk([{ x: E.roadWest + 1.6, z }], 2.4, 'spray');
        ff.onArrive = (a) => { a.face(-TOWER_W / 2, a.h.root.position.z); a.pose = 'spray'; a.nozzle = true; a.sprayZ = a.h.root.position.z; };
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 14 }, () => V3())), new THREE.LineBasicMaterial({ color: 0xd4b13a }));
        line.frustumCulled = false; layer.add(line); hoses.push({ ff, line, truck: v });
      });
      ffs[2].face(IMPACT.x, v.g.position.z); ffs[3].face(IMPACT.x, v.g.position.z);
    }
  }; });

  ambs.forEach((v, i) => { v.onPark = () => {
    const crew = spawnCrew('medic', v, [[-2.2, -2.8], [-2.2, -3.9]]);
    if (i === 0) { // carry an empty stretcher from the ambulance to the tent
      const st = buildStretcher(), start = { x: v.g.position.x + 2.2, z: v.g.position.z - 3.6 }, end = { x: TR.x - 0.6, z: TR.z - 3.6 };
      crew.forEach((c) => (c.hold = true));
      st.position.set(start.x, 1, start.z);
      new Carrier(crew[0], crew[1], st, [start, end], 1.4, () => { crew.forEach((c) => { c.face(benchX, c.h.root.position.z); c.pose = 'stand'; }); });
    } else { // go to survivors and tend to them
      crew.forEach((c, j) => {
        const z = seatZ((i * 3 + j * 4 + 1) % E.survivors);
        c.walk([{ x: TR.x + 0.2, z }, { x: TR.x + 1.9, z }], 2.6, 'kneel');
        c.onArrive = (a) => { a.heading = Math.PI / 2; a.pose = 'kneel'; };
      });
    }
  }; });

  police.forEach((v, i) => { v.onPark = () => {
    const crew = spawnCrew('police', v, [[-2.0, -2.8], [2.0, -2.8]]);
    crew.forEach((c) => c.face(E.roadWest, i === 0 ? -E.startDist : E.startDist));
    tapeCrews.push({ crew, side: i });
  }; });

  // timeline
  events = [
    [0, () => { siren(); survivorEvent(); }],
    [0.5, () => dispatch(police[0], true)], [1.4, () => dispatch(police[1], true)],
    [3.0, () => dispatch(ambs[0], true)], [4.2, () => dispatch(ambs[1], false)], [5.4, () => dispatch(ambs[2], false)],
    [6.0, () => dispatch(trucks[0], true)], [7.5, () => dispatch(trucks[1], true)], [9.0, () => dispatch(trucks[2], false)],
    [14, () => { if (heli) { heli.on = true; heli.g.visible = true; } }],
    [26, () => {
      // tape across the west road, north and south of the scene
      E.tapeZ.forEach((z) => buildTape(E.roadWest, z, E.tapeHalf));
      tapeCrews.forEach(({ crew, side }) => {
        const z = E.tapeZ[side];
        crew[0].walk([{ x: E.roadWest - E.tapeHalf, z }], 3.2, 'direct'); crew[1].walk([{ x: E.roadWest + E.tapeHalf, z }], 3.2, 'direct');
      });
    }],
  ];
  for (let t = 11; t < 75; t += 11) events.push([t, siren]);
}

/* water + hoses */
const _from = V3(0, 0, 0), _to = V3(0, 0, 0);
let acc = [0, 0, 0, 0, 0, 0];
function sprayStep(dt) {
  // aerial ladders
  trucks.forEach((v, i) => {
    if (v.kind !== 'aerial' || !v.ladder || v.ladder.k < 0.98 || !v.aim) return;
    acc[i] += dt * 70;
    const tip = ladderTip(v);
    while (acc[i] > 1) { acc[i] -= 1; _from.copy(tip); _to.copy(v.aim); _to.z += rand(-1.5, 1.5); _to.y += rand(-1.5, 1.5); spawnWater(_from, _to, 1.2, 0.8); }
    if (Math.random() < dt * 6) spawnSteam(V3(IMPACT.x - 1 + rand(-1, 1), IMPACT.y + rand(-3, 4), IMPACT.z + rand(-3, 3)));
  });
  // ground hoses
  hoses.forEach((h, i) => {
    const a = h.ff, s = h.truck.g.localToWorld(V3(1.4, 1.0, -1));
    const hand = a.hand(), arr = h.line.geometry.attributes.position;
    for (let n = 0; n < 14; n++) { const t = n / 13; arr.setXYZ(n, s.x + (hand.x - s.x) * t, Math.max(0.08, s.y + (hand.y - s.y) * t - Math.sin(Math.PI * t) * 0.9), s.z + (hand.z - s.z) * t); }
    arr.needsUpdate = true;
    if (!a.nozzle) return;
    acc[3 + i] += dt * 45;
    while (acc[3 + i] > 1) { acc[3 + i] -= 1; _to.set(-TOWER_W / 2 + 0.1, rand(10, 18), a.sprayZ + rand(-2, 2)); spawnWater(hand, _to, 1.1, 0.7); }
  });
}

function start(isManual) {
  stop(true);
  active = true; manual = isManual; T = 0; evIdx = 0; tapeCrews.length = 0; hoses = []; acc = [0, 0, 0, 0, 0, 0];
  setup(); btn.textContent = 'Reset responders';
}
function stop(quiet) {
  active = false; evIdx = 0; clearWater();
  scene.remove(layer); layer = new THREE.Group(); scene.add(layer);
  actors.length = 0; carriers.length = 0; tapes.length = 0; hoses = []; heli = null; police = []; ambs = []; trucks = [];
  if (!quiet) btn.textContent = 'Send responders';
}

/** called by the run sequence in main.js */
export function startResponders() { start(false); }
export function stopResponders() { if (active) stop(); }

function update(dt, now) {
  // optional auto start: a few seconds after people on the tower react to the impact
  const reacting = people.some((p) => p.state === 'duck' || p.state === 'alert');
  if (EMERGENCY.autoStart && !active) { armed = reacting ? armed + dt : 0; if (armed > EMERGENCY.armDelay) { armed = 0; start(false); } }
  if (active && !manual && people.length && people.every((p) => p.state === 'working')) stop(); // film was reset
  if (!active) return;

  T += dt;
  while (evIdx < events.length && events[evIdx][0] <= T) events[evIdx++][1]();
  [...police, ...ambs, ...trucks].forEach((v) => updateVehicle(v, dt, now));
  actors.forEach((a) => a.update(dt, now));
  carriers.forEach((c) => c.update(dt));
  sprayStep(dt); updateWater(dt); updateTape(dt); updateHeli(dt, now);
}

/* ---------- button ---------- */
const btn = document.createElement('button');
btn.id = 'btn-responders';
btn.className = 'glass-ui fixed bottom-16 left-4 z-20 rounded-full px-5 py-2.5 text-xs font-black text-bone';
btn.textContent = 'Send responders';
btn.addEventListener('click', () => { Sound.init?.(); active ? stop() : start(true); });
document.body.appendChild(btn);

onUpdate(update);
