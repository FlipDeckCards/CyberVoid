// Feral 2.0 - art loading. Every creature, weapon, pickup, icon and effect sprite comes from art/manifest.json (see art/README.md), so the art can be replaced with
// no code changes. Walls, floors and props are drawn here in code (each can optionally be replaced through the manifest's "textures" section).
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = (D.art = { manifest: null, creatures: {}, weapons: {}, pickups: {}, perks: {}, fx: {}, tex: {}, ready: false });
  const TAU = Math.PI * 2;
  const BASE = 'art/';

  const loadImage = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + url)); i.src = url; });
  function mkTex(img, opts) {
    const t = new THREE.Texture(img); t.needsUpdate = true; t.anisotropy = (opts && opts.aniso) || 4;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    else { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; }
    return t;
  }

  // ---------- the loader ----------
  A.load = async function (progress) {
    const res = await fetch(BASE + 'manifest.json', { cache: 'no-cache' }); if (!res.ok) throw new Error('art/manifest.json is missing');
    const m = A.manifest = await res.json();
    const jobs = [];
    const add = (file, store, key, extra) => jobs.push({ file, store, key, extra });
    for (const [n, d] of Object.entries(m.creatures || {})) add(d.file, A.creatures, n, { def: d, kind: 'sheet' });
    for (const [n, d] of Object.entries(m.weapons || {})) { add(d.view.file, A.weapons, n, { def: d, kind: 'view' }); add(d.icon.file, A.weapons, n + ':icon', { def: d, kind: 'icon' }); }
    for (const [n, d] of Object.entries(m.pickups || {})) add(d.file, A.pickups, n, { def: d, kind: 'tex' });
    for (const [n, d] of Object.entries(m.perks || {})) add(d.file, A.perks, n, { def: d, kind: 'img' });
    for (const [n, d] of Object.entries(m.fx || {})) add(d.file, A.fx, n, { def: d, kind: 'tex' });
    const over = m.textures || {}; for (const [n, f] of Object.entries(over)) if (n !== 'notes' && typeof f === 'string' && f) add(f, A.tex, n === 'ceiling' ? 'ceiling_wood' : n, { kind: 'override' });
    let done = 0; const total = jobs.length;
    await Promise.all(jobs.map(async (j) => {
      const img = await loadImage(BASE + j.file);
      if (j.extra.kind === 'sheet') { const tex = mkTex(img); A.creatures[j.key] = { def: j.extra.def, img, tex, cols: Math.max(1, Math.round(img.width / j.extra.def.frameWidth)), rows: Math.max(1, Math.round(img.height / j.extra.def.frameHeight)) }; }
      else if (j.extra.kind === 'view') { const w = (A.weapons[j.key] = A.weapons[j.key] || {}); w.def = j.extra.def; w.view = { img, cols: Math.max(1, Math.round(img.width / j.extra.def.view.frameWidth)), rows: Math.max(1, Math.round(img.height / j.extra.def.view.frameHeight)) }; }
      else if (j.extra.kind === 'icon') { const n = j.key.split(':')[0], w = (A.weapons[n] = A.weapons[n] || {}); w.icon = { img, url: BASE + j.file }; }
      else if (j.extra.kind === 'tex') { j.store[j.key] = { def: j.extra.def, img, tex: mkTex(img), url: BASE + j.file }; }
      else if (j.extra.kind === 'img') { j.store[j.key] = { def: j.extra.def, img, url: BASE + j.file }; }
      else if (j.extra.kind === 'override') { const t = mkTex(img, { repeat: true }); t.userData = { override: true }; A.tex[j.key] = t; }
      done++; if (progress) progress(done / (total + 1));
    }));
    // weapon entries may have been created in either order: make sure every weapon has both parts
    for (const [n, w] of Object.entries(A.weapons)) if (!w.view || !w.icon) throw new Error('Weapon art incomplete: ' + n);
    A.buildTextures(); A.ready = true; if (progress) progress(1);
  };

  // ---------- sprite sheet helpers ----------
  // a creature's frame for an animation: returns { col, row } for the sheet; dir is the direction index (0 = seen from the front)
  A.frame = function (def, anim, t, dir) {
    const a = (def.animations && def.animations[anim]) || def.animations.idle; let f = Math.floor(t * (a.fps || 6));
    if (a.loop === false) f = Math.min(f, a.frames - 1); else f = f % a.frames;
    return { col: f, row: a.row + (dir || 0), done: a.loop === false && Math.floor(t * (a.fps || 6)) >= a.frames - 1, frames: a.frames };
  };
  // which direction row to show: heading = the way the creature faces (radians), toViewer = the angle from the creature to the camera
  A.dirIndex = function (heading, toViewer, n) {
    if (!n || n < 2) return 0;
    let d = toViewer - heading; d = Math.atan2(Math.sin(d), Math.cos(d));         // -PI..PI, 0 = it faces us
    // 0 front, then clockwise seen from above (the viewer walks around the creature to its right: 1 = front-right ... n/2 = back)
    return ((Math.round(d / (TAU / n)) % n) + n) % n;
  };
  A.setUV = function (geom, fr, cols, rows) {            // point a quad's UVs at one frame of a sheet (a quad per entity, one shared texture)
    const uv = geom.attributes.uv, u0 = fr.col / cols, u1 = (fr.col + 1) / cols, v1 = 1 - fr.row / rows, v0 = 1 - (fr.row + 1) / rows;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true;
  };
  A.frameURL = function (name, anim) {                   // a small picture of one creature frame (for menus)
    const c = A.creatures[name]; if (!c) return ''; const fr = A.frame(c.def, anim || 'idle', 0, 0), cv = document.createElement('canvas'), W = c.def.frameWidth, H = c.def.frameHeight;
    cv.width = W; cv.height = H; cv.getContext('2d').drawImage(c.img, fr.col * W, fr.row * H, W, H, 0, 0, W, H); return cv.toDataURL('image/png');
  };

  // ---------- procedural textures ----------
  function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function canvasTex(w, h, draw, seed) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), r = rngOf(seed || 1); draw(x, w, h, r);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  const rect = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  function speck(x, w, h, r, cols, n, s) { for (let i = 0; i < n; i++) { x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(r() * w, r() * h, 1 + r() * s, 1 + r() * s); } }
  function shade(x, w, h) { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }

  const T = {
    planksV: (base, dark, light) => (x, w, h, r) => { rect(x, base, 0, 0, w, h); const n = 6, pw = w / n; for (let i = 0; i < n; i++) { rect(x, i % 2 ? light : base, i * pw, 0, pw, h); rect(x, dark, i * pw, 0, 2, h); for (let k = 0; k < 14; k++) rect(x, 'rgba(0,0,0,0.12)', i * pw + 3 + r() * (pw - 6), r() * h, 1, 10 + r() * 40); for (const ny of [10, h - 10]) rect(x, '#2a1a0c', i * pw + pw / 2 - 1, ny, 3, 3); } speck(x, w, h, r, ['rgba(0,0,0,0.15)', 'rgba(255,220,160,0.08)'], 200, 2); shade(x, w, h); },
    planksH: (base, dark, light) => (x, w, h, r) => { rect(x, base, 0, 0, w, h); const n = 6, ph = h / n; for (let i = 0; i < n; i++) { rect(x, i % 2 ? light : base, 0, i * ph, w, ph); rect(x, dark, 0, i * ph, w, 2); const off = (i * 53) % w; rect(x, dark, off, i * ph, 2, ph); for (let k = 0; k < 10; k++) rect(x, 'rgba(0,0,0,0.12)', r() * w, i * ph + 3 + r() * (ph - 6), 10 + r() * 40, 1); } speck(x, w, h, r, ['rgba(0,0,0,0.15)', 'rgba(255,220,160,0.08)'], 240, 2); },
    bricks: (base, mortar, hi) => (x, w, h, r) => { rect(x, mortar, 0, 0, w, h); const rows = 8, bh = h / rows; for (let j = 0; j < rows; j++) { const n = 4, bw = w / n, off = j % 2 ? bw / 2 : 0; for (let i = -1; i < n; i++) { const c = 0.8 + r() * 0.35; x.fillStyle = base; x.globalAlpha = 1; rect(x, base, off + i * bw + 2, j * bh + 2, bw - 4, bh - 4); rect(x, 'rgba(255,255,255,' + (0.04 + r() * 0.06) + ')', off + i * bw + 2, j * bh + 2, bw - 4, 3); rect(x, 'rgba(0,0,0,' + (0.1 + r() * 0.15 * c) + ')', off + i * bw + 2, j * bh + bh - 6, bw - 4, 4); } } speck(x, w, h, r, ['rgba(0,0,0,0.2)', hi], 260, 2); },
    stoneBlocks: (base, mortar, moss) => (x, w, h, r) => { rect(x, mortar, 0, 0, w, h); const rows = 4, bh = h / rows; for (let j = 0; j < rows; j++) { let px = j % 2 ? -30 : 0; while (px < w) { const bw = 50 + r() * 50; rect(x, base, px + 2, j * bh + 2, bw - 4, bh - 4); rect(x, 'rgba(255,255,255,0.06)', px + 2, j * bh + 2, bw - 4, 4); rect(x, 'rgba(0,0,0,0.2)', px + 2, j * bh + bh - 8, bw - 4, 6); if (moss && r() > 0.5) for (let k = 0; k < 14; k++) rect(x, moss, px + 4 + r() * (bw - 8), j * bh + 2 + r() * (bh * 0.6), 2 + r() * 8, 2 + r() * 4); px += bw; } } speck(x, w, h, r, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.05)'], 300, 2); },
    cobble: (base, mortar) => (x, w, h, r) => { rect(x, mortar, 0, 0, w, h); for (let i = 0; i < 46; i++) { const cx = r() * w, cy = r() * h, rr = 12 + r() * 12; for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { x.fillStyle = 'hsl(' + (240 + r() * 20) + ',8%,' + (28 + r() * 14) + '%)'; x.beginPath(); x.ellipse(cx + ox, cy + oy, rr, rr * 0.8, r() * 3, 0, TAU); x.fill(); } } speck(x, w, h, r, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)'], 200, 2); void base; },
    flags: (base, mortar, moss) => (x, w, h, r) => { rect(x, mortar, 0, 0, w, h); const n = 3, s = w / n; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const c = 36 + r() * 10; rect(x, 'hsl(220,10%,' + c + '%)', i * s + 2, j * s + 2, s - 4, s - 4); rect(x, 'rgba(255,255,255,0.06)', i * s + 2, j * s + 2, s - 4, 3); for (let k = 0; k < 10; k++) rect(x, moss, i * s + 4 + r() * (s - 8), j * s + 4 + r() * (s - 8), 2 + r() * 10, 2 + r() * 3); } for (let k = 0; k < 5; k++) { x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 1; x.beginPath(); const sx = r() * w, sy = r() * h; x.moveTo(sx, sy); x.lineTo(sx + 14 * (r() - 0.5), sy + 16 * (r() - 0.5)); x.lineTo(sx + 26 * (r() - 0.5), sy + 30 * (r() - 0.5)); x.stroke(); } },
    grass: () => (x, w, h, r) => { rect(x, '#27442f', 0, 0, w, h); speck(x, w, h, r, ['#2f5a38', '#1f3a26', '#3a6a40', '#234030'], 900, 3); for (let i = 0; i < 160; i++) { const gx = r() * w, gy = r() * h; x.strokeStyle = r() > 0.5 ? '#3f7a48' : '#2a5232'; x.lineWidth = 1; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + (r() - 0.5) * 4, gy - 3 - r() * 5); x.stroke(); } for (let i = 0; i < 9; i++) { const fx = r() * w, fy = r() * h; x.fillStyle = ['#ffb3d9', '#ffe27a', '#fff'][i % 3]; x.beginPath(); x.arc(fx, fy, 1.6, 0, TAU); x.fill(); } },
    hedge: () => (x, w, h, r) => { rect(x, '#142a1a', 0, 0, w, h); for (let i = 0; i < 420; i++) { x.fillStyle = 'hsl(' + (110 + r() * 30) + ',' + (35 + r() * 20) + '%,' + (12 + r() * 20) + '%)'; x.beginPath(); x.ellipse(r() * w, r() * h, 4 + r() * 8, 3 + r() * 6, r() * 3, 0, TAU); x.fill(); } for (let i = 0; i < 20; i++) { x.fillStyle = r() > 0.5 ? '#ff9a3c' : '#e8d070'; x.beginPath(); x.arc(r() * w, r() * h, 2, 0, TAU); x.fill(); } shade(x, w, h); },
    moss: () => (x, w, h, r) => { rect(x, '#1b2420', 0, 0, w, h); speck(x, w, h, r, ['#26382c', '#2a2438', '#14201a', '#33503a'], 700, 4); for (let i = 0; i < 30; i++) { x.strokeStyle = '#3a6a44'; x.lineWidth = 1; const gx = r() * w, gy = r() * h; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + 2, gy - 6); x.stroke(); } if (r() > 0.2) { x.fillStyle = '#d8d0c0'; x.fillRect(w * 0.3, h * 0.6, 14, 4); x.fillRect(w * 0.3 - 3, h * 0.6 - 3, 5, 5); } },
    door: () => (x, w, h, r) => { rect(x, '#5a3c22', 0, 0, w, h); const n = 5, pw = w / n; for (let i = 0; i < n; i++) { rect(x, i % 2 ? '#7a5634' : '#8a6440', i * pw + 2, 0, pw - 3, h); rect(x, '#3a2412', i * pw, 0, 2, h); for (let k = 0; k < 10; k++) rect(x, 'rgba(0,0,0,0.12)', i * pw + 4 + r() * (pw - 8), r() * h, 1, 14 + r() * 40); } for (const yy of [h * 0.16, h * 0.76]) { rect(x, '#2a2a38', 0, yy, w, 12); rect(x, '#4a4a5a', 0, yy, w, 3); for (let i = 0; i < 9; i++) rect(x, '#9a9aaa', 6 + i * (w / 9), yy + 4, 4, 4); } },
    crate: () => (x, w, h, r) => { rect(x, '#7a5a34', 0, 0, w, h); rect(x, '#9a7444', 0, 0, w, 8); rect(x, '#4a3418', 0, h - 8, w, 8); rect(x, '#3a2810', 0, 0, 8, h); rect(x, '#3a2810', w - 8, 0, 8, h); x.strokeStyle = '#5a4020'; x.lineWidth = 8; x.beginPath(); x.moveTo(8, 8); x.lineTo(w - 8, h - 8); x.stroke(); for (let k = 0; k < 40; k++) rect(x, 'rgba(0,0,0,0.12)', r() * w, r() * h, 12 + r() * 20, 1); },
    barrel: () => (x, w, h, r) => { rect(x, '#6a4a2a', 0, 0, w, h); for (let i = 0; i < 12; i++) rect(x, i % 2 ? '#7a5a34' : '#5a3c22', i * (w / 12), 0, w / 12 - 1, h); for (const yy of [h * 0.14, h * 0.5, h * 0.84]) { rect(x, '#2a2a38', 0, yy, w, 10); rect(x, '#5a5a6a', 0, yy, w, 3); } },
    hay: () => (x, w, h, r) => { rect(x, '#d4b04a', 0, 0, w, h); for (let i = 0; i < 260; i++) { x.strokeStyle = r() > 0.5 ? '#e8c862' : '#a8882a'; x.lineWidth = 1.5; const sx = r() * w, sy = r() * h; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 14 + r() * 20, sy + (r() - 0.5) * 6); x.stroke(); } rect(x, '#6a4a22', 0, h * 0.45, w, 10); },
    pumpkin: () => (x, w, h, r) => { rect(x, '#e8892a', 0, 0, w, h); for (let i = 0; i < 8; i++) rect(x, i % 2 ? '#f59a2f' : '#cf6a1a', i * (w / 8), 0, w / 8 - 2, h); speck(x, w, h, r, ['rgba(0,0,0,0.12)'], 80, 2); },
    grave: () => (x, w, h, r) => { rect(x, '#7a8296', 0, 0, w, h); speck(x, w, h, r, ['#6a728a', '#8a92a6', '#4f5870'], 500, 3); for (let i = 0; i < 24; i++) rect(x, '#3f6a4a', r() * w, h * 0.7 + r() * h * 0.3, 3 + r() * 8, 2 + r() * 5); x.strokeStyle = '#4a5266'; x.lineWidth = 6; x.beginPath(); x.moveTo(w / 2, h * 0.15); x.lineTo(w / 2, h * 0.55); x.moveTo(w * 0.32, h * 0.3); x.lineTo(w * 0.68, h * 0.3); x.stroke(); },
    water: () => (x, w, h, r) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#16405c'); g.addColorStop(1, '#1f6a8a'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(160,230,255,' + (0.12 + r() * 0.2) + ')'; x.lineWidth = 1.5; const sx = r() * w, sy = r() * h; x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + 10, sy - 3, sx + 22, sy); x.stroke(); } },
    ceilingWood: () => (x, w, h, r) => { rect(x, '#2a1c12', 0, 0, w, h); for (let i = 0; i < 4; i++) { rect(x, '#4a3220', 0, i * (h / 4), w, 14); rect(x, 'rgba(255,255,255,0.05)', 0, i * (h / 4), w, 3); } speck(x, w, h, r, ['rgba(0,0,0,0.3)'], 200, 3); },
    ceilingStone: () => (x, w, h, r) => { rect(x, '#20202c', 0, 0, w, h); speck(x, w, h, r, ['#2a2a38', '#16161e', '#2e2e3e'], 600, 4); },
  };

  A.buildTextures = function () {
    const o = A.tex, mk = (name, w, h, fn, seed) => { if (!o[name]) o[name] = canvasTex(w, h, fn, seed); };
    mk('barn_wall', 256, 256, T.planksV('#6a4a30', '#2a1a0e', '#7a5a3a'), 1); mk('barn_floor', 256, 256, T.planksH('#5a3f2e', '#2a1c12', '#664735'), 2);
    mk('patch_wall', 256, 256, T.hedge(), 3); mk('patch_floor', 256, 256, T.grass(), 4);
    mk('mill_wall', 256, 256, T.bricks('#6a5a52', '#2a2220', 'rgba(255,255,255,0.08)'), 5); mk('mill_floor', 256, 256, T.cobble('#4a4a58', '#1c1c24'), 6);
    mk('crypt_wall', 256, 256, T.stoneBlocks('#3a404c', '#14161c', '#3f6a4a'), 7); mk('crypt_floor', 256, 256, T.flags('#3a3f4a', '#12141a', '#3f6a4a'), 8);
    mk('pond_wall', 256, 256, T.planksV('#4a3a30', '#1a120c', '#5a463a'), 9); mk('pond_floor', 256, 256, T.planksH('#6a5238', '#2a1e12', '#775d42'), 10);
    mk('yard', 128, 128, T.moss(), 11); mk('yard_wall', 256, 256, T.stoneBlocks('#2c3040', '#0e1016', '#2f5a3a'), 12); mk('hall_wall', 256, 256, T.stoneBlocks('#46404a', '#14121a', null), 13); mk('hall_floor', 256, 256, T.cobble('#4a4a58', '#1c1c24'), 14);
    mk('door', 256, 256, T.door(), 15); mk('crate', 128, 128, T.crate(), 16); mk('barrel', 128, 128, T.barrel(), 17); mk('hay', 128, 128, T.hay(), 18); mk('pumpkin', 64, 64, T.pumpkin(), 19); mk('grave', 128, 128, T.grave(), 20); mk('water', 256, 256, T.water(), 21);
    mk('plank', 128, 64, T.planksH('#8a6a44', '#3a2412', '#9a7850'), 24); mk('ceiling_wood', 256, 256, T.ceilingWood(), 22); mk('ceiling_stone', 256, 256, T.ceilingStone(), 23);
    mk('sky', 512, 512, (x, w, h, r) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b0a22'); g.addColorStop(1, '#241540'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { const s = r(); x.fillStyle = s > 0.9 ? '#ffe9b0' : s > 0.5 ? '#cdbdf2' : '#8a7ab8'; const z = s > 0.95 ? 3 : 2; x.fillRect(r() * w, r() * h, z, z); } x.fillStyle = 'rgba(255,233,176,0.9)'; x.beginPath(); x.arc(w * 0.7, h * 0.3, 20, 0, TAU); x.fill(); x.fillStyle = '#0b0a22'; x.beginPath(); x.arc(w * 0.7 + 8, h * 0.3 - 5, 17, 0, TAU); x.fill(); }, 30);
    const radial = (stops) => { const t = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); for (const [off, c] of stops) g.addColorStop(off, c); x.fillStyle = g; x.fillRect(0, 0, w, h); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    A.glow = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); A.blob = radial([[0, 'rgba(0,0,0,0.65)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
  };
  // little canvas textures for signs, posters and machine fronts (made on demand)
  A.sign = function (text, bg, fg, w, h) {
    const c = document.createElement('canvas'); c.width = w || 256; c.height = h || 96; const x = c.getContext('2d'); x.fillStyle = bg || '#2a1c12'; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = '#8a6a3a'; x.lineWidth = 8; x.strokeRect(4, 4, c.width - 8, c.height - 8);
    x.fillStyle = fg || '#ffe27a'; x.font = '900 ' + Math.floor(c.height * 0.5) + 'px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); return { tex: t, canvas: c };
  };
})();
