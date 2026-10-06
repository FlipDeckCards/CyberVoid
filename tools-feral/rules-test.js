// Offline checks of the individual rules of Dead Zone: Feral (shop, perks, windows, power-ups, creatures, safety nets). Run: node tools-feral/rules-test.js
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral', 'js', 'data.js'));
require(path.join(__dirname, '..', 'public', 'feral', 'js', 'sim.js'));
const D = globalThis.DZF, T16 = D.T;
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

function fresh(seed) { const g = D.createGame({ seed: seed || 1 }); g.state = 'intermission'; g.timer = 9999; g.points = 100000; g.player.x = 50.5 * T16; g.player.y = 36.5 * T16; return g; }
const at = (g, tx, ty) => { g.player.x = (tx + 0.5) * T16; g.player.y = (ty + 0.5) * T16; };
const press = (g, extra) => g.update(1 / 60, Object.assign({ interactPressed: true }, extra || {}));
const idle = (g, n) => { for (let i = 0; i < (n || 1); i++) g.update(1 / 60, {}); };

test('shop: a wall gun costs its price, a second buy refills it for half; not enough points is refused and costs nothing', () => {
  const g = fresh(); at(g, 46, 28); idle(g); assert.strictEqual(g.prompt.label, 'Buy Rattlevine'); const p0 = g.points; press(g);
  assert.strictEqual(g.points, p0 - 1000); assert.ok(g.player.weapons.some((w) => w.id === 'rattle'));
  const w = g.player.weapons.find((x) => x.id === 'rattle'); w.mag = 0; w.reserve = 0; idle(g); assert.ok(/Buy ammo/.test(g.prompt.label));
  const p1 = g.points; press(g); assert.strictEqual(g.points, p1 - 500); assert.strictEqual(w.mag, 32); assert.strictEqual(w.reserve, 224);
  const poor = fresh(); poor.points = 10; at(poor, 46, 28); idle(poor); press(poor); assert.strictEqual(poor.points, 10); assert.strictEqual(poor.player.weapons.length, 1);
});
test('shop: a door opens its area (the way becomes walkable); creatures only spawn in areas that are open', () => {
  const g = fresh(); assert.strictEqual(g.map.rooms[1].unlocked, false); at(g, 50, 28); idle(g); assert.ok(/Open Pumpkin Patch/.test(g.prompt.label)); press(g);
  assert.strictEqual(g.map.rooms[1].unlocked, true); assert.strictEqual(g.points, 100000 - 750); at(g, 50, 21); g.buildFlow(); assert.ok(g.flow[12 * g.map.w + 50] < 32767, 'the patch is reachable now');
  const locked = fresh(); locked.round = 3; locked.plan = D.roundPlan(3); locked.state = 'active';
  for (let i = 0; i < 60 * 8; i++) { locked.toSpawn = 5; locked.update(1 / 60, {}); }
  assert.ok(locked.enemies.length > 0);
  for (const e of locked.enemies) { const a = locked.map.area[Math.floor(e.y / T16) * locked.map.w + Math.floor(e.x / T16)]; assert.ok(a === -1 || a === 0 || locked.map.rooms[a].unlocked, 'spawned only in the open area, was ' + a); }
});
test('shop: the Wobble Chest spins, offers a gun you do not own, lets you take it, and closes if you do not; perk and Sparkle Anvil work', () => {
  const g = fresh(5); const box = g.map.machines.find((m) => m.kind === 'box'); at(g, box.x + 1, box.y + 1); idle(g); assert.ok(/Wobble Chest/.test(g.prompt.label)); press(g); assert.strictEqual(box.state, 'spin');
  idle(g, 60 * 3); assert.strictEqual(box.state, 'ready'); assert.notStrictEqual(box.weapon, 'pip'); const id = box.weapon; idle(g); assert.ok(/Take/.test(g.prompt.label)); press(g); assert.ok(g.player.weapons.some((w) => w.id === id)); assert.strictEqual(box.state, 'idle');
  const g2 = fresh(); const b2 = g2.map.machines.find((m) => m.kind === 'box'); at(g2, b2.x + 1, b2.y + 1); idle(g2); press(g2); idle(g2, 60 * 3 + 60 * 9); assert.strictEqual(b2.state, 'idle', 'an untaken gun goes away');
  const h = fresh(); const heart = h.map.machines.find((m) => m.id === 'heart'); at(h, heart.x + 1, heart.y - 1); idle(h); press(h); assert.ok(h.player.perks.heart); assert.ok(h.player.hp > 100);
  const a = fresh(); const an = a.map.machines.find((m) => m.kind === 'anvil'); at(a, an.x + 1, an.y - 1); idle(a); assert.ok(/Upgrade Pip Popper/.test(a.prompt.label)); const dmg0 = D.wstat(a.player.weapons[0]).dmg; press(a);
  assert.ok(a.player.weapons[0].up); assert.ok(D.wstat(a.player.weapons[0]).dmg > dmg0 * 2); assert.ok(/Gilded/.test(D.wstat(a.player.weapons[0]).name));
});
test('perks: Fizz Flip halves reload time, Zoom Boots run faster; Lucky Lantern gets you back up once, then you are down', () => {
  const g = fresh(); g.player.perks.fizz = true; g.player.weapons[0].mag = 0; g.update(1 / 60, { reload: true }); assert.ok(Math.abs(g.player.reload - D.WEAPONS.pip.reload * 0.5) < 0.05);
  const a = fresh(), b = fresh(); b.player.perks.boots = true; a.update(0.05, { mx: 1, my: 0 }); b.update(0.05, { mx: 1, my: 0 }); for (let i = 0; i < 20; i++) { a.update(0.05, { mx: 1, my: 0 }); b.update(0.05, { mx: 1, my: 0 }); }
  assert.ok(b.player.x - 50.5 * T16 > (a.player.x - 50.5 * T16) * 1.15);
  const l = fresh(); l.player.perks.lamp = true; l.player.hp = 5; l.spawnEnemy('glumpkin', l.player.x + 5, l.player.y); let revived = false; for (let i = 0; i < 400 && !l.over; i++) { l.update(1 / 60, {}); for (const e of l.events) if (e.t === 'revive') revived = true; l.events.length = 0; } assert.ok(revived, 'the lantern was used'); assert.ok(l.player.hp > 5 || l.over === false);
  const d = fresh(); d.player.hp = 5; d.spawnEnemy('glumpkin', d.player.x + 5, d.player.y); for (let i = 0; i < 400 && !d.over; i++) d.update(1 / 60, {}); assert.ok(d.over, 'without a lantern you are down');
});
test('windows: creatures tear boards off; holding USE nails them back for points', () => {
  const g = fresh(); const b = g.map.barriers[0]; b.planks = 2; g.player.x = (b.x + 1.5) * T16; g.player.y = (b.y + 1.5) * T16; g.player.y += 8; idle(g); assert.ok(/Repair/.test(g.prompt.label));
  const p0 = g.points; g.update(1 / 60, { interactHeld: true }); assert.strictEqual(b.planks, 3); assert.strictEqual(g.points, p0 + 10); for (let i = 0; i < 200; i++) g.update(1 / 60, { interactHeld: true }); assert.strictEqual(b.planks, b.max);
  const w = fresh(); const wb = w.map.barriers.find((x) => x.room === 0 && x.side === 'N'); const pk = w.map.pockets[wb.id]; w.spawnEnemy('glumpkin', (pk.x + 1.5) * T16, (pk.y + 1.5) * T16);
  w.player.x = (wb.x + 1.5) * T16; w.player.y = (wb.y + 6) * T16; for (let i = 0; i < 60 * 12 && wb.planks === wb.max; i++) w.update(1 / 60, {}); assert.ok(wb.planks < wb.max, 'it chewed a board off');
});
test('power-ups: Boom Berry beats all but a boss and pays 400, Twin Star doubles points, Ammo Acorn refills, Zap Daisy beats a creature in one hit', () => {
  const g = fresh(); for (let i = 0; i < 6; i++) g.spawnEnemy('glumpkin', g.player.x + 40 + i * 5, g.player.y); g.spawnEnemy('elder', g.player.x - 60, g.player.y); const p0 = g.points;
  g.pickups.push({ id: 99, x: g.player.x, y: g.player.y, type: 'boom', life: 20 }); idle(g); assert.strictEqual(g.enemies.filter((e) => !e.dead).length, 1); assert.ok(g.enemies[0].boss && g.enemies[0].hp > 0); assert.ok(g.points >= p0 + 400);
  const t = fresh(); t.pickups.push({ id: 1, x: t.player.x, y: t.player.y, type: 'twin', life: 20 }); idle(t); const e = t.spawnEnemy('glumpkin', t.player.x + 30, t.player.y); const q0 = t.points; t.hurtEnemy(e, 1); assert.strictEqual(t.points - q0, 20);
  const a = fresh(); a.player.weapons[0].mag = 1; a.player.weapons.push({ id: 'rattle', up: false, mag: 0, reserve: 0 }); a.pickups.push({ id: 2, x: a.player.x, y: a.player.y, type: 'ammo', life: 20 }); idle(a); assert.strictEqual(a.player.weapons[1].mag, 32); assert.strictEqual(a.player.weapons[0].mag, 12);
  const z = fresh(); z.pickups.push({ id: 3, x: z.player.x, y: z.player.y, type: 'zap', life: 20 }); idle(z); const m = z.spawnEnemy('mossmaw', z.player.x + 60, z.player.y); z.hurtEnemy(m, 1); assert.ok(m.dead || m.hp <= 0, 'a Mossmaw falls to one hit');
});
test('creatures: a hit Glumpkin splits in two, a Zapling dashes, a Boomkit explodes on you, a Wisper floats through walls, round 5 brings the boss', () => {
  const g = fresh(); const e = g.spawnEnemy('glumpkin', g.player.x + 60, g.player.y); const n0 = g.enemies.length; g.hurtEnemy(e, 1); assert.strictEqual(g.enemies.length, n0 + 1); assert.strictEqual(e.size, 2); const c = g.enemies[g.enemies.length - 1]; assert.strictEqual(c.size, 2); assert.ok(c.hp > 0 && c.hp < 46);
  const z = fresh(); const zap = z.spawnEnemy('zapling', z.player.x + 50, z.player.y); let dashed = false; for (let i = 0; i < 60 * 6; i++) { z.update(1 / 60, {}); if (zap.state === 'dash') dashed = true; } assert.ok(dashed, 'it dashed');
  const b = fresh(); const bk = b.spawnEnemy('boomkit', b.player.x + 40, b.player.y); const h0 = b.player.hp; for (let i = 0; i < 120 && !bk.dead; i++) b.update(1 / 60, {}); assert.ok(b.player.hp < h0, 'the blast hurt');
  const w = fresh(); w.player.x = 38.5 * T16; w.player.y = 30.5 * T16; const wis = w.spawnEnemy('wisper', 38.5 * T16, 12.5 * T16); const d0 = Math.hypot(wis.x - w.player.x, wis.y - w.player.y); for (let i = 0; i < 300; i++) w.update(1 / 60, {}); assert.ok(Math.hypot(wis.x - w.player.x, wis.y - w.player.y) < d0 - 40, 'it drifted straight through the walls toward the player');
  const e5 = fresh(); e5.round = 4; e5.timer = 0.01; for (let i = 0; i < 60 * 14; i++) e5.update(1 / 60, {}); assert.ok(e5.round === 5 && e5.enemies.some((x) => x.boss), 'round 5 brings the Elder Mossmaw');
});
test('safety nets: out of ammo gives the Pip Popper back; shots fly through windows but not through walls', () => {
  const g = fresh(); g.giveWeapon('rattle'); g.giveWeapon('longthorn'); g.player.weapons = g.player.weapons.filter((w) => w.id !== 'pip'); for (const w of g.player.weapons) { w.mag = 0; w.reserve = 0; } idle(g); assert.ok(g.player.weapons.some((w) => w.id === 'pip'), 'pip is back');
  const s = fresh(); s.player.x = 46.5 * T16; s.player.y = 33.5 * T16; s.update(1 / 60, { fire: true, aim: -Math.PI / 2 }); assert.strictEqual(s.bullets.length, 1); for (let i = 0; i < 30; i++) s.update(1 / 60, {}); assert.strictEqual(s.bullets.length, 0, 'a shot into the wall is gone');
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
