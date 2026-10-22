'use strict';
// ===== Ciudad: generación, consultas y render =====
const World = {
  tiles: new Uint8Array(MW * MH),
  buildings: [], bSorted: [], deco: [], lamps: [], spots: [], vis: [],
  ground: null, gctx: null, mini: null,
  places: {}, spray: null,
  flow: new Int16Array(MW * MH), flowQ: new Int32Array(MW * MH),
};

function tAt(tx, ty) { return (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? TL.WATER : World.tiles[ty * MW + tx]; }
function tileW(x, y) { return tAt(Math.floor(x / T), Math.floor(y / T)); }
function blocked(t) { return t === TL.BUILD || t === TL.WATER; }
function blockedW(x, y) { return blocked(tileW(x, y)); }
const roadX = i => (2 + 12 * i) * T, roadY = j => (2 + 12 * j) * T;
// circulación por la derecha
function laneX(i, dir) { return roadX(i) + (dir === 3 ? 1.5 * T : 0.5 * T); }
function laneY(j, dir) { return roadY(j) + (dir === 0 ? 1.5 * T : 0.5 * T); }
function isRoadCol(x) { return x >= 2 && x <= 75 && (x % 12 === 2 || x % 12 === 3); }
function isRoadRow(y) { return y >= 2 && y <= 75 && (y % 12 === 2 || y % 12 === 3); }

const PALETTES = {
  deco: ['#ffb3d1', '#9ff0e8', '#ffe0a8', '#d7c4ff', '#fff3b0', '#b8f5c4'],
  centro: ['#6f86c9', '#8a7bd1', '#5fa8c9', '#a1a9c4', '#7cc1b8', '#b38ad6'],
  barrio: ['#ff9e7a', '#ffd36b', '#7fd6a7', '#f28cc0', '#8ecdf5', '#e8b77d'],
  mixto: ['#c99ad6', '#ffb38a', '#86c7c1', '#e0a0a0', '#a7b7e8', '#f0c987'],
};
const HEIGHTS = { deco: [50, 95], centro: [120, 240], barrio: [22, 46], mixto: [45, 110] };
const NEONS = ['#ff2fa8', '#22f0ff', '#ffe14d', '#a46bff', '#4dff9a'];
const SIGNS = ['HOTEL', 'MOTEL', 'DISCO', 'CAFÉ', 'BAR', 'ARCADE', 'SALSA', 'OCASO', 'PALMAS', 'MAREA', 'LUNA'];

function genWorld() {
  const R = mulberry32(1986), tl = World.tiles;
  const Rp = arr => arr[Math.floor(R() * arr.length)];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < MW && y < MH) tl[y * MW + x] = t; };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let t;
    if (x >= 76) {
      const shore = 86 + Math.round(Math.sin(y * 0.23) * 1.6 + Math.sin(y * 0.071 + 1) * 2.2);
      t = x === 76 ? TL.WALK : (x < shore ? TL.SAND : TL.WATER);
    } else if (x < 2 || y < 2 || y > 75) t = TL.WATER;
    else if (isRoadCol(x) || isRoadRow(y)) t = TL.ROAD;
    else t = TL.WALK;
    tl[y * MW + x] = t;
  }
  // muelle
  for (let x = 80; x < 95; x++) for (let y = 37; y <= 38; y++) if (tAt(x, y) === TL.WATER) set(x, y, TL.WALK);

  const B = World.buildings, P = World.places;
  const addB = (x, y, w, h, district, o = {}) => {
    const col = o.col || Rp(PALETTES[district]);
    const hr = HEIGHTS[district];
    const b = {
      x: x * T, y: y * T, w: w * T, h: h * T, kind: district,
      hgt: o.hgt || lerp(hr[0], hr[1], R()) * (w * h >= 40 ? 1.15 : 1),
      col, wall: shade(col, -0.32), wall2: shade(col, -0.5), roof: shade(col, 0.15),
      neon: o.neon || Rp(NEONS), det: [], sign: o.sign || null, lit: R(),
    };
    if (o.det) b.det = o.det;
    else {
      const n = 1 + Math.floor(R() * 3);
      if (district === 'deco' && w * h >= 12 && R() < 0.55) b.det.push({ t: 'pool', x: 0.15 + R() * 0.2, y: 0.15 + R() * 0.2, w: 0.45, h: 0.35 });
      if (district === 'centro' && w * h >= 30 && R() < 0.45) b.det.push({ t: 'heli', x: 0.5, y: 0.5 });
      if (district === 'barrio') b.det.push({ t: 'stripes' });
      for (let i = 0; i < n; i++) b.det.push({ t: 'box', x: 0.1 + R() * 0.7, y: 0.1 + R() * 0.7, w: 0.12, h: 0.1 });
      if (!b.sign && (district === 'deco' ? R() < 0.7 : R() < 0.18) && w >= 3) b.sign = Rp(SIGNS);
    }
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, TL.BUILD);
    B.push(b); return b;
  };
  const split = (x, y, w, h, d, district) => {
    const maxA = district === 'centro' ? 64 : district === 'deco' ? 30 : 14;
    if ((w * h <= maxA && R() < 0.8) || Math.max(w, h) < 4 || d > 3) return addB(x, y, w, h, district);
    const gap = (Math.max(w, h) >= 5 && R() < 0.45) ? 1 : 0;
    if (w >= h) {
      const s = 2 + Math.floor(R() * (w - 3 - gap));
      split(x, y, s, h, d + 1, district);
      split(x + s + gap, y, w - s - gap, h, d + 1, district);
    } else {
      const s = 2 + Math.floor(R() * (h - 3 - gap));
      split(x, y, w, s, d + 1, district);
      split(x, y + s + gap, w, h - s - gap, d + 1, district);
    }
  };
  const park = (ix, iy) => {
    for (let y = iy; y < iy + 8; y++) for (let x = ix; x < ix + 8; x++) set(x, y, (x - ix === 3 || x - ix === 4 || y - iy === 3 || y - iy === 4) ? TL.WALK : TL.GRASS);
    if (R() < 0.5) { for (let y = iy + 1; y < iy + 3; y++) for (let x = ix + 5; x < ix + 7; x++) set(x, y, TL.WATER); }
    const n = 7 + Math.floor(R() * 6);
    for (let i = 0; i < n; i++) {
      const x = ix + R() * 8, y = iy + R() * 8;
      if (tAt(Math.floor(x), Math.floor(y)) === TL.GRASS) World.deco.push({ t: 'tree', x: x * T, y: y * T, r: 12 + R() * 8, rot: R() * 6 });
    }
  };
  const lot = (ix, iy, police) => {
    for (let y = iy; y < iy + 8; y++) for (let x = ix; x < ix + 8; x++) set(x, y, TL.LOT);
    for (let k = 0; k < 8; k++) {
      World.spots.push({ x: (ix + k + 0.5) * T, y: (iy + 1) * T, a: Math.PI / 2, police });
      World.spots.push({ x: (ix + k + 0.5) * T, y: (iy + 7) * T, a: -Math.PI / 2, police });
    }
    World.lotRects = World.lotRects || []; World.lotRects.push([ix, iy]);
  };

  for (let bj = 0; bj < 6; bj++) for (let bi = 0; bi < 6; bi++) {
    const bx = 4 + 12 * bi, by = 4 + 12 * bj, ix = bx + 1, iy = by + 1;
    World.lamps.push({ x: (bx + 0.5) * T, y: (by + 0.5) * T }, { x: (bx + 9.5) * T, y: (by + 0.5) * T },
      { x: (bx + 0.5) * T, y: (by + 9.5) * T }, { x: (bx + 9.5) * T, y: (by + 9.5) * T });
    const key = bi + ',' + bj;
    const district = bi === 5 ? 'deco' : (bj <= 1 ? 'barrio' : (bj >= 3 && bi >= 1 && bi <= 4 ? 'centro' : 'mixto'));
    if (key === '1,4') { // hospital
      addB(ix, iy, 8, 5, 'mixto', { col: '#eef0ff', hgt: 70, neon: '#ff3b6b', sign: 'HOSPITAL', det: [{ t: 'cross' }] });
      for (let y = iy + 5; y < iy + 8; y++) for (let x = ix; x < ix + 8; x++) set(x, y, TL.LOT);
      P.hospital = { x: (ix + 4) * T, y: (iy + 6.5) * T };
    } else if (key === '3,1') { // comisaría
      addB(ix, iy, 8, 4, 'mixto', { col: '#4b5fa8', hgt: 64, neon: '#2ea8ff', sign: 'POLICÍA', det: [{ t: 'heli', x: 0.78, y: 0.5 }] });
      lot(ix, iy + 4 - 4, true); // aparcamiento sobre el resto
      for (let y = iy; y < iy + 4; y++) for (let x = ix; x < ix + 8; x++) set(x, y, TL.BUILD);
      World.spots = World.spots.filter(s => !(s.police && s.y < (iy + 4) * T));
      P.police = { x: (ix + 4) * T, y: (iy + 4.6) * T };
    } else if (key === '2,3') { // taller de pintura
      addB(ix, iy, 5, 8, 'mixto', { col: '#ffd36b', hgt: 46, neon: '#ffe14d', sign: 'PINTA RÁPIDA', det: [{ t: 'box', x: .3, y: .2, w: .3, h: .1 }] });
      addB(ix + 5, iy, 3, 2, 'mixto', { col: '#ffd36b', hgt: 40, det: [] });
      addB(ix + 5, iy + 6, 3, 2, 'mixto', { col: '#ffd36b', hgt: 40, det: [] });
      for (let y = iy + 2; y < iy + 6; y++) for (let x = ix + 5; x < ix + 8; x++) set(x, y, TL.LOT);
      World.spray = { x: (ix + 5) * T, y: (iy + 2) * T, w: 3 * T, h: 4 * T };
    } else if (key === '4,5') { // villa
      for (let y = iy; y < iy + 8; y++) for (let x = ix; x < ix + 8; x++) set(x, y, TL.GRASS);
      addB(ix + 1, iy + 1, 6, 4, 'deco', { col: '#ffc2dc', hgt: 58, neon: '#ff2fa8', sign: 'VILLA CORAL', det: [{ t: 'pool', x: .55, y: .2, w: .35, h: .55 }] });
      for (let i = 0; i < 6; i++) World.deco.push({ t: 'palm', x: (ix + 0.5 + i * 1.4) * T, y: (iy + 6.6) * T, rot: R() * 6 });
      P.villa = { x: (ix + 4) * T, y: (iy + 6) * T };
    } else {
      const r = R();
      if ((district === 'barrio' && r < 0.22) || (district === 'mixto' && r < 0.14) || (district === 'centro' && r < 0.06)) park(ix, iy);
      else if (r < 0.3 && district !== 'deco') lot(ix, iy, false);
      else split(ix, iy, 8, 8, 0, district);
    }
  }
  // playa: palmeras, sombrillas y toallas
  for (let y = 2; y < MH - 2; y++) {
    if (y % 4 === 0) World.deco.push({ t: 'palm', x: 76.5 * T, y: (y + 0.5) * T, rot: R() * 6 });
    if (R() < 0.35) {
      const x = 77.5 + R() * 6;
      if (tAt(Math.floor(x), y) === TL.SAND) World.deco.push({ t: R() < 0.5 ? 'palm' : 'umbrella', x: x * T, y: (y + R()) * T, rot: R() * 6, c: Rp(NEONS) });
    }
  }
  World.bSorted = B.slice().sort((a, b) => a.hgt - b.hgt);
}

// ===== Suelo pre-renderizado =====
function renderGround() {
  const c = document.createElement('canvas'); c.width = MW * T; c.height = MH * T;
  const g = c.getContext('2d'); World.ground = c; World.gctx = g;
  const R = mulberry32(77);
  const base = { [TL.ROAD]: '#2b2539', [TL.WALK]: '#9a8eb2', [TL.BUILD]: '#1b1528', [TL.SAND]: '#f2c894', [TL.GRASS]: '#3e9a6b', [TL.LOT]: '#363049' };
  const speck = { [TL.ROAD]: ['#332c44', '#251f33'], [TL.SAND]: ['#e6b882', '#f8d6a8'], [TL.GRASS]: ['#358a5e', '#4aa978'], [TL.LOT]: ['#3d3752', '#2f2a40'], [TL.WALK]: ['#8f83a8'] };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = tAt(x, y), px = x * T, py = y * T;
    if (t === TL.WATER) {
      let near = 9;
      for (let k = 1; k <= 3 && near === 9; k++)
        for (let d = 0; d < 4; d++) if (tAt(x + DX[d] * k, y + DY[d] * k) !== TL.WATER) { near = k; break; }
      g.fillStyle = near === 1 ? '#25b5bd' : near === 2 ? '#1a96aa' : near === 3 ? '#137a96' : '#0d5d80';
      g.fillRect(px, py, T, T); continue;
    }
    g.fillStyle = base[t]; g.fillRect(px, py, T, T);
    const sp = speck[t];
    if (sp) for (let i = 0; i < 10; i++) { g.fillStyle = sp[i % sp.length]; g.fillRect(px + R() * T, py + R() * T, 2, 2); }
    if (t === TL.WALK) {
      g.fillStyle = '#8a7ea3'; g.fillRect(px, py, T, 1); g.fillRect(px, py, 1, T);
      g.fillStyle = '#ddd5ee';
      if (tAt(x - 1, y) === TL.ROAD) g.fillRect(px, py, 3, T);
      if (tAt(x + 1, y) === TL.ROAD) g.fillRect(px + T - 3, py, 3, T);
      if (tAt(x, y - 1) === TL.ROAD) g.fillRect(px, py, T, 3);
      if (tAt(x, y + 1) === TL.ROAD) g.fillRect(px, py + T - 3, T, 3);
      if (x >= 80 && y >= 37 && y <= 38) { g.fillStyle = '#a77a52'; g.fillRect(px, py, T, T); g.fillStyle = '#8d6442'; for (let k = 0; k < T; k += 6) g.fillRect(px + k, py, 2, T); }
    }
    if (t === TL.SAND) {
      for (let d = 0; d < 4; d++) if (tAt(x + DX[d], y + DY[d]) === TL.WATER) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        if (d === 0) g.fillRect(px + T - 4, py, 4, T); if (d === 2) g.fillRect(px, py, 4, T);
        if (d === 1) g.fillRect(px, py + T - 4, T, 4); if (d === 3) g.fillRect(px, py, T, 4);
      }
      if (R() < 0.06) { // toalla
        g.save(); g.translate(px + 16, py + 16); g.rotate(R() * 3);
        g.fillStyle = pickR(R, NEONS); g.fillRect(-7, -12, 14, 24);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-7, -4, 14, 3); g.fillRect(-7, 4, 14, 3); g.restore();
      }
    }
    if (t === TL.ROAD) {
      const v = isRoadCol(x), h = isRoadRow(y);
      g.fillStyle = '#ffd447';
      if (v && !h && x % 12 === 2) for (let k = 0; k < T; k += 16) g.fillRect(px + T - 1.5, py + k + 3, 3, 9);
      if (h && !v && y % 12 === 2) for (let k = 0; k < T; k += 16) g.fillRect(px + k + 3, py + T - 1.5, 9, 3);
      g.fillStyle = 'rgba(240,235,255,.7)';
      if (v && !h && (isRoadRow(y - 1) || isRoadRow(y + 1))) for (let k = 0; k < 4; k++) g.fillRect(px + 3 + k * 7, py + 5, 4, T - 10);
      if (h && !v && (isRoadCol(x - 1) || isRoadCol(x + 1))) for (let k = 0; k < 4; k++) g.fillRect(px + 5, py + 3 + k * 7, T - 10, 4);
    }
  }
  // líneas de aparcamiento
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
  for (const [ix, iy] of (World.lotRects || [])) for (let k = 0; k <= 8; k++) {
    g.beginPath(); g.moveTo((ix + k) * T, iy * T); g.lineTo((ix + k) * T, (iy + 2) * T);
    g.moveTo((ix + k) * T, (iy + 6) * T); g.lineTo((ix + k) * T, (iy + 8) * T); g.stroke();
  }
  // taller
  const s = World.spray;
  g.fillStyle = '#2b2539'; g.fillRect(s.x, s.y, s.w, s.h);
  for (let k = 0; k < s.h; k += 16) { g.fillStyle = k % 32 ? '#ffd447' : '#1b1528'; g.fillRect(s.x + s.w - 8, s.y + k, 8, 16); }
  buildMini();
}
function pickR(R, arr) { return arr[Math.floor(R() * arr.length)]; }

function buildMini() {
  const k = 4, c = document.createElement('canvas'); c.width = MW * k; c.height = MH * k;
  const g = c.getContext('2d');
  const col = { [TL.WATER]: '#0e4e6a', [TL.ROAD]: '#d9cff2', [TL.WALK]: '#6a5f86', [TL.BUILD]: '#2a2140', [TL.SAND]: '#c9a171', [TL.GRASS]: '#2f7a54', [TL.LOT]: '#4a4364' };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { g.fillStyle = col[tAt(x, y)]; g.fillRect(x * k, y * k, k, k); }
  World.mini = c;
}

// ===== Consultas =====
function los(x1, y1, x2, y2) {
  const n = Math.ceil(dist(x1, y1, x2, y2) / 12);
  for (let i = 1; i < n; i++) { const t = i / n; if (tileW(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t) === TL.BUILD) return false; }
  return true;
}
function buildFlow(wx, wy) {
  const f = World.flow, q = World.flowQ, tl = World.tiles; f.fill(-1);
  const sx = clamp(Math.floor(wx / T), 0, MW - 1), sy = clamp(Math.floor(wy / T), 0, MH - 1);
  let h = 0, n = 0; f[sy * MW + sx] = 0; q[n++] = sy * MW + sx;
  while (h < n) {
    const i = q[h++], x = i % MW, y = (i / MW) | 0, d = f[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const ni = ny * MW + nx;
      if (f[ni] < 0 && !blocked(tl[ni])) { f[ni] = d; q[n++] = ni; }
    }
  }
}
function flowAt(tx, ty) { return (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? -1 : World.flow[ty * MW + tx]; }
function flowNext(x, y, steps) {
  let tx = Math.floor(x / T), ty = Math.floor(y / T);
  for (let s = 0; s < steps; s++) {
    let cur = flowAt(tx, ty), best = -1, bx = tx, by = ty;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const v = flowAt(tx + dx, ty + dy);
      if (v < 0) continue;
      if (dx && dy && (flowAt(tx + dx, ty) < 0 || flowAt(tx, ty + dy) < 0)) continue;
      if (best < 0 || v < best) { best = v; bx = tx + dx; by = ty + dy; }
    }
    if (best < 0 || (cur >= 0 && best >= cur)) break;
    tx = bx; ty = by;
  }
  return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
}
function randWalkNear(x, y, rmin, rmax, avoidView) {
  for (let k = 0; k < 30; k++) {
    const a = rand(Math.PI * 2), r = rand(rmin, rmax), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const t = tileW(px, py);
    if ((t === TL.WALK || t === TL.GRASS || t === TL.SAND) && !(avoidView && inView(px, py, 40))) return { x: px, y: py };
  }
  return null;
}
function inView(x, y, m = 60) { const v = G.view; return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

// ===== Calcomanías permanentes en el suelo =====
function paintBlood(x, y, s = 1) {
  const g = World.gctx; g.fillStyle = 'rgba(120,0,24,.7)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + rand(-6, 6) * s, y + rand(-6, 6) * s, rand(2, 6) * s, 0, 7); g.fill(); }
}
function paintSkid(x1, y1, x2, y2) {
  const g = World.gctx; g.strokeStyle = 'rgba(8,6,14,.25)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function paintScorch(x, y) {
  const g = World.gctx, gr = g.createRadialGradient(x, y, 0, x, y, 46);
  gr.addColorStop(0, 'rgba(10,6,8,.85)'); gr.addColorStop(1, 'rgba(10,6,8,0)');
  g.fillStyle = gr; g.fillRect(x - 46, y - 46, 92, 92);
}
