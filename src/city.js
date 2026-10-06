import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_STYLE, CITY_DIR, INTERIOR_BUILDINGS, INTERIOR_LIT_FLOORS, WORKERS_PER_FLOOR, TOWER_BASE } from './config.js';
import { scene, onUpdate, GRID, CELL, HERO_CELL, PLAZA_CELL, cellCenter } from './world.js';
import { $, V3, seeded } from './util.js';

/* =====================================================================
   CITY: realistic procedural skyline (default) or KayKit low-poly models,
   an open plaza east of the tower, and a few neighbours with lit interiors.
   ===================================================================== */
const isHero = (gx, gz) => gx === HERO_CELL && gz === HERO_CELL;
const isPlaza = (gx, gz) => gx === PLAZA_CELL.gx && gz === PLAZA_CELL.gz;
// neighbours that get see-through lit interiors (in priority order)
const INTERIOR_CELLS = [[HERO_CELL - 1, HERO_CELL], [HERO_CELL, HERO_CELL + 1], [HERO_CELL, HERO_CELL - 1],
  [HERO_CELL - 1, HERO_CELL + 1], [HERO_CELL + 1, HERO_CELL - 1], [HERO_CELL - 1, HERO_CELL - 1]].slice(0, Math.max(0, Math.min(6, INTERIOR_BUILDINGS)));
const isInterior = (gx, gz) => INTERIOR_CELLS.some(([a, b]) => a === gx && b === gz);

const dummy = new THREE.Object3D();
const mat4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => {
  dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); return dummy.matrix.clone();
};
function instanced(geo, mat, matrices, { cast = false, recv = false, colors = null } = {}) {
  if (!matrices.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => { m.setMatrixAt(i, mx); if (colors) m.setColorAt(i, colors[i]); });
  m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
}

/* window textures (low-poly fallback) */
function makeWindowTex(w, h, rows, cols, rnd, litChance) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); const ch = h / rows, cw = w / cols;
  x.fillStyle = '#161a33'; x.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    x.fillStyle = rnd() < litChance ? '#ffd89a' : '#1d2342';
    x.fillRect(c * cw + cw * 0.14, r * ch + ch * 0.2, cw * 0.72, ch * 0.56);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* ---------- realistic glass curtain-wall towers ---------- */
const STYLES = [
  { glass: '#243a5c', glass2: '#35557f', frame: '#8c93a3', lit: 0.55 },  // blue curtain wall
  { glass: '#1c2c33', glass2: '#2b4550', frame: '#6e7a80', lit: 0.5 },   // teal-grey glass
  { glass: '#3a2e2a', glass2: '#5a463d', frame: '#9a8f86', lit: 0.6 },   // bronze glass
  { glass: '#161b27', glass2: '#222c40', frame: '#555b69', lit: 0.45 },  // dark steel
];
const facadeCache = new Map();
function facade(cols, rows, si, variant) {
  const key = `${cols}x${rows}:${si}:${variant}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const S = STYLES[si], cw = 16, ch = 20;
  const rnd = seeded(cols * 1000 + rows * 17 + si * 131 + variant * 7919 + 5);
  const a = document.createElement('canvas'), e = document.createElement('canvas');
  a.width = e.width = cols * cw; a.height = e.height = rows * ch;
  const ax = a.getContext('2d'), ex = e.getContext('2d');
  ax.fillStyle = S.frame; ax.fillRect(0, 0, a.width, a.height);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, e.width, e.height);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw, y = r * ch;
    const g = ax.createLinearGradient(x, y, x, y + ch);
    g.addColorStop(0, S.glass2); g.addColorStop(1, S.glass);
    ax.fillStyle = g; ax.fillRect(x + 2, y + 3, cw - 4, ch - 6);
    if (rnd() < S.lit) {
      ex.fillStyle = rnd() < 0.18 ? '#cfe6ff' : (rnd() < 0.5 ? '#ffd9a0' : '#ffc27a');
      ex.globalAlpha = 0.45 + rnd() * 0.55; ex.fillRect(x + 2, y + 3, cw - 4, ch - 6); ex.globalAlpha = 1;
    }
  }
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const mat = new THREE.MeshStandardMaterial({ map: mk(a), emissiveMap: mk(e), emissive: 0xffffff, emissiveIntensity: 1.15, metalness: 0.6, roughness: 0.2 });
  const out = { mat }; facadeCache.set(key, out); return out;
}

const cityRoofMat = new THREE.MeshStandardMaterial({ color: 0x34323e, roughness: 0.85, metalness: 0.1 });
const CFLOOR = 3.4;
function makePart(w, d, rows, cols, si, variant) {
  const h = rows * CFLOOR, side = facade(cols, rows, si, variant).mat;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, cityRoofMat, cityRoofMat, side, side]);
  mesh.position.y = h / 2; mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, h };
}
function realisticBuilding(rnd, dist) {
  const g = new THREE.Group();
  const w = 11 + rnd() * 5, d = 11 + rnd() * 5;
  const rows = Math.min(Math.max(2 * Math.round((5 + rnd() * 8 - dist * 0.8) / 2), 4), 18);
  const cols = [4, 6, 8][Math.floor(rnd() * 3)], si = Math.floor(rnd() * STYLES.length), variant = Math.floor(rnd() * 2);
  const base = makePart(w, d, rows, cols, si, variant); g.add(base.mesh);
  let top = base.h, tw = w, td = d;
  if (rows >= 10 && rnd() < 0.55) { // stepped upper tier
    tw = w * 0.7; td = d * 0.7;
    const up = makePart(tw, td, 4 + 2 * Math.floor(rnd() * 2), Math.max(4, cols - 2), si, variant);
    up.mesh.position.y = base.h + up.h / 2; g.add(up.mesh); top += up.h;
  }
  const mech = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.45, 2.4, td * 0.4), cityRoofMat);
  mech.position.set(rnd() * 1.5 - 0.75, top + 1.2, rnd() * 1.5 - 0.75); mech.castShadow = true; g.add(mech);
  if (rnd() < 0.35) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 6), cityRoofMat); m.position.set(0, top + 6.9, 0); g.add(m); }
  return g;
}

/* ---------- neighbours with see-through lit interiors ---------- */
const shellGlass = new THREE.MeshPhysicalMaterial({ color: 0x6f8aa6, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.42, envMapIntensity: 1.2, clearcoat: 0.6, depthWrite: false });
const iSlabMat = new THREE.MeshStandardMaterial({ color: 0x3e3c48, roughness: 0.9 });
const iCoreMat = new THREE.MeshStandardMaterial({ color: 0x5d5966, roughness: 0.85 });
const iDeskMat = new THREE.MeshStandardMaterial({ color: 0xb8a58a, roughness: 0.7, emissive: 0x2a2014, emissiveIntensity: 0.6 });
const iFrameMat = new THREE.MeshStandardMaterial({ color: 0x24232c, roughness: 0.4, metalness: 0.7 });
const iStripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const workerMat = new THREE.MeshLambertMaterial({ color: 0x16141d });
const workerGeo = (() => {
  const body = new THREE.CapsuleGeometry(0.21, 0.72, 3, 8).translate(0, 0.21 + 0.36 + 0.42, 0);
  const legs = new THREE.CylinderGeometry(0.17, 0.12, 0.85, 8).translate(0, 0.42, 0);
  const head = new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.62, 0);
  return mergeGeometries([body, legs, head]);
})();

const I = { slabs: [], cores: [], desks: [], frames: [], strips: [], stripColors: [], workers: [] };
const workerAnim = []; // { x, y, z, ry, phase, mode }
function interiorBuilding(cx, cz, rnd) {
  const w = 13 + rnd() * 2, d = 13 + rnd() * 2, floors = 7 + Math.floor(rnd() * 6), hgt = floors * CFLOOR, y0 = TOWER_BASE;
  // glass shell with opaque roof
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), [shellGlass, shellGlass, cityRoofMat, cityRoofMat, shellGlass, shellGlass]);
  shell.position.set(cx, y0 + hgt / 2, cz); shell.renderOrder = 2; scene.add(shell);
  // core + slabs + fins
  I.cores.push(mat4(cx, y0 + hgt / 2, cz, w * 0.22, hgt, d * 0.22));
  for (let f = 0; f <= floors; f++) I.slabs.push(mat4(cx, y0 + f * CFLOOR - 0.12, cz, w - 0.1, 0.24, d - 0.1));
  for (let f = 0; f <= floors; f++) {
    const y = y0 + f * CFLOOR - 0.12;
    I.frames.push(mat4(cx, y, cz + d / 2 + 0.06, w + 0.2, 0.36, 0.12), mat4(cx, y, cz - d / 2 - 0.06, w + 0.2, 0.36, 0.12));
    I.frames.push(mat4(cx + w / 2 + 0.06, y, cz, 0.12, 0.36, d + 0.2), mat4(cx - w / 2 - 0.06, y, cz, 0.12, 0.36, d + 0.2));
  }
  const fins = 7;
  for (let k = 0; k <= fins; k++) {
    const tx = -w / 2 + (k * w) / fins, tz = -d / 2 + (k * d) / fins;
    I.frames.push(mat4(cx + tx, y0 + hgt / 2, cz + d / 2 + 0.06, 0.08, hgt, 0.18), mat4(cx + tx, y0 + hgt / 2, cz - d / 2 - 0.06, 0.08, hgt, 0.18));
    I.frames.push(mat4(cx + w / 2 + 0.06, y0 + hgt / 2, cz + tz, 0.18, hgt, 0.08), mat4(cx - w / 2 - 0.06, y0 + hgt / 2, cz + tz, 0.18, hgt, 0.08));
  }
  // a few lit floors with desks and silhouette workers
  const litFloors = new Set();
  while (litFloors.size < Math.min(INTERIOR_LIT_FLOORS, floors)) litFloors.add(Math.floor(rnd() * floors));
  const warm = rnd() < 0.5;
  for (const f of litFloors) {
    const fy = y0 + f * CFLOOR, ceil = fy + CFLOOR - 0.27;
    const c = warm ? new THREE.Color(2.2, 1.9, 1.45) : new THREE.Color(1.8, 2.0, 2.2);
    for (const sx of [-0.32, 0.32]) { I.strips.push(mat4(cx + sx * w, ceil, cz, 0.16, 0.04, d * 0.8)); I.stripColors.push(c); }
    for (const sz of [-0.34, 0.34]) { I.strips.push(mat4(cx, ceil, cz + sz * d, w * 0.36, 0.04, 0.16)); I.stripColors.push(c); }
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1, along = ((k >> 1) - 1) * d * 0.28;
      I.desks.push(mat4(cx + side * w * 0.36, fy + 0.37, cz + along, 0.75, 0.74, 1.5));
    }
    for (let k = 0; k < WORKERS_PER_FLOOR; k++) {
      const side = rnd() < 0.5 ? -1 : 1, onX = rnd() < 0.6;
      const x = onX ? cx + side * w * (0.27 + rnd() * 0.14) : cx + (rnd() - 0.5) * w * 0.7;
      const z = onX ? cz + (rnd() - 0.5) * d * 0.75 : cz + side * d * (0.3 + rnd() * 0.12);
      const s = 0.92 + rnd() * 0.16;
      workerAnim.push({ x, y: fy, z, ry: rnd() * Math.PI * 2, s, phase: rnd() * 10, mode: Math.floor(rnd() * 3) });
    }
  }
}

let workers = null;
function finishInteriors() {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  instanced(unit, iSlabMat, I.slabs, { cast: true, recv: true });
  instanced(unit, iCoreMat, I.cores, { cast: true, recv: true });
  instanced(unit, iDeskMat, I.desks, { recv: true });
  instanced(unit, iFrameMat, I.frames, { cast: true });
  instanced(unit, iStripMat, I.strips, { colors: I.stripColors });
  if (workerAnim.length) { workers = new THREE.InstancedMesh(workerGeo, workerMat, workerAnim.length); scene.add(workers); }
}
// cheap idle motion for silhouettes: sway, small turns, some pacing
onUpdate((dt, now) => {
  if (!workers) return;
  workerAnim.forEach((w, i) => {
    const t = now + w.phase;
    let x = w.x, z = w.z, ry = w.ry + Math.sin(t * 0.4) * 0.3;
    if (w.mode === 2) { const p = Math.sin(t * 0.25) * 1.6; x += Math.cos(w.ry) * p; z += Math.sin(w.ry) * p; }
    dummy.position.set(x, w.y + (w.mode === 1 ? Math.abs(Math.sin(t * 2)) * 0.02 : 0), z);
    dummy.rotation.set(Math.sin(t * 1.3) * 0.03, ry, 0); dummy.scale.setScalar(w.s); dummy.updateMatrix();
    workers.setMatrixAt(i, dummy.matrix);
  });
  workers.instanceMatrix.needsUpdate = true;
});

/* ---------- plaza east of the tower (gathering point) ---------- */
function buildPlaza() {
  const c = cellCenter(PLAZA_CELL.gx, PLAZA_CELL.gz);
  const pave = new THREE.Mesh(new THREE.BoxGeometry(CELL - 6.2, 0.02, CELL - 6.2), new THREE.MeshStandardMaterial({ color: 0x5b5767, roughness: 0.75 }));
  pave.position.set(c.x, 0.255, c.z); pave.receiveShadow = true; scene.add(pave);
  const trunk = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9 }), leaf = new THREE.MeshStandardMaterial({ color: 0x35553c, roughness: 0.9 });
  const bench = new THREE.MeshStandardMaterial({ color: 0x6b5644, roughness: 0.8 });
  for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 8), trunk); t.position.set(c.x + dx, 1.45, c.z + dz); t.castShadow = true; scene.add(t);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), leaf); l.position.set(c.x + dx, 3.4, c.z + dz); l.castShadow = true; scene.add(l);
  }
  for (const dz of [-8.2, 8.2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.6), bench); b.position.set(c.x, 0.48, c.z + dz); b.castShadow = true; scene.add(b);
  }
}

function buildRealisticCity() {
  const rnd = seeded(77);
  for (let gx = 0; gx < GRID; gx++) for (let gz = 0; gz < GRID; gz++) {
    if (isHero(gx, gz) || isPlaza(gx, gz)) continue;
    const c = cellCenter(gx, gz);
    if (isInterior(gx, gz)) { interiorBuilding(c.x, c.z, rnd); continue; }
    const g = realisticBuilding(rnd, Math.hypot(gx - HERO_CELL, gz - HERO_CELL));
    g.position.set(c.x + (rnd() - 0.5) * 3, 0.25, c.z + (rnd() - 0.5) * 3);
    g.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
    scene.add(g);
  }
  finishInteriors();
  // distant skyline ring, fades into the haze
  for (let i = 0; i < 90; i++) {
    const ang = rnd() * Math.PI * 2, r = 200 + rnd() * 270, w = 18 + rnd() * 16, d = 18 + rnd() * 16, h = 30 + rnd() * 80;
    const mat = facade(8, 24, Math.floor(rnd() * STYLES.length), 0).mat;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, cityRoofMat, cityRoofMat, mat, mat]);
    m.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r); m.rotation.y = rnd() * Math.PI; scene.add(m);
  }
  $('city-info').textContent = `Realistic city generated (${INTERIOR_CELLS.length} buildings with lit interiors). Set CITY_STYLE to "lowpoly" in src/config.js to use the KayKit models.`;
}

/* ---------- KayKit low-poly models ---------- */
async function buildLowpolyCity() {
  let files = [];
  try { const r = await fetch('/__city-files'); if (r.ok) files = await r.json(); } catch {}
  const loader = new GLTFLoader();
  const models = [];
  for (const f of files) {
    try { const g = await loader.loadAsync(CITY_DIR + f); models.push({ name: f, obj: g.scene }); } catch (e) { console.warn('Could not load', f, e); }
  }
  let pool = models.filter((m) => /(^|\/)building_/i.test(m.name) && !/withoutbase/i.test(m.name));
  if (!pool.length) pool = models.filter((m) => !/(road|car|tree|bush|base|light|bench|firehydrant|trash|watertower|dumpster|streetlight|box)/i.test(m.name));
  const rnd = seeded(23);
  const fallbackTex = [0, 1, 2].map((i) => makeWindowTex(128, 256, 14, 5, seeded(40 + i), 0.55));
  let used = 0;
  for (let gx = 0; gx < GRID; gx++) for (let gz = 0; gz < GRID; gz++) {
    if (isHero(gx, gz) || isPlaza(gx, gz)) continue;
    const { x: cx, z: cz } = cellCenter(gx, gz);
    const group = new THREE.Group();
    const foot = CELL * 0.5, yMul = 0.8 + rnd() * 1.6;
    if (pool.length) {
      const clone = pool[Math.floor(rnd() * pool.length)].obj.clone(true);
      const bx = new THREE.Box3().setFromObject(clone), size = bx.getSize(V3(0, 0, 0)), ctr = bx.getCenter(V3(0, 0, 0));
      clone.position.set(-ctr.x, -bx.min.y, -ctr.z);
      group.add(clone);
      const s = foot / Math.max(size.x, size.z, 0.001);
      group.scale.set(s, s * yMul, s);
      group.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
      used++;
    } else {
      const h = 10 + rnd() * 30;
      const mat = new THREE.MeshStandardMaterial({ map: fallbackTex[Math.floor(rnd() * 3)], emissiveMap: fallbackTex[0], emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(foot, h, foot), mat); b.position.y = h / 2; group.add(b);
    }
    group.position.set(cx, 0, cz);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);
  }
  $('city-info').textContent = used
    ? `City loaded: ${models.length} model files from public/models/city.`
    : 'No city models found, using generated buildings. Add .gltf files to public/models/city.';
}

export async function buildCity() {
  buildPlaza();
  if (CITY_STYLE === 'realistic') buildRealisticCity();
  else await buildLowpolyCity();
}
