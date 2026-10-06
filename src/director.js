import { IMPACT_FLOOR, FLOOR_H, PLAZA_CENTER } from './config.js';
import { camera, onUpdate } from './world.js';
import { impactPoint, floorY, setXrayAuto } from './tower.js';
import { planeState } from './plane.js';
import { centroid } from './people.js';
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

onUpdate((dt) => {
  shotTime += dt;
  const s = SHOTS[shot], d = s.get(dt);
  camBase.lerp(d.pos, damp(3.2 * s.ease, dt));
  camLook.lerp(d.look, damp(6, dt));
  camera.position.copy(camBase);
  if (shake > 0 && !reduceMotion) camera.position.add(V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * (shot === 'interior' ? 0.08 : 1)));
  shake = Math.max(0, shake - dt * 1.4);
  camera.lookAt(camLook);
});

