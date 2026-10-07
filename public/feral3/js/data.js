// Feral 3.0 - game data: weapons, creatures, perks, power-ups, the map ("Hollow Reach", an overgrown jungle park) and the round plan. No DOM here, so the rules run in Node for testing.
// (Rules and map-grid code started as a copy of Feral 2.0's; everything below is Feral 3.0's own.)
(function () {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = (G.DZF = G.DZF || {});

  D.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  D.lerp = (a, b, t) => a + (b - a) * t;
  D.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  D.makeRng = function (seed) {                      // mulberry32: the same seed gives the same game (tests); the live game seeds from the clock
    let a = (seed >>> 0) || 1;
    const f = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };

  D.T = 16;                 // tile size in sim pixels; 8 sim pixels = 1 metre in the 3D world (a tile is 2 m)
  D.MAP_W = 112; D.MAP_H = 88;

  // ---------- weapons ----------
  // dmg per pellet/hit, rate = shots per second, mag = magazine, reserve = spare rounds, reload in seconds, spread in degrees (hip / aiming down sights), range in sim px (damage falls off past `fall`),
  // pierce = extra creatures a bullet passes through, kick = recoil (pitch degrees per shot, yaw wander), auto = hold to keep firing
  D.WEAPONS = {
    pistol:  { id: 'pistol',  name: 'Ranger Pistol',    kind: 'bullet', infinite: true, dmg: 30,  rate: 6.0,  mag: 12, reserve: 96,  reload: 1.35, spread: 1.4, ads: 0.35, pellets: 1, pierce: 0, fall: 360, range: 1400, color: '#ffd9a0', cost: 0,    kick: 1.3, wander: 0.35, auto: false, shake: 0.4, head: 2.0 },
    shotgun: { id: 'shotgun', name: 'Breacher Shotgun', kind: 'bullet', dmg: 15, rate: 1.25, mag: 6,  reserve: 42,  reload: 2.6,  spread: 6.5, ads: 4.2,  pellets: 9, pierce: 0, fall: 130, range: 520,  color: '#ffb35c', cost: 1000, kick: 6.5, wander: 1.0,  auto: false, shake: 2.2, head: 1.5 },
    rifle:   { id: 'rifle',   name: 'Vanguard Rifle',   kind: 'bullet', dmg: 26,  rate: 10.0, mag: 30, reserve: 210, reload: 2.1,  spread: 2.4, ads: 0.7,  pellets: 1, pierce: 0, fall: 520, range: 1600, color: '#ffe0a0', cost: 1500, kick: 1.1, wander: 0.55, auto: true,  shake: 0.7, head: 2.0 },
    bolt:    { id: 'bolt',    name: 'Longwatch Rifle',  kind: 'bullet', dmg: 210, rate: 0.95, mag: 5,  reserve: 40,  reload: 2.9,  spread: 3.5, ads: 0.0,  pellets: 1, pierce: 3, fall: 900, range: 2400, color: '#ffffff', cost: 2000, kick: 5.5, wander: 0.4,  auto: false, shake: 2.0, head: 3.0 },
    mg:      { id: 'mg',      name: 'Bulwark MG',       kind: 'bullet', dmg: 21,  rate: 13.0, mag: 100, reserve: 400, reload: 4.6,  spread: 3.4, ads: 1.4,  pellets: 1, pierce: 0, fall: 480, range: 1500, color: '#ffc880', cost: 2500, kick: 0.9, wander: 0.9,  auto: true,  shake: 0.9, head: 1.6 },
  };
  D.WALL_WEAPONS = ['shotgun', 'rifle', 'bolt', 'mg'];
  D.BOX_POOL = ['shotgun', 'rifle', 'bolt', 'mg'];
  D.UPGRADE = { name: 'Weapons Bench', cost: 2500, dmg: 2.0, mag: 1.5, reserve: 1.4, rate: 1.1 };
  D.BOX = { name: 'Supply Crate', cost: 950, spin: 3.0, hold: 8 };

  D.PERKS = {
    heart: { id: 'heart', name: 'Vitality Tonic', cost: 1000, color: '#ff5d5d', desc: '+50 max health' },
    fizz:  { id: 'fizz',  name: 'Speed Loader',   cost: 2000, color: '#5dd6ff', desc: 'Reload much faster' },
    boots: { id: 'boots', name: 'Sprint Serum',   cost: 1500, color: '#ffd24a', desc: 'Run faster' },
    lamp:  { id: 'lamp',  name: 'Second Wind',    cost: 2000, color: '#7dff9a', desc: 'One extra life' },
  };
  D.POWERUPS = {
    ammo:  { id: 'ammo',  name: 'Ammo Cache',   color: '#c8a050', text: 'AMMO CACHE',   dur: 0 },
    twin:  { id: 'twin',  name: 'Double Cash',  color: '#ffd84a', text: 'DOUBLE CASH',  dur: 30 },
    boom:  { id: 'boom',  name: 'Shockwave',    color: '#ff5a3a', text: 'SHOCKWAVE',    dur: 0 },
    zap:   { id: 'zap',   name: 'Instakill',    color: '#9a8cff', text: 'INSTAKILL',    dur: 30 },
  };

  // ---------- creatures (base values at round 1; the round plan scales them). r = body radius in sim px (8 px = 1 m), h = height in metres (for headshots and aiming) ----------
  D.ENEMIES = {
    small1:  { id: 'small1',  name: 'Cinderling',    model: 'small1',  hp: 42,   speed: 31, r: 5.4, h: 1.5, dmg: 10, atk: 0.7, pts: 60,  color: '#8a5cff', zig: true },
    small2:  { id: 'small2',  name: 'Thornback',     model: 'small2',  hp: 58,   speed: 24, r: 5.6, h: 1.6, dmg: 12, atk: 0.8, pts: 70,  color: '#7acc5a', dash: 104 },
    small3:  { id: 'small3',  name: 'Powder Shell',  model: 'small3',  hp: 30,   speed: 38, r: 5.8, h: 1.6, dmg: 36, atk: 0,   pts: 90,  color: '#ff5a3a', boom: 30 },
    medium1: { id: 'medium1', name: 'Ashfang',       model: 'medium1', hp: 140,  speed: 22, r: 6.8, h: 2.1, dmg: 20, atk: 0.9, pts: 100, color: '#c0504a', enrage: true },
    medium2: { id: 'medium2', name: 'Gloomspitter',  model: 'medium2', hp: 110,  speed: 19, r: 6.8, h: 2.3, dmg: 14, atk: 2.0, pts: 120, color: '#5a8cff', ranged: true },
    medium3: { id: 'medium3', name: 'Rustclaw',      model: 'medium3', hp: 120,  speed: 26, r: 6.6, h: 2.2, dmg: 28, atk: 1.0, pts: 130, color: '#ff9a3c', dash: 150, flank: true },
    large1:  { id: 'large1',  name: 'Grimmaw',       model: 'large1',  hp: 620,  speed: 14, r: 10,  h: 3.0, dmg: 40, atk: 1.2, pts: 260, color: '#8a3a4a', heavy: true, stomp: 36 },
    large2:  { id: 'large2',  name: 'Rendermaw',     model: 'large2',  hp: 520,  speed: 16, r: 9,   h: 2.6, dmg: 44, atk: 1.3, pts: 280, color: '#aa4a3a', heavy: true, charge: 190 },
    boss:    { id: 'boss',    name: 'Cinder Hydra',  model: 'boss',    hp: 1900, speed: 13, r: 17,  h: 5.5, dmg: 46, atk: 1.4, pts: 2000, color: '#ff7a2a', heavy: true, boss: true, slam: 44, breath: true },
  };
  D.ENEMY_ORDER = ['small1', 'small2', 'small3', 'medium1', 'medium2', 'medium3', 'large1', 'large2', 'boss'];

  D.roundPlan = function (r) {
    const boss = r % 5 === 0;
    const bossCount = boss ? Math.ceil(r / 10) : 0;
    let count = Math.round(6 + r * 3.0 + (r > 10 ? (r - 10) * 1.6 : 0));
    if (boss) count = Math.round(count * 0.6);
    const hpMult = r <= 9 ? 1 + 0.13 * (r - 1) : (1 + 0.13 * 8) * Math.pow(1.13, r - 9);
    const speedMult = (1 + 0.032 * Math.min(r - 1, 24)) * 0.95;
    const dmgMult = (1 + 0.03 * Math.min(r - 1, 30)) * 0.9;
    const w = { small1: r <= 2 ? 1 : 0.5 };
    if (r >= 2) w.small2 = 0.25;
    if (r >= 3) w.medium1 = 0.2 + Math.min(0.12, r * 0.01);
    if (r >= 4) w.small3 = 0.1 + (r >= 10 ? 0.03 : 0);
    if (r >= 5) w.medium3 = 0.12 + (r >= 12 ? 0.03 : 0);
    if (r >= 6) w.medium2 = 0.12 + (r >= 10 ? 0.03 : 0);
    if (r >= 7) { w.large1 = 0.05 + (r >= 12 ? 0.03 : 0); }
    if (r >= 9) { w.large2 = 0.05 + (r >= 14 ? 0.03 : 0); }
    return { round: r, boss, bossCount, count, hpMult, speedMult, dmgMult,
      interval: Math.max(0.45, 1.5 - 0.045 * r), alive: Math.min(34, 10 + Math.round(r * 1.5)), weights: w };
  };
  D.intermission = 6;

  // ---------- the map: "Hollow Reach" - the plaza in front of an abandoned visitor centre, and three areas that open with doors ----------
  D.K = { WALL: 0, FLOOR: 1, DOOR: 2, BARRIER: 3, POCKET: 4, BLOCK: 5, WATER: 6, MACHINE: 7 };

  D.ROOMS = [
    { id: 0, name: 'Visitor Plaza',       x: 42, y: 40, w: 46, h: 32, floor: 'plaza',    cost: 0 },
    { id: 1, name: 'Jungle Boardwalk',    x: 8,  y: 36, w: 30, h: 40, floor: 'jungle',   cost: 750 },
    { id: 2, name: 'Research Compound',   x: 6,  y: 12, w: 44, h: 20, floor: 'compound', cost: 1500 },
    { id: 3, name: 'Lava Cave',           x: 54, y: 8,  w: 46, h: 26, floor: 'cave',     cost: 2500 },
  ];
  // doors: the 4-tile gap between two rooms (3 tiles wide); each opens one room
  D.DOORS = [
    { id: 1, x: 38, y: 54, w: 4, h: 3 },   // plaza <-> jungle
    { id: 2, x: 20, y: 32, w: 3, h: 4 },   // jungle <-> compound
    { id: 3, x: 50, y: 20, w: 4, h: 3 },   // compound <-> lava cave
  ];
  // boarded barricades in the outer walls: room id, side of the room, tile position along that side (3 wide)
  D.WINDOWS = [
    [0, 'N', 45], [0, 'N', 83], [0, 'S', 48], [0, 'S', 64], [0, 'S', 78], [0, 'W', 44], [0, 'W', 63], [0, 'E', 46], [0, 'E', 62],
    [1, 'N', 10], [1, 'N', 28], [1, 'S', 12], [1, 'S', 26], [1, 'W', 40], [1, 'W', 54], [1, 'W', 66], [1, 'E', 38], [1, 'E', 68],
    [2, 'N', 12], [2, 'N', 28], [2, 'N', 40], [2, 'W', 15], [2, 'W', 24], [2, 'S', 40], [2, 'E', 14], [2, 'E', 26],
    [3, 'N', 60], [3, 'N', 76], [3, 'N', 90], [3, 'E', 14], [3, 'E', 26], [3, 'S', 62],
  ];
  // solid scenery: [x, y, w, h, style]; every style has its own 3D model in the game (world3d)
  D.BLOCKS = [
    [54, 41, 26, 9, 'visitor'], [81, 56, 3, 3, 'tower'], [46, 62, 2, 1, 'jeep'], [58, 66, 2, 1, 'jeep'], [84, 50, 1, 3, 'van'], [50, 55, 2, 2, 'crates'], [74, 64, 2, 2, 'crates'], [45, 46, 1, 1, 'tree'], [47, 67, 1, 1, 'tree'], [70, 68, 1, 1, 'tree'], [86, 62, 1, 1, 'tree'],
    [12, 42, 1, 1, 'tree'], [16, 48, 1, 1, 'tree'], [30, 44, 1, 1, 'tree'], [10, 62, 1, 1, 'tree'], [32, 66, 1, 1, 'tree'], [22, 70, 1, 1, 'tree'], [14, 72, 1, 1, 'tree'], [20, 46, 3, 3, 'rock'], [28, 60, 3, 2, 'rock'], [12, 54, 2, 2, 'rock'], [30, 52, 1, 1, 'tree'], [24, 40, 1, 1, 'tree'], [34, 62, 1, 1, 'tree'], [18, 66, 1, 1, 'tree'], [10, 48, 1, 1, 'tree'],
    [8, 14, 14, 8, 'hangar'], [26, 13, 12, 6, 'lab'], [10, 26, 6, 2, 'container'], [28, 26, 2, 2, 'generator'], [37, 19, 4, 2, 'heli'], [44, 26, 4, 2, 'container'],
    [58, 12, 2, 2, 'stalag'], [62, 28, 3, 2, 'rock'], [90, 12, 2, 2, 'stalag'], [76, 27, 2, 2, 'stalag'], [70, 22, 2, 2, 'stalag'], [96, 18, 2, 3, 'rock'],
  ];
  // liquids (not walkable; shots fly over them): [x, y, w, h, kind]
  D.LIQUIDS = [[62, 58, 8, 5, 'water'], [14, 57, 5, 3, 'water'], [24, 57, 12, 3, 'water'], [64, 14, 10, 6, 'lava'], [84, 20, 8, 7, 'lava']];
  // machines (perks, crate, bench): solid 2x1 things. [kind, id, tile x, tile y]
  D.MACHINES = [
    ['perk', 'heart', 56, 50], ['box', 'box', 66, 50], ['perk', 'boots', 24, 36], ['perk', 'fizz', 30, 31], ['anvil', 'anvil', 10, 31], ['perk', 'lamp', 58, 33],
  ];
  // wall buys: a poster on a solid tile, bought from the floor tile next to it. [weapon, tile x, tile y, floor side: 'S' (floor is below) | 'N']
  D.WALLBUYS = [['shotgun', 72, 49, 'S'], ['rifle', 16, 35, 'S'], ['bolt', 20, 11, 'S'], ['mg', 70, 7, 'S']];
  D.PLAYER_START = [64, 66];
  D.DECOR = {                                       // decoration without collision (drawn by the world builder): [kind, x, y, w, h]
    helipad: [34, 15, 10, 10], boardwalk: [8, 54, 30, 3], stream: [14, 57, 22, 3],
  };

  D.buildMap = function () {
    const W = D.MAP_W, H = D.MAP_H, K = D.K;
    const tiles = new Uint8Array(W * H), area = new Int8Array(W * H).fill(-1), ix = (x, y) => y * W + x;
    const map = { w: W, h: H, tiles, area, rooms: D.ROOMS.map((r) => Object.assign({ unlocked: r.id === 0 }, r)), doors: [], barriers: [], pockets: [], machines: [], wallbuys: [], blocks: [], liquids: D.LIQUIDS.map((l) => ({ x: l[0], y: l[1], w: l[2], h: l[3], kind: l[4] })) };
    for (const r of D.ROOMS) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { tiles[ix(x, y)] = K.FLOOR; area[ix(x, y)] = r.id; }
    for (const d of D.DOORS) {
      const room = D.ROOMS[d.id], door = { id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, open: false, cost: room.cost, area: d.id, name: room.name };
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { tiles[ix(x, y)] = K.DOOR; area[ix(x, y)] = d.id; }
      map.doors.push(door);
    }
    for (const [rid, side, pos] of D.WINDOWS) {
      const r = D.ROOMS[rid]; let bx, by, bw, bh, px, py, pw, ph, dir;
      if (side === 'N') { bx = pos; by = r.y - 1; bw = 3; bh = 1; px = pos; py = r.y - 3; pw = 3; ph = 2; dir = [0, 1]; }
      else if (side === 'S') { bx = pos; by = r.y + r.h; bw = 3; bh = 1; px = pos; py = r.y + r.h + 1; pw = 3; ph = 2; dir = [0, -1]; }
      else if (side === 'W') { bx = r.x - 1; by = pos; bw = 1; bh = 3; px = r.x - 3; py = pos; pw = 2; ph = 3; dir = [1, 0]; }
      else { bx = r.x + r.w; by = pos; bw = 1; bh = 3; px = r.x + r.w + 1; py = pos; pw = 2; ph = 3; dir = [-1, 0]; }
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { tiles[ix(x, y)] = K.BARRIER; area[ix(x, y)] = rid; }
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) { tiles[ix(x, y)] = K.POCKET; area[ix(x, y)] = rid; }
      const planks = 6;
      map.barriers.push({ id: map.barriers.length, room: rid, side, x: bx, y: by, w: bw, h: bh, dir, planks, max: planks, hit: 0 });
      map.pockets.push({ barrier: map.barriers.length - 1, room: rid, x: px, y: py, w: pw, h: ph });
    }
    for (const [x, y, w, h, style] of D.BLOCKS) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) tiles[ix(xx, yy)] = K.BLOCK; map.blocks.push({ x, y, w, h, style }); }
    for (const l of map.liquids) for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) tiles[ix(x, y)] = K.WATER;
    for (const [kind, id, x, y] of D.MACHINES) { tiles[ix(x, y)] = K.MACHINE; tiles[ix(x + 1, y)] = K.MACHINE; map.machines.push({ kind, id, x, y, w: 2, h: 1, state: 'idle', t: 0, weapon: null }); }
    for (const [wid, x, y, side] of D.WALLBUYS) map.wallbuys.push({ weapon: wid, x, y, side });
    return map;
  };

  D.store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode: the game still works */ } },
  };
})();
