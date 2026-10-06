import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { camera, onUpdate, HALF, CELL, HERO_CELL, PLAZA_CELL, cellCenter } from './world.js';
import { TOWER_W } from './config.js';
import { groundY } from './tower.js';
import { borrowCamera } from './director.js';
import { Sound } from './audio.js';
import { $, V3, damp } from './util.js';

/* =====================================================================
   STREET MODE: watch everything as a bystander, in first person.
   Click to look around (mouse), WASD / arrow keys to walk, Shift to run,
   Esc frees the mouse, B (or the button) leaves street mode.
   Buildings and the tower block the way; sidewalks, roads and the plaza are open.
   The film keeps playing around you.
   ===================================================================== */
export const STREET = { walk: 2.6, run: 6.5, eye: 1.65, fov: 70, spawn: { x: 17.5, z: 3, yaw: Math.PI / 2 } };

const controls = new PointerLockControls(camera, document.body);
let on = false, prevFov = camera.fov, bob = 0, lastStepSide = 0;
const keys = new Set(), vel = V3(0, 0, 0);

/** true where a person can't stand: outside the city, inside the tower, or inside a building block */
function blocked(x, z) {
  if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return true;
  if (Math.abs(x) < TOWER_W / 2 + 0.4 && Math.abs(z) < TOWER_W / 2 + 0.4) return true;
  const gx = Math.floor((x + HALF) / CELL), gz = Math.floor((z + HALF) / CELL);
  if ((gx === HERO_CELL && gz === HERO_CELL) || (gx === PLAZA_CELL.gx && gz === PLAZA_CELL.gz)) return false;
  const c = cellCenter(gx, gz);
  return Math.abs(x - c.x) < CELL / 2 - 2.1 && Math.abs(z - c.z) < CELL / 2 - 2.1; // keep the sidewalk and road free
}

const hud = $('street-hud');
function showHud() {
  hud.classList.toggle('hidden', !on);
  $('street-help').classList.toggle('hidden', controls.isLocked);
}
controls.addEventListener('lock', showHud);
controls.addEventListener('unlock', showHud);
// drag to look (works without pointer lock); a plain click (no drag) locks the mouse for continuous look
let drag = null;
hud.addEventListener('pointerdown', (e) => { if (on && !controls.isLocked) { drag = { x: e.clientX, y: e.clientY, moved: 0 }; hud.setPointerCapture(e.pointerId); } });
hud.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  const r = camera.rotation; r.order = 'YXZ';
  r.y -= dx * 0.0042; r.x = Math.max(-1.45, Math.min(1.45, r.x - dy * 0.0042));
});
hud.addEventListener('pointerup', () => { if (drag && drag.moved < 4 && on) controls.lock(); drag = null; });

export function isStreet() { return on; }
export function setStreet(v) {
  if (v === on) return;
  on = v; document.body.classList.toggle('street', v);
  const btn = $('tg-street');
  btn.textContent = v ? 'Street on' : 'Street mode';
  btn.className = `rounded-full px-4 py-1.5 text-xs font-black ${v ? 'bg-mint text-dusk' : 'bg-dusk text-bone'}`;
  if (v) {
    borrowCamera(true);
    prevFov = camera.fov; camera.fov = STREET.fov; camera.updateProjectionMatrix();
    const s = STREET.spawn;
    camera.position.set(s.x, groundY(s.x, s.z) + STREET.eye, s.z);
    camera.rotation.set(0, s.yaw, 0, 'YXZ');
    controls.lock();
  } else {
    controls.unlock(); keys.clear(); vel.set(0, 0, 0);
    camera.fov = prevFov; camera.updateProjectionMatrix();
    borrowCamera(false);
  }
  showHud();
}

const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.key === 'b' || e.key === 'B') { setStreet(!on); return; }
  if (on) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const fwd = V3(0, 0, 0), right = V3(0, 0, 0), want = V3(0, 0, 0);
onUpdate((dt) => {
  if (!on) return;
  const k = (...codes) => codes.some((c) => keys.has(c));
  const f = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
  const r = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  const running = k('ShiftLeft', 'ShiftRight');
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.set(-fwd.z, 0, fwd.x);
  want.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r);
  if (want.lengthSq() > 0) want.normalize().multiplyScalar(running ? STREET.run : STREET.walk);
  vel.lerp(want, damp(10, dt));

  // move with wall sliding: try each axis on its own
  const p = camera.position, nx = p.x + vel.x * dt, nz = p.z + vel.z * dt;
  if (!blocked(nx, p.z)) p.x = nx; else vel.x = 0;
  if (!blocked(p.x, nz)) p.z = nz; else vel.z = 0;

  // eye height follows the ground (curbs) with a little head bob and footsteps
  const speed = Math.hypot(vel.x, vel.z);
  bob += speed * dt * (running ? 1.35 : 1.6);
  const amp = speed > 0.3 ? (running ? 0.07 : 0.04) : 0;
  const ground = groundY(p.x, p.z) + STREET.eye;
  p.y += (ground + Math.abs(Math.sin(bob * Math.PI)) * amp - p.y) * damp(14, dt);
  const side = Math.floor(bob) % 2;
  if (speed > 0.3 && side !== lastStepSide) { lastStepSide = side; try { Sound.step(); } catch { /* optional */ } }
});
