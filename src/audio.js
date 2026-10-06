import { CUSTOM_AUDIO, FLIGHT_SEC } from './config.js';

/* =====================================================================
   SOUND ENGINE (Web Audio, no files required). Starts only after a user click.
   ===================================================================== */
export const Sound = (() => {
  let ctx, master, enabled = true, voices = true;
  let alarmTimer = null, alarmNodes = null, lastStep = 0, ambientNode = null;
  const loops = {};

  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function custom(key, loop = false) {
    const url = CUSTOM_AUDIO[key]; if (!url) return false;
    const a = new Audio(url); a.loop = loop; a.volume = enabled ? 1 : 0; a.play().catch(() => {});
    if (loop) loops[key] = a; return true;
  }
  function noise(sec, type, f0, f1, g0, g1) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), ctx.currentTime + sec);
    const g = ctx.createGain();
    g.gain.setValueAtTime(g0, ctx.currentTime); g.gain.linearRampToValueAtTime(g1, ctx.currentTime + sec);
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  function tone(type, f0, f1, sec, g0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), ctx.currentTime + sec);
    g.gain.setValueAtTime(g0, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + sec);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + sec + 0.05);
  }

  return {
    init,
    get enabled() { return enabled; },
    get voices() { return voices; },
    setEnabled(v) {
      enabled = v; if (master) master.gain.value = v ? 0.8 : 0;
      Object.values(loops).forEach((a) => (a.volume = v ? 1 : 0));
      if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
    },
    setVoices(v) { voices = v; if (!v && 'speechSynthesis' in window) speechSynthesis.cancel(); },

    jet()  { if (custom('jet')) return; init(); noise(FLIGHT_SEC, 'bandpass', 200, 2200, 0.03, 0.8); tone('sawtooth', 70, 230, FLIGHT_SEC, 0.05); },
    boom() { if (custom('boom')) return; init(); tone('sine', 140, 28, 1.8, 1); noise(3, 'lowpass', 2400, 70, 1, 0); },
    rumble() { init(); noise(3.4, 'lowpass', 140, 50, 0.6, 0); },
    ding() { if (custom('ding')) return; init(); tone('sine', 1318, 1318, 1.4, 0.35); setTimeout(() => tone('sine', 1760, 1760, 1.4, 0.25), 180); },
    step() {
      const now = performance.now(); if (now - lastStep < 140) return; lastStep = now;
      if (custom('step')) return; init(); noise(0.09, 'bandpass', 900, 500, 0.22, 0);
    },
    ambient(on) {
      if (on) {
        if (ambientNode) return; init();
        const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        const g = ctx.createGain(); g.gain.value = 0.05;
        s.connect(f); f.connect(g); g.connect(master); s.start(); ambientNode = s;
      } else if (ambientNode) { try { ambientNode.stop(); } catch {} ambientNode = null; }
    },
    alarm(on) {
      if (on) {
        if (alarmTimer || loops.alarm) return; if (custom('alarm', true)) return; init();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; g.gain.value = 0.07; o.connect(g); g.connect(master); o.start();
        let hi = false; const tick = () => { o.frequency.setValueAtTime(hi ? 932 : 698, ctx.currentTime); hi = !hi; };
        tick(); alarmTimer = setInterval(tick, 420); alarmNodes = { o, g };
      } else {
        clearInterval(alarmTimer); alarmTimer = null;
        if (alarmNodes && ctx) { alarmNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); alarmNodes.o.stop(ctx.currentTime + 0.6); alarmNodes = null; }
        if (loops.alarm) { loops.alarm.pause(); delete loops.alarm; }
      }
    },
    siren() {
      if (custom('siren')) return; init();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; g.gain.value = 0.035; o.connect(g); g.connect(master); o.start();
      let t = ctx.currentTime;
      for (let i = 0; i < 8; i++) { o.frequency.linearRampToValueAtTime(900, t + 0.8); o.frequency.linearRampToValueAtTime(600, t + 1.6); t += 1.6; }
      g.gain.linearRampToValueAtTime(0, t); o.stop(t + 0.1);
    },
    speak(text, opts = {}) {
      if (!enabled || !voices || !('speechSynthesis' in window)) return;
      if (speechSynthesis.speaking && speechSynthesis.pending && !opts.force) return;
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = opts.pitch ?? 1; u.rate = opts.rate ?? 1; u.volume = 0.95; speechSynthesis.speak(u);
    },
    pa(text) { this.speak(text, { pitch: 0.7, rate: 0.9, force: true }); },
    playFile(url) { if (!url) return; const a = new Audio(url); a.volume = enabled ? 1 : 0; a.play().catch(() => {}); },
    stopAll() {
      this.alarm(false); this.ambient(false);
      Object.values(loops).forEach((a) => a.pause());
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
})();
