// Offline checks that the player can never get trapped in a window, its yard, a door, a wall or scenery. Run: node tools-feral/rules-trap-test.js
const assert = require('assert'), path = require('path');
require(path.join(__dirname, '..', 'public', 'feral2', 'js', 'data.js'));
require(path.join(__dirname, '..', 'public', 'feral2', 'js', 'sim.js'));
const D = globalThis.DZF, T16 = D.T, K = D.K;
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
function fresh(seed) { const g = D.createGame({ seed: seed || 1 }); g.state = 'intermission'; g.timer = 9999; g.points = 100000; g.player.x = 50.5 * T16; g.player.y = 36.5 * T16; return g; }
const HEADINGS = Array.from({ length: 16 }, (_, i) => i / 16 * Math.PI * 2);
const tileOf = (g) => g.kindAt(Math.floor(g.player.x / T16), Math.floor(g.player.y / T16));
function walkInvariant(g, ang, mag, frames, label) {
  for (let i = 0; i < frames; i++) {
    g.update(1 / 60, { mx: Math.cos(ang) * mag, my: Math.sin(ang) * mag }); g.events.length = 0;
    assert.ok(!g.playerStuck(), label + ': overlapping something solid at frame ' + i);
    assert.strictEqual(tileOf(g), K.FLOOR, label + ': standing on open floor at frame ' + i);
  }
}

test('windows: from every window of every area, walking into it in 16 directions (straight, diagonal, sliding along it, slow and fast) never overlaps it or traps the player: boarded, half broken or fully broken', () => {
  let walks = 0; const g0 = fresh(); assert.strictEqual(g0.map.barriers.length, 32);
  for (const b0 of g0.map.barriers) for (const planks of [b0.max, 3, 0]) for (const mag of [1, 0.45]) for (const ang of HEADINGS) {
    const g = fresh(); const b = g.map.barriers[b0.id]; b.planks = planks;
    g.player.x = (b.x + b.w / 2) * T16 + b.dir[0] * T16 * 1.3; g.player.y = (b.y + b.h / 2) * T16 + b.dir[1] * T16 * 1.3;
    assert.strictEqual(tileOf(g), K.FLOOR, 'the start spot is floor (window ' + b.id + ')');
    walkInvariant(g, ang, mag, 70, 'window ' + b.id + ' (' + b.side + ' of ' + g.map.rooms[b.room].name + ') planks ' + planks + ' heading ' + ang.toFixed(2));
    let freed = false;       // wherever the walk ended, some direction always leads away (the player is never held fast)
    for (const back of HEADINGS) {
      const gg = D.createGame({ seed: 1 }); gg.map.barriers[b.id].planks = planks; gg.player.x = g.player.x; gg.player.y = g.player.y; const x0 = gg.player.x, y0 = gg.player.y;
      for (let i = 0; i < 40; i++) { gg.update(1 / 60, { mx: Math.cos(back), my: Math.sin(back) }); gg.events.length = 0; }
      if (Math.hypot(gg.player.x - x0, gg.player.y - y0) > 20) { freed = true; break; }
    }
    assert.ok(freed, 'window ' + b.id + ': the player can always walk away again'); walks++;
  }
  assert.ok(walks > 3000, 'tested ' + walks + ' walks');
});

test('windows: leaning on a broken opening is blocked like a wall; repair works from the front (hold USE) and finishes the window without ever trapping the player', () => {
  for (const b0 of fresh().map.barriers) {
    const g = fresh(); const b = g.map.barriers[b0.id]; b.planks = 0;
    g.player.x = (b.x + b.w / 2) * T16 + b.dir[0] * T16 * 1.2; g.player.y = (b.y + b.h / 2) * T16 + b.dir[1] * T16 * 1.2;
    for (let i = 0; i < 60; i++) { g.update(1 / 60, { mx: -b.dir[0], my: -b.dir[1] }); g.events.length = 0; }
    assert.ok(!g.playerStuck()); assert.strictEqual(tileOf(g), K.FLOOR); assert.ok(/Repair/.test(g.prompt ? g.prompt.label : ''), 'the repair prompt shows in front of window ' + b.id);
    for (let i = 0; i < 60 * 4; i++) { g.update(1 / 60, { interactHeld: true, mx: -b.dir[0], my: -b.dir[1] }); g.events.length = 0; assert.ok(!g.playerStuck()); }
    assert.strictEqual(b.planks, b.max, 'fully repaired from the front (window ' + b.id + ')');
  }
});

test('doors: a closed door is a wall for the player from every direction; once bought the player walks through to the other area and around inside the doorway', () => {
  for (const d0 of fresh().map.doors) {
    const g = fresh(); const d = g.map.doors.find((x) => x.id === d0.id); const cx = (d.x + d.w / 2) * T16, cy = (d.y + d.h / 2) * T16;
    const starts = [[cx, d.y * T16 - 1.3 * T16], [cx, (d.y + d.h) * T16 + 1.3 * T16], [d.x * T16 - 1.3 * T16, cy], [(d.x + d.w) * T16 + 1.3 * T16, cy]]
      .filter(([x, y]) => g.kindAt(Math.floor(x / T16), Math.floor(y / T16)) === K.FLOOR && g.map.area[Math.floor(y / T16) * g.map.w + Math.floor(x / T16)] === 0);
    assert.strictEqual(starts.length, 1, 'door ' + d.id + ' has exactly one barn-side approach');
    for (const mag of [1, 0.5]) for (const ang of HEADINGS) { const g2 = fresh(); g2.player.x = starts[0][0]; g2.player.y = starts[0][1]; walkInvariant(g2, ang, mag, 80, 'closed door ' + d.id + ' heading ' + ang.toFixed(2)); }
    const g3 = fresh(); g3.player.x = starts[0][0]; g3.player.y = starts[0][1]; g3.update(1 / 60, {}); g3.update(1 / 60, { interactPressed: true });
    assert.ok(g3.map.doors.find((x) => x.id === d.id).open, 'door ' + d.id + ' opened');
    const vertical = d.w < d.h, dirx = vertical ? 0 : Math.sign(cx - starts[0][0]), diry = vertical ? Math.sign(cy - starts[0][1]) : 0;
    walkInvariant(g3, Math.atan2(diry, dirx), 1, 60 * 3, 'through door ' + d.id);
    assert.strictEqual(g3.map.area[Math.floor(g3.player.y / T16) * g3.map.w + Math.floor(g3.player.x / T16)], d.id, 'door ' + d.id + ': the player arrived in ' + g3.map.rooms[d.id].name);
    for (const ang of HEADINGS) {
      const g4 = fresh(); const dd = g4.map.doors.find((x) => x.id === d.id); dd.open = true; g4.map.rooms[d.id].unlocked = true;
      for (let y = dd.y; y < dd.y + dd.h; y++) for (let x = dd.x; x < dd.x + dd.w; x++) g4.map.tiles[y * g4.map.w + x] = K.FLOOR;
      g4.player.x = cx; g4.player.y = cy; walkInvariant(g4, ang, 1, 80, 'inside open door ' + d.id + ' heading ' + ang.toFixed(2));
    }
  }
});

test('if the player ever overlaps something solid (a window opening or its yard, a wall, a closed door, a crate, a machine) they are put on the nearest open floor straight away', () => {
  const g0 = fresh(); const spots = [];
  for (const b of g0.map.barriers) spots.push([(b.x + b.w / 2) * T16, (b.y + b.h / 2) * T16, 'window ' + b.id]);
  for (const p of g0.map.pockets) spots.push([(p.x + p.w / 2) * T16, (p.y + p.h / 2) * T16, 'yard ' + p.barrier]);
  for (const d of g0.map.doors) spots.push([(d.x + d.w / 2) * T16, (d.y + d.h / 2) * T16, 'door ' + d.id]);
  for (const bl of g0.map.blocks) spots.push([(bl.x + bl.w / 2) * T16, (bl.y + bl.h / 2) * T16, 'block ' + bl.style]);
  for (const m of g0.map.machines) spots.push([(m.x + 1) * T16, (m.y + 0.5) * T16, 'machine ' + m.id]);
  for (const wb of g0.map.wallbuys) spots.push([(wb.x + 0.5) * T16, (wb.y + 0.5) * T16, 'wall ' + wb.weapon]);
  for (const planks of [0, 6]) for (const [x, y, what] of spots) {
    const g = fresh(); g.map.barriers.forEach((b) => { b.planks = planks; }); g.player.x = x; g.player.y = y;
    assert.ok(g.playerStuck(), what + ' is solid for the player'); g.update(1 / 60, {}); g.events.length = 0;
    assert.ok(!g.playerStuck(), what + ': pushed out'); assert.strictEqual(tileOf(g), K.FLOOR, what + ': on open floor');
    assert.ok(Math.hypot(g.player.x - x, g.player.y - y) < 5 * T16, what + ': the NEAREST free spot, not far away');
  }
  // the exact old trap: standing in a broken window opening while the boards are nailed back
  const g = fresh(); const b = g.map.barriers[0]; b.planks = 0; g.player.x = (b.x + b.w / 2) * T16; g.player.y = (b.y + b.h / 2) * T16; b.planks = b.max;
  for (let i = 0; i < 5; i++) g.update(1 / 60, { mx: 1, my: 1 }); assert.ok(!g.playerStuck());
});

test('a player wandering the whole map for four minutes (every door open, windows being broken and repaired around them) never overlaps anything solid', () => {
  const g = fresh(3); for (const d of g.map.doors) { d.open = true; g.map.rooms[d.area].unlocked = true; for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) g.map.tiles[y * g.map.w + x] = K.FLOOR; }
  let ang = 0; for (let i = 0; i < 60 * 240; i++) {
    if (i % 37 === 0) ang += 0.9 + (i % 5) * 0.4; const mag = i % 200 < 20 ? 0.4 : 1;
    if (i % 300 === 0) { const b = g.map.barriers[(i / 300) % 32 | 0]; b.planks = (i / 300) % 3 === 0 ? 0 : 6; }
    g.update(1 / 60, { mx: Math.cos(ang) * mag, my: Math.sin(ang) * mag }); g.events.length = 0; assert.ok(!g.playerStuck(), 'overlap at frame ' + i); g.enemies.length = 0; g.toSpawn = 0; g.timer = 9999;
  }
});

console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
