// Offline checks for Dead Zone: Feral: the map is sound (everything reachable, nothing blocked), and a bot plays many rounds without crashes or softlocks.
// Run: node tools-feral/sim-test.js [seeds] [maxRound]
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral', 'js', 'data.js'));
require(path.join(__dirname, '..', 'public', 'feral', 'js', 'sim.js'));
const D = globalThis.DZF, K = D.K, T = D.T;
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

// ---------- map ----------
test('map: start is on a floor tile; every window is 3 wide with a pocket behind it; every room, machine and poster is reachable once all doors are open', () => {
  const map = D.buildMap(), W = map.w, H = map.h, tl = map.tiles, ix = (x, y) => y * W + x;
  assert.strictEqual(tl[ix(D.PLAYER_START[0], D.PLAYER_START[1])], K.FLOOR);
  const doors = map.doors; assert.strictEqual(doors.length, 4);
  assert.strictEqual(map.barriers.length, D.WINDOWS.length); assert.strictEqual(map.pockets.length, D.WINDOWS.length);
  for (const b of map.barriers) assert.strictEqual(b.w * b.h, 3, 'barrier ' + b.id);
  for (const p of map.pockets) { let n = 0; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (tl[ix(x, y)] === K.POCKET) n++; assert.strictEqual(n, p.w * p.h, 'pocket ' + p.barrier + ' is clear'); }
  // walkable for creatures: floor, pocket, barrier (they break it). Open all doors.
  const walk = (k) => k === K.FLOOR || k === K.POCKET || k === K.BARRIER || k === K.DOOR;
  const seen = new Uint8Array(W * H), q = [ix(D.PLAYER_START[0], D.PLAYER_START[1])]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ix(nx, ny); if (!seen[n] && walk(tl[n])) { seen[n] = 1; q.push(n); } } }
  for (const r of map.rooms) for (const [x, y] of [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1], [r.x + (r.w >> 1), r.y + (r.h >> 1)]]) if (tl[ix(x, y)] === K.FLOOR) assert.ok(seen[ix(x, y)], r.name + ' corner ' + x + ',' + y + ' reachable');
  for (const r of map.rooms) { let floor = 0, reach = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (tl[ix(x, y)] === K.FLOOR) { floor++; if (seen[ix(x, y)]) reach++; } assert.ok(reach / floor > 0.97, r.name + ' floor reachable ' + reach + '/' + floor); }
  for (const p of map.pockets) assert.ok(seen[ix(p.x, p.y)], 'pocket ' + p.barrier + ' connects to the map through its barrier');
  const floorNext = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tl[ix(x + dx, y + dy)] === K.FLOOR && seen[ix(x + dx, y + dy)]);
  for (const m of map.machines) assert.ok(floorNext(m.x, m.y) || floorNext(m.x + 1, m.y), m.id + ' machine can be reached');
  for (const wb of map.wallbuys) { const fx = wb.x, fy = wb.y + (wb.side === 'S' ? 1 : -1); assert.strictEqual(tl[ix(wb.x, wb.y)], K.WALL, wb.weapon + ' poster sits on a wall tile'); assert.strictEqual(tl[ix(fx, fy)], K.FLOOR, wb.weapon + ' has floor next to it'); }
  // no scenery on window lines or doors
  for (const [x, y, w, h] of D.BLOCKS) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) assert.strictEqual(map.area[ix(xx, yy)] >= 0, true, 'block inside a room');
});
test('every door joins the start room to a room that has no other way in', () => {
  const map = D.buildMap(); const g = D.createGame({ seed: 1 });
  g.player.x = (D.PLAYER_START[0] + .5) * T; g.buildFlow();
  for (const room of map.rooms.slice(1)) { const t = ((room.y + (room.h >> 1)) * map.w + room.x + (room.w >> 1)); assert.strictEqual(g.flow[t], 32767, room.name + ' is closed until its door is bought'); }
});
test('rounds: round 1 is small, the plan grows steadily, every 5th round is a boss round, hp scaling does not explode', () => {
  const p = (r) => D.roundPlan(r);
  assert.ok(p(1).count <= 9 && p(1).weights.glumpkin === 1 && Object.keys(p(1).weights).length === 1);
  for (let r = 2; r <= 25; r++) assert.ok(p(r).count >= p(r - 1).count - (p(r).boss ? 40 : 0), 'count grows ' + r);
  assert.deepStrictEqual([5, 10, 15, 20].map((r) => p(r).boss), [true, true, true, true]); assert.strictEqual(p(7).boss, false); assert.strictEqual(p(10).bossCount, 1); assert.strictEqual(p(11).bossCount, 0); assert.strictEqual(p(20).bossCount, 2);
  assert.ok(p(10).hpMult < 3.2 && p(20).hpMult < 9);
});

require('./bot.js'); const { bot, SHOP_FULL } = globalThis.DZFBot;
function play(seed, maxRound, shopping) {
  const g = D.createGame({ seed }), map = g.map, shop = shopping ? SHOP_FULL(map) : [];
  const b = bot(g, shop); const rows = []; let lastRound = 0, rs = null, frames = 0;
  const t0 = Date.now();
  while (!g.over && g.round <= maxRound && frames < 60 * 60 * 90) {
    if (g.round !== lastRound) { if (rs) rows.push(rs); lastRound = g.round; rs = { round: g.round, t0: g.t, hpMin: 100, kills0: g.kills, pts0: g.points, maxAlive: 0 }; }
    const inp = b();
    g.update(1 / 60, inp); frames++; g.events.length = 0;
    if (rs) { rs.hpMin = Math.min(rs.hpMin, g.player.hp); rs.maxAlive = Math.max(rs.maxAlive, g.enemies.length); rs.end = g.t; rs.kills = g.kills - rs.kills0; rs.pts = g.points; }
  }
  if (rs) rows.push(rs);
  return { g, rows, frames, ms: Date.now() - t0 };
}

const seeds = parseInt(process.argv[2] || '4', 10), maxRound = parseInt(process.argv[3] || '12', 10);
test('bot with the full shopping list plays ' + maxRound + ' rounds on ' + seeds + ' seeds: no crash, rounds end by themselves (no softlock)', () => {
  const res = [];
  for (let s = 1; s <= seeds; s++) {
    const r = play(s, maxRound, true); res.push(r);
    const last = r.rows[r.rows.length - 1];
    for (const row of r.rows) { if (row.end != null) assert.ok(row.end - row.t0 < 170, 'seed ' + s + ' round ' + row.round + ' took ' + Math.round(row.end - row.t0) + 's'); }
    console.log('       seed ' + s + ': reached round ' + r.g.round + (r.g.over ? ' (down)' : '') + ', kills ' + r.g.kills + ', points ' + r.g.points + ', weapons ' + r.g.player.weapons.map((w) => w.id).join('/') + ', sim time ' + Math.round(r.g.t) + 's in ' + r.ms + 'ms');
    if (s === 1) console.log('       round table (seed 1): ' + r.rows.map((x) => 'r' + x.round + ' ' + Math.round((x.end || x.t0) - x.t0) + 's hpMin ' + Math.round(x.hpMin) + ' alive<=' + x.maxAlive).join(' | '));
  }
  assert.ok(res.every((r) => r.g.round >= 5), 'every seed gets past round 4');
});
test('bot with only the starting pistol (no shopping) struggles later but round 1-2 are easy', () => {
  const r = play(7, 4, false);
  const first = r.rows[0]; assert.ok(first && first.hpMin > 60, 'round 1 is easy: lowest health ' + (first && Math.round(first.hpMin)));
  console.log('       pistol only: reached round ' + r.g.round + (r.g.over ? ' (down)' : '') + ' ' + r.rows.map((x) => 'r' + x.round + ' hpMin ' + Math.round(x.hpMin)).join(' | '));
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
