import * as THREE from 'three';
import { IMPACT_FLOOR } from './config.js';
import { scene, renderer, onUpdate } from './world.js';
import { faceX, floorY } from './tower.js';
import { holder, planeReady } from './plane.js';
import { spawn } from './fx.js';
import { V3, rand, seeded } from './util.js';

/* =====================================================================
   WRECK: what is left of the airliner after the impact.
   Outside: the aft fuselage, tail and rear engines (a charred clone of the
   real model, clipped just behind the wings) stick out of the gash.
   Inside the impact floor (west zone only, x < -3.8, so the corridor to the
   stairwell stays clear): the crushed forward fuselage, torn wing panels,
   scattered seats, luggage and aluminium shards, a scorch mark and small fires.
   ===================================================================== */
const FLOOR = floorY(IMPACT_FLOOR);
const INNER_X = -3.9;                    // debris stays west of this (corridor ring is at x = -3.2)
const CUT_X = faceX + 0.5;               // the aft section's cut sits just inside the facade
const wreck = new THREE.Group(); wreck.visible = false; scene.add(wreck);
renderer.localClippingEnabled = true;

const charred = (hex, rough = 0.75, metal = 0.35) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, side: THREE.DoubleSide });
const M = {
  skin: charred(0x9a958f), soot: charred(0x2a2522, 0.95, 0.1), alu: charred(0xb9bcc4, 0.4, 0.8),
  seat: charred(0x34405a, 0.9, 0), seatBack: charred(0x2a3348, 0.9, 0), ember: new THREE.MeshBasicMaterial({ color: 0xff6a22 }),
  bags: [0x7a2e2e, 0x2e4a7a, 0x3a3a3a, 0x6b5a3a, 0x2f6b55].map((c) => charred(c, 0.85, 0)),
};
const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; wreck.add(m); return m;
};
/** dents a geometry in place so panels look torn and crumpled */
function crumple(geo, amt, rnd) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * amt, p.getY(i) + (rnd() - 0.5) * amt, p.getZ(i) + (rnd() - 0.5) * amt);
  geo.computeVertexNormals(); return geo;
}

/* ---------- aft section: clone of the real model, clipped behind the wings ---------- */
const clip = new THREE.Plane();
let fuselageR = 0.95;
const aftPivot = new THREE.Group(); wreck.add(aftPivot);

function buildAft() {
  // measure the model in rig space (nose = +Z): wing trailing edge and fuselage radius
  holder.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(holder.parent.matrixWorld).invert(), v = V3(0, 0, 0), pts = [];
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  if (!pts.length) return;
  const half = Math.max(...pts.map((p) => Math.abs(p.x)));
  const wingAft = Math.min(...pts.filter((p) => Math.abs(p.x) > half * 0.5).map((p) => p.z));
  const cut = wingAft - 0.4;
  const near = pts.filter((p) => Math.abs(p.z - cut) < 0.8 && Math.abs(p.x) < half * 0.2);
  if (near.length) fuselageR = Math.max(0.6, Math.min(1.4, Math.max(...near.map((p) => Math.abs(p.x)))));

  const copy = holder.clone(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const dark = (m) => { const c = m.clone(); c.color?.multiplyScalar(0.55); c.clippingPlanes = [clip]; c.clipShadows = true; c.side = THREE.DoubleSide; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(dark) : dark(o.material);
  });
  copy.position.z = -cut; // cut plane at the pivot's origin, tail toward -Z
  aftPivot.add(copy);
}

function placeAft() {
  // pivot just inside the facade, nose (+Z) pointing into the tower (+X), slight nose-down pitch and roll
  aftPivot.position.set(CUT_X, FLOOR + 1.5, 0.2);
  aftPivot.rotation.set(0.07, Math.PI / 2, 0.16, 'YXZ');
  aftPivot.updateMatrixWorld(true);
  const n = V3(0, 0, -1).transformDirection(aftPivot.matrixWorld); // keep the tail side
  clip.setFromNormalAndCoplanarPoint(n, aftPivot.getWorldPosition(V3(0, 0, 0)));
}

/* ---------- interior debris (fixed seed so it looks the same every run) ---------- */
const fireSpots = [];
function buildInterior() {
  const rnd = seeded(1407), r = (a, b) => a + rnd() * (b - a);
  const len = INNER_X - CUT_X + 0.6;

  // crushed forward fuselage, continuous with the aft section and sagging toward the floor
  const fus = crumple(new THREE.CylinderGeometry(fuselageR * 0.92, fuselageR * 0.8, len, 18, 8, true), 0.22, rnd);
  fus.rotateZ(Math.PI / 2);
  add(fus, M.skin, CUT_X + len / 2 - 0.5, FLOOR + fuselageR * 0.95, 0.15, 0.2, 0.12, -0.12);
  add(crumple(new THREE.CylinderGeometry(fuselageR * 0.85, fuselageR * 0.75, len * 0.9, 14, 4, true), 0.18, rnd).rotateZ(Math.PI / 2), M.soot,
    CUT_X + len / 2 - 0.5, FLOOR + fuselageR * 0.95, 0.15, 0.2, 0.12, -0.12);                         // sooty inner lining
  add(crumple(new THREE.SphereGeometry(fuselageR * 0.8, 12, 8), 0.4, rnd), M.skin, INNER_X - 0.9, FLOOR + 0.7, 0.6, 0.4, 0.3, 1.1).scale.set(1.3, 0.75, 1); // flattened nose

  // torn wing panels, one each side of the fuselage
  add(crumple(new THREE.BoxGeometry(3.4, 0.16, 1.6, 6, 1, 3), 0.18, rnd), M.alu, -5.4, FLOOR + 0.55, 3.7, 0.1, 0.55, 0.22);
  add(crumple(new THREE.BoxGeometry(2.8, 0.16, 1.3, 6, 1, 3), 0.18, rnd), M.alu, -5.6, FLOOR + 0.9, -3.6, 0.42, -0.6, -0.1);
  add(crumple(new THREE.BoxGeometry(1.6, 0.12, 0.9, 4, 1, 2), 0.2, rnd), M.soot, -4.6, FLOOR + 0.2, -5.9, 0.1, 1.2, 0.05);

  // scorch mark
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.1, 28), new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }));
  scorch.rotation.x = -Math.PI / 2; scorch.scale.set(1, 2.1, 1); scorch.position.set(-5.3, FLOOR + 0.015, 0); scorch.renderOrder = 1; wreck.add(scorch);

  // passenger seats, some upright, some on their side
  const seatGeo = new THREE.BoxGeometry(0.5, 0.12, 0.5), backGeo = new THREE.BoxGeometry(0.5, 0.6, 0.1);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group(), x = r(-6.8, INNER_X - 0.2), z = r(-6.3, 6.3);
    if (Math.abs(z) < fuselageR + 0.3) continue;
    const s = new THREE.Mesh(seatGeo, M.seat); s.position.y = 0.42; const b = new THREE.Mesh(backGeo, M.seatBack); b.position.set(0, 0.7, -0.22);
    g.add(s, b); g.traverse((o) => (o.castShadow = true));
    const tipped = rnd() < 0.5;
    g.position.set(x, FLOOR + (tipped ? 0.25 : 0), z); g.rotation.set(tipped ? r(-1.6, 1.6) : 0, r(0, Math.PI * 2), tipped ? r(-0.4, 0.4) : 0);
    wreck.add(g);
  }
  // luggage
  for (let i = 0; i < 10; i++) {
    const w = r(0.35, 0.7), h = r(0.22, 0.45), d = r(0.25, 0.4);
    add(new THREE.BoxGeometry(w, h, d), M.bags[i % M.bags.length], r(-6.8, INNER_X), FLOOR + h / 2, r(-6.4, 6.4), 0, r(0, 6.3), rnd() < 0.3 ? 1.2 : 0);
  }
  // aluminium shards and glowing embers
  for (let i = 0; i < 46; i++) {
    const s = add(crumple(new THREE.BoxGeometry(r(0.2, 0.9), 0.03, r(0.15, 0.6), 2, 1, 2), 0.06, rnd), rnd() < 0.7 ? M.alu : M.soot,
      r(-6.9, INNER_X), FLOOR + 0.03, r(-6.6, 6.6), r(-0.3, 0.3), r(0, 6.3), r(-0.3, 0.3));
    s.castShadow = false;
  }
  for (let i = 0; i < 26; i++) {
    const e = add(new THREE.BoxGeometry(0.08, 0.05, 0.08), M.ember, r(-6.8, INNER_X), FLOOR + 0.04, r(-5, 5), 0, r(0, 6.3), 0); e.castShadow = false;
  }
  // a few shards lie on the sidewalk below the gash
  for (let i = 0; i < 14; i++) add(new THREE.BoxGeometry(r(0.2, 0.7), 0.03, r(0.15, 0.5)), M.alu, r(faceX - 2.2, faceX - 0.4), 0.27, r(-6, 6), 0, r(0, 6.3), 0);

  for (let i = 0; i < 7; i++) fireSpots.push(V3(r(-6.6, INNER_X - 0.3), FLOOR + r(0.2, 0.9), r(-4.5, 4.5)));
}

/* ---------- warm flickering light inside the floor ---------- */
const glow = new THREE.PointLight(0xff6a22, 0, 14, 1.6); glow.position.set(-5.2, FLOOR + 2.2, 0); wreck.add(glow);

let built = false, fireAcc = 0;
planeReady.then(() => { buildAft(); placeAft(); buildInterior(); built = true; });

onUpdate((dt, now) => {
  if (!wreck.visible) return;
  glow.intensity = 60 + Math.sin(now * 17) * 18 + Math.random() * 14;
  fireAcc += dt * 16;
  while (fireAcc > 1) {
    fireAcc -= 1;
    const p = fireSpots[Math.floor(Math.random() * fireSpots.length)];
    if (p) spawn('fire', p.clone().add(V3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))), V3(rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3)), rand(0.5, 0.9), rand(0.9, 1.6), 0.6, 0.85);
  }
});

export function showWreck() { if (built) wreck.visible = true; }
export function hideWreck() { wreck.visible = false; }
