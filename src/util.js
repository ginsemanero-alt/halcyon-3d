import * as THREE from 'three';

export const $ = (id) => document.getElementById(id);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach: 1 - exp(-speed * dt) */
export const damp = (speed, dt) => 1 - Math.exp(-speed * dt);
export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
export function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }
/** shortest signed angle difference b - a */
export function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
