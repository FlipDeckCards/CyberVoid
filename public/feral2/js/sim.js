// Feral 2.0 - the simulation (a copy of Dead Zone: Feral's rules, adapted for first person: the player turns (aim = yaw), sprints, and shots ignore height like classic Doom).
// Dead Zone: Feral - the simulation. Pure game rules (no DOM, no audio, no drawing): it takes an input object each step and fills g.events, which the
// renderer, sound and HUD read. Because it is pure, the same code is played by a bot in Node to check balance and look for softlocks.
(function () {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = (G.DZF = G.DZF || {});
  const K = D.K, T = D.T, clamp = D.clamp;
  const EV_CAP = 400;

  D.wstat = function (w) {                         // a weapon's numbers, with the Sparkle Anvil upgrade applied
    const b = D.WEAPONS[w.id], u = w.up ? D.UPGRADE : null;
    return { id: b.id, infinite: !!b.infinite, name: (u ? 'Gilded ' : '') + b.name, kind: b.kind, dmg: b.dmg * (u ? u.dmg : 1), rate: b.rate * (u ? u.rate : 1), mag: Math.round(b.mag * (u ? u.mag : 1)),
      reserve: Math.round(b.reserve * (u ? u.reserve : 1)), reload: b.reload, spread: b.spread, pellets: b.pellets, speed: b.speed, life: b.life, pierce: b.pierce + (u ? 1 : 0),
      color: u ? '#ffd84a' : b.color, shake: b.shake, recoil: b.recoil, range: b.range, splash: b.splash, splashDmg: b.splashDmg ? b.splashDmg * (u ? u.dmg : 1) : 0, slow: b.slow, confetti: b.confetti };
  };
  const newWeapon = (id) => { const w = { id, up: false, mag: 0, reserve: 0 }; const s = D.wstat(w); w.mag = s.mag; w.reserve = s.reserve; return w; };

  D.createGame = function (opts) {
    opts = opts || {};
    const rng = D.makeRng(opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed);
    const map = D.buildMap();
    const W = map.w, H = map.h, tiles = map.tiles;
    const bAt = new Int16Array(W * H).fill(-1);               // tile -> barrier id
    map.barriers.forEach((b) => { for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) bAt[y * W + x] = b.id; });
    const doorAt = new Int8Array(W * H).fill(-1);
    map.doors.forEach((d, i) => { for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) doorAt[y * W + x] = i; });

    const g = {
      rng, map, t: 0, round: 0, state: 'intermission', timer: 3.5, over: false, points: 500, kills: 0, shots: 0, hits: 0,
      player: null, enemies: [], bullets: [], spores: [], pickups: [], events: [], nextId: 1,
      toSpawn: 0, spawnTimer: 0, plan: null, bossQueue: 0, dropsThisRound: 0, roundTime: 0, sinceKill: 0, flowTimer: 0, flow: new Int16Array(W * H), flowBig: new Int16Array(W * H), flowTile: -1,
      powers: { twin: 0, zap: 0 }, prompt: null, message: null, beams: [], hash: new Map(), stats: { maxAlive: 0 },
    };
    const P = g.player = {
      x: (D.PLAYER_START[0] + 0.5) * T, y: (D.PLAYER_START[1] + 0.5) * T, r: 5, hp: 100, maxHp: 100, speed: 58, aim: 0, weapons: [newWeapon('pip')], cur: 0,
      reload: 0, cool: 0, lastHurt: -99, invuln: 0, perks: { heart: false, fizz: false, boots: false, lamp: false }, moving: false, face: 1, recoil: 0, repairCool: 0, bob: 0, sprint: 0,
    };
    const emit = (e) => { if (g.events.length < EV_CAP) g.events.push(e); };
    g.emit = emit;

    // ---------- tiles ----------
    const kindAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? K.WALL : tiles[ty * W + tx]);
    const barrierSolid = (tx, ty) => { const b = bAt[ty * W + tx]; return b >= 0 && map.barriers[b].planks > 0; };
    function solid(tx, ty) {                                   // blocks walking (player and ground creatures)
      const k = kindAt(tx, ty);
      if (k === K.FLOOR || k === K.POCKET) return false;
      if (k === K.BARRIER) return barrierSolid(tx, ty);
      return true;                                              // wall, closed door, scenery, water, machines
    }
    function bulletSolid(tx, ty) { const k = kindAt(tx, ty); return k === K.WALL || k === K.DOOR || k === K.BLOCK || k === K.MACHINE; }   // shots fly over water and through windows
    // The player may only ever stand on open floor: every wall, window opening (boarded or broken), window yard, closed door, crate and machine is solid for the player.
    // (Creatures use solid(): they do walk through a window once its boards are gone.)
    function solidPlayer(tx, ty) { return kindAt(tx, ty) !== K.FLOOR; }
    function blocked(x, y, r, fn) {
      fn = fn || solid;
      const x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T), y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!fn(tx, ty)) continue;
        const cx = clamp(x, tx * T, tx * T + T), cy = clamp(y, ty * T, ty * T + T);
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
      }
      return false;
    }
    function move(e, dx, dy, ghost) {
      if (ghost) { e.x = clamp(e.x + dx, 8, W * T - 8); e.y = clamp(e.y + dy, 8, H * T - 8); return; }
      const fn = e === P ? solidPlayer : solid;
      if (dx && !blocked(e.x + dx, e.y, e.r, fn)) e.x += dx;
      if (dy && !blocked(e.x, e.y + dy, e.r, fn)) e.y += dy;       // each axis on its own, so the player slides along a wall instead of sticking to it
    }
    // If the player ever overlaps something solid (a board nailed back while standing in the opening, a teleport, anything), put them on the nearest free spot.
    function unstick() {
      if (!blocked(P.x, P.y, P.r, solidPlayer)) return false;
      for (let rad = 1; rad <= 96; rad += 1) for (let i = 0; i < 32; i++) {
        const a = i / 32 * Math.PI * 2, x = P.x + Math.cos(a) * rad, y = P.y + Math.sin(a) * rad;
        if (x > 8 && y > 8 && x < W * T - 8 && y < H * T - 8 && !blocked(x, y, P.r, solidPlayer)) { P.x = x; P.y = y; g.events.length < EV_CAP && emit({ t: 'unstick' }); return true; }
      }
      return false;
    }
    g.unstick = unstick; g.playerStuck = () => blocked(P.x, P.y, P.r, solidPlayer);
    function lineClear(x0, y0, x1, y1, fn) {                    // is the straight line free of tiles where fn(tx,ty) is true?
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 5));
      for (let i = 1; i < n; i++) { const t = i / n; if (fn(Math.floor((x0 + (x1 - x0) * t) / T), Math.floor((y0 + (y1 - y0) * t) / T))) return false; }
      return true;
    }
    g.solid = solid; g.kindAt = kindAt; g.lineClear = lineClear;

    // ---------- the path field: every walkable tile knows how far it is from the player ----------
    const walk = (k) => k === K.FLOOR || k === K.POCKET || k === K.BARRIER;
    const queue = new Int32Array(W * H);
    const clear3 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = kindAt(x + dx, y + dy); if (k !== K.FLOOR && k !== K.BARRIER) return false; } return true; };    // room for a big creature: no wall within a tile
    const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    function buildFlow() {
      const f = g.flow; f.fill(32767);
      let tx = Math.floor(P.x / T), ty = Math.floor(P.y / T);
      if (!walk(kindAt(tx, ty))) { outer: for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(kindAt(tx + dx, ty + dy))) { tx += dx; ty += dy; break outer; } }
      let qh = 0, qt = 0; const s = ty * W + tx; f[s] = 0; queue[qt++] = s; g.flowTile = s;
      while (qh < qt) {
        const c = queue[qh++], cx = c % W, cy = (c / W) | 0, cd = f[c];
        for (let i = 0; i < 8; i++) {
          const nx = cx + N8[i][0], ny = cy + N8[i][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx; if (f[n] !== 32767 || !walk(tiles[n])) continue;
          if (i >= 4 && (!walk(tiles[cy * W + nx]) || !walk(tiles[ny * W + cx]))) continue;      // no cutting corners
          f[n] = cd + 1; queue[qt++] = n;
        }
      }
      // the same field for big creatures: they only use tiles with a free tile all around them (so they are never led into a gap they cannot fit through)
      const fb = g.flowBig; fb.fill(32767); qh = 0; qt = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = tx + dx, ny = ty + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && walk(tiles[ny * W + nx])) { fb[ny * W + nx] = 0; queue[qt++] = ny * W + nx; } }
      while (qh < qt) {
        const c = queue[qh++], cx = c % W, cy = (c / W) | 0, cd = fb[c];
        for (let i = 0; i < 8; i++) {
          const nx = cx + N8[i][0], ny = cy + N8[i][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx; if (fb[n] !== 32767 || tiles[n] !== K.FLOOR || !clear3(nx, ny)) continue;
          if (i >= 4 && (!clear3(cx, ny) || !clear3(nx, cy))) continue;
          fb[n] = cd + 1; queue[qt++] = n;
        }
      }
    }
    g.buildFlow = buildFlow;

    // ---------- helpers ----------
    const mult = () => (g.powers.twin > 0 ? 2 : 1);
    const award = (n) => { g.points += n * mult(); };
    function maxHp() { return 100 + (P.perks.heart ? 50 : 0); }
    function curW() { return P.weapons[P.cur]; }
    function giveWeapon(id) {
      const have = P.weapons.findIndex((w) => w.id === id);
      if (have >= 0) { const s = D.wstat(P.weapons[have]); P.weapons[have].mag = s.mag; P.weapons[have].reserve = s.reserve; P.cur = have; return; }
      const w = newWeapon(id);
      if (P.weapons.length < 3) { P.weapons.push(w); P.cur = P.weapons.length - 1; } else P.weapons[P.cur] = w;
      P.reload = 0;
    }
    g.giveWeapon = giveWeapon;
    function say(text) { g.message = { text, t: g.t }; }

    // ---------- creatures ----------
    function spawnEnemy(type, x, y, opt) {
      const def = D.ENEMIES[type], p = g.plan || D.roundPlan(1);
      opt = opt || {};
      const size = opt.size || (type === 'glumpkin' ? 3 : 1);
      const sizeK = type === 'glumpkin' ? [0, 0.34, 0.6, 1][size] : 1;
      const e = {
        id: g.nextId++, type, def, x, y, vx: 0, vy: 0, size, r: def.r * (type === 'glumpkin' ? [0, 0.55, 0.75, 1][size] : 1), hp: 0, maxHp: 0, flash: 0, face: 1, anim: rng() * 6,
        speed: def.speed * p.speedMult * (0.88 + rng() * 0.24) * (type === 'glumpkin' ? [0, 1.45, 1.2, 1][size] : 1), dmg: def.dmg * p.dmgMult, atkCd: 0.4 + rng() * 0.4, dead: false, state: 'walk', st: 0, slowT: 0, slow: 1,
        los: false, losT: rng() * 0.3, stuck: 0, lx: x, ly: y, barrier: -1, splitCd: opt.splitCd || 0, ghost: !!def.ghost, born: g.t, dash: 1 + rng() * 1.5, boss: !!def.boss, kx: 0, ky: 0, mist: 0,
      };
      const base = def.hp * p.hpMult * (def.boss ? 1 + 0.35 * (g.bossesDone || 0) : 1);
      e.maxHp = opt.hp != null ? Math.max(opt.hp, 1) : base * (type === 'glumpkin' ? sizeK : 1);
      e.hp = e.maxHp;
      if (opt.hp != null) e.maxHp = Math.max(e.hp, e.maxHp);
      g.enemies.push(e);
      return e;
    }
    function dropPowerup(x, y, force) {
      if (!force) { if (g.dropsThisRound >= 4 || rng() > 0.028) return; }
      g.dropsThisRound++;
      const types = ['ammo', 'twin', 'boom', 'zap'];
      g.pickups.push({ id: g.nextId++, x, y, type: rng.pick(types), life: 28, born: g.t });
      emit({ t: 'drop', x, y });
    }
    function killEnemy(e, cause) {
      if (e.dead) return;
      e.dead = true; g.kills++;
      const sz = e.type === 'glumpkin' ? [0, 0.5, 0.75, 1][e.size] : 1;
      award(Math.round(e.def.pts * sz));
      emit({ t: 'kill', x: e.x, y: e.y, type: e.type, color: e.def.color, size: e.size, boss: e.boss, r: e.r, cause, id: e.id, heading: e.heading });
      if (e.boss) { g.bossesDone = (g.bossesDone || 0) + 1; dropPowerup(e.x, e.y, true); emit({ t: 'bossDown' }); }
      else dropPowerup(e.x, e.y, false);
      g.sinceKill = 0;
    }
    function hurtEnemy(e, dmg, o) {
      if (e.dead) return false;
      o = o || {};
      if (g.powers.zap > 0) dmg = e.boss ? e.maxHp * 0.1 : 99999;
      e.hp -= dmg; e.flash = 0.09; e.hitT = 0.28;
      if (o.pts !== false) award(o.pts || 10);
      g.hits++;
      emit({ t: 'hit', x: e.x, y: e.y, dmg: Math.min(Math.round(dmg), 9999), kill: e.hp <= 0, type: e.type, color: e.def.color, ang: o.ang || 0, w: o.w });
      if (o.slow) { e.slowT = 2.2; e.slow = o.slow; }
      if (!e.def.heavy && o.kb) { e.kx += Math.cos(o.ang || 0) * o.kb; e.ky += Math.sin(o.ang || 0) * o.kb; }
      if (e.hp <= 0) { killEnemy(e, o.w); return true; }
      if (e.type === 'glumpkin' && e.size > 1 && e.splitCd <= 0) {          // a Glumpkin that is hit but not beaten splits into two smaller ones
        const half = Math.max(e.hp / 2, 3), a = rng() * 6.28;
        e.size -= 1; e.r = e.def.r * [0, 0.55, 0.75, 1][e.size]; e.hp = half; e.maxHp = Math.max(half, e.maxHp * 0.55); e.splitCd = 0.28;
        e.speed *= 1.18;
        const c = spawnEnemy('glumpkin', e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4, { size: e.size, hp: half, splitCd: 0.28 });
        c.maxHp = e.maxHp; c.speed = e.speed; c.state = e.state;
        emit({ t: 'split', x: e.x, y: e.y });
      }
      return false;
    }
    g.hurtEnemy = hurtEnemy;
    g.spawnEnemy = spawnEnemy;      // (used by tests)
    function hurtPlayer(dmg, from, sx, sy) {
      if (P.invuln > 0 || g.over) return;
      P.hp -= dmg; P.lastHurt = g.t; P.invuln = 0.3;
      emit({ t: 'hurt', dmg, x: P.x, y: P.y, from, sx, sy });
      if (P.hp <= 0) {
        if (P.perks.lamp) {                                      // Lucky Lantern: get up again
          P.perks.lamp = false; P.hp = maxHp() * 0.6; P.invuln = 3;
          for (const e of g.enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < 70 && !e.boss) { const a = Math.atan2(e.y - P.y, e.x - P.x); e.kx += Math.cos(a) * 160; e.ky += Math.sin(a) * 160; e.st = 0; } }
          emit({ t: 'revive', x: P.x, y: P.y }); say('Lucky Lantern! Back on your feet.');
        } else { P.hp = 0; g.over = true; emit({ t: 'gameover' }); }
      }
    }
    function explode(x, y, r, dmgPlayer, dmgEnemies, byEnemy) {
      emit({ t: 'boom', x, y, r });
      if (Math.hypot(P.x - x, P.y - y) < r + P.r) hurtPlayer(dmgPlayer, 'boom', x, y);
      if (dmgEnemies) for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r + e.r) hurtEnemy(e, dmgEnemies, { pts: 4, ang: Math.atan2(e.y - y, e.x - x), kb: 90 });
      void byEnemy;
    }

    // ---------- rounds ----------
    function startRound(r) {
      g.round = r; g.plan = D.roundPlan(r); g.state = 'active'; g.roundTime = 0; g.sinceKill = 0; g.dropsThisRound = 0;
      g.toSpawn = g.plan.count + g.plan.bossCount; g.bossQueue = g.plan.bossCount; g.spawnTimer = 1.0;
      emit({ t: 'round', round: r, boss: g.plan.boss });
    }
    function pickPocket() {
      let total = 0; const c = [];
      for (const p of map.pockets) {
        if (!map.rooms[p.room].unlocked) continue;
        const px = (p.x + p.w / 2) * T, py = (p.y + p.h / 2) * T, d = Math.hypot(px - P.x, py - P.y);
        if (d < 80) continue;
        const w = 1 / (1 + Math.pow(d / 170, 2)); total += w; c.push([p, w, px, py]);
      }
      if (!c.length) return null;
      let r = rng() * total; for (const q of c) { r -= q[1]; if (r <= 0) return q[0]; }
      return c[c.length - 1][0];
    }
    function spawnOne() {
      const plan = g.plan;
      const openSpawn = (type) => {                       // big creatures do not fit through a window pocket: they rise out of the ground somewhere in the open
        const rs = map.rooms.filter((r) => r.unlocked), rad = D.ENEMIES[type].r;
        for (let tries = 0; tries < 120; tries++) {
          const r = rng.pick(rs), x = (r.x + 3 + rng() * (r.w - 6)) * T, y = (r.y + 3 + rng() * (r.h - 6)) * T, d = Math.hypot(x - P.x, y - P.y);
          if (d < 120 || d > 400 || blocked(x, y, rad + 4) || !clear3(Math.floor(x / T), Math.floor(y / T))) continue;
          spawnEnemy(type, x, y); emit({ t: type === 'elder' ? 'bossSpawn' : 'bigSpawn', x, y }); return true;
        }
        return false;
      };
      if (g.bossQueue > 0 && g.toSpawn <= g.bossQueue + Math.floor(plan.count / 2)) { if (openSpawn('elder')) { g.bossQueue--; return true; } return false; }
      let type = 'glumpkin';
      {
        let tot = 0; for (const k in plan.weights) tot += plan.weights[k];
        let r = rng() * tot; for (const k in plan.weights) { r -= plan.weights[k]; if (r <= 0) { type = k; break; } }
        if (type === 'mossmaw' && g.enemies.filter((e) => e.type === 'mossmaw').length >= 1 + Math.floor(plan.round / 8)) type = 'glumpkin';
      }
      if (D.ENEMIES[type].r > 7) return openSpawn(type);
      const p = pickPocket(); if (!p) return false;
      const x = (p.x + 0.5 + rng() * (p.w - 1)) * T, y = (p.y + 0.5 + rng() * (p.h - 1)) * T;
      spawnEnemy(type, x, y);
      return true;
    }

    // ---------- shooting ----------
    function fire() {
      const w = curW(), s = D.wstat(w);
      if (P.reload > 0 || P.cool > 0) return;
      if (w.mag <= 0) { if (w.reserve > 0 || s.infinite) startReload(); else if (P.cool <= 0) { emit({ t: 'empty' }); P.cool = 0.3; } return; }
      w.mag--; g.shots++; P.cool = 1 / s.rate; P.recoil = s.recoil;
      const dir = P.aim, ox = P.x + Math.cos(dir) * 9, oy = P.y + Math.sin(dir) * 9 - 1;
      emit({ t: 'shot', w: s.id, x: ox, y: oy, ang: dir, shake: s.shake });
      if (s.kind === 'beam') {
        const a = dir + (rng() - 0.5) * s.spread * Math.PI / 180;
        let len = s.range; const cs = Math.cos(a), sn = Math.sin(a);
        for (let d = 6; d < s.range; d += 4) { if (bulletSolid(Math.floor((P.x + cs * d) / T), Math.floor((P.y + sn * d) / T))) { len = d; break; } }
        const x1 = P.x + cs * len, y1 = P.y + sn * len;
        for (const e of g.enemies) {
          if (e.dead) continue;
          const px = e.x - P.x, py = e.y - P.y, along = px * cs + py * sn;
          if (along < 0 || along > len + e.r) continue;
          if (Math.abs(-px * sn + py * cs) <= e.r + 3.5) hurtEnemy(e, s.dmg, { pts: 3, ang: a, w: s.id });
        }
        g.beams.push({ x0: ox, y0: oy, x1, y1, t: 0.09, color: s.color });
      } else {
        for (let i = 0; i < s.pellets; i++) {
          const a = dir + (rng() - 0.5) * s.spread * Math.PI / 180;
          const sp = s.speed * (s.pellets > 1 ? 0.88 + rng() * 0.24 : 1);
          g.bullets.push({ x: ox, y: oy, px: ox, py: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: s.dmg, life: s.life, pierce: s.pierce, hit: null, kind: s.kind, w: s.id, color: s.color,
            splash: s.splash, splashDmg: s.splashDmg, slow: s.slow, pts: s.pellets > 1 ? 4 : 10, ang: a, born: g.t, confetti: s.confetti, wob: rng() * 6, r: s.kind === 'bubble' ? 4 : 1.5 });
        }
      }
      if (w.mag <= 0 && (w.reserve > 0 || s.infinite)) startReload();
    }
    function startReload() {
      const w = curW(), s = D.wstat(w);
      if (P.reload > 0 || w.mag >= s.mag || (w.reserve <= 0 && !s.infinite)) return;
      P.reload = s.reload * (P.perks.fizz ? 0.5 : 1); P.reloadTotal = P.reload; emit({ t: 'reload', w: s.id, dur: P.reload });
    }
    function finishReload() {
      const w = curW(), s = D.wstat(w), need = s.mag - w.mag, take = Math.min(need, s.infinite ? need : w.reserve);
      w.mag += take; if (!s.infinite) w.reserve -= take; emit({ t: 'reloaded', w: s.id });
    }
    function swap(dir) {
      if (P.weapons.length < 2) return;
      P.cur = (P.cur + dir + P.weapons.length) % P.weapons.length; P.reload = 0; P.cool = 0.25; emit({ t: 'swap', w: curW().id });
    }
    g.swap = swap;

    // ---------- buying and using things ----------
    function nearestTarget() {
      let best = null, bd = 1e9;
      const consider = (kind, d, o) => { if (d < bd) { bd = d; best = Object.assign({ kind }, o); } };
      for (const d of map.doors) {
        if (d.open) continue;
        const cx = clamp(P.x, d.x * T, (d.x + d.w) * T), cy = clamp(P.y, d.y * T, (d.y + d.h) * T);
        const dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd < 24) consider('door', dd, { door: d, cost: d.cost, label: 'Open ' + d.name });
      }
      for (const wb of map.wallbuys) {
        const cx = (wb.x + 0.5) * T, cy = (wb.y + 0.5) * T, dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd < 26) { const have = P.weapons.find((w) => w.id === wb.weapon), wp = D.WEAPONS[wb.weapon]; consider('wall', dd, have ? { wb, cost: Math.round(wp.cost / 2), label: 'Buy ammo: ' + wp.name } : { wb, cost: wp.cost, label: 'Buy ' + wp.name }); }
      }
      for (const m of map.machines) {
        const cx = (m.x + 1) * T, cy = (m.y + 0.5) * T, dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd > 30) continue;
        if (m.kind === 'perk') { const pk = D.PERKS[m.id]; if (P.perks[m.id]) consider('none', dd, { label: pk.name + ': you have it', cost: 0, info: true }); else consider('perk', dd, { m, perk: pk, cost: pk.cost, label: 'Buy ' + pk.name + ': ' + pk.desc }); }
        else if (m.kind === 'box') {
          if (m.state === 'idle') consider('box', dd, { m, cost: D.BOX.cost, label: 'Open the ' + D.BOX.name });
          else if (m.state === 'ready') consider('take', dd, { m, cost: 0, label: 'Take ' + D.WEAPONS[m.weapon].name });
          else consider('none', dd, { label: D.BOX.name + ' is wobbling...', cost: 0, info: true });
        } else if (m.kind === 'anvil') {
          const w = curW();
          if (w.up) consider('none', dd, { label: D.wstat(w).name + ' is already upgraded', cost: 0, info: true });
          else consider('anvil', dd, { m, cost: D.UPGRADE.cost, label: 'Upgrade ' + D.wstat(w).name + ' at the ' + D.UPGRADE.name });
        }
      }
      for (const b of map.barriers) {
        if (b.planks >= b.max) continue;
        const cx = clamp(P.x, b.x * T, (b.x + b.w) * T), cy = clamp(P.y, b.y * T, (b.y + b.h) * T), dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd < 20) consider('repair', dd - 3, { b, cost: 0, label: 'Repair the window', hold: true });
      }
      return best;
    }
    function buy(t) {
      if (!t || t.info) return;
      if (t.kind === 'take') { giveWeapon(t.m.weapon); t.m.state = 'idle'; t.m.weapon = null; emit({ t: 'take' }); return; }
      if (t.kind === 'repair') return;
      if (g.points < t.cost) { emit({ t: 'deny' }); say('Not enough points'); return; }
      g.points -= t.cost;
      if (t.kind === 'door') {
        const d = t.door; d.open = true; map.rooms[d.area].unlocked = true;
        for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) tiles[y * W + x] = K.FLOOR;
        g.flowTile = -1; emit({ t: 'door', id: d.id, name: d.name, x: (d.x + d.w / 2) * T, y: (d.y + d.h / 2) * T }); say(d.name + ' is open!');
      } else if (t.kind === 'wall') {
        const have = P.weapons.find((w) => w.id === t.wb.weapon);
        if (have) { have.reserve = D.wstat(have).reserve; have.mag = D.wstat(have).mag; } else giveWeapon(t.wb.weapon);
        emit({ t: 'buy', what: 'wall' });
      } else if (t.kind === 'perk') {
        P.perks[t.m.id] = true;
        if (t.m.id === 'heart') { P.maxHp = maxHp(); P.hp += 50; }
        emit({ t: 'buy', what: 'perk', id: t.m.id }); say(t.perk.name + '!');
      } else if (t.kind === 'box') {
        const owned = P.weapons.map((w) => w.id), pool = D.BOX_POOL.filter((id) => owned.indexOf(id) < 0);
        t.m.weapon = rng.pick(pool.length ? pool : D.BOX_POOL); t.m.state = 'spin'; t.m.t = 0; emit({ t: 'box', state: 'spin' });
      } else if (t.kind === 'anvil') {
        const w = curW(); w.up = true; const s = D.wstat(w); w.mag = s.mag; w.reserve = s.reserve; P.reload = 0;
        emit({ t: 'upgrade', w: w.id }); say(s.name + '!');
      }
    }
    g.buy = buy;

    // ---------- the update ----------
    function rebuildHash() {
      const h = g.hash; h.clear();
      for (const e of g.enemies) { if (e.dead) continue; const k = (Math.floor(e.x / 32) << 8) | Math.floor(e.y / 32); let a = h.get(k); if (!a) h.set(k, (a = [])); a.push(e); }
    }
    function near(x, y, rad, fn) {
      const x0 = Math.floor((x - rad) / 32), x1 = Math.floor((x + rad) / 32), y0 = Math.floor((y - rad) / 32), y1 = Math.floor((y + rad) / 32);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const a = g.hash.get((cx << 8) | cy); if (a) for (let i = 0; i < a.length; i++) fn(a[i]); }
    }

    function updatePlayer(dt, inp) {
      unstick();
      if (inp.aim != null) P.aim = inp.aim;
      const sp = P.speed * (P.perks.boots ? 1.22 : 1) * (P.reload > 0 ? 0.92 : 1) * (inp.sprint ? 1.45 : 1);
      let mx = inp.mx || 0, my = inp.my || 0; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
      P.moving = ml > 0.1;
      move(P, mx * sp * dt, my * sp * dt, false);
      if (Math.abs(Math.cos(P.aim)) > 0.2) P.face = Math.cos(P.aim) > 0 ? 1 : -1; else if (Math.abs(mx) > 0.2) P.face = mx > 0 ? 1 : -1;
      if (P.moving) P.bob += dt * 11;
      P.cool = Math.max(0, P.cool - dt); P.invuln = Math.max(0, P.invuln - dt); P.recoil = Math.max(0, P.recoil - dt * 8);
      if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { P.reload = 0; finishReload(); } }
      if (inp.swap) swap(inp.swap);
      if (inp.slot != null && inp.slot < P.weapons.length && inp.slot !== P.cur) { P.cur = inp.slot; P.reload = 0; P.cool = 0.25; emit({ t: 'swap', w: curW().id }); }
      if (inp.reload) startReload();
      if (inp.fire) fire();
      // using things
      g.prompt = nearestTarget();
      const t = g.prompt;
      if (inp.interactPressed && t) buy(t);
      P.repairCool -= dt;
      if (inp.interactHeld && t && t.kind === 'repair' && P.repairCool <= 0) {
        let busy = false; near(P.x, P.y, 40, (e) => { if (!e.dead && e.barrier === t.b.id && e.state === 'break') busy = true; });
        if (!busy) { t.b.planks++; award(10); P.repairCool = 0.42; emit({ t: 'repair', x: (t.b.x + t.b.w / 2) * T, y: (t.b.y + t.b.h / 2) * T, planks: t.b.planks }); }
      }
      if (g.t - P.lastHurt > 5 && P.hp < maxHp()) P.hp = Math.min(maxHp(), P.hp + 14 * dt);
      // never left without a way to fight: when every gun is dry, Pip's trusty Pip Popper (endless ammo) comes back
      if (P.weapons.every((w) => w.mag + w.reserve <= 0 && !D.wstat(w).infinite)) { const had = P.weapons.findIndex((w) => w.id === 'pip'); if (had >= 0) { P.weapons.splice(had, 1); } if (P.weapons.length >= 3) P.weapons.splice(Math.min(P.cur, P.weapons.length - 1), 1); P.weapons.push(newWeapon('pip')); P.cur = P.weapons.length - 1; P.reload = 0; say('Out of ammo! Pip Popper to the rescue.'); emit({ t: 'take' }); }
    }

    function enemyAI(e, dt) {
      const def = e.def; e.anim += dt * (e.type === 'wisper' ? 3 : 7);
      e.atkT = Math.max(0, (e.atkT || 0) - dt); e.hitT = Math.max(0, (e.hitT || 0) - dt); e.heading = Math.atan2(P.y - e.y, P.x - e.x);
      e.flash = Math.max(0, e.flash - dt); e.splitCd = Math.max(0, e.splitCd - dt); e.slowT = Math.max(0, e.slowT - dt); const slow = e.slowT > 0 ? e.slow : 1;
      if (g.sinceKill > 24 && !e.ghost && !e.boss) e.ghost = true;                      // softlock guard: nothing dies for 24s -> the leftovers float straight to the player
      const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      if (Math.abs(dx) > 1.5) e.face = dx > 0 ? 1 : -1;
      let spd = e.speed * slow * (e.boss && e.hp < e.maxHp * 0.5 ? 1.4 : 1);
      let tx = P.x, ty = P.y, canMove = true, direct = e.ghost;

      if (e.kx || e.ky) { move(e, e.kx * dt, e.ky * dt, e.ghost); const k = Math.pow(0.002, dt); e.kx *= k; e.ky *= k; if (Math.abs(e.kx) < 4) e.kx = 0; if (Math.abs(e.ky) < 4) e.ky = 0; }

      // line of sight (checked a few times a second)
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.25 + rng() * 0.15; e.los = dist < 220 && lineClear(e.x, e.y, P.x, P.y, solid); }
      if (!direct && e.los) direct = true;

      // creature-specific behaviour
      if (e.type === 'zapling') {
        e.dash -= dt;
        if (e.state === 'walk' && e.dash <= 0 && dist < 150) { e.state = 'wind'; e.st = 0.28; }
        else if (e.state === 'wind') { canMove = false; e.atkT = 0.2; e.st -= dt; if (e.st <= 0) { e.state = 'dash'; e.st = 0.36; e.da = ang; } }
        else if (e.state === 'dash') { spd = def.dash * e.speed / def.speed * 0.9 * slow; e.st -= dt; tx = e.x + Math.cos(e.da) * 50; ty = e.y + Math.sin(e.da) * 50; direct = true; if (e.st <= 0) { e.state = 'walk'; e.dash = 1.3 + rng() * 1.2; } }
      } else if (e.type === 'spitbud') {
        e.dash -= dt;
        // (one that has turned into a floating ghost - the softlock guard - no longer keeps its distance: backing away would carry it into a wall where shots cannot reach it)
        if (!e.ghost && dist < 75 && e.los) { tx = e.x - dx; ty = e.y - dy; spd *= 0.8; direct = true; }                 // backs away to keep its distance
        else if (!e.ghost && dist < 120 && e.los) canMove = false;
        else if (e.ghost && dist < 30) canMove = false;
        if (e.los && dist < 150 && e.dash <= 0) { e.dash = 2.0 + rng() * 0.6; g.spores.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 88, vy: Math.sin(ang) * 88, life: 2.6, dmg: e.dmg }); e.atkT = 0.45; emit({ t: 'spit', x: e.x, y: e.y, id: e.id }); }
      } else if (e.type === 'elder') {
        e.dash -= dt;
        if (e.state === 'walk' && e.dash <= 0 && dist < 80) { e.state = 'slam'; e.st = 0.85; emit({ t: 'slamWarn', x: e.x, y: e.y, r: def.slam }); }
        else if (e.state === 'slam') { canMove = false; e.atkT = 0.3; e.st -= dt; if (e.st <= 0) { e.state = 'walk'; e.dash = e.hp < e.maxHp * 0.5 ? 3 : 4.6; emit({ t: 'slam', x: e.x, y: e.y, r: def.slam }); if (Math.hypot(P.x - e.x, P.y - e.y) < def.slam + P.r) hurtPlayer(e.dmg, 'elder', e.x, e.y); } }
      }

      // contact attack / explosion
      const reach = e.r + P.r + 1.5;
      if (e.type === 'boomkit') { if (dist < reach + 5) { e.dead = true; explode(e.x, e.y, def.boom, e.dmg, 0); emit({ t: 'kill', x: e.x, y: e.y, type: 'boomkit', color: def.color, size: 1, boom: true, r: e.r }); g.kills++; award(def.pts * 0); return; } }
      else if (def.atk && !def.ranged) {
        e.atkCd -= dt;
        if (dist < reach && e.state !== 'slam') { canMove = false; if (e.atkCd <= 0) { e.atkCd = def.atk * (0.9 + rng() * 0.2); e.atkT = 0.45; hurtPlayer(e.dmg, e.type, e.x, e.y); emit({ t: 'bite', x: e.x, y: e.y, id: e.id }); } }
      }

      // moving: straight at the target when it can see it, otherwise down the path field
      e.state === 'break' && (e.state = 'walk');
      if (canMove) {
        let mx = 0, my = 0;
        if (direct) { const l = Math.hypot(tx - e.x, ty - e.y) || 1; mx = (tx - e.x) / l; my = (ty - e.y) / l; if (e.type === 'wisper') { mx += Math.sin(e.anim * 0.9) * 0.35; my += Math.cos(e.anim * 0.7) * 0.35; } }
        else {
          const cx = Math.floor(e.x / T), cy = Math.floor(e.y / T), f = e.r > 7 ? g.flowBig : g.flow, cur = f[cy * W + cx] === undefined ? 32767 : f[cy * W + cx];
          let bx = -1, by = -1, bd = cur;
          for (let i = 0; i < 8; i++) {
            const nx = cx + N8[i][0], ny = cy + N8[i][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (i >= 4 && (!walk(tiles[cy * W + nx]) || !walk(tiles[ny * W + cx]))) continue;
            const d = f[ny * W + nx]; if (d < bd) { bd = d; bx = nx; by = ny; }
          }
          if (bx >= 0) {
            const px = (bx + 0.5) * T, py = (by + 0.5) * T, l = Math.hypot(px - e.x, py - e.y) || 1; mx = (px - e.x) / l; my = (py - e.y) / l;
            const bid = bAt[by * W + bx];
            if (bid >= 0 && map.barriers[bid].planks > 0 && Math.hypot(px - e.x, py - e.y) < 15) {       // a window in the way: tear the boards off
              const b = map.barriers[bid]; e.state = 'break'; e.barrier = bid; mx = my = 0;
              e.atkCd -= dt; if (e.atkCd <= 0) { e.atkCd = (e.boss ? 0.8 : 1.25) * (0.85 + rng() * 0.3); b.planks--; b.hit = 0.25; emit({ t: 'plank', x: (b.x + b.w / 2) * T, y: (b.y + b.h / 2) * T, planks: b.planks }); }
            }
          } else if (cur === 32767) { mx = dx / dist; my = dy / dist; e.ghost = e.ghost || g.sinceKill > 12; }
        }
        if (e.state !== 'break') { const sp2 = spd * dt; e.vx = mx * sp2; e.vy = my * sp2; move(e, e.vx, e.vy, e.ghost); }
      }
      // stuck check
      e.stuck += dt;
      if (e.stuck > 3) { if (Math.hypot(e.x - e.lx, e.y - e.ly) < 6 && e.state !== 'break' && dist > reach + 6 && e.state !== 'slam') { e.stuckN = (e.stuckN || 0) + 1; if (!e.boss || e.stuckN >= 3) e.ghost = true; } else e.stuckN = 0; e.lx = e.x; e.ly = e.y; e.stuck = 0; }
    }

    function updateBullets(dt) {
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i]; let dead = false;
        b.life -= dt;
        if (b.kind === 'bubble') { b.wob += dt * 9; }
        const steps = 2; const sdx = b.vx * dt / steps, sdy = b.vy * dt / steps;
        for (let s = 0; s < steps && !dead; s++) {
          b.px = b.x; b.py = b.y; b.x += sdx; b.y += sdy + (b.kind === 'bubble' ? Math.sin(b.wob) * 0.2 : 0);
          if (bulletSolid(Math.floor(b.x / T), Math.floor(b.y / T))) { dead = true; emit({ t: 'spark', x: b.px, y: b.py, color: b.color, w: b.w, ang: b.ang, wall: true }); break; }
          near(b.x, b.y, 14, (e) => {
            if (dead || e.dead || (b.hit && b.hit.has(e.id))) return;
            const d = Math.hypot(e.x - b.x, e.y - b.y);
            if (d > e.r + b.r + 2.5) return;
            hurtEnemy(e, b.dmg, { pts: b.pts, ang: b.ang, w: b.w, slow: b.slow, kb: b.kind === 'bubble' ? 0 : 40 });
            if (b.kind === 'bubble') { dead = true; return; }
            (b.hit || (b.hit = new Set())).add(e.id);
            if (b.pierce <= 0) dead = true; else { b.pierce--; b.dmg *= 0.8; }
          });
        }
        if (b.life <= 0) dead = true;
        if (dead) {
          if (b.kind === 'bubble') { emit({ t: 'pop', x: b.x, y: b.y, color: b.color }); near(b.x, b.y, b.splash + 14, (e) => { if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < b.splash + e.r) hurtEnemy(e, b.splashDmg, { pts: 4, ang: Math.atan2(e.y - b.y, e.x - b.x), w: b.w, slow: b.slow }); }); }
          g.bullets.splice(i, 1);
        }
      }
      for (let i = g.spores.length - 1; i >= 0; i--) {
        const s = g.spores[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (bulletSolid(Math.floor(s.x / T), Math.floor(s.y / T)) || s.life <= 0) { g.spores.splice(i, 1); continue; }
        if (Math.hypot(P.x - s.x, P.y - s.y) < P.r + 3) { hurtPlayer(s.dmg, 'spore', s.x, s.y); g.spores.splice(i, 1); }
      }
      for (let i = g.beams.length - 1; i >= 0; i--) { g.beams[i].t -= dt; if (g.beams[i].t <= 0) g.beams.splice(i, 1); }
    }

    function updatePickups(dt) {
      for (let i = g.pickups.length - 1; i >= 0; i--) {
        const p = g.pickups[i]; p.life -= dt;
        if (Math.hypot(P.x - p.x, P.y - p.y) < 13) {
          g.pickups.splice(i, 1);
          if (p.type === 'ammo') { for (const w of P.weapons) { const s = D.wstat(w); w.mag = s.mag; w.reserve = s.reserve; } }
          else if (p.type === 'twin') g.powers.twin = 30;
          else if (p.type === 'zap') g.powers.zap = 30;
          else if (p.type === 'boom') {
            g.points += 400; emit({ t: 'boom', x: P.x, y: P.y, r: 400, nuke: true });
            for (const e of g.enemies) { if (e.dead) continue; if (e.boss) { e.hp -= e.maxHp * 0.2; e.flash = 0.2; if (e.hp <= 1) e.hp = 1; } else { e.hp = 0; killEnemy(e, 'nuke'); } }
          }
          emit({ t: 'pickup', type: p.type, x: p.x, y: p.y }); say(D.POWERUPS[p.type].text + '!');
        } else if (p.life <= 0) g.pickups.splice(i, 1);
      }
    }

    g.update = function (dt, inp) {
      if (g.over) return;
      dt = Math.min(dt, 0.05); inp = inp || {};
      g.t += dt; g.sinceKill += dt;
      g.powers.twin = Math.max(0, g.powers.twin - dt); g.powers.zap = Math.max(0, g.powers.zap - dt);
      for (const b of map.barriers) b.hit = Math.max(0, b.hit - dt);
      for (const m of map.machines) if (m.kind === 'box') {
        if (m.state === 'spin') { m.t += dt; if (m.t >= D.BOX.spin) { m.state = 'ready'; m.t = 0; emit({ t: 'box', state: 'ready' }); } }
        else if (m.state === 'ready') { m.t += dt; if (m.t >= D.BOX.hold) { m.state = 'idle'; m.weapon = null; emit({ t: 'box', state: 'gone' }); } }
      }
      // rounds
      if (g.state === 'intermission') { g.timer -= dt; if (g.timer <= 0) startRound(g.round + 1); }
      else { g.roundTime += dt; }

      updatePlayer(dt, inp);
      g.flowTimer -= dt;
      const pt = Math.floor(P.y / T) * W + Math.floor(P.x / T);
      if (g.flowTimer <= 0 || pt !== g.flowTile) { if (pt !== g.flowTile || g.flowTimer <= 0) { buildFlow(); g.flowTimer = 0.3; } }

      if (g.state === 'active') {
        g.spawnTimer -= dt;
        if (g.toSpawn > 0 && g.spawnTimer <= 0 && g.enemies.length < g.plan.alive) { if (spawnOne()) g.toSpawn--; g.spawnTimer = g.plan.interval * (0.75 + rng() * 0.5); }
        if (g.toSpawn <= 0 && g.enemies.length === 0) { g.state = 'intermission'; g.timer = D.intermission; emit({ t: 'roundEnd', round: g.round }); }
      }
      rebuildHash();
      for (const e of g.enemies) if (!e.dead) enemyAI(e, dt);
      // soft separation so they do not stack on one spot
      for (const e of g.enemies) {
        if (e.dead || e.ghost && e.type === 'wisper') continue;
        near(e.x, e.y, 14, (o) => {
          if (o === e || o.dead || o.id < e.id) return;
          const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 0.01, min = (e.r + o.r) * 0.85;
          if (d < min) { const k = (min - d) * 0.5 / d; move(e, -dx * k, -dy * k, e.ghost); move(o, dx * k, dy * k, o.ghost); }
        });
      }
      updateBullets(dt);
      updatePickups(dt);
      for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].dead) g.enemies.splice(i, 1);
      if (g.enemies.length > g.stats.maxAlive) g.stats.maxAlive = g.enemies.length;
      if (g.message && g.t - g.message.t > 2.2) g.message = null;
    };
    return g;
  };
})();
