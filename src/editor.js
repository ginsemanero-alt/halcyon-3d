import * as THREE from 'three';
import {
  people, addPerson, removePerson, updatePerson, Humanoid, previewTick, forgetPhoto,
  SKIN_TONES, HAIR_COLORS, HAIR_STYLES, ACCESSORIES, TOPS, BOTTOMS,
} from './people.js';
import { FLOORS } from './config.js';
import { Sound } from './audio.js';

/* =====================================================================
   CAST EDITOR (self-contained: injects its own button, drawer and CSS)
   - edit every occupant: look, outfit, height, floor, spoken line
   - head photo: upload, crop (oval), brightness/contrast, 512x512 texture
   - photos are processed in the browser only; nothing is uploaded anywhere
   ===================================================================== */

const CSS = `
.hc-fab{position:fixed;left:20px;bottom:118px;z-index:45;border:0;cursor:pointer;border-radius:9999px;padding:12px 22px;font:800 14px 'Bricolage Grotesque',system-ui,sans-serif;background:#7be0c3;color:#14122e;box-shadow:0 6px 0 #3f9c82}
.hc-fab:active{transform:translateY(3px);box-shadow:0 3px 0 #3f9c82}
.hc-drawer{position:fixed;top:12px;bottom:12px;right:12px;width:min(470px,calc(100vw - 24px));z-index:50;overflow-y:auto;background:rgba(36,28,74,.97);color:#f3ece2;border-radius:3.5rem;padding:28px 26px 32px;display:none;font-family:'Instrument Sans',system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.hc-drawer.open{display:block}
.hc-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.hc-h{font:800 26px 'Bricolage Grotesque',system-ui,sans-serif;letter-spacing:-.02em;margin:0}
.hc-h2{font:800 15px 'Bricolage Grotesque',system-ui,sans-serif;margin:22px 0 10px;color:#ffb347;text-transform:uppercase;letter-spacing:.06em}
.hc-chips{display:flex;flex-wrap:wrap;gap:8px}
.hc-chip{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;border-radius:9999px;padding:5px 14px 5px 5px;background:#14122e;color:#f3ece2;font:700 13px 'Instrument Sans',sans-serif}
.hc-chip[aria-pressed="true"]{background:#ffb347;color:#14122e}
.hc-av{width:26px;height:26px;border-radius:9999px;background:#7be0c3;color:#14122e;display:grid;place-items:center;font:800 10px 'Bricolage Grotesque',sans-serif;overflow:hidden;flex:none}
.hc-av img{width:100%;height:100%;object-fit:cover}
.hc-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.hc-btn{border:0;cursor:pointer;border-radius:9999px;padding:9px 16px;font:800 12px 'Bricolage Grotesque',sans-serif;color:#14122e;background:#f3ece2}
.hc-btn.mint{background:#7be0c3}.hc-btn.amber{background:#ffb347}.hc-btn.ember{background:#ff5a36}.hc-btn.sky{background:#6fc3ff}.hc-btn.ghost{background:#14122e;color:#f3ece2}
.hc-btn:disabled{opacity:.4;cursor:default}
.hc-x{border:0;cursor:pointer;width:38px;height:38px;border-radius:9999px;background:#14122e;color:#f3ece2;font:800 16px sans-serif}
.hc-pvwrap{border-radius:2.5rem;overflow:hidden;background:radial-gradient(circle at 50% 30%,#3a2e66,#14122e)}
.hc-pv{display:block;width:100%;height:340px}
.hc-field{margin-top:12px;font:700 12px 'Instrument Sans',sans-serif;color:#cfc9e6}
.hc-in{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:0;border-radius:18px;padding:11px 15px;background:#14122e;color:#f3ece2;font:500 14px 'Instrument Sans',sans-serif}
.hc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hc-sw{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}
.hc-sw button{width:24px;height:24px;border-radius:9999px;border:2px solid transparent;cursor:pointer;padding:0}
.hc-sw button[aria-pressed="true"]{border-color:#fff}
.hc-sw input[type=color]{width:34px;height:26px;border:0;padding:0;background:none;cursor:pointer}
.hc-note{margin-top:8px;border:2px solid #ffb347;border-radius:1.5rem;padding:10px 14px;font:600 12px 'Instrument Sans',sans-serif;color:#ffe3b3}
.hc-drop{margin-top:10px;border:2px dashed #7a6fb0;border-radius:2rem;padding:18px;text-align:center;font:600 13px 'Instrument Sans',sans-serif;color:#cfc9e6}
.hc-drop.over{border-color:#7be0c3;background:rgba(123,224,195,.1)}
.hc-thumb{width:84px;height:84px;border-radius:9999px;object-fit:cover;background:#14122e;display:block}
.hc-check{display:flex;gap:8px;align-items:center;margin-top:10px;font:600 13px 'Instrument Sans',sans-serif}
.hc-msg{min-height:20px;margin-top:14px;font:700 12px 'Instrument Sans',sans-serif;color:#7be0c3}
.hc-modal{position:fixed;inset:0;z-index:60;background:rgba(10,8,25,.82);display:flex;align-items:center;justify-content:center;padding:16px}
.hc-card{background:#32275f;color:#f3ece2;border-radius:3rem;padding:26px;width:min(420px,100%);max-height:100%;overflow-y:auto}
.hc-cv{display:block;width:100%;max-width:360px;margin:0 auto;border-radius:1.5rem;touch-action:none;cursor:grab;background:#14122e}
.hc-card input[type=range]{width:100%}
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const initials = (n) => (n || '?').trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
const HEX = /^#[0-9a-f]{6}$/i;

/* ---------- IndexedDB (optional, on this device only) ---------- */
const DB = 'halcyon-cast', STORE = 'kv';
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(key, val) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function idbDel(key) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

/* ---------- cast <-> JSON ---------- */
const castPeople = () => people.filter((p) => !p.data.extra);
function serialize(includePhotos) {
  return {
    app: 'halcyon-3d', version: 1,
    cast: castPeople().map((p) => {
      const d = { ...p.data }; delete d.id; delete d.extra;
      if (!includePhotos) d.headPhoto = null;
      return d;
    }),
  };
}
function cleanImport(d) {
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  const col = (v) => (typeof v === 'string' && HEX.test(v) ? v : undefined);
  const num = (v, a, b) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : undefined);
  return {
    name: str(d.name, 40), role: str(d.role, 40), floor: num(d.floor, 1, FLOORS),
    heightScale: num(d.heightScale, 0.8, 1.2), pitch: num(d.pitch, 0.5, 2),
    skinTone: col(d.skinTone), hairColor: col(d.hairColor), outfitTop: col(d.outfitTop), outfitBottom: col(d.outfitBottom),
    hairStyle: HAIR_STYLES.includes(d.hairStyle) ? d.hairStyle : undefined,
    accessory: ACCESSORIES.includes(d.accessory) ? d.accessory : 'none',
    line: str(d.line, 140), audio: str(d.audio, 200) || null,
    headPhoto: typeof d.headPhoto === 'string' && d.headPhoto.startsWith('data:image/') ? d.headPhoto : null,
    position: null,
  };
}

export function initEditor() {
  if (document.getElementById('hc-drawer')) return;
  const style = el('style'); style.textContent = CSS; document.head.appendChild(style);

  let selected = null, open = false, persistOn = localStorage.getItem('halcyon-persist') === '1', persistTimer = 0, msgTimer = 0;
  let pv = null;

  /* ---------- skeleton ---------- */
  const fab = el('button', 'hc-fab', 'Cast editor');
  const drawer = el('aside', 'hc-drawer'); drawer.id = 'hc-drawer';
  document.body.append(fab, drawer);

  const top = el('div', 'hc-top');
  top.append(el('h2', 'hc-h', 'Cast editor'));
  const closeBtn = el('button', 'hc-x', 'X'); closeBtn.setAttribute('aria-label', 'Close'); top.append(closeBtn);
  drawer.append(top);

  const chips = el('div', 'hc-chips'); drawer.append(chips);
  const rowA = el('div', 'hc-row');
  const bAdd = el('button', 'hc-btn mint', 'Add person');
  const bDup = el('button', 'hc-btn amber', 'Duplicate');
  const bDel = el('button', 'hc-btn ember', 'Remove');
  rowA.append(bAdd, bDup, bDel); drawer.append(rowA);

  drawer.append(el('h3', 'hc-h2', 'Live preview'));
  const pvWrap = el('div', 'hc-pvwrap'); drawer.append(pvWrap);
  const rowB = el('div', 'hc-row');
  const bClose = el('button', 'hc-btn sky', 'Face close-up');
  const bRand = el('button', 'hc-btn amber', 'Randomize look');
  const bSay = el('button', 'hc-btn mint', 'Test line');
  rowB.append(bClose, bRand, bSay); drawer.append(rowB);

  /* ---------- form helpers ---------- */
  const syncers = [];
  const field = (label, node) => { const w = el('label', 'hc-field'); w.append(document.createTextNode(label), node); return w; };
  function textInput(key, label, max = 60, ph = '') {
    const i = el('input', 'hc-in'); i.type = 'text'; i.maxLength = max; i.placeholder = ph;
    i.addEventListener('input', () => applyPatch({ [key]: i.value }));
    syncers.push((d) => { if (document.activeElement !== i) i.value = d[key] ?? ''; });
    return field(label, i);
  }
  function selectInput(key, label, options, parse = (v) => v) {
    const s = el('select', 'hc-in');
    options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.append(o); });
    s.addEventListener('change', () => applyPatch({ [key]: parse(s.value) }));
    syncers.push((d) => { s.value = String(d[key]); });
    return field(label, s);
  }
  function colorInput(key, label, palette) {
    const wrap = el('div', 'hc-sw'); const btns = [];
    palette.forEach((c) => { const b = el('button'); b.style.background = c; b.type = 'button'; b.setAttribute('aria-label', c); b.addEventListener('click', () => { applyPatch({ [key]: c }); syncForm(); }); btns.push([b, c]); wrap.append(b); });
    const pick = el('input'); pick.type = 'color'; pick.addEventListener('input', () => { applyPatch({ [key]: pick.value }); btns.forEach(([b]) => b.setAttribute('aria-pressed', 'false')); });
    wrap.append(pick);
    syncers.push((d) => { pick.value = HEX.test(d[key]) ? d[key] : '#888888'; btns.forEach(([b, c]) => b.setAttribute('aria-pressed', String(c.toLowerCase() === String(d[key]).toLowerCase()))); });
    const w = el('div', 'hc-field'); w.append(document.createTextNode(label), wrap); return w;
  }

  drawer.append(el('h3', 'hc-h2', 'Character'));
  const g1 = el('div', 'hc-grid2'); g1.append(textInput('name', 'Name', 40, 'Mara Okafor'), textInput('role', 'Role', 40, 'Architect'));
  drawer.append(g1);
  const g2 = el('div', 'hc-grid2');
  g2.append(
    selectInput('floor', 'Floor', Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((f) => [f, f === 1 ? '1 (lobby)' : String(f)]), (v) => parseInt(v, 10)),
    selectInput('accessory', 'Accessory', ACCESSORIES.map((a) => [a, a]))
  );
  drawer.append(g2);
  drawer.append(colorInput('skinTone', 'Skin tone', SKIN_TONES));
  drawer.append(selectInput('hairStyle', 'Hair style', HAIR_STYLES.map((h) => [h, h])));
  drawer.append(colorInput('hairColor', 'Hair color', HAIR_COLORS));
  drawer.append(colorInput('outfitTop', 'Top', TOPS));
  drawer.append(colorInput('outfitBottom', 'Bottom', BOTTOMS));
  {
    const r = el('input'); r.type = 'range'; r.min = 0.88; r.max = 1.12; r.step = 0.01;
    r.addEventListener('input', () => applyPatch({ heightScale: parseFloat(r.value) }));
    syncers.push((d) => { r.value = d.heightScale; });
    drawer.append(field('Height', r));
  }
  drawer.append(textInput('line', 'Line they say when they start moving', 140, 'Stairwell, everyone.'));
  const g3 = el('div', 'hc-grid2');
  g3.append(
    selectInput('pitch', 'Voice', [[0.8, 'Low'], [1, 'Mid'], [1.3, 'High']], (v) => parseFloat(v)),
    textInput('audio', 'Custom sound file (optional)', 200, '/sounds/mara.mp3')
  );
  drawer.append(g3);

  /* ---------- head photo ---------- */
  drawer.append(el('h3', 'hc-h2', 'Head photo'));
  drawer.append(el('div', 'hc-note', 'Only use photos of yourself or people who agreed to appear. Photos are processed in your browser and are never uploaded.'));
  const photoRow = el('div', 'hc-row'); photoRow.style.alignItems = 'center';
  const thumb = el('img', 'hc-thumb'); thumb.alt = 'Head photo'; thumb.style.display = 'none';
  photoRow.append(thumb); drawer.append(photoRow);
  const drop = el('div', 'hc-drop', 'Drag a photo here, or choose one');
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.hidden = true;
  drawer.append(drop, fileIn);
  const rowP = el('div', 'hc-row');
  const bPick = el('button', 'hc-btn mint', 'Choose photo');
  const bMatch = el('button', 'hc-btn amber', 'Match skin tone');
  const bRemovePhoto = el('button', 'hc-btn ember', 'Remove photo');
  rowP.append(bPick, bMatch, bRemovePhoto); drawer.append(rowP);

  /* ---------- cast tools ---------- */
  drawer.append(el('h3', 'hc-h2', 'Cast tools'));
  const incLabel = el('label', 'hc-check'); const incBox = el('input'); incBox.type = 'checkbox'; incLabel.append(incBox, document.createTextNode('Include photos in export'));
  const rowT = el('div', 'hc-row');
  const bExp = el('button', 'hc-btn sky', 'Export JSON'); const bImp = el('button', 'hc-btn sky', 'Import JSON');
  const impIn = el('input'); impIn.type = 'file'; impIn.accept = 'application/json,.json'; impIn.hidden = true;
  rowT.append(bExp, bImp, impIn);
  const perLabel = el('label', 'hc-check'); const perBox = el('input'); perBox.type = 'checkbox'; perBox.checked = persistOn; perLabel.append(perBox, document.createTextNode('Remember this cast on this device (IndexedDB)'));
  const rowC = el('div', 'hc-row'); const bClear = el('button', 'hc-btn ember', 'Clear all photos'); rowC.append(bClear);
  const msgBox = el('div', 'hc-msg');
  drawer.append(incLabel, rowT, perLabel, rowC, msgBox);

  /* ---------- helpers ---------- */
  function msg(t) { msgBox.textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => (msgBox.textContent = ''), 3500); }
  function syncForm() { if (!selected) return; syncers.forEach((fn) => fn(selected.data)); refreshPhotoUI(); }
  function refreshPhotoUI() {
    const url = selected?.data.headPhoto;
    thumb.style.display = url ? 'block' : 'none'; if (url) thumb.src = url;
    bRemovePhoto.disabled = !url; bMatch.disabled = !url;
  }
  function refreshChips() {
    chips.textContent = '';
    castPeople().forEach((p) => {
      const b = el('button', 'hc-chip'); b.type = 'button'; b.setAttribute('aria-pressed', String(p === selected));
      const av = el('span', 'hc-av');
      if (p.data.headPhoto) { const im = el('img'); im.src = p.data.headPhoto; im.alt = ''; av.append(im); } else av.textContent = initials(p.data.name);
      b.append(av, document.createTextNode(p.data.name || 'Unnamed'));
      b.addEventListener('click', () => select(p));
      chips.append(b);
    });
  }
  function select(p) { selected = p; syncForm(); refreshChips(); setPreviewHuman(); }
  function applyPatch(patch) {
    if (!selected) return;
    updatePerson(selected, patch);
    if (pv?.human) pv.human.build(selected.data);
    refreshChips(); schedulePersist();
  }

  /* ---------- live 3D preview ---------- */
  const FULL = { pos: new THREE.Vector3(1.0, 1.2, 3.8), look: new THREE.Vector3(0, 0.95, 0) };
  const CLOSE = { pos: new THREE.Vector3(0.12, 1.64, 0.72), look: new THREE.Vector3(0, 1.62, 0) };
  function ensurePreview() {
    if (pv) return;
    const canvas = el('canvas', 'hc-pv'); pvWrap.append(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xb9a8d8, 0x2a2238, 1.1));
    const key = new THREE.DirectionalLight(0xffc48a, 3); key.position.set(2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7aa8ff, 2); rim.position.set(-3, 2, -2); scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), new THREE.MeshStandardMaterial({ color: 0x2b2548, roughness: 0.9 }));
    disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
    pv = { renderer, scene, camera, canvas, human: null, close: false, camPos: FULL.pos.clone(), look: FULL.look.clone(), raf: 0, last: 0 };
  }
  function setPreviewHuman() {
    if (!pv || !selected) return;
    if (pv.human) pv.scene.remove(pv.human.root);
    pv.human = new Humanoid(selected.data); pv.scene.add(pv.human.root);
  }
  function pvLoop(ms) {
    if (!open) { pv.raf = 0; return; }
    pv.raf = requestAnimationFrame(pvLoop);
    const now = ms / 1000, dt = Math.min(now - (pv.last || now), 0.05); pv.last = now;
    const w = pv.canvas.clientWidth, h = pv.canvas.clientHeight;
    if (pv.canvas.width !== Math.floor(w * pv.renderer.getPixelRatio())) { pv.renderer.setSize(w, h, false); pv.camera.aspect = w / h; pv.camera.updateProjectionMatrix(); }
    if (pv.human) { previewTick(pv.human, dt, now); pv.human.root.rotation.y = Math.sin(now * 0.5) * 0.55; }
    const t = pv.close ? CLOSE : FULL, k = 1 - Math.pow(0.002, dt);
    pv.camPos.lerp(t.pos, k); pv.look.lerp(t.look, k);
    pv.camera.position.copy(pv.camPos); pv.camera.lookAt(pv.look);
    pv.renderer.render(pv.scene, pv.camera);
  }

  /* ---------- open / close ---------- */
  function setOpen(v) {
    open = v; drawer.classList.toggle('open', v);
    if (!v) return;
    if (!selected || !people.includes(selected)) selected = castPeople()[0] || null;
    refreshChips();
    if (selected) syncForm();
    ensurePreview(); setPreviewHuman();
    if (!pv.raf) pv.raf = requestAnimationFrame(pvLoop);
  }
  fab.addEventListener('click', () => setOpen(!open));
  closeBtn.addEventListener('click', () => setOpen(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && !document.querySelector('.hc-modal')) setOpen(false); });

  /* ---------- people actions ---------- */
  bAdd.addEventListener('click', () => {
    const p = addPerson({ name: 'New person', role: 'Occupant', floor: 10, line: 'This way, the stairs are clear.', pitch: 1 });
    select(p); schedulePersist();
  });
  bDup.addEventListener('click', () => {
    if (!selected) return;
    const p = addPerson({ ...selected.data, id: undefined, position: null, name: `${selected.data.name} (copy)` });
    select(p); schedulePersist();
  });
  bDel.addEventListener('click', () => {
    if (!selected) return;
    const gone = selected; removePerson(gone);
    selected = castPeople()[0] || null; refreshChips();
    if (selected) { syncForm(); setPreviewHuman(); } else if (pv?.human) { pv.scene.remove(pv.human.root); pv.human = null; }
    schedulePersist();
  });
  bRand.addEventListener('click', () => {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    applyPatch({ skinTone: r(SKIN_TONES), hairStyle: r(HAIR_STYLES), hairColor: r(HAIR_COLORS), outfitTop: r(TOPS), outfitBottom: r(BOTTOMS), accessory: r(ACCESSORIES), heightScale: +(0.93 + Math.random() * 0.14).toFixed(2) });
    syncForm();
  });
  bClose.addEventListener('click', () => { if (pv) { pv.close = !pv.close; bClose.textContent = pv.close ? 'Full body' : 'Face close-up'; } });
  bSay.addEventListener('click', () => {
    if (!selected) return;
    Sound.init?.(); Sound.speak(selected.data.line || selected.data.name, { pitch: selected.data.pitch, force: true });
    Sound.playFile?.(selected.data.audio);
  });

  /* ---------- photo: pick, crop, apply ---------- */
  function pickFile(file) {
    if (!file) return;
    if (!selected) return msg('Add or select a person first.');
    if (!file.type.startsWith('image/')) return msg('Please choose an image file.');
    if (file.size > 20 * 1024 * 1024) return msg('That image is too large (max 20 MB).');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => openCrop(img);
      img.onerror = () => msg('Could not read that image (try JPG or PNG).');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  bPick.addEventListener('click', () => fileIn.click());
  drop.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => { pickFile(fileIn.files[0]); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => pickFile(e.dataTransfer.files[0]));

  bRemovePhoto.addEventListener('click', () => {
    if (!selected?.data.headPhoto) return;
    forgetPhoto(selected.data.headPhoto);
    applyPatch({ headPhoto: null }); syncForm(); msg('Photo removed.');
  });
  bMatch.addEventListener('click', () => {
    const url = selected?.data.headPhoto; if (!url) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 64);
      const d = x.getImageData(20, 26, 24, 20).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return msg('Could not read the skin tone from that photo.');
      applyPatch({ skinTone: '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('') }); syncForm();
      msg('Skin tone matched to the photo.');
    };
    im.src = url;
  });

  /** oval crop dialog: drag to move, wheel or slider to zoom, brightness and contrast, outputs a 512x512 feathered PNG */
  function openCrop(img) {
    const S = 360;
    const modal = el('div', 'hc-modal'), card = el('div', 'hc-card');
    card.append(el('h3', 'hc-h', 'Crop the face'));
    card.append(el('p', 'hc-field', 'Drag to move, scroll or use the slider to zoom. Put the face inside the oval, eyes near the middle.'));
    const cv = el('canvas', 'hc-cv'); cv.width = cv.height = S; card.append(cv);
    const ctx = cv.getContext('2d');
    let zoom = 1, ox = 0, oy = 0, bright = 100, contrast = 100;
    const base = Math.max(S / img.width, S / img.height);
    const slider = (label, min, max, step, val, on) => {
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
      r.addEventListener('input', () => { on(parseFloat(r.value)); draw(); });
      card.append(field(label, r)); return r;
    };
    const zoomR = slider('Zoom', 1, 4, 0.01, 1, (v) => (zoom = v));
    slider('Brightness', 60, 160, 1, 100, (v) => (bright = v));
    slider('Contrast', 60, 160, 1, 100, (v) => (contrast = v));

    function paint(c, size) {
      const k = size / S, s = base * zoom * k;
      c.save();
      if ('filter' in c) c.filter = `brightness(${bright}%) contrast(${contrast}%)`;
      c.drawImage(img, size / 2 + ox * k - (img.width * s) / 2, size / 2 + oy * k - (img.height * s) / 2, img.width * s, img.height * s);
      c.restore();
    }
    function draw() {
      ctx.clearRect(0, 0, S, S); ctx.fillStyle = '#14122e'; ctx.fillRect(0, 0, S, S);
      paint(ctx, S);
      ctx.save(); ctx.fillStyle = 'rgba(10,8,25,.6)'; ctx.beginPath(); ctx.rect(0, 0, S, S);
      ctx.ellipse(S / 2, S / 2, (S / 2) * 0.9 * 0.875, (S / 2) * 0.875, 0, 0, Math.PI * 2); ctx.fill('evenodd'); ctx.restore();
      ctx.strokeStyle = '#7be0c3'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.ellipse(S / 2, S / 2, (S / 2) * 0.9 * 0.875, (S / 2) * 0.875, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const k = S / cv.getBoundingClientRect().width; ox += (e.clientX - drag.x) * k; oy += (e.clientY - drag.y) * k; drag = { x: e.clientX, y: e.clientY }; draw(); });
    const end = () => { drag = null; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.06 : 0.94))); zoomR.value = zoom; draw(); }, { passive: false });

    const row = el('div', 'hc-row');
    const use = el('button', 'hc-btn mint', 'Use photo'), cancel = el('button', 'hc-btn ghost', 'Cancel');
    row.append(use, cancel); card.append(row);
    const close = () => modal.remove();
    cancel.addEventListener('click', close);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
    use.addEventListener('click', () => {
      const out = document.createElement('canvas'); out.width = out.height = 512;
      const o = out.getContext('2d'); paint(o, 512);
      o.save(); o.globalCompositeOperation = 'destination-in'; o.translate(256, 256); o.scale(0.9, 1);
      const g = o.createRadialGradient(0, 0, 0, 0, 0, 256);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g; o.fillRect(-400, -400, 800, 800); o.restore();
      if (selected.data.headPhoto) forgetPhoto(selected.data.headPhoto);
      applyPatch({ headPhoto: out.toDataURL('image/png') }); syncForm();
      msg('Photo applied. Use "Match skin tone" if the head color looks off.'); close();
    });
    modal.append(card); document.body.append(modal); draw();
  }

  /* ---------- export / import / persistence ---------- */
  bExp.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(serialize(incBox.checked), null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'halcyon-cast.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    msg(incBox.checked ? 'Exported with photos.' : 'Exported (photos not included).');
  });
  bImp.addEventListener('click', () => impIn.click());
  impIn.addEventListener('change', async () => {
    const f = impIn.files[0]; impIn.value = ''; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (!Array.isArray(json.cast) || !json.cast.length) throw new Error('empty');
      applyCast(json.cast.slice(0, 40).map(cleanImport)); msg(`Imported ${Math.min(json.cast.length, 40)} characters.`);
    } catch { msg('That file is not a valid cast JSON.'); }
  });
  function applyCast(cast) {
    castPeople().forEach((p) => removePerson(p));
    cast.forEach((d) => addPerson({ ...d, extra: false }));
    selected = castPeople()[0] || null; refreshChips(); if (selected) { syncForm(); setPreviewHuman(); }
    schedulePersist();
  }
  function schedulePersist() {
    if (!persistOn) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => idbSet('cast', serialize(true)).catch(() => msg('Could not save on this device.')), 400);
  }
  perBox.addEventListener('change', async () => {
    persistOn = perBox.checked; localStorage.setItem('halcyon-persist', persistOn ? '1' : '0');
    if (persistOn) { await idbSet('cast', serialize(true)).catch(() => {}); msg('This cast is now saved on this device only.'); }
    else { await idbDel('cast').catch(() => {}); msg('Saved cast deleted from this device.'); }
  });
  bClear.addEventListener('click', async () => {
    castPeople().forEach((p) => { if (p.data.headPhoto) { forgetPhoto(p.data.headPhoto); updatePerson(p, { headPhoto: null }); } });
    if (pv?.human && selected) pv.human.build(selected.data);
    refreshChips(); refreshPhotoUI();
    if (persistOn) await idbSet('cast', serialize(true)).catch(() => {});
    msg('All photos cleared.');
  });

  /* restore a saved cast (after the main scene has created its default people) */
  if (persistOn) setTimeout(async () => {
    try { const saved = await idbGet('cast'); if (saved?.cast?.length) applyCast(saved.cast.slice(0, 40).map(cleanImport)); } catch { /* ignore */ }
  }, 800);
}
