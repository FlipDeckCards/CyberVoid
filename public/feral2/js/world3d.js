// Feral 2.0 - the 3D level. Turns the rules' tile map (D.buildMap) into Three.js geometry: textured walls, floors and ceilings (merged into a few meshes per room),
// boarded windows, doors, scenery, machines and wall posters, with lantern light baked into the vertex colours (so it costs nothing per frame) and flicker per room.
// World units: 1 unit = 8 sim pixels, so a tile is 2 units. x = sim x / 8, z = sim y / 8, y is up.
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = D.art, K = D.K;
  const S = 1 / 8, TS = 2;
  D.S = S;

  // look of each area: ceiling height, ambient light, lantern colour/strength/radius
  const STYLE = {
    barn:  { H: 3.8, indoor: true,  amb: [0.34, 0.26, 0.24], lc: [1.0, 0.62, 0.3],  li: 1.0, lr: 14, ceil: 'ceiling_wood' },
    patch: { H: 5.2, indoor: false, amb: [0.22, 0.27, 0.42], lc: [1.0, 0.74, 0.35], li: 0.85, lr: 13, ceil: 'sky' },
    mill:  { H: 3.8, indoor: true,  amb: [0.3, 0.23, 0.21],  lc: [1.0, 0.6, 0.25],  li: 1.0, lr: 13, ceil: 'ceiling_wood' },
    crypt: { H: 5.2, indoor: false, amb: [0.18, 0.26, 0.3],  lc: [0.5, 1.0, 0.7],   li: 0.95, lr: 13, ceil: 'sky' },
    pond:  { H: 5.2, indoor: false, amb: [0.18, 0.24, 0.4],  lc: [0.5, 0.8, 1.0],   li: 0.95, lr: 13, ceil: 'sky' },
  };
  const HALL = { H: 3.8, amb: [0.22, 0.19, 0.24], ceil: 'ceiling_stone' };
  const YARD = { H: 3.8, amb: [0.2, 0.3, 0.3], ceil: 'ceiling_stone' };
  const SILL = 0.55, LINTEL = 2.55;

  function GeoBuf() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  GeoBuf.prototype.quad = function (O, U, V, uvw, uvh, lightFn, shadeBot, shadeTop) {
    // O origin, U width vector, V height vector (normal = U x V). lightFn(x,y,z) -> [r,g,b]
    const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0], nl = Math.hypot(nx, ny, nz) || 1;
    const pts = [O, [O[0] + U[0], O[1] + U[1], O[2] + U[2]], [O[0] + U[0] + V[0], O[1] + U[1] + V[1], O[2] + U[2] + V[2]], [O[0] + V[0], O[1] + V[1], O[2] + V[2]]];
    const uvs = [[0, 0], [uvw, 0], [uvw, uvh], [0, uvh]], sh = [shadeBot, shadeBot, shadeTop, shadeTop];
    for (let k = 0; k < 4; k++) {
      const q = pts[k], l = lightFn(q[0] + nx / nl * 0.15, q[1], q[2] + nz / nl * 0.15, nx / nl, ny / nl, nz / nl);
      this.p.push(q[0], q[1], q[2]); this.n.push(nx / nl, ny / nl, nz / nl); this.u.push(uvs[k][0], uvs[k][1]); this.c.push(l[0] * sh[k], l[1] * sh[k], l[2] * sh[k]);
    }
    this.i.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3); this.v += 4;
  };
  GeoBuf.prototype.mesh = function (mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; return m;
  };

  // ---------- sign atlas: every poster, machine sign and door sign shares one texture (one draw call, glows without lighting) ----------
  function buildSignAtlas(map) {
    const CW = 256, CH = 160, cols = 4, entries = [];
    for (const m of map.machines) entries.push({ key: 'm:' + m.id, kind: m.kind, id: m.id });
    for (const w of map.wallbuys) entries.push({ key: 'w:' + w.weapon, kind: 'wall', id: w.weapon });
    for (const d of map.doors) entries.push({ key: 'd:' + d.id, kind: 'door', id: d.id, door: d });
    const rows = Math.ceil(entries.length / cols), c = document.createElement('canvas'); c.width = CW * cols; c.height = CH * rows; const x = c.getContext('2d');
    const uv = {};
    entries.forEach((e, i) => {
      const cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH; uv[e.key] = { u0: cx / c.width, u1: (cx + CW) / c.width, v1: 1 - cy / c.height, v0: 1 - (cy + CH) / c.height };
      x.save(); x.translate(cx, cy);
      const frame = (bg, edge) => { x.fillStyle = bg; x.fillRect(0, 0, CW, CH); x.strokeStyle = edge; x.lineWidth = 8; x.strokeRect(4, 4, CW - 8, CH - 8); };
      const text = (t, y, size, col) => { x.fillStyle = col; x.font = '900 ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, CW / 2, y); };
      if (e.kind === 'perk') { const p = D.PERKS[e.id], im = A.perks[e.id] && A.perks[e.id].img; frame('#1a1030', p.color); if (im) x.drawImage(im, CW / 2 - 40, 14, 80, 80); text(p.name.toUpperCase(), 112, 24, p.color); text(p.cost + '', 143, 24, '#ffe27a'); }
      else if (e.kind === 'box') { frame('#2a1608', '#ffd24a'); text('?', 52, 78, '#ffd24a'); text('WOBBLE CHEST', 112, 25, '#ffe9b0'); text(D.BOX.cost + '', 143, 24, '#ffe27a'); }
      else if (e.kind === 'anvil') { frame('#181a24', '#ffd84a'); x.fillStyle = '#ffd84a'; for (const [sx, sy, sz] of [[CW / 2, 44, 16], [CW / 2 - 50, 62, 10], [CW / 2 + 50, 36, 8], [CW / 2 + 34, 78, 11]]) { x.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? sz * 0.4 : sz, a = k * Math.PI / 4; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.fill(); } text('SPARKLE ANVIL', 112, 24, '#fff0b0'); text(D.UPGRADE.cost + '', 143, 24, '#ffe27a'); }
      else if (e.kind === 'wall') { const wp = D.WEAPONS[e.id], w = A.weapons[e.id]; frame('#d9c08a', '#6a4a22'); x.fillStyle = 'rgba(80,50,20,0.12)'; for (let k = 0; k < 9; k++) x.fillRect(10, 14 + k * 16, CW - 20, 1); if (w && w.icon) x.drawImage(w.icon.img, 20, 8, CW - 40, (CW - 40) / 2); text(wp.name.toUpperCase(), 118, 22, '#3a230a'); text(wp.cost + '  /  ammo ' + Math.round(wp.cost / 2), 142, 17, '#6a2a0a'); }
      else if (e.kind === 'door') { frame('#2a1608', '#ffd24a'); text('OPEN', 36, 28, '#ffe9b0'); text(e.door.name.toUpperCase(), 84, 28, '#ffffff'); text(e.door.cost + '', 128, 40, '#ffe27a'); }
      x.restore();
    });
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.anisotropy = 4;
    return { tex, uv, canvas: c };
  }

  D.world = {};
  D.world.build = function (map, quality) {
    const W = map.w, H = map.h, tiles = map.tiles, area = map.area;
    const root = new THREE.Group(), tex = A.tex;
    const W3 = { root, map, rooms: [], flicker: [], lanterns: [], halos: [], doorViz: [], water: null, planks: null, signs: null, tileSolid: null };
    const kindAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? K.WALL : tiles[y * W + x]);
    const isOpen = (x, y) => kindAt(x, y) !== K.WALL;
    const styleOf = (x, y) => {
      const k = kindAt(x, y), a = area[y * W + x];
      if (k === K.DOOR) return { kind: 'hall', s: HALL, room: -1 };
      if (k === K.POCKET) return { kind: 'yard', s: YARD, room: a };
      const r = D.ROOMS[a >= 0 ? a : 0]; return { kind: r.floor, s: STYLE[r.floor], room: a };
    };

    // ----- lights: lantern positions per room, small coloured glows at machines, one at each corridor -----
    const lights = []; const roomLights = [[], [], [], [], []], hallLights = {};
    for (const r of D.ROOMS) {
      const st = STYLE[r.floor], nx = Math.max(1, Math.round(r.w / 9)), ny = Math.max(1, Math.round(r.h / 8));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const tx = r.x + (i + 0.5) * r.w / nx + (((i + j) % 2) ? 1.2 : -1.2), tz = r.y + (j + 0.5) * r.h / ny + (((i * 2 + j) % 3) - 1) * 0.8;
        const L = { x: tx * TS, y: st.indoor ? st.H - 1.3 : 2.9, z: tz * TS, c: st.lc, i: st.li, r: st.lr, room: r.id, phase: (i * 1.7 + j * 2.9 + r.id * 4.1), hang: st.indoor };
        roomLights[r.id].push(L); lights.push(L);
      }
    }
    for (const d of map.doors) { const L = { x: (d.x + d.w / 2) * TS, y: 2.6, z: (d.y + d.h / 2) * TS, c: [1, 0.7, 0.4], i: 0.7, r: 9, room: -1, phase: d.id * 2.2, hang: true }; hallLights[d.id] = [L]; lights.push(L); }
    const extra = [];     // glows that do not flicker (machines, pumpkins)
    for (const m of map.machines) { const col = m.kind === 'perk' ? D.PERKS[m.id].color : m.kind === 'box' ? '#ffd24a' : '#ffd84a'; const c = new THREE.Color(col); extra.push({ x: (m.x + 1) * TS, y: 1.6, z: (m.y + 0.5) * TS, c: [c.r, c.g, c.b], i: 0.8, r: 7, room: area[m.y * W + m.x] }); }
    for (const b of map.blocks) if (b.style === 'pumpkins') extra.push({ x: (b.x + b.w / 2) * TS, y: 0.8, z: (b.y + b.h / 2) * TS, c: [1, 0.55, 0.15], i: 0.9, r: 7, room: area[b.y * W + b.x] });
    for (const wb of map.wallbuys) { const fy = wb.side === 'S' ? 1 : -1; extra.push({ x: (wb.x + 0.5) * TS, y: 1.6, z: (wb.side === 'S' ? (wb.y + 1) * TS : wb.y * TS) + fy * 1.2, c: [1, 0.85, 0.5], i: 0.55, r: 6, room: area[(wb.y + fy) * W + wb.x] }); }
    const listFor = (st) => (st.kind === 'hall' ? Object.values(hallLights).flat() : st.room >= 0 ? roomLights[st.room] : []);
    function lightFn(st) {
      const amb = st.s.amb, L = st.kind === 'yard' ? [] : listFor(st), E = extra.filter((e) => e.room === st.room);
      return (x, y, z) => {
        let r = amb[0], g = amb[1], b = amb[2];
        for (let k = 0; k < L.length; k++) { const l = L[k], d = Math.hypot(x - l.x, (y - l.y) * 0.7, z - l.z), f = Math.max(0, 1 - d / l.r); const ff = f * f * l.i; r += l.c[0] * ff; g += l.c[1] * ff; b += l.c[2] * ff; }
        for (let k = 0; k < E.length; k++) { const l = E[k], d = Math.hypot(x - l.x, (y - l.y) * 0.7, z - l.z), f = Math.max(0, 1 - d / l.r); const ff = f * f * l.i; r += l.c[0] * ff; g += l.c[1] * ff; b += l.c[2] * ff; }
        return [Math.min(r * 1.25, 1.3), Math.min(g * 1.25, 1.3), Math.min(b * 1.25, 1.3)];
      };
    }
    // the same light, sampled for sprites (so creatures get darker in dark corners and lit near lanterns)
    const lfCache = {};
    W3.lightAt = function (xpx, ypx, y) {
      const tx = Math.max(0, Math.min(W - 1, Math.floor(xpx / D.T))), ty = Math.max(0, Math.min(H - 1, Math.floor(ypx / D.T))), i = ty * W + tx; let st = styleOf(tx, ty);
      const key = st.kind + st.room; const f = lfCache[key] || (lfCache[key] = lightFn(st));
      return f(xpx * S, y == null ? 1.1 : y, ypx * S);
    };

    // ----- static geometry, grouped by (texture, room) so each room can flicker on its own -----
    const bufs = {}, bufFor = (texName, room, shaded) => { const key = texName + '|' + room; return bufs[key] || (bufs[key] = { buf: new GeoBuf(), tex: texName, room, key }); };
    const wallTexFor = (st) => (st.kind === 'yard' ? 'yard_wall' : st.kind === 'hall' ? 'hall_wall' : st.kind + '_wall');
    const floorTexFor = (st) => (st.kind === 'yard' ? 'yard' : st.kind === 'hall' ? 'hall_floor' : st.kind + '_floor');
    const UVS = 4;                                   // world units per texture repeat
    function wallFace(g, st, lf, tx, ty, dir, y0, y1, texName) {         // a wall face on the edge of tile (tx,ty) towards dir
      const x0 = tx * TS, x1 = (tx + 1) * TS, z0 = ty * TS, z1 = (ty + 1) * TS, h = y1 - y0; let O, U, V;
      if (dir === 0) { O = [x1, y0, z1]; U = [0, 0, -TS]; V = [0, h, 0]; }                      // east face, normal +x
      else if (dir === 1) { O = [x0, y0, z0]; U = [0, 0, TS]; V = [0, h, 0]; }                  // west face, normal -x
      else if (dir === 2) { O = [x0, y0, z1]; U = [TS, 0, 0]; V = [0, h, 0]; }                  // south face, normal +z
      else { O = [x1, y0, z0]; U = [-TS, 0, 0]; V = [0, h, 0]; }                                // north face, normal -z
      const B = bufFor(texName, st.room, true).buf, segs = h > 2.5 ? 2 : 1;
      for (let s = 0; s < segs; s++) {
        const a = s / segs, b = (s + 1) / segs, O2 = [O[0], y0 + h * a, O[2]], V2 = [0, h / segs, 0];
        B.quad(O2, U, V2, TS / UVS, (h / segs) / UVS, lf, 0.62 + 0.4 * (y0 + h * a) / 5, 0.62 + 0.4 * (y0 + h * b) / 5);
      }
    }
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];   // neighbour offsets; face dir index: 0 east, 1 west, 2 south, 3 north
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const k = tiles[ty * W + tx]; if (k === K.WALL) continue;
      const st = styleOf(tx, ty), lf = lightFn(st), Hh = st.s.H, x0 = tx * TS, z0 = ty * TS;
      const floorB = bufFor(floorTexFor(st), st.room, false).buf;
      if (k === K.WATER) {
        const wb = bufFor('water', st.room, false).buf; wb.quad([x0, -0.18, z0 + TS], [TS, 0, 0], [0, 0, -TS], TS / 8, TS / 8, lf, 1.15, 1.15);
        const cbw = bufFor(st.s.ceil || 'ceiling_stone', st.room, false).buf; cbw.quad([x0, Hh, z0], [TS, 0, 0], [0, 0, TS], TS / UVS, TS / UVS, lf, 0.7, 0.7);
      } else if (k === K.BARRIER) {
        // sill (a low wall with a wooden top) and lintel: the window is the gap between them
        const b = map.barriers[0] && map.barriers.find((q) => tx >= q.x && tx < q.x + q.w && ty >= q.y && ty < q.y + q.h), dir = b.dir;
        const topB = bufFor('plank', st.room, false).buf; topB.quad([x0, SILL, z0 + TS], [TS, 0, 0], [0, 0, -TS], TS / 3, TS / 3, lf, 1, 1);
        topB.quad([x0, LINTEL, z0], [TS, 0, 0], [0, 0, TS], TS / 3, TS / 3, lf, 0.6, 0.6);
        const dd = dir[0] === 1 ? 0 : dir[0] === -1 ? 1 : dir[1] === 1 ? 2 : 3;
        wallFace(null, st, lf, tx, ty, dd, 0, SILL, wallTexFor(st)); wallFace(null, st, lf, tx, ty, dd, LINTEL, Hh, wallTexFor(st));
        floorB.quad([x0, 0, z0 + TS], [TS, 0, 0], [0, 0, -TS], TS / UVS, TS / UVS, lf, 1, 1);
      } else {
        floorB.quad([x0, 0, z0 + TS], [TS, 0, 0], [0, 0, -TS], TS / UVS, TS / UVS, lf, 1, 1);
        const cb = bufFor(st.s.ceil || 'ceiling_stone', st.room, false).buf; cb.quad([x0, Hh, z0], [TS, 0, 0], [0, 0, TS], TS / UVS, TS / UVS, lf, 0.7, 0.7);
      }
      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d], ny = ty + DY[d], nk = kindAt(nx, ny);
        if (nk === K.WALL) {
          // the wall on the far side of this open tile: its face points back at us
          const faceDir = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2;
          // (a wall to the east of this tile has its WEST face visible, etc.)
          wallFace(null, st, lf, nx, ny, faceDir, 0, Hh, wallTexFor(st));
        } else if (nk !== K.WATER && k !== K.WATER) {
          const ns = styleOf(nx, ny);
          if (ns.s.H < Hh) { const faceDir = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2; wallFace(null, st, lf, nx, ny, faceDir, ns.s.H, Hh, wallTexFor(ns)); }
        } else if (k === K.WATER && nk !== K.WATER) {
          const faceDir = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2; const ns = styleOf(nx, ny); wallFace(null, st, lightFn(ns), nx, ny, faceDir, -0.18, 0, 'mill_wall');
        }
      }
    }
    // the faces of the wall above: skip (handled above). Now the fix-ups: wallFace for a WALL tile is emitted from the open neighbour, in that tile's texture.

    // ----- scenery -----
    const prop = (texName, room, lf) => bufFor(texName, room, false).buf;
    function box(B, cx, y0, cz, sx, sy, sz, lf, uvs) {
      const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy, us = uvs || 1;
      B.quad([x1, y0, z1], [0, 0, -sz], [0, sy, 0], sz / us / 2, sy / us / 2, lf, 0.7, 1); B.quad([x0, y0, z0], [0, 0, sz], [0, sy, 0], sz / us / 2, sy / us / 2, lf, 0.7, 1);
      B.quad([x0, y0, z1], [sx, 0, 0], [0, sy, 0], sx / us / 2, sy / us / 2, lf, 0.7, 1); B.quad([x1, y0, z0], [-sx, 0, 0], [0, sy, 0], sx / us / 2, sy / us / 2, lf, 0.7, 1);
      B.quad([x0, y1, z1], [sx, 0, 0], [0, 0, -sz], sx / us / 2, sz / us / 2, lf, 1.1, 1.1);
    }
    function cyl(B, cx, y0, cz, rad, hh, seg, lf, bulge) {
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2, r0 = rad, rm = rad * (bulge || 1);
        const p0 = [cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0], p1 = [cx + Math.cos(a1) * r0, cz + Math.sin(a1) * r0];
        // outward normal faces: U runs along the circle (counter-clockwise seen from above is -z..), pick order so the normal points outwards
        B.quad([p1[0], y0, p1[1]], [p0[0] - p1[0], 0, p0[1] - p1[1]], [0, hh, 0], 1 / seg * 2, hh / 2, lf, 0.75, 1);
        void rm;
      }
      const top = []; for (let s = 0; s < seg; s++) { void top; }
      B.quad([cx - rad * 0.7, y0 + hh, cz + rad * 0.7], [rad * 1.4, 0, 0], [0, 0, -rad * 1.4], 0.6, 0.6, lf, 1.1, 1.1);
    }
    function ball(B, cx, cy, cz, rx, ry, rz, lf, seg) {
      const rings = 5; seg = seg || 8;
      for (let j = 0; j < rings; j++) for (let s = 0; s < seg; s++) {
        const t0 = j / rings * Math.PI, t1 = (j + 1) / rings * Math.PI, a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        const P = (t, a) => [cx + Math.sin(t) * Math.cos(a) * rx, cy - Math.cos(t) * ry, cz + Math.sin(t) * Math.sin(a) * rz];
        const p00 = P(t0, a0), p10 = P(t0, a1), p11 = P(t1, a1), p01 = P(t1, a0);
        // quad p00,p10,p11,p01: build with origin p01 -> p11 (u) and p01 -> p00 (v) to keep the winding outward
        const U = [p11[0] - p01[0], p11[1] - p01[1], p11[2] - p01[2]], V = [p00[0] - p01[0], p00[1] - p01[1], p00[2] - p01[2]];
        B.quad(p01, U, V, 0.5, 0.5, lf, 0.8, 1);
      }
    }
    for (const b of map.blocks) {
      const room = area[b.y * W + b.x], st = styleOf(b.x, b.y), lf = lightFn(st);
      if (b.style === 'crate') { const B = prop('crate', room); const cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS; box(B, cx, 0, cz, b.w * TS - 0.15, 1.5, b.h * TS - 0.15, lf, 2); if (b.w > 1 && b.h > 1) box(B, cx + 0.3, 1.5, cz - 0.2, b.w * TS * 0.5, 1.0, b.h * TS * 0.5, lf, 2); }
      else if (b.style === 'barrel') { const B = prop('barrel', room); for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) cyl(B, (xx + 0.5) * TS, 0, (yy + 0.5) * TS, 0.85, 1.7, 10, lf); }
      else if (b.style === 'hay') { const B = prop('hay', room); box(B, (b.x + b.w / 2) * TS, 0, (b.y + b.h / 2) * TS, b.w * TS - 0.2, 1.7, b.h * TS - 0.2, lf, 2); }
      else if (b.style === 'pumpkins') { const B = prop('pumpkin', room); let n = 0; for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) { const s = 0.8 + ((xx * 7 + yy * 3) % 4) * 0.12; ball(B, (xx + 0.5) * TS - 0.2, s * 0.85, (yy + 0.5) * TS + 0.15, s * 0.95, s * 0.8, s * 0.95, lf); if ((n++ % 2) === 0) ball(B, (xx + 0.5) * TS + 0.45, 0.5, (yy + 0.5) * TS - 0.4, 0.5, 0.45, 0.5, lf); } }
      else if (b.style === 'grave') { const B = prop('grave', room); const cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS; if (b.h >= b.w) { box(B, cx, 0, cz, 0.55, 2.0, 1.4, lf, 2); box(B, cx, 2.0, cz, 0.55, 0.35, 0.8, lf, 2); } else { box(B, cx, 0, cz, 1.4, 2.0, 0.55, lf, 2); box(B, cx, 2.0, cz, 0.8, 0.35, 0.55, lf, 2); } }
    }
    // machines: cabinets (the glowing sign goes in the sign atlas)
    const atlas = W3.atlas = buildSignAtlas(map);
    const signB = new GeoBuf(); signB.c = []; const signQuads = [];
    function signQuad(B, key, O, U, V) {
      const q = atlas.uv[key]; const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0], nl = Math.hypot(nx, ny, nz) || 1;
      const pts = [O, [O[0] + U[0], O[1] + U[1], O[2] + U[2]], [O[0] + U[0] + V[0], O[1] + U[1] + V[1], O[2] + U[2] + V[2]], [O[0] + V[0], O[1] + V[1], O[2] + V[2]]], uvs = [[q.u0, q.v0], [q.u1, q.v0], [q.u1, q.v1], [q.u0, q.v1]];
      for (let k = 0; k < 4; k++) { B.p.push(pts[k][0], pts[k][1], pts[k][2]); B.n.push(nx / nl, ny / nl, nz / nl); B.u.push(uvs[k][0], uvs[k][1]); B.c.push(1, 1, 1); }
      B.i.push(B.v, B.v + 1, B.v + 2, B.v, B.v + 2, B.v + 3); B.v += 4;
    }
    const frontOf = (m) => {                           // which way a machine faces: the side that has open floor
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const a = kindAt(m.x + dx, m.y + dy), b = kindAt(m.x + 1 + dx, m.y + dy); if (a === K.FLOOR && b === K.FLOOR && !(dx !== 0 && false)) return [dx, dy]; }
      return [0, 1];
    };
    for (const m of map.machines) {
      const room = area[m.y * W + m.x], st = styleOf(m.x, m.y), lf = lightFn(st), f = frontOf(m), cx = (m.x + 1) * TS, cz = (m.y + 0.5) * TS;
      const col = m.kind === 'perk' ? new THREE.Color(D.PERKS[m.id].color) : new THREE.Color(m.kind === 'box' ? '#c8902a' : '#8a8aa0');
      const B = bufFor(m.kind === 'anvil' ? 'mill_wall' : 'crate', room, false).buf;
      // body: a cabinet pushed up to its wall (front towards the open side)
      const along = f[0] === 0;                         // front is north/south: the machine is 4 wide along x
      const sx = along ? 3.6 : 1.7, sz = along ? 1.7 : 3.6;
      if (m.kind === 'anvil') { box(B, cx, 0, cz, along ? 1.5 : 1.0, 0.8, along ? 1.0 : 1.5, lf, 2); box(B, cx, 0.8, cz, along ? 3.2 : 1.4, 0.6, along ? 1.4 : 3.2, lf, 2); box(B, cx, 1.4, cz, along ? 2.4 : 1.0, 0.4, along ? 1.0 : 2.4, lf, 2); }
      else if (m.kind === 'box') { box(B, cx, 0, cz, sx * 0.9, 1.35, sz * 0.9, lf, 2); box(B, cx, 1.35, cz, sx * 0.95, 0.3, sz * 0.95, lf, 2); }
      else { box(B, cx, 0, cz, sx, 3.0, sz, lf, 2); box(B, cx, 3.0, cz, sx * 1.05, 0.25, sz * 1.05, lf, 2); }
      void col;
      // sign on the front face
      const sw = m.kind === 'anvil' ? 2.8 : 3.2, sh = sw * 160 / 256, base = m.kind === 'perk' ? 1.15 : m.kind === 'box' ? 0.1 : 1.9;
      const off = m.kind === 'anvil' ? 0.2 : (along ? sz : sx) / 2 + 0.02;
      if (f[1] !== 0) { const z = cz + f[1] * off; signQuad(signB, 'm:' + m.id, [cx - sw / 2 * f[1], base, z], [sw * f[1], 0, 0], [0, sh, 0]); }
      else { const x = cx + f[0] * off; signQuad(signB, 'm:' + m.id, [x, base, cz + sw / 2 * f[0]], [0, 0, -sw * f[0]], [0, sh, 0]); }
      m.front = f; m.cx = cx; m.cz = cz;
    }
    // wall posters
    for (const wb of map.wallbuys) {
      const fy = wb.side === 'S' ? 1 : -1, z = wb.side === 'S' ? (wb.y + 1) * TS + 0.03 : wb.y * TS - 0.03, cx = (wb.x + 0.5) * TS, pw = 3.0, ph = pw * 160 / 256;
      if (fy === 1) signQuad(signB, 'w:' + wb.weapon, [cx - pw / 2, 1.0, z], [pw, 0, 0], [0, ph, 0]); else signQuad(signB, 'w:' + wb.weapon, [cx + pw / 2, 1.0, z], [-pw, 0, 0], [0, ph, 0]);
    }

    // build meshes from the buffers
    const matCache = {};
    function lambert(texName, room) {
      const key = texName + '|' + room; if (matCache[key]) return matCache[key];
      const t = tex[texName]; let m;
      if (texName === 'sky') m = new THREE.MeshBasicMaterial({ map: t, color: 0x9a9ad0 });
      else m = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, color: 0xffffff });
      return (matCache[key] = m);
    }
    for (const key of Object.keys(bufs)) {
      const e = bufs[key]; if (!e.buf.v) continue;
      const mat = lambert(e.tex, e.room), mesh = e.buf.mesh(mat);
      if (e.tex === 'sky') { mesh.geometry.deleteAttribute('color'); }
      root.add(mesh); if (e.tex === 'water') W3.water = t0(mat);
      if (e.room >= 0 && e.tex !== 'sky' && e.tex !== 'water') (W3.flicker[e.room] = W3.flicker[e.room] || []).push(mat);
    }
    function t0(m) { return m; }
    // dedupe flicker material lists
    for (let i = 0; i < W3.flicker.length; i++) if (W3.flicker[i]) W3.flicker[i] = Array.from(new Set(W3.flicker[i]));
    // glowing signs (unlit)
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(signB.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(signB.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(signB.u, 2)); g.setIndex(signB.i);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: atlas.tex, color: 0xdddddd })); m.matrixAutoUpdate = false; m.frustumCulled = false; root.add(m); W3.signMat = m.material; }

    // ----- lantern props and halos -----
    const lanternMat = [];   // one Basic material per room (flicker)
    for (let r = 0; r < roomLights.length; r++) {
      const L = roomLights[r], st = STYLE[D.ROOMS[r].floor], col = new THREE.Color(st.lc[0], st.lc[1], st.lc[2]);
      const B = new GeoBuf(); const lf = () => [1, 1, 1];
      for (const l of L) { box(B, l.x, l.y - 0.3, l.z, 0.55, 0.6, 0.55, lf, 2); if (l.hang) { box(B, l.x, l.y + 0.3, l.z, 0.1, st.H - l.y - 0.3, 0.1, lf, 2); } }
      const m = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.35), map: null }); lanternMat[r] = m;
      const mesh = B.mesh(m); mesh.geometry.deleteAttribute('color'); mesh.geometry.deleteAttribute('uv'); root.add(mesh);
      if (quality.halos) {
        const pos = new Float32Array(L.length * 3); L.forEach((l, i) => { pos[i * 3] = l.x; pos[i * 3 + 1] = l.y - 0.3; pos[i * 3 + 2] = l.z; });
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pm = new THREE.PointsMaterial({ map: A.glow, color: col, size: 4.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, fog: false });
        const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; root.add(pts); W3.halos[r] = pm;
      }
    }
    W3.lanternMat = lanternMat;

    // ----- boarded windows: planks drawn as two instanced meshes (along x and along z) -----
    {
      const nb = map.barriers.length, PER = 6, plankTex = tex.plank;
      const gx = new THREE.BoxGeometry(TS * 3 - 0.3, 0.3, 0.2), gz = new THREE.BoxGeometry(0.2, 0.3, TS * 3 - 0.3);
      const mk = (geo) => { const m = new THREE.MeshLambertMaterial({ map: plankTex, color: 0xffffff }); const im = new THREE.InstancedMesh(geo, m, nb * PER); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im; };
      const ix = mk(gx), iz = mk(gz); W3.planks = { ix, iz, PER, last: new Int8Array(nb).fill(-1), seed: map.barriers.map((b) => b.id * 7.13) };
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0), p = new THREE.Vector3(), e = new THREE.Euler();
      W3.planks.apply = function (b, jig) {
        const along = b.dir[1] !== 0;                              // N/S window: boards run along x
        const im = along ? ix : iz, cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS;
        for (let k = 0; k < PER; k++) {
          const vis = k < b.planks, id = b.id * PER + k, y = SILL + 0.18 + k * 0.33 + (k > 2 ? 0.0 : 0), tilt = Math.sin(b.id * 3.1 + k * 2.3) * 0.05 + (jig ? Math.sin(jig * 40 + k) * 0.04 : 0);
          p.set(cx + b.dir[0] * 0.55, y, cz + b.dir[1] * 0.55); e.set(along ? tilt : 0, 0, along ? 0 : tilt); q.setFromEuler(e); m4.compose(p, q, vis ? s1 : s0);
          // the whole row of boards shifts a little in and out so it does not look like a ladder
          im.setMatrixAt(id - (along ? 0 : 0), m4);
        }
        im.instanceMatrix.needsUpdate = true;
      };
      const lt = new THREE.Color();
      map.barriers.forEach((b) => { const l = W3.lightAt((b.x + b.w / 2) * D.T + b.dir[0] * 12, (b.y + b.h / 2) * D.T + b.dir[1] * 12, 1.6); lt.setRGB(Math.min(1, l[0] * 1.1), Math.min(1, l[1] * 1.1), Math.min(1, l[2] * 1.1)); for (let k = 0; k < PER; k++) { (b.dir[1] !== 0 ? ix : iz).setColorAt(b.id * PER + k, lt); } W3.planks.apply(b, 0); W3.planks.last[b.id] = b.planks; });
      ix.instanceColor.needsUpdate = true; iz.instanceColor.needsUpdate = true;
    }

    // ----- doors: a slab at the barn end of each corridor that slides up when bought -----
    for (const d of map.doors) {
      let f;                                                      // direction from the corridor towards the barn
      if (d.w < d.h) f = kindAt(d.x + 1, d.y - 1) === K.FLOOR && area[(d.y - 1) * W + d.x + 1] === 0 ? [0, -1] : [0, 1]; else f = kindAt(d.x - 1, d.y + 1) === K.FLOOR && area[(d.y + 1) * W + d.x - 1] === 0 ? [-1, 0] : [1, 0];
      const vertical = d.w < d.h, cx = (d.x + d.w / 2) * TS, cz = (d.y + d.h / 2) * TS;
      const sx = vertical ? d.w * TS : 0.7, sz = vertical ? 0.7 : d.h * TS;
      const px = vertical ? cx : (f[0] === -1 ? d.x * TS + 0.35 : (d.x + d.w) * TS - 0.35), pz = vertical ? (f[1] === -1 ? d.y * TS + 0.35 : (d.y + d.h) * TS - 0.35) : cz;
      const grp = new THREE.Group(); grp.position.set(px, 0, pz); root.add(grp);
      const geo = new THREE.BoxGeometry(sx, HALL.H, sz); const lc = W3.lightAt(cx / S + f[0] * 20, cz / S + f[1] * 20, 1.6);
      const slabMat = new THREE.MeshLambertMaterial({ map: tex.door, color: new THREE.Color(Math.min(1, lc[0] * 1.1), Math.min(1, lc[1] * 1.1), Math.min(1, lc[2] * 1.1)) });
      const slab = new THREE.Mesh(geo, slabMat); slab.position.y = HALL.H / 2; grp.add(slab);
      // the sign on the barn-facing side
      const sw = 3.4, sh = sw * 160 / 256, sg = new GeoBuf(); const q = atlas.uv['d:' + d.id];
      const sgeo = new THREE.PlaneGeometry(sw, sh); const uv = sgeo.attributes.uv; uv.setXY(0, q.u0, q.v1); uv.setXY(1, q.u1, q.v1); uv.setXY(2, q.u0, q.v0); uv.setXY(3, q.u1, q.v0);
      const sign = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({ map: atlas.tex, color: 0xdddddd })); sign.position.set(f[0] * (sx / 2 + 0.02), 2.3, f[1] * (sz / 2 + 0.02)); sign.rotation.y = f[1] === 1 ? 0 : f[1] === -1 ? Math.PI : f[0] === 1 ? Math.PI / 2 : -Math.PI / 2; grp.add(sign);
      void sg;
      W3.doorViz.push({ idx: map.doors.indexOf(d), grp, open: 0, f, px, pz });
    }

    // ----- moving things in the world: each frame -----
    W3.update = function (g, dt, t) {
      for (let r = 0; r < W3.flicker.length; r++) {
        const mats = W3.flicker[r]; if (!mats) continue;
        const f = 0.93 + 0.05 * Math.sin(t * 7.1 + r * 2.3) + 0.03 * Math.sin(t * 13.7 + r) + (Math.sin(t * 2.3 + r * 5) > 0.97 ? -0.15 : 0);
        for (const m of mats) m.color.setScalar(f);
        if (W3.halos[r]) W3.halos[r].opacity = 0.65 + 0.2 * (f - 0.93) * 8;
        if (lanternMat[r]) lanternMat[r].color.setScalar(0.85 + (f - 0.9) * 2.2);
      }
      if (W3.water) { W3.water.map.offset.x = (t * 0.02) % 1; W3.water.map.offset.y = (t * 0.013) % 1; }
      for (const v of W3.doorViz) { const target = g.map.doors[v.idx].open ? 1 : 0; v.open += Math.sign(target - v.open) * Math.min(Math.abs(target - v.open), dt * 0.9); v.grp.position.y = v.open * (HALL.H + 0.4); v.grp.visible = v.open < 0.999; }
      const pl = W3.planks, bs = g.map.barriers;
      for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (pl.last[i] !== b.planks || b.hit > 0) { pl.apply(b, b.hit > 0 ? b.hit : 0); pl.last[i] = b.planks; } }
    };
    W3.resetDynamic = function () { for (const v of W3.doorViz) { v.open = 0; v.grp.position.y = 0; v.grp.visible = true; } W3.planks.last.fill(-1); };
    W3.dispose = function () { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); };
    return W3;
  };
})();
