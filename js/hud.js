'use strict';
// ===== Interfaz: marcadores, mensajes y minimapa =====
const HUD = {
  el: {}, shownMoney: 0, toastT: 0, bigT: 0, carT: 0, radT: 0, objT: 0, lastStars: -1,

  init() {
    for (const id of ['hud', 'clock', 'wname', 'ammo', 'money', 'hpbar', 'arbar', 'stars', 'timer', 'minimap', 'objective', 'toast', 'carname', 'radio', 'big'])
      this.el[id] = document.getElementById(id);
    this.stars = [...this.el.stars.children];
    const mm = this.el.minimap; mm.width = mm.height = 200 * Math.min(2, devicePixelRatio || 1);
    this.mctx = mm.getContext('2d');
  },
  toast(html, dur = 3.2) { this.el.toast.innerHTML = html; this.el.toast.classList.add('show'); this.toastT = dur; },
  big(title, sub, color, dur = 3) {
    const b = this.el.big; b.querySelector('h2').textContent = title; b.querySelector('h2').style.color = color;
    b.querySelector('p').textContent = sub; b.querySelector('p').style.display = sub ? '' : 'none';
    b.classList.add('show'); this.bigT = dur;
  },
  objective(html, dur) { const o = this.el.objective; if (!html) { o.classList.remove('show'); return; } if (o.innerHTML !== html) o.innerHTML = html; o.classList.add('show'); this.objT = dur; },
  timer(sec) {
    const t = this.el.timer;
    if (sec === null) return t.classList.add('hidden');
    t.classList.remove('hidden'); const s = Math.max(0, Math.ceil(sec));
    t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); t.classList.toggle('low', s <= 10);
  },
  carName(n) { this.el.carname.textContent = n; this.el.carname.classList.add('show'); this.carT = 2.5; },
  radio(n) { this.el.radio.textContent = '♫ ' + n; this.el.radio.classList.add('show'); this.radT = 2.5; },
  flashStars() { const s = this.el.stars; s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); },

  update(dt) {
    const P = Player, e = this.el;
    // dinero con efecto de contador
    const diff = G.money - this.shownMoney;
    this.shownMoney = Math.abs(diff) < 2 ? G.money : this.shownMoney + diff * Math.min(1, dt * 6);
    e.money.textContent = fmtMoney(this.shownMoney);
    const h = Math.floor(G.clock / 60), m = Math.floor(G.clock % 60);
    e.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    e.hpbar.style.transform = `scaleX(${clamp(P.ped.hp / 100, 0, 1)})`;
    e.arbar.parentElement.style.visibility = P.armor > 0 ? 'visible' : 'hidden';
    e.arbar.style.transform = `scaleX(${clamp(P.armor / 100, 0, 1)})`;
    e.wname.textContent = P.car ? (P.car.d.name) : WEAPONS[P.wsel].name;
    e.ammo.textContent = P.car ? Math.round(clamp(P.car.hp / P.car.d.hp, 0, 1) * 100) + '%' : (P.ammo[P.wsel] === Infinity ? '∞' : P.ammo[P.wsel]);
    const stars = Math.floor(G.wanted);
    if (stars !== this.lastStars) { this.stars.forEach((s, i) => s.classList.toggle('on', i < stars)); this.lastStars = stars; }
    e.stars.classList.toggle('blink', stars > 0 && G.seenT > 6);
    // temporizadores de mensajes
    if ((this.toastT -= dt) <= 0) e.toast.classList.remove('show');
    if ((this.bigT -= dt) <= 0) e.big.classList.remove('show');
    if ((this.carT -= dt) <= 0) e.carname.classList.remove('show');
    if ((this.radT -= dt) <= 0) e.radio.classList.remove('show');
    if ((this.objT -= dt) <= 0) e.objective.classList.remove('show');
    this.drawMinimap();
  },

  drawMinimap() {
    const c = this.mctx, S = c.canvas.width, P = Player, k = 0.1 * S / 200; // px del minimapa por px de mundo
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0e4e6a'; c.fillRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 7); c.clip();
    c.translate(S / 2, S / 2); c.scale(k, k); c.translate(-P.x, -P.y);
    c.imageSmoothingEnabled = false; c.drawImage(World.mini, 0, 0, MW * T, MH * T); c.imageSmoothingEnabled = true;
    const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r / k, 0, 7); c.fill(); };
    const lbl = (x, y, txt, col) => { c.fillStyle = '#0b0614'; c.fillRect(x - 7 / k, y - 7 / k, 14 / k, 14 / k); c.fillStyle = col; c.font = `${10 / k}px Bungee, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y + 0.5 / k); };
    const W = World.places, s = World.spray;
    lbl(W.hospital.x, W.hospital.y, 'H', '#ff3b6b'); lbl(W.police.x, W.police.y, 'P', '#4dc9ff'); lbl(s.x + s.w / 2, s.y + s.h / 2, '$', '#ffe45c');
    if (!Missions.active) for (const ct of Missions.contacts) lbl(ct.x, ct.y, ct.name[0], ct.color);
    const flash = Math.floor(G.t * 6) % 2;
    for (const car of G.cars) if (car.police && car.siren) dot(car.x, car.y, 4, flash ? '#ff2a4a' : '#2a7bff');
    for (const p of G.peds) if (p.kind === 'gang' && !p.dead) dot(p.x, p.y, 3.5, '#ff3b6b');
    c.restore();
    // objetivo (pegado al borde si está lejos)
    const t = Missions.target();
    if (t) {
      let dx = (t.x - P.x) * k, dy = (t.y - P.y) * k; const l = Math.hypot(dx, dy), R = S / 2 - 9;
      if (l > R) { dx *= R / l; dy *= R / l; }
      c.fillStyle = '#ffe45c'; c.strokeStyle = '#0b0614'; c.lineWidth = 3;
      c.beginPath(); c.arc(S / 2 + dx, S / 2 + dy, 7 * S / 200, 0, 7); c.stroke(); c.fill();
    }
    // jugador
    const a = P.car ? P.car.a : P.aim;
    c.save(); c.translate(S / 2, S / 2); c.rotate(a); c.scale(S / 200, S / 200);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#0b0614'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -6); c.lineTo(-3, 0); c.lineTo(-6, 6); c.closePath(); c.stroke(); c.fill();
    c.restore();
  },

  // flecha en pantalla hacia el objetivo cuando queda fuera de vista
  drawArrow(ctx) {
    const t = Missions.target(); if (!t || inView(t.x, t.y, -30)) return;
    const z = G.cam.z, sx = G.W / 2 + (t.x - G.cam.x) * z, sy = G.H / 2 + (t.y - G.cam.y) * z;
    const a = Math.atan2(sy - G.H / 2, sx - G.W / 2), m = 60 * G.dpr;
    const kx = (G.W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), ky = (G.H / 2 - m) / Math.abs(Math.sin(a) || 1e-6), r = Math.min(kx, ky);
    ctx.save(); ctx.translate(G.W / 2 + Math.cos(a) * r, G.H / 2 + Math.sin(a) * r); ctx.rotate(a); ctx.scale(G.dpr, G.dpr);
    ctx.fillStyle = '#ffe45c'; ctx.strokeStyle = '#0b0614'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.rotate(-a); ctx.font = '13px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4;
    const d = Math.round(dist(Player.x, Player.y, t.x, t.y) / T) + ' m';
    ctx.strokeText(d, -Math.cos(a) * 34, -Math.sin(a) * 34 + 5); ctx.fillText(d, -Math.cos(a) * 34, -Math.sin(a) * 34 + 5);
    ctx.restore();
  },
};
