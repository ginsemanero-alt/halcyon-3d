import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLANE_URL, PLANE_LENGTH, PLANE_MODEL_YAW, FLIGHT_SEC, PLANE_LIGHTS } from './config.js';
import { scene, onUpdate } from './world.js';
import { spawn, glowSprite } from './fx.js';
import { impactY, faceX, impactPoint } from './tower.js';
import { $, V3, rand } from './util.js';

/* =====================================================================
   AIRLINER: loads the CRJ-900 glTF (falls back to a procedural jet),
   auto-scales it to PLANE_LENGTH, adds nav / strobe / beacon / landing lights.
   The rig flies nose-first along +Z (Object3D.lookAt convention).
   ===================================================================== */
export const planeRig = new THREE.Group(); planeRig.visible = false; scene.add(planeRig);
export const holder = new THREE.Group(); planeRig.add(holder); // the airliner model (wreck.js clones it)
let yaw = PLANE_MODEL_YAW;

function proceduralPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e6f0, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3556, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, PLANE_LENGTH * 0.8, 16), white); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), white); nose.scale.z = 2; nose.position.z = PLANE_LENGTH * 0.4; g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6, 16), white); tail.rotation.x = -Math.PI / 2; tail.position.z = -PLANE_LENGTH * 0.4 - 2; g.add(tail);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(PLANE_LENGTH * 0.95, 0.25, 4.5), white); wing.position.set(0, -0.6, -1); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 3.5), dark); fin.position.set(0, 3.4, -PLANE_LENGTH * 0.4); g.add(fin);
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 2.4), white); hstab.position.set(0, 0.6, -PLANE_LENGTH * 0.42); g.add(hstab);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 12), dark); e.rotation.x = Math.PI / 2; e.position.set(sx * 5.5, -1.5, 0.8); g.add(e); }
  return g;
}

/* ---------- lights ---------- */
// each lamp = small bright core sphere + additive glow sprite
const lamp = (color, size) => {
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color }));
  const glow = glowSprite(color, size); core.add(glow); core.userData.glow = glow; planeRig.add(core); return core;
};
const L = {
  red: lamp(0xff2a2a, 2.2), green: lamp(0x33ff66, 2.2),
  strobeL: lamp(0xffffff, 3.2), strobeR: lamp(0xffffff, 3.2), strobeT: lamp(0xffffff, 3.2),
  beacon: lamp(0xff2a2a, 3), belly: lamp(0xff2a2a, 2.4), landingGlow: lamp(0xfff2d0, 3.5),
};
const redLight = new THREE.PointLight(0xff2a22, 0, 9, 2), greenLight = new THREE.PointLight(0x2aff6a, 0, 9, 2);
planeRig.add(redLight, greenLight);
const landing = new THREE.SpotLight(0xfff2d0, 0, 220, 0.22, 0.6, 2);
landing.castShadow = true; landing.shadow.mapSize.set(1024, 1024); landing.shadow.camera.near = 1; landing.shadow.camera.far = 220;
planeRig.add(landing, landing.target);

/** place lights from the model's bounding box in rig space (rig faces +Z, so its left/port wing is +X) */
function placeLights() {
  planeRig.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(planeRig.matrixWorld).invert();
  const box = new THREE.Box3();
  holder.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
  });
  if (box.isEmpty()) return;
  const sx = box.max.x, ex = box.min.x, top = box.max.y, bot = box.min.y, nose = box.max.z, tail = box.min.z;
  const wy = (top + bot) / 2 - (top - bot) * 0.08, wz = (nose + tail) / 2 - (nose - tail) * 0.06;
  L.red.position.set(sx, wy, wz); redLight.position.copy(L.red.position);
  L.green.position.set(ex, wy, wz); greenLight.position.copy(L.green.position);
  L.strobeL.position.set(sx - 0.1, wy, wz - 0.4); L.strobeR.position.set(ex + 0.1, wy, wz - 0.4);
  L.strobeT.position.set(0, (top + bot) / 2, tail);
  L.beacon.position.set(0, top - (top - bot) * 0.2, (nose + tail) / 2);
  L.belly.position.set(0, bot + 0.1, (nose + tail) / 2);
  L.landingGlow.position.set(0, bot + (top - bot) * 0.25, nose - (nose - tail) * 0.12);
  landing.position.copy(L.landingGlow.position);
  landing.target.position.set(0, bot - 20, nose + 80);
}

async function loadPlane() {
  let model;
  try {
    const g = await new GLTFLoader().loadAsync(PLANE_URL);
    model = g.scene;
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(V3(0, 0, 0)), ctr = box.getCenter(V3(0, 0, 0));
    model.position.sub(ctr);
    const scaled = new THREE.Group(); scaled.add(model);
    scaled.scale.setScalar(PLANE_LENGTH / Math.max(size.x, size.y, size.z, 0.001));
    model = scaled;
  } catch (e) {
    console.warn('Plane model not found at', PLANE_URL, '- using procedural jet.', e);
    model = proceduralPlane();
  }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  holder.add(model);
  holder.rotation.y = yaw;
  placeLights();
}

/* P cycles the model yaw so you can find the right orientation */
const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const YAW_NAMES = ['0', 'Math.PI / 2', 'Math.PI', '-Math.PI / 2'];
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'p' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const i = (YAWS.findIndex((y) => Math.abs(y - yaw) < 1e-6) + 1) % YAWS.length;
  yaw = YAWS[i]; holder.rotation.y = yaw;
  if (!planeState.flying) { // preview: park the plane beside the tower, nose toward +X
    planeRig.visible = true; planeRig.position.set(-40, 55, 25); planeRig.lookAt(0, 55, 25);
  }
  placeLights();
  console.log(`PLANE_MODEL_YAW = ${YAW_NAMES[i]}  (${yaw.toFixed(4)})`);
  $('city-info').textContent = `Plane rotation: ${YAW_NAMES[i]}. Set PLANE_MODEL_YAW to this value in src/config.js when the nose points toward the tower (+X in the preview).`;
});

/* ---------- flight ---------- */
const curve = new THREE.CatmullRomCurve3([
  V3(-520, 170, 170), V3(-300, 130, 90), V3(-150, 100, 35), V3(-60, impactY + 8, 8),
  V3(faceX - PLANE_LENGTH * 0.5 + 1, impactY, 0),
]);
export const planeState = { flying: false, t: 0, pos: V3(0, 0, 0) };
let onArrive = null, trailAcc = 0;
const tmp = V3(0, 0, 0);

onUpdate((dt, now) => {
  // blinking lights (also visible while parked for previews)
  const strobe = (now * PLANE_LIGHTS.strobeHz) % 1;
  const sOn = strobe < 0.08 || (strobe > 0.16 && strobe < 0.23); // double flash
  L.strobeL.visible = L.strobeR.visible = L.strobeT.visible = sOn;
  L.beacon.visible = L.belly.visible = Math.sin(now * Math.PI * 2 * PLANE_LIGHTS.beaconHz) > 0.2;
  redLight.intensity = greenLight.intensity = planeRig.visible ? 40 * PLANE_LIGHTS.nav : 0;
  landing.intensity = planeRig.visible ? PLANE_LIGHTS.landing : 0;

  if (!planeState.flying) return;
  planeState.t += dt / FLIGHT_SEC;
  const p = Math.min(planeState.t, 1), e = Math.pow(p, 1.15);
  curve.getPoint(e, planeRig.position); planeState.pos.copy(planeRig.position);
  curve.getPoint(Math.min(e + 0.01, 1), tmp); planeRig.lookAt(tmp);
  trailAcc += dt * 40;
  while (trailAcc > 1) {
    trailAcc -= 1;
    const back = planeState.pos.clone().sub(tmp).setLength(PLANE_LENGTH * 0.5);
    spawn('trail', planeState.pos.clone().add(back), V3(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)), 3.5, 3, 4, 0.35);
  }
  if (p >= 1) {
    planeState.flying = false; planeRig.visible = false;
    if (onArrive) { const f = onArrive; onArrive = null; f(); }
  }
});

export function fly() {
  return new Promise((res) => { onArrive = res; planeState.t = 0; planeState.flying = true; planeRig.visible = true; });
}
export function resetPlane() {
  planeState.flying = false; planeState.t = 0; planeRig.visible = false;
  if (onArrive) { const f = onArrive; onArrive = null; f(); }
}
export { impactPoint };

export const planeReady = loadPlane();
