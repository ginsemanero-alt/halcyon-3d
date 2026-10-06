import { IMPACT_FLOOR, FLOOR_H, PLAZA_CENTER } from './config.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { camera, renderer, onUpdate } from './world.js';
import { impactPoint, floorY, setXrayAuto } from './tower.js';
import { planeState } from './plane.js';
import { centroid } from './people.js';
import { billboardCenter, billboardNormal } from './news.js';
import { V3, rand, reduceMotion, smoothstep, damp } from './util.js';

/* =====================================================================
   CAMERA DIRECTOR (basic, PHASE 1): named shots with smooth easing.
   Shots flagged xray auto-enable the X-ray facade.
   ===================================================================== */
const camBase = camera.position.clone(), camLook = V3(0, 32, 0);
const FLIGHT_CAM = V3(-70, 34, 115);
let shot = 'idle', orbitAngle = Math.atan2(1, -1), shake = 0, shotTime = 0;
const lastStairs = V3(0, floorY(IMPACT_FLOOR), 1.7);

const SHOTS = {
  idle: { xray: false, ease: 1, get(dt) { orbitAngle += dt * 0.04; return { pos: V3(Math.cos(orbitAngle) * 150, 55, Math.sin(orbitAngle) * 150), look: V3(0, 32, 0) }; } },
  flight: { xray: false, ease: 0.6, get() {
    const p = Math.min(planeState.t, 1);
    return { pos: FLIGHT_CAM, look: planeState.pos.clone().lerp(impactPoint, smoothstep(0.6, 0.97, p)) };
  } },
  burn: { xray: false, ease: 1, get(dt) {
    orbitAngle += dt * 0.07;
    return { pos: V3(Math.cos(orbitAngle) * 115, 42, Math.sin(orbitAngle) * 115), look: impactPoint.clone().lerp(V3(0, 35, 0), 0.25) };
  } },
  // close on the impact floor through the +Z facade: people duck and cover
  interior: { xray: true, ease: 0.8, get() {
    const y = floorY(IMPACT_FLOOR) + 1.4, drift = shotTime * 0.25;
    return { pos: V3(-1.5 + drift, y + 1.2, 14.5), look: V3(-2.5 + drift * 0.5, y - 0.2, 0) };
  } },
  // follows the crowd descending the stairwell, seen through the faded walls
  stairs: { xray: true, ease: 1.4, get() {
    const c = centroid((p) => p.state === 'stairs');
    if (c) lastStairs.lerp(c, 0.5);
    return { pos: V3(lastStairs.x + 7, lastStairs.y + 2.5, 15), look: V3(lastStairs.x, lastStairs.y + 0.6, 1.7) };
  } },
  // ground level on the plaza, tower in the background
  plaza: { xray: false, ease: 0.7, get() {
    return { pos: V3(PLAZA_CENTER.x + 9, 2.2, PLAZA_CENTER.z + 13), look: V3(PLAZA_CENTER.x - 10, 6 + FLOOR_H, PLAZA_CENTER.z - 2) };
  } },
  // from the plaza up at the LED billboard showing the breaking-news feed, evacuees in the foreground
  news: { xray: false, ease: 0.9, get() {
    const drift = Math.min(shotTime, 12);
    const pos = billboardCenter.clone().addScaledVector(billboardNormal, 15 - drift * 0.35); pos.y = 2.4 + drift * 0.05;
    return { pos, look: billboardCenter.clone().add(V3(0, -0.6, 0)) };
  } },
  // news-chopper view of the impact face: fire trucks, ladders and hoses on the west road, slow drift
  responders: { xray: false, ease: 0.7, get() {
    const drift = Math.min(shotTime, 16);
    return { pos: V3(-17 + drift * 0.15, 50 - drift * 0.4, 62 - drift * 0.9), look: V3(-10, 18 + drift * 0.3, -4) };
  } },
  wide: { xray: false, ease: 0.6, get(dt) {
    orbitAngle += dt * 0.03;
    return { pos: V3(Math.cos(orbitAngle) * 190, 110, Math.sin(orbitAngle) * 190), look: V3(0, 30, 0) };
  } },
};

/** switch shot; cut = true snaps the camera instead of easing */
export function setShot(name, { cut = false } = {}) {
  if (!SHOTS[name]) return;
  if (name === 'burn' || name === 'idle' || name === 'wide') orbitAngle = Math.atan2(camBase.z, camBase.x);
  shot = name; shotTime = 0;
  setXrayAuto(SHOTS[name].xray);
  if (cut) { const s = SHOTS[name].get(0); camBase.copy(s.pos); camLook.copy(s.look); }
}
export function getShot() { return shot; }
export function addShake(v) { shake = Math.max(shake, v); }

/* 360 view: drag to orbit, scroll to zoom, right-drag to pan. Touching the camera takes it over from the
   director (the film keeps playing); setFreeCam(false) eases back to the current shot. */
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 2, maxDistance: 450, maxPolarAngle: Math.PI * 0.495, screenSpacePanning: true });
let freeCam = false;
const camListeners = [];
export function isFreeCam() { return freeCam; }
export function onFreeCam(fn) { camListeners.push(fn); }
export function setFreeCam(v) {
  if (v === freeCam) return;
  freeCam = v;
  if (!v) { camBase.copy(camera.position); camLook.copy(controls.target); }
  camListeners.forEach((fn) => fn(v));
}
controls.addEventListener('start', () => setFreeCam(true));
/** street mode (street.js) borrows the camera: the director and the 360 controls stand aside */
let borrowed = false;
export function borrowCamera(v) {
  borrowed = v; controls.enabled = !v;
  if (v) setFreeCam(false); else { camBase.copy(camera.position); }
}
export function isCameraBorrowed() { return borrowed; }
/** jump the 360 camera to a viewpoint (used for close-ups and tests) */
export function focusCamera(pos, look) {
  setFreeCam(true); camera.position.copy(pos); controls.target.copy(look); controls.update();
}

onUpdate((dt) => {
  shotTime += dt;
  const s = SHOTS[shot], d = s.get(dt);
  if (borrowed) return;
  if (freeCam) { controls.update(); return; }
  controls.target.copy(camLook); // so a drag orbits around what the director was looking at
  camBase.lerp(d.pos, damp(3.2 * s.ease, dt));
  camLook.lerp(d.look, damp(6, dt));
  camera.position.copy(camBase);
  if (shake > 0 && !reduceMotion) camera.position.add(V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * (shot === 'interior' ? 0.08 : 1)));
  shake = Math.max(0, shake - dt * 1.4);
  camera.lookAt(camLook);
});

