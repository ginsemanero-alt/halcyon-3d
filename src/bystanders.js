import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene, onUpdate } from './world.js';
import { groundY } from './tower.js';
import { seeded } from './util.js';

/* =====================================================================
   BYSTANDERS: onlookers gathered behind the cordon, on the plaza edge and
   along the streets, watching the tower. Static Sketchfab models (no rig),
   so they stand still with a slight idle sway. Credits are in the Sound tab.
   startBystanders() is called when the evacuation starts; the group north of
   the west-road tape waits until the fire trucks have driven past.
   ===================================================================== */
const DIR = '/models/people/';
export const BYSTANDER_MODELS = [
  { file: 'a_guy_man_dude_-_character.glb', height: 1.78 },
  { file: 'man_in_suit.glb', height: 1.8, skip: /floor/i },   // the file ships with a floor tile
  { file: 'young_woman.glb', height: 1.66 },
];
// groups: where people stand, how many, which way they look (toward a point) and when they arrive (s after start)
export const BYSTANDER_GROUPS = [
  { at: 2, cx: 34.2, cz: 0, sx: 0.8, sz: 6.5, n: 7, look: [0, 30, 0] },        // east edge of the plaza
  { at: 2, cx: 26, cz: -13.6, sx: 4.5, sz: 0.9, n: 6, look: [0, 30, 0] },       // north street beside the plaza
  { at: 4, cx: -12, cz: 33, sx: 2.6, sz: 1.4, n: 6, look: [-8, 30, 0] },        // behind the south tape on the west road
  { at: 30, cx: -12, cz: -33, sx: 2.6, sz: 1.4, n: 6, look: [-8, 30, 0] },      // behind the north tape (after the trucks pass)
];

const loader = new GLTFLoader();
const templates = [];
const ready = Promise.all(BYSTANDER_MODELS.map(async (m) => {
  try {
    const g = (await loader.loadAsync(DIR + m.file)).scene;
    if (m.skip) { const drop = []; g.traverse((o) => { if (o.isMesh && [].concat(o.material).some((mt) => m.skip.test(mt.name || '')) ) drop.push(o); }); drop.forEach((o) => o.parent.remove(o)); }
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group(), inner = new THREE.Group(); holder.add(inner); inner.add(g);
    const s = m.height / Math.max(size.y, 1e-6);
    inner.scale.setScalar(s); inner.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s); // feet on the ground, centred
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    templates.push(holder);
  } catch (e) { console.warn('Bystander model not loaded:', m.file, e); }
}));

const crowd = new THREE.Group(); scene.add(crowd);
const placed = []; // { obj, at, base, phase }
let active = false, T = 0;

function build() {
  crowd.clear(); placed.length = 0;
  if (!templates.length) return;
  const rnd = seeded(5150);
  BYSTANDER_GROUPS.forEach((G, gi) => {
    for (let i = 0; i < G.n; i++) {
      const obj = templates[(i + gi) % templates.length].clone(true);
      const x = G.cx + (rnd() - 0.5) * 2 * G.sx, z = G.cz + (rnd() - 0.5) * 2 * G.sz;
      obj.position.set(x, groundY(x, z), z);
      const yaw = Math.atan2(G.look[0] - x, G.look[2] - z) + (rnd() - 0.5) * 0.5; // look at the tower, a little scattered
      obj.rotation.y = yaw; obj.scale.setScalar(0.94 + rnd() * 0.1);
      obj.visible = false; crowd.add(obj);
      placed.push({ obj, at: G.at + rnd() * 3, base: yaw, phase: rnd() * 10 });
    }
  });
}

export function startBystanders() { ready.then(() => { build(); active = true; T = 0; }); }
export function stopBystanders() { active = false; crowd.clear(); placed.length = 0; }

onUpdate((dt, now) => {
  if (!active) return;
  T += dt;
  for (const p of placed) {
    if (!p.obj.visible && T >= p.at) p.obj.visible = true;
    p.obj.rotation.y = p.base + Math.sin(now * 0.3 + p.phase) * 0.06; // shifting weight, glancing around
  }
});
