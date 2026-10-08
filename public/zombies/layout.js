// Zombies arena layout, collision and path-finding. Pure maths (no three.js, no DOM) so it also runs in Node for tests.
// World units are metres. The arena is a square of side 2*HALF centred on 0,0; y is up and the ground is y=0.

export const HALF = 50;          // outer wall centre line is at +-HALF; the playable floor ends at the inner face
export const WALL_T = 1.5;       // perimeter wall thickness
export const CELL = 1;           // path-finding grid cell size
export const N = HALF * 2 / CELL;

// Solid props. kind decides how world.js draws it; w/d are the full footprint (x/z), h the height.
// type 'box' = axis-aligned box centred on x,z. type 'circle' = upright cylinder of radius r.
const P = [];
const box = (kind, x, z, w, d, h, extra) => P.push(Object.assign({ type: 'box', kind, x, z, w, d, h }, extra));
const circ = (kind, x, z, r, h, extra) => P.push(Object.assign({ type: 'circle', kind, x, z, r, h }, extra));

// Central bunker: a walled square with a 4.4 m door in the middle of each side and two crates inside.
const BH = 8, DOOR = 2.2, SEG = BH - DOOR, SC = (BH + DOOR) / 2;
for (const s of [-1, 1]) {
    box('bunker', -SC, s * BH, SEG, 1, 3.2); box('bunker', SC, s * BH, SEG, 1, 3.2);
    box('bunker', s * BH, -SC, 1, SEG, 3.2); box('bunker', s * BH, SC, 1, SEG, 3.2);
}
box('crate', -4.5, -4.5, 1.6, 1.6, 1.6); box('crate', 4.5, 4.5, 1.6, 1.6, 1.6);

// Shipping containers (col = colour index)
box('container', -26, -18, 9, 2.5, 2.6, { col: 0 }); box('container', 26, 18, 9, 2.5, 2.6, { col: 1 });
box('container', 22, -24, 2.5, 9, 2.6, { col: 2 }); box('container', -22, 24, 2.5, 9, 2.6, { col: 3 });
box('container', 0, -35, 9, 2.5, 2.6, { col: 1 }); box('container', 0, 35, 9, 2.5, 2.6, { col: 0 });

// Concrete barriers
for (const [x, z, w, d] of [[-15, 0, 1, 4], [15, 0, 1, 4], [0, -17, 4, 1], [0, 17, 4, 1], [-38, -4, 1, 4], [38, 4, 1, 4], [-8, -41, 4, 1], [8, 41, 4, 1]])
    box('barrier', x, z, w, d, 1.1);

// Sandbag walls
for (const [x, z, w, d] of [[-30, 6, 5, 1.3], [30, -6, 5, 1.3], [-12, 26, 1.3, 5], [12, -26, 1.3, 5], [-40, -30, 5, 1.3], [40, 30, 5, 1.3], [-40, 20, 1.3, 5], [40, -20, 1.3, 5]])
    box('sandbag', x, z, w, d, 1.2);

// Crate clusters
for (const [x, z, s] of [[-34, -34, 2], [-31.4, -34.6, 1.6], [-34.6, -31.4, 1.6], [34, 34, 2], [31.4, 34.6, 1.6], [34.6, 31.4, 1.6],
    [36, -34, 2], [33.6, -35.2, 1.4], [-36, 34, 2], [-33.6, 35.2, 1.4], [-12, -8 - 18, 1.6], [12, 26, 1.6]]) box('crate', x, z, s, s, s);

// Wrecked cars
box('car', -8, -27, 4.6, 2, 1.6); box('car', 18, 12, 2, 4.6, 1.6); box('car', -20, 12, 4.6, 2, 1.6); box('car', 24, -10, 2, 4.6, 1.6);

// Barrels (some burning)
for (const [x, z, fire] of [[-5, -21, 0], [-4, -22, 0], [-5.4, -22.2, 0], [10, 22, 1], [11, 21, 0], [-41, 12, 1], [41, -14, 1], [-14, -44, 0], [-15, -44.6, 0], [14, -38, 0], [-16, 40, 0]])
    circ('barrel', x, z, 0.55, 1.1, { fire });

// Floodlight poles (also solid)
for (const [x, z] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) circ('pole', x, z, 0.3, 12);

// Corner watch towers
for (const [x, z] of [[-45, -45], [45, -45], [-45, 45], [45, 45]]) box('tower', x, z, 3.4, 3.4, 9);

export const PROPS = P;

// Enemy gates: places along the inside of the perimeter wall where enemies enter (a red light marks each one).
// They stand right at the doorway (just inside the wall face), so zombies walk out of the opening.
const G = 47.8;
export const GATES = [[0, -G], [0, G], [-G, 0], [G, 0], [-G, -24], [G, 24], [-24, G], [24, -G], [-G, 24], [G, -24], [-24, -G], [24, G]];

export const FLOOR = HALF - WALL_T / 2;   // playable half-extent (inner face of the wall)

// Player-only blocks: an invisible wall across every spawn opening, flush with the wall face (it also keeps the player 0.6 m back from the doorway).
// Zombies ignore these, so they can still come through.
export const GATE_BLOCKS = GATES.map(([gx, gz]) => {
    const onX = Math.abs(gx) > Math.abs(gz), s = Math.sign(onX ? gx : gz);
    const a = FLOOR - 0.6, b = FLOOR + 2.5, c = s * (a + b) / 2, depth = b - a;   // from 0.6 m in front of the face to 2.5 m inside the wall
    return onX ? { x: c, z: gz, w: depth, d: 7 } : { x: gx, z: c, w: 7, d: depth };
});

// ---- collision ----------------------------------------------------------------------------------
// resolveCircle moves the point (o.x, o.z) out of every solid so a circle of radius r does not overlap anything,
// which makes the player and enemies slide along walls instead of stopping dead.
export function resolveCircle(o, r, playerOnly) {
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (const p of P) {
            if (p.type === 'circle') {
                const dx = o.x - p.x, dz = o.z - p.z, rr = r + p.r, d2 = dx * dx + dz * dz;
                if (d2 < rr * rr) {
                    const d = Math.sqrt(d2) || 1e-4;
                    o.x = p.x + dx / d * rr; o.z = p.z + dz / d * rr; moved = true;
                }
            } else {
                const hw = p.w / 2, hd = p.d / 2;
                const cx = Math.max(p.x - hw, Math.min(o.x, p.x + hw)), cz = Math.max(p.z - hd, Math.min(o.z, p.z + hd));
                const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
                if (d2 < r * r) {
                    if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.z = cz + dz / d * r; }
                    else { // centre is inside the box: leave through the nearest face
                        const px = hw - Math.abs(o.x - p.x), pz = hd - Math.abs(o.z - p.z);
                        if (px < pz) o.x = p.x + Math.sign(o.x - p.x || 1) * (hw + r); else o.z = p.z + Math.sign(o.z - p.z || 1) * (hd + r);
                    }
                    moved = true;
                }
            }
        }
        if (playerOnly) for (const p of GATE_BLOCKS) {
            const hw = p.w / 2, hd = p.d / 2;
            const cx = Math.max(p.x - hw, Math.min(o.x, p.x + hw)), cz = Math.max(p.z - hd, Math.min(o.z, p.z + hd));
            const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
            if (d2 < r * r) {
                if (d2 > 1e-8) { const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.z = cz + dz / d * r; }
                else { const px = hw - Math.abs(o.x - p.x), pz = hd - Math.abs(o.z - p.z); if (px < pz) o.x = p.x + Math.sign(o.x - p.x || 1) * (hw + r); else o.z = p.z + Math.sign(o.z - p.z || 1) * (hd + r); }
                moved = true;
            }
        }
        const lim = FLOOR - r;
        if (o.x > lim) { o.x = lim; moved = true; } else if (o.x < -lim) { o.x = -lim; moved = true; }
        if (o.z > lim) { o.z = lim; moved = true; } else if (o.z < -lim) { o.z = -lim; moved = true; }
        if (!moved) break;
    }
}

// ---- path-finding grid -------------------------------------------------------------------------
const INFLATE = 0.6;   // keep paths this far from solids (about an enemy's radius)
export const blocked = new Uint8Array(N * N);
function cellOf(v) { return Math.floor((v + HALF) / CELL); }
export function cellCenter(i) { return -HALF + (i + 0.5) * CELL; }
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const cx = cellCenter(i), cz = cellCenter(j);
    let b = Math.abs(cx) > FLOOR - INFLATE || Math.abs(cz) > FLOOR - INFLATE;
    if (!b) for (const p of P) {
        if (p.type === 'circle') { if (Math.hypot(cx - p.x, cz - p.z) < p.r + INFLATE) { b = true; break; } }
        else {
            const dx = Math.max(Math.abs(cx - p.x) - p.w / 2, 0), dz = Math.max(Math.abs(cz - p.z) - p.d / 2, 0);
            if (dx * dx + dz * dz < INFLATE * INFLATE) { b = true; break; }
        }
    }
    blocked[j * N + i] = b ? 1 : 0;
}

export function isBlockedAt(x, z) {
    const i = cellOf(x), j = cellOf(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return true;
    return blocked[j * N + i] === 1;
}

// true when nothing solid sits between the two points (sampled every half metre)
export function lineClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), steps = Math.ceil(len / 0.5);
    for (let s = 1; s < steps; s++) { const t = s / steps; if (isBlockedAt(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
}

// Flow field: for every free cell the walking distance to the target (BFS over 8 neighbours, no corner cutting).
export const dist = new Float32Array(N * N);
const queue = new Int32Array(N * N * 8);
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
let lastTarget = -1;

function nearestFree(i, j) {
    if (i >= 0 && j >= 0 && i < N && j < N && !blocked[j * N + i]) return j * N + i;
    for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < N && b < N && !blocked[b * N + a]) return b * N + a;
    }
    return -1;
}

// Rebuild the distances towards (tx,tz). Cheap (10,000 cells); skipped when the target is still in the same cell.
export function updateFlow(tx, tz, force) {
    const t = nearestFree(cellOf(tx), cellOf(tz));
    if (t < 0 || (t === lastTarget && !force)) return;
    lastTarget = t; dist.fill(1e9);
    let qh = 0, qt = 0; dist[t] = 0; queue[qt++] = t;
    // Dijkstra-lite: the queue is processed in order with relaxation, which is exact enough for a 1 m grid
    while (qh < qt) {
        const c = queue[qh++], ci = c % N, cj = (c / N) | 0, cd = dist[c];
        for (const [di, dj, w] of NB) {
            const a = ci + di, b = cj + dj;
            if (a < 0 || b < 0 || a >= N || b >= N) continue;
            const n = b * N + a;
            if (blocked[n]) continue;
            if (di && dj && (blocked[cj * N + a] || blocked[b * N + ci])) continue;
            const nd = cd + w;
            if (nd < dist[n] - 1e-4) { dist[n] = nd; if (qt >= queue.length) return; queue[qt++] = n; }
        }
    }
}

// Writes the unit direction an enemy standing at (x,z) should walk to reach the target into out ({x,z}); false when unknown.
export function flowDir(x, z, out) {
    const i = cellOf(x), j = cellOf(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    let best = dist[j * N + i], bi = -1, bj = -1;
    if (blocked[j * N + i]) best = 1e9;
    for (const [di, dj] of NB) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const d = dist[b * N + a];
        if (d >= 1e9) continue;
        if (di && dj && (blocked[j * N + a] || blocked[b * N + i])) continue;
        if (d < best - 1e-4) { best = d; bi = a; bj = b; }
    }
    if (bi < 0) return false;
    const dx = cellCenter(bi) - x, dz = cellCenter(bj) - z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l; out.z = dz / l;
    return true;
}

// ---- exact tests (used for melee and bullets, no safety margin) -----------------------------------
export function solidAt(x, z) {
    for (const p of P) {
        if (p.type === 'circle') { if (Math.hypot(x - p.x, z - p.z) < p.r) return true; }
        else if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) return true;
    }
    return false;
}
export function sightClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
    for (let s = 1; s < steps; s++) { const t = s / steps; if (solidAt(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
}
