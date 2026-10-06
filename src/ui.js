import { FLOORS, IMPACT_FLOOR } from './config.js';
import { Sound } from './audio.js';
import { onUpdate } from './world.js';
import { people, addPerson, removePerson } from './people.js';
import { setXrayManual, getXray } from './tower.js';
import { isFreeCam, setFreeCam, onFreeCam, isCameraBorrowed, focusCamera } from './director.js';
import { NEWS, NEWS_DEFAULTS, setNewsText, previewNews, isPreviewing, billboardCenter, billboardNormal } from './news.js';
import { isStreet, setStreet } from './street.js';
import { $ } from './util.js';

/* =====================================================================
   UI: side-panel cutaway (synced to the 3D occupants), cast list, sound, toggles
   ===================================================================== */
const ROW = 22, PSIZE = 18;
const dots = new Map(); // person -> element

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
export function initials(n) { return n.trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?'; }

export function buildCutaway() {
  const rows = $('rows'); rows.innerHTML = '';
  for (let f = FLOORS; f >= 1; f--) {
    const row = document.createElement('div'); row.className = 'floor-row';
    row.innerHTML = `<div class="floor-label">${f === 1 ? 'L' : f}</div><div class="floor-room"></div>`;
    if (f === IMPACT_FLOOR) row.style.background = 'rgba(255,90,54,.14)';
    rows.appendChild(row);
  }
  const smoke = $('smoke'); smoke.style.top = (FLOORS - (IMPACT_FLOOR + 1)) * ROW + 'px'; smoke.style.height = ROW * 3 + 'px';
  $('people').style.height = FLOORS * ROW + 'px';
  $('impact-floor-label').textContent = IMPACT_FLOOR;
  const sel = $('f-floor'); sel.innerHTML = '';
  for (let f = FLOORS; f >= 1; f--) sel.insertAdjacentHTML('beforeend', `<option value="${f}">${f === 1 ? '1 (lobby)' : f}</option>`);
  sel.value = '10';
}

function dotFor(p) {
  let el = dots.get(p);
  if (!el) {
    el = document.createElement('div'); el.className = 'person' + (p.data.extra ? ' extra' : '');
    el.innerHTML = `${p.data.extra ? '' : initials(p.data.name)}<span class="tip">${escapeHtml(p.data.name)}, floor ${p.data.floor}</span>`;
    $('people').appendChild(el); dots.set(p, el);
  }
  return el;
}
function syncDots() {
  for (const [p, el] of dots) if (!people.includes(p)) { el.remove(); dots.delete(p); }
  for (const p of people) {
    const el = dotFor(p), size = p.data.extra ? 8 : PSIZE;
    const floor = p.state === 'out' ? 1 : p.floor;
    el.style.left = `calc(${p.cutawayX()}% - ${size / 2}px)`;
    el.style.top = (FLOORS - floor) * ROW + (ROW - size) / 2 - (p.data.extra ? 5 : 0) + 'px';
    if (el.dataset.state !== p.state) el.dataset.state = p.state;
  }
}
let syncAcc = 0;
onUpdate((dt) => { syncAcc += dt; if (syncAcc > 0.1) { syncAcc = 0; syncDots(); updateOut(); } });

export function renderList() {
  const ul = $('people-list'); ul.innerHTML = '';
  const cast = people.filter((p) => !p.data.extra);
  cast.forEach((p) => {
    const d = p.data, li = document.createElement('li'); li.className = 'flex items-center gap-3 rounded-[2rem] bg-dusk px-4 py-3';
    li.innerHTML = `
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-xs font-black text-dusk" style="background:${escapeHtml(d.outfitTop)}">${initials(d.name)}</span>
      <div class="min-w-0 flex-1"><p class="truncate font-display text-sm font-black">${escapeHtml(d.name)}</p>
      <p class="truncate text-xs text-haze">${escapeHtml(d.role || 'Occupant')}, floor ${d.floor}</p></div>
      <button data-act="say" class="rounded-full bg-sky px-3 py-1.5 text-xs font-black text-dusk">Say</button>
      <button data-act="rm" class="rounded-full bg-ember px-3 py-1.5 text-xs font-black text-dusk">Remove</button>`;
    li.querySelector('[data-act="say"]').onclick = () => { Sound.init(); Sound.speak(d.line, { pitch: d.pitch, force: true }); Sound.playFile(d.audio); };
    li.querySelector('[data-act="rm"]').onclick = () => { removePerson(p); renderList(); syncDots(); };
    ul.appendChild(li);
  });
  const extras = people.length - cast.length;
  $('count-badge').textContent = `${cast.length} ${cast.length === 1 ? 'person' : 'people'}`;
  $('extras-note').textContent = extras ? `Plus ${extras} background occupants (EXTRA_OCCUPANTS in src/config.js).` : '';
}

export function updateOut() { $('out-badge').textContent = `Out ${people.filter((p) => p.state === 'out').length} / ${people.length}`; }

const STATUS = {
  standby: ['Standby', 'bg-amber text-dusk'], incoming: ['Incoming', 'bg-sky text-dusk'], impact: ['Impact', 'bg-ember text-dusk'],
  evacuating: ['Evacuating', 'bg-ember text-dusk'], clear: ['All clear', 'bg-mint text-dusk'],
};
export function setStatus(k) { const el = $('status-badge'); el.textContent = STATUS[k][0]; el.className = `rounded-full px-4 py-1.5 text-xs font-black ${STATUS[k][1]}`; }

function bindToggle(btn, onL, offL, get, set) {
  btn.onclick = () => {
    Sound.init(); set(!get()); btn.textContent = get() ? onL : offL;
    btn.className = `rounded-full px-4 py-1.5 text-xs font-black text-dusk ${get() ? 'bg-mint' : 'bg-amber'}`;
  };
}

let lastXray = '';
function renderXray() {
  const x = getXray(), on = x.manual || x.auto;
  const label = x.manual ? 'X-ray on' : (x.auto ? 'X-ray auto' : 'X-ray off');
  if (label === lastXray) return; lastXray = label;
  const b = $('tg-xray');
  b.textContent = label;
  b.className = `rounded-full px-4 py-1.5 text-xs font-black ${on ? 'bg-sky text-dusk' : 'bg-dusk text-bone'}`;
}
onUpdate(() => renderXray());

export function initUI({ onRun, onReset }) {
  $('btn-run').onclick = onRun;
  $('btn-reset').onclick = onReset;

  const panel = $('panel');
  if (innerWidth >= 1024) panel.classList.remove('hidden');
  $('btn-panel').onclick = () => {
    if (document.body.classList.contains('cinematic')) { panel.classList.remove('hidden'); panel.classList.toggle('peek'); }
    else panel.classList.toggle('hidden');
  };

  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
      ['inside', 'people', 'sound', 'news'].forEach((n) => $('sec-' + n).classList.toggle('hidden', n !== t.dataset.tab));
    };
  });

  $('btn-add').onclick = () => {
    const name = $('f-name').value.trim(); if (!name) { $('f-name').focus(); return; }
    addPerson({
      name, role: $('f-role').value.trim(), floor: parseInt($('f-floor').value, 10), pitch: parseFloat($('f-pitch').value),
      line: $('f-line').value.trim() || 'Heading to the stairwell.', audio: $('f-audio').value.trim() || null,
    });
    renderList(); syncDots(); ['f-name', 'f-role', 'f-line', 'f-audio'].forEach((i) => ($(i).value = ''));
  };

  const BOARD = [
    ['Jet flyby', () => Sound.jet()], ['Impact', () => Sound.boom()], ['Rumble', () => Sound.rumble()],
    ['Alarm on', () => Sound.alarm(true)], ['Alarm off', () => Sound.alarm(false)], ['Siren', () => Sound.siren()],
    ['Footsteps', () => { for (let i = 0; i < 6; i++) setTimeout(() => Sound.step(), i * 260); }],
    ['PA call', () => Sound.pa('Attention all occupants. Please proceed calmly to the nearest stairwell.')],
    ['All-clear chime', () => Sound.ding()],
  ];
  BOARD.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.className = 'rounded-full bg-dusk px-4 py-2 text-sm font-black text-bone transition hover:bg-ember hover:text-dusk';
    b.textContent = label; b.onclick = () => { Sound.init(); fn(); }; $('soundboard').appendChild(b);
  });
  bindToggle($('tg-sound'), 'Sound on', 'Sound off', () => Sound.enabled, (v) => Sound.setEnabled(v));
  bindToggle($('tg-voice'), 'Voices on', 'Voices off', () => Sound.voices, (v) => Sound.setVoices(v));

  // X-ray: button or X key
  const toggleXray = () => setXrayManual(!getXray().manual);
  $('tg-xray').onclick = toggleXray;
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'x' || e.key === 'X') toggleXray();
    if ((e.key === 'c' || e.key === 'C') && !isCameraBorrowed()) setFreeCam(!isFreeCam());
  });

  // 360 view: dragging the scene turns it on, the button or C hands the camera back to the director
  const camBtn = $('tg-cam');
  const showCam = (v) => {
    $('cine-hint').textContent = v ? '360° view · press C or the 360° button to return to the film camera' : 'Drag to look around in 360°';
    camBtn.textContent = v ? '360° on' : '360° off'; camBtn.className = `rounded-full px-4 py-1.5 text-xs font-black ${v ? 'bg-sky text-dusk' : 'bg-dusk text-bone'}`; };
  camBtn.onclick = () => setFreeCam(!isFreeCam());
  onFreeCam(showCam);

  // street mode: first-person bystander (button or B)
  $('tg-street').onclick = () => setStreet(!isStreet());

  // News tab: edit the billboard's breaking news live
  const fields = { headline: $('n-headline'), ticker: $('n-ticker'), channel: $('n-channel') };
  const fill = () => { fields.headline.value = NEWS.headline; fields.ticker.value = NEWS.ticker.replace(/\s*•\s*$/, ''); fields.channel.value = NEWS.channel; };
  fill();
  Object.entries(fields).forEach(([k, el]) => el.addEventListener('input', () => setNewsText({ [k]: el.value })));
  const previewBtn = $('n-preview');
  const showPreview = () => { previewBtn.textContent = isPreviewing() ? 'Stop preview' : 'Preview on billboard'; };
  previewBtn.onclick = () => {
    previewNews(!isPreviewing()); showPreview();
    if (isPreviewing() && !isStreet()) focusCamera(billboardCenter.clone().addScaledVector(billboardNormal, 17).setY(3), billboardCenter);
  };
  $('n-reset').onclick = () => { setNewsText(NEWS_DEFAULTS); fill(); };
  $('btn-run').addEventListener('click', () => setTimeout(showPreview, 0)); // a run takes over the billboard

  buildCutaway();
  renderList(); syncDots(); updateOut();
}
