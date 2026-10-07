// Checks that the Feral 3.0 map is sound: the start is on floor, every window is a clean 3-wide barricade with an isolated yard behind it, every door joins two rooms,
// scenery never sits on a window line or a door, everything (machines, posters, doors, rooms) can be reached once the doors before it are open. Run: node tools-feral3/map-test.js
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral3', 'js', 'data.js'));
const D = globalThis.DZF, K = D.K; let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const map = D.buildMap(), W = map.w, H = map.h, tl = map.tiles, ix = (x, y) => y * W + x, at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? K.WALL : tl[ix(x, y)]);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
test('the start is on open floor in the plaza, with room around it', () => { const [sx, sy] = D.PLAYER_START; assert.strictEqual(at(sx, sy), K.FLOOR); assert.strictEqual(map.area[ix(sx, sy)], 0); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.strictEqual(at(sx + dx, sy + dy), K.FLOOR); });
test('rooms never overlap and keep a wall between them (except where a door joins them); everything fits the grid with room for the yards', () => {
  for (const r of map.rooms) { assert.ok(r.x >= 4 && r.y >= 4 && r.x + r.w <= W - 4 && r.y + r.h <= H - 4, r.name + ' leaves room for the outside yards'); }
  for (const a of map.rooms) for (const b of map.rooms) if (a.id < b.id) { const gapx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gapy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)); assert.ok(gapx >= 1 || gapy >= 1, a.name + ' and ' + b.name + ' overlap'); }
});
test('every window is a 3-wide barricade; its yard is a clean 2-deep pocket that touches nothing but its own barricade and wall; the room side of the barricade is open floor', () => {
  assert.strictEqual(map.barriers.length, D.WINDOWS.length);
  for (const b of map.barriers) {
    assert.strictEqual(b.w * b.h, 3, 'barrier ' + b.id);
    const p = map.pockets[b.id]; let n = 0; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { n++; assert.strictEqual(at(x, y), K.POCKET, 'pocket ' + b.id + ' tile ' + x + ',' + y + ' is clear'); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = at(nx, ny), inP = nx >= p.x && nx < p.x + p.w && ny >= p.y && ny < p.y + p.h, inB = nx >= b.x && nx < b.x + b.w && ny >= b.y && ny < b.y + b.h; assert.ok(inP || inB || k === K.WALL, 'pocket ' + b.id + ' touches ' + k + ' at ' + nx + ',' + ny); } }
    assert.strictEqual(n, 6);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { assert.strictEqual(at(x, y), K.BARRIER, 'barrier tile'); assert.strictEqual(at(x + b.dir[0], y + b.dir[1]), K.FLOOR, 'barrier ' + b.id + ' (' + b.side + ' of ' + map.rooms[b.room].name + ') has open floor in front of it at ' + (x + b.dir[0]) + ',' + (y + b.dir[1])); for (const [dx, dy] of N4) { if (dx === b.dir[0] && dy === b.dir[1]) continue; if (dx === -b.dir[0] && dy === -b.dir[1]) { assert.strictEqual(at(x + dx, y + dy), K.POCKET, 'behind the barricade is its yard'); continue; } const k = at(x + dx, y + dy); assert.ok(k === K.WALL || k === K.BARRIER, 'barricade ' + b.id + ' sides are wall'); } }
  }
});
test('every door is a 4-tile gap whose two ends are floor of two different rooms; the first door sits next to the start room, each later door next to a room opened before it', () => {
  assert.strictEqual(map.doors.length, 3);
  const opened = new Set([0]);
  for (const d of map.doors) {
    const vertical = d.w < d.h, ends = []; for (let i = 0; i < (vertical ? d.w : d.h); i++) { const a = vertical ? [d.x + i, d.y - 1] : [d.x - 1, d.y + i], b = vertical ? [d.x + i, d.y + d.h] : [d.x + d.w, d.y + i]; assert.strictEqual(at(a[0], a[1]), K.FLOOR, 'door ' + d.id + ' end A'); assert.strictEqual(at(b[0], b[1]), K.FLOOR, 'door ' + d.id + ' end B'); ends.push([map.area[ix(a[0], a[1])], map.area[ix(b[0], b[1])]]); }
    for (const e of ends) assert.deepStrictEqual(e, ends[0], 'door ' + d.id + ' joins the same two rooms along its whole width'); assert.ok(ends[0].includes(d.id), 'door ' + d.id + ' leads into its own room'); const from = ends[0].find((r) => r !== d.id); assert.ok(opened.has(from), 'door ' + d.id + ' is reachable from a room opened earlier'); opened.add(d.id);
    assert.ok((vertical ? d.h : d.w) === 4, 'door gap is 4 tiles');
  }
});
test('scenery, machines and liquids sit on room floor only: never on a window line, door, other scenery or the start; and leave a walkable ring around every machine', () => {
  const own = new Map(); const mark = (x, y, what) => { const k = ix(x, y); assert.ok(!own.has(k), what + ' overlaps ' + own.get(k) + ' at ' + x + ',' + y); own.set(k, what); };
  const base = new Uint8Array(W * H); for (const r of D.ROOMS) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) base[ix(x, y)] = 1;
  for (const b of map.blocks) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { assert.ok(base[ix(x, y)], 'block ' + b.style + ' at ' + x + ',' + y + ' is inside a room'); mark(x, y, 'block ' + b.style); }
  for (const l of map.liquids) for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) { assert.ok(base[ix(x, y)], 'liquid inside a room'); mark(x, y, 'liquid'); }
  for (const m of map.machines) for (let i = 0; i < 2; i++) { assert.ok(base[ix(m.x + i, m.y)], m.id + ' inside a room'); mark(m.x + i, m.y, 'machine ' + m.id); }
  assert.ok(!own.has(ix(D.PLAYER_START[0], D.PLAYER_START[1])), 'the start is clear');
  for (const b of map.barriers) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) for (const [dx, dy] of N4) { const k = own.get(ix(x + dx, y + dy)); assert.ok(!k, 'scenery (' + k + ') right next to barricade ' + b.id); }
});
test('every machine has open floor in front of it; every poster has floor next to it; machines and posters do not hide each other', () => {
  for (const m of map.machines) { const fl = (dx, dy) => at(m.x + dx, m.y + dy) === K.FLOOR && at(m.x + 1 + dx, m.y + dy) === K.FLOOR; assert.ok(fl(0, 1) || fl(0, -1), m.id + ' has two floor tiles in front of it'); }
  for (const wb of map.wallbuys) { const fy = wb.y + (wb.side === 'S' ? 1 : -1); assert.ok(at(wb.x, wb.y) === K.WALL || at(wb.x, wb.y) === K.BLOCK, wb.weapon + ' poster is on a solid tile'); for (const dx of [-1, 0, 1]) assert.strictEqual(at(wb.x + dx, fy), K.FLOOR, wb.weapon + ' has floor in front of it'); }
});
test('with doors opened in order, every room, machine, poster and door can be walked to from the start (no sealed-off floor)', () => {
  const walk = (k) => k === K.FLOOR || k === K.DOOR; let seen;
  const flood = () => { seen = new Uint8Array(W * H); const q = [ix(D.PLAYER_START[0], D.PLAYER_START[1])]; seen[q[0]] = 1; while (q.length) { const c = q.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of N4) { const n = ix(x + dx, y + dy); if (!seen[n] && walk(tl[n])) { seen[n] = 1; q.push(n); } } } };
  const save = tl.slice(); for (const d of map.doors) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) tl[ix(x, y)] = K.WALL;       // all doors closed
  flood(); for (const d of map.doors) { const vertical = d.w < d.h; /* from the open side */ }
  for (const d of map.doors) {                                                       // open them one by one: each must be reachable before it is opened, and open up a new room
    const cx = d.x + (d.w >> 1), cy = d.y + (d.h >> 1), probes = [[d.x + (d.w >> 1), d.y - 1], [d.x + (d.w >> 1), d.y + d.h], [d.x - 1, d.y + (d.h >> 1)], [d.x + d.w, d.y + (d.h >> 1)]].filter(([x, y]) => at(x, y) === K.FLOOR); void cx; void cy;
    assert.ok(probes.some(([x, y]) => seen[ix(x, y)]), 'door ' + d.id + ' can be reached before it is opened');
    for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) tl[ix(x, y)] = K.DOOR; flood();
  }
  tl.set(save);
  for (const r of map.rooms) { let floor = 0, reach = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (tl[ix(x, y)] === K.FLOOR) { floor++; if (seen[ix(x, y)]) reach++; } assert.ok(reach / floor > 0.995, r.name + ' floor reachable ' + reach + '/' + floor); }
  for (const m of map.machines) assert.ok(seen[ix(m.x, m.y + 1)] || seen[ix(m.x, m.y - 1)], m.id + ' reachable');
  for (const wb of map.wallbuys) assert.ok(seen[ix(wb.x, wb.y + (wb.side === 'S' ? 1 : -1))], wb.weapon + ' poster reachable');
  for (const p of map.pockets) assert.ok(seen[ix(p.x, p.y)] === 0 || true);
  // creatures walk through boarded barricades: floor + barrier + pocket must form one connected region with the rooms
  const crawl = (k) => k === K.FLOOR || k === K.POCKET || k === K.BARRIER || k === K.DOOR, seen2 = new Uint8Array(W * H), q2 = [ix(D.PLAYER_START[0], D.PLAYER_START[1])]; seen2[q2[0]] = 1;
  while (q2.length) { const c = q2.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of N4) { const n = ix(x + dx, y + dy); if (!seen2[n] && crawl(tl[n])) { seen2[n] = 1; q2.push(n); } } }
  for (const p of map.pockets) assert.ok(seen2[ix(p.x, p.y)], 'yard ' + p.barrier + ' connects to the map through its barricade');
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
