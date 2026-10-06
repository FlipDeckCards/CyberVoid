// Dead Zone: Feral - game data: weapons, creatures, perks, power-ups, the map and the round plan. No DOM here, so the simulation can run in Node for testing.
(function () {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = (G.DZF = G.DZF || {});

  // ---------- small helpers ----------
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

  D.T = 16;                 // tile size in world pixels
  D.MAP_W = 100; D.MAP_H = 68;

  // ---------- weapons ----------
  // dmg per pellet/hit, rate = shots per second, mag = magazine, reserve = spare rounds, reload in seconds, spread in degrees, speed in px/s, life in seconds (range = speed * life)
  D.WEAPONS = {
    pip:       { id: 'pip',       name: 'Pip Popper',    kind: 'bullet', infinite: true, dmg: 22, rate: 5.0,  mag: 12, reserve: 96,  reload: 1.1, spread: 2,  pellets: 1,  speed: 360, life: 0.9, pierce: 0, color: '#ffe27a', cost: 0,    shake: 0.5, recoil: 0.5 },
    rattle:    { id: 'rattle',    name: 'Rattlevine',    kind: 'bullet', dmg: 17, rate: 12.0, mag: 32, reserve: 224, reload: 1.5, spread: 6,  pellets: 1,  speed: 380, life: 0.8, pierce: 0, color: '#9dff8a', cost: 1000, shake: 0.4, recoil: 0.3 },
    scatter:   { id: 'scatter',   name: 'Scattergourd',  kind: 'bullet', dmg: 15, rate: 1.4,  mag: 6,  reserve: 48,  reload: 1.9, spread: 17, pellets: 7,  speed: 320, life: 0.34, pierce: 0, color: '#ffb35c', cost: 1500, shake: 2.2, recoil: 2.2 },
    longthorn: { id: 'longthorn', name: 'Longthorn',     kind: 'bullet', dmg: 82, rate: 2.4,  mag: 8,  reserve: 64,  reload: 1.8, spread: 0.6, pellets: 1, speed: 560, life: 0.9, pierce: 2, color: '#ff7ab8', cost: 2000, shake: 1.4, recoil: 1.2 },
    bubble:    { id: 'bubble',    name: 'Bubblurp',      kind: 'bubble', dmg: 44, rate: 1.9,  mag: 8,  reserve: 56,  reload: 1.7, spread: 3,  pellets: 1,  speed: 170, life: 1.5, pierce: 0, color: '#7fe6ff', cost: 2500, shake: 1.0, recoil: 0.8, splash: 30, splashDmg: 30, slow: 0.45 },
    sunbeam:   { id: 'sunbeam',   name: 'Sunbeam Zapper', kind: 'beam',  dmg: 24, rate: 7.0,  mag: 40, reserve: 200, reload: 1.8, spread: 0.8, pellets: 1, speed: 0,   life: 0,   pierce: 99, color: '#fff27a', cost: 0, range: 230, shake: 0.3, recoil: 0.1, box: true },
    party:     { id: 'party',     name: 'Poppa Party',   kind: 'bullet', dmg: 9,  rate: 3.6,  mag: 20, reserve: 140, reload: 1.7, spread: 30, pellets: 12, speed: 280, life: 0.42, pierce: 0, color: '#ff8ae6', cost: 0, shake: 1.3, recoil: 1.0, box: true, confetti: true },
  };
  D.WALL_WEAPONS = ['rattle', 'scatter', 'longthorn', 'bubble'];
  D.BOX_POOL = ['rattle', 'scatter', 'longthorn', 'bubble', 'sunbeam', 'party'];
  D.UPGRADE = { name: 'Sparkle Anvil', cost: 2500, dmg: 2.2, mag: 1.5, reserve: 1.4, rate: 1.1 };
  D.BOX = { name: 'Wobble Chest', cost: 950, spin: 2.6, hold: 8 };

  // ---------- perks ----------
  D.PERKS = {
    heart: { id: 'heart', name: 'Gummy Heart',  cost: 1000, color: '#ff5d8f', desc: '+50 max health' },
    fizz:  { id: 'fizz',  name: 'Fizz Flip',    cost: 2000, color: '#5dd6ff', desc: 'Reload much faster' },
    boots: { id: 'boots', name: 'Zoom Boots',   cost: 1500, color: '#ffd24a', desc: 'Run faster' },
    lamp:  { id: 'lamp',  name: 'Lucky Lantern', cost: 2000, color: '#ffa63d', desc: 'One extra life' },
  };

  // ---------- power-ups ----------
  D.POWERUPS = {
    ammo:  { id: 'ammo',  name: 'Ammo Acorn', color: '#c8884a', text: 'AMMO ACORN',  dur: 0 },
    twin:  { id: 'twin',  name: 'Twin Star',  color: '#ffd84a', text: 'TWIN STAR',   dur: 30 },
    boom:  { id: 'boom',  name: 'Boom Berry', color: '#ff4a6a', text: 'BOOM BERRY',  dur: 0 },
    zap:   { id: 'zap',   name: 'Zap Daisy',  color: '#b78cff', text: 'ZAP DAISY',   dur: 30 },
  };

  // ---------- creatures (base values at round 1; the round plan scales them) ----------
  D.ENEMIES = {
    glumpkin: { id: 'glumpkin', name: 'Glumpkin', hp: 46, speed: 21, r: 6.5, dmg: 12, atk: 0.9, pts: 60, color: '#ff9a3c', split: 2 },
    zapling:  { id: 'zapling',  name: 'Zapling',  hp: 30, speed: 25, r: 4.6, dmg: 10, atk: 0.8, pts: 70, color: '#8cff6a', dash: 112 },
    wisper:   { id: 'wisper',   name: 'Wisper',   hp: 24, speed: 31, r: 5.2, dmg: 8,  atk: 0.9, pts: 80, color: '#b6c8ff', ghost: true },
    mossmaw:  { id: 'mossmaw',  name: 'Mossmaw',  hp: 360, speed: 15, r: 11, dmg: 30, atk: 1.2, pts: 220, color: '#6e8f5a', heavy: true },
    boomkit:  { id: 'boomkit',  name: 'Boomkit',  hp: 20, speed: 46, r: 4.6, dmg: 34, atk: 0, pts: 90, color: '#ff6a8a', boom: 28 },
    spitbud:  { id: 'spitbud',  name: 'Spitbud',  hp: 38, speed: 18, r: 5.4, dmg: 12, atk: 2.1, pts: 100, color: '#ff6ad8', ranged: true },
    elder:    { id: 'elder',    name: 'Elder Mossmaw', hp: 1200, speed: 14, r: 17, dmg: 28, atk: 1.4, pts: 1500, color: '#8fb86e', heavy: true, boss: true, slam: 40 },
  };

  // ---------- the round plan ----------
  D.roundPlan = function (r) {
    const boss = r % 5 === 0;
    const bossCount = boss ? Math.ceil(r / 10) : 0;
    let count = Math.round(5 + r * 2.9 + (r > 10 ? (r - 10) * 1.6 : 0));
    if (boss) count = Math.round(count * 0.6);
    const hpMult = r <= 9 ? 1 + 0.13 * (r - 1) : (1 + 0.13 * 8) * Math.pow(1.13, r - 9);
    const speedMult = 1 + 0.034 * Math.min(r - 1, 24);
    const dmgMult = 1 + 0.03 * Math.min(r - 1, 30);
    const w = { glumpkin: r <= 2 ? 1 : 0.55 };
    if (r >= 3) w.zapling = 0.22 + Math.min(0.12, r * 0.01);
    if (r >= 4) w.wisper = 0.12 + (r >= 10 ? 0.03 : 0);
    if (r >= 6) { w.boomkit = 0.1 + (r >= 10 ? 0.03 : 0); w.mossmaw = 0.05 + (r >= 12 ? 0.03 : 0); }
    if (r >= 8) w.spitbud = 0.12 + (r >= 10 ? 0.03 : 0);
    return { round: r, boss, bossCount, count, hpMult, speedMult, dmgMult,
      interval: Math.max(0.45, 1.5 - 0.045 * r), alive: Math.min(34, 10 + Math.round(r * 1.5)), weights: w };
  };
  D.intermission = 6;           // seconds between rounds

  // ---------- the map: "Mossy Hollow" - a barn yard in the middle and four areas that open with doors ----------
  // tile kinds
  D.K = { WALL: 0, FLOOR: 1, DOOR: 2, BARRIER: 3, POCKET: 4, BLOCK: 5, WATER: 6, MACHINE: 7 };

  D.ROOMS = [
    { id: 0, name: 'Barn Yard',    x: 36, y: 28, w: 28, h: 16, floor: 'barn',  cost: 0 },
    { id: 1, name: 'Pumpkin Patch', x: 36, y: 8,  w: 28, h: 16, floor: 'patch', cost: 750 },
    { id: 2, name: 'Old Mill',     x: 68, y: 30, w: 22, h: 12, floor: 'mill',  cost: 1250 },
    { id: 3, name: 'Crypt Garden', x: 36, y: 48, w: 28, h: 16, floor: 'crypt', cost: 1750 },
    { id: 4, name: 'Lantern Pond', x: 10, y: 30, w: 22, h: 12, floor: 'pond',  cost: 2250 },
  ];
  // the doors (3 tiles wide, 4 deep): each opens one area
  D.DOORS = [
    { id: 1, x: 49, y: 24, w: 3, h: 4 }, { id: 2, x: 64, y: 35, w: 4, h: 3 }, { id: 3, x: 49, y: 44, w: 3, h: 4 }, { id: 4, x: 32, y: 35, w: 4, h: 3 },
  ];
  // windows: room id, the side of the room they are on, and where along that side (tile coordinate of the first of 3 tiles)
  D.WINDOWS = [
    [0, 'N', 40], [0, 'N', 57], [0, 'S', 40], [0, 'S', 57], [0, 'W', 31], [0, 'E', 38],
    [1, 'N', 40], [1, 'N', 49], [1, 'N', 58], [1, 'W', 10], [1, 'W', 18], [1, 'E', 10], [1, 'E', 18],
    [3, 'S', 40], [3, 'S', 49], [3, 'S', 58], [3, 'W', 50], [3, 'W', 58], [3, 'E', 50], [3, 'E', 58],
    [2, 'N', 70], [2, 'N', 84], [2, 'S', 70], [2, 'S', 84], [2, 'E', 31], [2, 'E', 38],
    [4, 'N', 13], [4, 'N', 25], [4, 'S', 13], [4, 'S', 25], [4, 'W', 31], [4, 'W', 38],
  ];
  // solid scenery: [x, y, w, h, style]
  D.BLOCKS = [
    [43, 32, 2, 2, 'crate'], [55, 38, 2, 2, 'crate'], [40, 40, 2, 1, 'barrel'], [60, 33, 1, 2, 'barrel'], [47, 36, 1, 1, 'barrel'],
    [41, 12, 2, 2, 'hay'], [58, 12, 2, 2, 'hay'], [48, 17, 4, 2, 'pumpkins'], [41, 20, 2, 1, 'pumpkins'], [59, 20, 2, 1, 'pumpkins'],
    [74, 34, 2, 2, 'crate'], [81, 36, 2, 2, 'barrel'], [73, 38, 2, 1, 'crate'], [84, 32, 1, 2, 'barrel'],
    [41, 54, 1, 2, 'grave'], [46, 58, 1, 2, 'grave'], [57, 53, 1, 2, 'grave'], [52, 59, 1, 2, 'grave'], [61, 58, 1, 2, 'grave'], [43, 50, 1, 1, 'grave'], [53, 52, 1, 1, 'grave'],
    [14, 34, 1, 1, 'barrel'], [27, 38, 2, 1, 'crate'], [20, 40, 1, 1, 'barrel'],
  ];
  D.POND = [16, 34, 7, 4];            // water (not walkable; wispers float over it)
  // machines (perks, chest, anvil): solid 2x1 things standing against a wall. [kind, id, tile x, tile y]
  D.MACHINES = [
    ['perk', 'heart', 54, 43], ['box', 'box', 61, 29], ['perk', 'fizz', 62, 9], ['perk', 'boots', 78, 41], ['perk', 'lamp', 38, 49], ['anvil', 'anvil', 28, 41],
  ];
  // wall buys: a poster on a wall tile, bought from the floor tile next to it. [weapon, wall tile x, wall tile y, floor side: 'S' (floor is below) | 'N' | 'E' | 'W']
  D.WALLBUYS = [
    ['rattle', 45, 27, 'S'], ['scatter', 45, 7, 'S'], ['longthorn', 78, 29, 'S'], ['bubble', 45, 64, 'N'],
  ];
  D.PLAYER_START = [50, 36];

  // Builds the tile map. Returns a plain object the simulation and the renderer both use.
  D.buildMap = function () {
    const W = D.MAP_W, H = D.MAP_H, K = D.K;
    const tiles = new Uint8Array(W * H);             // all wall
    const area = new Int8Array(W * H).fill(-1);      // which area a tile belongs to
    const ix = (x, y) => y * W + x;
    const map = { w: W, h: H, tiles, area, rooms: D.ROOMS.map((r) => Object.assign({ unlocked: r.id === 0 }, r)), doors: [], barriers: [], pockets: [], machines: [], wallbuys: [], blocks: [], pond: D.POND };
    for (const r of D.ROOMS) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { tiles[ix(x, y)] = K.FLOOR; area[ix(x, y)] = r.id; }
    for (const d of D.DOORS) {
      const room = D.ROOMS[d.id];
      const door = { id: d.id, x: d.x, y: d.y, w: d.w, h: d.h, open: false, cost: room.cost, area: d.id, name: room.name };
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { tiles[ix(x, y)] = K.DOOR; area[ix(x, y)] = d.id; }
      map.doors.push(door);
    }
    // windows: a barrier row/column next to the room and a 2-deep pocket behind it where the creatures come from
    for (const [rid, side, pos] of D.WINDOWS) {
      const r = D.ROOMS[rid];
      let bx, by, bw, bh, px, py, pw, ph, dir;
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
    const [wx, wy, ww, wh] = D.POND; for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) tiles[ix(x, y)] = K.WATER;
    for (const [kind, id, x, y] of D.MACHINES) { tiles[ix(x, y)] = K.MACHINE; tiles[ix(x + 1, y)] = K.MACHINE; map.machines.push({ kind, id, x, y, w: 2, h: 1, state: 'idle', t: 0, weapon: null }); }
    for (const [wid, x, y, side] of D.WALLBUYS) map.wallbuys.push({ weapon: wid, x, y, side });
    return map;
  };

  // ---------- local settings and best score (localStorage, always guarded) ----------
  D.store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode: the game still works */ } },
  };
  D.DEFAULT_SETTINGS = { master: 0.8, music: 0.5, sfx: 0.9, muted: false, aimAssist: true, autoFire: true, shake: true, numbers: true, leftHand: false };
})();
