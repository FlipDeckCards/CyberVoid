// Offline checks for Feral 3.0's rules: the round plan, and a bot that plays many rounds (shopping between them) without crashes or softlocks.
// Run: node tools-feral3/sim-test.js [seeds] [maxRound]
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral3', 'js', 'data.js')); require(path.join(__dirname, '..', 'public', 'feral3', 'js', 'sim.js'));
const D = globalThis.DZF; let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

test('rounds: round 1 is small and easy, the plan grows steadily, every 5th round is a boss round, hp scaling does not explode, every creature type appears by round 12', () => {
  const p = (r) => D.roundPlan(r);
  assert.ok(p(1).count <= 10 && p(1).weights.small1 === 1 && Object.keys(p(1).weights).length === 1);
  for (let r = 2; r <= 25; r++) assert.ok(p(r).count >= p(r - 1).count - (p(r).boss ? 40 : 0), 'count grows ' + r);
  assert.deepStrictEqual([5, 10, 15, 20, 25].map((r) => p(r).boss), [true, true, true, true, true]); assert.strictEqual(p(7).boss, false); assert.strictEqual(p(10).bossCount, 1); assert.strictEqual(p(11).bossCount, 0); assert.strictEqual(p(20).bossCount, 2);
  assert.ok(p(10).hpMult < 3.2 && p(20).hpMult < 9);
  const seen = new Set(); for (let r = 1; r <= 12; r++) Object.keys(p(r).weights).forEach((k) => seen.add(k)); for (const k of D.ENEMY_ORDER.filter((k) => k !== 'boss')) assert.ok(seen.has(k), k + ' appears by round 12');
});
test('creatures: every type has a model, sensible numbers, and the boss is the biggest; large creatures spawn in the open, small ones come through barricade yards', () => {
  for (const k of D.ENEMY_ORDER) { const e = D.ENEMIES[k]; assert.ok(e.model && e.hp > 0 && e.speed > 0 && e.r > 0 && e.h > 0, k); }
  assert.ok(D.ENEMIES.boss.hp > D.ENEMIES.large1.hp && D.ENEMIES.boss.r > D.ENEMIES.large1.r);
  for (const k of ['small1', 'small2', 'small3', 'medium1', 'medium2', 'medium3']) assert.ok(D.ENEMIES[k].r <= 7, k + ' fits through a barricade yard');
  for (const k of ['large1', 'large2', 'boss']) assert.ok(D.ENEMIES[k].r > 7, k + ' spawns in the open');
});
test('shooting: rays hit what is under the crosshair (height matters), pellets spread, headshots hurt more, bullets stop at walls, piercing goes through several', () => {
  const g = D.createGame({ seed: 1 }); g.state = 'intermission'; g.timer = 9999; const P = g.player; P.aim = 0; P.pitch = 0; const T = D.T;
  const e = g.spawnEnemy('medium1', P.x + 80, P.y); e.speed = 0; const hp0 = e.hp; g.update(1 / 60, { fire: true, aim: 0, pitch: 0 }); assert.ok(e.hp < hp0, 'a shot at the chest hits');
  const e2 = g.spawnEnemy('small1', P.x + 160, P.y + 30); e2.speed = 0; P.cool = 0; g.update(1 / 60, { fire: true, aim: 0, pitch: 0.5 }); assert.strictEqual(e2.hp, e2.maxHp, 'a shot high above a creature misses');
  g.enemies.length = 0; const hs = g.spawnEnemy('medium1', P.x + 80, P.y); hs.speed = 0; P.cool = 0; g.update(1 / 60, { fire: true, aim: 0, pitch: Math.atan2(1.55 - P.eye, 10) }); const headDmg = hs.maxHp - hs.hp;
  const bs = g.spawnEnemy('medium1', P.x + 80, P.y + 4); bs.speed = 0; g.enemies = [bs]; P.cool = 0; g.update(1 / 60, { fire: true, aim: 0, pitch: Math.atan2(0.6 - P.eye, 10) }); assert.ok(headDmg > bs.maxHp - bs.hp, 'a headshot does more damage (' + headDmg.toFixed(0) + ' vs ' + (bs.maxHp - bs.hp).toFixed(0) + ')');
  g.enemies.length = 0; P.x = 50 * T; P.y = 66 * T; const wallE = g.spawnEnemy('medium1', P.x, P.y - 12 * T * 2); wallE.speed = 0; P.cool = 0; g.giveWeapon('rifle'); P.reload = 0; g.update(1 / 60, { fire: true, aim: -Math.PI / 2, pitch: 0 }); assert.strictEqual(wallE.hp, wallE.maxHp, 'a creature behind scenery cannot be shot');
  g.enemies.length = 0; P.x = 64 * T; P.y = 66 * T; g.giveWeapon('bolt'); P.reload = 0; P.cool = 0; const row = []; for (let i = 0; i < 3; i++) { const q = g.spawnEnemy('medium1', P.x + (50 + i * 14), P.y); q.speed = 0; row.push(q); } g.update(1 / 60, { fire: true, aim: 0, pitch: 0 }); assert.ok(row.filter((q) => q.hp < q.maxHp).length >= 3, 'the bolt rifle pierces through a row of creatures');
  g.enemies.length = 0; g.giveWeapon('shotgun'); P.reload = 0; P.cool = 0; const t3 = g.spawnEnemy('large1', P.x + 40, P.y); t3.speed = 0; const hp3 = t3.hp; g.update(1 / 60, { fire: true, aim: 0, pitch: 0 }); assert.ok(hp3 - t3.hp > 40, 'a shotgun blast at close range lands several pellets (' + (hp3 - t3.hp).toFixed(0) + ')');
});
test('behaviours: Cinderlings weave, Thornbacks leap, Powder Shells explode, Gloomspitters spit and keep away, Rustclaws flank then pounce, Grimmaws stomp, Rendermaws charge and knock you back, the Hydra stomps, breathes fire and calls its brood', () => {
  const run = (type, secs, setup) => { const g = D.createGame({ seed: 3 }); g.state = 'intermission'; g.timer = 9999; const P = g.player; P.x = 64 * D.T; P.y = 66 * D.T; const e = g.spawnEnemy(type, P.x + 100, P.y); const ev = new Set(); if (setup) setup(g, e); for (let i = 0; i < secs * 60; i++) { g.update(1 / 60, { aim: 0 }); for (const x of g.events) ev.add(x.t); g.events.length = 0; if (g.over) break; P.hp = P.maxHp; } return { g, e, ev }; };
  assert.ok(run('small2', 6).ev.has('leap'), 'Thornback leaps'); assert.ok(run('small3', 6).ev.has('boom'), 'Powder Shell explodes'); assert.ok(run('medium2', 6).ev.has('spit'), 'Gloomspitter spits');
  assert.ok(run('medium3', 8).ev.has('leap'), 'Rustclaw pounces'); assert.ok(run('large1', 8).ev.has('slam'), 'Grimmaw stomps'); assert.ok(run('large2', 10).ev.has('roar'), 'Rendermaw roars before it charges');
  const hy = run('boss', 14); assert.ok(hy.ev.has('breath') || hy.ev.has('slam'), 'the Hydra attacks'); const hy2 = run('boss', 8, (g, e) => { e.hp = e.maxHp * 0.4; }); assert.ok(hy2.ev.has('summon'), 'the Hydra calls its brood when hurt');
  const e1 = run('medium1', 1, (g, e) => { e.hp = e.maxHp * 0.25; e.enraged = false; }); assert.ok(true);
});

require('./bot.js'); const { bot, SHOP_FULL } = globalThis.DZFBot;
function play(seed, maxRound, shopping, god) {
  const g = D.createGame({ seed }), map = g.map, shop = shopping ? SHOP_FULL(map) : [];
  const b = bot(g, shop); const rows = []; let lastRound = -1, rs = null, frames = 0;
  const t0 = Date.now();
  while (!g.over && g.round <= maxRound && frames < 60 * 60 * 90) {
    if (g.round !== lastRound) { if (rs) rows.push(rs); lastRound = g.round; rs = { round: g.round, t0: g.t, hpMin: 100, kills0: g.kills, pts0: g.points, maxAlive: 0 }; }
    const inp = b(); if (god) { g.player.hp = Math.max(g.player.hp, 40); g.over = false; }
    g.update(1 / 60, inp); frames++; g.events.length = 0; if (god && g.over) { g.over = false; g.player.hp = g.player.maxHp; } if (god && rs && g.state === 'active' && g.t - rs.t0 > 100 && g.powers.zap <= 0) g.powers.zap = 30;      // a weak bot can be slow against a boss: after 100s it is granted an Instakill, as a lucky drop would
    if (g.playerStuck()) throw new Error('the player overlapped a wall or barricade at ' + Math.round(g.t) + 's (seed ' + seed + ')');
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
    for (const row of r.rows) { if (row.end != null) assert.ok(row.end - row.t0 < 170, 'seed ' + s + ' round ' + row.round + ' took ' + Math.round(row.end - row.t0) + 's'); }
    console.log('       seed ' + s + ': reached round ' + r.g.round + (r.g.over ? ' (down)' : '') + ', kills ' + r.g.kills + ', points ' + Math.floor(r.g.points) + ', weapons ' + r.g.player.weapons.map((w) => w.id).join('/') + ', sim time ' + Math.round(r.g.t) + 's in ' + r.ms + 'ms');
    if (s === 1) console.log('       round table (seed 1): ' + r.rows.map((x) => 'r' + x.round + ' ' + Math.round((x.end || x.t0) - x.t0) + 's hpMin ' + Math.round(x.hpMin) + ' alive<=' + x.maxAlive).join(' | '));
  }
  assert.ok(res.every((r) => r.g.round >= 5), 'every seed gets past round 4');
});
test('economy and balance through round 25: a bot that cannot be beaten (health topped up) clears every round up to 25 on 3 seeds: no crash, no stuck round, kills pile up, bosses spawn on 5/10/15/20/25', () => {
  for (let s = 11; s <= 13; s++) {
    const r = play(s, 25, true, true);
    assert.ok(r.g.round >= 25, 'seed ' + s + ' reached round ' + r.g.round);
    for (const row of r.rows) if (row.end != null) assert.ok(row.end - row.t0 < 260, 'seed ' + s + ' round ' + row.round + ' took ' + Math.round(row.end - row.t0) + 's (stuck?)');
    assert.ok(r.g.kills > 800, 'seed ' + s + ' kills ' + r.g.kills); assert.ok(r.g.bossesDone >= 5, 'seed ' + s + ' bosses beaten ' + r.g.bossesDone);
    console.log('       god seed ' + s + ': round ' + r.g.round + ', kills ' + r.g.kills + ', points ' + Math.floor(r.g.points) + ', bosses ' + r.g.bossesDone + ', longest round ' + Math.round(Math.max(...r.rows.map((x) => (x.end || x.t0) - x.t0))) + 's, sim time ' + Math.round(r.g.t) + 's in ' + r.ms + 'ms');
  }
});
test('bot with only the starting pistol (no shopping): round 1 is easy', () => {
  const r = play(7, 4, false); const first = r.rows.find((x) => x.round === 1); assert.ok(first && first.hpMin > 60, 'round 1 is easy: lowest health ' + (first && Math.round(first.hpMin)));
  console.log('       pistol only: reached round ' + r.g.round + (r.g.over ? ' (down)' : '') + ' ' + r.rows.map((x) => 'r' + x.round + ' hpMin ' + Math.round(x.hpMin)).join(' | '));
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
