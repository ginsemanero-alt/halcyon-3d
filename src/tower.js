import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  FLOORS, IMPACT_FLOOR, FLOOR_H, TOWER_W, TOWER_BASE, GLASS_OPACITY, XRAY_OPACITY, XRAY_FADE,
  MULLION_SPACING, DAMAGED_FLOORS, PLAZA_CENTER, PLAZA_RADIUS,
} from './config.js';
import { scene, onUpdate, HALF, CELL } from './world.js';
import { spawn } from './fx.js';
import { V3, rand, lerp, damp } from './util.js';

/* =====================================================================
   HALCYON TOWER: glass curtain wall over a real interior
   Layout (tower-local metres, tower centred on the world origin):
     core (elevators)  x -2.2..2.2, z -2.5..0.2
     stairwell         x -2.2..2.2, z  0.2..3.2  (switchback, door on the west side)
     open-plan desks around the core, corridor ring at x = +-3.2, z = -3.4 / 4.2
     lobby doors on the +X face, plaza further east
   ===================================================================== */
const HW = TOWER_W / 2, H = FLOOR_H;
export const floorY = (f) => TOWER_BASE + (f - 1) * H;      // top of floor slab f
export const TOWER_TOP = floorY(FLOORS + 1);
export const impactY = floorY(IMPACT_FLOOR) + H / 2;
export const faceX = -HW;
export const impactPoint = V3(faceX, impactY, 0);

const CORE = { x0: -2.2, x1: 2.2, z0: -2.5, z1: 0.2 };
const STAIR = { x0: -2.2, x1: 2.2, z0: 0.2, z1: 3.2, laneA: 0.95, laneB: 2.45, run0: -1.4, run1: 1.4, doorZ1: 1.7 };
const RING = { x: 3.2, zS: -3.4, zN: 4.2 };
const SLAB_T = 0.25;

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const dummy = new THREE.Object3D();
function setInst(mesh, i, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

/* ---------- materials ---------- */
const slabMat = new THREE.MeshStandardMaterial({ color: 0x55525e, roughness: 0.85, emissive: 0x1c1712, emissiveIntensity: 0.6 });
const carpetMat = new THREE.MeshStandardMaterial({ color: 0x3b3a4a, roughness: 0.95, emissive: 0x1a1612, emissiveIntensity: 0.7 });
const coreMat = new THREE.MeshStandardMaterial({ color: 0x8a8590, roughness: 0.8 });
const stairMat = new THREE.MeshStandardMaterial({ color: 0x9c97a3, roughness: 0.7, emissive: 0x181410, emissiveIntensity: 0.5 });
const stairWallMat = new THREE.MeshStandardMaterial({ color: 0x7d7886, roughness: 0.8, transparent: true, opacity: 1 });
const deskMat = new THREE.MeshStandardMaterial({ color: 0xc9b79a, roughness: 0.6, emissive: 0x241c12, emissiveIntensity: 0.5 });
const partitionMat = new THREE.MeshStandardMaterial({ color: 0x4d6378, roughness: 0.9, emissive: 0x0e1218, emissiveIntensity: 0.6 });
const monitorMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.4, emissive: 0x8fb8ff, emissiveIntensity: 0.55 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2a35, roughness: 0.35, metalness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2548, roughness: 0.8 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x9fb6cf, roughness: 0.05, metalness: 0.15, transparent: true, opacity: GLASS_OPACITY,
  envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide, depthWrite: false,
});
const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

const group = new THREE.Group(); scene.add(group);

/* ---------- floor slabs (with stairwell opening) ---------- */
const holeX0 = STAIR.run0, holeX1 = STAIR.x1, holeZ0 = STAIR.z0, holeZ1 = STAIR.z1;
const slabHoleGeo = mergeGeometries([
  box(TOWER_W, SLAB_T, holeZ0 + HW, 0, -SLAB_T / 2, (-HW + holeZ0) / 2),
  box(TOWER_W, SLAB_T, HW - holeZ1, 0, -SLAB_T / 2, (holeZ1 + HW) / 2),
  box(holeX0 + HW, SLAB_T, holeZ1 - holeZ0, (-HW + holeX0) / 2, -SLAB_T / 2, (holeZ0 + holeZ1) / 2),
  box(HW - holeX1, SLAB_T, holeZ1 - holeZ0, (holeX1 + HW) / 2, -SLAB_T / 2, (holeZ0 + holeZ1) / 2),
]);
const slabs = shadowy(new THREE.InstancedMesh(slabHoleGeo, carpetMat, FLOORS - 1));
for (let f = 2; f <= FLOORS; f++) setInst(slabs, f - 2, 0, floorY(f), 0);
group.add(slabs);
const lobbySlab = shadowy(new THREE.Mesh(box(TOWER_W, SLAB_T, TOWER_W, 0, floorY(1) - SLAB_T / 2, 0), slabMat)); group.add(lobbySlab);
const roofSlab = shadowy(new THREE.Mesh(box(TOWER_W + 0.4, 0.5, TOWER_W + 0.4, 0, TOWER_TOP - 0.25, 0), roofMat)); group.add(roofSlab);

/* ---------- core + stairwell ---------- */
const coreH = TOWER_TOP - TOWER_BASE;
group.add(shadowy(new THREE.Mesh(box(CORE.x1 - CORE.x0, coreH, CORE.z1 - CORE.z0 - 0.05, 0, TOWER_BASE + coreH / 2, (CORE.z0 + CORE.z1) / 2 - 0.025), coreMat)));
const stairWalls = shadowy(new THREE.Mesh(mergeGeometries([
  box(STAIR.x1 - STAIR.x0, coreH, 0.15, 0, TOWER_BASE + coreH / 2, STAIR.z1),                          // north wall
  box(0.15, coreH, STAIR.z1 - STAIR.z0, STAIR.x1, TOWER_BASE + coreH / 2, (STAIR.z0 + STAIR.z1) / 2),    // east wall
  box(0.15, coreH, STAIR.z1 - STAIR.doorZ1, STAIR.x0, TOWER_BASE + coreH / 2, (STAIR.doorZ1 + STAIR.z1) / 2), // west wall (door gap south of it)
]), stairWallMat), true, true);
group.add(stairWalls);

// one floor's worth of switchback stairs (floor f down to f-1), instanced on every floor above the lobby
const STEPS = 9, rise = (H / 2) / (STEPS + 1), runLen = STAIR.run1 - STAIR.run0, tread = runLen / STEPS, laneW = 1.3;
const stairParts = [];
for (let i = 0; i < STEPS; i++) {
  stairParts.push(box(tread + 0.02, 0.18, laneW, STAIR.run0 + (i + 0.5) * tread, -(i + 1) * rise - 0.09, STAIR.laneA));
  stairParts.push(box(tread + 0.02, 0.18, laneW, STAIR.run1 - (i + 0.5) * tread, -H / 2 - (i + 1) * rise - 0.09, STAIR.laneB));
}
stairParts.push(box(STAIR.x1 - STAIR.run1, 0.2, STAIR.z1 - STAIR.z0, (STAIR.run1 + STAIR.x1) / 2, -H / 2 - 0.1, (STAIR.z0 + STAIR.z1) / 2)); // mid landing
stairParts.push(box(runLen, H - 0.1, 0.08, 0, -H / 2, (STAIR.laneA + STAIR.laneB) / 2));                   // divider wall
// handrails on the open sides
const railLen = Math.hypot(runLen, H / 2), railAng = Math.atan2(H / 2, runLen);
stairParts.push(box(railLen, 0.05, 0.05, 0, 0, 0).rotateZ(-railAng).translate(0, -H / 4 + 0.9, STAIR.z0 + 0.06));
stairParts.push(box(railLen, 0.05, 0.05, 0, 0, 0).rotateZ(railAng).translate(0, -H * 0.75 + 0.9, STAIR.z1 - 0.1));
const stairs = shadowy(new THREE.InstancedMesh(mergeGeometries(stairParts), stairMat, FLOORS - 1), false, true);
for (let f = 2; f <= FLOORS; f++) setInst(stairs, f - 2, 0, floorY(f), 0);
group.add(stairs);

/* ---------- desks, partitions, monitors ---------- */
// desk slots: where an occupant stands and which way they face (heading = atan2(dirX, dirZ))
export const SLOTS = [];
for (const z of [-5, -3, -1, 1, 3, 5]) {
  SLOTS.push({ x: -4.6, z, heading: -Math.PI / 2, desk: { x: -5.5, z, ry: Math.PI / 2 } });
  SLOTS.push({ x: 4.6, z, heading: Math.PI / 2, desk: { x: 5.5, z, ry: Math.PI / 2 } });
}
for (const x of [-1.4, 1.4]) {
  SLOTS.push({ x, z: -4.6, heading: Math.PI, desk: { x, z: -5.5, ry: 0 } });
  SLOTS.push({ x, z: 4.6, heading: 0, desk: { x, z: 5.5, ry: 0 } });
}
const deskGeo = mergeGeometries([box(1.5, 0.05, 0.75, 0, 0.74, 0), box(0.05, 0.72, 0.7, -0.7, 0.36, 0), box(0.05, 0.72, 0.7, 0.7, 0.36, 0)]);
const partGeo = box(1.6, 1.25, 0.05, 0, 0.625, 0);
const monGeo = mergeGeometries([box(0.56, 0.34, 0.03, 0, 1.06, 0), box(0.06, 0.2, 0.03, 0, 0.84, 0)]);
const officeFloors = FLOORS - 1, nDesk = officeFloors * SLOTS.length;
const desks = shadowy(new THREE.InstancedMesh(deskGeo, deskMat, nDesk), false, true);
const parts = shadowy(new THREE.InstancedMesh(partGeo, partitionMat, nDesk), false, true);
const monitors = new THREE.InstancedMesh(monGeo, monitorMat, nDesk);
{ let i = 0;
  for (let f = 2; f <= FLOORS; f++) for (const s of SLOTS) {
    const y = floorY(f), d = s.desk;
    // direction from occupant to desk, used to push partition + monitor to the far side
    const dx = Math.sign(d.x - s.x) * (Math.abs(d.x - s.x) > 0.1 ? 1 : 0), dz = Math.sign(d.z - s.z) * (Math.abs(d.z - s.z) > 0.1 ? 1 : 0);
    setInst(desks, i, d.x, y, d.z, d.ry);
    setInst(parts, i, d.x + dx * 0.42, y, d.z + dz * 0.42, d.ry);
    setInst(monitors, i, d.x + dx * 0.22, y, d.z + dz * 0.22, d.ry);
    i++;
  } }
group.add(desks, parts, monitors);
// lobby: reception desk + planters
group.add(shadowy(new THREE.Mesh(box(0.8, 1.05, 3.2, 4.2, floorY(1) + 0.525, 4.0), deskMat)));
for (const [x, z] of [[5.6, -5.6], [-5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]]) {
  group.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.7, 12).translate(x, floorY(1) + 0.35, z), partitionMat)));
  group.add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8).translate(x, floorY(1) + 1.1, z), new THREE.MeshStandardMaterial({ color: 0x3f6b48, roughness: 0.9 }))));
}

/* ---------- emissive ceiling light strips (instance colour = brightness) ---------- */
const STRIPS = [ // [x, z, lengthX, lengthZ]
  [-5.2, 0, 0.18, 12], [5.2, 0, 0.18, 12], [0, -5.2, 3.6, 0.18], [0, 5.2, 3.6, 0.18], [-3.4, 0, 0.14, 8], [3.4, 0, 0.14, 8],
];
const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 1), stripMat, FLOORS * STRIPS.length);
const STRIP_ON = new THREE.Color(2.3, 2.1, 1.75), STRIP_DIM = new THREE.Color(0.9, 0.8, 0.7), STRIP_OFF = new THREE.Color(0.04, 0.035, 0.03);
const stripIdx = {}; // floor -> instance indices
{ let i = 0;
  for (let f = 1; f <= FLOORS; f++) {
    stripIdx[f] = [];
    const y = floorY(f + 1) - SLAB_T - 0.03;
    for (const [x, z, lx, lz] of STRIPS) { setInst(strips, i, x, y, z, 0, lx, 1, lz); strips.setColorAt(i, STRIP_ON); stripIdx[f].push(i); i++; }
  } }
group.add(strips);
function setFloorLight(f, color) { for (const i of stripIdx[f]) strips.setColorAt(i, color); strips.instanceColor.needsUpdate = true; }

/* ---------- glass curtain wall + mullions ---------- */
const towerH = TOWER_TOP - TOWER_BASE;
const glassPanes = [];
function pane(w, h, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; group.add(m); glassPanes.push(m); return m;
}
const gy = TOWER_BASE + towerH / 2, o = HW + 0.03;
pane(TOWER_W, towerH, 0, gy, o, 0);               // +Z
pane(TOWER_W, towerH, 0, gy, -o, Math.PI);        // -Z
pane(TOWER_W, towerH, -o, gy, 0, -Math.PI / 2);   // -X (impact face)
// +X face: upper floors + lobby either side of the doors
const DOOR_W = 2.4, lobbyH = H;
pane(TOWER_W, towerH - lobbyH, o, TOWER_BASE + lobbyH + (towerH - lobbyH) / 2, 0, Math.PI / 2);
const sideW = HW - DOOR_W / 2;
pane(sideW, lobbyH, o, TOWER_BASE + lobbyH / 2, -(DOOR_W / 2 + sideW / 2), Math.PI / 2);
pane(sideW, lobbyH, o, TOWER_BASE + lobbyH / 2, DOOR_W / 2 + sideW / 2, Math.PI / 2);

const nFins = Math.round(TOWER_W / MULLION_SPACING), finStep = TOWER_W / nFins;
const frames = shadowy(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, 4 * (nFins + 1) + 4 * (FLOORS + 1) + 4), true, false);
{ let i = 0; const fo = HW + 0.1;
  for (let k = 0; k <= nFins; k++) {
    const t = -HW + k * finStep;
    setInst(frames, i++, t, gy, fo, 0, 0.1, towerH, 0.22);
    setInst(frames, i++, t, gy, -fo, 0, 0.1, towerH, 0.22);
    setInst(frames, i++, fo, gy, t, 0, 0.22, towerH, 0.1);
    setInst(frames, i++, -fo, gy, t, 0, 0.22, towerH, 0.1);
  }
  for (let f = 1; f <= FLOORS + 1; f++) { // spandrel bands hide the slab edges
    const y = floorY(f) - SLAB_T / 2;
    setInst(frames, i++, 0, y, fo, 0, TOWER_W + 0.3, 0.42, 0.16);
    setInst(frames, i++, 0, y, -fo, 0, TOWER_W + 0.3, 0.42, 0.16);
    setInst(frames, i++, fo, y, 0, 0, 0.16, 0.42, TOWER_W + 0.3);
    setInst(frames, i++, -fo, y, 0, 0, 0.16, 0.42, TOWER_W + 0.3);
  }
  // lobby door frame (two posts, header)
  setInst(frames, i++, fo, TOWER_BASE + lobbyH / 2, -DOOR_W / 2, 0, 0.25, lobbyH, 0.16);
  setInst(frames, i++, fo, TOWER_BASE + lobbyH / 2, DOOR_W / 2, 0, 0.25, lobbyH, 0.16);
  setInst(frames, i++, fo, TOWER_BASE + 2.45, 0, 0, 0.25, 0.14, DOOR_W);
  setInst(frames, i++, fo + 0.4, TOWER_BASE + 2.75, 0, 0, 0.8, 0.08, DOOR_W + 1.2); // canopy
  frames.count = i;
}
group.add(frames);

// sliding lobby doors
const doorMat = new THREE.MeshPhysicalMaterial({ color: 0xb8cde0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
const doors = [-1, 1].map((s) => {
  const d = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W / 2, 2.35), doorMat); glass.rotation.y = Math.PI / 2; d.add(glass);
  const rail = new THREE.Mesh(box(0.06, 2.35, 0.06, 0, 0, -s * DOOR_W / 4), frameMat); d.add(rail);
  d.position.set(HW + 0.06, TOWER_BASE + 1.18, s * DOOR_W / 4); d.userData = { closedZ: s * DOOR_W / 4, openZ: s * (DOOR_W / 4 + DOOR_W / 2 - 0.1) };
  group.add(d); return d;
});
let doorsOpen = false;
export function setDoorsOpen(v) { doorsOpen = v; }

/* ---------- crown, mast, beacon ---------- */
const crown = shadowy(new THREE.Mesh(new THREE.BoxGeometry(TOWER_W * 0.5, 5, TOWER_W * 0.5), roofMat)); crown.position.y = TOWER_TOP + 2.5; group.add(crown);
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 14, 8), roofMat); mast.position.y = TOWER_TOP + 12; group.add(mast);
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3a22 })); beacon.position.y = TOWER_TOP + 19.5; group.add(beacon);

/* ---------- damaged-floor smoke tint (windows go dark) ---------- */
const tintMats = {};
for (const f of DAMAGED_FLOORS) {
  if (f < 1 || f > FLOORS) continue;
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0709, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  tintMats[f] = m;
  const y = floorY(f) + (H - SLAB_T) / 2, h = H - SLAB_T - 0.02, ti = HW - 0.06;
  for (const [x, z, ry] of [[0, ti, 0], [0, -ti, 0], [ti, 0, Math.PI / 2], [-ti, 0, Math.PI / 2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(TOWER_W - 0.1, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.renderOrder = 1; group.add(p);
  }
}

/* ---------- impact damage (dark gash on the -X face) + fire ---------- */
const damage = new THREE.Group(); damage.visible = false;
const holeMat = new THREE.MeshBasicMaterial({ color: 0x050308 });
for (let i = 0; i < 6; i++) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, rand(2.5, 4.5), rand(3, 6)), holeMat);
  b.position.set(faceX - 0.2, impactY + rand(-1.6, 1.6), rand(-3.2, 3.2)); b.rotation.x = rand(-0.5, 0.5); damage.add(b);
}
const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.35, depthWrite: false }));
glow.position.set(faceX - 0.45, impactY, 0); glow.rotation.y = -Math.PI / 2; damage.add(glow);
group.add(damage);
const fireLight = new THREE.PointLight(0xff6a2a, 0, 140, 2); fireLight.position.set(faceX - 7, impactY, 0); group.add(fireLight);

/* ---------- state + per-frame update ---------- */
let damaged = false, burning = false, fireAcc = 0, smokeAcc = 0;
let xrayManual = false, xrayAuto = false, xrayK = 0; // 0 = normal glass, 1 = full X-ray
const flick = {}; for (const f of DAMAGED_FLOORS) flick[f] = { on: true, next: 0 };
const tmpC = new THREE.Color();

export function setXrayManual(v) { xrayManual = v; }
export function setXrayAuto(v) { xrayAuto = v; }
export function getXray() { return { manual: xrayManual, auto: xrayAuto, k: xrayK }; }

onUpdate((dt, now) => {
  // X-ray fade
  const target = xrayManual || xrayAuto ? 1 : 0;
  xrayK += (target - xrayK) * damp(XRAY_FADE, dt);
  glassMat.opacity = lerp(GLASS_OPACITY, XRAY_OPACITY, xrayK);
  glassMat.envMapIntensity = lerp(1.3, 0.35, xrayK);
  glassMat.clearcoat = 1 - xrayK * 0.8;
  stairWallMat.opacity = lerp(1, 0.16, xrayK);
  stairWallMat.depthWrite = stairWallMat.opacity > 0.95;
  doorMat.opacity = lerp(0.4, 0.15, xrayK);

  // doors
  for (const d of doors) d.position.z += ((doorsOpen ? d.userData.openZ : d.userData.closedZ) - d.position.z) * damp(3, dt);

  // dark + flickering damaged floors
  if (damaged) {
    for (const f of DAMAGED_FLOORS) {
      const s = flick[f]; if (!s) continue;
      if (now > s.next) { s.on = !s.on; s.next = now + (s.on ? rand(0.03, 0.14) : rand(0.25, 1.4)); }
      const lit = s.on && f !== IMPACT_FLOOR ? STRIP_DIM : (s.on ? tmpC.setRGB(1.2, 0.5, 0.2) : STRIP_OFF);
      setFloorLight(f, lit);
      if (tintMats[f]) tintMats[f].opacity += ((s.on ? 0.45 : 0.78) - tintMats[f].opacity) * damp(18, dt);
    }
  }

  // fire + smoke at the gash
  if (burning) {
    fireAcc += dt * 26; smokeAcc += dt * 28;
    while (fireAcc > 1) { fireAcc -= 1; spawn('fire', V3(faceX - rand(0, 3), impactY + rand(-1.8, 1.8), rand(-3.5, 3.5)), V3(rand(-3, 1), rand(4, 9), rand(-1.5, 1.5)), rand(0.7, 1.4), rand(2.6, 5.2), 0.8, 0.8); }
    while (smokeAcc > 1) { smokeAcc -= 1; spawn('smoke', V3(faceX - rand(0, 3), impactY + rand(0, 3), rand(-3, 3)), V3(rand(3, 7), rand(7, 12), rand(1, 4)), rand(6, 10), rand(7, 12), 3.2, 0.55); }
    fireLight.intensity = 700 + Math.sin(now * 25) * 220 + Math.random() * 180;
  } else fireLight.intensity = 0;

  beacon.visible = Math.floor(now * 1.4) % 2 === 0;
});

export function impact() {
  damaged = true; burning = true; damage.visible = true;
  for (let i = 0; i < 14; i++) spawn('fire', impactPoint.clone().add(V3(rand(-2, 0), rand(-3, 3), rand(-4, 4))), V3(rand(-14, -2), rand(-2, 8), rand(-8, 8)), rand(0.8, 1.6), rand(14, 26), 1.2, 1);
  for (let i = 0; i < 80; i++) spawn('spark', impactPoint.clone().add(V3(0, rand(-2, 2), rand(-3, 3))), V3(rand(-35, -5), rand(0, 22), rand(-18, 18)), rand(1.2, 2.8), rand(0.5, 1.2), 0, 1);
}

export function reset() {
  damaged = false; burning = false; damage.visible = false; doorsOpen = false; xrayAuto = false;
  for (let f = 1; f <= FLOORS; f++) setFloorLight(f, STRIP_ON);
  for (const m of Object.values(tintMats)) m.opacity = 0;
}

/* =====================================================================
   NAVIGATION: waypoint helpers used by people.js
   ===================================================================== */
const LANDING = { x: -1.8, z: STAIR.laneA };
const DOOR_OUT = { x: STAIR.x0 - 0.5, z: STAIR.laneA };

/** flat route on one floor from a desk position to the stairwell landing */
export function routeToStairs(pos, j = 0) {
  const rx = -RING.x + j, zS = RING.zS + j, zN = RING.zN + j, pts = [];
  if (pos.x <= -3) pts.push({ x: rx, z: pos.z });
  else if (pos.x >= 3) { const zr = pos.z < 0.5 ? zS : zN; pts.push({ x: RING.x - j, z: pos.z }, { x: RING.x - j, z: zr }, { x: rx, z: zr }); }
  else if (pos.z < 0) pts.push({ x: pos.x, z: zS }, { x: rx, z: zS });
  else pts.push({ x: pos.x, z: zN }, { x: rx, z: zN });
  pts.push({ x: rx, z: DOOR_OUT.z }, { x: DOOR_OUT.x, z: DOOR_OUT.z }, { x: LANDING.x, z: LANDING.z });
  return pts;
}

/** 3D waypoints descending from floor f's landing to floor f-1's landing (switchback) */
export function stairFlight(f, o = 0) {
  const Y = floorY(f), zA = STAIR.laneA + o, zB = STAIR.laneB + o;
  return [
    { x: STAIR.run0, y: Y, z: zA }, { x: STAIR.run1, y: Y - H / 2, z: zA }, { x: 1.8, y: Y - H / 2, z: zA },
    { x: 1.8, y: Y - H / 2, z: zB }, { x: STAIR.run1, y: Y - H / 2, z: zB }, { x: STAIR.run0, y: Y - H, z: zB },
    { x: LANDING.x, y: Y - H, z: zB }, { x: LANDING.x, y: Y - H, z: zA },
  ];
}

/** lobby: from the ground-floor stair landing out through the doors */
export function lobbyExit(j = 0) {
  return [
    { x: DOOR_OUT.x, z: DOOR_OUT.z }, { x: -RING.x + j, z: DOOR_OUT.z }, { x: -RING.x + j, z: RING.zS + j },
    { x: RING.x, z: RING.zS + j }, { x: 3.8, z: j * 0.6 }, { x: HW - 0.6, z: j * 0.4 }, { x: HW + 2.5, z: j * 0.4 },
  ];
}

/** gathering spot on the plaza (sunflower spread), facing back toward the tower */
export function plazaSpot(i) {
  const a = i * 2.39996, r = PLAZA_RADIUS * Math.sqrt((i + 0.5) / 48);
  return { x: PLAZA_CENTER.x + Math.cos(a) * r, z: PLAZA_CENTER.z + Math.sin(a) * r * 1.1 };
}

/** ground height outside: sidewalks/plazas are 0.25 high, roads ~0.05 */
export function groundY(x, z) {
  const lx = (((x + HALF) % CELL) + CELL) % CELL, lz = (((z + HALF) % CELL) + CELL) % CELL;
  return lx >= 3 && lx <= CELL - 3 && lz >= 3 && lz <= CELL - 3 ? TOWER_BASE : 0.05;
}

/** where in the stairwell a point is (for the cutaway) */
export function inStairwell(x, z) { return x > STAIR.x0 - 0.3 && x < STAIR.x1 && z > STAIR.z0 && z < STAIR.z1; }

/** floor index for a world height */
export function floorAt(y) { return Math.min(FLOORS, Math.max(1, Math.floor((y - TOWER_BASE + 0.3) / H) + 1)); }
