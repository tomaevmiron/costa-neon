'use strict';
// ===== Arranque, bucle principal y render =====
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
function resize() {
  G.dpr = Math.min(2, devicePixelRatio || 1);
  G.W = cv.width = Math.floor(innerWidth * G.dpr); G.H = cv.height = Math.floor(innerHeight * G.dpr);
}
addEventListener('resize', resize); resize();

const START = { x: 77.4 * T, y: 31 * T };
// color de ambiente según la hora (multiplicativo)
const AMB = [[0, [62, 60, 140]], [300, [62, 60, 140]], [400, [255, 175, 160]], [480, [255, 255, 255]], [1020, [255, 255, 255]],
  [1110, [255, 165, 175]], [1200, [160, 105, 195]], [1290, [62, 60, 140]], [1440, [62, 60, 140]]];
function ambient(m) {
  for (let i = 0; i < AMB.length - 1; i++) {
    const [t0, c0] = AMB[i], [t1, c1] = AMB[i + 1];
    if (m >= t0 && m <= t1) { const k = (m - t0) / (t1 - t0); return c0.map((v, j) => Math.round(lerp(v, c1[j], k))); }
  }
  return [255, 255, 255];
}

function newGame() {
  G.cars = []; G.peds = []; G.bullets = []; G.parts = []; G.pickups = []; G.lights = [];
  G.money = 150; G.wanted = 0; G.kills = 0;
  Player.reset(START.x, START.y);
  G.cam.x = START.x; G.cam.y = START.y;
  spawnParked();
  const c = new Car('cabrio', 77.6 * T, 32.3 * T, -Math.PI / 2, '#ff8fc6'); c.parked = true; G.cars.push(c);
  Missions.placeItems();
  populate(START.x, START.y);
}

function startPlay() {
  Sound.init();
  document.getElementById('title').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  if (Input.isTouch) document.getElementById('touch').classList.remove('hidden');
  G.state = 'play';
  HUD.big('COSTA NEÓN', 'Busca los anillos de colores: son tus contactos', '#ff3fa4', 3.5);
  setTimeout(() => G.state === 'play' && HUD.toast(Input.isTouch ? 'Pulsa <b>COCHE</b> junto a un coche para robarlo. El descapotable rosa es tuyo.' : 'Pulsa <b>F</b> junto a un coche para subirte. El descapotable rosa de al lado es tuyo.', 6), 3800);
}
document.getElementById('play').addEventListener('click', startPlay);
addEventListener('keydown', e => { if (G.state === 'title' && e.key === 'Enter') startPlay(); });

function togglePause(v = !G.paused) {
  G.paused = v;
  document.getElementById('pause').classList.toggle('hidden', !v);
  if (v) {
    document.getElementById('stats').innerHTML = [
      ['Dinero', fmtMoney(G.money)], ['Encargos cumplidos', Missions.done], ['Ganado en encargos', '$' + Missions.earned],
      ['Casetes', Missions.tapes + '/' + Missions.tapeTotal], ['Bajas', G.kills],
    ].map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
  }
  if (Sound.ctx) v ? Sound.ctx.suspend() : Sound.ctx.resume();
}
document.getElementById('resume').addEventListener('click', () => togglePause(false));

G.die = function (kind) {
  if (G.state !== 'play') return;
  G.state = 'dead'; G.deadT = 0; G.deadKind = kind;
  Missions.finish(false, 'silent');
  HUD.objective('', 0); HUD.timer(null);
  if (kind === 'busted') HUD.big('ARRESTADO', 'La comisaría se queda con parte de tu dinero y tus armas', '#4dc9ff', 4);
  else HUD.big('HAS CAÍDO', 'El hospital te pasa la factura', '#ff3b6b', 4);
  Sound.wasted(); Sound.setInCar(false);
};
function respawn() {
  const busted = G.deadKind === 'busted', place = busted ? World.places.police : World.places.hospital;
  const fee = Math.min(G.money, busted ? Math.round(G.money * 0.12) + 100 : Math.round(G.money * 0.06) + 50);
  G.money -= fee;
  if (Player.car) { Player.car.driver = null; }
  Player.reset(place.x, place.y + T * 0.6, !busted);
  G.wanted = 0; G.bustT = 0; AI.lastStars = 0;
  G.peds = G.peds.filter(p => p.kind !== 'cop' && p.kind !== 'gang');
  G.cars = G.cars.filter(c => !(c.police && c.ai && c.ai.mode === 'chase'));
  G.bullets = [];
  G.cam.x = Player.x; G.cam.y = Player.y;
  G.state = 'play';
  HUD.toast(`Factura: <b>−$${fee}</b>`);
}

function updateMouseWorld() {
  const m = Input.mouse, z = G.cam.z;
  m.wx = G.cam.x + (m.sx * G.dpr - G.W / 2) / z; m.wy = G.cam.y + (m.sy * G.dpr - G.H / 2) / z;
}
function updateCamera(dt) {
  const P = Player; let tx = P.x, ty = P.y, sp = 0;
  if (G.state === 'title') { tx = START.x - 260 + Math.sin(G.t * 0.05) * 500; ty = START.y + Math.cos(G.t * 0.04) * 400; }
  else if (P.car) { tx += P.car.vx * 0.35; ty += P.car.vy * 0.35; sp = P.car.spd; }
  else if (!Input.isTouch && G.t - Input.mouse.moved < 3) { tx += (Input.mouse.wx - P.x) * 0.2; ty += (Input.mouse.wy - P.y) * 0.2; }
  const k = Math.min(1, dt * (G.state === 'title' ? 0.6 : 4));
  G.cam.x = lerp(G.cam.x, tx, k); G.cam.y = lerp(G.cam.y, ty, k);
  const base = G.dpr * clamp(Math.min(innerWidth, innerHeight) / 760, 0.52, 1.35);
  let zt = base * (P.car ? 1 - clamp(sp / 430, 0, 1) * 0.32 : 1.12);
  if (G.state === 'dead') zt = base * 1.35;
  if (G.state === 'title') zt = base * 0.85;
  G.cam.z = lerp(G.cam.z, zt, Math.min(1, dt * 1.6));
  G.cam.shake = Math.max(0, G.cam.shake - dt * 30);
  const z = G.cam.z, hw = G.W / 2 / z, hh = G.H / 2 / z, v = G.view;
  v.x0 = G.cam.x - hw; v.x1 = G.cam.x + hw; v.y0 = G.cam.y - hh; v.y1 = G.cam.y + hh; v.cx = G.cam.x; v.cy = G.cam.y;
}

function simulate(dt, withPlayer) {
  G.t += dt; G.clock = (G.clock + dt * 1.2) % 1440;
  updateMouseWorld();
  if (withPlayer) playerUpdate(dt);
  AI.update(dt);
  for (const c of G.cars) c.update(dt);
  resolveCars(); carPedHits();
  updateBullets(dt); updateParts(dt); updatePickups(dt);
  if (withPlayer) Missions.update(dt);
  updateCamera(dt);
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { frame(dt); } catch (err) { console.error(err); }
  Input.endFrame();
}
function frame(dt) {
  if (G.state === 'play') {
    if (Input.press('p') || Input.press('escape')) togglePause();
    if (!G.paused) simulate(dt, true);
  } else if (G.state === 'dead') {
    simulate(dt * 0.35, false); G.deadT += dt;
    if (G.deadT > 4) respawn();
  } else if (G.state === 'title') {
    simulate(dt, false);
  }
  render();
  if (G.state !== 'title') { HUD.update(dt); Sound.update(); }
}

function render() {
  const z = G.cam.z, v = G.view, sh = G.cam.shake * G.dpr;
  const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
  const world = () => ctx.setTransform(z, 0, 0, z, G.W / 2 - G.cam.x * z + ox, G.H / 2 - G.cam.y * z + oy);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d5d80'; ctx.fillRect(0, 0, G.W, G.H);
  world();
  drawGround(ctx, v); drawWaterFx(ctx, v, G.t); drawShadows(ctx, v);
  Missions.drawWorld(ctx); drawPickups(ctx);
  for (const p of G.peds) if (p.dead && inView(p.x, p.y)) p.draw(ctx);
  for (const p of G.peds) if (!p.dead && inView(p.x, p.y)) p.draw(ctx);
  if (!Player.car && G.state !== 'title') Player.ped.draw(ctx);
  for (const c of G.cars) if (inView(c.x, c.y, 40)) c.draw(ctx);
  drawBullets(ctx); drawCanopies(ctx, v); drawBuildings(ctx, v); drawParts(ctx);
  // ambiente según la hora
  const amb = ambient(G.clock);
  G.night = clamp((255 - (amb[0] + amb[1] + amb[2]) / 3) / 150, 0, 1);
  if (amb[0] < 255 || amb[1] < 255 || amb[2] < 255) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${amb})`; ctx.fillRect(0, 0, G.W, G.H);
  }
  // luces
  world(); ctx.globalCompositeOperation = 'lighter';
  drawLamps(ctx, G.night); drawCarLights(ctx, G.night); drawTransientLights(ctx); Missions.drawLights(ctx);
  drawNeon(ctx, v, G.night);
  ctx.globalCompositeOperation = 'source-over';
  // pantalla
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (G.state === 'play') HUD.drawArrow(ctx);
  if (Player.hurtFlash > 0 || (G.state === 'play' && Player.ped.hp < 30)) {
    const a = Player.hurtFlash > 0 ? 0.45 : 0.18 + Math.sin(G.t * 6) * 0.08;
    const gr = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.3, G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.7);
    gr.addColorStop(0, 'rgba(255,0,60,0)'); gr.addColorStop(1, `rgba(255,0,60,${a})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, G.W, G.H);
  }
  if (G.state === 'dead') { ctx.fillStyle = `rgba(20,0,30,${Math.min(0.5, G.deadT * 0.2)})`; ctx.fillRect(0, 0, G.W, G.H); }
}

// ===== Arranque =====
genWorld(); renderGround();
setupPointer(cv);
HUD.init(); Missions.init();
newGame();
requestAnimationFrame(loop);
