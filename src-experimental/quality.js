/* =====================================================================
   QUALITY PRESETS (Low / Medium / High). Chosen in the Sound tab;
   stored on this device and applied on reload.
   ===================================================================== */
export const QUALITY_PRESETS = {
  low: {
    pixelRatio: 1, shadowMap: 1024, particles: 0.45, extras: 0.45, responders: 0.6, destruction: 0.5,
    post: { dof: false, godrays: false, streaks: false, haze: false, grain: true, flare: false },
  },
  medium: {
    pixelRatio: 1.25, shadowMap: 2048, particles: 0.8, extras: 1, responders: 1, destruction: 1,
    post: { dof: true, godrays: true, streaks: true, haze: true, grain: true, flare: true },
  },
  high: {
    pixelRatio: 2, shadowMap: 4096, particles: 1.25, extras: 1.3, responders: 1.3, destruction: 1.5,
    post: { dof: true, godrays: true, streaks: true, haze: true, grain: true, flare: true },
  },
};

const KEY = 'halcyon-quality';
function read() { try { return localStorage.getItem(KEY); } catch { return null; } }
export const QUALITY_NAME = QUALITY_PRESETS[read()] ? read() : 'medium';
export const Q = QUALITY_PRESETS[QUALITY_NAME];
export function setQuality(name) {
  if (!QUALITY_PRESETS[name]) return;
  try { localStorage.setItem(KEY, name); } catch {}
  location.reload();
}
