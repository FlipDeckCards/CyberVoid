// Feral 3.0 - the level. Turns the rules' tile map (the same grid the creatures path-find on) into a lit, textured 3D jungle park: PBR floors and walls, boarded barricades,
// gates, the visitor centre, wrecks, trees and foliage, water and lava, a night sky with a moon, and a pool of flickering lights.
// World units are metres: x = sim x / 8, z = sim y / 8, y is up; a tile is 2 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from './assets.mjs';

const D = window.DZF, K = D.K, TS = 2, S = 1 / 8;
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hex = (c) => new THREE.Color(c);

const STYLE = {
  plaza:    { H: 6.5, wall: 'wall',  floor: 'concrete', floorB: 'grass',    uvw: 4, tint: 0xc8d0c8 },
  jungle:   { H: 9,   wall: 'rock',  floor: 'dirt',     floorB: 'grass',    uvw: 5, tint: 0xa8b8a0 },
  compound: { H: 5.5, wall: 'wall',  floor: 'asphalt',  floorB: 'concrete', uvw: 4, tint: 0xb8c0c8 },
  cave:     { H: 11,  wall: 'basalt', floor: 'basalt',  floorB: null,       uvw: 5, tint: 0xffffff, ceil: 'basalt' },
  hall:     { H: 4.4, wall: 'wall',  floor: 'concrete', floorB: null,       uvw: 4, tint: 0x9aa098, ceil: 'asphalt' },
  yard:     { H: 6.5, wall: 'rock',  floor: 'dirt',     floorB: null,       uvw: 5, tint: 0x6a7a68 },
};

// ---------- small geometry helpers ----------
function GeoBuf() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
GeoBuf.prototype.quad = function (O, U, V, uvw, uvh, shadeBot, shadeTop, u0 = 0, v0 = 0) {
  const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0], nl = Math.hypot(nx, ny, nz) || 1;
  const pts = [O, [O[0] + U[0], O[1] + U[1], O[2] + U[2]], [O[0] + U[0] + V[0], O[1] + U[1] + V[1], O[2] + U[2] + V[2]], [O[0] + V[0], O[1] + V[1], O[2] + V[2]]];
  const uvs = [[u0, v0], [u0 + uvw, v0], [u0 + uvw, v0 + uvh], [u0, v0 + uvh]], sh = [shadeBot, shadeBot, shadeTop, shadeTop];
  for (let k = 0; k < 4; k++) { this.p.push(pts[k][0], pts[k][1], pts[k][2]); this.n.push(nx / nl, ny / nl, nz / nl); this.u.push(uvs[k][0], uvs[k][1]); this.c.push(sh[k], sh[k], sh[k]); }
  this.i.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3); this.v += 4;
};
GeoBuf.prototype.geometry = function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); g.computeBoundingSphere(); return g;
};
function whiten(g, v = 1) { if (!g.attributes.color) { const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(v); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); } return g; }
function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
function fbm2(x, y) { let s = 0, a = 0.5; for (let o = 0; o < 4; o++) { s += Math.sin(x * (1 + o * 1.7) + Math.cos(y * (1.3 + o * 1.1)) * 1.7 + o * 3.1) * Math.cos(y * (0.9 + o * 1.9) - x * 0.5 + o) * a; a *= 0.5; x *= 1.9; y *= 1.9; } return s; }

// ---------- materials ----------
function pbr(name, o = {}) {
  const t = assets.tex[name]; if (!t) throw new Error('missing texture set ' + name);
  const m = new THREE.MeshStandardMaterial({ map: t.a, normalMap: t.n, aoMap: t.orm, roughnessMap: t.orm, metalnessMap: t.orm, roughness: o.roughness == null ? 1 : o.roughness, metalness: o.metalness == null ? 1 : o.metalness, color: o.color == null ? 0xffffff : o.color, vertexColors: o.vc !== false, envMapIntensity: o.env == null ? 0.7 : o.env });
  m.normalScale.set(o.ns == null ? 1 : o.ns, o.ns == null ? 1 : o.ns); if (t.e && o.emissive) { m.emissiveMap = t.e; m.emissive.set(0xffffff); m.emissiveIntensity = o.emissive; }
  if (o.side) m.side = o.side; return m;
}
// ground that blends two texture sets (e.g. concrete and grass) with a world-space noise mask
function groundMaterial(a, b, maskScale) {
  const m = pbr(a, { env: 0.5 }), tb = assets.tex[b], mask = assets.tex.noise;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMask = { value: mask }; shader.uniforms.uMapB = { value: tb.a }; shader.uniforms.uNormB = { value: tb.n }; shader.uniforms.uOrmB = { value: tb.orm }; shader.uniforms.uMaskScale = { value: maskScale || 0.045 };
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform sampler2D uMask, uMapB, uNormB, uOrmB; uniform float uMaskScale; varying vec3 vWPos;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\n float bm = smoothstep(0.46, 0.66, texture2D(uMask, vWPos.xz * uMaskScale).r * 0.7 + texture2D(uMask, vWPos.xz * uMaskScale * 3.1 + 0.37).r * 0.45 - 0.08);\n diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uMapB, vMapUv).rgb * vColor.rgb, bm);')
      .replace(/texture2D\( roughnessMap, vRoughnessMapUv \)/, 'mix(texture2D( roughnessMap, vRoughnessMapUv ), texture2D(uOrmB, vRoughnessMapUv), bm)')
      .replace(/texture2D\( metalnessMap, vMetalnessMapUv \)/, 'mix(texture2D( metalnessMap, vMetalnessMapUv ), texture2D(uOrmB, vMetalnessMapUv), bm)')
      .replace(/texture2D\( normalMap, vNormalMapUv \)\.xyz/, 'mix(texture2D( normalMap, vNormalMapUv ).xyz, texture2D(uNormB, vNormalMapUv).xyz, bm)')
      .replace(/texture2D\( aoMap, vAoMapUv \)\.r/, 'mix(texture2D( aoMap, vAoMapUv ).r, texture2D(uOrmB, vAoMapUv).r, bm)');
  };
  m.customProgramCacheKey = () => 'ground' + a + b; return m;
}
// foliage that sways in the wind
function foliageMaterial(tex, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, color: o.color || 0xffffff, envMapIntensity: 0.5, alphaToCoverage: true, emissive: o.emissive || 0x000000 });
  const uTime = { value: 0 }; m.userData.uTime = uTime;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5;
      #else
        float ph = 0.0;
      #endif
      float sw = uv.y * uv.y * ${(o.sway == null ? 0.09 : o.sway).toFixed(3)};
      transformed.x += sin(uTime * 1.4 + ph) * sw + sin(uTime * 3.1 + ph * 2.0) * sw * 0.3; transformed.z += cos(uTime * 1.1 + ph * 1.3) * sw;`);
  };
  m.customProgramCacheKey = () => 'foliage' + (o.sway || 0); return m;
}
// signs and posters drawn on a canvas
export function canvasTexture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function signTexture(lines, bg, fg, accent) {
  return canvasTexture(512, 256, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = accent; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 12; i++) x.fillRect(0, i * 22, w, 2);
    x.textAlign = 'center'; x.textBaseline = 'middle'; lines.forEach((l, i) => { x.fillStyle = l.c || fg; x.font = '900 ' + l.s + 'px "Segoe UI", "Trebuchet MS", sans-serif'; x.fillText(l.t, w / 2, l.y); });
  });
}

// ---------- the builder ----------
export function buildWorld(map, quality, game) {
  const W = map.w, H = map.h, tiles = map.tiles, area = map.area, root = new THREE.Group(), R = rng(1337);
  const wd = { root, map, lights: [], mats: {}, foliageMats: [], flicker: [], doors: [], planks: null, water: [], lava: [], emissiveMats: [], machines: [], posters: [], dynamic: [] };
  const kindAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? K.WALL : tiles[y * W + x]);
  const roomName = (a) => D.ROOMS[a >= 0 ? a : 0].floor;
  const styleOf = (x, y) => { const k = kindAt(x, y), a = area[y * W + x]; if (k === K.DOOR) return { key: 'hall', s: STYLE.hall, room: -1 }; if (k === K.POCKET) return { key: 'yard', s: STYLE.yard, room: a }; const n = roomName(a); return { key: n, s: STYLE[n], room: a }; };

  // materials (one per texture set / tint), created lazily
  const mats = wd.mats, getMat = (key, f) => mats[key] || (mats[key] = f());
  const wallMat = (name, tint) => getMat('wall:' + name + ':' + tint, () => pbr(name, { color: tint, ns: name === 'rock' || name === 'basalt' ? 1.3 : 1 }));

  // ----- sky dome with moon and stars, and the environment lighting made from it -----
  const moonDir = new THREE.Vector3(-0.42, 0.68, 0.34).normalize();
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uMoon: { value: moonDir }, uTime: { value: 0 }, uCloud: { value: assets.tex.noise }, uDark: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 uMoon; uniform float uTime, uDark; uniform sampler2D uCloud;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir); float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(vec3(0.045, 0.06, 0.085), vec3(0.008, 0.016, 0.05), pow(clamp(h, 0.0, 1.0), 0.5));
        col += vec3(0.05, 0.075, 0.09) * pow(1.0 - clamp(h, 0.0, 1.0), 4.0);
        vec3 sp = floor(d * 220.0); float st = step(0.9975, hash(sp)); col += st * (0.5 + 0.5 * hash(sp + 3.0)) * smoothstep(0.1, 0.5, h);
        float md = dot(d, uMoon); col += vec3(0.8, 0.88, 1.0) * smoothstep(0.9992, 0.9996, md) * 2.4; col += vec3(0.25, 0.32, 0.5) * pow(max(md, 0.0), 90.0) * 0.5 + vec3(0.1, 0.14, 0.24) * pow(max(md, 0.0), 8.0) * 0.4;
        vec2 cuv = d.xz / (d.y + 0.35) * 0.5 + uTime * 0.004; float cl = smoothstep(0.52, 0.8, texture2D(uCloud, cuv).r) * smoothstep(0.0, 0.25, h); col = mix(col, vec3(0.1, 0.12, 0.17) + vec3(0.14, 0.16, 0.22) * pow(max(md, 0.0), 4.0), cl * 0.7);
        gl_FragColor = vec4(col * (1.0 - uDark), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noAO = true; root.add(sky); wd.sky = sky; wd.moonDir = moonDir;

  // ----- lights (a list of candidates; a small pool of real lights is moved between the nearest ones each frame) -----
  const addLight = (x, y, z, color, intensity, range, o = {}) => wd.lights.push(Object.assign({ x, y, z, color: hex(color), intensity, range, flicker: 0.1, phase: R() * 100, group: 'misc' }, o));

  // ----- terrain: floors, walls, ceilings, grouped by material -----
  const floorBufs = {}, wallBufs = {}, ceilBufs = {};
  const fb = (room, key, a, b) => floorBufs[room + key] || (floorBufs[room + key] = { buf: new GeoBuf(), a, b, room, key });
  const wb = (name, tint, uvw) => wallBufs[name + tint] || (wallBufs[name + tint] = { buf: new GeoBuf(), name, tint, uvw });
  function wallFace(st, tx, ty, dir, y0, y1) {
    const x0 = tx * TS, x1 = (tx + 1) * TS, z0 = ty * TS, z1 = (ty + 1) * TS, h = y1 - y0; let O, U, V;
    if (dir === 0) { O = [x1, y0, z1]; U = [0, 0, -TS]; V = [0, h, 0]; } else if (dir === 1) { O = [x0, y0, z0]; U = [0, 0, TS]; V = [0, h, 0]; }
    else if (dir === 2) { O = [x0, y0, z1]; U = [TS, 0, 0]; V = [0, h, 0]; } else { O = [x1, y0, z0]; U = [-TS, 0, 0]; V = [0, h, 0]; }
    const B = wb(st.s.wall, st.s.tint, st.s.uvw).buf, segs = Math.max(1, Math.round(h / 3));
    for (let s = 0; s < segs; s++) { const a = s / segs, b = (s + 1) / segs, O2 = [O[0], y0 + h * a, O[2]]; const uw = st.s.uvw, uu0 = dir === 0 ? -O[2] / uw : dir === 1 ? O[2] / uw : dir === 2 ? O[0] / uw : -O[0] / uw; B.quad(O2, U, [0, h / segs, 0], TS / uw, (h / segs) / uw, 0.55 + 0.45 * Math.min(1, (y0 + h * a) / 3), 0.55 + 0.45 * Math.min(1, (y0 + h * b) / 3), uu0, O2[1] / uw); }
  }
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const k = tiles[ty * W + tx]; if (k === K.WALL) continue;
    const st = styleOf(tx, ty), x0 = tx * TS, z0 = ty * TS, Hh = st.s.H;
    if (k !== K.BARRIER && k !== K.WATER) { const f = fb(st.room, st.key, st.s.floor, st.s.floorB); f.buf.quad([x0, 0, z0 + TS], [TS, 0, 0], [0, 0, -TS], TS / 4, TS / 4, 1, 1, x0 / 4, -(z0 + TS) / 4); }
    if (k !== K.BARRIER && st.s.ceil) { const c = ceilBufs[st.s.ceil] || (ceilBufs[st.s.ceil] = { buf: new GeoBuf(), name: st.s.ceil }); c.buf.quad([x0, Hh, z0], [TS, 0, 0], [0, 0, TS], TS / 5, TS / 5, 0.5, 0.5, x0 / 5, z0 / 5); }
    for (let d = 0; d < 4; d++) {
      const nx = tx + DX[d], ny = ty + DY[d], nk = kindAt(nx, ny), faceDir = d === 0 ? 1 : d === 1 ? 0 : d === 2 ? 3 : 2;
      if (nk === K.WALL) wallFace(st, nx, ny, faceDir, 0, Hh);
      else if (nk !== K.WATER && k !== K.WATER) { const ns = styleOf(nx, ny); if (ns.s.H < Hh && k !== K.BARRIER && nk !== K.BARRIER) wallFace(ns, nx, ny, faceDir, ns.s.H, Hh); }
    }
  }
  const tileGroup = new THREE.Group(); root.add(tileGroup);
  for (const f of Object.values(floorBufs)) { if (!f.buf.v) continue; const g = f.buf.geometry(), m = f.b ? getMat('ground:' + f.a + f.b, () => groundMaterial(f.a, f.b)) : getMat('floor:' + f.a, () => pbr(f.a, { ns: f.a === 'basalt' ? 1.4 : 1, emissive: f.a === 'basalt' ? 0.6 : 0 })); const me = new THREE.Mesh(g, m); me.receiveShadow = true; me.castShadow = false; me.matrixAutoUpdate = false; tileGroup.add(me); }
  for (const w of Object.values(wallBufs)) { const g = w.buf.geometry(), me = new THREE.Mesh(g, wallMat(w.name, w.tint)); me.receiveShadow = true; me.castShadow = true; me.matrixAutoUpdate = false; tileGroup.add(me); }
  for (const c of Object.values(ceilBufs)) { const me = new THREE.Mesh(c.buf.geometry(), wallMat(c.name, 0x777777)); me.receiveShadow = false; me.castShadow = false; me.matrixAutoUpdate = false; tileGroup.add(me); }

  // ----- static props merged by material -----
  const merged = {}; const put = (matKey, matFactory, geom, x, y, z, o = {}) => {
    let g = geom.index ? geom.toNonIndexed() : geom.clone(); whiten(g); if (o.uv) scaleUV(g, o.uv[0], o.uv[1]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1)); g.applyMatrix4(m);
    (merged[matKey] = merged[matKey] || { f: matFactory, geoms: [], cast: o.cast !== false }).geoms.push(g);
  };
  const box = (mk, f, x, y, z, w, h, d, o = {}) => { const g = new THREE.BoxGeometry(w, h, d); put(mk, f, g, x, y + h / 2, z, Object.assign({ uv: [Math.max(w, d) / 4, h / 4] }, o)); };
  const cyl = (mk, f, x, y, z, rt, rb, h, seg, o = {}) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg || 12, 1); put(mk, f, g, x, y + h / 2, z, Object.assign({ uv: [Math.PI * (rt + rb) / 4, h / 4] }, o)); };
  const M = {
    wall: () => wallMat('wall', 0xd8dcd4), steel: () => getMat('steel', () => pbr('steel')), rustmetal: () => getMat('metal', () => pbr('metal')), wood: () => getMat('wood', () => pbr('wood')), bark: () => getMat('bark', () => pbr('bark', { ns: 1.5 })),
    rock: () => wallMat('rock', 0xb0b8a8), basalt: () => wallMat('basalt', 0xffffff), lab: () => getMat('lab', () => pbr('lab')), concrete: () => getMat('concrete', () => pbr('concrete')),
    paintOlive: () => getMat('paintOlive', () => pbr('paint', { color: 0x6a7a58 })), paintRed: () => getMat('paintRed', () => pbr('paint', { color: 0x9a4a3a })), paintBlue: () => getMat('paintBlue', () => pbr('paint', { color: 0x5a6e8a })), paintWhite: () => getMat('paintWhite', () => pbr('paint', { color: 0xd8d8d0 })),
    glass: () => getMat('glass', () => new THREE.MeshStandardMaterial({ color: 0x0c1a1f, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6, emissive: 0x06141a, vertexColors: true })),
    rubber: () => getMat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, vertexColors: true })),
    domePanel: () => getMat('domePanel', () => pbr('wall', { color: 0xbcd0c8, env: 1.0, metalness: 0.4 })),
  };
  const P = (name, ...a) => [name, M[name], ...a];
  const tile2m = (x) => (x + 0.5) * TS;

  // barricades: sill, lintel, posts and boards
  const SILL = 0.7, LINTEL = 2.9;
  for (const b of map.barriers) {
    const st = styleOf(b.x - b.dir[0], b.y - b.dir[1]), H0 = STYLE[roomName(b.room)].H, along = b.dir[1] !== 0, cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS, len = 3 * TS, dep = TS;
    const wm = STYLE[roomName(b.room)].wall === 'rock' ? 'rock' : 'wall';
    const sw = along ? len : dep, sd = along ? dep : len;
    box(wm, M[wm], cx, 0, cz, sw, SILL, sd); box(wm, M[wm], cx, LINTEL, cz, sw, H0 - LINTEL, sd);
    for (const sgn of [-1, 1]) { const px = along ? cx + sgn * (len / 2 - 0.2) : cx + b.dir[0] * 0.9, pz = along ? cz + b.dir[1] * 0.9 : cz + sgn * (len / 2 - 0.2); box('wood', M.wood, px, 0, pz, 0.4, LINTEL, 0.4, { ry: 0 }); }
    void st;
  }
  // visitor centre, vehicles, tower, buildings, rocks...
  const rnd = rng(77), treeLeafList = [];   // treeLeafList: {x,y,z,s,ry,type}
  for (const b of map.blocks) {
    const cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS, fw = b.w * TS, fd = b.h * TS;
    switch (b.style) {
      case 'visitor': {
        const h = 9.5;
        box(...P('wall', cx, 0, cz, fw, h, fd)); box(...P('concrete', cx, h, cz, fw + 1, 0.6, fd + 1));
        // the dome
        const dome = new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2); put('domePanel', M.domePanel, dome, cx, h + 0.5, cz, { sx: 17.5, sy: 11, sz: 8.2, uv: [14, 5] });
        for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI; const rib = new THREE.TorusGeometry(1, 0.012, 6, 48, Math.PI); put('steel', M.steel, rib, cx, h + 0.5, cz, { sx: 17.6 * Math.cos(a), sy: 11.1, sz: 8.3, ry: 0, rx: 0, uv: [6, 1] }); }
        // portico with columns on the south face (the face that looks at the plaza)
        const fz = cz + fd / 2;
        box(...P('concrete', cx, 6.4, fz + 2.4, 20, 0.7, 5)); for (let i = 0; i < 6; i++) cyl('concrete', M.concrete, cx - 8.6 + i * 3.44, 0, fz + 4.4, 0.55, 0.62, 6.4, 14);
        box(...P('glass', cx, 0.4, fz + 0.06, 12, 5.8, 0.2)); for (const gx of [-12, 12]) for (let k = 0; k < 3; k++) box(...P('glass', cx + gx - 4 + k * 5.5 * (gx < 0 ? 1 : 1), 2.0, fz + 0.06, 3.4, 3.6, 0.2));
        box(...P('steel', cx - 8, 0.4, fz + 0.1, 0.35, 5.8, 0.3)); box(...P('steel', cx + 8, 0.4, fz + 0.1, 0.35, 5.8, 0.3)); box(...P('steel', cx, 0.4, fz + 0.1, 0.35, 5.8, 0.3));
        break;
      }
      case 'tower': {
        const h = 15; for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl('steel', M.steel, cx + dx * 2.2, 0, cz + dz * 2.2, 0.2, 0.28, h, 8, { rz: -dx * 0.03, rx: dz * 0.03 });
        for (let y = 2.5; y < h; y += 3.5) { box(...P('steel', cx, y, cz - 2.2, 4.8, 0.14, 0.14)); box(...P('steel', cx, y, cz + 2.2, 4.8, 0.14, 0.14)); box(...P('steel', cx - 2.2, y, cz, 0.14, 0.14, 4.8)); box(...P('steel', cx + 2.2, y, cz, 0.14, 0.14, 4.8)); }
        box(...P('wood', cx, h, cz, 6.4, 0.3, 6.4)); box(...P('wall', cx, h + 0.3, cz - 2.6, 6, 2.2, 0.3)); box(...P('wall', cx, h + 0.3, cz + 2.6, 6, 2.2, 0.3)); box(...P('wall', cx - 2.8, h + 0.3, cz, 0.3, 2.2, 5.2)); box(...P('wall', cx + 2.8, h + 0.3, cz, 0.3, 2.2, 5.2)); box(...P('steel', cx, h + 2.6, cz, 7.4, 0.3, 7.4, { rx: 0.03 }));
        addLight(cx, h + 1.2, cz + 2, 0xff9a50, 60, 26, { group: 'tower', flicker: 0.25 });
        break;
      }
      case 'jeep': case 'van': {
        const len = b.style === 'van' ? 5.2 : 4.4, wid = 1.9, tall = b.style === 'van' ? 1.7 : 1.25, along = b.w >= b.h, mk = b.style === 'van' ? 'paintWhite' : 'paintOlive', ry = (along ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.25;
        const o = { ry, rz: (rnd() - 0.5) * 0.08 };
        const grp = (dx, dy, dz, w, h, d, mk2, f2, extra) => { const c = Math.cos(ry), s = Math.sin(ry), px = cx + dx * c + dz * s, pz = cz - dx * s + dz * c; box(mk2, f2, px, dy, pz, w, h, d, Object.assign({ ry }, extra || {})); };
        grp(0, 0.5, 0, len, tall, wid, mk, M[mk]); grp(len * 0.08, 0.5 + tall, 0, len * 0.5, 0.75, wid * 0.94, mk, M[mk]); grp(len * 0.08, 0.5 + tall + 0.05, 0, len * 0.46, 0.62, wid * 0.97, 'glass', M.glass);
        for (const [dx, dz] of [[-len * 0.32, -wid / 2], [len * 0.32, -wid / 2], [-len * 0.32, wid / 2], [len * 0.32, wid / 2]]) { const c = Math.cos(ry), s = Math.sin(ry); const g = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14); put('rubber', M.rubber, g, cx + dx * c + dz * s, 0.42, cz - dx * s + dz * c, { rx: Math.PI / 2, ry: ry, uv: [1, 1] }); }
        void o; break;
      }
      case 'crates': { for (let i = 0; i < 4; i++) { const x = cx + (i % 2 - 0.5) * 1.9, z = cz + (Math.floor(i / 2) - 0.5) * 1.9; box(...P('wood', x, 0, z, 1.8, 1.6, 1.8, { ry: (rnd() - 0.5) * 0.3 })); } box(...P('wood', cx + 0.4, 1.6, cz - 0.3, 1.7, 1.5, 1.7, { ry: 0.4 })); box(...P('paintRed', cx - 1.6, 0, cz - 1.6, 1.0, 1.2, 1.0)); break; }
      case 'container': { const al = b.w >= b.h, L = (al ? fw : fd) - 0.3, Wd = 2.5, mk = ['paintRed', 'paintBlue', 'paintOlive'][(b.x + b.y) % 3]; box(mk, M[mk], cx, 0.05, cz, al ? L : Wd, 2.6, al ? Wd : L); for (let i = 1; i < 12; i++) { const t = (i / 12 - 0.5) * L; box(...P('steel', al ? cx + t : cx, 0.05, al ? cz : cz + t, al ? 0.12 : Wd + 0.1, 2.6, al ? Wd + 0.1 : 0.12)); } break; }
      case 'generator': { box(...P('paintOlive', cx, 0, cz, 3.2, 2.0, 2.2)); cyl('steel', M.steel, cx - 1.1, 2.0, cz, 0.16, 0.16, 1.4, 8); box(...P('steel', cx + 0.4, 2.0, cz, 1.2, 0.3, 1.8)); break; }
      case 'hangar': { const h = 7.5; box(...P('steel', cx, 0, cz, fw, 5.5, fd)); const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, 0, Math.PI); put('steel', M.steel, g, cx, 5.5, cz, { sx: fd / 2, sy: fw, sz: (fd / 2) * 0.0 + (h - 5.5) * 1.1, rz: Math.PI / 2, uv: [6, 6] }); box(...P('concrete', cx, 0, cz + fd / 2 + 0.2, fw - 6, 0.25, 0.8)); box(...P('glass', cx, 0.6, cz + fd / 2 + 0.06, 9, 4, 0.2)); break; }
      case 'lab': { box(...P('lab', cx, 0, cz, fw, 4.6, fd)); box(...P('concrete', cx, 4.6, cz, fw + 0.8, 0.4, fd + 0.8)); for (let i = 0; i < 4; i++) box(...P('steel', cx - fw * 0.3 + i * (fw * 0.2), 5.0, cz - 0.6, 1.4, 0.9, 1.4)); box(...P('glass', cx, 1.1, cz + fd / 2 + 0.05, fw * 0.7, 1.9, 0.12)); addLight(cx, 3.4, cz + fd / 2 + 3.5, 0x9affc8, 18, 16, { group: 'lab', flicker: 0.5 }); break; }
      case 'heli': { const al = b.w >= b.h; const ry = (al ? 0 : Math.PI / 2) + 0.2; const bodyG = new THREE.SphereGeometry(1, 20, 12); put('paintOlive', M.paintOlive, bodyG, cx, 1.5, cz, { sx: 2.6, sy: 1.3, sz: 1.2, ry, rz: 0.1, uv: [3, 2] }); const tail = new THREE.CylinderGeometry(0.15, 0.4, 4.5, 10); put('paintOlive', M.paintOlive, tail, cx + Math.cos(ry) * -4.4, 1.9, cz + Math.sin(ry) * 4.4, { rz: Math.PI / 2, ry, uv: [1, 3] }); for (let i = 0; i < 3; i++) box(...P('rustmetal', cx, 2.5, cz, 7.6, 0.07, 0.4, { ry: ry + i * 2.1 + 0.4, rz: 0.1 })); break; }
      case 'tree': { addTree(cx, cz, 0.7 + rnd() * 0.2, 17 + rnd() * 5, true); break; }
      case 'rock': case 'stalag': {
        const stal = b.style === 'stalag', n = stal ? 3 : 5;
        for (let i = 0; i < n; i++) { const g = stal ? new THREE.ConeGeometry(0.9 + rnd() * 0.5, 5 + rnd() * 5, 8, 2) : new THREE.IcosahedronGeometry(1, 2); const pos = g.attributes.position; for (let v = 0; v < pos.count; v++) { const nz = fbm2(pos.getX(v) * 2 + i * 9, pos.getZ(v) * 2 + pos.getY(v)) * 0.22; pos.setXYZ(v, pos.getX(v) * (1 + nz), pos.getY(v) * (1 + nz * 0.6), pos.getZ(v) * (1 + nz)); } g.computeVertexNormals();
          const sc = stal ? 1 : 1.3 + rnd() * 1.1, ox = (rnd() - 0.5) * (fw * 0.55), oz = (rnd() - 0.5) * (fd * 0.55); put(stal ? 'basalt' : 'rock', stal ? M.basalt : M.rock, g, cx + ox, stal ? (2.5 + rnd() * 2.5) : sc * 0.55, cz + oz, { sx: sc * (stal ? 1 : 1.3), sy: stal ? 1 : sc * 0.8, sz: sc * (stal ? 1 : 1.3), ry: rnd() * 6, uv: [3, 3] }); }
        break;
      }
      default: break;
    }
  }
  // light poles and lamps (plaza, compound) and warm lanterns along the boardwalk
  const lamp = (x, z, color, intensity, range, group, h = 5.2) => { cyl('steel', M.steel, x, 0, z, 0.1, 0.14, h, 8); box(...P('steel', x, h, z, 0.9, 0.18, 0.5)); const lm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(color), emissiveIntensity: 5 }); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.34), lm); lamp.position.set(x, h - 0.08, z); lamp.userData.noAO = true; root.add(lamp); wd.emissiveMats.push(lm); addLight(x, h - 0.5, z, color, intensity, range, { group }); };
  for (const [tx, ty, c, i, r, g] of [[48, 44, 0xffd29a, 90, 24, 'plaza'], [84, 44, 0xffd29a, 90, 24, 'plaza'], [48, 70, 0xffd29a, 90, 24, 'plaza'], [84, 70, 0xffd29a, 90, 24, 'plaza'], [66, 53, 0xffe0b0, 80, 22, 'plaza'], [56, 60, 0xffd29a, 70, 22, 'plaza'], [76, 60, 0xffd29a, 70, 22, 'plaza'],
    [14, 16, 0xcfe4ff, 110, 26, 'compound'], [30, 24, 0xcfe4ff, 100, 26, 'compound'], [44, 16, 0xcfe4ff, 110, 26, 'compound'], [20, 28, 0xcfe4ff, 90, 24, 'compound'],
    [12, 60, 0xffb060, 70, 20, 'jungle'], [22, 54, 0xffb060, 70, 20, 'jungle'], [32, 48, 0xffb060, 70, 20, 'jungle'], [20, 40, 0xffb060, 70, 20, 'jungle'], [28, 70, 0xffb060, 70, 20, 'jungle']]) lamp((tx + 0.5) * TS, (ty + 0.5) * TS, c, i, r, g, g === 'jungle' ? 3.6 : 5.6);
  { const cv = D.ROOMS[3]; for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) addLight((cv.x + 4 + i * (cv.w - 8) / 4) * TS, 4.5, (cv.y + 4 + j * (cv.h - 8) / 2) * TS, 0xff5a20, 260, 38, { group: 'cave', flicker: 0.22 }); }
  for (const l of wd.lights) l.baseIntensity = l.intensity;

  // trees: trunks as merged cylinders, canopies as instanced leaf cards
  function addTree(x, z, r, h, solid) {
    const seg = 9, g = new THREE.CylinderGeometry(r * 0.62, r, h, seg, 5); const pos = g.attributes.position; for (let v = 0; v < pos.count; v++) { const y = pos.getY(v) / h + 0.5, nz = fbm2(pos.getX(v) * 3 + x, pos.getY(v) * 0.6 + z) * 0.1; pos.setXYZ(v, pos.getX(v) * (1 + nz + (1 - y) * (1 - y) * 0.5), pos.getY(v), pos.getZ(v) * (1 + nz + (1 - y) * (1 - y) * 0.5)); } g.computeVertexNormals();
    put('bark', M.bark, g, x, h / 2, z, { uv: [2, h / 3], ry: R() * 6, rz: (R() - 0.5) * 0.05, rx: (R() - 0.5) * 0.05 });
    const n = solid ? 9 : 5; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + R(), rr = 1 + R() * 3.5; treeLeafList.push({ x: x + Math.cos(a) * rr, y: h - 1.5 + R() * 3, z: z + Math.sin(a) * rr, s: 5 + R() * 3.5, ry: R() * 6, rz: (R() - 0.5) * 0.7, type: R() < 0.6 ? 'palm' : 'broad' }); }
    if (solid) for (let i = 0; i < 3; i++) { const a = R() * 6; treeLeafList.push({ x: x + Math.cos(a) * 1.4, y: 3 + R() * 6, z: z + Math.sin(a) * 1.4, s: 2.2 + R() * 1.5, ry: R() * 6, rz: 0, type: 'broad' }); }   // hanging leaves on the trunk
  }
  // the jungle all around outside the walls
  { const rr = rng(4242), open = (x, y) => kindAt(x, y) !== K.WALL;
    for (let wz = 4; wz < H * TS - 4; wz += 7) for (let wx = 4; wx < W * TS - 4; wx += 7) {
      const x = wx + (rr() - 0.5) * 5, z = wz + (rr() - 0.5) * 5, tx = Math.floor(x / TS), ty = Math.floor(z / TS); if (open(tx, ty)) continue;
      let near = 99; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (open(tx + dx, ty + dy)) near = Math.min(near, Math.hypot(dx, dy)); if (near < 2.4) continue;
      addTree(x, z, 0.8 + rr() * 0.6, 16 + rr() * 10, false); if (near < 4 && rr() < 0.6) addTree(x + 1.5, z + 1.2, 0.6, 12 + rr() * 6, false);
    } }
  // merge props
  for (const [key, e] of Object.entries(merged)) { const g = mergeGeometries(e.geoms, false); const me = new THREE.Mesh(g, e.f()); me.castShadow = e.cast; me.receiveShadow = true; me.matrixAutoUpdate = false; root.add(me); }

  // ----- foliage: ferns and grass on the ground, canopy cards on the trees (instanced, swaying) -----
  function cardGeometry() { const g = new THREE.BufferGeometry(); const p = [], u = [], n = [], idx = []; for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); const base = p.length / 3; for (const [px, py, uu, vv] of [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]]) { p.push(px * c, py, px * s); u.push(uu, vv); n.push(-s, 0, c); } idx.push(base, base + 1, base + 2, base, base + 2, base + 3); } g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(idx); return g; }
  const card = cardGeometry(), fmat = {};
  const getF = (name, o) => (fmat[name] || (fmat[name] = (() => { const m = foliageMaterial(assets.tex['leaf_' + name], o); wd.foliageMats.push(m); return m; })()));
  function instanced(name, list, o = {}) {
    if (!list.length) return null; const m = getF(name, o), im = new THREE.InstancedMesh(card, m, list.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((it, i) => { e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); v.set(it.x, it.y, it.z); sc.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sx || 1)); mt.compose(v, q, sc); im.setMatrixAt(i, mt); col.setScalar(0.65 + R() * 0.45); im.setColorAt(i, col); });
    im.castShadow = o.cast !== false; im.receiveShadow = false; im.userData.noAO = true; im.frustumCulled = true; im.computeBoundingSphere(); return im;
  }
  wd.foliage = [];
  function plantFoliage(q) {
    for (const o of wd.foliage) { root.remove(o); o.dispose && o.dispose(); } wd.foliage = [];
    const f = q.foliage, lists = { fern: [], grass: [], palm: [], broad: [], vine: [] }, rr = rng(99);
    for (const t of treeLeafList) if (rr() < Math.max(0.35, f)) lists[t.type].push({ x: t.x, y: t.y, z: t.z, s: t.s, ry: t.ry, rz: t.rz * 0.5, sy: 0.9 });
    const dens = { plaza: 0.5, jungle: 3.2, compound: 0.4, cave: 0 };
    for (const r of D.ROOMS) {
      const n = Math.round(r.w * r.h * dens[r.floor] * f * 0.5);
      for (let i = 0; i < n; i++) {
        const x = (r.x + rr() * r.w) * TS, z = (r.y + rr() * r.h) * TS, tx = Math.floor(x / TS), ty = Math.floor(z / TS); if (kindAt(tx, ty) !== K.FLOOR) continue;
        let bad = false; for (let dy = -1; dy <= 1 && !bad; dy++) for (let dx = -1; dx <= 1; dx++) { const k = kindAt(tx + dx, ty + dy); if (k === K.BARRIER || k === K.DOOR || k === K.MACHINE) bad = true; } if (bad) continue;
        const nearWall = (() => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (kindAt(tx + dx, ty + dy) === K.WALL || kindAt(tx + dx, ty + dy) === K.BLOCK) return true; return false; })();
        if (r.floor === 'plaza' && !nearWall && rr() < 0.7) continue;
        const type = rr() < (r.floor === 'jungle' ? 0.55 : 0.35) ? 'fern' : 'grass'; lists[type].push({ x, y: 0, z, s: type === 'fern' ? 0.9 + rr() * 0.9 : 0.7 + rr() * 0.8, ry: rr() * 6, sy: 0.8 + rr() * 0.5 });
      }
    }
    // vines hanging off the walls of the jungle and the plaza
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) { if (kindAt(tx, ty) !== K.WALL) continue; const st = [[1, 0], [-1, 0], [0, 1], [0, -1]]; for (const [dx, dy] of st) { if (kindAt(tx + dx, ty + dy) !== K.FLOOR) continue; const rm = D.ROOMS[area[(ty + dy) * W + tx + dx]]; if (!rm || rm.floor === 'cave' || rr() > 0.28 * f) continue; const x = (tx + 0.5 + dx * 0.5) * TS + (rr() - 0.5) * 1.2 * (dy ? 1 : 0), z = (ty + 0.5 + dy * 0.5) * TS + (rr() - 0.5) * 1.2 * (dx ? 1 : 0); lists.vine.push({ x: x + dx * 0.15, y: STYLE[rm.floor].H - 0.2 - rr() * 0.5, z: z + dy * 0.15, s: 2.2 + rr() * 2.2, ry: dx ? Math.PI / 2 : 0, sy: -1, rz: 0 }); if (rr() < 0.5) lists.fern.push({ x: x + dx * 0.9, y: 0, z: z + dy * 0.9, s: 1 + rr(), ry: rr() * 6, sy: 1 }); } }
    for (const [name, list] of Object.entries(lists)) { const im = instanced(name, list, { sway: name === 'vine' ? 0.04 : name === 'grass' ? 0.12 : 0.09, cast: name === 'palm' || name === 'broad' }); if (im) { root.add(im); wd.foliage.push(im); } }
  }
  wd.plantFoliage = plantFoliage; plantFoliage(quality);

  // ----- water (fountain, stream) and lava -----
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1c3a3c, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.88, normalMap: assets.tex.water_n, envMapIntensity: 2.2 }); waterMat.normalScale.set(0.7, 0.7); assets.tex.water_n.wrapS = assets.tex.water_n.wrapT = THREE.RepeatWrapping;
  const lavaTex = assets.tex.lava, lavaMat = new THREE.MeshStandardMaterial({ map: lavaTex.a, emissiveMap: lavaTex.e, emissive: 0xffffff, emissiveIntensity: 2.6, roughness: 0.6, color: 0xffb070 });
  for (const l of map.liquids) {
    const gw = l.w * TS, gd = l.h * TS, cx = (l.x + l.w / 2) * TS, cz = (l.y + l.h / 2) * TS;
    if (l.kind === 'water') { const g = new THREE.PlaneGeometry(gw, gd); g.rotateX(-Math.PI / 2); scaleUV(g, gw / 6, gd / 6); const me = new THREE.Mesh(g, waterMat); me.position.set(cx, -0.25, cz); me.receiveShadow = true; me.userData.noAO = true; root.add(me); }
    else { const g = new THREE.PlaneGeometry(gw, gd); g.rotateX(-Math.PI / 2); scaleUV(g, gw / 5, gd / 5); const me = new THREE.Mesh(g, lavaMat); me.position.set(cx, -0.45, cz); me.receiveShadow = false; me.userData.noAO = true; root.add(me); for (let i = 0; i < 2; i++) addLight(cx + (i - 0.5) * gw * 0.35, 1.2, cz + (i - 0.5) * gd * 0.2, 0xff6a20, 520, 38, { group: 'lava', flicker: 0.3 }); }
    // a stone rim around the liquid
    const rim = l.kind === 'water' ? 'concrete' : 'basalt'; for (const [rx, rz, w, d] of [[cx, cz - gd / 2 - 0.3, gw + 1.2, 0.6], [cx, cz + gd / 2 + 0.3, gw + 1.2, 0.6], [cx - gw / 2 - 0.3, cz, 0.6, gd], [cx + gw / 2 + 0.3, cz, 0.6, gd]]) { const mk = rim; const bg = whiten(new THREE.BoxGeometry(w, l.kind === 'water' ? 0.55 : 0.4, d)); const m2 = new THREE.Mesh(bg, M[mk]()); m2.position.set(rx, l.kind === 'water' ? 0.1 : 0.0, rz); m2.castShadow = true; m2.receiveShadow = true; scaleUV(bg, Math.max(w, d) / 4, 0.3); root.add(m2); }
  }
  wd.waterMat = waterMat; wd.lavaMat = lavaMat;
  // the stream that runs under the boardwalk bridge, and the fountain statue
  { const g = new THREE.PlaneGeometry(22 * TS * 0.5, 3 * TS); g.rotateX(-Math.PI / 2); const sm = new THREE.Mesh(g, waterMat); sm.position.set((19 + 11) * TS, -0.35, 58.5 * TS); root.add(sm); }
  { const bw = new THREE.Group(); const m2 = M.wood(); for (let i = 0; i < 11; i++) { const p = new THREE.Mesh(whiten(new THREE.BoxGeometry(0.42, 0.1, 3.1)), m2); p.position.set((19 + i * 0.5 + 0.2) * TS * 1.0 - 0.0, 0.08, 58.5 * TS); p.receiveShadow = true; p.castShadow = true; bw.add(p); } root.add(bw);
    const stat = new THREE.Mesh(whiten(new THREE.CylinderGeometry(0.7, 1.0, 2.2, 14)), M.concrete()); stat.position.set(66 * TS, 1.1, 60.5 * TS); stat.castShadow = true; root.add(stat); const top = new THREE.Mesh(whiten(new THREE.SphereGeometry(0.8, 14, 10)), M.steel()); top.position.set(66 * TS, 3.0, 60.5 * TS); top.castShadow = true; root.add(top); }
  // helipad marking
  { const hp = D.DECOR.helipad, sz = hp[2] * TS, tex = canvasTexture(512, 512, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(230,200,60,0.85)'; x.lineWidth = 22; x.beginPath(); x.arc(w / 2, h / 2, w * 0.42, 0, 7); x.stroke(); x.fillStyle = 'rgba(230,200,60,0.85)'; x.font = '900 260px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', w / 2, h / 2 + 12); x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 900; i++) { x.globalAlpha = Math.random() * 0.5; x.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 2 + Math.random() * 6); } });
    const m2 = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); const p = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m2); p.rotation.x = -Math.PI / 2; p.position.set((hp[0] + hp[2] / 2) * TS, 0.02, (hp[1] + hp[3] / 2) * TS); p.receiveShadow = true; p.userData.noAO = true; root.add(p); }

  // ----- gates (doors), machines and posters -----
  const gateSteel = M.steel(), signs = [];
  for (const d of map.doors) {
    const vertical = d.w < d.h; let f;
    if (vertical) f = kindAt(d.x + 1, d.y - 1) === K.FLOOR && area[(d.y - 1) * W + d.x + 1] === (d.id === 1 ? 0 : d.id === 2 ? 1 : 2) ? [0, -1] : [0, 1]; else f = kindAt(d.x - 1, d.y + 1) === K.FLOOR && area[(d.y + 1) * W + d.x - 1] === (d.id === 1 ? 0 : d.id === 3 ? 2 : 1) ? [-1, 0] : [1, 0];
    // f points from the corridor towards the room you open it from
    const cx = (d.x + d.w / 2) * TS, cz = (d.y + d.h / 2) * TS, sx = vertical ? d.w * TS : 0.8, sz = vertical ? 0.8 : d.h * TS, px = vertical ? cx : (f[0] === -1 ? d.x * TS + 0.4 : (d.x + d.w) * TS - 0.4), pz = vertical ? (f[1] === -1 ? d.y * TS + 0.4 : (d.y + d.h) * TS - 0.4) : cz;
    const grp = new THREE.Group(); grp.position.set(px, 0, pz); root.add(grp);
    const geo = new THREE.BoxGeometry(sx, 4.4, sz); scaleUV(geo, 2, 1.2); whiten(geo); const slab = new THREE.Mesh(geo, getMat('gate', () => pbr('steel', { color: 0xc8c0a8, vc: false }))); slab.position.y = 2.2; slab.castShadow = true; slab.receiveShadow = true; grp.add(slab);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ map: signTexture([{ t: 'LOCKED', s: 64, y: 70, c: '#ff5a4a' }, { t: D.ROOMS[d.id].name.toUpperCase(), s: 40, y: 140 }, { t: D.ROOMS[d.id].cost + ' POINTS', s: 56, y: 205, c: '#ffd45a' }], '#14181a', '#e8e8e0', '#c8a020'), emissive: 0xffffff, emissiveIntensity: 0.0 }));
    sg.material.emissiveMap = sg.material.map; sg.material.emissiveIntensity = 0.9; sg.position.set(f[0] * (sx / 2 + 0.03), 2.6, f[1] * (sz / 2 + 0.03)); sg.rotation.y = f[1] === 1 ? 0 : f[1] === -1 ? Math.PI : f[0] === 1 ? Math.PI / 2 : -Math.PI / 2; sg.userData.noAO = true; grp.add(sg);
    addLight(px + f[0] * 2, 3.6, pz + f[1] * 2, 0xff5a3a, 36, 14, { group: 'gate', flicker: 0.05 });
    wd.doors.push({ idx: map.doors.indexOf(d), grp, open: 0, f, px, pz });
  }
  function frontOf(m) { for (const [dx, dy] of [[0, 1], [0, -1]]) { const a = kindAt(m.x + dx, m.y + dy), b = kindAt(m.x + 1 + dx, m.y + dy); if (a === K.FLOOR && b === K.FLOOR) return [dx, dy]; } return [0, 1]; }
  const sprite = (key, lines, bg, fg, accent) => signs[key] || (signs[key] = signTexture(lines, bg, fg, accent));
  for (const m of map.machines) {
    const f = frontOf(m), cx = (m.x + 1) * TS, cz = (m.y + 0.5) * TS, grp = new THREE.Group(); grp.position.set(cx, 0, cz); root.add(grp); if (f[1] === -1) grp.rotation.y = Math.PI;
    const col = m.kind === 'perk' ? D.PERKS[m.id].color : m.kind === 'box' ? '#ffb030' : '#ff7a30', tint = hex(col);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, m.kind === 'perk' ? 3.1 : 1.5, 1.5), getMat('mach:' + m.id, () => pbr('metal', { color: tint.clone().lerp(new THREE.Color(0x303840), 0.62), vc: false })));
    if (m.kind === 'anvil') { body.geometry = new THREE.BoxGeometry(3.4, 1.0, 1.4); }
    body.position.y = body.geometry.parameters.height / 2; body.castShadow = true; body.receiveShadow = true; scaleUV(body.geometry, 1.5, 1.2); grp.add(body);
    const title = m.kind === 'perk' ? D.PERKS[m.id].name.toUpperCase() : m.kind === 'box' ? D.BOX.name.toUpperCase() : D.UPGRADE.name.toUpperCase(), price = m.kind === 'perk' ? D.PERKS[m.id].cost : m.kind === 'box' ? D.BOX.cost : D.UPGRADE.cost;
    const tex = sprite('m' + m.id, [{ t: title, s: title.length > 14 ? 46 : 58, y: 90, c: col }, { t: String(price), s: 70, y: 180, c: '#ffe27a' }], '#0c1014', '#ffffff', col);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.4 })); sg.position.set(0, m.kind === 'perk' ? 1.9 : 1.25, 0.77); sg.userData.noAO = true; if (m.kind !== 'perk') { sg.rotation.x = -0.35; sg.position.set(0, 1.25, 0.2); sg.scale.setScalar(0.85); } grp.add(sg);
    if (m.kind === 'box') { const lid = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.45, 1.6), getMat('boxlid', () => pbr('wood', { color: 0xc89868, vc: false }))); lid.position.y = 1.7; lid.castShadow = true; grp.add(lid); wd.boxLid = lid; }
    if (m.kind === 'anvil') { const av = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.7), M.steel()); av.position.set(-0.7, 1.3, 0); av.castShadow = true; grp.add(av); const fg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a10, emissiveIntensity: 4 })); fg.position.set(0.9, 1.1, 0); fg.userData.noAO = true; grp.add(fg); wd.emissiveMats.push(fg.material); }
    addLight(cx + f[0] * 0, 2.2, cz + f[1] * 2.2, col, 70, 12, { group: 'machine', flicker: 0.03 });
    wd.machines.push({ m, grp, f });
  }
  for (const w of map.wallbuys) {
    const wp = D.WEAPONS[w.weapon], fy = w.side === 'S' ? 1 : -1, z = (w.side === 'S' ? w.y + 1 : w.y) * TS + fy * 0.04, cx = (w.x + 0.5) * TS;
    const tex = sprite('w' + w.weapon, [{ t: 'BUY', s: 44, y: 54, c: '#ffd45a' }, { t: wp.name.toUpperCase(), s: 50, y: 124 }, { t: wp.cost + ' PTS  ·  AMMO ' + Math.round(wp.cost / 2), s: 38, y: 200, c: '#ffe27a' }], '#1b1612', '#f0e6d0', '#c8a040');
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9 })); pl.position.set(cx, 2.2, z); if (fy === -1) pl.rotation.y = Math.PI; pl.userData.noAO = true; root.add(pl);
    addLight(cx, 3.2, z + fy * 1.8, 0xffd9a0, 40, 10, { group: 'poster', flicker: 0.04 }); wd.posters.push({ w, pl });
  }

  // ----- barricade boards: two instanced meshes (along x, along z) -----
  { const nb = map.barriers.length, PER = 6, geoX = new THREE.BoxGeometry(5.7, 0.3, 0.16), geoZ = new THREE.BoxGeometry(0.16, 0.3, 5.7); scaleUV(geoX, 1.4, 0.1); scaleUV(geoZ, 0.1, 1.4); whiten(geoX); whiten(geoZ);
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, getMat('plank', () => pbr('wood', { color: 0xb8a088, vc: false })), nb * PER); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im; };
    const ix = mk(geoX), iz = mk(geoZ), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0), p = new THREE.Vector3(), e = new THREE.Euler();
    wd.planks = { ix, iz, PER, last: new Int8Array(nb).fill(-1) };
    wd.planks.apply = function (b, jig) {
      const along = b.dir[1] !== 0, im = along ? ix : iz, cx = (b.x + b.w / 2) * TS, cz = (b.y + b.h / 2) * TS;
      for (let k = 0; k < PER; k++) {
        const vis = k < b.planks, y = SILL + 0.2 + k * 0.36, tilt = Math.sin(b.id * 3.1 + k * 2.3) * 0.045 + (jig ? Math.sin(jig * 45 + k) * 0.05 : 0), off = 0.55 + (k % 2) * 0.12;
        p.set(cx + b.dir[0] * off, y, cz + b.dir[1] * off); e.set(along ? tilt : 0, 0, along ? 0 : tilt); q.setFromEuler(e); m4.compose(p, q, vis ? s1 : s0); im.setMatrixAt(b.id * PER + k, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    map.barriers.forEach((b) => { wd.planks.apply(b, 0); wd.planks.last[b.id] = b.planks; });
  }

  // ----- atmosphere: low mist sheets, moonlight shafts through the trees, stalactites in the cave -----
  wd.mist = []; wd.shafts = [];
  { const nz = assets.tex.noise;
    for (const r of D.ROOMS) {
      const cave = r.floor === 'cave', n = r.floor === 'jungle' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const t = nz.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(r.w / 9, r.h / 9);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w * TS, r.h * TS), new THREE.MeshBasicMaterial({ map: t, color: cave ? 0xff5a28 : 0x7a96b8, transparent: true, opacity: cave ? 0.05 : 0.085, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.position.set((r.x + r.w / 2) * TS, 0.35 + i * 0.75, (r.y + r.h / 2) * TS); m.userData.noAO = true; m.renderOrder = 3; root.add(m); wd.mist.push({ t, dir: i % 2 ? 1 : -1, sp: 0.004 + i * 0.002 });
      }
    }
    // moonlight shafts
    const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.55, 0.7, 1.0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uTime; uniform vec3 uColor; void main(){ float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); float len = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y); float fl = 0.75 + 0.25 * sin(uTime * 0.6 + vUv.y * 3.0); gl_FragColor = vec4(uColor, edge * edge * len * 0.09 * fl); }' });
    wd.shaftMat = shaftMat; const sr = rng(555), up = new THREE.Vector3(0, 1, 0);
    for (const r of D.ROOMS) { if (r.floor === 'cave') continue; const n = r.floor === 'jungle' ? 9 : r.floor === 'plaza' ? 6 : 4; for (let i = 0; i < n; i++) {
      const x = (r.x + 2 + sr() * (r.w - 4)) * TS, z = (r.y + 2 + sr() * (r.h - 4)) * TS, wdt = 2.5 + sr() * 3, hgt = 26; const g = new THREE.PlaneGeometry(wdt, hgt);
      for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(g, shaftMat); const q = new THREE.Quaternion().setFromUnitVectors(up, moonDir); const rot = new THREE.Quaternion().setFromAxisAngle(moonDir, k * Math.PI / 2 + sr()); m.quaternion.copy(rot.multiply(q)); m.position.set(x + moonDir.x * hgt / 2, moonDir.y * hgt / 2, z + moonDir.z * hgt / 2); m.userData.noAO = true; m.renderOrder = 3; m.frustumCulled = false; root.add(m); } } }
    // stalactites
    const cv = D.ROOMS[3], cg = new THREE.ConeGeometry(0.7, 1, 7, 1, true); cg.rotateX(Math.PI); cg.translate(0, -0.5, 0); whiten(cg, 0.7); const cm = new THREE.InstancedMesh(cg, M.basalt(), 90), mt = new THREE.Matrix4(), q2 = new THREE.Quaternion(), v2 = new THREE.Vector3(), s2 = new THREE.Vector3(); cm.castShadow = false; cm.userData.noAO = true;
    for (let i = 0; i < 90; i++) { const len = 2 + sr() * 5, rad = 0.6 + sr() * 0.9; v2.set((cv.x + 1 + sr() * (cv.w - 2)) * TS, STYLE.cave.H + 0.2, (cv.y + 1 + sr() * (cv.h - 2)) * TS); s2.set(rad, len, rad); mt.compose(v2, q2.identity(), s2); cm.setMatrixAt(i, mt); } cm.frustumCulled = false; root.add(cm); }
  // ----- the real lights: a small pool moved to the nearest candidates -----
  const pool = []; wd.pool = pool; wd.makePool = function (n) {
    for (const l of pool) { root.remove(l.light); l.light.dispose && l.light.dispose(); } pool.length = 0;
    for (let i = 0; i < n; i++) { const light = new THREE.PointLight(0xffffff, 0, 30, 2); light.castShadow = false; root.add(light); pool.push({ light, tgt: null, k: 0 }); }
  }; wd.makePool(quality.lights);

  // ----- per frame -----
  const camV = new THREE.Vector3();
  wd.update = function (g, dt, t, cam) {
    skyMat.uniforms.uTime.value = t; wd.shaftMat.uniforms.uTime.value = t; for (const m of wd.mist) { m.t.offset.x = (t * m.sp * m.dir) % 1; m.t.offset.y = (t * m.sp * 0.6) % 1; } for (const m of wd.foliageMats) m.userData.uTime.value = t;
    wd.waterMat.normalMap.offset.set(t * 0.012, t * 0.008); wd.lavaMat.map.offset.set(t * 0.006, t * 0.004); wd.lavaMat.emissiveMap.offset.copy(wd.lavaMat.map.offset); wd.lavaMat.emissiveIntensity = 2.4 + Math.sin(t * 1.3) * 0.5;
    for (const v of wd.doors) { const target = g.map.doors[v.idx].open ? 1 : 0; v.open += Math.sign(target - v.open) * Math.min(Math.abs(target - v.open), dt * 0.7); v.grp.position.y = v.open * 4.8; v.grp.visible = v.open < 0.999; }
    const pl = wd.planks, bs = g.map.barriers; for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (pl.last[i] !== b.planks || b.hit > 0) { pl.apply(b, b.hit > 0 ? b.hit : 0); pl.last[i] = b.planks; } }
    // machines: the crate lid lifts while a weapon is being offered
    for (const mm of wd.machines) { if (mm.m.kind === 'box' && wd.boxLid) { const open = g.map.machines.find((q) => q.id === 'box'); const tgt = open && open.state !== 'idle' ? 1 : 0; wd.boxLid.userData.o = (wd.boxLid.userData.o || 0) + (tgt - (wd.boxLid.userData.o || 0)) * Math.min(1, dt * 6); wd.boxLid.position.y = 1.7 + wd.boxLid.userData.o * 0.5; wd.boxLid.rotation.x = -wd.boxLid.userData.o * 0.7; } }
    // lights
    camV.set(cam.x, cam.y, cam.z); const cands = wd.lights;
    for (const l of cands) { l.d = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2 + (l.y - cam.y) ** 2 * 0.3; l.f = 1 + (Math.sin(t * 9.1 + l.phase) * 0.5 + Math.sin(t * 23 + l.phase * 2.1) * 0.5) * l.flicker + (l.flicker > 0.2 && Math.sin(t * 3.7 + l.phase) > 0.96 ? -0.4 : 0); }
    const sorted = cands.filter((l) => l.d < (l.range * 3.2) ** 2).sort((a, b) => a.d - b.d);
    for (let i = 0; i < pool.length; i++) { const p = pool[i], c = sorted[i]; if (c) { if (p.tgt !== c) { if (p.k > 0.05 && p.tgt) { p.k = Math.max(0, p.k - dt * 10); } else { p.tgt = c; p.light.position.set(c.x, c.y, c.z); p.light.color.copy(c.color); p.light.distance = c.range; } } else p.k = Math.min(1, p.k + dt * 6); p.light.intensity = c.intensity * (p.tgt === c ? p.k * c.f : 0); } else { p.k = Math.max(0, p.k - dt * 8); p.light.intensity *= Math.max(0, 1 - dt * 8); } }
    for (const m of wd.emissiveMats) m.emissiveIntensity = 4.5 + Math.sin(t * 8) * 0.4;
  };
  wd.dispose = function () { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); };
  return wd;
}
