'use strict';
// ===== Coches =====
const CAR_TYPES = {
  sedan:  { name: 'BRISA',        len: 38, wid: 18, max: 300, acc: 260, turn: 2.6, grip: 8,   hp: 100, mass: 1,   colors: ['#e8e2f0', '#5f7bd6', '#b84a6a', '#4fa38a', '#d9a441', '#7d5ab8'] },
  sport:  { name: 'RELÁMPAGO GT', len: 40, wid: 19, max: 430, acc: 390, turn: 2.9, grip: 7,   hp: 80,  mass: 0.9, colors: ['#ff2f6d', '#ffe14d', '#22e0ff', '#ffffff'] },
  cabrio: { name: 'FLAMENCO',     len: 39, wid: 18, max: 360, acc: 300, turn: 2.8, grip: 7.5, hp: 85,  mass: 0.9, colors: ['#ff8fc6', '#9ff0e8', '#ffffff', '#c9a0ff'], open: true },
  taxi:   { name: 'TAXI PALMERA', len: 38, wid: 18, max: 300, acc: 255, turn: 2.6, grip: 8,   hp: 100, mass: 1,   colors: ['#ffcf2e'] },
  van:    { name: 'FURGÓN COCO',  len: 46, wid: 21, max: 240, acc: 190, turn: 2.1, grip: 9,   hp: 150, mass: 1.6, colors: ['#f2efe6', '#7fd6a7', '#ff9e7a', '#8ecdf5'] },
  police: { name: 'PATRULLA',     len: 40, wid: 19, max: 395, acc: 345, turn: 2.8, grip: 8.5, hp: 130, mass: 1.1, colors: ['#1d1d30'] },
};
const NOCTL = { thr: 0, steer: 0, hb: true };

class Car {
  constructor(type, x, y, a, color) {
    const d = CAR_TYPES[type];
    Object.assign(this, { type, d, x, y, a, vx: 0, vy: 0, len: d.len, wid: d.wid, hp: d.hp });
    this.color = color || pick(d.colors);
    this.driver = null; this.ai = null; this.police = type === 'police'; this.siren = false;
    this.dead = false; this.burn = 0; this.ctl = { thr: 0, steer: 0, hb: false };
    this.skid = null; this.parked = false; this.lastHit = null;
  }
  get spd() { return Math.hypot(this.vx, this.vy); }
  fwd() { return this.vx * Math.cos(this.a) + this.vy * Math.sin(this.a); }
  update(dt) {
    const d = this.d, ctl = (this.dead || !this.driver) ? NOCTL : this.ctl;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    let fs = this.vx * c + this.vy * s, ls = -this.vx * s + this.vy * c;
    if (ctl.thr > 0) fs += d.acc * ctl.thr * dt * (fs < 0 ? 2 : 1);
    else if (ctl.thr < 0) fs += fs > 15 ? ctl.thr * d.acc * 1.8 * dt : ctl.thr * d.acc * 0.5 * dt;
    else fs -= Math.sign(fs) * Math.min(Math.abs(fs), 90 * dt);
    fs -= fs * 0.35 * dt;
    if (ctl.hb) fs -= fs * 1.3 * dt;
    fs = clamp(fs, -d.max * 0.35, d.max);
    ls -= ls * Math.min(1, (ctl.hb ? 1.8 : this.dead ? 4 : d.grip) * dt);
    this.vx = c * fs - s * ls; this.vy = s * fs + c * ls;
    const sf = clamp(Math.abs(fs) / 110, 0, 1) * Math.sign(fs);
    const na = this.a + ctl.steer * d.turn * sf * dt * (ctl.hb ? 1.35 : 1);
    if (carHits(this, this.x, this.y, na) <= carHits(this, this.x, this.y, this.a)) this.a = na;
    moveCar(this, dt);
    // marcas de frenada
    const sliding = Math.abs(ls) > 70 || (ctl.hb && Math.abs(fs) > 90) || (ctl.thr < 0 && fs > 160);
    if (sliding && this.driver) {
      const bx = this.x - c * this.len * 0.35, by = this.y - s * this.len * 0.35, ox = -s * this.wid * 0.4, oy = c * this.wid * 0.4;
      const w = [bx + ox, by + oy, bx - ox, by - oy];
      if (this.skid) { paintSkid(this.skid[0], this.skid[1], w[0], w[1]); paintSkid(this.skid[2], this.skid[3], w[2], w[3]); }
      this.skid = w;
    } else this.skid = null;
    // humo y fuego
    if (!this.dead) {
      if (this.hp < this.d.hp * 0.35 && Math.random() < dt * 14) puff('smoke', this.x + c * this.len * 0.4, this.y + s * this.len * 0.4, { size: 5, life: 1.2, vx: rand(-10, 10), vy: rand(-10, 10) });
      if (this.hp <= 0) {
        this.burn += dt;
        if (Math.random() < dt * 30) puff('fire', this.x + rand(-8, 8), this.y + rand(-6, 6), { size: rand(4, 8), life: 0.5 });
        if (this.burn > 3.5) this.explode();
      }
    }
  }
  hurt(n, src) {
    if (this.dead) return;
    this.hp -= n; this.lastHit = src;
    if (src === 'player' && this.police && this.driver === 'cop') addWanted(0.08, 1);
    if (this.hp <= 0 && this === Player.car && this.burn === 0) HUD.toast('¡El coche está ardiendo! Sal con <b>F</b>');
  }
  explode() {
    this.dead = true; this.hp = 0; this.siren = false;
    if (this.driver === 'player') playerHurt(500);
    if (this.police && this.lastHit === 'player') addWanted(0.8, 2);
    this.driver = null; this.ai = null;
    explode(this.x, this.y, this.lastHit);
  }
  draw(ctx) {
    const L = this.len, W = this.wid, h = L / 2, w = W / 2, dead = this.dead;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.a);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -h + 2, -w + 3, L, W, 5); ctx.fill();
    ctx.fillStyle = dead ? '#2b2427' : this.color; rr(ctx, -h, -w, L, W, 5); ctx.fill();
    if (!dead) { ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-h + 4, -w + 2, L - 8, 2.5); ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(-h + 4, w - 4, L - 8, 2.5); }
    if (this.police && !dead) { ctx.fillStyle = '#f4f4ff'; ctx.fillRect(-h * 0.35, -w, h * 0.7, W); }
    // cristales y techo
    ctx.fillStyle = dead ? '#111' : '#1c2440';
    ctx.beginPath(); ctx.moveTo(h * 0.42, -w + 2.5); ctx.lineTo(h * 0.42, w - 2.5); ctx.lineTo(h * 0.1, w - 2); ctx.lineTo(h * 0.1, -w + 2); ctx.closePath(); ctx.fill();
    if (this.type === 'van') { ctx.fillStyle = dead ? '#221c20' : shade(this.color, -0.12); ctx.fillRect(-h + 3, -w + 2, h * 1.05, W - 4); }
    else {
      ctx.fillStyle = dead ? '#111' : '#1c2440'; ctx.fillRect(-h * 0.62, -w + 3, h * 0.2, W - 6);
      if (this.d.open && !dead) { ctx.fillStyle = '#3a2030'; ctx.fillRect(-h * 0.42, -w + 3, h * 0.52, W - 6); ctx.fillStyle = '#c05080'; ctx.fillRect(-h * 0.1, -w + 4, 5, w - 5); ctx.fillRect(-h * 0.1, 1, 5, w - 5); }
      else { ctx.fillStyle = dead ? '#1a1416' : shade(this.color, 0.12); ctx.fillRect(-h * 0.42, -w + 2.5, h * 0.52, W - 5); }
    }
    if (this.type === 'taxi' && !dead) { ctx.fillStyle = '#1b1528'; ctx.fillRect(-h * 0.22, -4, 6, 8); ctx.fillStyle = '#fff'; ctx.fillRect(-h * 0.2, -3, 4, 6); }
    if (this.police && !dead) {
      const ph = this.siren && Math.floor(G.t * 8) % 2;
      ctx.fillStyle = this.siren ? (ph ? '#ff2a4a' : '#5a1020') : '#7a2030'; ctx.fillRect(-h * 0.2, -w + 3, 5, w - 3);
      ctx.fillStyle = this.siren ? (ph ? '#102a6a' : '#2a7bff') : '#203a7a'; ctx.fillRect(-h * 0.2, 0, 5, w - 3);
    }
    if (!dead) {
      ctx.fillStyle = '#fff6c8'; ctx.fillRect(h - 3, -w + 2, 3, 4); ctx.fillRect(h - 3, w - 6, 3, 4);
      ctx.fillStyle = this.ctl.thr < 0 && this.driver ? '#ff5a6a' : '#b0182e'; ctx.fillRect(-h, -w + 2, 2.5, 4); ctx.fillRect(-h, w - 6, 2.5, 4);
    }
    ctx.restore();
  }
}

function carHits(car, x, y, a) {
  const c = Math.cos(a), s = Math.sin(a), hl = car.len / 2 - 1, hw = car.wid / 2 - 1;
  let n = 0;
  for (const [px, py] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]])
    if (blockedW(x + c * px - s * py, y + s * px + c * py)) n++;
  return n;
}
function moveCar(car, dt) {
  const nx = car.x + car.vx * dt, ny = car.y + car.vy * dt;
  const now = carHits(car, car.x, car.y, car.a), next = carHits(car, nx, ny, car.a);
  if (next === 0 || (now > 0 && next < now)) { car.x = nx; car.y = ny; return; }
  const imp = car.spd;
  if (!carHits(car, nx, car.y, car.a)) { car.x = nx; car.vy *= -0.25; car.vx *= 0.8; }
  else if (!carHits(car, car.x, ny, car.a)) { car.y = ny; car.vx *= -0.25; car.vy *= 0.8; }
  else { car.vx *= -0.3; car.vy *= -0.3; }
  if (imp > 110) {
    car.hurt((imp - 110) * 0.09, car.driver === 'player' ? 'world' : null);
    burst('spark', car.x + Math.cos(car.a) * car.len / 2, car.y + Math.sin(car.a) * car.len / 2, 6, 160);
    Sound.crash(imp, car.x, car.y);
    if (car === Player.car) G.cam.shake = Math.max(G.cam.shake, imp / 40);
  }
}
function pointInCar(c, x, y, m = 0) {
  const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = x - c.x, dy = y - c.y;
  return Math.abs(dx * cs + dy * sn) < c.len / 2 + m && Math.abs(-dx * sn + dy * cs) < c.wid / 2 + m;
}
function resolveCars() {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (Math.abs(a.x - b.x) > 56 || Math.abs(a.y - b.y) > 56) continue;
      const oa = a.len * 0.26, ob = b.len * 0.26, ra = a.wid * 0.55, rb = b.wid * 0.55;
      for (const sa of [1, -1]) for (const sb of [1, -1]) {
        const ax = a.x + Math.cos(a.a) * oa * sa, ay = a.y + Math.sin(a.a) * oa * sa;
        const bx = b.x + Math.cos(b.a) * ob * sb, by = b.y + Math.sin(b.a) * ob * sb;
        const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), min = ra + rb;
        if (d >= min || d < 0.01) continue;
        const nx = dx / d, ny = dy / d, ov = min - d, ma = a.d.mass, mb = b.d.mass, tot = ma + mb;
        a.x -= nx * ov * mb / tot; a.y -= ny * ov * mb / tot; b.x += nx * ov * ma / tot; b.y += ny * ov * ma / tot;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const J = -rv * 1.4 / tot;
          a.vx -= nx * J * mb; a.vy -= ny * J * mb; b.vx += nx * J * ma; b.vy += ny * J * ma;
          if (-rv > 70) {
            const dmg = (-rv - 50) * 0.06;
            a.hurt(dmg, b.driver === 'player' ? 'player' : null); b.hurt(dmg, a.driver === 'player' ? 'player' : null);
            burst('spark', (ax + bx) / 2, (ay + by) / 2, 5, 140);
            Sound.crash(-rv, a.x, a.y);
            if (a === Player.car || b === Player.car) G.cam.shake = Math.max(G.cam.shake, -rv / 45);
            for (const c of [a, b]) if (c.ai && c.driver === 'npc') c.ai.panic = 4;
          }
        }
      }
    }
  }
}
function carPedHits() {
  for (const c of G.cars) {
    if (c.spd < 30) continue;
    for (const p of G.peds) carHitPed(c, p);
    if (!Player.car && !Player.ped.dead) carHitPed(c, Player.ped);
  }
}
function carHitPed(c, p) {
  if (p.dead || p.hidden || p.hitCd > 0 || !pointInCar(c, p.x, p.y, 5)) return;
  const sp = c.spd, ux = c.vx / sp, uy = c.vy / sp;
  p.hitCd = 0.6;
  p.x += ux * 18 - uy * 10; p.y += uy * 18 + ux * 10;
  if (p === Player.ped) { playerHurt(sp * 0.1); }
  else { p.hurt(sp * 0.35, c.driver === 'player' ? 'player' : 'car', ux, uy); if (!p.dead) p.down = 1.3; }
  c.vx *= 0.9; c.vy *= 0.9; Sound.thud();
}

// ===== Peatones =====
const SKINS = ['#f1c7a0', '#d9a679', '#a8724a', '#6e4a2f', '#ffdbbd'];
const SHIRTS = ['#ff6fb5', '#5ef0ff', '#ffe066', '#9bff8a', '#ff8f4d', '#b48bff', '#ffffff', '#ff4d6d', '#ffa8e0', '#7affd4'];
class Ped {
  constructor(x, y, kind = 'civ') {
    Object.assign(this, { x, y, kind, a: rand(7), vx: 0, vy: 0, walk: rand(7), dead: false, hidden: false, down: 0, hitCd: 0, deadT: 0 });
    this.hp = kind === 'player' ? 100 : kind === 'cop' ? 70 : kind === 'gang' ? 60 : 30;
    this.skin = pick(SKINS); this.hair = pick(['#1a1210', '#3b2414', '#e8c46a', '#8a4b26', '#111']);
    this.shirt = kind === 'cop' ? '#2a3f9e' : kind === 'gang' ? '#e8283c' : kind === 'player' ? '#3fe0d0' : kind === 'vip' ? '#ffe45c' : pick(SHIRTS);
    this.armed = kind !== 'civ' && kind !== 'vip';
    this.state = 'walk'; this.timer = rand(1, 4); this.dir = randi(0, 3); this.fireCd = rand(0.8, 1.6); this.threat = null;
  }
  move(dt, mvx, mvy, face = true) {
    const k = Math.min(1, dt * 10);
    this.vx = lerp(this.vx, mvx, k); this.vy = lerp(this.vy, mvy, k);
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (!pedBlocked(nx, this.y)) this.x = nx; else this.vx = 0;
    if (!pedBlocked(this.x, ny)) this.y = ny; else this.vy = 0;
    const sp = Math.hypot(this.vx, this.vy); this.walk += sp * dt * 0.22;
    if (face && sp > 8) this.a = Math.atan2(this.vy, this.vx);
    this.hitCd -= dt;
  }
  hurt(n, src, ux = 0, uy = 0) {
    if (this.dead) return;
    if (this.kind === 'player') return playerHurt(n);
    this.hp -= n; burst('blood', this.x, this.y, 4, 60);
    if (this.hp <= 0) return this.die(src);
    if (this.kind === 'civ' || this.kind === 'vip') { this.state = 'flee'; this.timer = rand(4, 7); this.threat = { x: this.x - ux * 50, y: this.y - uy * 50 }; }
    if (this.kind === 'gang') this.state = 'attack';
    if (src === 'player' && this.kind === 'cop') addWanted(0.15, 1);
  }
  die(src) {
    this.dead = true; this.deadT = 0; this.hp = 0;
    paintBlood(this.x, this.y, 1.3);
    if (src === 'player') {
      G.kills++;
      if (this.kind === 'civ') addWanted(0.34, 1);
      if (this.kind === 'cop') addWanted(1, 2);
    }
    if (this.kind === 'civ' && Math.random() < 0.7) addPickup('money', this.x + 6, this.y + 4, randi(10, 60) * 1);
    if (this.kind === 'cop' && Math.random() < 0.3) addPickup('subfusil', this.x + 6, this.y + 4, 40);
    if (this.kind === 'gang' && Math.random() < 0.5) addPickup('escopeta', this.x + 6, this.y + 4, 8);
    panicAt(this.x, this.y, 240);
  }
  draw(ctx) {
    if (this.hidden) return;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.a);
    if (this.dead || this.down > 0) {
      ctx.fillStyle = this.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2b2540'; ctx.fillRect(-15, -4, 7, 3); ctx.fillRect(-15, 1, 7, 3);
      ctx.fillStyle = this.skin; ctx.beginPath(); ctx.arc(10, 0, 4, 0, 7); ctx.fill();
      ctx.restore(); return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(1.5, 2.5, 7, 7, 0, 0, 7); ctx.fill();
    const sw = Math.sin(this.walk * 2) * 4;
    ctx.fillStyle = '#2b2540'; ctx.fillRect(sw - 2, -5, 5, 3); ctx.fillRect(-sw - 2, 2, 5, 3);
    if (this.armed) { ctx.fillStyle = '#16121c'; ctx.fillRect(3, 1, 10, 3); ctx.fillStyle = this.skin; ctx.fillRect(3, 1.5, 3, 2.5); }
    ctx.fillStyle = this.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = this.skin; ctx.beginPath(); ctx.arc(0.5, 0, 3.6, 0, 7); ctx.fill();
    if (this.kind === 'cop') { ctx.fillStyle = '#1a2560'; ctx.beginPath(); ctx.arc(0, 0, 3.8, Math.PI * 0.6, Math.PI * 1.4 + Math.PI * 2 * 0.5); ctx.fill(); ctx.fillRect(1, -3, 3, 6); }
    else if (this.kind === 'gang') { ctx.fillStyle = '#e8283c'; ctx.beginPath(); ctx.arc(-0.5, 0, 3.4, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); }
    else { ctx.fillStyle = this.hair; ctx.beginPath(); ctx.arc(-0.8, 0, 3.3, Math.PI * 0.55, Math.PI * 1.45); ctx.fill(); }
    if (this.kind === 'player') { ctx.fillStyle = '#ff3fa4'; ctx.fillRect(-4.5, -6.5, 2, 13); }
    ctx.restore();
  }
}
function pedBlocked(x, y, r = 5) { return blockedW(x - r, y - r) || blockedW(x + r, y - r) || blockedW(x - r, y + r) || blockedW(x + r, y + r); }

// ===== Jugador =====
const WEAPONS = {
  pistola:  { name: 'PISTOLA',  cd: 0.3,  dmg: 24, spread: 0.04, auto: false },
  subfusil: { name: 'SUBFUSIL', cd: 0.08, dmg: 14, spread: 0.11, auto: true },
  escopeta: { name: 'ESCOPETA', cd: 0.8,  dmg: 16, spread: 0.26, auto: false, pellets: 6 },
};
const Player = {
  ped: null, car: null, armor: 0, ammo: { pistola: Infinity }, wsel: 'pistola', fireCd: 0, hurtFlash: 0, aim: 0, trig: false,
  get x() { return this.car ? this.car.x : this.ped.x; },
  get y() { return this.car ? this.car.y : this.ped.y; },
  reset(x, y, keepWeapons) {
    this.ped = new Ped(x, y, 'player'); this.car = null; this.armor = 0; this.fireCd = 0;
    if (!keepWeapons) { this.ammo = { pistola: Infinity }; this.wsel = 'pistola'; }
  },
};
function playerHurt(n) {
  if (G.state !== 'play') return;
  const P = Player;
  if (P.armor > 0) { const a = Math.min(P.armor, n * 0.7); P.armor -= a; n -= a; }
  P.ped.hp -= n; P.hurtFlash = 0.3;
  if (P.ped.hp <= 0) { P.ped.hp = 0; P.ped.dead = true; G.die('wasted'); }
}
function cycleWeapon() {
  const list = Object.keys(WEAPONS).filter(k => Player.ammo[k] > 0);
  Player.wsel = list[(list.indexOf(Player.wsel) + 1) % list.length];
}
function playerUpdate(dt) {
  const P = Player; P.fireCd -= dt; P.hurtFlash -= dt;
  if (Input.press('f') || Input.press('e') || Input.press('enter')) playerEnterExit();
  if (Input.press('q') || Input.press('tab')) cycleWeapon();
  if (Input.press('r') && P.car) Sound.nextStation();
  const ax = Input.axis();
  if (P.car) {
    const car = P.car;
    car.ctl.thr = -ax.y; car.ctl.steer = ax.x; car.ctl.hb = Input.down(' ') || Input.tb.hb;
    if (Input.press('h')) { Sound.horn(); panicAt(car.x, car.y, 120); }
    if (car.police && Input.press('g')) car.siren = !car.siren;
    P.ped.x = car.x; P.ped.y = car.y;
    return;
  }
  const ped = P.ped, l = Math.hypot(ax.x, ax.y), sp = 150;
  ped.move(dt, l > 0 ? ax.x / Math.max(1, l) * sp : 0, l > 0 ? ax.y / Math.max(1, l) * sp : 0, false);
  if (!Input.isTouch && G.t - Input.mouse.moved < 3) P.aim = angTo(ped.x, ped.y, Input.mouse.wx, Input.mouse.wy);
  else if (Input.tb.shoot) { const tgt = autoAim(ped); if (tgt) P.aim = angTo(ped.x, ped.y, tgt.x, tgt.y); else if (l > 0.2) P.aim = Math.atan2(ax.y, ax.x); }
  else if (l > 0.2) P.aim = Math.atan2(ax.y, ax.x);
  ped.a = P.aim;
  const w = WEAPONS[P.wsel];
  const trig = Input.mouse.down || Input.down(' ') || Input.down('j') || Input.tb.shoot;
  if (trig && P.fireCd <= 0 && (w.auto || !P.trig)) {
    shoot(ped, P.wsel, P.aim, 'player'); P.fireCd = w.cd;
    if (P.ammo[P.wsel] !== Infinity && --P.ammo[P.wsel] <= 0) { delete P.ammo[P.wsel]; P.wsel = 'pistola'; }
  }
  P.trig = trig;
}
function autoAim(ped) {
  let best = null, bd = 320;
  for (const p of G.peds) {
    if (p.dead || p.hidden || p.kind === 'civ' || p.kind === 'vip') continue;
    const d = dist(ped.x, ped.y, p.x, p.y); if (d < bd && los(ped.x, ped.y, p.x, p.y)) { bd = d; best = p; }
  }
  return best;
}
function playerEnterExit() {
  const P = Player;
  if (P.car) {
    const c = P.car, cs = Math.cos(c.a), sn = Math.sin(c.a);
    const sw = c.wid / 2 + 10, sl = c.len / 2 + 10;
    const opts = [[sn, -cs, sw], [-sn, cs, sw], [-cs, -sn, sl], [cs, sn, sl]];
    let pos = null;
    for (const [ox, oy, r] of opts) {
      const px = c.x + ox * r, py = c.y + oy * r;
      if (!pedBlocked(px, py)) { pos = [px, py]; break; }
    }
    if (!pos) return HUD.toast('No hay sitio para bajar');
    Object.assign(P.ped, { x: pos[0], y: pos[1], hidden: false, vx: c.vx * 0.3, vy: c.vy * 0.3 });
    c.driver = null; c.ctl = { thr: 0, steer: 0, hb: false }; c.siren = false; P.car = null;
    Sound.setInCar(false); return;
  }
  let best = null, bd = 46;
  for (const c of G.cars) {
    if (c.dead || c.hp <= 0) continue;
    const d = dist(c.x, c.y, P.ped.x, P.ped.y); if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  if (best.driver === 'npc' || best.driver === 'cop') {
    const k = best.driver === 'cop' ? 'cop' : 'civ';
    const px = best.x - Math.sin(best.a) * 22, py = best.y + Math.cos(best.a) * 22;
    const pd = new Ped(pedBlocked(px, py) ? P.ped.x : px, pedBlocked(px, py) ? P.ped.y : py, k);
    pd.down = 0.9; pd.state = 'flee'; pd.timer = 6; pd.threat = { x: P.ped.x, y: P.ped.y };
    G.peds.push(pd);
    if (k === 'cop') addWanted(0, 2);
    else if (G.peds.some(p => p.kind === 'cop' && !p.dead && dist(p.x, p.y, best.x, best.y) < 450) ||
      G.cars.some(c => c.police && c.driver === 'cop' && dist(c.x, c.y, best.x, best.y) < 450)) addWanted(0, 1);
  }
  best.driver = 'player'; best.ai = null; best.parked = false; P.car = best; P.ped.hidden = true;
  HUD.carName(best.d.name); Sound.setInCar(true);
}

// ===== Disparos =====
function shoot(ped, wkey, a, side) {
  const w = WEAPONS[wkey], n = w.pellets || 1;
  const mx = ped.x + Math.cos(a) * 13, my = ped.y + Math.sin(a) * 13;
  for (let i = 0; i < n; i++) {
    const aa = a + rand(-w.spread, w.spread), sp = 950;
    G.bullets.push({ x: mx, y: my, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0.45, owner: ped, side, dmg: w.dmg });
  }
  puff('flash', mx, my, { life: 0.06, size: 7 });
  G.lights.push({ x: mx, y: my, r: 70, life: 0.06, max: 0.06, c: '#ffd76a' });
  Sound.shot(wkey, ped.x, ped.y);
  if (side === 'player') panicAt(ped.x, ped.y, 230);
}
function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i]; let hit = false;
    for (let s = 0; s < 3 && !hit; s++) {
      b.x += b.vx * dt / 3; b.y += b.vy * dt / 3;
      if (tileW(b.x, b.y) === TL.BUILD) { burst('spark', b.x, b.y, 3, 90); hit = true; break; }
      for (const p of G.peds) {
        if (p.dead || p.hidden || p === b.owner || (b.side !== 'player' && p.kind === b.side)) continue;
        if (Math.abs(p.x - b.x) < 7 && Math.abs(p.y - b.y) < 7) { p.hurt(b.dmg, b.side, b.vx / 950, b.vy / 950); hit = true; break; }
      }
      if (hit) break;
      const pp = Player.ped;
      if (b.side !== 'player' && !Player.car && !pp.dead && Math.abs(pp.x - b.x) < 7 && Math.abs(pp.y - b.y) < 7) { playerHurt(b.dmg * 0.6); hit = true; break; }
      for (const c of G.cars) {
        if (c.dead || c === Player.car && b.side === 'player') continue;
        if (pointInCar(c, b.x, b.y, 1)) { c.hurt(b.dmg * 0.5, b.side); burst('spark', b.x, b.y, 3, 80); hit = true; break; }
      }
    }
    b.life -= dt;
    if (hit || b.life <= 0) G.bullets.splice(i, 1);
  }
}
function drawBullets(ctx) {
  ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 2; ctx.beginPath();
  for (const b of G.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); }
  ctx.stroke();
}

// ===== Partículas y luces fugaces =====
function puff(type, x, y, o = {}) {
  const life = o.life || 0.6;
  G.parts.push({ type, x, y, vx: o.vx || 0, vy: o.vy || 0, life, max: life, size: o.size || 4, color: o.color, text: o.text });
  if (G.parts.length > 800) G.parts.shift();
}
function burst(type, x, y, n, speed, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(Math.PI * 2), s = rand(speed * 0.3, speed);
    puff(type, x, y, { ...o, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (o.life || 0.5) * rand(0.6, 1.2), size: o.size || rand(2, 5) });
  }
}
function floatText(x, y, text, color = '#6dffa8') { puff('text', x, y, { text, color, life: 1.4, vy: -40 }); }
function updateParts(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i]; p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.type === 'text' ? 0.5 : p.type === 'smoke' ? 1.2 : 3;
    p.vx -= p.vx * drag * dt; p.vy -= p.vy * drag * dt;
    if (p.type === 'smoke') p.size += dt * 9;
  }
  for (let i = G.lights.length - 1; i >= 0; i--) if ((G.lights[i].life -= dt) <= 0) G.lights.splice(i, 1);
}
function drawParts(ctx) {
  for (const p of G.parts) {
    if (!inView(p.x, p.y, 40)) continue;
    const k = p.life / p.max;
    switch (p.type) {
      case 'spark': ctx.strokeStyle = `rgba(255,215,106,${k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
      case 'smoke': ctx.fillStyle = `rgba(55,50,66,${k * 0.5})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
      case 'fire': ctx.fillStyle = k > 0.6 ? '#fff08a' : k > 0.3 ? '#ff9a2e' : '#d8341a'; ctx.globalAlpha = Math.min(1, k * 1.6); ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k), 0, 7); ctx.fill(); ctx.globalAlpha = 1; break;
      case 'blood': ctx.fillStyle = `rgba(150,0,30,${k})`; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); break;
      case 'flash': ctx.fillStyle = `rgba(255,240,170,${k})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
      case 'debris': ctx.fillStyle = `rgba(30,24,34,${k})`; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); break;
      case 'text':
        ctx.font = '16px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.min(1, k * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#0b0614'; ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); ctx.globalAlpha = 1; break;
    }
  }
}
function drawTransientLights(ctx) {
  for (const l of G.lights) {
    ctx.globalAlpha = clamp(l.life / l.max, 0, 1) * 0.9;
    ctx.drawImage(glowSprite(l.c), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.globalAlpha = 0.5; const fire = glowSprite('#ff8a2a');
  for (const p of G.parts) if (p.type === 'fire' && inView(p.x, p.y)) ctx.drawImage(fire, p.x - 22, p.y - 22, 44, 44);
  ctx.globalAlpha = 1;
}

function explode(x, y, src) {
  Sound.boom(x, y);
  const d0 = dist(x, y, Player.x, Player.y); G.cam.shake = Math.max(G.cam.shake, clamp(22 - d0 / 30, 0, 22));
  burst('fire', x, y, 34, 220, { life: 0.8, size: 7 }); burst('smoke', x, y, 18, 90, { life: 2, size: 8 }); burst('spark', x, y, 22, 320); burst('debris', x, y, 12, 250, { life: 1.2 });
  G.lights.push({ x, y, r: 240, life: 0.5, max: 0.5, c: '#ffb050' });
  paintScorch(x, y);
  for (const p of G.peds) { const d = dist(x, y, p.x, p.y); if (d < 85 && !p.dead) { p.hurt(130 * (1 - d / 95), src, (p.x - x) / (d || 1), (p.y - y) / (d || 1)); if (!p.dead) p.down = 1.5; } }
  if (!Player.car && d0 < 85) playerHurt(90 * (1 - d0 / 95));
  for (const c of G.cars) {
    const d = dist(x, y, c.x, c.y); if (d < 1 || d > 100) continue;
    c.hurt(70 * (1 - d / 110), src); c.vx += (c.x - x) / d * 220; c.vy += (c.y - y) / d * 220;
  }
  panicAt(x, y, 400);
}

// ===== Objetos para recoger =====
const PICK = { health: '#ff3b6b', armor: '#4dc9ff', subfusil: '#ffe14d', escopeta: '#ff9a3d', money: '#6dffa8', tape: '#ff4fd8' };
function addPickup(type, x, y, amt = 0, respawn = false) { G.pickups.push({ type, x, y, amt, t: rand(7), respawn, active: true, cd: 0, ttl: respawn || type === 'tape' ? Infinity : 40 }); }
function updatePickups(dt) {
  const P = Player, onFoot = !P.car;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i]; k.t += dt;
    if (!k.active) { if ((k.cd -= dt) <= 0) k.active = true; continue; }
    if ((k.ttl -= dt) <= 0) { G.pickups.splice(i, 1); continue; }
    if (dist(k.x, k.y, P.x, P.y) > 22 || (!onFoot && !['money', 'tape'].includes(k.type))) continue;
    let ok = true;
    switch (k.type) {
      case 'health': if (P.ped.hp >= 100) ok = false; else { P.ped.hp = 100; floatText(k.x, k.y, 'SALUD', PICK.health); } break;
      case 'armor': if (P.armor >= 100) ok = false; else { P.armor = 100; floatText(k.x, k.y, 'CHALECO', PICK.armor); } break;
      case 'subfusil': case 'escopeta':
        P.ammo[k.type] = (P.ammo[k.type] || 0) + (k.amt || (k.type === 'subfusil' ? 90 : 12)); P.wsel = k.type;
        floatText(k.x, k.y, WEAPONS[k.type].name, PICK[k.type]); break;
      case 'money': G.money += k.amt; floatText(k.x, k.y, '+$' + k.amt); break;
      case 'tape': Missions.tape(); break;
    }
    if (!ok) continue;
    k.type === 'money' ? Sound.cash() : Sound.pickup();
    if (k.respawn) { k.active = false; k.cd = 45; } else G.pickups.splice(i, 1);
  }
}
function drawPickups(ctx) {
  for (const k of G.pickups) {
    if (!k.active || !inView(k.x, k.y)) continue;
    const c = PICK[k.type], bob = Math.sin(k.t * 4) * 2;
    ctx.save(); ctx.translate(k.x, k.y + bob);
    ctx.globalAlpha = 0.5; ctx.drawImage(glowSprite(c), -18, -18, 36, 36); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0614'; ctx.strokeStyle = c; ctx.lineWidth = 2;
    if (k.type === 'tape') { ctx.rotate(k.t); ctx.fillRect(-9, -6, 18, 12); ctx.strokeRect(-9, -6, 18, 12); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-4, 0, 2, 0, 7); ctx.arc(4, 0, 2, 0, 7); ctx.fill(); }
    else {
      rr(ctx, -8, -8, 16, 16, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = c;
      ctx.font = '11px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText({ health: '+', armor: '◆', subfusil: 'S', escopeta: 'E', money: '$' }[k.type], 0, 1);
    }
    ctx.restore();
  }
}
