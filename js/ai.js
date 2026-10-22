'use strict';
// ===== IA: tráfico, peatones, policía y nivel de búsqueda =====
const AI = { flowT: 0, polT: 0, lastStars: 0 };
const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'cabrio', 'cabrio', 'sport', 'van', 'van', 'police'];

// ---------- rejilla de carreteras ----------
function nodeAhead(dir, x, y) {
  if (dir === 0) { for (let i = 0; i < NR; i++) if (roadX(i) - 6 > x) return i; }
  else if (dir === 2) { for (let i = NR - 1; i >= 0; i--) if (roadX(i) + 2 * T + 6 < x) return i; }
  else if (dir === 1) { for (let j = 0; j < NR; j++) if (roadY(j) - 6 > y) return j; }
  else { for (let j = NR - 1; j >= 0; j--) if (roadY(j) + 2 * T + 6 < y) return j; }
  return -1;
}
function entryPt(dir, road, node) {
  switch (dir) {
    case 0: return { x: roadX(node) - 6, y: laneY(road, 0) };
    case 2: return { x: roadX(node) + 2 * T + 6, y: laneY(road, 2) };
    case 1: return { x: laneX(road, 1), y: roadY(node) - 6 };
    default: return { x: laneX(road, 3), y: roadY(node) + 2 * T + 6 };
  }
}
function exitPt(nd, i, j) {
  switch (nd) {
    case 0: return { x: roadX(i) + 2 * T + 10, y: laneY(j, 0) };
    case 2: return { x: roadX(i) - 10, y: laneY(j, 2) };
    case 1: return { x: laneX(i, 1), y: roadY(j) + 2 * T + 10 };
    default: return { x: laneX(i, 3), y: roadY(j) - 10 };
  }
}
function dirValid(nd, i, j) { return nd === 0 ? i < NR - 1 : nd === 2 ? i > 0 : nd === 1 ? j < NR - 1 : j > 0; }

// coloca la IA de un coche en el carril más cercano según su orientación
function assignLane(car) {
  let dir = ((Math.round(car.a / (Math.PI / 2)) % 4) + 4) % 4;
  for (let tries = 0; tries < 2; tries++) {
    let road = 0, best = 1e9;
    for (let k = 0; k < NR; k++) {
      const d = (dir === 0 || dir === 2) ? Math.abs(laneY(k, dir) - car.y) : Math.abs(laneX(k, dir) - car.x);
      if (d < best) { best = d; road = k; }
    }
    const node = nodeAhead(dir, car.x, car.y);
    if (node >= 0) {
      car.ai = { mode: 'traffic', dir, road, node, phase: 'go', cruise: car.ai && car.ai.cruise || rand(110, 165), stuck: 0, rev: 0, panic: 0, check: 1, block: 0 };
      return;
    }
    dir = (dir + 2) % 4;
  }
  car.ai = { mode: 'traffic', dir: 0, road: 0, node: 0, phase: 'go', cruise: 120, stuck: 0, rev: 0, panic: 0, check: 1, block: 0 };
}

function steerTo(car, tx, ty, want) {
  const da = wrapA(angTo(car.x, car.y, tx, ty) - car.a), fs = car.fwd();
  car.ctl.steer = clamp(da * 2.6, -1, 1);
  const tgt = want * (1 - Math.min(0.65, Math.abs(da) / Math.PI * 1.3));
  car.ctl.thr = fs < tgt - 10 ? 1 : fs > tgt + 25 ? -1 : 0.15;
  car.ctl.hb = false;
}
function unstick(car, dt) {
  const ai = car.ai;
  if (ai.rev > 0) { ai.rev -= dt; car.ctl.thr = -1; car.ctl.steer = ai.revSteer; return true; }
  if (car.spd < 12 && car.ctl.thr > 0.5) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
  if (ai.stuck > 1.4) { ai.stuck = 0; ai.rev = 0.9; ai.revSteer = -car.ctl.steer || pick([-1, 1]); }
  return false;
}
function obstacleAhead(car, range) {
  const cs = Math.cos(car.a), sn = Math.sin(car.a); let best = 0;
  const test = (x, y, w) => {
    const dx = x - car.x, dy = y - car.y, f = dx * cs + dy * sn;
    if (f <= 0 || f > range) return;
    if (Math.abs(-dx * sn + dy * cs) < w && (!best || f < best)) best = f;
  };
  for (const c of G.cars) if (c !== car && Math.abs(c.x - car.x) < range + 30 && Math.abs(c.y - car.y) < range + 30) test(c.x, c.y, 17);
  for (const p of G.peds) if (!p.dead && !p.hidden && Math.abs(p.x - car.x) < range && Math.abs(p.y - car.y) < range) test(p.x, p.y, 13);
  if (!Player.car) test(Player.ped.x, Player.ped.y, 13);
  return best;
}

function aiTraffic(car, dt) {
  const ai = car.ai;
  if (unstick(car, dt)) return;
  if ((ai.check -= dt) <= 0) { // ¿se ha salido de su ruta?
    ai.check = 1;
    const tp0 = ai.phase === 'turn' ? ai.exit : entryPt(ai.dir, ai.road, ai.node);
    const lat = (ai.dir === 0 || ai.dir === 2) ? Math.abs(tp0.y - car.y) : Math.abs(tp0.x - car.x);
    if (ai.phase === 'go' && lat > 1.3 * T) { assignLane(car); return; }
  }
  let tp = ai.phase === 'turn' ? ai.exit : entryPt(ai.dir, ai.road, ai.node);
  const d = ai.phase === 'turn' ? ai.ndir : ai.dir;
  const along = (tp.x - car.x) * DX[d] + (tp.y - car.y) * DY[d];
  if (along < 10) {
    if (ai.phase === 'go') {
      const horiz = ai.dir === 0 || ai.dir === 2, i = horiz ? ai.node : ai.road, j = horiz ? ai.road : ai.node;
      const opts = [];
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (ai.dir + 2) % 4 || !dirValid(nd, i, j)) continue;
        opts.push(nd); if (nd === ai.dir) opts.push(nd, nd);
      }
      const nd = opts.length ? pick(opts) : (ai.dir + 2) % 4;
      Object.assign(ai, { phase: 'turn', ndir: nd, ci: i, cj: j, exit: exitPt(nd, i, j) });
    } else {
      const nd = ai.ndir;
      ai.dir = nd; ai.road = (nd === 0 || nd === 2) ? ai.cj : ai.ci;
      ai.node = nd === 0 ? ai.ci + 1 : nd === 2 ? ai.ci - 1 : nd === 1 ? ai.cj + 1 : ai.cj - 1;
      ai.phase = 'go';
    }
    tp = ai.phase === 'turn' ? ai.exit : entryPt(ai.dir, ai.road, ai.node);
  }
  const dd = dist(car.x, car.y, tp.x, tp.y);
  let want = ai.phase === 'turn' ? 62 : dd < 80 ? 80 : ai.cruise;
  if (ai.panic > 0) { ai.panic -= dt; want *= 1.5; }
  const ob = ai.block > 3 ? 0 : obstacleAhead(car, 80);
  if (ob) { ai.block += dt; want = ob < 46 ? 0 : Math.min(want, 45); if (ai.block > 2.5 && !ai.honked) { ai.honked = true; Sound.horn && dist(car.x, car.y, Player.x, Player.y) < 300 && Sound.horn(); } }
  else { ai.block = Math.max(0, ai.block - dt * 2); if (ai.block === 0) ai.honked = false; }
  if (ai.block > 4.5) ai.block = 0;
  steerTo(car, tp.x, tp.y, want);
  if (want === 0) { car.ctl.thr = car.fwd() > 5 ? -1 : 0; ai.stuck = 0; }
}

function aiPolice(car, dt) {
  const P = Player, px = P.x, py = P.y, d = dist(car.x, car.y, px, py);
  car.siren = true;
  if (unstick(car, dt)) return;
  let tx, ty;
  if (d < 240 && los(car.x, car.y, px, py)) {
    const lead = P.car ? 0.35 : 0;
    tx = px + (P.car ? P.car.vx : 0) * lead; ty = py + (P.car ? P.car.vy : 0) * lead;
  } else { const n = flowNext(car.x, car.y, 3); tx = n.x; ty = n.y; }
  const want = !P.car && d < 140 ? 50 : car.d.max * (0.75 + Math.floor(G.wanted) * 0.05);
  steerTo(car, tx, ty, want);
  if (!P.car && d < 150 && car.spd < 70 && !car.ai.dropped) { // los agentes bajan a pie
    car.ai.dropped = true; car.driver = null; car.ctl = { thr: 0, steer: 0, hb: true };
    for (let k = 0; k < (G.wanted >= 3 ? 2 : 1); k++) {
      const s = k ? 1 : -1, x = car.x - Math.sin(car.a) * 20 * s, y = car.y + Math.cos(car.a) * 20 * s;
      if (!pedBlocked(x, y)) { const cop = new Ped(x, y, 'cop'); cop.fromCar = car; G.peds.push(cop); }
    }
  }
  if (P.car && d < 52 && P.car.spd < 25) G.bustNear = true;
}

// ---------- peatones ----------
function panicAt(x, y, r) {
  for (const p of G.peds) {
    if (p.dead || (p.kind !== 'civ' && p.kind !== 'vip') || p.state === 'board') continue;
    if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && dist(p.x, p.y, x, y) < r) { p.state = 'flee'; p.timer = rand(4, 7); p.threat = { x, y }; }
  }
  for (const c of G.cars) if (c.ai && c.driver === 'npc' && dist(c.x, c.y, x, y) < r) c.ai.panic = 3;
}
function aiPed(p, dt) {
  if (p.dead) { p.deadT += dt; return; }
  if (p.down > 0) { p.down -= dt; p.move(dt, 0, 0, false); return; }
  if (p.kind === 'cop') return aiCop(p, dt);
  if (p.kind === 'gang') return aiGang(p, dt);
  if (p.kind === 'vip' && p.state !== 'flee') return; // lo controla la misión
  aiCiv(p, dt);
}
function aiCiv(p, dt) {
  if (p.state === 'flee') {
    p.timer -= dt;
    const a = angTo(p.threat.x, p.threat.y, p.x, p.y) + Math.sin(G.t * 3 + p.y) * 0.5;
    p.move(dt, Math.cos(a) * 118, Math.sin(a) * 118);
    if (p.timer <= 0) p.state = 'walk';
    return;
  }
  p.timer -= dt;
  const ahead = tileW(p.x + DX[p.dir] * 13, p.y + DY[p.dir] * 13), here = tileW(p.x, p.y);
  if (p.crossing && here !== TL.ROAD && ahead !== TL.ROAD) p.crossing = false;
  if (p.timer <= 0 || blocked(ahead) || (ahead === TL.ROAD && !p.crossing)) {
    if (ahead === TL.ROAD && !blocked(ahead) && p.timer <= 0 && Math.random() < 0.25) p.crossing = true;
    else {
      const opts = [0, 1, 2, 3].filter(d => { const t = tileW(p.x + DX[d] * 16, p.y + DY[d] * 16); return !blocked(t) && t !== TL.ROAD && d !== (p.dir + 2) % 4; });
      p.dir = opts.length ? pick(opts) : (p.dir + 2) % 4;
    }
    p.timer = rand(2, 7);
  }
  const sp = p.crossing ? 60 : 36;
  p.move(dt, DX[p.dir] * sp, DY[p.dir] * sp);
}
function aiCop(p, dt) {
  const P = Player, d = dist(p.x, p.y, P.x, P.y), stars = Math.floor(G.wanted);
  if (stars < 1) { p.armed = true; p.kind = 'cop'; return aiCiv(p, dt); }
  const see = d < 340 && los(p.x, p.y, P.x, P.y);
  if (stars >= 2 && see && d < 290) {
    p.a = angTo(p.x, p.y, P.x, P.y);
    const k = d > 150 ? 1 : d < 80 ? -0.6 : 0;
    p.move(dt, Math.cos(p.a) * 95 * k, Math.sin(p.a) * 95 * k, false);
    if ((p.fireCd -= dt) <= 0) { shoot(p, 'pistola', p.a + rand(-0.14, 0.14), 'cop'); p.fireCd = rand(0.7, 1.3); }
  } else {
    let tx = P.x, ty = P.y;
    if (!see && d > 40) { const n = flowNext(p.x, p.y, 2); tx = n.x; ty = n.y; }
    const a = angTo(p.x, p.y, tx, ty); p.move(dt, Math.cos(a) * 128, Math.sin(a) * 128);
  }
  if (d < 20 && !P.car) G.bustNear = true;
  if (P.car && d < 34 && P.car.spd < 20) G.bustNear = true;
}
function aiGang(p, dt) {
  const P = Player, d = dist(p.x, p.y, P.x, P.y);
  if (p.state !== 'attack') {
    if (d < 230 && los(p.x, p.y, P.x, P.y)) p.state = 'attack';
    else { p.a += Math.sin(G.t + p.x) * dt; p.move(dt, 0, 0, false); return; }
  }
  p.a = angTo(p.x, p.y, P.x, P.y);
  const see = d < 380 && los(p.x, p.y, P.x, P.y);
  if (see) {
    const k = d > 170 ? 0.8 : d < 90 ? -0.5 : Math.sin(G.t * 2 + p.y) * 0.6;
    p.move(dt, Math.cos(p.a) * 90 * k - Math.sin(p.a) * 30, Math.sin(p.a) * 90 * k + Math.cos(p.a) * 30, false);
    if ((p.fireCd -= dt) <= 0) { shoot(p, 'pistola', p.a + rand(-0.16, 0.16), 'gang'); p.fireCd = rand(0.55, 1.1); }
  } else if (p.home) {
    const a = angTo(p.x, p.y, p.home.x, p.home.y); if (dist(p.x, p.y, p.home.x, p.home.y) > 20) p.move(dt, Math.cos(a) * 80, Math.sin(a) * 80);
  }
}

// ---------- nivel de búsqueda ----------
function addWanted(n, min = 0) {
  const before = Math.floor(G.wanted);
  G.wanted = clamp(Math.max(G.wanted + n, min), 0, 5.99); G.seenT = 0;
  if (Math.floor(G.wanted) > before) HUD.flashStars();
}
function updateWanted(dt) {
  if (G.bustNear) G.bustT += dt; else G.bustT = Math.max(0, G.bustT - dt * 2);
  G.bustNear = false;
  if (G.bustT > 1.1 && G.wanted >= 1) { G.die('busted'); return; }
  if (G.wanted <= 0) return;
  const px = Player.x, py = Player.y; let seen = false;
  for (const c of G.cars) if (c.police && c.driver === 'cop' && !c.dead && dist(c.x, c.y, px, py) < 430 && los(c.x, c.y, px, py)) { seen = true; break; }
  if (!seen) for (const p of G.peds) if (p.kind === 'cop' && !p.dead && dist(p.x, p.y, px, py) < 360 && los(p.x, p.y, px, py)) { seen = true; break; }
  if (seen) G.seenT = 0; else G.seenT += dt;
  if (G.seenT > 6) G.wanted = Math.max(0, G.wanted - dt * 0.14);
  if (G.wanted <= 0) calmPolice();
}
function calmPolice() {
  G.wanted = 0;
  for (const c of G.cars) if (c.police && c.ai && c.ai.mode === 'chase') { c.siren = false; assignLane(c); }
}

// ---------- aparición / desaparición ----------
function laneSpawn(px, py, rmin, rmax) {
  for (let k = 0; k < 14; k++) {
    const horiz = Math.random() < 0.5, dir = horiz ? pick([0, 2]) : pick([1, 3]), road = randi(0, NR - 1);
    const x = horiz ? px + rand(-rmax, rmax) : laneX(road, dir), y = horiz ? laneY(road, dir) : py + rand(-rmax, rmax);
    const d = dist(x, y, px, py);
    if (d < rmin || d > rmax || x < 2 * T || x > 76 * T || y < 2 * T || y > 76 * T) continue;
    if (tileW(x, y) !== TL.ROAD || inView(x, y, 90)) continue;
    if (G.cars.some(c => Math.abs(c.x - x) < 70 && Math.abs(c.y - y) < 70)) continue;
    return { x, y, dir };
  }
  return null;
}
function spawnTraffic(sp, type) {
  const c = new Car(type, sp.x, sp.y, DIR_A[sp.dir]);
  c.driver = type === 'police' ? 'cop' : 'npc';
  assignLane(c);
  const v = c.ai.cruise * 0.6; c.vx = Math.cos(c.a) * v; c.vy = Math.sin(c.a) * v;
  G.cars.push(c); return c;
}
function spawnParked() {
  for (const s of World.spots) {
    if (!s.police && Math.random() > 0.5) continue;
    const c = new Car(s.police ? 'police' : pick(['sedan', 'sedan', 'cabrio', 'sport', 'van', 'taxi']), s.x, s.y, s.a + (Math.random() < 0.5 ? 0 : Math.PI));
    c.parked = true; G.cars.push(c);
  }
}
function populate(px, py) {
  for (let i = 0; i < 18; i++) { const sp = laneSpawn(px, py, 80, 1100); if (sp) spawnTraffic(sp, pick(TRAFFIC_MIX)); }
  for (let i = 0; i < 40; i++) { const s = randWalkNear(px, py, 40, 900, false); if (s) G.peds.push(new Ped(s.x, s.y, 'civ')); }
}

AI.update = function (dt) {
  const P = Player, px = P.x, py = P.y, stars = Math.floor(G.wanted);
  if (stars >= 1 && (AI.flowT -= dt) <= 0) { buildFlow(px, py); AI.flowT = 0.4; }
  // limpiar lo lejano
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i]; if (c === P.car || c.keep) continue;
    const d = dist(c.x, c.y, px, py);
    if ((!c.parked || c.dead) && d > 1500 && !inView(c.x, c.y, 200)) G.cars.splice(i, 1);
  }
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const p = G.peds[i]; if (p.keep) continue;
    const d = dist(p.x, p.y, px, py);
    if ((d > 1150 || (p.dead && p.deadT > 30)) && !inView(p.x, p.y, 100)) G.peds.splice(i, 1);
  }
  // tráfico y peatones
  let nTraffic = 0, nPol = 0, nCiv = 0;
  for (const c of G.cars) {
    if (c.driver === 'npc' || (c.driver === 'cop' && c.ai && c.ai.mode === 'traffic')) nTraffic++;
    if (c.police && c.driver === 'cop' && c.ai && c.ai.mode === 'chase') nPol++;
  }
  for (const p of G.peds) if (p.kind === 'civ' && !p.dead) nCiv++;
  if (nTraffic < 20) { const sp = laneSpawn(px, py, 650, 1150); if (sp) spawnTraffic(sp, pick(TRAFFIC_MIX)); }
  if (nCiv < 42) { const s = randWalkNear(px, py, 500, 1000, true); if (s) G.peds.push(new Ped(s.x, s.y, 'civ')); }
  // policía
  if (stars > AI.lastStars) for (const c of G.cars) if (c.police && c.driver === 'cop' && c.ai && dist(c.x, c.y, px, py) < 900) c.ai.mode = 'chase';
  AI.lastStars = stars;
  const wantPol = [0, 1, 2, 3, 5, 6][stars];
  if (nPol < wantPol && (AI.polT -= dt) <= 0) {
    AI.polT = 2.5;
    const sp = laneSpawn(px, py, 600, 1000);
    if (sp) { const c = spawnTraffic(sp, 'police'); c.ai.mode = 'chase'; c.siren = true; }
  }
  // cerebros
  for (const c of G.cars) {
    if (!c.ai || c.dead || !c.driver || c === P.car) continue;
    if (c.police && c.ai.mode === 'chase' && stars >= 1) aiPolice(c, dt); else aiTraffic(c, dt);
  }
  for (const p of G.peds) aiPed(p, dt);
  updateWanted(dt);
};
