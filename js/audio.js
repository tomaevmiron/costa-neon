'use strict';
// ===== Sonido: radio generativa + efectos (Web Audio, sin archivos) =====
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const Sound = {
  ctx: null, master: null, music: null, sfx: null, dly: null, noise: null,
  station: 0, inCar: false, nextT: 0, step: 0,
  eng: null, sir: null,

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(comp);
    // eco para los sintes
    this.dly = c.createDelay(1); this.dly.delayTime.value = 0.3;
    const fb = c.createGain(); fb.gain.value = 0.33; const wet = c.createGain(); wet.gain.value = 0.35;
    this.dly.connect(fb).connect(this.dly); this.dly.connect(wet).connect(this.music);
    // ruido blanco
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // motor
    const eo = c.createOscillator(), eo2 = c.createOscillator(), ef = c.createBiquadFilter(), eg = c.createGain();
    eo.type = 'sawtooth'; eo2.type = 'square'; ef.type = 'lowpass'; ef.frequency.value = 420; eg.gain.value = 0;
    eo.connect(ef); eo2.connect(ef); ef.connect(eg).connect(this.sfx); eo.start(); eo2.start();
    this.eng = { o: eo, o2: eo2, g: eg };
    // sirena
    const so = c.createOscillator(), sg = c.createGain(); so.type = 'triangle'; sg.gain.value = 0;
    so.connect(sg).connect(this.sfx); so.start(); this.sir = { o: so, g: sg };
    this.nextT = c.currentTime + 0.1;
    setInterval(() => this.tick(), 25);
  },

  // ---------- instrumentos ----------
  env(g, t, v, a, dcy) { v = Math.max(v, 0.0002); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); },
  tone(t, f, dur, type, v, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain(); let node = osc;
    osc.type = type; osc.frequency.setValueAtTime(f, t); if (o.det) osc.detune.value = o.det;
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.cut, t); if (o.cutEnd) fl.frequency.exponentialRampToValueAtTime(o.cutEnd, t + dur); osc.connect(fl); node = fl; }
    node.connect(g); g.connect(o.bus || this.music); if (o.echo) g.connect(this.dly);
    this.env(g, t, v, o.a || 0.005, dur); osc.start(t); osc.stop(t + dur + (o.a || 0) + 0.05);
  },
  hit(t, dur, freq, type, v, bus) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    s.connect(f).connect(g).connect(bus || this.music);
    this.env(g, t, v, 0.002, dur); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  kick(t, v = 0.9) { this.tone(t, 150, 0.32, 'sine', v, { slide: 40 }); },
  snare(t, v = 0.35) { this.hit(t, 0.18, 1800, 'bandpass', v); this.tone(t, 220, 0.08, 'triangle', v * 0.6); },
  hat(t, v = 0.12, open) { this.hit(t, open ? 0.2 : 0.04, 8000, 'highpass', v); },

  // ---------- emisoras ----------
  stations: [
    { name: 'NEÓN FM 86.4', bpm: 96, echo: 0.47,
      prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      play(s, t, spb) {
        const bar = Math.floor(s / 16) % 4, st = s % 16, ch = this.prog[bar];
        if (st % 4 === 0) Sound.kick(t);
        if (st === 4 || st === 12) Sound.snare(t, 0.32);
        if (st % 2 === 1) Sound.hat(t, 0.06);
        if (st % 2 === 0) Sound.tone(t, mtof(ch[0] - 24 + (st % 8 === 6 ? 12 : 0)), spb * 1.6, 'sawtooth', 0.16, { cut: 900, cutEnd: 200 });
        const arp = ch[[0, 1, 2, 1][st % 4]] + (st >= 8 ? 12 : 0);
        Sound.tone(t, mtof(arp + 12), spb * 0.9, 'square', 0.035, { cut: 2600, echo: true });
        if (st === 0) for (const n of ch) Sound.tone(t, mtof(n), spb * 15, 'sawtooth', 0.03, { a: 0.4, cut: 1100, det: rand(-8, 8) });
      } },
    { name: 'RADIO PALMERA', bpm: 118, echo: 0.38,
      prog: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
      mel: [0, 2, 1, 2, 0, -1, 1, 2, 2, 1, 0, 1, 2, 0, 1, 0],
      play(s, t, spb) {
        const bar = Math.floor(s / 16) % 4, st = s % 16, ch = this.prog[bar];
        if (st % 4 === 0) Sound.kick(t, 0.85);
        if (st === 4 || st === 12) { Sound.hit(t, 0.12, 1400, 'bandpass', 0.3); Sound.hit(t + 0.012, 0.12, 1200, 'bandpass', 0.25); }
        if (st % 4 === 2) Sound.hat(t, 0.09, true);
        Sound.tone(t, mtof(ch[0] - 24 + (st % 2 ? 12 : 0)), spb * 0.8, 'sawtooth', 0.14, { cut: 1300, cutEnd: 300 });
        if (st % 2 === 0 && (st + bar * 3) % 6 !== 4) {
          const n = ch[(this.mel[(st / 2 + bar * 2) % 16] + 3) % 3] + 24;
          Sound.tone(t, mtof(n), spb * 1.7, 'triangle', 0.08, { echo: true });
          Sound.tone(t, mtof(n), spb * 1.7, 'square', 0.02, { det: 7, cut: 3000 });
        }
      } },
    { name: 'SALSA CALIENTE', bpm: 190, echo: 0.0,
      prog: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [53, 57, 60]],
      play(s, t, spb) {
        const bar = Math.floor(s / 16) % 4, st = s % 16, ch = this.prog[bar], nx = this.prog[(bar + 1) % 4];
        if ([0, 3, 6, 10, 12].includes(st)) Sound.tone(t, 2300, 0.04, 'sine', 0.16, {});
        if (st % 4 === 0) Sound.tone(t, st % 8 ? 820 : 600, 0.09, 'square', 0.035, { cut: 2500 });
        if (st === 6 || st === 14) Sound.tone(t, 190, 0.14, 'sine', 0.3, { slide: 150 });
        if (st === 7 || st === 15) Sound.tone(t, 260, 0.08, 'sine', 0.2, { slide: 210 });
        if (st === 3 || st === 11) Sound.tone(t, mtof((st === 11 ? nx[0] : ch[0]) - 24), spb * 3, 'triangle', 0.28, { cut: 700 });
        if (st === 6 || st === 14) Sound.tone(t, mtof(ch[2] - 24), spb * 2, 'triangle', 0.22, { cut: 700 });
        if ([0, 2, 3, 5, 7, 8, 10, 11, 13, 15].includes(st)) {
          const n = st % 3 === 0 ? ch : [ch[1] + 12, ch[2] + 12];
          for (const m of n) Sound.tone(t, mtof(m + 12), spb * 0.9, 'triangle', 0.045, {});
        }
      } },
    { name: 'RADIO APAGADA', play: null },
  ],
  tick() {
    const c = this.ctx; if (!c) return;
    const st = this.stations[this.station];
    const spb = st.bpm ? 60 / st.bpm / 4 : 0.1;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.12) {
      if (st.play && this.inCar && G.state !== 'title' && !G.paused) st.play.call(st, this.step, this.nextT, spb);
      this.step++; this.nextT += spb;
    }
  },
  setInCar(v) {
    this.inCar = v; if (!this.ctx) return;
    const st = this.stations[this.station];
    this.music.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.15);
    if (st.bpm) this.dly.delayTime.value = (60 / st.bpm) * 0.75;
    if (v) HUD.radio(st.name);
  },
  nextStation() {
    this.station = (this.station + 1) % this.stations.length;
    if (!this.ctx) return;
    this.hit(this.ctx.currentTime, 0.18, 3000, 'bandpass', 0.25, this.sfx);
    this.setInCar(this.inCar);
  },

  // ---------- efectos ----------
  vol(x, y) { return x === undefined ? 1 : clamp(1 - dist(x, y, Player.x, Player.y) / 900, 0, 1); },
  shot(kind, x, y) {
    if (!this.ctx) return; const v = this.vol(x, y); if (v <= 0) return; const t = this.ctx.currentTime;
    if (kind === 'escopeta') { this.hit(t, 0.35, 900, 'lowpass', 0.9 * v, this.sfx); this.tone(t, 110, 0.2, 'sine', 0.6 * v, { slide: 40, bus: this.sfx }); }
    else if (kind === 'subfusil') { this.hit(t, 0.07, 2200, 'bandpass', 0.6 * v, this.sfx); }
    else { this.hit(t, 0.13, 1500, 'bandpass', 0.8 * v, this.sfx); this.tone(t, 140, 0.1, 'sine', 0.4 * v, { slide: 50, bus: this.sfx }); }
  },
  boom(x, y) {
    if (!this.ctx) return; const v = Math.max(0.15, this.vol(x, y)), t = this.ctx.currentTime;
    this.hit(t, 1.3, 500, 'lowpass', 1 * v, this.sfx); this.tone(t, 70, 0.9, 'sine', 0.8 * v, { slide: 25, bus: this.sfx });
  },
  crash(intensity, x, y) {
    if (!this.ctx) return; const v = clamp(intensity / 300, 0.1, 1) * this.vol(x, y), t = this.ctx.currentTime;
    if (v < 0.01) return;
    this.hit(t, 0.22, 1000, 'bandpass', 0.7 * v, this.sfx); this.tone(t, 170, 0.12, 'square', 0.12 * v, { slide: 90, bus: this.sfx });
  },
  thud() { if (!this.ctx) return; this.tone(this.ctx.currentTime, 100, 0.15, 'sine', 0.6, { slide: 40, bus: this.sfx }); },
  pickup() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 880, 0.08, 'square', 0.12, { bus: this.sfx }); this.tone(t + 0.07, 1320, 0.12, 'square', 0.12, { bus: this.sfx }); },
  cash() { if (!this.ctx) return; const t = this.ctx.currentTime; [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(t + i * 0.06, f, 0.12, 'square', 0.09, { bus: this.sfx })); },
  horn() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 350, 0.35, 'square', 0.12, { cut: 1500, bus: this.sfx }); this.tone(t, 440, 0.35, 'square', 0.1, { cut: 1500, bus: this.sfx }); },
  spray() { if (!this.ctx) return; this.hit(this.ctx.currentTime, 1.2, 5000, 'highpass', 0.35, this.sfx); },
  jingle(ok) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const notes = ok ? [60, 64, 67, 72, 76] : [67, 63, 60, 55];
    notes.forEach((n, i) => this.tone(t + i * 0.11, mtof(n + 12), 0.25, ok ? 'square' : 'sawtooth', 0.1, { cut: 3000, bus: this.sfx }));
  },
  wasted() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 220, 1.8, 'sawtooth', 0.15, { slide: 50, cut: 1200, bus: this.sfx }); },

  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, car = Player.car;
    const sp = car ? car.spd : 0, thr = car ? Math.abs(car.ctl.thr) : 0;
    this.eng.o.frequency.setTargetAtTime(38 + sp * 0.2 + thr * 12, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(19 + sp * 0.1, t, 0.05);
    this.eng.g.gain.setTargetAtTime(car && G.state === 'play' && !G.paused ? 0.035 + thr * 0.03 : 0, t, 0.1);
    let nd = 1e9;
    for (const c of G.cars) if (c.siren) nd = Math.min(nd, dist(c.x, c.y, Player.x, Player.y));
    const sv = G.paused || G.state === 'title' ? 0 : clamp(1 - nd / 1000, 0, 1) * 0.07;
    this.sir.o.frequency.setTargetAtTime(760 + Math.sin(G.t * Math.PI * 1.2) * 330, t, 0.03);
    this.sir.g.gain.setTargetAtTime(sv, t, 0.1);
  },
};
