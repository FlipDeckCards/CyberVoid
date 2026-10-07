// Generates ALL of Feral 2.0's sprite art (original, drawn in code) as transparent PNG sheets and writes art/manifest.json. Local tool only.
// In the page (http://localhost:5173/feral2/):  load /__dev/make-art.js  ->  await DZArt.all()      (every file is saved under public/feral2/art/ by the local test server)
(function () {
  const TAU = Math.PI * 2, OUT = '#1a0d2e';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- drawing helpers (origin = bottom centre of the frame, y up is negative) ----------
  function path(x, fn) { x.beginPath(); fn(x); }
  function ell(x, cx, cy, rx, ry, fill, stroke, lw, rot) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 3; x.stroke(); } }
  function rg(x, cx, cy, r0, r1, c0, c1) { const g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function lg(x, x0, y0, x1, y1, c0, c1) { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function shine(x, cx, cy, rx, ry, a, rot) { ell(x, cx, cy, rx, ry, 'rgba(255,255,255,' + (a == null ? 0.35 : a) + ')', null, 0, rot); }
  function poly(x, pts, fill, stroke, lw) { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 3; x.lineJoin = 'round'; x.stroke(); } }
  function line(x, a, b, c, d, col, w) { x.strokeStyle = col; x.lineWidth = w || 2; x.lineCap = 'round'; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); }
  function eye(x, cx, cy, r, glow, look, shut) {
    if (shut) { line(x, cx - r, cy, cx + r, cy, OUT, 3); return; }
    ell(x, cx, cy, r, r * 1.1, '#fff', OUT, 2.5); ell(x, cx + look * r * 0.35, cy + r * 0.05, r * 0.55, r * 0.7, glow || '#2a0c3a'); ell(x, cx + look * r * 0.35, cy + r * 0.05, r * 0.25, r * 0.4, '#0a0414'); ell(x, cx - r * 0.35, cy - r * 0.4, r * 0.22, r * 0.22, '#fff');
  }

  // a pose bundle every creature draw function understands
  function pose(o) { return Object.assign({ sx: 1, sy: 1, dx: 0, dy: 0, lean: 0, mouth: 0, hurt: 0, foot: 0, t: 0, atk: 0, death: 0, shut: 0, glow: 0 }, o); }
  function wrap(size, draw, p, scale) {
    const c = cv(size, size), x = c.getContext('2d'), k = scale || size / 128;
    x.translate(size / 2 + p.dx * k, size - 14 * k + p.dy * k); x.scale(k, k);
    if (p.death > 0) {                                           // collapse into a puddle of goo that fades
      const d = p.death; x.save(); x.globalAlpha = clamp(1.4 - d * 1.1, 0, 1); ell(x, 0, -2, 14 + 44 * d, 4 + 9 * d, 'rgba(120,255,92,0.55)', 'rgba(40,120,40,0.5)', 2); x.restore();
    }
    x.save(); x.rotate(p.lean); x.scale(p.sx * (1 + p.death * 0.45), p.sy * (1 - p.death * 0.78)); x.globalAlpha = p.death > 0.55 ? clamp(1 - (p.death - 0.55) * 2.2, 0, 1) : 1;
    draw(x, p); x.restore();
    if (p.hurt) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(0, 0, size, size); }
    return c;
  }

  // ---------- creatures (all drawn facing the viewer; every size is for a 128 frame, bosses are drawn at 2x) ----------
  function drawGlumpkin(x, p) {
    const bob = Math.sin(p.t * TAU) * 2;
    ell(x, -16 + p.foot * 5, -4, 13, 7, '#7a3a1a', OUT, 3); ell(x, 16 - p.foot * 5, -4, 13, 7, '#7a3a1a', OUT, 3);                       // feet
    const cy = -40 + bob; ell(x, 0, cy, 47, 40 - bob * 0.3, rg(x, -12, cy - 14, 6, 52, '#ffb04a', '#cf5f12'), OUT, 4);
    x.save(); path(x, (c) => c.ellipse(0, cy, 47, 40, 0, 0, TAU)); x.clip();
    for (const k of [-24, 0, 24]) { x.strokeStyle = 'rgba(160,70,10,0.55)'; x.lineWidth = 3; x.beginPath(); x.ellipse(k, cy, 14, 40, 0, 0, TAU); x.stroke(); }
    ell(x, 30, cy - 4, 26, 36, 'rgba(70,120,96,0.9)');                                                                                       // the grey-green zombie side
    for (let i = -3; i <= 3; i++) line(x, 20, cy - 16 + i * 5, 34, cy - 14 + i * 5, '#27382f', 2);                                          // stitches
    x.restore();
    shine(x, -22, cy - 24, 12, 6, 0.4, -0.5);
    x.fillStyle = '#3f8a3a'; x.strokeStyle = OUT; x.lineWidth = 3; x.beginPath(); x.roundRect ? x.roundRect(-6, cy - 56, 12, 20, 4) : x.rect(-6, cy - 56, 12, 20); x.fill(); x.stroke();      // stem
    x.strokeStyle = '#3f8a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(5, cy - 52); x.quadraticCurveTo(24, cy - 62, 20, cy - 46); x.stroke();
    // eyes
    ell(x, -14, cy - 6, 12, 13, '#f4ffbc', OUT, 3); ell(x, -14, cy - 5, 8, 9.5, '#b9ff2e'); ell(x, -13, cy - 4, 2.6, 6.5, '#12040e'); shine(x, -17, cy - 9, 3, 3, 0.8);
    if (p.shut) line(x, -24, cy - 6, -4, cy - 6, OUT, 4); else { line(x, 10, cy - 14, 24, cy - 2, OUT, 4); line(x, 24, cy - 14, 10, cy - 2, OUT, 4); }
    // mouth
    const my = cy + 16, mo = 8 + p.mouth * 14; x.beginPath(); x.moveTo(-26, my - 2); x.quadraticCurveTo(0, my + mo, 26, my - 2); x.quadraticCurveTo(0, my + 1, -26, my - 2); x.fillStyle = '#2a0c1a'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 3; x.stroke();
    for (let i = 0; i < 5; i++) poly(x, [-22 + i * 11, my - 1, -14 + i * 11, my - 1, -18 + i * 11, my + 7], '#fff3c8', OUT, 1.5);
    ell(x, -8, my + mo * 0.9 + 6, 3, 5 + Math.sin(p.t * TAU) * 2, '#7dff5c');                                                                // ooze
  }
  function drawZapling(x, p) {
    const bob = Math.sin(p.t * TAU) * 2, w = Math.sin(p.t * TAU * 1.5);
    for (const k of [-14, 0, 14]) line(x, k, -6, k * 1.5, 1, '#2f6a2a', 4);                                                                     // root feet
    ell(x, -28, -66 + bob + w * 3, 22, 9, rg(x, -28, -66, 2, 24, '#7cf08a', '#2f9a4a'), OUT, 3, -0.7 + w * 0.15); ell(x, 28, -66 + bob - w * 3, 22, 9, rg(x, 28, -66, 2, 24, '#7cf08a', '#2f9a4a'), OUT, 3, 0.7 - w * 0.15);
    ell(x, 0, -34 + bob, 32 + p.atk * 6, 29 - p.atk * 5, rg(x, -8, -44, 4, 40, '#9dffa8', '#2fae56'), OUT, 4); ell(x, 0, -24 + bob, 22, 14, 'rgba(210,255,215,0.55)'); shine(x, -14, -48 + bob, 9, 5, 0.45, -0.4);
    const j = Math.sin(p.t * TAU * 3) * 2.5; eye(x, -12, -36 + bob, 11 + p.atk * 3, '#1a0a30', j / 4, p.shut); eye(x, 13, -36 + bob, 11 + p.atk * 3, '#1a0a30', j / 4, p.shut);
    x.strokeStyle = OUT; x.lineWidth = 3; x.beginPath(); x.moveTo(-10, -14 + bob); x.lineTo(-4, -9 + bob); x.lineTo(2, -14 + bob); x.lineTo(8, -9 + bob); x.stroke();
    x.strokeStyle = p.atk > 0.3 ? '#ffffff' : '#fff04a'; x.lineWidth = 3; x.beginPath(); x.moveTo(-18, -62 + bob); x.lineTo(-8, -72 + bob - (p.t > 0.5 ? 4 : 0)); x.lineTo(-2, -60 + bob); x.lineTo(8, -74 + bob); x.lineTo(18, -62 + bob); x.stroke();   // static
  }
  function drawWisper(x, p) {
    const w = Math.sin(p.t * TAU) * 3, cy = -46 + Math.sin(p.t * TAU) * 3; x.save(); x.globalAlpha *= 0.9;
    x.beginPath(); x.moveTo(-32, cy + 6); x.bezierCurveTo(-34, cy - 56, 34, cy - 56, 32, cy + 6); x.lineTo(32, cy + 40 + w);
    for (let i = 0; i < 5; i++) x.quadraticCurveTo(32 - (i + 0.5) * 12.8, cy + 40 + (i & 1 ? 14 : -6) + (i & 1 ? w : -w), 32 - (i + 1) * 12.8, cy + 40 + (i & 1 ? -w : w)); x.lineTo(-32, cy + 6); x.closePath();
    x.fillStyle = lg(x, 0, cy - 50, 0, cy + 50, '#f2f7ff', '#9fb4ff'); x.fill(); x.strokeStyle = OUT; x.lineWidth = 3.5; x.stroke(); shine(x, -12, cy - 28, 14, 7, 0.55, -0.4);
    ell(x, -13, cy - 8, 8.5, 12, '#220c44', OUT, 2); ell(x, 13, cy - 8, 8.5, 12, '#220c44', OUT, 2); ell(x, -13, cy - 6, 4, 6.5, '#e08aff'); ell(x, 13, cy - 6, 4, 6.5, '#e08aff');
    ell(x, 0, cy + 16, 7, 6 + p.mouth * 10 + Math.sin(p.t * TAU) * 1.5, '#220c44', OUT, 2);
    ell(x, 0, cy - 62, 6 + Math.sin(p.t * TAU * 2), 10, '#8fe8ff', OUT, 2); ell(x, 0, cy - 59, 3, 5, '#e6fbff'); x.restore();
  }
  function drawMoss(x, p, boss) {
    const bob = Math.sin(p.t * TAU) * 2, f = p.foot, cy = -42 + bob, k = boss ? 1 : 1;
    for (const [lx, fl] of [[-34, 1], [-12, -1], [12, 1], [34, -1]]) ell(x, lx, -7, 12, 8 + fl * f * 2, '#3a5236', OUT, 3);
    ell(x, 0, cy, 56, 37, rg(x, -12, cy - 14, 8, 62, '#79a063', '#3f5d3d'), OUT, 4); ell(x, 0, cy + 22, 44, 12, '#34503a');
    for (const [mx, my, r] of [[-26, -18, 13], [10, -26, 17], [32, -10, 11], [-4, -6, 9], [-38, 0, 8]]) ell(x, mx, cy + my, r, r * 0.62, rg(x, mx, cy + my, 1, r, '#b6f08a', '#5f9a4a'));
    for (const [mx, my] of [[-26, -34], [20, -40]]) { x.fillStyle = '#efe2c4'; x.strokeStyle = OUT; x.lineWidth = 2; x.beginPath(); x.rect(mx - 3, cy + my, 6, 14); x.fill(); x.stroke(); ell(x, mx, cy + my, 11, 7, '#e0475a', OUT, 2.5); ell(x, mx - 3, cy + my - 2, 2, 1.6, '#fff'); ell(x, mx + 4, cy + my, 1.8, 1.4, '#fff'); }
    line(x, -8, cy - 10, -3, cy + 4, '#2d4033', 2); line(x, 24, cy - 12, 20, cy, '#2d4033', 2);
    const open = 14 + p.mouth * 14; x.beginPath(); x.moveTo(-34, cy + 4); x.quadraticCurveTo(0, cy + 4 + open * 1.6, 34, cy + 4); x.lineTo(34, cy + 2); x.quadraticCurveTo(0, cy - 2, -34, cy + 2); x.closePath(); x.fillStyle = '#25101c'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 3; x.stroke();
    for (let i = 0; i < 6; i++) poly(x, [-30 + i * 11, cy + 3, -22 + i * 11, cy + 3, -26 + i * 11, cy + 16], '#fff3c8', OUT, 1.5);
    for (let i = 0; i < 5; i++) poly(x, [-24 + i * 12, cy + 4 + open * 1.2, -16 + i * 12, cy + 4 + open * 1.2, -20 + i * 12, cy - 8 + open * 1.2 + 6], '#fff3c8', OUT, 1.5);
    eye(x, -20, cy - 14, 10, '#ff2a2a', 0, false); eye(x, 20, cy - 14, 10, '#ff2a2a', 0, false);
    line(x, -34, cy - 30, -10, cy - 20, OUT, 5); line(x, 34, cy - 30, 10, cy - 20, OUT, 5);
    if (boss) {                                                                                                                                // crown of dead branches and glowing runes
      for (const [bx, by, ex, ey] of [[-40, -22, -52, -46], [-20, -34, -26, -56], [6, -36, 8, -58], [30, -30, 44, -52], [48, -16, 58, -36]]) { line(x, bx, cy + by, ex, cy + ey, '#5a3d24', 6); line(x, ex, cy + ey, ex + 8, cy + ey - 10, '#5a3d24', 4); }
      for (const [rx, ry] of [[-40, 10], [40, 10], [0, 26]]) { ell(x, rx, cy + ry, 6, 6, '#c8ffa0', '#5ac03a', 2); ell(x, rx, cy + ry, 12, 12, 'rgba(160,255,120,0.25)'); }
    }
    void k;
  }
  function drawBoomkit(x, p) {
    const bob = Math.abs(Math.sin(p.t * TAU)) * 3, cy = -34 - bob, pulse = 0.5 + 0.5 * Math.sin(p.t * TAU * 2);
    ell(x, -14, -5, 9, 6, '#2a2040', OUT, 3); ell(x, 14, -5, 9, 6, '#2a2040', OUT, 3);
    poly(x, [-30, cy - 12, -26, cy - 46, -10, cy - 26], '#3a2c52', OUT, 3.5); poly(x, [30, cy - 12, 26, cy - 46, 10, cy - 26], '#3a2c52', OUT, 3.5); poly(x, [-26, cy - 22, -25, cy - 38, -16, cy - 26], '#ff7aa8'); poly(x, [26, cy - 22, 25, cy - 38, 16, cy - 26], '#ff7aa8');
    ell(x, 0, cy, 34, 30, rg(x, -8, cy - 10, 4, 38, '#6a549a', '#2e2348'), OUT, 4); shine(x, -14, cy - 16, 9, 5, 0.3, -0.4);
    if (p.atk > 0) ell(x, 0, cy, 30, 26, 'rgba(255,60,40,' + (0.25 + 0.4 * pulse) + ')');
    eye(x, -12, cy - 4, 11, '#1a0a30', 0, p.shut); eye(x, 12, cy - 4, 11, '#1a0a30', 0, p.shut); ell(x, -22, cy + 10, 7, 4.5, 'rgba(255,122,168,0.85)'); ell(x, 22, cy + 10, 7, 4.5, 'rgba(255,122,168,0.85)');
    x.strokeStyle = OUT; x.lineWidth = 3; x.beginPath(); x.moveTo(-6, cy + 14); x.quadraticCurveTo(0, cy + 22 + p.mouth * 8, 6, cy + 14); x.stroke();
    line(x, 0, cy - 28, 10, cy - 52, '#7a6a3a', 4); ell(x, 10, cy - 54, 6 + pulse * 2, 6 + pulse * 2, pulse > 0.5 ? '#fff0a0' : '#ff9a30', OUT, 2); ell(x, 10, cy - 54, 14, 14, 'rgba(255,180,60,0.28)');
  }
  function drawSpitbud(x, p) {
    const sw = Math.sin(p.t * TAU) * 4, open = 4 + p.mouth * 14 + p.atk * 8;
    x.strokeStyle = OUT; x.fillStyle = '#3b9a46'; x.lineWidth = 3; x.beginPath(); x.moveTo(-5 + sw * 0.3, 0); x.lineTo(5 + sw * 0.3, 0); x.lineTo(5 + sw, -58); x.lineTo(-5 + sw, -58); x.closePath(); x.fill(); x.stroke();
    ell(x, -22, -22, 20, 7, '#4fae5a', OUT, 3, -0.45); ell(x, 24, -16, 20, 7, '#4fae5a', OUT, 3, 0.45);
    const hx = sw, hy = -78;
    for (const a of [-1.25, -0.65, 0, 0.65, 1.25]) ell(x, hx + Math.sin(a) * 28, hy + 14 - Math.cos(a) * 14 + Math.abs(a) * 8, 14, 26, rg(x, hx + Math.sin(a) * 28, hy, 2, 28, a === 0 ? '#ffa0ea' : '#ff6ad8', '#b02e96'), OUT, 3, a);
    ell(x, hx, hy + 6, 22 + open * 0.3, 16 + open, '#7a1f6a', OUT, 3); ell(x, hx, hy + 8, 17 + open * 0.25, 12 + open * 0.9, '#2a0c2a');
    for (const dx of [-10, 0, 10]) poly(x, [hx + dx - 3, hy - 4, hx + dx + 3, hy - 4, hx + dx, hy + 6], '#fff3c8', OUT, 1.5);
    ell(x, hx, hy + 14 + open * 0.4, 4, 4, '#f9ff7a'); ell(x, hx - 8, hy + 17, 2.6, 2.6, '#f9ff7a'); ell(x, hx + 7, hy + 18, 2.2, 2.2, '#f9ff7a'); ell(x, hx, hy + 14 + open * 0.4, 12, 12, 'rgba(249,255,122,0.25)');
    eye(x, hx - 15, hy - 18, 6, '#1a0a30', 0, false); eye(x, hx + 15, hy - 18, 6, '#1a0a30', 0, false);
  }
  const CREATURES = {
    glumpkin: { draw: drawGlumpkin, size: 128, height: 2.3, hover: 0 },
    zapling: { draw: drawZapling, size: 128, height: 1.9, hover: 0 },
    wisper: { draw: drawWisper, size: 128, height: 2.6, hover: 0.7 },
    mossmaw: { draw: (x, p) => drawMoss(x, p, false), size: 128, height: 3.4, hover: 0 },
    boomkit: { draw: drawBoomkit, size: 128, height: 1.7, hover: 0 },
    spitbud: { draw: drawSpitbud, size: 128, height: 2.7, hover: 0 },
    elder: { draw: (x, p) => drawMoss(x, p, true), size: 256, height: 6.2, hover: 0, scale: 2 },
  };
  // animation recipes (rows of a sheet): idle 2, walk 4, attack 3, hurt 1, death 4
  const ANIMS = [
    ['idle', 2, 3, true, (i) => pose({ t: i / 2, sy: 1 + (i ? 0.03 : 0), sx: 1 - (i ? 0.02 : 0) })],
    ['walk', 4, 8, true, (i) => pose({ t: i / 4, foot: [-1, 0, 1, 0][i], dy: -Math.abs(Math.sin(i / 4 * Math.PI * 2)) * 2, lean: [0.04, 0, -0.04, 0][i] })],
    ['attack', 3, 10, false, (i) => pose({ t: i / 3, atk: [0.4, 1, 0.3][i], mouth: [0.3, 1, 0.5][i], sy: [0.94, 1.1, 1][i], sx: [1.06, 0.94, 1][i], dy: [1, -4, 0][i] })],
    ['hurt', 1, 8, false, () => pose({ hurt: 1, shut: 1, sx: 1.12, sy: 0.88, lean: -0.1, mouth: 0.6 })],
    ['death', 4, 7, false, (i) => pose({ death: [0.15, 0.4, 0.7, 0.95][i], lean: [-0.15, -0.3, -0.2, 0][i], mouth: 0.8, shut: 1, hurt: i === 0 ? 1 : 0 })],
  ];
  function creatureSheet(name) {
    const d = CREATURES[name], S = d.size, sheet = cv(S * 4, S * ANIMS.length), x = sheet.getContext('2d');
    ANIMS.forEach(([an, n, , , fn], row) => { for (let i = 0; i < n; i++) x.drawImage(wrap(S, d.draw, fn(i), d.scale), i * S, row * S); });
    return sheet;
  }

  // ---------- first-person weapons (frames are 192x192, bottom-centre = the hands) ----------
  const WV = 192;
  function sleeve(x, side, lift) {          // a yellow raincoat sleeve and a cream glove coming up from the bottom corner
    const sx = side * 70, ex = side * 24, ey = -64 - lift;
    x.save(); x.strokeStyle = OUT; x.lineWidth = 3;
    x.beginPath(); x.moveTo(sx - 18, 0); x.lineTo(sx + 18, 0); x.lineTo(ex + 14, ey + 10); x.lineTo(ex - 14, ey + 10); x.closePath(); x.fillStyle = lg(x, sx, 0, ex, ey, '#ffcf3a', '#ffe27a'); x.fill(); x.stroke();
    ell(x, ex, ey, 17, 15, '#f6e6c8', OUT, 3); shine(x, ex - 5, ey - 5, 6, 4, 0.5); x.restore();
  }
  const GUNS = {
    pip: (x, k) => { ell(x, 0, -44, 26, 36, lg(x, -26, -44, 26, -44, '#2f7e8e', '#5fd0e0'), OUT, 3.5); ell(x, 0, -92, 11, 11, '#1d4a56', OUT, 3); ell(x, 0, -92, 6, 6, '#0a1a20'); ell(x, 0, -100, 13, 6, '#ffe27a', OUT, 2.5); rect3(x, -3, -122, 6, 10, '#ffe27a'); shine(x, -10, -56, 6, 18, 0.35); },
    rattle: (x, k) => { ell(x, 0, -48, 24, 40, lg(x, -24, -48, 24, -48, '#3f7a30', '#7fd16a'), OUT, 3.5); ell(x, -12, -112, 7, 8, '#2a4a24', OUT, 3); ell(x, 12, -112, 7, 8, '#2a4a24', OUT, 3); rect3(x, -14, -112, 28, 40, '#3a6a2a'); ell(x, 36, -42, 17, 22, '#2a4a24', OUT, 3); ell(x, 36, -42, 11, 16, '#4a7a3a'); for (const [vx, vy] of [[-12, -60], [10, -80], [-6, -92]]) ell(x, vx, vy, 5, 3, '#b6ff8a', OUT, 1.5, 0.6); },
    scatter: (x, k) => { ell(x, 0, -40, 34, 32, rg(x, -10, -52, 4, 44, '#ffb35c', '#cf6a1a'), OUT, 3.5); for (const kx of [-16, 0, 16]) { x.strokeStyle = 'rgba(150,70,10,0.6)'; x.lineWidth = 3; x.beginPath(); x.ellipse(kx, -40, 8, 30, 0, 0, TAU); x.stroke(); } rect3(x, -16, -118, 32, 56, '#8a5a2a'); ell(x, 0, -118, 17, 9, '#3a2410', OUT, 3); ell(x, 0, -118, 10, 5, '#0a0604'); rect3(x, -3, -50, 6, 16, '#3f7d3a'); },
    longthorn: (x, k) => { rect3(x, -10, -134, 20, 84, '#c24a8a'); rect3(x, -10, -134, 8, 84, '#ff7ab8'); ell(x, 0, -134, 10, 6, '#3a1028', OUT, 3); ell(x, 0, -48, 20, 28, lg(x, -20, -48, 20, -48, '#8a2a5a', '#d85a9a'), OUT, 3.5); for (const ty of [-66, -90, -114]) { poly(x, [-10, ty, -22, ty - 8, -10, ty - 14], '#fff0f6', OUT, 2); poly(x, [10, ty, 22, ty - 8, 10, ty - 14], '#fff0f6', OUT, 2); } rect3(x, -6, -122, 12, 22, '#5a2a4a'); },
    bubble: (x, k) => { rect3(x, -22, -102, 44, 66, '#2a8aaa'); rect3(x, -22, -102, 14, 66, '#7fe6ff'); ell(x, 0, -102, 32, 14, '#9ff0ff', OUT, 3.5); ell(x, 0, -104, 22, 8, '#0f4a5a'); ell(x, 0, -56, 28, 24, lg(x, -28, -56, 28, -56, '#2a7a9a', '#5fd0e8'), OUT, 3.5); const br = 8 + k.charge * 22; ell(x, 0, -110 - br * 0.4, br, br, 'rgba(160,240,255,0.35)', '#d8fbff', 2.5); shine(x, -br * 0.3, -112 - br * 0.6, br * 0.3, br * 0.18, 0.7); },
    sunbeam: (x, k) => { rect3(x, -14, -100, 28, 60, '#c08a1a'); rect3(x, -14, -100, 10, 60, '#ffd84a'); ell(x, 0, -118, 30, 30, rg(x, 0, -118, 4, 32, '#fffbd0', '#ffb300'), OUT, 3.5); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; line(x, Math.cos(a) * 32, -118 + Math.sin(a) * 32, Math.cos(a) * 46, -118 + Math.sin(a) * 46, '#ffd84a', 4); } ell(x, 0, -118, 12, 12, '#fff'); ell(x, 0, -50, 22, 26, lg(x, -22, -50, 22, -50, '#8a5a10', '#d8a82a'), OUT, 3.5); },
    party: (x, k) => { poly(x, [-12, -48, 12, -48, 34, -142, -34, -142], lg(x, 0, -48, 0, -142, '#c43aa6', '#ff8ae6'), OUT, 3.5); ell(x, 0, -142, 34, 10, '#ffd0f4', OUT, 3.5); ell(x, 0, -142, 24, 6, '#5a1a4a'); for (const [cx, cy, c] of [[-8, -80, '#7fe6ff'], [8, -100, '#ffe27a'], [-4, -118, '#9dff8a'], [12, -68, '#fff']]) ell(x, cx, cy, 4, 4, c); ell(x, 0, -46, 20, 18, '#8a2a7a', OUT, 3.5); for (const [rx, ry, c] of [[-30, -60, '#7fe6ff'], [32, -74, '#ffe27a']]) { x.strokeStyle = c; x.lineWidth = 4; x.beginPath(); x.moveTo(rx * 0.5, ry); x.quadraticCurveTo(rx, ry - 14, rx * 1.1, ry + 14); x.stroke(); } },
  };
  function rect3(x, a, b, w, h, fill) { x.fillStyle = fill; x.fillRect(a, b, w, h); x.strokeStyle = OUT; x.lineWidth = 3; x.strokeRect(a, b, w, h); }
  const MUZZLE = { pip: -128, rattle: -122, scatter: -124, longthorn: -140, bubble: -134, sunbeam: -150, party: -148 };
  function flash(x, id, k) {
    const y = MUZZLE[id], r = [0, 36, 24][k] || 0; if (!r) return;
    ell(x, 0, y, r * 1.1, r * 1.1, 'rgba(255,220,120,0.14)'); const sp = 8; x.fillStyle = k === 1 ? '#fff6c0' : '#ffd24a'; x.beginPath();
    for (let i = 0; i < sp * 2; i++) { const a = i / (sp * 2) * TAU, rr = i % 2 ? r * 0.45 : r; x.lineTo(Math.cos(a) * rr, y + Math.sin(a) * rr); } x.closePath(); x.fill(); ell(x, 0, y, r * 0.35, r * 0.35, '#fff');
  }
  function weaponFrame(id, anim, i) {
    const c = cv(WV, WV), x = c.getContext('2d'); x.translate(WV / 2, WV - 2); x.scale(1.18, 1.18); let dy = 0, rot = 0, lift = 0, charge = 0.3;
    if (anim === 'fire') { dy = [8, 4, 1][i]; rot = [0.02, 0.01, 0][i]; charge = 0.1; }
    else if (anim === 'reload') { dy = [10, 44, 52, 22][i]; rot = [-0.08, -0.35, -0.4, -0.12][i]; lift = [0, 8, 14, 4][i]; }
    sleeve(x, -1, lift); sleeve(x, 1, lift);
    x.save(); x.translate(0, dy); x.rotate(rot); GUNS[id](x, { charge }); if (anim === 'fire') flash(x, id, i); x.restore();
    if (anim === 'reload' && (i === 1 || i === 2)) { ell(x, 42, -26 - lift, 12, 18, '#d8d0c0', OUT, 3); ell(x, 42, -30 - lift, 8, 8, '#8a8070'); }          // the spare magazine / shell in the other hand
    return c;
  }
  function weaponSheet(id) {
    const sheet = cv(WV * 4, WV * 3), x = sheet.getContext('2d');
    x.drawImage(weaponFrame(id, 'idle', 0), 0, 0); for (let i = 0; i < 3; i++) x.drawImage(weaponFrame(id, 'fire', i), i * WV, WV); for (let i = 0; i < 4; i++) x.drawImage(weaponFrame(id, 'reload', i), i * WV, WV * 2);
    return sheet;
  }
  // a side view for the wall posters, the chest and the HUD (192x96)
  function weaponIcon(id) {
    const c = cv(192, 96), x = c.getContext('2d'); x.translate(96, 48); x.rotate(-Math.PI / 2); x.scale(0.62, 0.62); x.translate(0, 70);
    GUNS[id](x, { charge: 0.5 }); return c;
  }

  // ---------- pickups, perk icons, effects ----------
  function pickupAmmo(x) { ell(x, 0, -62, 30, 34, rg(x, -10, -74, 4, 40, '#e8a868', '#9a5a22'), OUT, 4); rect3(x, -14, -100, 28, 18, '#6a4a22'); line(x, 0, -100, 6, -116, '#3f7d3a', 6); ell(x, 12, -80, 7, 4, '#3f7d3a', OUT, 2, -0.5); shine(x, -12, -76, 6, 12, 0.5, -0.4); }
  function star(x, cx, cy, R, fill) { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); x.fillStyle = fill; x.fill(); x.strokeStyle = OUT; x.lineWidth = 4; x.lineJoin = 'round'; x.stroke(); }
  function pickupTwin(x) { star(x, -18, -84, 34, rg(x, -22, -90, 2, 38, '#fff6b0', '#f0b400')); star(x, 22, -46, 34, rg(x, 18, -52, 2, 38, '#fff6b0', '#f0b400')); }
  function pickupBoom(x) { ell(x, 0, -52, 36, 34, rg(x, -10, -64, 4, 44, '#ff8aa0', '#d0224a'), OUT, 4); rect3(x, -4, -92, 8, 14, '#6a4a22'); ell(x, 16, -100, 9, 9, '#ffb347', OUT, 3); ell(x, 16, -100, 4, 4, '#fff0a0'); ell(x, -22, -92, 14, 6, '#3f7d3a', OUT, 2.5, -0.3); shine(x, -14, -66, 8, 12, 0.5, -0.5); }
  function pickupZap(x) { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ell(x, Math.cos(a) * 30, -64 + Math.sin(a) * 30, 20, 11, rg(x, Math.cos(a) * 30, -64 + Math.sin(a) * 30, 1, 20, '#dcc2ff', '#8a5ae0'), OUT, 3, a); } ell(x, 0, -64, 20, 20, rg(x, 0, -64, 1, 20, '#fffbd0', '#ffcf3a'), OUT, 3.5); poly(x, [4, -78, -8, -62, 0, -62, -6, -48, 10, -66, 2, -66], '#2a1050'); }
  const PICKUPS = { ammo: pickupAmmo, twin: pickupTwin, boom: pickupBoom, zap: pickupZap };
  function icon96(draw) { const c = cv(96, 96), x = c.getContext('2d'); x.translate(48, 90); x.scale(0.75, 0.75); draw(x); return c; }
  const PERKS = {
    heart: (x) => { ell(x, -20, -72, 24, 24, rg(x, -26, -80, 2, 28, '#ff9ab8', '#e0356f'), OUT, 4); ell(x, 20, -72, 24, 24, rg(x, 14, -80, 2, 28, '#ff9ab8', '#e0356f'), OUT, 4); poly(x, [-42, -62, 42, -62, 0, -4], '#e0356f', OUT, 4); ell(x, -18, -72, 24, 24, null); poly(x, [-40, -66, 40, -66, 0, -8], '#ff5d8f'); shine(x, -20, -84, 8, 5, 0.6, -0.5); },
    fizz: (x) => { rect3(x, -22, -90, 44, 86, '#5dd6ff'); rect3(x, -22, -90, 14, 86, '#b8f2ff'); rect3(x, -12, -118, 24, 28, '#e8c27a'); rect3(x, -16, -128, 32, 12, '#b8423a'); for (const [bx, by] of [[6, -60], [-4, -36], [8, -24]]) ell(x, bx, by, 4, 4, '#fff'); },
    boots: (x) => { rect3(x, -26, -112, 30, 76, '#e8a81a'); rect3(x, -26, -112, 10, 76, '#ffd24a'); poly(x, [-26, -44, 40, -36, 40, -8, -26, -8], '#e8a81a', OUT, 3.5); rect3(x, -26, -14, 66, 10, '#5a3a1a'); poly(x, [-4, -92, 24, -92, 10, -66], '#fff', OUT, 2); },
    lamp: (x) => { rect3(x, -4, -124, 8, 18, '#8a6a4a'); rect3(x, -26, -110, 52, 12, '#6a4a2a'); ell(x, 0, -58, 32, 40, rg(x, 0, -58, 2, 36, '#fff6c0', '#ff9a2a'), OUT, 4); rect3(x, -26, -20, 52, 12, '#6a4a2a'); ell(x, 0, -58, 44, 52, 'rgba(255,170,60,0.22)'); },
  };
  const FX = {
    bubble: [128, (x) => { ell(x, 0, -64, 50, 50, 'rgba(150,235,255,0.35)', '#d8fbff', 4); shine(x, -18, -84, 16, 8, 0.8, -0.6); ell(x, 14, -40, 4, 4, 'rgba(255,255,255,0.7)'); }],
    spore: [64, (x) => { ell(x, 0, -32, 18, 18, rg(x, 0, -32, 1, 22, '#fdffb0', '#f0f040'), 'rgba(255,255,160,0.5)', 3); ell(x, 0, -32, 28, 28, 'rgba(249,255,122,0.22)'); }],
    spark: [64, (x) => { star(x, 0, -32, 24, rg(x, 0, -32, 1, 26, '#ffffff', '#ffe27a')); }],
    splat: [128, (x) => { ell(x, 0, -50, 52, 40, 'rgba(120,255,92,0.8)', 'rgba(30,120,30,0.9)', 3); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3; ell(x, Math.cos(a) * 52, -50 + Math.sin(a) * 40, 8, 8, 'rgba(120,255,92,0.8)'); } shine(x, -16, -64, 14, 8, 0.4, -0.4); }],
    decal: [64, (x) => { ell(x, 0, -32, 18, 18, 'rgba(10,6,16,0.85)'); ell(x, 0, -32, 9, 9, 'rgba(0,0,0,0.95)'); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; line(x, Math.cos(a) * 10, -32 + Math.sin(a) * 10, Math.cos(a) * 24, -32 + Math.sin(a) * 24, 'rgba(10,6,16,0.6)', 2); } }],
  };
  function fxSheet(size, draw) { const c = cv(size, size), x = c.getContext('2d'); x.translate(size / 2, size - 2); x.scale(size / 128, size / 128); draw(x); return c; }

  // ---------- save ----------
  function save(canvas, rel) { return new Promise((res) => canvas.toBlob((b) => fetch('/__save?path=' + encodeURIComponent(rel), { method: 'POST', body: b }).then((r) => r.text()).then(res), 'image/png')); }
  function saveText(text, rel) { return fetch('/__save?path=' + encodeURIComponent(rel), { method: 'POST', body: text }).then((r) => r.text()); }

  const SIZES = { glumpkin: 2.3, zapling: 1.9, wisper: 2.6, mossmaw: 3.4, boomkit: 1.7, spitbud: 2.7, elder: 6.2 };
  function manifest() {
    const anim = (row, frames, fps, loop) => ({ row, frames, fps, loop });
    const creatures = {};
    for (const [name, d] of Object.entries(CREATURES)) {
      creatures[name] = { file: 'creatures/' + name + '.png', frameWidth: d.size, frameHeight: d.size, directions: 1, height: d.height, anchor: { x: 0.5, y: 1 - 14 / 128 }, hover: d.hover,
        animations: { idle: anim(0, 2, 3, true), walk: anim(1, 4, 8, true), attack: anim(2, 3, 10, false), hurt: anim(3, 1, 8, false), death: anim(4, 4, 7, false) } };
    }
    const weapons = {};
    for (const id of Object.keys(GUNS)) weapons[id] = { view: { file: 'weapons/' + id + '_view.png', frameWidth: WV, frameHeight: WV, scale: 0.44, anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: 0 }, muzzle: { x: 0.5, y: 0.1 }, animations: { idle: anim(0, 1, 1, true), fire: anim(1, 3, 28, false), reload: anim(2, 4, 7, false) } }, icon: { file: 'weapons/' + id + '_icon.png', width: 192, height: 96 } };
    const pickups = {}; const colors = { ammo: '#c8884a', twin: '#ffd84a', boom: '#ff4a6a', zap: '#b78cff' };
    for (const id of Object.keys(PICKUPS)) pickups[id] = { file: 'pickups/' + id + '.png', width: 128, height: 128, size: 1.1, hover: 1.0, color: colors[id] };
    const perks = {}; for (const id of Object.keys(PERKS)) perks[id] = { file: 'icons/perk_' + id + '.png', width: 96, height: 96 };
    const fx = {}; for (const [id, [s]] of Object.entries(FX)) fx[id] = { file: 'fx/' + id + '.png', width: s, height: s };
    return { version: 1, notes: 'See README.md in this folder. Replace a PNG and keep the numbers here in step with it; no code changes are needed.', creatures, weapons, pickups, perks, fx,
      textures: { notes: 'Optional. Set a file (relative to this folder, a square PNG that tiles) to replace a procedural texture; null keeps the built-in one.', barn_wall: null, barn_floor: null, patch_wall: null, patch_floor: null, mill_wall: null, mill_floor: null, crypt_wall: null, crypt_floor: null, pond_wall: null, pond_floor: null, ceiling: null, door: null } };
  }
  window.DZArt = {
    creatureSheet, weaponSheet, weaponIcon,
    async all(only) {
      const out = [];
      for (const n of Object.keys(CREATURES)) if (!only || only === 'creatures') out.push(await save(creatureSheet(n), 'art/creatures/' + n + '.png'));
      for (const id of Object.keys(GUNS)) if (!only || only === 'weapons') { out.push(await save(weaponSheet(id), 'art/weapons/' + id + '_view.png')); out.push(await save(weaponIcon(id), 'art/weapons/' + id + '_icon.png')); }
      if (!only || only === 'pickups') { for (const [id, fn] of Object.entries(PICKUPS)) out.push(await save(fxSheet(128, fn), 'art/pickups/' + id + '.png')); for (const [id, fn] of Object.entries(PERKS)) out.push(await save(icon96(fn), 'art/icons/perk_' + id + '.png')); for (const [id, [s, fn]] of Object.entries(FX)) out.push(await save(fxSheet(s, fn), 'art/fx/' + id + '.png')); }
      out.push(await saveText(JSON.stringify(manifest(), null, 2), 'art/manifest.json'));
      return out.length + ' files';
    }, manifest,
  };
})();
