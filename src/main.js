/* =====================================================================
   HALCYON TOWER (fictional, Verrane): entry point + run sequence.
   Edit settings in src/config.js. Modules:
     world.js     renderer, sky, lights, ground, frame loop
     city.js      skyline, plaza, neighbours with lit interiors
     tower.js     Halcyon Tower interior, glass facade, X-ray, navigation
     plane.js     CRJ-900 airliner + lights + flight (P cycles model yaw)
     people.js    procedural humanoids, animation, evacuation
     director.js  camera shots
     audio.js     Web Audio + speech
     fx.js        particles, flash
     ui.js        side panel, cutaway, toggles (X toggles X-ray)
   ===================================================================== */
import { PEOPLE } from './config.js';
import { start } from './world.js';
import { buildCity } from './city.js';
import * as Tower from './tower.js';
import { fly, resetPlane } from './plane.js';
import { people, initPeople, resetPeople, react, evacuate, resetPlaza } from './people.js';
import { setShot, addShake } from './director.js';
import { initUI, setStatus } from './ui.js';
import { Sound } from './audio.js';
import { flash, clearParticles } from './fx.js';
import { $, sleep } from './util.js';

let runId = 0, running = false;

function resetWorld() {
  resetPlane(); Tower.reset(); clearParticles(); resetPeople(); resetPlaza(); setShot('idle');
  $('smoke').classList.remove('on'); $('tower').classList.remove('emergency');
}

// opening credits: fades in over the flight shot, out before impact
async function credits() {
  const el = $('credits');
  el.classList.add('show');
  await sleep(3800);
  el.classList.remove('show');
}

async function waitUntil(cond, isCurrent, step = 250) { while (isCurrent() && !cond()) await sleep(step); }

async function runSequence() {
  if (running) return; running = true;
  const id = ++runId, cur = () => id === runId;
  Sound.init(); resetWorld();
  document.body.classList.add('cinematic'); setStatus('incoming');
  Sound.ambient(true); Sound.jet(); setShot('flight');
  credits();
  await fly(); if (!cur()) return;

  // impact
  setStatus('impact'); Tower.impact(); flash(); addShake(2.2); setShot('burn');
  Sound.boom(); setTimeout(() => cur() && Sound.rumble(), 400);
  $('smoke').classList.add('on'); $('tower').classList.add('emergency');
  react(cur);
  await sleep(1400); if (!cur()) return;

  // hard cut inside the impact floor: duck and cover, lights flicker (X-ray auto-on)
  setShot('interior', { cut: true });
  await sleep(2600); if (!cur()) return;

  setStatus('evacuating'); Sound.alarm(true);
  Sound.pa('Attention all occupants. An emergency has been reported. Please proceed calmly to the nearest stairwell.');
  await sleep(3000); if (!cur()) return;

  // evacuation: desks -> core -> stairwell -> lobby -> plaza
  Sound.siren(); Tower.setDoorsOpen(true);
  const evac = Promise.all(people.map((p) => evacuate(p, cur)));
  (async () => {
    await sleep(3500); if (!cur()) return;
    setShot('burn');
    await waitUntil(() => people.some((p) => p.state === 'stairs'), cur); if (!cur()) return;
    await sleep(1500); if (!cur()) return;
    setShot('stairs');
    await waitUntil(() => people.filter((p) => p.state === 'out').length >= people.length * 0.5, cur); if (!cur()) return;
    setShot('plaza');
  })();
  await evac; if (!cur()) return;

  Sound.alarm(false); $('tower').classList.remove('emergency'); setStatus('clear');
  Sound.ding(); Sound.pa('All floors report clear. Everyone is out safely. Thank you for evacuating.');
  await sleep(5000); if (!cur()) return;
  setShot('wide');
  document.body.classList.remove('cinematic'); running = false;
}

function resetAll() {
  runId++; running = false; Sound.stopAll(); resetWorld(); $('credits').classList.remove('show');
  document.body.classList.remove('cinematic'); setStatus('standby');
}

initPeople(PEOPLE);
initUI({ onRun: runSequence, onReset: resetAll });
buildCity();
start();

import { initEditor } from './editor.js';
initEditor();
