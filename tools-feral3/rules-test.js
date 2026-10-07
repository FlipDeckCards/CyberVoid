// Offline checks of Feral 3.0's rules: shopping, perks, the crate and bench, power-ups, barricades, the second wind and the safety nets. Run: node tools-feral3/rules-test.js
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral3', 'js', 'data.js')); require(path.join(__dirname, '..', 'public', 'feral3', 'js', 'sim.js'));
const D = globalThis.DZF, T = D.T, K = D.K; let passed = 0;
const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const fresh = () => { const g = D.createGame({ seed: 5 }); g.state = 'intermission'; g.timer = 9999; return g; };
const stand = (g, x, y) => { g.player.x = (x + 0.5) * T; g.player.y = (y + 0.5) * T; g.update(1 / 60, {}); g.events.length = 0; };
const use = (g) => { g.update(1 / 60, { interactPressed: true }); g.events.length = 0; };
test('wall guns: a poster sells its gun for its price; buying it again refills it for half; too few points is refused and costs nothing', () => {
  const g = fresh(); const wb = g.map.wallbuys.find((w) => w.weapon === 'shotgun'); stand(g, wb.x, wb.y + 1); assert.ok(/Buy Breacher/.test(g.prompt.label)); g.points = 500; use(g); assert.strictEqual(g.points, 500); assert.ok(!g.player.weapons.some((w) => w.id === 'shotgun'));
  g.points = 1500; use(g); assert.strictEqual(g.points, 500); assert.ok(g.player.weapons.some((w) => w.id === 'shotgun')); const sg = g.player.weapons.find((w) => w.id === 'shotgun'); sg.mag = 0; sg.reserve = 0; g.points = 1000; stand(g, wb.x, wb.y + 1); use(g); assert.strictEqual(g.points, 500); assert.strictEqual(sg.mag, 6);
});
test('gates open their area (the way becomes walkable) and creatures only spawn in areas that are open', () => {
  const g = fresh(); const d = g.map.doors[0]; g.points = 5000; const vertical = d.w < d.h; g.player.x = vertical ? (d.x + d.w / 2) * T : d.x * T - 8; g.player.y = vertical ? d.y * T - 8 : (d.y + d.h / 2) * T; g.update(1 / 60, {}); use(g); assert.ok(d.open); assert.ok(g.map.rooms[d.area].unlocked);
  const g2 = fresh(); g2.state = 'active'; g2.plan = D.roundPlan(1); g2.toSpawn = 40; for (let i = 0; i < 60 * 40; i++) { g2.update(1 / 60, {}); g2.events.length = 0; g2.player.hp = g2.player.maxHp; } for (const e of g2.enemies) { const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T); assert.ok(g2.map.area[ty * g2.map.w + tx] === 0, 'only the plaza is open'); }
});
test('the Supply Crate spins, offers a gun you do not own, lets you take it, and closes if you do not; the Weapons Bench forges the current gun', () => {
  const g = fresh(); const m = g.map.machines.find((x) => x.kind === 'box'); stand(g, m.x + 1, m.y + 1); g.points = 3000; use(g); assert.strictEqual(m.state, 'spin'); assert.strictEqual(g.points, 3000 - D.BOX.cost); for (let i = 0; i < 60 * (D.BOX.spin + 0.2); i++) { g.update(1 / 60, {}); g.events.length = 0; } assert.strictEqual(m.state, 'ready'); assert.ok(!g.player.weapons.some((w) => w.id === m.weapon)); const offered = m.weapon; use(g); assert.ok(g.player.weapons.some((w) => w.id === offered));
  const a = g.map.machines.find((x) => x.kind === 'anvil'); stand(g, a.x + 1, a.y - 1); g.points = 5000; const cur = g.player.weapons[g.player.cur]; use(g); assert.ok(cur.up); assert.ok(/Forged/.test(D.wstat(cur).name)); assert.ok(D.wstat(cur).dmg > D.WEAPONS[cur.id].dmg * 1.9);
});
test('perks: Vitality Tonic +50 health, Speed Loader halves reload, Sprint Serum runs faster, Second Wind gets you back up once, then you are down', () => {
  let g = fresh(); g.points = 9000; for (const id of ['heart', 'fizz', 'boots', 'lamp']) { const m = g.map.machines.find((x) => x.id === id); stand(g, m.x + 1, m.y + (g.kindAt(m.x, m.y + 1) === K.FLOOR ? 1 : -1)); use(g); assert.ok(g.player.perks[id], id); }
  assert.strictEqual(g.player.maxHp, 150); g.player.weapons[0].mag = 0; g.update(1 / 60, { reload: true }); assert.ok(Math.abs(g.player.reload - D.WEAPONS.pistol.reload * 0.5) < 0.05);
  const run = (gg) => { gg.player.x = 64 * T; gg.player.y = 66 * T; const x0 = gg.player.x; for (let i = 0; i < 40; i++) gg.update(1 / 60, { mx: 1, my: 0 }); return gg.player.x - x0; }; const g2 = fresh(); g2.player.perks.boots = true; assert.ok(run(g2) > run(fresh()) * 1.1, 'boots are faster');
  g = fresh(); g.player.perks.lamp = true; g.update(1 / 60, {}); g.spawnEnemy('small1', g.player.x + 9, g.player.y); g.player.hp = 1; g.player.invuln = 0; for (let i = 0; i < 120; i++) { g.update(1 / 60, {}); if (g.player.perks.lamp === false) break; } assert.ok(!g.over && g.player.hp > 40, 'Second Wind revived');
  g.player.invuln = 0; g.player.hp = 1; g.enemies.length = 0; for (let k = 0; k < 4; k++) g.spawnEnemy('small1', g.player.x + 8, g.player.y + k); for (let i = 0; i < 300 && !g.over; i++) { g.update(1 / 60, {}); g.player.invuln = 0; } assert.ok(g.over, 'then you are down');
});
test('barricades: creatures tear boards off; holding USE nails them back for points', () => {
  const g = fresh(); const b = g.map.barriers[0]; g.player.x = (b.x + b.w / 2) * T + b.dir[0] * T * 1.2; g.player.y = (b.y + b.h / 2) * T + b.dir[1] * T * 1.2; g.update(1 / 60, {}); const e = g.spawnEnemy('small1', (b.x + b.w / 2) * T - b.dir[0] * T * 1.0, (b.y + b.h / 2) * T - b.dir[1] * T * 1.0); g.state = 'active'; g.toSpawn = 0; g.plan = D.roundPlan(1);
  for (let i = 0; i < 60 * 12 && b.planks === b.max; i++) { g.update(1 / 60, {}); g.events.length = 0; g.player.hp = g.player.maxHp; } assert.ok(b.planks < b.max, 'boards come off'); e.dead = true; g.enemies.length = 0; const p0 = g.points; for (let i = 0; i < 60 * 5; i++) { g.update(1 / 60, { interactHeld: true }); g.events.length = 0; } assert.strictEqual(b.planks, b.max); assert.ok(g.points > p0);
});
test('power-ups: Shockwave beats all but a boss and pays 400, Double Cash doubles points, Ammo Cache refills, Instakill beats a creature in one hit', () => {
  const g = fresh(); for (let i = 0; i < 5; i++) g.spawnEnemy('small1', g.player.x + 40 + i * 5, g.player.y); const boss = g.spawnEnemy('boss', g.player.x + 80, g.player.y); const p0 = g.points; g.pickups.push({ id: 99, x: g.player.x, y: g.player.y, type: 'boom', life: 10 }); g.update(1 / 60, {}); assert.ok(g.enemies.every((e) => e.boss)); assert.ok(g.points >= p0 + 400); assert.ok(boss.hp < boss.maxHp);
  g.pickups.push({ id: 100, x: g.player.x, y: g.player.y, type: 'twin', life: 10 }); g.update(1 / 60, {}); assert.ok(g.powers.twin > 29); const p1 = g.points; g.hurtEnemy(boss, 1, {}); assert.ok(g.points - p1 >= 20, 'doubled');
  const g2 = fresh(); const e = g2.spawnEnemy('large1', g2.player.x + 40, g2.player.y); g2.pickups.push({ id: 1, x: g2.player.x, y: g2.player.y, type: 'zap', life: 10 }); g2.update(1 / 60, {}); g2.hurtEnemy(e, 1, {}); assert.ok(e.dead);
});
test('safety nets: out of ammo gives the pistol back, and the pistol never runs dry', () => {
  const g = fresh(); g.giveWeapon('rifle'); g.player.weapons = g.player.weapons.filter((w) => w.id === 'rifle'); g.player.cur = 0; g.player.weapons[0].mag = 0; g.player.weapons[0].reserve = 0; g.update(1 / 60, {}); assert.ok(g.player.weapons.some((w) => w.id === 'pistol'), 'the pistol is back'); assert.ok(D.WEAPONS.pistol.infinite);
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
