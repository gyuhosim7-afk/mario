/* =============================================================
 * audio.js - WebAudio 절차적 사운드 (엔진 / 부스터 / 피격 / UI)
 * ============================================================= */
(function (global) {
  'use strict';

  class Audio {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.engine = null;
      this.master = null;
    }
    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    setVolume(v) { if (this.master) this.master.gain.value = v; }

    startEngine() {
      if (!this.ctx || this.engine) return;
      const c = this.ctx;
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
      const osc2 = c.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 35;
      const g = c.createGain(); g.gain.value = 0.0;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      osc.connect(f); osc2.connect(f); f.connect(g); g.connect(this.master);
      osc.start(); osc2.start();
      this.engine = { osc, osc2, g, f };
    }
    stopEngine() {
      if (!this.engine) return;
      try { this.engine.osc.stop(); this.engine.osc2.stop(); } catch (e) { /* already stopped */ }
      this.engine = null;
    }
    updateEngine(rpm, load) {
      if (!this.engine) return;
      const e = this.engine, t = this.ctx.currentTime;
      e.osc.frequency.setTargetAtTime(58 + rpm * 210, t, 0.06);
      e.osc2.frequency.setTargetAtTime(29 + rpm * 105, t, 0.06);
      e.f.frequency.setTargetAtTime(420 + rpm * 1700, t, 0.08);
      e.g.gain.setTargetAtTime(0.035 + rpm * 0.075 * (load ? 1.25 : 1), t, 0.1);
    }

    blip(freq, dur, type, vol, sweep) {
      if (!this.ctx || !this.enabled) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(30, sweep), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    noise(dur, vol, cutoff) {
      if (!this.ctx || !this.enabled) return;
      const c = this.ctx, t = c.currentTime;
      const n = Math.floor(c.sampleRate * dur);
      const b = c.createBuffer(1, n, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(); s.buffer = b;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1200;
      const g = c.createGain(); g.gain.value = vol || 0.3;
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start();
    }

    sfx(name) {
      if (!this.ctx || !this.enabled) return;
      switch (name) {
        case 'countdown': this.blip(440, 0.16, 'square', 0.2); break;
        case 'go': this.blip(880, 0.4, 'square', 0.26, 1320); break;
        case 'item': this.blip(660, 0.07, 'triangle', 0.14); break;
        case 'itemget': this.blip(520, 0.1, 'square', 0.2, 1040); break;
        case 'boost': this.noise(0.35, 0.28, 2600); this.blip(300, 0.32, 'sawtooth', 0.15, 900); break;
        case 'mt': this.blip(720, 0.14, 'square', 0.16, 1440); break;
        case 'spin': this.blip(300, 0.5, 'sawtooth', 0.18, 90); break;
        case 'explode': this.noise(0.6, 0.5, 700); this.blip(90, 0.5, 'sawtooth', 0.22, 40); break;
        case 'shell': this.blip(520, 0.12, 'square', 0.14, 260); break;
        case 'lightning': this.noise(0.8, 0.42, 5200); this.blip(1200, 0.6, 'sawtooth', 0.2, 120); break;
        case 'coin': this.blip(988, 0.08, 'square', 0.16); this.blip(1319, 0.12, 'square', 0.14); break;
        case 'lap': this.blip(660, 0.12, 'triangle', 0.2); this.blip(880, 0.18, 'triangle', 0.18); break;
        case 'finish': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'square', 0.2), i * 110)); break;
        case 'ui': this.blip(600, 0.05, 'square', 0.09); break;
        case 'thud': this.noise(0.25, 0.4, 260); break;
        case 'star': [784, 988, 1175].forEach((f, i) => setTimeout(() => this.blip(f, 0.14, 'triangle', 0.16), i * 70)); break;
      }
    }
  }

  global.SFX = new Audio();
})(window);
