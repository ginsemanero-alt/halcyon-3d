import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  FLOORS, IMPACT_FLOOR, TOWER_W, EXTRA_OCCUPANTS, WALK_SPEED, RUN_SPEED, STAIR_SPEED, RUN_NEAR_IMPACT,
} from './config.js';
import { scene, onUpdate } from './world.js';
import { floorY, SLOTS, routeToStairs, stairFlight, lobbyExit, plazaSpot, groundY, inStairwell, floorAt } from './tower.js';
import { Sound } from './audio.js';
import { rand, seeded, pick, damp, angleDiff, sleep } from './util.js';

/* =====================================================================
   PEOPLE: stylized, realistic-proportion humanoids built in code.
   Every joint is a pivot Group; geometries and materials are shared
   across all characters so 40+ people stay cheap.
   ===================================================================== */
export const SKIN_TONES = ['#f6d7c3', '#f1c6a6', '#e0ac87', '#c68f65', '#a86b47', '#8d5a3b', '#6b4029', '#4a2c1d'];
export const HAIR_COLORS = ['#111111', '#2a1a12', '#4b2e1e', '#7a4a2a', '#b07a3e', '#d8b46a', '#8a3b1e', '#9a9a9a'];
export const HAIR_STYLES = ['short', 'long', 'bun', 'ponytail', 'buzz', 'bald'];
export const ACCESSORIES = ['none', 'glasses', 'cap', 'hardhat'];
export const TOPS = ['#3d5a80', '#e07a5f', '#81b29a', '#f2cc8f', '#264653', '#e9c46a', '#6d597a', '#f4f1de', '#2b2d42', '#9a3b3b', '#5b8e7d'];
export const BOTTOMS = ['#22223b', '#2b2d42', '#3d405b', '#4a4e69', '#1d1d24', '#5c5470', '#3c2f2f', '#6b705c'];

/* ---------- shared geometry (metres, pivot at the joint, limbs hang along -Y, character faces +Z) ---------- */
const capsule = (r, len, radial = 8) => new THREE.CapsuleGeometry(r, len, 3, radial);
const skull = new THREE.SphereGeometry(0.105, 18, 14).scale(0.9, 1.13, 1).translate(0, 0.15, 0.005); // slightly egg-shaped
const neck = new THREE.CylinderGeometry(0.048, 0.054, 0.12, 10).translate(0, 0.0, -0.005);
const nose = new THREE.SphereGeometry(0.018, 6, 5).scale(0.8, 1.2, 1).translate(0, 0.135, 0.107);
// anatomical profiles: [radius, y] pairs spun into a smooth body part (closed at both ends)
const lathe = (pts, segs = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
const jaw = new THREE.SphereGeometry(0.084, 16, 10).scale(0.93, 0.82, 0.95).translate(0, 0.088, 0.018);
const ears = mergeGeometries([
  new THREE.SphereGeometry(0.023, 8, 6).scale(0.42, 1, 0.72).translate(0.092, 0.148, -0.004),
  new THREE.SphereGeometry(0.023, 8, 6).scale(0.42, 1, 0.72).translate(-0.092, 0.148, -0.004),
]);
const G = {
  // pelvis (hips space) and torso (spine space): waist, ribcage, chest and sloped shoulders
  pelvis: lathe([[0.001, -0.14], [0.09, -0.13], [0.13, -0.08], [0.138, -0.02], [0.127, 0.04], [0.117, 0.075], [0.001, 0.08]]).scale(1.12, 1, 0.72),
  belt: new THREE.CylinderGeometry(0.121, 0.123, 0.034, 18, 1, true).scale(1.13, 1, 0.8).translate(0, 0.062, 0),
  torso: lathe([[0.001, -0.06], [0.117, -0.05], [0.122, 0.02], [0.116, 0.1], [0.127, 0.2], [0.146, 0.3], [0.152, 0.38], [0.145, 0.44], [0.112, 0.49], [0.058, 0.515], [0.001, 0.525]]).scale(1.22, 1, 0.68),
  hem: new THREE.CylinderGeometry(0.12, 0.121, 0.03, 18, 1, true).scale(1.235, 1, 0.695).translate(0, -0.035, 0),
  placket: new THREE.BoxGeometry(0.014, 0.34, 0.006).translate(0, 0.28, 0.101),
  cuff: new THREE.CylinderGeometry(0.03, 0.029, 0.03, 12, 1, true).translate(0, -0.232, 0),
  collar: new THREE.TorusGeometry(0.054, 0.011, 6, 18).rotateX(Math.PI / 2).scale(1.05, 1, 0.9).translate(0, 0.505, 0.004),
  head: mergeGeometries([skull, neck, nose, jaw, ears]),
  headBare: mergeGeometries([skull, neck, jaw, ears]), // used when a photo covers the face (no procedural nose)
  eyeWhites: mergeGeometries([new THREE.SphereGeometry(0.0135, 10, 8).scale(1.15, 0.8, 0.6).translate(0.034, 0.16, 0.094), new THREE.SphereGeometry(0.0135, 10, 8).scale(1.15, 0.8, 0.6).translate(-0.034, 0.16, 0.094)]),
  brows: mergeGeometries([new THREE.BoxGeometry(0.032, 0.007, 0.01).rotateZ(-0.12).translate(0.036, 0.181, 0.1), new THREE.BoxGeometry(0.032, 0.007, 0.01).rotateZ(0.12).translate(-0.036, 0.181, 0.1)]),
  lips: new THREE.CapsuleGeometry(0.0065, 0.026, 2, 6).rotateZ(Math.PI / 2).scale(1, 1, 0.6).translate(0, 0.1, 0.1),
  // arms (shoulder / elbow space, hanging along -Y): deltoid + tapered upper arm, forearm, hand with thumb
  upperArmL: lathe([[0.001, 0.035], [0.042, 0.02], [0.054, -0.02], [0.05, -0.09], [0.044, -0.2], [0.039, -0.28], [0.001, -0.31]], 12),
  forearmL: lathe([[0.001, 0.012], [0.039, -0.01], [0.042, -0.07], [0.034, -0.17], [0.027, -0.24], [0.001, -0.255]], 12),
  hand: mergeGeometries([
    new THREE.SphereGeometry(0.038, 10, 8).scale(0.82, 1.1, 0.45).translate(0, -0.295, 0.004),       // palm
    new THREE.SphereGeometry(0.034, 10, 8).scale(0.78, 1.05, 0.36).translate(0, -0.335, 0.008),       // fingers
    new THREE.CapsuleGeometry(0.012, 0.035, 2, 6).rotateX(-0.5).translate(0, -0.3, 0.032),           // thumb
  ]),
  // legs (hip / knee space): thigh, knee and calf, shoe with sole, toe box and heel
  thigh: lathe([[0.001, 0.03], [0.072, 0.0], [0.079, -0.08], [0.069, -0.25], [0.055, -0.42], [0.001, -0.455]], 14),
  shin: lathe([[0.001, 0.025], [0.054, 0.0], [0.058, -0.1], [0.047, -0.25], [0.034, -0.38], [0.001, -0.405]], 12),
  shoeUpper: mergeGeometries([new THREE.SphereGeometry(0.06, 12, 8).scale(0.85, 0.75, 2.05).translate(0, -0.432, 0.05), new THREE.CylinderGeometry(0.042, 0.045, 0.06, 10).translate(0, -0.41, -0.005)]),
  shoeSole: new THREE.BoxGeometry(0.1, 0.025, 0.27).translate(0, -0.468, 0.045),
  // old names kept for the cast editor preview and other modules
  upperArm: capsule(0.046, 0.22).translate(0, -0.145, 0),
  forearm: mergeGeometries([capsule(0.038, 0.2).translate(0, -0.135, 0), new THREE.SphereGeometry(0.042, 8, 6).scale(0.75, 1.15, 0.55).translate(0, -0.3, 0.005)]),
  // curved face decal: a partial sphere just outside the skull, centred on +Z. u runs left to right, v runs forehead to chin.
  face: new THREE.SphereGeometry(0.1066, 28, 24, Math.PI / 2 - 0.86, 1.72, Math.PI * 0.27, Math.PI * 0.55)
    .scale(0.9, 1.13, 1).translate(0, 0.15, 0.005),
  eyes: mergeGeometries([new THREE.SphereGeometry(0.0078, 8, 6).translate(0.034, 0.16, 0.0985), new THREE.SphereGeometry(0.0078, 8, 6).translate(-0.034, 0.16, 0.0985)]), // irises
  upperArm: capsule(0.046, 0.22).translate(0, -0.145, 0),
  forearm: mergeGeometries([capsule(0.038, 0.2).translate(0, -0.135, 0), new THREE.SphereGeometry(0.042, 8, 6).scale(0.75, 1.15, 0.55).translate(0, -0.3, 0.005)]),
  thigh: capsule(0.07, 0.3, 10).translate(0, -0.22, 0),
  shin: capsule(0.055, 0.32).translate(0, -0.215, 0),
  shoe: new THREE.BoxGeometry(0.1, 0.085, 0.25).translate(0, -0.435, 0.045),
};
const capTop = new THREE.SphereGeometry(0.114, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.92, 0.95, 1.02);
G.hair = {
  short: capTop.clone().translate(0, 0.165, -0.004),
  buzz: new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48).scale(0.92, 1.0, 1.0).translate(0, 0.16, 0.0),
  long: mergeGeometries([
    capTop.clone().translate(0, 0.165, -0.004), capsule(0.095, 0.17, 10).scale(1.02, 1, 0.55).translate(0, 0.075, -0.06),
    capsule(0.03, 0.15, 6).scale(1, 1, 0.8).translate(0.085, 0.09, -0.015), capsule(0.03, 0.15, 6).scale(1, 1, 0.8).translate(-0.085, 0.09, -0.015),
  ]),
  bun: mergeGeometries([capTop.clone().translate(0, 0.165, -0.004), new THREE.SphereGeometry(0.052, 10, 8).translate(0, 0.25, -0.085)]),
  ponytail: mergeGeometries([capTop.clone().translate(0, 0.165, -0.004), capsule(0.035, 0.16).rotateX(0.35).translate(0, 0.08, -0.13)]),
};
G.acc = {
  glasses: mergeGeometries([
    new THREE.TorusGeometry(0.024, 0.004, 6, 14).translate(0.036, 0.16, 0.104),
    new THREE.TorusGeometry(0.024, 0.004, 6, 14).translate(-0.036, 0.16, 0.104),
    new THREE.BoxGeometry(0.026, 0.005, 0.005).translate(0, 0.162, 0.106),
    new THREE.BoxGeometry(0.004, 0.005, 0.11).translate(0.094, 0.162, 0.05),
    new THREE.BoxGeometry(0.004, 0.005, 0.11).translate(-0.094, 0.162, 0.05),
  ]),
  cap: mergeGeometries([
    new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.95, 0.85, 1.02).translate(0, 0.17, 0),
    new THREE.CylinderGeometry(0.075, 0.075, 0.008, 16, 1, false, -Math.PI / 2, Math.PI).scale(1.1, 1, 1.0).translate(0, 0.175, 0.1),
  ]),
  hardhat: mergeGeometries([
    new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.95, 0.9, 1.05).translate(0, 0.18, 0),
    new THREE.CylinderGeometry(0.155, 0.155, 0.012, 20).scale(0.95, 1, 1.08).translate(0, 0.18, 0.012),
  ]),
};

/* ---------- shared materials (cached per colour) ---------- */
// woven fabric: fine noise used as colour + bump so clothes never read as skin, even in skin-like colours
const fabricTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), img = x.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const px = i % 64, py = (i / 64) | 0, weave = ((px + py) % 4 < 2 ? 14 : 0) + ((px % 2) ^ (py % 2) ? 8 : 0);
    const v = 222 + weave - Math.random() * 26; img.data.set([v, v, v, 255], i * 4);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const matCache = new Map();
function mat(hex, rough = 0.8, metal = 0, fabric = false) {
  const key = `${hex}|${rough}|${metal}|${fabric}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...(fabric ? { map: fabricTex, bumpMap: fabricTex, bumpScale: 0.6 } : {}) }));
  return matCache.get(key);
}
const ACC_MAT = { glasses: () => mat('#1c1c22', 0.35, 0.6), hardhat: () => mat('#f2c12e', 0.45) };

/* ---------- photo heads: one lit (not emissive) material per photo, shared by every person using it ---------- */
const faceMats = new Map();
function faceMaterial(url) {
  if (!faceMats.has(url)) {
    const map = new THREE.TextureLoader().load(url);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    faceMats.set(url, new THREE.MeshStandardMaterial({
      map, transparent: true, roughness: 0.62, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
    }));
  }
  return faceMats.get(url);
}
/** free the GPU texture of a photo that was removed */
export function forgetPhoto(url) {
  const m = faceMats.get(url);
  if (m) { m.map?.dispose(); m.dispose(); faceMats.delete(url); }
}

/* ---------- humanoid rig ---------- */
const POSE_KEYS = ['drop', 'spineX', 'headX', 'headY', 'shLX', 'shLZ', 'elLX', 'shRX', 'shRZ', 'elRX', 'hipLX', 'knLX', 'hipRX', 'knRX'];
const zeroPose = () => Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));

export class Humanoid {
  constructor(d) {
    this.root = new THREE.Group();
    this.scaleG = new THREE.Group(); this.root.add(this.scaleG);
    this.pose = zeroPose(); this.target = zeroPose();
    this.build(d);
  }
  mesh(geo, material, parent, shadow = false) {
    const m = new THREE.Mesh(geo, material); m.castShadow = shadow; parent.add(m); return m;
  }
  build(d) {
    this.scaleG.clear();
    this.scaleG.scale.setScalar(d.heightScale || 1);
    // stable per-person variation (sleeves, shoe colour) from their look, so a person always dresses the same
    const hash = [...`${d.skinTone}${d.outfitTop}${d.outfitBottom}${d.hairStyle}${d.hairColor}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const longSleeves = d.longSleeves ?? hash % 3 !== 0;
    const skin = mat(d.skinTone, 0.55), top = mat(d.outfitTop, 0.9, 0, true), bottom = mat(d.outfitBottom, 0.9, 0, true);
    const shoe = mat(['#18171d', '#2b1d14', '#3a3a40', '#e9e6df'][hash % 4], 0.55), sole = mat('#d9d4cc', 0.8);
    const topDark = mat(`#${new THREE.Color(d.outfitTop).multiplyScalar(0.72).getHexString()}`, 0.85);
    const lipCol = mat(`#${new THREE.Color(d.skinTone).lerp(new THREE.Color('#8f3b38'), 0.35).getHexString()}`, 0.5);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.95; this.scaleG.add(hips);
    this.mesh(G.pelvis, bottom, hips, true);
    this.mesh(G.belt, mat('#1b1714', 0.5, 0.2), hips);
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.04; hips.add(spine);
    this.mesh(G.torso, top, spine, true);
    this.mesh(G.collar, topDark, spine); this.mesh(G.hem, topDark, spine); this.mesh(G.placket, topDark, spine);
    const head = this.head = new THREE.Group(); head.position.y = 0.5; spine.add(head);
    const photo = d.headPhoto;
    this.headMesh = this.mesh(photo ? G.headBare : G.head, skin, head, true);
    if (photo) {
      const face = new THREE.Mesh(G.face, faceMaterial(photo));
      face.renderOrder = 2; head.add(face);
    } else {
      this.mesh(G.eyeWhites, mat('#f2efe8', 0.3), head);
      this.mesh(G.eyes, mat('#141217', 0.2), head);
      this.mesh(G.brows, mat(d.hairColor, 0.8), head);
      this.mesh(G.lips, lipCol, head);
    }
    // short/buzz hair is fully hidden by headwear; long hair, buns and ponytails still show under it
    const hat = d.accessory === 'cap' || d.accessory === 'hardhat';
    if (G.hair[d.hairStyle] && !(hat && (d.hairStyle === 'short' || d.hairStyle === 'buzz'))) this.mesh(G.hair[d.hairStyle], mat(d.hairColor, 0.7), head);
    if (d.accessory === 'glasses') this.mesh(G.acc.glasses, ACC_MAT.glasses(), head);
    if (d.accessory === 'cap') this.mesh(G.acc.cap, mat(d.outfitBottom, 0.75), head);
    if (d.accessory === 'hardhat') this.mesh(G.acc.hardhat, ACC_MAT.hardhat(), head);
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.2, 0.44, 0); spine.add(sh);
      this.mesh(G.upperArmL, top, sh, true);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      this.mesh(G.forearmL, longSleeves ? top : skin, el, true);
      if (longSleeves) this.mesh(G.cuff, topDark, el);
      this.mesh(G.hand, skin, el);
      return [sh, el];
    };
    [this.shL, this.elL] = arm(1); [this.shR, this.elR] = arm(-1);
    const leg = (side) => {
      const hp = new THREE.Group(); hp.position.set(side * 0.095, -0.03, 0); hips.add(hp);
      this.mesh(G.thigh, bottom, hp, true);
      const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
      this.mesh(G.shin, bottom, kn, true);
      this.mesh(G.shoeUpper, shoe, kn, true);
      this.mesh(G.shoeSole, sole, kn);
      return [hp, kn];
    };
    [this.hipL, this.knL] = leg(1); [this.hipR, this.knR] = leg(-1);
  }
  apply(dt, speed = 10) {
    const k = damp(speed, dt), p = this.pose, t = this.target;
    for (const key of POSE_KEYS) p[key] += (t[key] - p[key]) * k;
    this.hips.position.y = 0.95 + p.drop;
    this.spine.rotation.x = p.spineX;
    this.head.rotation.set(p.headX, p.headY, 0);
    this.shL.rotation.set(p.shLX, 0, p.shLZ); this.elL.rotation.x = p.elLX;
    this.shR.rotation.set(p.shRX, 0, p.shRZ); this.elR.rotation.x = p.elRX;
    this.hipL.rotation.x = p.hipLX; this.knL.rotation.x = p.knLX;
    this.hipR.rotation.x = p.hipRX; this.knR.rotation.x = p.knRX;
  }
}

/* ---------- procedural animations: each writes target joint angles ---------- */
const GAITS = {
  walk:   { speed: WALK_SPEED,  stride: 1.4, legA: 0.42, knee: 0.85, armA: 0.38, elbow: -0.3, lean: 0.04, bob: 0.03 },
  run:    { speed: RUN_SPEED,   stride: 2.3, legA: 0.75, knee: 1.45, armA: 0.85, elbow: -1.4, lean: 0.22, bob: 0.06 },
  stairs: { speed: STAIR_SPEED, stride: 1.8, legA: 0.36, knee: 1.0,  armA: 0.2,  elbow: -0.35, lean: 0.1, bob: 0.025 },
};
function animGait(t, g, phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  Object.assign(t, zeroPose());
  t.hipLX = -g.legA * s; t.hipRX = g.legA * s;
  t.knLX = 0.1 + g.knee * Math.max(0, c); t.knRX = 0.1 + g.knee * Math.max(0, -c);
  t.shLX = g.armA * s; t.shRX = -g.armA * s; t.elLX = g.elbow; t.elRX = g.elbow;
  t.shLZ = 0.08; t.shRZ = -0.08;
  t.spineX = g.lean; t.drop = -g.bob * Math.abs(c);
  if (g === GAITS.stairs) t.headX = 0.25;
}
function animWork(t, now, mode, seed) {
  Object.assign(t, zeroPose());
  const tt = now + seed;
  t.shLZ = 0.08; t.shRZ = -0.08; t.spineX = Math.sin(tt * 1.6) * 0.012;
  if (mode === 'typing') {
    t.spineX += 0.1; t.headX = 0.22 + Math.sin(tt * 0.5) * 0.04; t.headY = Math.sin(tt * 0.23) * 0.12;
    t.shLX = t.shRX = -0.5; t.shLZ = 0.16; t.shRZ = -0.16;
    t.elLX = -1.05 + Math.sin(tt * 14) * 0.05; t.elRX = -1.05 + Math.sin(tt * 12.5 + 1) * 0.05;
  } else if (mode === 'talking') {
    t.headY = Math.sin(tt * 0.7) * 0.3; t.headX = Math.sin(tt * 2.6) * 0.06;
    t.shRX = -0.45 + Math.sin(tt * 2.1) * 0.22; t.elRX = -1.15 + Math.sin(tt * 3.3) * 0.3;
    t.shLX = -0.15 + Math.sin(tt * 1.3) * 0.1; t.elLX = -0.5 + Math.sin(tt * 1.9) * 0.2;
  } else { // standing: weight shift, look around
    const w = Math.sin(tt * 0.35);
    t.hipLX = w * 0.04; t.hipRX = -w * 0.04; t.knLX = Math.max(0, w) * 0.1; t.knRX = Math.max(0, -w) * 0.1;
    t.headY = Math.sin(tt * 0.3) * 0.45; t.elLX = -0.25; t.elRX = -0.2;
  }
}
function animAlert(t, now, seed) {
  Object.assign(t, zeroPose());
  const tt = now + seed;
  t.headY = Math.sin(tt * 1.25) * 0.95; t.headX = -0.08; t.spineX = -0.04;
  t.shLX = -0.18; t.shRX = -0.22; t.elLX = -0.5; t.elRX = -0.6; t.shLZ = 0.12; t.shRZ = -0.12;
}
function animDuck(t) {
  Object.assign(t, zeroPose());
  t.drop = -0.5; t.hipLX = t.hipRX = -1.45; t.knLX = t.knRX = 2.25;
  t.spineX = 0.72; t.headX = 0.45;
  t.shLX = t.shRX = -2.7; t.shLZ = 0.35; t.shRZ = -0.35; t.elLX = t.elRX = -1.9;
}
function animSafe(t, now, seed, variant) {
  Object.assign(t, zeroPose());
  const tt = now + seed;
  t.headX = -0.18 + Math.sin(tt * 0.4) * 0.03; t.headY = Math.sin(tt * 0.21) * 0.15; t.spineX = Math.sin(tt * 1.5) * 0.01;
  if (variant === 0) { t.shLX = t.shRX = -0.55; t.shLZ = -0.35; t.shRZ = 0.35; t.elLX = t.elRX = -1.75; }  // arms crossed
  else if (variant === 1) { t.shLZ = 0.55; t.shRZ = -0.55; t.elLX = t.elRX = -1.4; t.shLX = t.shRX = 0.15; } // hands on hips
  else { t.shRX = -0.9; t.elRX = -2.1; t.shRZ = 0.2; t.shLZ = 0.08; }                                       // hand to mouth
}

/** pose + step a standalone Humanoid (used by the cast editor's live 3D preview) */
export function previewTick(h, dt, now) {
  animSafe(h.target, now, 0, 1);
  h.target.headY = Math.sin(now * 0.5) * 0.1;
  h.apply(dt, 6);
}

/* ---------- occupant data ---------- */
const FIRST = ['Ari', 'Bea', 'Cato', 'Dara', 'Eli', 'Fen', 'Gia', 'Hal', 'Ivo', 'Juno', 'Kai', 'Lena', 'Milo', 'Nia', 'Oren', 'Pia', 'Quin', 'Rhea', 'Soren', 'Tess', 'Uma', 'Vik', 'Wren', 'Yara', 'Zed', 'Noor', 'Teo', 'Ada', 'Sami', 'Lux'];
const LAST = ['Arden', 'Brisk', 'Coll', 'Dunmore', 'Ekker', 'Fallow', 'Grane', 'Holt', 'Ivers', 'Juhl', 'Kestrel', 'Lowe', 'Marr', 'Nyland', 'Orsk', 'Pell', 'Quarry', 'Rook', 'Sallow', 'Tamsin', 'Uller', 'Vey', 'Wick'];
const ROLES = ['Analyst', 'Designer', 'Developer', 'Paralegal', 'Office manager', 'Consultant', 'Intern', 'Editor', 'Planner', 'Recruiter'];
let nextId = 1;

/** fills every field of the occupant data model with sensible defaults */
export function normalizeOccupant(d, rnd = Math.random) {
  return {
    id: d.id ?? nextId++,
    name: d.name || 'Occupant',
    role: d.role || 'Occupant',
    floor: Math.min(FLOORS, Math.max(1, d.floor | 0 || 2)),
    position: d.position ?? null,
    heightScale: d.heightScale ?? 0.94 + rnd() * 0.12,
    skinTone: d.skinTone || pick(SKIN_TONES, rnd),
    hairStyle: d.hairStyle || pick(HAIR_STYLES, rnd),
    hairColor: d.hairColor || pick(HAIR_COLORS, rnd),
    outfitTop: d.outfitTop || pick(TOPS, rnd),
    outfitBottom: d.outfitBottom || pick(BOTTOMS, rnd),
    accessory: ACCESSORIES.includes(d.accessory) ? d.accessory : 'none',
    headPhoto: d.headPhoto ?? null,
    line: d.line ?? '',
    pitch: d.pitch ?? 1,
    audio: d.audio ?? null,
    extra: !!d.extra,
  };
}

export function makeExtras(n, cast) {
  const rnd = seeded(4242), out = [];
  const perFloor = {}; cast.forEach((c) => (perFloor[c.floor] = (perFloor[c.floor] || 0) + 1));
  for (let i = 0; i < n; i++) {
    let f; do { f = 2 + Math.floor(rnd() * (FLOORS - 1)); } while ((perFloor[f] || 0) >= SLOTS.length - 2);
    perFloor[f] = (perFloor[f] || 0) + 1;
    out.push(normalizeOccupant({
      name: `${pick(FIRST, rnd)} ${pick(LAST, rnd)}`, role: pick(ROLES, rnd), floor: f, extra: true,
      accessory: rnd() < 0.18 ? 'glasses' : 'none',
    }, rnd));
  }
  return out;
}

/* ---------- person controller ---------- */
const LOBBY_SLOTS = [{ x: 3.4, z: 4.0, heading: Math.PI / 2 }, { x: 2.6, z: -4.6, heading: 0.6 }, { x: -4.5, z: -4.8, heading: 2.2 }, { x: -4.8, z: 4.6, heading: -2.4 }, { x: 5.2, z: -2.5, heading: -1.6 }];
export const people = [];
const usedSlots = new Map(); // floor -> Set(slot index)
const WORK_MODES = ['typing', 'typing', 'talking', 'standing'];

function claimSlot(floor) {
  const list = floor === 1 ? LOBBY_SLOTS : SLOTS;
  if (!usedSlots.has(floor)) usedSlots.set(floor, new Set());
  const used = usedSlots.get(floor);
  // on the impact floor nobody sits in the west zone, where the wreck ends up (see wreck.js)
  const ok = list.map((_, i) => i).filter((i) => floor !== IMPACT_FLOOR || list[i].x > -3);
  const free = ok.filter((i) => !used.has(i));
  const i = free.length ? free[Math.floor(Math.random() * free.length)] : ok[Math.floor(Math.random() * ok.length)];
  used.add(i); return { ...list[i], idx: i };
}
function releaseSlot(p) { usedSlots.get(p.data.floor)?.delete(p.slot.idx); }

class Person {
  constructor(data) {
    this.data = data;
    this.h = new Humanoid(data);
    scene.add(this.h.root);
    this.seed = Math.random() * 100;
    this.workMode = pick(WORK_MODES);
    this.safeVariant = Math.floor(Math.random() * 3);
    this.lane = rand(-0.22, 0.22); this.jit = rand(-0.3, 0.3);
    this.assignSlot();
    this.home();
  }
  assignSlot() {
    const d = this.data;
    if (d.position && Number.isFinite(d.position.x)) {
      const x = Math.max(-TOWER_W / 2 + 0.6, Math.min(TOWER_W / 2 - 0.6, d.position.x)), z = Math.max(-TOWER_W / 2 + 0.6, Math.min(TOWER_W / 2 - 0.6, d.position.z));
      this.slot = { x, z, heading: Math.atan2(Math.sign(x) || 1, 0), idx: -1 };
    } else { this.slot = claimSlot(d.floor); d.position = { x: this.slot.x, z: this.slot.z }; }
  }
  /** back at the desk, working */
  home() {
    this.cancel();
    this.floor = this.data.floor; this.state = 'working'; this.mode = 'work'; this.phi = 0;
    this.h.root.position.set(this.slot.x, floorY(this.floor), this.slot.z);
    this.heading = this.slot.heading; this.h.root.rotation.y = this.heading;
    this.faceTarget = null;
  }
  cancel() { this.path = null; if (this.resolve) { const r = this.resolve; this.resolve = null; r(false); } }
  /** walk a list of waypoints ({x, z} or {x, y, z}); resolves true when done, false if cancelled */
  go(points, gait) {
    this.cancel();
    this.path = points.map((p) => ({ ...p })); this.gait = gait; this.mode = 'move';
    return new Promise((res) => (this.resolve = res));
  }
  update(dt, now) {
    const h = this.h, pos = h.root.position;
    if (this.path) {
      const g = GAITS[this.gait];
      let budget = g.speed * dt;
      while (budget > 0 && this.path.length) {
        const wp = this.path[0];
        const outside = Math.abs(wp.x) > TOWER_W / 2 || Math.abs(wp.z) > TOWER_W / 2;
        const ty = wp.y ?? (outside ? groundY(wp.x, wp.z) : pos.y);
        const dx = wp.x - pos.x, dy = ty - pos.y, dz = wp.z - pos.z, dist = Math.hypot(dx, dy, dz);
        if (dist > 0.02) this.heading += angleDiff(this.heading, Math.atan2(dx, dz)) * damp(this.gait === 'stairs' ? 12 : 8, dt);
        if (dist <= budget) { pos.set(wp.x, ty, wp.z); budget -= dist; this.path.shift(); this.phi += dist * (Math.PI * 2) / g.stride; }
        else { const k = budget / dist; pos.x += dx * k; pos.y += dy * k; pos.z += dz * k; this.phi += budget * (Math.PI * 2) / g.stride; budget = 0; }
      }
      if (Math.abs(pos.x) > TOWER_W / 2 + 0.3 || Math.abs(pos.z) > TOWER_W / 2 + 0.3) pos.y = groundY(pos.x, pos.z);
      const prevStep = this.stepCount || 0; this.stepCount = Math.floor(this.phi / Math.PI);
      if (this.stepCount !== prevStep && !this.data.extra && this.gait === 'stairs') Sound.step();
      animGait(h.target, g, this.phi);
      if (!this.path.length) { this.path = null; this.mode = 'idle'; const r = this.resolve; this.resolve = null; r && r(true); }
      this.floor = floorAt(pos.y);
    } else {
      const t = h.target;
      if (this.state === 'duck') animDuck(t);
      else if (this.state === 'alert') animAlert(t, now, this.seed);
      else if (this.state === 'out') animSafe(t, now, this.seed, this.safeVariant);
      else animWork(t, now, this.workMode, this.seed);
      if (this.faceTarget) this.heading += angleDiff(this.heading, Math.atan2(this.faceTarget.x - pos.x, this.faceTarget.z - pos.z)) * damp(3, dt);
    }
    h.root.rotation.y = this.heading;
    h.apply(dt, this.path ? 14 : (this.state === 'duck' ? 7 : 5));
  }
  /** cutaway: 0..100 horizontal position, or 'stairs' */
  cutawayX() {
    const p = this.h.root.position;
    if (this.state === 'out') return 3;
    if (inStairwell(p.x, p.z) && this.path) return 90;
    return 8 + ((p.x + TOWER_W / 2) / TOWER_W) * 72;
  }
  rebuild() { this.h.build(this.data); }
  dispose() { this.cancel(); scene.remove(this.h.root); releaseSlot(this); }
}

export function addPerson(data) { const p = new Person(normalizeOccupant(data)); people.push(p); return p; }
export function removePerson(p) { p.dispose(); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }
export function resetPeople() { people.forEach((p) => p.home()); }
export function initPeople(cast) {
  const castN = cast.map((c) => normalizeOccupant(c));
  [...castN, ...makeExtras(EXTRA_OCCUPANTS, castN)].forEach((d) => people.push(new Person(d)));
}

/** edit a person live (used by the cast editor). Changing the floor re-seats them at a free desk on that floor. */
export function updatePerson(p, patch) {
  const newFloor = patch.floor !== undefined ? Math.min(FLOORS, Math.max(1, patch.floor | 0 || 1)) : p.data.floor;
  const floorChanged = newFloor !== p.data.floor;
  if (floorChanged) { releaseSlot(p); p.data.position = null; }
  Object.assign(p.data, patch, { floor: newFloor });
  if (floorChanged) { p.assignSlot(); p.home(); }
  p.rebuild();
}

onUpdate((dt, now) => { for (const p of people) p.update(dt, now); });

/* =====================================================================
   REACTION + EVACUATION (everyone gets out safely)
   ===================================================================== */
/** impact reaction: people near the impact floor duck and cover, everyone else looks around */
export function react(isCurrent) {
  people.forEach((p) => {
    const near = Math.abs(p.floor - IMPACT_FLOOR) <= 2;
    if (near) {
      setTimeout(() => { if (!isCurrent()) return; p.state = 'duck'; }, rand(80, 380));
      setTimeout(() => { if (!isCurrent()) return; p.state = 'alert'; }, rand(1900, 2700));
    } else setTimeout(() => { if (!isCurrent()) return; p.state = 'alert'; }, rand(200, 900));
  });
}

let plazaIndex = 0;
export function resetPlaza() { plazaIndex = 0; }

/** one person's full route: desk -> core -> stairwell floor by floor -> lobby -> plaza */
export async function evacuate(p, isCurrent) {
  await sleep(300 + Math.abs(p.floor - IMPACT_FLOOR) * 90 + rand(0, 2800) + (p.data.extra ? rand(0, 1800) : 0));
  if (!isCurrent()) return;
  p.state = 'moving';
  if (!p.data.extra) { Sound.speak(p.data.line, { pitch: p.data.pitch }); Sound.playFile(p.data.audio); }
  const fast = Math.abs(p.floor - IMPACT_FLOOR) <= RUN_NEAR_IMPACT;
  const pos = p.h.root.position;
  if (p.floor > 1) {
    if (!(await p.go(routeToStairs({ x: pos.x, z: pos.z }, p.jit), fast ? 'run' : 'walk')) || !isCurrent()) return;
    for (let f = p.floor; f > 1; f--) {
      p.state = 'stairs';
      if (!(await p.go(stairFlight(f, p.lane), 'stairs')) || !isCurrent()) return;
    }
    p.state = 'moving';
    if (!(await p.go(lobbyExit(p.jit), 'walk')) || !isCurrent()) return;
  } else {
    if (!(await p.go([{ x: 3.8, z: p.jit }, { x: TOWER_W / 2 - 0.6, z: p.jit * 0.4 }, { x: TOWER_W / 2 + 2.5, z: p.jit * 0.4 }], 'walk')) || !isCurrent()) return;
  }
  const spot = plazaSpot(plazaIndex++);
  if (!(await p.go([{ x: 12, z: spot.z * 0.4 }, spot], 'walk')) || !isCurrent()) return;
  p.state = 'out'; p.faceTarget = { x: 0, z: 0 }; // turn and look back at the tower
}

/* ---------- helpers for the camera director ---------- */
const _v = new THREE.Vector3();
/** average position of the people matching a filter (null if none) */
export function centroid(filter) {
  let n = 0; _v.set(0, 0, 0);
  for (const p of people) if (filter(p)) { _v.add(p.h.root.position); n++; }
  return n ? _v.clone().divideScalar(n) : null;
}
