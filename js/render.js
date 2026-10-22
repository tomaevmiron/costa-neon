'use strict';
// ===== Dibujo del mundo (suelo, edificios en falso 3D, vegetación, luces) =====
const PK = 0.00105; // factor de perspectiva por px de altura

function drawGround(ctx, v) {
  const x0 = Math.max(0, Math.floor(v.x0)), y0 = Math.max(0, Math.floor(v.y0));
  const x1 = Math.min(MW * T, Math.ceil(v.x1)), y1 = Math.min(MH * T, Math.ceil(v.y1));
  if (x1 > x0 && y1 > y0) ctx.drawImage(World.ground, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
}

function drawWaterFx(ctx, v, t) {
  const tx0 = Math.max(0, Math.floor(v.x0 / T)), ty0 = Math.max(0, Math.floor(v.y0 / T));
  const tx1 = Math.min(MW - 1, Math.ceil(v.x1 / T)), ty1 = Math.min(MH - 1, Math.ceil(v.y1 / T));
  ctx.strokeStyle = 'rgba(190,250,255,.28)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (tAt(x, y) !== TL.WATER) continue;
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    if (h % 3) continue;
    const ox = Math.sin(t * 1.3 + h % 17) * 6, oy = (h >> 4) % 26 + 3;
    ctx.moveTo(x * T + 6 + ox, y * T + oy); ctx.lineTo(x * T + 16 + ox, y * T + oy);
  }
  ctx.stroke();
}

function bProj(b, v) {
  const s = 1 + b.hgt * PK;
  return { s, rx: v.cx + (b.x - v.cx) * s, ry: v.cy + (b.y - v.cy) * s, rw: b.w * s, rh: b.h * s };
}
function bVisible(b, v) {
  const m = b.hgt * 0.5 + 40;
  return !(b.x > v.x1 + m || b.x + b.w < v.x0 - m || b.y > v.y1 + m || b.y + b.h < v.y0 - m);
}
function quad(ctx, a, b, c, d, e, f, g, h) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.lineTo(g, h); ctx.closePath(); ctx.fill(); }

function drawShadows(ctx, v) {
  const a = 0.26 * (1 - G.night * 0.7);
  if (a < 0.03) return;
  ctx.fillStyle = `rgba(10,4,24,${a})`;
  for (const b of World.buildings) {
    if (!bVisible(b, v)) continue;
    const ox = b.hgt * 0.32, oy = b.hgt * 0.22, x2 = b.x + b.w, y2 = b.y + b.h;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, b.y); ctx.lineTo(x2 + ox, b.y + oy);
    ctx.lineTo(x2 + ox, y2 + oy); ctx.lineTo(b.x + ox, y2 + oy); ctx.lineTo(b.x, y2); ctx.closePath(); ctx.fill();
  }
}

// líneas de ventanas sobre los muros visibles
function wallLines(ctx, b, p, v) {
  const floors = Math.max(1, Math.floor(b.hgt / 15)), x2 = b.x + b.w, y2 = b.y + b.h, rx2 = p.rx + p.rw, ry2 = p.ry + p.rh;
  ctx.beginPath();
  for (let f = 1; f < floors; f++) {
    const k = f / floors;
    if (v.cy < b.y) { ctx.moveTo(lerp(b.x, p.rx, k), lerp(b.y, p.ry, k)); ctx.lineTo(lerp(x2, rx2, k), lerp(b.y, p.ry, k)); }
    if (v.cy > y2) { ctx.moveTo(lerp(b.x, p.rx, k), lerp(y2, ry2, k)); ctx.lineTo(lerp(x2, rx2, k), lerp(y2, ry2, k)); }
    if (v.cx < b.x) { ctx.moveTo(lerp(b.x, p.rx, k), lerp(b.y, p.ry, k)); ctx.lineTo(lerp(b.x, p.rx, k), lerp(y2, ry2, k)); }
    if (v.cx > x2) { ctx.moveTo(lerp(x2, rx2, k), lerp(b.y, p.ry, k)); ctx.lineTo(lerp(x2, rx2, k), lerp(y2, ry2, k)); }
  }
  ctx.stroke();
}

function drawBuildings(ctx, v) {
  World.vis.length = 0;
  for (const b of World.bSorted) {
    if (!bVisible(b, v)) continue;
    const p = bProj(b, v); World.vis.push([b, p]);
    const x2 = b.x + b.w, y2 = b.y + b.h, rx2 = p.rx + p.rw, ry2 = p.ry + p.rh;
    ctx.fillStyle = b.wall2;
    if (v.cy < b.y) quad(ctx, b.x, b.y, x2, b.y, rx2, p.ry, p.rx, p.ry);
    if (v.cy > y2) quad(ctx, b.x, y2, x2, y2, rx2, ry2, p.rx, ry2);
    ctx.fillStyle = b.wall;
    if (v.cx < b.x) quad(ctx, b.x, b.y, b.x, y2, p.rx, ry2, p.rx, p.ry);
    if (v.cx > x2) quad(ctx, x2, b.y, x2, y2, rx2, ry2, rx2, p.ry);
    ctx.strokeStyle = 'rgba(20,8,40,.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    wallLines(ctx, b, p, v); ctx.setLineDash([]);
    // tejado
    ctx.fillStyle = b.roof; ctx.fillRect(p.rx, p.ry, p.rw, p.rh);
    ctx.strokeStyle = b.wall; ctx.lineWidth = 3; ctx.strokeRect(p.rx + 2, p.ry + 2, p.rw - 4, p.rh - 4);
    for (const d of b.det) drawRoofDetail(ctx, b, p, d);
    if (b.sign) drawSign(ctx, b, p, b.wall2);
  }
}
function drawRoofDetail(ctx, b, p, d) {
  const X = p.rx + (d.x || 0) * p.rw, Y = p.ry + (d.y || 0) * p.rh;
  switch (d.t) {
    case 'box':
      ctx.fillStyle = '#d8d1e6'; ctx.fillRect(X, Y, Math.max(10, d.w * p.rw), Math.max(8, d.h * p.rh));
      ctx.strokeStyle = '#8c84a0'; ctx.lineWidth = 1.5; ctx.strokeRect(X, Y, Math.max(10, d.w * p.rw), Math.max(8, d.h * p.rh)); break;
    case 'pool':
      ctx.fillStyle = '#3fd6f0'; rr(ctx, X, Y, d.w * p.rw, d.h * p.rh, 8); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(X + 6, Y + d.h * p.rh * 0.4); ctx.lineTo(X + d.w * p.rw * 0.5, Y + d.h * p.rh * 0.5); ctx.stroke(); break;
    case 'heli':
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y, Math.min(p.rw, p.rh) * 0.22, 0, 7); ctx.stroke();
      ctx.fillStyle = '#ffe45c'; ctx.font = `bold ${Math.min(p.rw, p.rh) * 0.24 | 0}px Bungee, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', X, Y + 1); break;
    case 'cross': {
      const cx = p.rx + p.rw * 0.5, cy = p.ry + p.rh * 0.5, s = Math.min(p.rw, p.rh) * 0.18;
      ctx.fillStyle = '#ff3b6b'; ctx.fillRect(cx - s, cy - s * 3, s * 2, s * 6); ctx.fillRect(cx - s * 3, cy - s, s * 6, s * 2); break;
    }
    case 'stripes':
      ctx.strokeStyle = 'rgba(40,10,30,.18)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 6; k < p.rh; k += 7) { ctx.moveTo(p.rx + 3, p.ry + k); ctx.lineTo(p.rx + p.rw - 3, p.ry + k); }
      ctx.stroke(); break;
  }
}
function drawSign(ctx, b, p, color) {
  const fs = Math.min(p.rh * 0.36, p.rw / (b.sign.length * 0.78), 26);
  if (fs < 7) return;
  ctx.font = `${fs | 0}px Bungee, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(b.sign, p.rx + p.rw / 2, p.ry + p.rh * (b.det.some(d => d.t === 'cross') ? 0.86 : 0.5));
}

// ===== Vegetación con un toque de altura =====
const _spr = {};
function palmSprite() {
  if (_spr.palm) return _spr.palm;
  const c = document.createElement('canvas'); c.width = c.height = 72; const g = c.getContext('2d');
  g.translate(36, 36);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7);
    g.fillStyle = i % 2 ? '#1f7a4a' : '#2a9a5c';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14, -9, 34, -2); g.quadraticCurveTo(14, 3, 0, 0); g.fill();
  }
  g.fillStyle = '#7a4a24'; g.beginPath(); g.arc(0, 0, 4.5, 0, 7); g.fill();
  g.fillStyle = '#5a3418'; g.beginPath(); g.arc(3, 2, 2.6, 0, 7); g.arc(-2, 3, 2.6, 0, 7); g.fill();
  return (_spr.palm = c);
}
function treeSprite() {
  if (_spr.tree) return _spr.tree;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const blobs = [[32, 32, 22, '#2c7d52'], [24, 26, 12, '#3c9a63'], [40, 28, 11, '#37925d'], [32, 40, 12, '#2f8656'], [28, 30, 6, '#5cc07f']];
  for (const [x, y, r, col] of blobs) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  return (_spr.tree = c);
}
function drawCanopies(ctx, v) {
  const palm = palmSprite(), tree = treeSprite();
  for (const d of World.deco) {
    if (!inView(d.x, d.y, 80)) continue;
    const h = d.t === 'palm' ? 70 : d.t === 'tree' ? 30 : 14, s = 1 + h * PK;
    const cx = v.cx + (d.x - v.cx) * s, cy = v.cy + (d.y - v.cy) * s;
    if (d.t === 'palm') {
      ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(cx, cy); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(d.rot + Math.sin(G.t * 0.8 + d.x) * 0.06); ctx.drawImage(palm, -36, -36); ctx.restore();
    } else if (d.t === 'tree') {
      const k = d.r / 22; ctx.save(); ctx.translate(cx, cy); ctx.rotate(d.rot); ctx.scale(k, k); ctx.drawImage(tree, -32, -32); ctx.restore();
    } else {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(d.rot);
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : d.c; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 15, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.fill(); }
      ctx.restore();
    }
  }
}

// ===== Pasada de luces (se dibuja tras la capa de ambiente) =====
function headSprite() {
  if (_spr.head) return _spr.head;
  const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d');
  const gr = g.createRadialGradient(0, 60, 0, 0, 60, 200);
  gr.addColorStop(0, 'rgba(255,240,190,.75)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 50); g.lineTo(200, 0); g.lineTo(200, 120); g.lineTo(0, 70); g.closePath(); g.fill();
  return (_spr.head = c);
}
function drawNeon(ctx, v, night) {
  if (night < 0.05) return;
  ctx.lineWidth = 2;
  for (const [b, p] of World.vis) {
    ctx.globalAlpha = night * (0.35 + b.lit * 0.5);
    ctx.strokeStyle = '#ffd27a'; ctx.setLineDash([3, 6]); wallLines(ctx, b, p, v); ctx.setLineDash([]);
    ctx.globalAlpha = night; ctx.strokeStyle = b.neon; ctx.lineWidth = 2.5;
    ctx.strokeRect(p.rx + 3, p.ry + 3, p.rw - 6, p.rh - 6);
    ctx.globalAlpha = night * 0.3; ctx.lineWidth = 8; ctx.strokeRect(p.rx + 3, p.ry + 3, p.rw - 6, p.rh - 6);
    ctx.lineWidth = 2;
    if (b.sign) { ctx.globalAlpha = night; drawSign(ctx, b, p, b.neon); }
  }
  ctx.globalAlpha = 1;
}
function drawLamps(ctx, night) {
  if (night < 0.05) return;
  const spr = glowSprite('#ffc27a'); ctx.globalAlpha = night * 0.55;
  for (const l of World.lamps) if (inView(l.x, l.y, 70)) ctx.drawImage(spr, l.x - 70, l.y - 70, 140, 140);
  ctx.globalAlpha = 1;
}
function drawCarLights(ctx, night) {
  const head = headSprite();
  for (const c of G.cars) {
    if (!inView(c.x, c.y, 220) || c.dead) continue;
    const cs = Math.cos(c.a), sn = Math.sin(c.a), h = c.len / 2;
    if (night > 0.05 && c.driver) {
      ctx.globalAlpha = night * 0.8;
      ctx.save(); ctx.translate(c.x + cs * h, c.y + sn * h); ctx.rotate(c.a); ctx.drawImage(head, -4, -60); ctx.restore();
      ctx.globalAlpha = night * 0.7; const red = glowSprite('#ff2a4a');
      ctx.drawImage(red, c.x - cs * h - 14, c.y - sn * h - 14, 28, 28);
    }
    if (c.siren) {
      const ph = Math.floor(G.t * 8) % 2; ctx.globalAlpha = 0.55 + night * 0.4;
      ctx.drawImage(glowSprite(ph ? '#ff2a4a' : '#2a7bff'), c.x - 50, c.y - 50, 100, 100);
    }
  }
  ctx.globalAlpha = 1;
}
