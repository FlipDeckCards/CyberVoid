// Generates the tiling PBR textures (albedo, normal, ORM = occlusion/roughness/metal) and the foliage atlases for Feral 3.0 in code, then saves optimised WebP files
// under public/feral3/textures/. Everything is original and procedural (no photographs, no third-party textures).
// Run: node tools-feral3/make-textures.js [name,name,...]
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const OUT = path.join(__dirname, '..', 'public', 'feral3', 'textures'); fs.mkdirSync(OUT, { recursive: true });
const N = +process.env.TEX || 1024;

// ---------- tileable noise ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function lattice(period, seed) { const r = rng(seed), a = new Float32Array(period * period); for (let i = 0; i < a.length; i++) a[i] = r(); return { period, a }; }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function vnoise(L, x, y) {                                    // x,y in 0..1 (wraps), value noise
  const p = L.period, fx = x * p, fy = y * p, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fade(fx - x0), ty = fade(fy - y0);
  const i0 = ((x0 % p) + p) % p, j0 = ((y0 % p) + p) % p, i1 = (i0 + 1) % p, j1 = (j0 + 1) % p, a = L.a;
  const v00 = a[j0 * p + i0], v10 = a[j0 * p + i1], v01 = a[j1 * p + i0], v11 = a[j1 * p + i1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}
function fbmFn(base, oct, seed) { const Ls = []; for (let o = 0; o < oct; o++) Ls.push(lattice(base * (1 << o), seed + o * 101)); return (x, y) => { let s = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++) { s += vnoise(Ls[o], x, y) * a; t += a; a *= 0.5; } return s / t; }; }
function ridge(f) { return (x, y) => 1 - Math.abs(f(x, y) * 2 - 1); }
function voronoiFn(cells, seed) {                             // returns {d1, d2, id} per point (tileable)
  const r = rng(seed), pts = []; for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + r()) / cells, (j + r()) / cells, r()]);
  return (x, y) => { const ci = Math.floor(x * cells), cj = Math.floor(y * cells); let d1 = 9, d2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = ci + di, jj = cj + dj, wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells, p = pts[wj * cells + wi], px = p[0] + (ii - wi) / cells, py = p[1] + (jj - wj) / cells, d = Math.hypot(px - x, py - y); if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d; }
    return { d1, d2, id, edge: d2 - d1 }; };
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t, sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixc = (c0, c1, t) => [mix(c0[0], c1[0], t), mix(c0[1], c1[1], t), mix(c0[2], c1[2], t)];

// ---------- a texture = per-pixel function returning { c:[r,g,b] 0-255, h: height 0-1, r: roughness 0-1, m: metal 0-1, e:[r,g,b] emissive optional } ----------
function build(size, fn) {
  const alb = Buffer.alloc(size * size * 3), H = new Float32Array(size * size), orm = Buffer.alloc(size * size * 3), emi = Buffer.alloc(size * size * 3); let hasE = false;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size, o = fn(u, v), k = j * size + i; H[k] = o.h; alb[k * 3] = clamp(o.c[0], 0, 255); alb[k * 3 + 1] = clamp(o.c[1], 0, 255); alb[k * 3 + 2] = clamp(o.c[2], 0, 255);
    orm[k * 3] = clamp((o.ao == null ? 0.5 + o.h * 0.5 : o.ao)) * 255; orm[k * 3 + 1] = clamp(o.r) * 255; orm[k * 3 + 2] = clamp(o.m || 0) * 255;
    if (o.e) { hasE = true; emi[k * 3] = clamp(o.e[0], 0, 255); emi[k * 3 + 1] = clamp(o.e[1], 0, 255); emi[k * 3 + 2] = clamp(o.e[2], 0, 255); }
  }
  return { size, alb, H, orm, emi: hasE ? emi : null };
}
function normalMap(H, size, strength) {
  const out = Buffer.alloc(size * size * 3), w = (i) => ((i % size) + size) % size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (H[j * size + w(i + 1)] - H[j * size + w(i - 1)]) * strength, dy = (H[w(j + 1) * size + i] - H[w(j - 1) * size + i]) * strength, l = Math.hypot(dx, dy, 1), k = (j * size + i) * 3;
    out[k] = (-dx / l * 0.5 + 0.5) * 255; out[k + 1] = (-dy / l * 0.5 + 0.5) * 255; out[k + 2] = (1 / l * 0.5 + 0.5) * 255;
  }
  return out;
}
async function save(name, t, normalStrength, opts) {
  opts = opts || {}; const q = opts.quality || 82, size = t.size;
  await sharp(t.alb, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: q }).toFile(path.join(OUT, name + '_a.webp'));
  await sharp(normalMap(t.H, size, normalStrength || 3), { raw: { width: size, height: size, channels: 3 } }).webp({ quality: Math.min(95, q + 8) }).toFile(path.join(OUT, name + '_n.webp'));
  await sharp(t.orm, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: q - 6 }).toFile(path.join(OUT, name + '_orm.webp'));
  if (t.emi) await sharp(t.emi, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: q }).toFile(path.join(OUT, name + '_e.webp'));
  console.log('  ' + name + (t.emi ? ' (+emissive)' : ''));
}

// ---------- the recipes ----------
const R = {
  concrete() { const f = fbmFn(4, 6, 1), g = fbmFn(2, 4, 7), cr = voronoiFn(7, 3), mo = fbmFn(5, 5, 9), st = fbmFn(3, 5, 12);
    return build(N, (u, v) => { const n = f(u, v), c = cr(u, v), crack = 1 - sstep(0, 0.012, c.edge), moss = sstep(0.55, 0.78, mo(u, v)) * (0.35 + crack * 0.65), stain = sstep(0.5, 0.8, st(u, v)) * 0.45;
      let col = mixc([150, 148, 140], [118, 116, 110], n); col = mixc(col, [70, 66, 58], stain); col = mixc(col, [58, 88, 40], moss * 0.75); col = col.map((x) => x * (1 - crack * 0.6)); const h = n * 0.35 + (1 - crack) * 0.5 - moss * 0.1 + g(u, v) * 0.15;
      return { c: col, h, r: 0.88 - moss * 0.1, ao: 1 - crack * 0.5 - stain * 0.2 }; }); },
  pavers() { const f = fbmFn(6, 5, 21), mo = fbmFn(4, 5, 23), cells = 8;
    return build(N, (u, v) => { const gu = u * cells, gv = v * cells, fu = gu - Math.floor(gu), fv = gv - Math.floor(gv), id = (Math.floor(gu) * 7 + Math.floor(gv) * 13) % 11 / 11, edge = Math.min(fu, 1 - fu, fv, 1 - fv), mort = 1 - sstep(0.02, 0.07, edge), n = f(u, v), moss = sstep(0.5, 0.75, mo(u, v)) * (0.3 + mort * 0.7);
      let col = mixc([128, 124, 116], [96, 92, 86], id * 0.7 + n * 0.3); col = mixc(col, [38, 36, 32], mort * 0.8); col = mixc(col, [52, 84, 36], moss * 0.8); return { c: col, h: (1 - mort) * 0.6 + n * 0.25, r: 0.85, ao: 1 - mort * 0.6 }; }); },
  dirt() { const f = fbmFn(4, 6, 31), vo = voronoiFn(14, 33), vo2 = voronoiFn(26, 35), st = fbmFn(8, 4, 37);
    return build(N, (u, v) => { const n = f(u, v), a = vo(u, v), b = vo2(u, v), leaf = sstep(0.0, 0.05, a.edge) * (1 - sstep(0.3, 0.9, a.d1 * 14)), s = st(u, v);
      let col = mixc([72, 54, 38], [48, 36, 26], n); const lc = a.id < 0.35 ? [78, 70, 30] : a.id < 0.7 ? [92, 58, 28] : [48, 66, 30]; col = mixc(col, lc, leaf * 0.6 * sstep(0.4, 0.6, s)); col = mixc(col, [110, 106, 98], (1 - sstep(0, 0.05, b.d1)) * 0.5 * sstep(0.62, 0.75, n)); return { c: col, h: n * 0.5 + leaf * 0.35 + (1 - sstep(0, 0.05, b.d1)) * 0.3, r: 0.96, ao: 0.6 + n * 0.4 }; }); },
  grass() { const f = fbmFn(5, 6, 41), bl = fbmFn(64, 2, 43), pat = fbmFn(3, 4, 45);
    return build(N, (u, v) => { const n = f(u, v), b = bl(u * 0.3, v), pa = pat(u, v); let col = mixc([32, 58, 26], [64, 96, 38], n * 0.7 + b * 0.5); col = mixc(col, [88, 78, 36], sstep(0.62, 0.8, pa) * 0.4); return { c: col, h: b * 0.5 + n * 0.3, r: 0.9, ao: 0.55 + n * 0.45 }; }); },
  asphalt() { const f = fbmFn(8, 6, 51), cr = voronoiFn(5, 53), g = fbmFn(64, 1, 55);
    return build(N, (u, v) => { const n = f(u, v), c = cr(u, v), crack = 1 - sstep(0, 0.01, c.edge), gr = g(u, v); let col = mixc([54, 54, 56], [38, 38, 40], n); col = col.map((x) => x + (gr - 0.5) * 22); col = col.map((x) => x * (1 - crack * 0.7)); return { c: col, h: n * 0.3 + gr * 0.2 + (1 - crack) * 0.4, r: 0.78 + gr * 0.15, ao: 1 - crack * 0.6 }; }); },
  basalt() { const f = fbmFn(4, 6, 61), rg = ridge(fbmFn(3, 6, 63)), cr = voronoiFn(6, 65), ash = fbmFn(8, 5, 67);
    return build(N, (u, v) => { const n = f(u, v), r = rg(u, v), c = cr(u, v), crack = 1 - sstep(0, 0.03, c.edge), a = ash(u, v); let col = mixc([30, 28, 30], [62, 54, 52], r * n * 1.4); col = mixc(col, [86, 82, 80], sstep(0.62, 0.8, a) * 0.3); const glow = crack * sstep(0.35, 0.65, f(v, u));
      return { c: col, h: r * 0.7 + n * 0.3 - crack * 0.25, r: 0.82, ao: 0.4 + r * 0.6 - crack * 0.3, e: [255 * glow * 0.95, 80 * glow * 0.9, 12 * glow] }; }); },
  lava() { const f = fbmFn(4, 6, 71), g = fbmFn(8, 5, 73), cr = voronoiFn(9, 75);
    return build(N, (u, v) => { const n = f(u, v), c = cr(u, v), crust = sstep(0.25, 0.6, g(u, v) * 0.6 + c.edge * 6), heat = 1 - crust; const em = [255 * (0.4 + heat * 0.6), 130 * heat + 20, 10 * heat]; return { c: mixc([255, 120, 20], [34, 24, 22], crust), h: crust * 0.5 + n * 0.3, r: 0.6 + crust * 0.3, e: em.map((x, i) => x * (0.55 + heat * 0.6)) }; }); },
  wall() { const f = fbmFn(4, 6, 81), st = fbmFn(24, 1, 83), mo = fbmFn(5, 5, 85), seam = 4;
    return build(N, (u, v) => { const n = f(u, v), streak = fbmFn(1, 1, 1) && 0, sx = vnoise(lattice(32, 87), u, v * 0.05) , rain = sstep(0.45, 0.8, sx) * (0.3 + v * 0.7), panel = 1 - sstep(0, 0.006, Math.min(Math.abs(((u * seam) % 1) - 0), Math.abs(((v * 3) % 1) - 0))), moss = sstep(0.5, 0.78, mo(u, v)) * (0.4 + (1 - v) * 0.6) * 0.0 + sstep(0.58, 0.8, mo(u, v)) * 0.55; void streak;
      let col = mixc([172, 168, 156], [140, 136, 126], n); col = mixc(col, [58, 54, 46], rain * 0.55); col = mixc(col, [58, 86, 38], moss * 0.7); col = col.map((x) => x * (1 - panel * 0.5)); return { c: col, h: n * 0.4 + (1 - panel) * 0.4 - moss * 0.15, r: 0.86, ao: 1 - panel * 0.5 - rain * 0.2 }; }); },
  rock() { const f = fbmFn(3, 7, 91), rg = ridge(fbmFn(4, 6, 93)), mo = fbmFn(5, 6, 95), st = ridge(fbmFn(2, 4, 97));
    return build(N, (u, v) => { const n = f(u, v), r = rg(u, v), strata = st(u, v * 2 % 1), moss = sstep(0.5, 0.72, mo(u, v)) * (0.5 + n * 0.5); let col = mixc([66, 62, 56], [112, 104, 92], r * 0.7 + n * 0.4); col = mixc(col, [30, 56, 24], moss * 0.85); col = mixc(col, [24, 22, 20], (1 - strata) * 0.25); return { c: col, h: r * 0.65 + n * 0.35, r: 0.9, ao: 0.4 + r * 0.6 }; }); },
  steel() { const f = fbmFn(4, 6, 101), ru = fbmFn(5, 6, 103), sc = fbmFn(96, 1, 105);
    return build(N, (u, v) => { const n = f(u, v), rib = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5, rust = sstep(0.5, 0.75, ru(u, v)); let col = mixc([92, 104, 112], [70, 80, 88], n); col = mixc(col, [118, 62, 30], rust * 0.8); col = col.map((x) => x * (0.82 + rib * 0.3)); const sx = sc(u, v); return { c: col.map((x) => x + (sx - 0.5) * 18), h: rib * 0.5 + n * 0.2, r: mix(0.45, 0.9, rust), m: mix(0.8, 0.1, rust), ao: 0.6 + rib * 0.4 }; }); },
  lab() { const f = fbmFn(5, 6, 111), dirt = fbmFn(4, 6, 113), cells = 16;
    return build(N, (u, v) => { const gu = u * cells, gv = v * cells, fu = gu - Math.floor(gu), fv = gv - Math.floor(gv), edge = Math.min(fu, 1 - fu, fv, 1 - fv), grout = 1 - sstep(0.02, 0.06, edge), id = ((Math.floor(gu) * 5 + Math.floor(gv) * 3) % 7) / 7, d = sstep(0.45, 0.78, dirt(u, v)); let col = mixc([204, 206, 200], [170, 174, 168], id * 0.5 + f(u, v) * 0.4); col = mixc(col, [70, 76, 54], d * 0.6); col = mixc(col, [90, 92, 86], grout); return { c: col, h: (1 - grout) * 0.7, r: 0.4 + d * 0.5, ao: 1 - grout * 0.5 - d * 0.2 }; }); },
  wood() { const f = fbmFn(2, 6, 121), gr = fbmFn(2, 1, 123);
    return build(N, (u, v) => { const bx = vnoise(lattice(4, 125), u, v * 0.02) , plank = Math.floor(v * 6), pu = ((v * 6) % 1), edge = Math.min(pu, 1 - pu), gap = 1 - sstep(0.01, 0.045, edge), grain = vnoise(lattice(64, 127 + plank), u * 0.08, v * 6) * 0.5 + vnoise(lattice(16, 129 + plank), u * 0.2, v * 6) * 0.5, n = f(u, v), tone = ((plank * 37) % 10) / 10; void bx; void gr;
      let col = mixc([118, 96, 70], [78, 62, 44], grain * 0.7 + tone * 0.3); col = mixc(col, [92, 98, 84], sstep(0.55, 0.8, n) * 0.35); col = col.map((x) => x * (1 - gap * 0.75)); return { c: col, h: grain * 0.4 + (1 - gap) * 0.5, r: 0.88, ao: 1 - gap * 0.6 }; }); },
  bark() { const f = fbmFn(3, 6, 131), rg = ridge(fbmFn(2, 5, 133)), mo = fbmFn(6, 5, 135);
    return build(N, (u, v) => { const fx = vnoise(lattice(16, 137), u, v * 0.05), n = f(u * 1, v), r = ridge((x, y) => vnoise(lattice(20, 139), x, y * 0.06))(u, v), moss = sstep(0.5, 0.72, mo(u, v)); void rg; let col = mixc([44, 36, 28], [88, 76, 62], r * 0.8 + n * 0.3); col = mixc(col, [40, 66, 28], moss * 0.55); return { c: col, h: r * 0.8 + fx * 0.2, r: 0.95, ao: 0.35 + r * 0.65 }; }); },
  metal() { const f = fbmFn(5, 6, 141), ru = fbmFn(4, 6, 143), sc = fbmFn(80, 1, 145);
    return build(N, (u, v) => { const n = f(u, v), rust = sstep(0.42, 0.7, ru(u, v)); let col = mixc([110, 118, 120], [60, 66, 72], n); col = mixc(col, [128, 66, 28], rust * 0.85); return { c: col.map((x) => x + (sc(u, v) - 0.5) * 14), h: n * 0.3 + (1 - rust) * 0.1, r: mix(0.5, 0.92, rust), m: mix(0.7, 0.05, rust), ao: 0.7 }; }); },
  paint() { const f = fbmFn(5, 6, 151), pe = fbmFn(4, 6, 153), dirt = fbmFn(6, 5, 155);       // faded vehicle paint, light grey so it can be tinted
    return build(N, (u, v) => { const n = f(u, v), peel = sstep(0.55, 0.72, pe(u, v)), d = sstep(0.5, 0.8, dirt(u, v)); let col = mixc([204, 204, 200], [170, 170, 164], n); col = mixc(col, [120, 70, 34], peel * 0.8); col = mixc(col, [60, 56, 44], d * 0.55); return { c: col, h: n * 0.3 - peel * 0.3, r: 0.55 + peel * 0.35 + d * 0.2, m: peel * 0.5, ao: 0.8 }; }); },
  noise() { const f = fbmFn(4, 6, 161); return build(512, (u, v) => { const n = f(u, v); return { c: [n * 255, n * 255, n * 255], h: n, r: 1 }; }); },
  waternorm() { const f = fbmFn(8, 5, 171), g = fbmFn(16, 4, 173); return build(512, (u, v) => { const n = f(u, v) * 0.7 + g(u + 0.3, v) * 0.3; return { c: [30, 60, 50], h: n, r: 0.1 }; }); },
};
// the foliage atlas: fern, palm, broad leaf and grass tufts drawn as SVG (alpha cutout), saved as WebP with alpha
async function foliage() {
  const leaf = (cx, cy, len, w, ang, fill, stroke) => `<g transform="translate(${cx} ${cy}) rotate(${ang})"><path d="M0 0 C ${w} ${-len * 0.3}, ${w} ${-len * 0.7}, 0 ${-len} C ${-w} ${-len * 0.7}, ${-w} ${-len * 0.3}, 0 0Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><path d="M0 0 L0 ${-len * 0.95}" stroke="${stroke}" stroke-width="2" opacity=".6"/></g>`;
  const fern = (ox, oy, s) => { let g = `<g transform="translate(${ox} ${oy}) scale(${s})">`; for (let k = 0; k < 9; k++) { const a = -80 + k * 20, l = 150 + (k % 3) * 20; g += `<g transform="rotate(${a})"><path d="M0 0 Q 8 ${-l * 0.5} 0 ${-l}" fill="none" stroke="#2a4a1a" stroke-width="3"/>`; for (let i = 1; i < 14; i++) { const t = i / 14, y = -l * t, w = 34 * (1 - t * 0.85); g += `<path d="M0 ${y} q ${w * 0.6} ${-w * 0.5} ${w} ${-w * 0.2} q ${-w * 0.5} ${w * 0.5} ${-w} ${w * 0.2}Z M0 ${y} q ${-w * 0.6} ${-w * 0.5} ${-w} ${-w * 0.2} q ${w * 0.5} ${w * 0.5} ${w} ${w * 0.2}Z" fill="${i % 2 ? '#3d7a26' : '#356b22'}" stroke="#1d3a10" stroke-width="1"/>`; } g += '</g>'; } return g + '</g>'; };
  const palm = (ox, oy, s) => { let g = `<g transform="translate(${ox} ${oy}) scale(${s})">`; for (let k = 0; k < 7; k++) { const a = -78 + k * 26, l = 190; g += `<g transform="rotate(${a})"><path d="M0 0 Q 18 ${-l * 0.55} 0 ${-l}" fill="none" stroke="#3a3a1a" stroke-width="4"/>`; for (let i = 1; i < 22; i++) { const t = i / 22, y = -l * t, w = 46 * Math.sin(Math.PI * Math.min(1, t * 1.15)); g += `<path d="M0 ${y} l ${w} ${w * 0.9} l -4 -2Z M0 ${y} l ${-w} ${w * 0.9} l 4 -2Z" fill="#2f6a22" stroke="#173810" stroke-width="1"/>`; } g += '</g>'; } return g + '</g>'; };
  const broad = (ox, oy, s) => { let g = `<g transform="translate(${ox} ${oy}) scale(${s})">`; for (let k = 0; k < 6; k++) g += leaf(0, 0, 150 + (k % 2) * 30, 52, -75 + k * 30, k % 2 ? '#2f7a2a' : '#3a8a30', '#16380f'); return g + '</g>'; };
  const tuft = (ox, oy, s) => { let g = `<g transform="translate(${ox} ${oy}) scale(${s})">`; for (let k = 0; k < 22; k++) { const a = -50 + k * 4.6, l = 80 + (k * 37 % 50); g += `<path d="M${(k - 11) * 2} 0 Q ${(k - 11) * 3} ${-l * 0.6} ${(k - 11) * 5 + a * 0.5} ${-l}" fill="none" stroke="${k % 3 ? '#4a8a2a' : '#6aa23a'}" stroke-width="4" stroke-linecap="round"/>`; } return g + '</g>'; };
  const vine = (ox, oy, s) => { let g = `<g transform="translate(${ox} ${oy}) scale(${s})"><path d="M0 0 C 20 60, -20 120, 6 200 S 10 300, 0 360" fill="none" stroke="#2a3a18" stroke-width="5"/>`; for (let i = 0; i < 14; i++) { const y = i * 26 + 10, x = Math.sin(i) * 12; g += leaf(x, y, 34, 14, i % 2 ? 60 : -60, '#2f7a2a', '#16380f'); } return g + '</g>'; };
  const sheets = { fern: fern(256, 480, 1.1), palm: palm(256, 480, 1.0), broad: broad(256, 480, 1.4), grass: tuft(256, 490, 1.8), vine: vine(256, 20, 1.2) };
  for (const [name, body] of Object.entries(sheets)) { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`; await sharp(Buffer.from(svg)).webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(OUT, 'leaf_' + name + '.webp')); console.log('  leaf_' + name); }
}
(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null, t0 = Date.now();
  const map = { concrete: ['concrete', 3], pavers: ['pavers', 4], dirt: ['dirt', 4], grass: ['grass', 3], asphalt: ['asphalt', 3], basalt: ['basalt', 5], lava: ['lava', 3], wall: ['wall', 3], rock: ['rock', 5], steel: ['steel', 3], lab: ['lab', 3], wood: ['wood', 3], bark: ['bark', 5], metal: ['metal', 2], paint: ['paint', 2] };
  for (const [name, [rec, ns]] of Object.entries(map)) { if (only && !only.includes(name)) continue; await save(name, R[rec](), ns); }
  if (!only || only.includes('noise')) { const t = R.noise(); await sharp(t.alb, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 85 }).toFile(path.join(OUT, 'noise.webp')); console.log('  noise'); }
  if (!only || only.includes('waternorm')) { const t = R.waternorm(); await sharp(normalMap(t.H, 512, 6), { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 90 }).toFile(path.join(OUT, 'water_n.webp')); console.log('  water_n'); }
  if (!only || only.includes('foliage')) await foliage();
  console.log('done in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
