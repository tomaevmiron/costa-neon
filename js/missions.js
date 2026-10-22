'use strict';
// ===== Encargos, coleccionables y taller =====
const Missions = {
  contacts: [], active: null, done: 0, earned: 0, tapes: 0, tapeTotal: 10, sprayCd: 0,

  init() {
    const ring = (bi, bj, ox, oy) => ({ x: (4 + 12 * bi + ox + 0.5) * T, y: (4 + 12 * bj + oy + 0.5) * T });
    this.contacts = [
      { name: 'LOLA MAMBO', type: 'entrega', color: '#ff3fa4', ...ring(5, 2, 0, 4), cd: 0, n: 0 },
      { name: 'TÍO RAMIRO', type: 'taxi', color: '#2ef2ff', ...ring(0, 2, 9, 5), cd: 0, n: 0 },
      { name: 'DOCTOR COCO', type: 'golpe', color: '#ffe45c', ...ring(3, 4, 4, 0), cd: 0, n: 0 },
      { name: 'RAYO', type: 'carrera', color: '#a46bff', ...ring(2, 0, 4, 9), cd: 0, n: 0 },
    ];
  },
  placeItems() {
    const R = mulberry32(4242), spots = [];
    while (spots.length < this.tapeTotal) {
      const x = 2 + Math.floor(R() * 92), y = 2 + Math.floor(R() * 74), t = tAt(x, y);
      if ((t === TL.WALK || t === TL.GRASS || t === TL.SAND) && !isRoadCol(x) && !spots.some(s => Math.abs(s[0] - x) + Math.abs(s[1] - y) < 14)) spots.push([x, y]);
    }
    for (const [x, y] of spots) addPickup('tape', (x + 0.5) * T, (y + 0.5) * T);
    const P = World.places;
    addPickup('health', P.hospital.x, P.hospital.y, 0, true);
    addPickup('armor', P.police.x + 3 * T, P.police.y + 1.6 * T, 0, true);
    addPickup('subfusil', 91 * T, 37.9 * T, 90, true);
    addPickup('escopeta', (4 + 12 * 3 + 0.5) * T, (4 + 12 * 4 + 5.5) * T, 12, true);
    addPickup('health', 79 * T, 20 * T, 0, true);
  },
  tape() {
    this.tapes++; G.money += 250; Sound.cash();
    HUD.toast(`Casete encontrado <b>${this.tapes}/${this.tapeTotal}</b> · +$250`);
    if (this.tapes === this.tapeTotal) {
      G.money += 5000; HUD.big('¡COLECCIÓN COMPLETA!', 'Diez casetes, +$5000. Hay un Relámpago GT esperándote en Villa Coral.', '#ff4fd8', 5);
      const c = new Car('sport', World.places.villa.x, World.places.villa.y + T, 0, '#ff4fd8'); c.parked = true; c.keep = true; c.hp = 300; G.cars.push(c);
    }
  },

  // punto de acera aleatorio a cierta distancia
  randPoint(fx, fy, dmin, dmax) {
    for (let k = 0; k < 200; k++) {
      const bi = randi(0, 5), bj = randi(0, 5), side = randi(0, 3), o = randi(1, 8);
      const ox = side === 0 ? o : side === 1 ? 9 : side === 2 ? o : 0, oy = side === 0 ? 0 : side === 1 ? o : side === 2 ? 9 : o;
      const x = (4 + 12 * bi + ox + 0.5) * T, y = (4 + 12 * bj + oy + 0.5) * T;
      const d = dist(fx, fy, x, y);
      if (tileW(x, y) === TL.WALK && d > dmin && d < dmax) return { x, y };
    }
    return { x: 77 * T, y: 30 * T };
  },

  start(c) {
    const P = Player, m = { c, type: c.type, stage: 0, timer: null, tgt: null, reward: 0 };
    c.n++;
    switch (c.type) {
      case 'entrega':
        m.tgt = this.randPoint(c.x, c.y, 500, 1300);
        this.say(c, 'Hay un maletín que nadie debe abrir. <em>Recógelo</em> y llévalo donde te diga.'); break;
      case 'taxi':
        m.stage = P.car ? 1 : 0;
        if (m.stage) this.taxiPickup(m);
        this.say(c, m.stage ? 'Mi sobrino necesita que lo lleven. <em>Recógelo</em> y no hagas preguntas.' : 'Primero <em>consigue un coche</em>, chaval. Luego hablamos.'); break;
      case 'golpe': {
        m.tgt = this.randPoint(c.x, c.y, 600, 1500); m.gang = [];
        for (let i = 0; i < 3 + Math.min(3, c.n - 1); i++) {
          const g = new Ped(m.tgt.x + rand(-40, 40), m.tgt.y + rand(-40, 40), 'gang');
          if (pedBlocked(g.x, g.y)) { g.x = m.tgt.x; g.y = m.tgt.y; }
          g.home = { x: g.x, y: g.y }; g.keep = true; g.hp = 50; G.peds.push(g); m.gang.push(g);
        }
        this.say(c, 'Los <em>Tiburones</em> me deben dinero. Hazles una visita y que no quede ninguno.'); break;
      }
      case 'carrera': {
        m.stage = P.car ? 1 : 0; m.cps = []; m.cp = 0;
        let i = clamp(Math.round((c.x / T - 3) / 12), 0, NR - 1), j = clamp(Math.round((c.y / T - 3) / 12), 0, NR - 1), last = -1;
        for (let k = 0; k < 7; k++) {
          const opts = [0, 1, 2, 3].filter(d => d !== (last + 2) % 4 && i + DX[d] * 2 >= 0 && i + DX[d] * 2 < NR && j + DY[d] * 2 >= 0 && j + DY[d] * 2 < NR);
          const d = pick(opts); i += DX[d] * 2; j += DY[d] * 2; last = d;
          m.cps.push({ x: roadX(i) + T, y: roadY(j) + T });
        }
        if (m.stage) { m.tgt = m.cps[0]; m.timer = 20; }
        this.say(c, m.stage ? 'Siete controles, un reloj y nada de frenos. <em>¡Ya!</em>' : 'Sin ruedas no hay carrera. <em>Consigue un coche</em> y vuelve.');
        if (!m.stage) { this.active = null; c.n--; return; }
        break;
      }
    }
    this.active = m;
    HUD.big(c.name, ['', 'ENTREGA', 'TRANSPORTE', 'AJUSTE DE CUENTAS', 'CARRERA'][['', 'entrega', 'taxi', 'golpe', 'carrera'].indexOf(c.type)], c.color, 2.4);
  },
  taxiPickup(m) {
    m.from = this.randPoint(Player.x, Player.y, 400, 1000);
    const v = new Ped(m.from.x, m.from.y, 'vip'); v.keep = true; G.peds.push(v); m.vip = v; m.tgt = m.from;
  },
  say(c, text) { HUD.objective(`<b style="color:${c.color}">${c.name}:</b> ${text}`, 7); },
  goal(text) { HUD.objective(text, 999); },

  finish(ok, why) {
    const m = this.active; if (!m) return;
    this.active = null; HUD.timer(null); HUD.objective('', 0);
    if (m.vip && !m.vip.dead) { m.vip.keep = false; m.vip.hidden = false; m.vip.x = Player.x + 20; m.vip.y = Player.y; m.vip.state = 'flee'; m.vip.timer = 5; m.vip.threat = { x: Player.x, y: Player.y }; m.vip.kind = 'civ'; }
    if (m.gang) for (const g of m.gang) g.keep = false;
    m.c.cd = ok ? 4 : 6;
    if (why === 'silent') return;
    if (ok) {
      const r = m.reward; G.money += r; this.done++; this.earned += r;
      HUD.big('¡ENCARGO CUMPLIDO!', '+$' + r, '#6dffa8', 3.2); Sound.jingle(true);
    } else { HUD.big('ENCARGO FALLIDO', why || '', '#ff3b6b', 3); Sound.jingle(false); }
  },

  update(dt) {
    const P = Player;
    for (const c of this.contacts) {
      c.cd -= dt;
      if (!this.active && c.cd <= 0 && G.state === 'play' && dist(P.x, P.y, c.x, c.y) < 24) { c.cd = 3; this.start(c); }
    }
    this.updateSpray(dt);
    const m = this.active; if (!m) return;
    if (m.timer !== null) {
      m.timer -= dt; HUD.timer(m.timer);
      if (m.timer <= 0) return this.finish(false, 'Se acabó el tiempo');
    }
    const near = (pt, r) => pt && dist(P.x, P.y, pt.x, pt.y) < r;
    switch (m.type) {
      case 'entrega':
        if (m.stage === 0 && near(m.tgt, 26)) {
          m.stage = 1; const from = m.tgt; m.tgt = this.randPoint(from.x, from.y, 900, 2000);
          m.timer = Math.round(dist(from.x, from.y, m.tgt.x, m.tgt.y) / 115) + 18; m.reward = 300 + Math.round(m.timer * 12);
          Sound.pickup(); this.goal('Lleva el <em>maletín</em> al punto marcado antes de que acabe el tiempo.');
          if (Math.random() < 0.45) { addWanted(0, 1); HUD.toast('¡Un chivato ha avisado a la poli!'); }
        } else if (m.stage === 1 && near(m.tgt, 30)) this.finish(true);
        break;
      case 'taxi':
        if (m.stage === 0) { if (P.car) { m.stage = 1; this.taxiPickup(m); this.goal('<em>Recoge</em> al sobrino de Ramiro.'); } break; }
        if (m.vip.dead) return this.finish(false, 'El sobrino no lo ha contado');
        if (m.stage === 1) {
          const v = m.vip, d = dist(v.x, v.y, P.x, P.y);
          if (P.car && d < 90 && P.car.spd < 40) {
            const a = angTo(v.x, v.y, P.x, P.y); v.move(dt, Math.cos(a) * 90, Math.sin(a) * 90);
            if (d < 26) {
              v.hidden = true; m.car = P.car; m.stage = 2;
              m.tgt = this.randPoint(v.x, v.y, 900, 2000);
              m.timer = Math.round(dist(v.x, v.y, m.tgt.x, m.tgt.y) / 120) + 16; m.reward = 250 + Math.round(m.timer * 14);
              this.goal('Lleva al sobrino a su destino. <em>Que no se maree.</em>');
            }
          } else v.move(dt, 0, 0);
        } else if (m.stage === 2) {
          m.vip.x = m.car.x; m.vip.y = m.car.y;
          if (m.car.dead) return this.finish(false, 'El coche ha volado por los aires');
          if (P.car !== m.car) { m.away = (m.away || 0) + dt; if (m.away > 8) return this.finish(false, 'Has dejado tirado al pasajero'); }
          else m.away = 0;
          if (near(m.tgt, 40) && P.car && P.car.spd < 60) this.finish(true);
        }
        break;
      case 'golpe': {
        const alive = m.gang.filter(g => !g.dead).length;
        if (m.stage === 0) {
          if (near(m.tgt, 260)) { m.stage = 1; this.goal(`Acaba con los <em>Tiburones</em> (${alive} quedan).`); }
          else this.goal('Ve a donde se esconden los <em>Tiburones</em>.');
        }
        if (m.stage >= 1 && alive < m.gang.length && G.wanted < 1 && !m.heat) { m.heat = true; addWanted(0, 1); }
        if (m.stage === 1) {
          m.tgt = m.gang.find(g => !g.dead) || m.tgt;
          HUD.objective(`Acaba con los <em>Tiburones</em> (${alive} quedan).`, 999);
          if (alive === 0) { m.stage = 2; m.tgt = null; m.reward = 1200 + m.gang.length * 150; this.goal(G.wanted >= 1 ? '¡Hecho! Ahora <em>despista a la policía</em>.' : '¡Hecho!'); }
        }
        if (m.stage === 2 && G.wanted < 1) this.finish(true);
        break;
      }
      case 'carrera':
        if (!P.car) { m.away = (m.away || 0) + dt; if (m.away > 6) return this.finish(false, 'Una carrera se corre en coche'); this.goal('¡Vuelve a un coche!'); break; }
        m.away = 0;
        this.goal(`Control <em>${m.cp + 1}/${m.cps.length}</em>`);
        if (near(m.tgt, 48)) {
          m.cp++; Sound.pickup();
          if (m.cp >= m.cps.length) { m.reward = 800 + Math.round(m.timer * 40); return this.finish(true); }
          m.tgt = m.cps[m.cp]; m.timer += 9;
        }
        break;
    }
  },

  updateSpray(dt) {
    this.sprayCd -= dt;
    const s = World.spray, c = Player.car;
    if (!c || this.sprayCd > 0 || c.x < s.x || c.x > s.x + s.w || c.y < s.y || c.y > s.y + s.h) return;
    this.sprayCd = 6;
    if (G.wanted < 1 && c.hp >= c.d.hp) return HUD.toast('PINTA RÁPIDA: tu coche ya está impecable.');
    if (G.money < 100) return HUD.toast('PINTA RÁPIDA: son <b>$100</b>. Vuelve con pasta.');
    G.money -= 100; calmPolice(); G.seenT = 99;
    c.hp = c.d.hp; c.burn = 0; c.color = pick(['#ff3fa4', '#2ef2ff', '#ffe45c', '#6dffa8', '#a46bff', '#ffffff', '#ff8f4d']);
    Sound.spray(); burst('smoke', c.x, c.y, 16, 60, { life: 1.4, size: 8 });
    HUD.toast('PINTA RÁPIDA: coche nuevo, cara nueva. <b>−$100</b>');
  },

  target() { const m = this.active; return m && m.tgt ? m.tgt : null; },

  drawWorld(ctx) {
    const t = G.t;
    for (const c of this.contacts) {
      if (this.active || !inView(c.x, c.y)) continue;
      ring(ctx, c.x, c.y, 16 + Math.sin(t * 4) * 2, c.color, t);
    }
    const m = this.active;
    if (m && m.tgt) {
      const col = m.type === 'carrera' ? '#a46bff' : m.type === 'golpe' ? '#ff3b6b' : '#ffe45c';
      if (m.type !== 'golpe' || m.stage === 0) ring(ctx, m.tgt.x, m.tgt.y, m.type === 'carrera' ? 40 : 22, col, t);
      const bob = Math.sin(t * 5) * 4;
      ctx.fillStyle = col; ctx.strokeStyle = '#0b0614'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(m.tgt.x, m.tgt.y - 22 + bob); ctx.lineTo(m.tgt.x - 9, m.tgt.y - 38 + bob); ctx.lineTo(m.tgt.x + 9, m.tgt.y - 38 + bob); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    // taller
    const s = World.spray, k = 0.5 + Math.sin(t * 3) * 0.3;
    ctx.strokeStyle = `rgba(255,228,92,${k})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6); ctx.setLineDash([]);
  },
  drawLights(ctx) {
    for (const c of this.contacts) if (!this.active && inView(c.x, c.y)) { ctx.globalAlpha = 0.6; ctx.drawImage(glowSprite(c.color), c.x - 45, c.y - 45, 90, 90); }
    const t = this.target();
    if (t && inView(t.x, t.y)) { ctx.globalAlpha = 0.6; ctx.drawImage(glowSprite('#ffe45c'), t.x - 50, t.y - 50, 100, 100); }
    ctx.globalAlpha = 1;
  },
};
function ring(ctx, x, y, r, col, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col + '30'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.rotate(t * 1.5); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}
