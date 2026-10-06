import * as THREE from 'three';
import { scene, renderer, onUpdate } from './world.js';
import { impactPoint, groundY } from './tower.js';
import { people, Humanoid } from './people.js';
import { Sound } from './audio.js';
import { V3, angleDiff } from './util.js';

/* =====================================================================
   NEWS: VN24 (fictional channel) covers the crash.
   - An LED billboard on the plaza shows an ad, then a red BREAKING NEWS
     intro and a live feed of the burning tower rendered by its own news
     cameras (helicopter, long lens, reporter stand-up), with a lower third,
     live evacuation count and a scrolling ticker.
   - A satellite van arrives; a reporter with a microphone, a camera operator
     and a light stand set up on the plaza's south street.
   - An anchor voice reads the bulletin.
   startNews() is called by main.js when the evacuation starts.
   ===================================================================== */
export const NEWS = {
  channel: 'VN24',
  breakingAt: 5,        // seconds after startNews() before the billboard cuts to breaking news
  vanAt: 9,             // when the satellite van starts driving in
  billboard: { x: 30, z: -8.6, ry: -1.03, w: 12, h: 6.75, y0: 7.2 },
  reporter: { x: 20.6, z: 10.7 }, cameraOp: { x: 24.4, z: 12.9 }, light: { x: 23.4, z: 10.2 },
  van: { from: 120, x: 29, z: 12.3 },
  headline: 'PLANE CRASHES INTO HALCYON TOWER',
  ticker: 'Passenger jet strikes Halcyon Tower at floor 14  •  Fire crews battling the blaze from aerial ladders  •  Occupants evacuating by the stairwells  •  Police cordon on the west road  •  Avoid downtown Verrane  •  ',
};

/* ---------- editable text (News tab in the side panel), remembered in this browser ---------- */
const TEXT_KEYS = ['headline', 'ticker', 'channel'];
export const NEWS_DEFAULTS = Object.fromEntries(TEXT_KEYS.map((k) => [k, NEWS[k]]));
try { const saved = JSON.parse(localStorage.getItem('halcyon-news') || '{}'); TEXT_KEYS.forEach((k) => { if (typeof saved[k] === 'string' && saved[k].trim()) NEWS[k] = saved[k]; }); } catch { /* storage unavailable */ }
/** change the headline / ticker / channel; the billboard picks it up on its next redraw */
export function setNewsText(patch) {
  TEXT_KEYS.forEach((k) => { if (typeof patch[k] === 'string') NEWS[k] = patch[k].trim() || NEWS_DEFAULTS[k]; });
  if (!NEWS.ticker.endsWith('  •  ')) NEWS.ticker += '  •  ';
  try { localStorage.setItem('halcyon-news', JSON.stringify(Object.fromEntries(TEXT_KEYS.map((k) => [k, NEWS[k]])))); } catch { /* storage unavailable */ }
}

/* ---------- billboard ---------- */
const B = NEWS.billboard;
export const billboardCenter = V3(B.x, 0.25 + B.y0 + B.h / 2, B.z);
export const billboardNormal = V3(Math.sin(B.ry), 0, Math.cos(B.ry));
const board = new THREE.Group(); board.position.set(B.x, 0.25, B.z); board.rotation.y = B.ry; scene.add(board);
const steel = new THREE.MeshStandardMaterial({ color: 0x2b2a31, roughness: 0.5, metalness: 0.7 });
for (const sx of [-3.6, 3.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, B.y0 + 0.4, 12), steel); p.position.set(sx, (B.y0 + 0.4) / 2, -0.45); p.castShadow = true; board.add(p); }
const frame = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.7, B.h + 0.7, 0.6), steel); frame.position.set(0, B.y0 + B.h / 2, -0.32); frame.castShadow = true; board.add(frame);
const catwalk = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.4, 0.08, 0.9), steel); catwalk.position.set(0, B.y0 - 0.25, 0.25); board.add(catwalk);

const rt = new THREE.WebGLRenderTarget(640, 360, { type: THREE.HalfFloatType });
const newsCam = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 1500);
const feedMat = new THREE.MeshBasicMaterial({ map: rt.texture, color: 0xdedede }); // a touch under the bloom threshold so text stays crisp
const canvasTex = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { c, x: c.getContext('2d'), t }; };
const ad = canvasTex(1024, 576), ov = canvasTex(1024, 576);
const adMat = new THREE.MeshBasicMaterial({ map: ad.t, color: 0xd0d0d0 });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), adMat); screen.position.set(0, B.y0 + B.h / 2, 0.0); board.add(screen);
const overlay = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: ov.t, color: 0xd0d0d0, transparent: true, depthWrite: false }));
overlay.position.set(0, B.y0 + B.h / 2, 0.02); overlay.visible = false; board.add(overlay);
const spill = new THREE.PointLight(0xa8b8ff, 25, 26, 1.6); spill.position.set(0, B.y0 + B.h / 2, 3); board.add(spill);

// the ad shown before the crash
(() => {
  const { x } = ad;
  const g = x.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, '#2a1650'); g.addColorStop(0.6, '#b2406a'); g.addColorStop(1, '#ffb35c');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,240,200,${Math.random() * 0.5})`; x.beginPath(); x.arc(Math.random() * 1024, Math.random() * 330, Math.random() * 3 + 1, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(14,10,30,.55)'; for (let i = 0; i < 14; i++) { const w = 40 + Math.random() * 60, h = 80 + Math.random() * 200; x.fillRect(i * 75, 576 - h, w, h); }
  x.fillStyle = '#fff6e8'; x.font = '900 86px system-ui, sans-serif'; x.fillText('CITY LIGHTS', 60, 170);
  x.font = '900 86px system-ui, sans-serif'; x.fillText('FESTIVAL', 60, 260);
  x.font = '600 34px system-ui, sans-serif'; x.fillStyle = '#ffd9a0'; x.fillText('Verrane waterfront · this weekend', 64, 316);
  ad.t.needsUpdate = true;
})();

/* ---------- lower third, live bug, ticker ---------- */
let mode = 'ad', modeT = 0, tickerX = 0;
function drawOverlay(dt) {
  const { x } = ov, W = 1024, H = 576;
  x.clearRect(0, 0, W, H);
  if (mode === 'intro') { // full-screen sting
    const pulse = 0.5 + 0.5 * Math.sin(modeT * 9);
    x.fillStyle = '#b3121b'; x.fillRect(0, 0, W, H);
    x.fillStyle = `rgba(255,255,255,${0.06 + pulse * 0.06})`; for (let i = 0; i < 12; i++) x.fillRect(0, i * 48 + ((modeT * 120) % 48), W, 20);
    x.fillStyle = '#fff'; x.font = '900 104px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('BREAKING', W / 2, H / 2 - 52); x.fillText('NEWS', W / 2, H / 2 + 58); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    ov.t.needsUpdate = true; return;
  }
  // live bug + channel logo
  x.fillStyle = '#d0141e'; x.fillRect(32, 28, 96, 40); x.fillStyle = '#fff'; x.font = '900 26px system-ui, sans-serif'; x.fillText('LIVE', 48, 58);
  x.fillStyle = 'rgba(10,12,24,.75)'; x.fillRect(128, 28, 200, 40); x.fillStyle = '#e8e8f0'; x.font = '700 22px system-ui, sans-serif'; x.fillText('DOWNTOWN VERRANE', 140, 56);
  x.font = '900 38px system-ui, sans-serif'; const lw = Math.max(136, x.measureText(NEWS.channel).width + 32);
  x.fillStyle = '#122a6b'; x.fillRect(W - 32 - lw, 24, lw, 56); x.fillStyle = '#fff'; x.fillText(NEWS.channel, W - 16 - lw, 66);
  x.fillStyle = '#d0141e'; x.fillRect(W - 32 - lw, 80, lw, 6);
  // lower third
  const out = people.filter((p) => p.state === 'out').length;
  const sub = out >= people.length && people.length ? `All ${people.length} occupants are out  •  Fire crews remain on scene`
    : `Evacuation under way  •  ${out} of ${people.length} occupants out`;
  x.fillStyle = '#d0141e'; x.fillRect(40, 384, 300, 46); x.fillStyle = '#fff'; x.font = '900 30px system-ui, sans-serif'; x.fillText('BREAKING NEWS', 54, 418);
  x.fillStyle = '#f6f6f8'; x.fillRect(40, 430, 944, 62); x.fillStyle = '#0d0f1a'; fitText(x, NEWS.headline.toUpperCase(), 56, 475, 912, 38);
  x.fillStyle = 'rgba(12,14,30,.88)'; x.fillRect(40, 492, 944, 36); x.fillStyle = '#e8e8f0'; x.font = '600 22px system-ui, sans-serif'; x.fillText(sub, 56, 518);
  // ticker
  x.fillStyle = '#8f0f16'; x.fillRect(0, 536, W, 40);
  x.save(); x.beginPath(); x.rect(150, 536, W - 150, 40); x.clip();
  x.fillStyle = '#fff'; x.font = '600 22px system-ui, sans-serif';
  const tw = x.measureText(NEWS.ticker).width; tickerX = (tickerX + dt * 110) % tw;
  for (let k = 0; k < 3; k++) x.fillText(NEWS.ticker, 160 - tickerX + k * tw, 564);
  x.restore();
  x.fillStyle = '#fff'; x.fillRect(0, 536, 150, 40); x.fillStyle = '#8f0f16'; fitText(x, NEWS.channel + ' NEWS', 12, 564, 130, 22);
  ov.t.needsUpdate = true;
}

/** draw bold text shrunk to fit maxW */
function fitText(x, text, px, py, maxW, size) {
  x.font = `900 ${size}px system-ui, sans-serif`;
  const w = x.measureText(text).width;
  if (w > maxW) x.font = `900 ${Math.max(14, Math.floor(size * maxW / w))}px system-ui, sans-serif`;
  x.fillText(text, px, py);
}

/* =====================================================================
   NEWS CREW: satellite van, reporter, camera operator, light stand
   ===================================================================== */
const crew = new THREE.Group(); scene.add(crew);
const white = new THREE.MeshStandardMaterial({ color: 0xeeeef2, roughness: 0.4, metalness: 0.2 });
const dark = new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.5, metalness: 0.4 });
const glassM = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.1, metalness: 0.7 });
const box = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };

function label() {
  const c = canvasTex(512, 128), x = c.x;
  x.fillStyle = '#eeeef2'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#122a6b'; x.fillRect(0, 22, 512, 84); x.fillStyle = '#d0141e'; x.fillRect(0, 100, 512, 10);
  x.fillStyle = '#fff'; x.font = '900 64px system-ui, sans-serif'; x.fillText(NEWS.channel, 24, 86); x.font = '800 38px system-ui, sans-serif'; x.fillText('NEWS · LIVE', 210, 80);
  c.t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: c.t, roughness: 0.4 });
}
let van = null;
function buildVan() {
  const g = new THREE.Group(), L = 6, W = 2.3;
  box(W, 2.5, L * 0.72, white, 0, 1.6, -L * 0.14, g);                  // box body
  box(W * 0.98, 1.7, L * 0.3, white, 0, 1.2, L * 0.34, g);             // cab
  box(W * 0.9, 0.6, 0.05, glassM, 0, 1.6, L * 0.49, g);                 // windscreen
  const lm = label();
  [1, -1].forEach((s) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), lm); p.position.set(s * (W / 2 + 0.02), 1.9, -L * 0.14); p.rotation.y = s * Math.PI / 2; g.add(p); });
  [[1, 1.9], [1, -1.7], [-1, 1.9], [-1, -1.7]].forEach(([s, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 14), dark); w.rotation.z = Math.PI / 2; w.position.set(s * W / 2, 0.46, z); g.add(w); });
  const mast = new THREE.Group(); mast.position.set(0, 2.85, -L * 0.3); g.add(mast);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 8), dark); pole.position.y = 0.5; mast.add(pole);
  const dishG = new THREE.Group(); mast.add(dishG);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 10, 0, Math.PI * 2, 0, 0.75), white); dish.material = white.clone(); dish.material.side = THREE.DoubleSide;
  dish.rotation.x = Math.PI; dishG.add(dish); dishG.rotation.x = -0.9;
  g.visible = false; crew.add(g);
  van = { g, mast, pole, dishG, k: 0, t: 0, parked: false };
}

// small poseable people for the crew (the Humanoid rig from people.js)
const POSES = {
  stand(t) { for (const k in t) t[k] = 0; t.shLZ = 0.08; t.shRZ = -0.08; t.elLX = t.elRX = -0.2; },
  report(t, now) { // microphone at the mouth, free hand gesturing, head talking
    for (const k in t) t[k] = 0;
    t.shRX = -1.05; t.shRZ = -0.32; t.elRX = -1.75;
    t.shLX = -0.35 + Math.sin(now * 1.7) * 0.25; t.shLZ = 0.15; t.elLX = -0.9 + Math.sin(now * 2.3) * 0.3;
    t.headY = Math.sin(now * 0.8) * 0.18; t.headX = Math.sin(now * 3.1) * 0.04; t.spineX = Math.sin(now * 1.2) * 0.02;
  },
  film(t, now) { // shoulder camera
    for (const k in t) t[k] = 0;
    t.shRX = -1.25; t.shRZ = -0.35; t.elRX = -1.75; t.shLX = -1.25; t.shLZ = -0.45; t.elLX = -0.85; t.headY = -0.12; t.headX = 0.05;
    t.hipLX = -0.12; t.hipRX = 0.18; t.knLX = 0.12; t.spineX = Math.sin(now * 1.1) * 0.01;
  },
};
function gait(t, phi) {
  const s = Math.sin(phi), c = Math.cos(phi); for (const k in t) t[k] = 0;
  t.hipLX = -0.42 * s; t.hipRX = 0.42 * s; t.knLX = 0.1 + 0.85 * Math.max(0, c); t.knRX = 0.1 + 0.85 * Math.max(0, -c);
  t.shLX = 0.38 * s; t.shRX = -0.38 * s; t.elLX = t.elRX = -0.3; t.shLZ = 0.08; t.shRZ = -0.08; t.spineX = 0.05; t.drop = -0.03 * Math.abs(c);
}
const members = [];
function member(look, at, mark, pose, faceTo) {
  const h = new Humanoid({ heightScale: 1, headPhoto: null, ...look });
  h.root.position.set(at.x, groundY(at.x, at.z), at.z); h.root.visible = false; crew.add(h.root); // steps out of the van once it parks
  const m = { h, mark, pose, faceTo, phi: 0, heading: Math.atan2(mark.x - at.x, mark.z - at.z), there: false };
  members.push(m); return m;
}
let reporter = null, cameraOp = null, lamp = null, spot = null;
function buildCrew() {
  const at = { x: NEWS.van.x - 1.8, z: NEWS.van.z - 1.3 };
  reporter = member({ skinTone: '#c68f65', hairStyle: 'bun', hairColor: '#24160f', outfitTop: '#24324f', outfitBottom: '#1d1d24', accessory: 'none', longSleeves: true }, at, NEWS.reporter, 'report', NEWS.cameraOp);
  cameraOp = member({ skinTone: '#e0ac87', hairStyle: 'short', hairColor: '#4b2e1e', outfitTop: '#3a3a40', outfitBottom: '#2b2d42', accessory: 'cap', longSleeves: false }, { x: at.x + 0.8, z: at.z - 0.4 }, NEWS.cameraOp, 'film', NEWS.reporter);
  // microphone in the reporter's right hand (pointing on along the forearm toward the mouth)
  const mic = new THREE.Group(); mic.position.set(0, -0.3, 0.02); reporter.h.elR.add(mic);
  const part = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; mic.add(o); };
  part(new THREE.CylinderGeometry(0.014, 0.012, 0.16, 8), dark, -0.06); part(new THREE.SphereGeometry(0.03, 10, 8), dark, -0.15); part(new THREE.BoxGeometry(0.05, 0.04, 0.05), label(), -0.04);
  // shoulder camera on the operator's right shoulder
  const cam = new THREE.Group(); cam.position.set(-0.2, 0.6, 0.08); cameraOp.h.spine.add(cam);
  box(0.16, 0.2, 0.42, dark, 0, 0, 0, cam); box(0.09, 0.09, 0.14, glassM, 0, 0.01, 0.27, cam); box(0.05, 0.08, 0.1, dark, 0.06, 0.15, 0.05, cam);
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tally.position.set(0, 0.11, 0.2); cam.add(tally);
  // light stand with a softbox aimed at the reporter
  const L = NEWS.light, y = groundY(L.x, L.z);
  lamp = new THREE.Group(); lamp.position.set(L.x, y, L.z); lamp.rotation.y = Math.atan2(NEWS.reporter.x - L.x, NEWS.reporter.z - L.z); crew.add(lamp);
  [0, 2.1, 4.2].forEach((a) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 5), dark); leg.position.set(Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3); leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); lamp.add(leg); });
  box(0.03, 1.3, 0.03, dark, 0, 1.6, 0, lamp);
  box(0.6, 0.5, 0.25, dark, 0, 2.25, 0, lamp);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.45), new THREE.MeshBasicMaterial({ color: 0xfff6e6 })); face.position.set(0, 2.25, 0.13); lamp.add(face);
  spot = new THREE.SpotLight(0xfff1dd, 0, 14, 0.5, 0.6, 1.5); spot.position.set(L.x, y + 2.25, L.z);
  spot.target.position.set(NEWS.reporter.x, groundY(NEWS.reporter.x, NEWS.reporter.z) + 1.5, NEWS.reporter.z); crew.add(spot, spot.target);
  lamp.visible = false;
}

/* =====================================================================
   FEED CAMERAS: helicopter, long lens, reporter stand-up (once set up)
   ===================================================================== */
const FEEDS = [
  { name: 'chopper', dur: 8, set(t) { const a = 2.3 + t * 0.06; newsCam.fov = 32; newsCam.position.set(impactPoint.x + Math.cos(a) * 62, 80, Math.sin(a) * 62); newsCam.lookAt(impactPoint.x, impactPoint.y - 4, 0); } },
  { name: 'long', dur: 6, set(t) { newsCam.fov = 18 - t * 0.4; newsCam.position.set(70, 6, 46); newsCam.lookAt(impactPoint.x + 2, impactPoint.y - 2, 0); } },
  { name: 'reporter', dur: 9, ready: () => reporter?.there && cameraOp?.there, set(t) {
    const R = NEWS.reporter, C = NEWS.cameraOp, bob = Math.sin(t * 1.3) * 0.02;
    newsCam.fov = 46; newsCam.position.set(C.x, groundY(C.x, C.z) + 1.72 + bob, C.z);
    newsCam.lookAt(V3(R.x, groundY(R.x, R.z) + 1.5, R.z).lerp(V3(impactPoint.x, impactPoint.y * 0.55, 0), 0.12));
  } },
];
let feedIdx = 0, feedT = 0, feedFrame = 0;
function renderFeed(dt) {
  feedT += dt;
  let f = FEEDS[feedIdx];
  if (feedT > f.dur) { feedT = 0; do { feedIdx = (feedIdx + 1) % FEEDS.length; f = FEEDS[feedIdx]; } while (f.ready && !f.ready()); }
  f.set(feedT); newsCam.updateProjectionMatrix();
  if (++feedFrame % 2) return; // every other frame is plenty for a TV feed
  board.visible = false; // never film the screen itself (feedback loop)
  const prevAuto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false; // reuse this frame's shadow maps
  renderer.setRenderTarget(rt); renderer.render(scene, newsCam); renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = prevAuto; board.visible = true;
}

/* =====================================================================
   TIMELINE
   ===================================================================== */
let active = false, T = 0, events = [], evIdx = 0, ovAcc = 0;
const say = (text) => { try { Sound.speak(text, { force: true, pitch: 1, rate: 1.03 }); } catch { /* speech is optional */ } };

export function startNews() {
  stopNews(); active = true; T = 0; evIdx = 0; reported = false;
  buildVan(); buildCrew();
  events = [
    [NEWS.breakingAt, () => { mode = 'intro'; modeT = 0; screen.material = feedMat; overlay.visible = true; spill.color.setHex(0xff5a4a); try { Sound.ding(); } catch { /* optional */ } }],
    [NEWS.breakingAt + 1.8, () => { mode = 'live'; spill.color.setHex(0xc8d0ff); }],
    [NEWS.breakingAt + 2.2, () => say(NEWS.headline === NEWS_DEFAULTS.headline
      ? `This is ${NEWS.channel} with breaking news. A passenger jet has crashed into Halcyon Tower in downtown Verrane. Emergency crews are responding and the building is being evacuated.`
      : `This is ${NEWS.channel} with breaking news. ${NEWS.headline.toLowerCase()}.`)],
    [NEWS.vanAt, () => { van.g.visible = true; van.g.position.set(NEWS.van.from, 0.06, NEWS.van.z); van.g.rotation.y = -Math.PI / 2; }],
  ];
}
let previewing = false;
/** show the breaking-news screen now (News tab), without the van or the timeline */
export function previewNews(v = true) {
  if (active) return;
  previewing = v;
  if (v) { mode = 'live'; screen.material = feedMat; overlay.visible = true; } else { mode = 'ad'; screen.material = adMat; overlay.visible = false; }
}
export function isPreviewing() { return previewing; }
export function stopNews() {
  active = false; previewing = false; mode = 'ad'; screen.material = adMat; overlay.visible = false; spill.color.setHex(0xa8b8ff);
  members.forEach((m) => crew.remove(m.h.root)); members.length = 0; reporter = cameraOp = null;
  crew.clear(); van = null; lamp = null; spot = null; feedIdx = 0; feedT = 0;
}

let reported = false;
onUpdate((dt, now) => {
  if (previewing) { renderFeed(dt); ovAcc += dt; if (ovAcc > 0.05) { drawOverlay(ovAcc); ovAcc = 0; } return; }
  if (!active) return;
  T += dt; modeT += dt;
  while (evIdx < events.length && events[evIdx][0] <= T) events[evIdx++][1]();
  if (mode !== 'ad') {
    renderFeed(dt);
    ovAcc += dt; if (ovAcc > 0.05) { drawOverlay(ovAcc); ovAcc = 0; }
  }
  // van drives in, raises the mast, crew walks to their marks
  if (van?.g.visible && !van.parked) {
    const p = van.g.position, d = p.x - NEWS.van.x, speed = Math.min(16, 1.2 + d * 0.45);
    p.x -= Math.min(d, speed * dt);
    if (d < 0.05) { p.x = NEWS.van.x; van.parked = true; van.t = 0; }
  }
  if (van?.parked) {
    van.t += dt; const k = Math.min(1, van.t / 5);
    van.pole.scale.y = 1 + k * 3; van.pole.position.y = (1 + k * 3) / 2; van.dishG.position.y = 1 + k * 3; van.dishG.rotation.y = k * 1.2;
    if (van.t > 1.5) {
      lamp.visible = true; spot.intensity = 12;
      for (const m of members) {
        m.h.root.visible = true;
        const pos = m.h.root.position, dx = m.mark.x - pos.x, dz = m.mark.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const step = Math.min(d, 1.4 * dt); pos.x += (dx / d) * step; pos.z += (dz / d) * step; pos.y = groundY(pos.x, pos.z);
          m.heading += angleDiff(m.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8); m.phi += step * Math.PI * 2 / 1.4; gait(m.h.target, m.phi);
        } else {
          m.there = true; m.heading += angleDiff(m.heading, Math.atan2(m.faceTo.x - pos.x, m.faceTo.z - pos.z)) * Math.min(1, dt * 4);
          POSES[m.pose](m.h.target, now);
        }
        m.h.root.rotation.y = m.heading; m.h.apply(dt, 8);
      }
      if (!reported && reporter.there && cameraOp.there) { reported = true; setTimeout(() => active && say('We are live outside Halcyon Tower. Fire crews are attacking the fire from aerial ladders, and people are still coming down the stairwells.'), 2500); }
    }
  }
  if (!van || !van.parked) members.forEach((m) => { POSES.stand(m.h.target); m.h.root.rotation.y = m.heading; m.h.apply(dt, 8); });
});
