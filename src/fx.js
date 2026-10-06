import * as THREE from 'three';
import { scene, onUpdate } from './world.js';
import { $ } from './util.js';

/* =====================================================================
   FX: soft sprite particle pools + screen flash
   ===================================================================== */
export const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

/** additive glow sprite (lights, beacons) */
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1); return s;
}

const KINDS = {
  fire:  { n: 140, color: 0xff7a2a, blending: THREE.AdditiveBlending, fog: false },
  spark: { n: 90,  color: 0xffc060, blending: THREE.AdditiveBlending, fog: false },
  smoke: { n: 200, color: 0x4a4654, blending: THREE.NormalBlending,   fog: true },
  trail: { n: 120, color: 0xd9d4e6, blending: THREE.NormalBlending,   fog: true },
};
const free = {}, live = [];
for (const [k, cfg] of Object.entries(KINDS)) {
  free[k] = [];
  for (let i = 0; i < cfg.n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: cfg.color, transparent: true, depthWrite: false, blending: cfg.blending, fog: cfg.fog }));
    s.visible = false; scene.add(s); free[k].push(s);
  }
}

export function spawn(kind, pos, vel, life, size, grow, op) {
  const s = free[kind].pop(); if (!s) return;
  s.position.copy(pos); s.visible = true; s.material.opacity = 0;
  live.push({ s, kind, vel, life, age: 0, size, grow, op });
}

onUpdate((dt) => {
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i]; p.age += dt;
    if (p.age >= p.life) { p.s.visible = false; free[p.kind].push(p.s); live.splice(i, 1); continue; }
    const k = p.age / p.life;
    if (p.kind === 'spark') p.vel.y -= 22 * dt;
    p.s.position.addScaledVector(p.vel, dt);
    const sz = p.size * (1 + p.grow * k); p.s.scale.set(sz, sz, 1);
    p.s.material.opacity = p.op * Math.min(1, k * 10) * (1 - k);
  }
});

export function clearParticles() { live.forEach((p) => { p.s.visible = false; free[p.kind].push(p.s); }); live.length = 0; }

export function flash() {
  const el = $('flash'); el.style.transition = 'none'; el.style.opacity = '1'; void el.offsetWidth;
  el.style.transition = 'opacity 1.6s ease-out'; el.style.opacity = '0';
}
