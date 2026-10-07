// Feral 2.0 - everything that moves in the 3D world: creatures (camera-facing sprites that play idle / walk / attack / hurt / death frames from the art manifest),
// corpses, pickups, bullets, spores, beams, blob shadows, particles (goo and sparkles - no blood), bullet-hole decals, floor splats and shock rings.
// Sprites are drawn in batches: one dynamic mesh per sprite sheet, rebuilt every frame (a few draw calls for the whole crowd).
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = D.art, S = 1 / 8, TAU = Math.PI * 2;
  const E = (D.ents = {});
  const rnd = Math.random, rr = (a, b) => a + (b - a) * rnd();

  function Batch(tex, cap, mode, order) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(cap * 12), uv = new Float32Array(cap * 8), col = new Float32Array(cap * 16), idx = new Uint16Array(cap * 6);
    for (let i = 0; i < cap; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    const pa = new THREE.BufferAttribute(pos, 3), ua = new THREE.BufferAttribute(uv, 2), ca = new THREE.BufferAttribute(col, 4);
    pa.setUsage(THREE.DynamicDrawUsage); ua.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa); g.setAttribute('uv', ua); g.setAttribute('color', ca); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const common = { map: tex, vertexColors: true };
    const mat = mode === 'cut' ? new THREE.MeshBasicMaterial(Object.assign(common, { alphaTest: 0.4, side: THREE.DoubleSide }))
      : mode === 'blend' ? new THREE.MeshBasicMaterial(Object.assign(common, { transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
      : new THREE.MeshBasicMaterial(Object.assign(common, { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = order || 0;
    const b = { mesh, n: 0, cap, pos, uv, col, pa, ua, ca };
    b.reset = () => { b.n = 0; };
    b.add = function (cx, cy, cz, rx, ry, rz, ux, uy, uz, u0, v0, u1, v1, r, gg, bb, a) {
      if (b.n >= cap) return; const i = b.n++, p = i * 12, q = i * 8, c = i * 16;
      pos[p] = cx - rx - ux; pos[p + 1] = cy - ry - uy; pos[p + 2] = cz - rz - uz;
      pos[p + 3] = cx + rx - ux; pos[p + 4] = cy + ry - uy; pos[p + 5] = cz + rz - uz;
      pos[p + 6] = cx + rx + ux; pos[p + 7] = cy + ry + uy; pos[p + 8] = cz + rz + uz;
      pos[p + 9] = cx - rx + ux; pos[p + 10] = cy - ry + uy; pos[p + 11] = cz - rz + uz;
      uv[q] = u0; uv[q + 1] = v0; uv[q + 2] = u1; uv[q + 3] = v0; uv[q + 4] = u1; uv[q + 5] = v1; uv[q + 6] = u0; uv[q + 7] = v1;
      for (let k = 0; k < 4; k++) { col[c + k * 4] = r; col[c + k * 4 + 1] = gg; col[c + k * 4 + 2] = bb; col[c + k * 4 + 3] = a; }
    };
    b.flush = function () { g.setDrawRange(0, b.n * 6); pa.needsUpdate = ua.needsUpdate = ca.needsUpdate = true; mesh.visible = b.n > 0; };
    return b;
  }
  E.Batch = Batch;

  function canvasTexture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }
  const hex = (s) => { const c = new THREE.Color(s); return [c.r, c.g, c.b]; };

  E.create = function (scene, W3, Q) {
    const O = { scene, W3, Q, batches: [], vis: new Map(), corpses: [], parts: [], floorDecals: [], wallDecals: [], rings: [], hooks: {}, shake: 0, flash: 0, flashCol: [1, 0.8, 0.4], t: 0 };
    const reg = (b) => { scene.add(b.mesh); O.batches.push(b); return b; };
    // creature batches (one per sheet)
    O.creatureB = {}; for (const [n, c] of Object.entries(A.creatures)) O.creatureB[n] = reg(Batch(c.tex, 96, 'cut', 2));
    O.shadowB = reg(Batch(A.blob, 160, 'blend', 1));
    O.floorB = reg(Batch(A.fx.splat.tex, Q.floorDecals, 'blend', 1));
    O.wallB = reg(Batch(A.fx.decal.tex, Q.wallDecals, 'blend', 1));
    const ringTex = canvasTexture(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, w * 0.36, w / 2, h / 2, w * 0.5); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    O.ringB = reg(Batch(ringTex, 24, 'add', 4));
    O.pb = {
      splat: reg(Batch(A.fx.splat.tex, Q.particles, 'blend', 3)), bubble: reg(Batch(A.fx.bubble.tex, Math.max(16, Q.particles >> 1), 'blend', 3)), dust: reg(Batch(A.glow, Q.particles, 'blend', 3)),
      glow: reg(Batch(A.glow, Q.particles * 2, 'add', 4)), spark: reg(Batch(A.fx.spark.tex, Q.particles, 'add', 4)), spore: reg(Batch(A.fx.spore.tex, 48, 'add', 4)),
    };
    O.glowB = O.pb.glow;
    O.beamB = reg(Batch(A.glow, 16, 'add', 5));
    O.extra = {};                                      // lazily made batches for pickups and floating icons
    const iconTex = {};
    O.batchFor = function (key, tex, mode) { return O.extra[key] || (O.extra[key] = reg(Batch(tex, 16, mode || 'cut', 2))); };
    O.weaponTex = (id) => iconTex[id] || (iconTex[id] = (() => { const t = new THREE.Texture(A.weapons[id].icon.img); t.needsUpdate = true; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; })());
    return O;
  };

  // ---------- spawning particles ----------
  function P(O, kind, x, y, z, vx, vy, vz, size, life, col, a0, grav, grow) {
    if (O.parts.length >= O.Q.particles * 3) return;
    O.parts.push({ kind, x, y, z, vx, vy, vz, size, life, max: life, r: col[0], g: col[1], b: col[2], a: a0 == null ? 1 : a0, grav: grav || 0, grow: grow || 0, rot: 0 });
  }
  function goo(O, x, y, z, col, n, speed, towards) {
    n = Math.max(1, Math.round(n * O.Q.fxScale));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, s = rr(0.4, 1) * speed; let vx = Math.cos(a) * s * 0.6, vz = Math.sin(a) * s * 0.6;
      if (towards) { vx += towards[0] * s * 0.7; vz += towards[1] * s * 0.7; }
      P(O, 'splat', x, y, z, vx, rr(1.5, 4.5) * speed * 0.35, vz, rr(0.18, 0.4), rr(0.5, 0.9), col, 0.95, -14, -0.3);
    }
  }
  function sparkle(O, x, y, z, col, n, speed, size) {
    n = Math.max(1, Math.round(n * O.Q.fxScale));
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = rr(0.3, 1) * speed; P(O, rnd() > 0.4 ? 'spark' : 'glow', x, y, z, Math.cos(a) * s, rr(0.5, 3) * speed * 0.4, Math.sin(a) * s, (size || 0.3) * rr(0.6, 1.2), rr(0.4, 0.9), col, 1, -3, -0.2); }
  }
  function dust(O, x, y, z, n, size, col) { n = Math.max(1, Math.round(n * O.Q.fxScale)); for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = rr(0.5, 2.2); P(O, 'dust', x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, Math.cos(a) * s, rr(0.2, 1.4), Math.sin(a) * s, size * rr(0.6, 1.2), rr(0.5, 1.0), col || [0.45, 0.4, 0.45], 0.55, 0, 1.4); } }
  function floorSplat(O, x, z, size, col, life) { const arr = O.floorDecals; if (arr.length >= O.Q.floorDecals) arr.shift(); arr.push({ x, z, size, col, life, max: life, rot: rnd() * TAU }); }
  function ring(O, x, z, r1, dur, col, y) { O.rings.push({ x, z, r: r1, t: 0, dur, col, y: y || 0.06 }); }

  // ---------- sim events -> effects ----------
  E.event = function (O, e, g, cam) {
    const Q = O.Q, hk = O.hooks, px = cam.x, pz = cam.z;
    switch (e.t) {
      case 'shot': {
        const w = D.WEAPONS[e.w], c = hex(w.color); O.flash = Math.max(O.flash, 1); O.flashCol = c;
        if (hk.shake) hk.shake(w.shake * 0.5);
        const fx = cam.fx, fz = cam.fz, rx = -fz, rz = fx;
        for (let i = 0; i < 2; i++) P(O, 'glow', px + fx * 1.4 + rx * 0.35, 1.05 + rr(-0.05, 0.15), pz + fz * 1.4 + rz * 0.35, fx * rr(2, 6) + rr(-1, 1), rr(-0.5, 1), fz * rr(2, 6) + rr(-1, 1), 0.35, 0.18, c, 0.9, 0, -1);
        break;
      }
      case 'hit': {
        const col = hex(e.color || '#ffffff'), x = e.x * S, z = e.y * S, dx = px - x, dz = pz - z, l = Math.hypot(dx, dz) || 1;
        goo(O, x, 1.0, z, col, e.kill ? 7 : 3, 3.5, [dx / l, dz / l]); sparkle(O, x, 1.1, z, [1, 1, 0.8], 2, 3, 0.25);
        if (!e.kill && rnd() < 0.25) floorSplat(O, x + rr(-0.5, 0.5), z + rr(-0.5, 0.5), rr(0.5, 0.9), col, 14);
        if (hk.hit) hk.hit(e);
        break;
      }
      case 'kill': {
        const col = hex(e.color || '#ffffff'), x = e.x * S, z = e.y * S, big = e.boss ? 3 : e.type === 'mossmaw' ? 2 : 1;
        if (e.boom) { sparkle(O, x, 1, z, col, 14, 6, 0.5); break; }
        goo(O, x, 0.9, z, col, 10 * big, 4.5); sparkle(O, x, 1.1, z, col, 8 * big, 4, 0.35);
        for (let i = 0; i < 5 * big; i++) P(O, 'glow', x + rr(-0.4, 0.4), 0.8, z + rr(-0.4, 0.4), rr(-0.3, 0.3), rr(1.2, 2.6), rr(-0.3, 0.3), 0.4, rr(0.8, 1.4), col, 0.9, 0, -0.1);
        floorSplat(O, x, z, (e.boss ? 3.4 : e.type === 'mossmaw' ? 2.2 : 1.4) * (e.type === 'glumpkin' ? [0, 0.5, 0.75, 1][e.size || 3] + 0.3 : 1), col, 18);
        const def = A.creatures[e.type];
        if (def && e.id != null) { O.corpses.push({ type: e.type, x: e.x, y: e.y, t: 0, size: e.size || 3, id: e.id, heading: e.heading || 0, boss: e.boss }); if (O.corpses.length > 28) O.corpses.shift(); }
        break;
      }
      case 'boom': {
        const x = e.x * S, z = e.y * S, d = Math.hypot(px - x, pz - z), k = e.nuke ? 1 : Math.max(0.2, 1 - d / 30);
        if (hk.shake) hk.shake((e.nuke ? 6 : 3) * k); O.flash = Math.max(O.flash, e.nuke ? 2.4 : 1.6 * k); O.flashCol = [1, 0.7, 0.3];
        if (!e.nuke) { sparkle(O, x, 1, z, [1, 0.6, 0.3], 22, 8, 0.6); dust(O, x, 0.3, z, 12, 1.4); ring(O, x, z, e.r * S * 1.0, 0.45, [1, 0.6, 0.3]); goo(O, x, 1, z, [1, 0.4, 0.55], 12, 7); }
        else { if (hk.screenFlash) hk.screenFlash('#ff6a6a'); for (let i = 0; i < 40; i++) { const a = rnd() * TAU, s = rr(6, 18); P(O, 'glow', px + Math.cos(a) * 3, rr(0.3, 2.5), pz + Math.sin(a) * 3, Math.cos(a) * s, 0, Math.sin(a) * s, 0.8, rr(0.5, 1), [1, 0.5, 0.6], 0.9, 0, 1); } }
        break;
      }
      case 'spark': {
        const col = hex(e.color || '#ffe27a');
        if (e.wall) wallImpact(O, e, g, col); else sparkle(O, e.x * S, 1.2, e.y * S, col, 4, 2, 0.2);
        break;
      }
      case 'pop': { const x = e.x * S, z = e.y * S, col = hex(e.color || '#7fe6ff'); for (let i = 0; i < 6; i++) { const a = rnd() * TAU, s = rr(1, 3.5); P(O, 'bubble', x, 1.2, z, Math.cos(a) * s, rr(0, 2), Math.sin(a) * s, rr(0.25, 0.5), rr(0.4, 0.8), [1, 1, 1], 0.8, -2, 0.2); } sparkle(O, x, 1.2, z, col, 8, 4, 0.3); ring(O, x, z, 30 * S, 0.3, col, 1.2); break; }
      case 'plank': { const x = e.x * S, z = e.y * S; for (let i = 0; i < 6; i++) P(O, 'dust', x + rr(-1.5, 1.5), rr(0.8, 2), z + rr(-1.5, 1.5), rr(-1.5, 1.5), rr(0.5, 3), rr(-1.5, 1.5), 0.3, rr(0.4, 0.8), [0.55, 0.38, 0.2], 0.9, 0, 0.3); if (hk.shake) hk.shake(0.4 * Math.max(0, 1 - Math.hypot(px - x, pz - z) / 25)); break; }
      case 'repair': { const x = e.x * S, z = e.y * S; sparkle(O, x + rr(-1.5, 1.5), 1.4, z + rr(-1, 1), [1, 0.9, 0.5], 5, 2, 0.25); break; }
      case 'door': { const x = e.x * S, z = e.y * S; dust(O, x, 0.6, z, 30, 2.2); if (hk.shake) hk.shake(1.2); sparkle(O, x, 1.5, z, [1, 0.85, 0.4], 12, 4, 0.4); break; }
      case 'bigSpawn': case 'bossSpawn': { const x = e.x * S, z = e.y * S; dust(O, x, 0.2, z, 18, 1.8, [0.3, 0.45, 0.3]); ring(O, x, z, e.t === 'bossSpawn' ? 9 : 4.5, 0.7, [0.5, 1, 0.5]); if (e.t === 'bossSpawn' && hk.shake) hk.shake(2); break; }
      case 'slamWarn': ring(O, e.x * S, e.y * S, e.r * S, 0.85, [1, 0.25, 0.25]); break;
      case 'slam': { const x = e.x * S, z = e.y * S; ring(O, x, z, e.r * S * 1.2, 0.35, [1, 0.8, 0.5]); dust(O, x, 0.2, z, 16, 1.6); if (hk.shake) hk.shake(3 * Math.max(0.3, 1 - Math.hypot(px - x, pz - z) / 40)); break; }
      case 'pickup': { const x = e.x * S, z = e.y * S; sparkle(O, x, 1, z, hex(D.POWERUPS[e.type].color), 14, 4, 0.4); ring(O, x, z, 3, 0.4, hex(D.POWERUPS[e.type].color)); break; }
      case 'drop': sparkle(O, e.x * S, 1, e.y * S, [1, 0.95, 0.6], 10, 3, 0.35); break;
      case 'split': sparkle(O, e.x * S, 1, e.y * S, [1, 0.6, 0.2], 6, 3, 0.3); break;
      case 'revive': ring(O, px, pz, 5, 0.6, [1, 0.8, 0.4], 0.1); sparkle(O, px, 1, pz, [1, 0.85, 0.4], 24, 5, 0.4); break;
      case 'upgrade': case 'buy': sparkle(O, px + cam.fx * 2, 1.4, pz + cam.fz * 2, [1, 0.85, 0.35], 10, 3, 0.3); break;
      case 'spit': sparkle(O, e.x * S, 1.2, e.y * S, [1, 0.4, 0.85], 4, 2, 0.3); break;
      case 'bite': break;
      case 'hurt': if (hk.shake) hk.shake(e.dmg > 20 ? 2.2 : 1.4); break;
      case 'gameover': break;
      default: break;
    }
  }
  function wallImpact(O, e, g, col) {
    // walk forward from the last free spot until the bullet's tile is solid; the side we cross tells the wall's direction
    const T = D.T, ang = e.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang); let x = e.x, y = e.y, nx = 0, nz = 0, hit = null;
    for (let i = 0; i < 40; i++) {
      const x2 = x + ca * 0.5, y2 = y + sa * 0.5, tx = Math.floor(x2 / T), ty = Math.floor(y2 / T), ptx = Math.floor(x / T), pty = Math.floor(y / T);
      const k = g.kindAt(tx, ty);
      if (k === D.K.WALL || k === D.K.DOOR || k === D.K.BLOCK || k === D.K.MACHINE) { if (tx !== ptx) nx = ca > 0 ? -1 : 1; else if (ty !== pty) nz = sa > 0 ? -1 : 1; else { if (Math.abs(ca) > Math.abs(sa)) nx = ca > 0 ? -1 : 1; else nz = sa > 0 ? -1 : 1; } hit = [x2, y2]; break; }
      x = x2; y = y2;
    }
    if (!hit) { hit = [x, y]; nx = -Math.sign(ca) || 1; }
    let hx = hit[0] * S, hz = hit[1] * S; if (nx) hx = (nx < 0 ? Math.floor(hit[0] / T) : Math.floor(hit[0] / T) + 1) * T * S; else hz = (nz < 0 ? Math.floor(hit[1] / T) : Math.floor(hit[1] / T) + 1) * T * S;
    // the plane of a block's face is at the tile edge we crossed
    const hy = 1.25 + rr(-0.25, 0.3);
    const arr = O.wallDecals; if (arr.length >= O.Q.wallDecals) arr.shift(); arr.push({ x: hx + nx * 0.03, y: hy, z: hz + nz * 0.03, nx, nz, size: rr(0.28, 0.4), life: 22, max: 22, rot: rnd() * TAU });
    for (let i = 0; i < 4; i++) P(O, rnd() > 0.5 ? 'spark' : 'glow', hx + nx * 0.1, hy, hz + nz * 0.1, nx * rr(0.5, 3) + rr(-1.5, 1.5), rr(-1, 2.5), nz * rr(0.5, 3) + rr(-1.5, 1.5), 0.25, rr(0.2, 0.5), col, 1, -6, -0.3);
    P(O, 'dust', hx + nx * 0.1, hy, hz + nz * 0.1, nx * 0.6, 0.3, nz * 0.6, 0.35, 0.5, [0.55, 0.5, 0.5], 0.5, 0, 1);
  }

  // ---------- per frame ----------
  const FRAME = (c, def) => { const cols = c.cols, rows = c.rows; return (a) => ({ u0: a.col / cols, u1: (a.col + 1) / cols, v1: 1 - a.row / rows, v0: 1 - (a.row + 1) / rows }); };
  E.update = function (O, g, dt, t, cam) {
    O.t = t; const W3 = O.W3, rx = cam.rx, rz = cam.rz, Q = O.Q;
    for (const b of O.batches) b.reset();
    const tmp = [0, 0, 0];
    const light = (xpx, ypx, y, boost) => { const l = W3.lightAt(xpx, ypx, y); const f = O.flash > 0.02 ? O.flash : 0, d = f ? Math.max(0, 1 - Math.hypot(xpx * S - cam.x, ypx * S - cam.z) / 22) : 0; tmp[0] = Math.min(1.25, Math.max(0.3, l[0]) * 1.1 + d * f * O.flashCol[0] * 0.6) * boost; tmp[1] = Math.min(1.25, Math.max(0.3, l[1]) * 1.1 + d * f * O.flashCol[1] * 0.6) * boost; tmp[2] = Math.min(1.25, Math.max(0.3, l[2]) * 1.1 + d * f * O.flashCol[2] * 0.6) * boost; return tmp; };
    // a sprite from a sheet frame, standing at world (x,y,z) with its anchor point there
    function sprite(batch, c, fr, x, y, z, hgt, anchor, col, flipU) {
      const def = c.def, w = hgt * def.frameWidth / def.frameHeight, ax = anchor.x, ay = anchor.y;
      const cx = x + rx * (1 - 2 * ax) * w / 2, cz = z + rz * (1 - 2 * ax) * w / 2, cy = y + (ay - 0.5) * hgt;
      let u0 = fr.col / c.cols, u1 = (fr.col + 1) / c.cols; if (flipU) { const q = u0; u0 = u1; u1 = q; }
      batch.add(cx, cy, cz, rx * w / 2, 0, rz * w / 2, 0, hgt / 2, 0, u0, 1 - (fr.row + 1) / c.rows, u1, 1 - fr.row / c.rows, col[0], col[1], col[2], 1);
    }
    function blob(x, z, size, a) { O.shadowB.add(x, 0.03, z, size, 0, 0, 0, 0, -size, 0, 0, 1, 1, 0, 0, 0, a); }
    // ---- creatures ----
    const seen = new Set();
    for (const e of g.enemies) {
      if (e.dead) continue; const c = A.creatures[e.type]; if (!c) continue; seen.add(e.id); const def = c.def;
      let v = O.vis.get(e.id); if (!v) { v = { t: rnd() * 5, px: e.x, py: e.y, mv: 0, face: e.heading || 0 }; O.vis.set(e.id, v); }
      const sp = dt > 0 ? Math.hypot(e.x - v.px, e.y - v.py) / dt : 0; if (sp > 1) v.face = Math.atan2(e.y - v.py, e.x - v.px); v.px = e.x; v.py = e.y; v.mv += (Math.min(sp, 80) - v.mv) * Math.min(1, dt * 8); v.t += dt * (e.slowT > 0 ? 0.5 : 1);
      let anim = 'idle', at = v.t;
      if (e.atkT > 0.001 && def.animations.attack) { anim = 'attack'; at = Math.max(0, 0.45 - e.atkT); } else if (e.hitT > 0.001 && def.animations.hurt && v.mv < 30) { anim = 'hurt'; at = 0.28 - e.hitT; } else if (v.mv > 5) { anim = 'walk'; at = v.t * (0.6 + Math.min(1.2, v.mv / 30)); }
      const dir = A.dirIndex(sp > 1 || v.mv > 5 ? v.face : e.heading, Math.atan2(cam.z - e.y * S, cam.x - e.x * S), def.directions || 1), fr = A.frame(def, anim, at, dir);
      const k = e.type === 'glumpkin' ? [0, 0.55, 0.78, 1][e.size] : 1, hgt = def.height * k, hov = (def.hover || 0) * (1 + 0.12 * Math.sin(t * 3 + e.id));
      const boost = 1 + (e.flash > 0 ? 5 * e.flash / 0.09 : 0) + (e.slowT > 0 ? 0 : 0), col = light(e.x, e.y, 1.1, boost);
      if (e.slowT > 0) { col[0] *= 0.7; col[1] *= 0.95; col[2] *= 1.25; }
      sprite(O.creatureB[e.type], c, fr, e.x * S, hov, e.y * S, hgt, def.anchor, col);
      blob(e.x * S, e.y * S, e.r * S * 2.3 * (hov ? 0.7 : 1) + 0.15, hov ? 0.35 : 0.6);
    }
    for (const id of O.vis.keys()) if (!seen.has(id)) O.vis.delete(id);
    // ---- corpses: the death animation, then a pause, then they sink away ----
    for (let i = O.corpses.length - 1; i >= 0; i--) {
      const q = O.corpses[i]; q.t += dt; const c = A.creatures[q.type]; if (!c) { O.corpses.splice(i, 1); continue; }
      const def = c.def, hold = 3.2, sink = 1.0; if (q.t > hold + sink) { O.corpses.splice(i, 1); continue; }
      const fr = A.frame(def, 'death', q.t, 0), k = q.type === 'glumpkin' ? [0, 0.55, 0.78, 1][q.size] : 1, shrink = q.t > hold ? 1 - (q.t - hold) / sink : 1;
      const col = light(q.x, q.y, 0.8, 0.9 * (0.4 + 0.6 * shrink)); sprite(O.creatureB[q.type], c, fr, q.x * S, 0, q.y * S, def.height * k * Math.max(0.05, shrink), def.anchor, col);
      blob(q.x * S, q.y * S, def.height * k * 0.45 * shrink, 0.5 * shrink);
    }
    // ---- pickups ----
    for (const p of g.pickups) {
      const pk = A.pickups[p.type]; if (!pk) continue; const blink = p.life < 5 && Math.floor(t * 8) % 2 === 0; if (blink) continue;
      const bob = Math.sin(t * 3 + p.id) * 0.16, y = 0.55 + (pk.def.hover || 1) * 0.35 + bob, sz = pk.def.size || 1.1, b = O.batchFor('pk:' + p.type, pk.tex, 'cut'), col = hex(pk.def.color || '#ffffff');
      b.add(p.x * S, y, p.y * S, rx * sz / 2, 0, rz * sz / 2, 0, sz / 2, 0, 0, 0, 1, 1, 1, 1, 1, 1);
      O.glowB.add(p.x * S, y, p.y * S, rx * sz * 0.95, 0, rz * sz * 0.95, 0, sz * 0.95, 0, 0, 0, 1, 1, col[0], col[1], col[2], 0.55 + 0.2 * Math.sin(t * 5 + p.id));
      blob(p.x * S, p.y * S, 0.5, 0.45);
      if (rnd() < dt * 3) P(O, 'glow', p.x * S + rr(-0.4, 0.4), y - 0.3, p.y * S + rr(-0.4, 0.4), 0, rr(0.5, 1), 0, 0.2, 0.7, col, 0.9, 0, -0.2);
    }
    // ---- machines: floating weapon in the Wobble Chest, sparkles at the anvil ----
    for (const m of g.map.machines) {
      if (m.kind === 'box' && (m.state === 'spin' || m.state === 'ready') && m.weapon) {
        const pool = D.BOX_POOL; let id = m.weapon; if (m.state === 'spin' && m.t < D.BOX.spin - 0.55) id = pool[Math.floor(m.t * 9) % pool.length];
        if (m.state === 'ready' && m.t > D.BOX.hold - 2.5 && Math.floor(t * 8) % 2 === 0) continue;
        const b = O.batchFor('ic:' + id, O.weaponTex(id), 'cut'), sc = 2.4, y = 2.1 + Math.sin(t * 3) * 0.12 + (m.state === 'spin' ? m.t * 0.25 : 0.55), spin = m.state === 'spin' ? Math.abs(Math.cos(t * 5)) * 0.8 + 0.2 : 1;
        b.add(m.cx, y, m.cz, rx * sc / 2 * spin, 0, rz * sc / 2 * spin, 0, sc / 4, 0, 0, 0, 1, 1, 1.2, 1.2, 1.2, 1);
        O.glowB.add(m.cx, y, m.cz, rx * 1.8, 0, rz * 1.8, 0, 1.8, 0, 0, 0, 1, 1, 1, 0.85, 0.3, 0.5 + 0.2 * Math.sin(t * 6));
        if (rnd() < dt * 12) P(O, 'glow', m.cx + rr(-1, 1), y - 0.4, m.cz + rr(-1, 1), 0, rr(0.5, 1.5), 0, 0.25, 0.8, [1, 0.85, 0.3], 0.9, 0, -0.2);
      } else if (m.kind === 'anvil' && rnd() < dt * 3) P(O, 'glow', m.cx + rr(-1.2, 1.2), 1.9, m.cz + rr(-0.5, 0.5), rr(-0.3, 0.3), rr(0.4, 1), rr(-0.3, 0.3), 0.22, 1, [1, 0.85, 0.3], 0.9, 0, -0.2);
    }
    // ---- bullets, spores and beams ----
    for (const b of g.bullets) {
      const age = g.t - b.born, k = Math.min(1, age / 0.09), col = hex(b.color), x = b.x * S, z = b.y * S, y = 1.0 + 0.38 * k, off = 0.38 * (1 - k);
      const bx = x - cam.fz * off * 0 + rx * off, bz = z + rz * off;
      if (b.kind === 'bubble') { const wob = 1 + 0.12 * Math.sin(b.wob), sz = 0.95 * wob; O.pb.bubble.add(bx, y, bz, rx * sz / 2, 0, rz * sz / 2, 0, sz / 2, 0, 0, 0, 1, 1, 1, 1, 1, 0.85); O.glowB.add(bx, y, bz, rx * 0.8, 0, rz * 0.8, 0, 0.8, 0, 0, 0, 1, 1, col[0], col[1], col[2], 0.4); }
      else { const vx = b.vx * S, vz = b.vy * S, n = Math.hypot(vx, vz) || 1; for (let i = 0; i < 3; i++) { const sz = [0.3, 0.22, 0.14][i]; O.glowB.add(bx - vx / n * i * 0.28, y, bz - vz / n * i * 0.28, rx * sz, 0, rz * sz, 0, sz, 0, 0, 0, 1, 1, col[0], col[1], col[2], [1, 0.7, 0.4][i]); } O.glowB.add(bx, y, bz, rx * 0.1, 0, rz * 0.1, 0, 0.1, 0, 0, 0, 1, 1, 1, 1, 1, 1); }
    }
    for (const s of g.spores) { const pulse = 1 + 0.2 * Math.sin(t * 14 + s.x), sz = 0.7 * pulse; O.pb.spore.add(s.x * S, 1.2, s.y * S, rx * sz / 2, 0, rz * sz / 2, 0, sz / 2, 0, 0, 0, 1, 1, 1, 0.6, 1, 1); O.glowB.add(s.x * S, 1.2, s.y * S, rx * 0.9, 0, rz * 0.9, 0, 0.9, 0, 0, 0, 1, 1, 1, 0.3, 0.85, 0.5); }
    for (const bm of g.beams) {
      const a = bm.t / 0.09, col = hex(bm.color), x0 = cam.x + cam.fx * 0.9 + rx * 0.42, z0 = cam.z + cam.fz * 0.9 + rz * 0.42, y0 = 0.95, x1 = bm.x1 * S, z1 = bm.y1 * S, y1 = 1.3;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz) || 1, tx = cam.x - (x0 + x1) / 2, ty = cam.y - (y0 + y1) / 2, tz = cam.z - (z0 + z1) / 2;
      let wx = dy * tz - dz * ty, wy = dz * tx - dx * tz, wz = dx * ty - dy * tx; const wl = Math.hypot(wx, wy, wz) || 1;
      for (const [hw, c0, aa] of [[0.34, col, 0.55 * a], [0.13, [1, 1, 1], 0.95 * a]]) { const k = hw / wl; O.beamB.add((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx / 2 * 1.02, dy / 2, dz / 2 * 1.02, wx * k, wy * k, wz * k, 0.5, 0, 0.5, 1, c0[0], c0[1], c0[2], aa); }
      O.pb.glow.add(x1, y1, z1, rx * 0.7, 0, rz * 0.7, 0, 0.7, 0, 0, 0, 1, 1, col[0], col[1], col[2], 0.7 * a); void l;
    }
    // ---- shock rings ----
    for (let i = O.rings.length - 1; i >= 0; i--) { const r = O.rings[i]; r.t += dt; if (r.t >= r.dur) { O.rings.splice(i, 1); continue; } const k = r.t / r.dur, s = r.r * (0.35 + 0.65 * k); O.ringB.add(r.x, r.y, r.z, s, 0, 0, 0, 0, -s, 0, 0, 1, 1, r.col[0], r.col[1], r.col[2], 0.9 * (1 - k * 0.6)); }
    // ---- floor splats and wall holes ----
    for (let i = O.floorDecals.length - 1; i >= 0; i--) { const d = O.floorDecals[i]; d.life -= dt; if (d.life <= 0) { O.floorDecals.splice(i, 1); continue; } const a = Math.min(1, d.life / 4) * 0.62, sz = d.size * 0.55; O.floorB.add(d.x, 0.045, d.z, sz * Math.cos(d.rot), 0, sz * Math.sin(d.rot), sz * Math.sin(d.rot), 0, -sz * Math.cos(d.rot), 0, 0, 1, 1, d.col[0] * 0.8, d.col[1] * 0.8, d.col[2] * 0.8, a); }
    for (let i = O.wallDecals.length - 1; i >= 0; i--) {
      const d = O.wallDecals[i]; d.life -= dt; if (d.life <= 0) { O.wallDecals.splice(i, 1); continue; } const a = Math.min(1, d.life / 4) * 0.85, s = d.size;
      const rxw = d.nx ? 0 : s, rzw = d.nx ? s : 0; O.wallB.add(d.x, d.y, d.z, d.nx ? 0 : s * d.nz * 1, 0, d.nx ? -s * d.nx : 0, 0, s, 0, 0, 0, 1, 1, 0.15, 0.12, 0.1, a); void rxw; void rzw;
    }
    // ---- particles ----
    const ps = O.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life -= dt; if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 0.6; p.vz *= 1 - dt * 0.6;
      if (p.y < 0.04 && p.grav < 0) { p.y = 0.04; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; }
      const k = p.life / p.max, sz = Math.max(0.02, p.size * (1 + p.grow * (1 - k))) * (p.kind === 'splat' ? 0.5 + 0.5 * k : 1), a = p.a * Math.min(1, k * 2.2), b = O.pb[p.kind];
      b.add(p.x, p.y, p.z, rx * sz / 2, 0, rz * sz / 2, 0, sz / 2, 0, 0, 0, 1, 1, p.r, p.g, p.b, a);
    }
    for (const b of O.batches) b.flush();
    O.flash = Math.max(0, O.flash - dt * 9);
  };
  E.reset = function (O) { O.vis.clear(); O.corpses.length = 0; O.parts.length = 0; O.floorDecals.length = 0; O.wallDecals.length = 0; O.rings.length = 0; O.flash = 0; };
})();
