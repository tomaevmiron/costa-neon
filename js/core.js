'use strict';
// ===== Constantes del mundo =====
const T = 32;             // tamaño de casilla (px de mundo)
const MW = 100, MH = 78;  // casillas del mapa
const NR = 7;             // carreteras por eje (rejilla 7x7)
const TL = { WATER: 0, ROAD: 1, WALK: 2, BUILD: 3, SAND: 4, GRASS: 5, LOT: 6 };
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // E S O N
const DIR_A = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// ===== Utilidades =====
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function wrapA(a) { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shade(hex, amt) { // amt -1..1 (negro..blanco)
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const tgt = amt < 0 ? 0 : 255, k = Math.abs(amt);
  r = Math.round(lerp(r, tgt, k)); g = Math.round(lerp(g, tgt, k)); b = Math.round(lerp(b, tgt, k));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function rr(ctx, x, y, w, h, r) { // ruta de rectángulo redondeado
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
const fmtMoney = n => '$' + String(Math.max(0, Math.floor(n))).padStart(8, '0');

// sprites de brillo cacheados por color
const _glow = {};
function glowSprite(color) {
  if (_glow[color]) return _glow[color];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (_glow[color] = c);
}

// ===== Estado global =====
const G = {
  state: 'title', paused: false,
  t: 0, clock: 17 * 60, // minutos del día
  dpr: 1, W: 0, H: 0,
  cam: { x: 0, y: 0, z: 1, shake: 0 },
  view: { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 },
  cars: [], peds: [], bullets: [], parts: [], pickups: [], lights: [],
  money: 0, wanted: 0, seenT: 0, kills: 0, bustT: 0, bustNear: false,
  night: 0, deadT: 0, deadKind: '',
};

// ===== Entrada =====
const Input = {
  keys: {}, hit: {},
  mouse: { sx: 0, sy: 0, wx: 0, wy: 0, down: false, moved: -99 },
  joy: { id: null, x: 0, y: 0 },
  tb: { shoot: false, hb: false },
  isTouch: false,
  down(k) { return !!this.keys[k]; },
  press(k) { if (this.hit[k]) { this.hit[k] = false; return true; } return false; },
  axis() {
    let x = 0, y = 0;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.joy.id !== null) { x = this.joy.x; y = this.joy.y; }
    return { x, y };
  },
  endFrame() { this.hit = {}; },
};

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!Input.keys[k]) Input.hit[k] = true;
  Input.keys[k] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
});
addEventListener('keyup', e => { Input.keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { Input.keys = {}; Input.mouse.down = false; });

function setupPointer(canvas) {
  const m = Input.mouse;
  canvas.addEventListener('mousemove', e => { m.sx = e.clientX; m.sy = e.clientY; m.moved = G.t; });
  canvas.addEventListener('mousedown', e => { if (e.button === 0) { m.down = true; m.moved = G.t; } });
  addEventListener('mouseup', e => { if (e.button === 0) m.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', () => { Input.hit['q'] = true; }, { passive: true });

  Input.isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  const joy = document.getElementById('joy'), knob = document.getElementById('knob');
  const R = 55;
  const setJoy = t => {
    const r = joy.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    Input.joy.x = dx / R; Input.joy.y = dy / R;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  joy.addEventListener('touchstart', e => { const t = e.changedTouches[0]; Input.joy.id = t.identifier; setJoy(t); e.preventDefault(); }, { passive: false });
  joy.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === Input.joy.id) setJoy(t);
    e.preventDefault();
  }, { passive: false });
  const endJoy = e => {
    for (const t of e.changedTouches) if (t.identifier === Input.joy.id) {
      Input.joy.id = null; Input.joy.x = Input.joy.y = 0; knob.style.transform = '';
    }
  };
  joy.addEventListener('touchend', endJoy); joy.addEventListener('touchcancel', endJoy);

  document.querySelectorAll('#touch button').forEach(b => {
    const name = b.dataset.b;
    b.addEventListener('touchstart', e => {
      e.preventDefault(); b.classList.add('on');
      if (name === 'shoot' || name === 'hb') Input.tb[name] = true;
      if (name === 'enter') Input.hit['f'] = true;
      if (name === 'weap') Input.hit['q'] = true;
      if (name === 'radio') Input.hit['r'] = true;
    }, { passive: false });
    const up = () => { b.classList.remove('on'); if (name === 'shoot' || name === 'hb') Input.tb[name] = false; };
    b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
  });
}
