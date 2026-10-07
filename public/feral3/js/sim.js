// Feral 3.0 - the simulation. Pure game rules (no DOM, no audio, no drawing): it takes an input object each step and fills g.events, which the renderer, sound and HUD read.
// Because it is pure, the same code is played by a bot in Node to check balance and look for softlocks. (Started from Feral 2.0's rules; shots are now true hit-scan rays that
// respect height and headshots, creatures have their own behaviours, and the player can crouch and aim down sights.)
(function () {
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = (G.DZF = G.DZF || {});
  const K = D.K, T = D.T, clamp = D.clamp;
  const EV_CAP = 500, M = 8;                      // 8 sim pixels = 1 metre
  const EYE = 1.62, EYE_CROUCH = 1.0;

  D.wstat = function (w) {                         // a weapon's numbers, with the Weapons Bench upgrade applied
    const b = D.WEAPONS[w.id], u = w.up ? D.UPGRADE : null;
    return { id: b.id, infinite: !!b.infinite, name: (u ? 'Forged ' : '') + b.name, kind: b.kind, dmg: b.dmg * (u ? u.dmg : 1), rate: b.rate * (u ? u.rate : 1), mag: Math.round(b.mag * (u ? u.mag : 1)),
      reserve: Math.round(b.reserve * (u ? u.reserve : 1)), reload: b.reload, spread: b.spread, ads: b.ads, pellets: b.pellets, pierce: b.pierce + (u ? 1 : 0), fall: b.fall, range: b.range,
      color: u ? '#ffd84a' : b.color, shake: b.shake, kick: b.kick, wander: b.wander, auto: b.auto, head: b.head };
  };
  const newWeapon = (id) => { const w = { id, up: false, mag: 0, reserve: 0 }; const s = D.wstat(w); w.mag = s.mag; w.reserve = s.reserve; return w; };

  D.createGame = function (opts) {
    opts = opts || {};
    const rng = D.makeRng(opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed);
    const map = D.buildMap();
    const W = map.w, H = map.h, tiles = map.tiles;
    const bAt = new Int16Array(W * H).fill(-1);               // tile -> barrier id
    map.barriers.forEach((b) => { for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) bAt[y * W + x] = b.id; });

    const g = {
      rng, map, t: 0, round: 0, state: 'intermission', timer: 6, over: false, points: 500, kills: 0, shots: 0, hits: 0, headshots: 0,
      player: null, enemies: [], bullets: [], spores: [], pickups: [], events: [], nextId: 1,
      toSpawn: 0, spawnTimer: 0, plan: null, bossQueue: 0, dropsThisRound: 0, roundTime: 0, sinceKill: 0, flowTimer: 0, flow: new Int16Array(W * H), flowBig: new Int16Array(W * H), flowTile: -1,
      powers: { twin: 0, zap: 0 }, prompt: null, message: null, beams: [], hash: new Map(), stats: { maxAlive: 0 }, bossesDone: 0,
    };
    const P = g.player = {
      x: (D.PLAYER_START[0] + 0.5) * T, y: (D.PLAYER_START[1] + 0.5) * T, r: 5, hp: 100, maxHp: 100, speed: 50, aim: 0, pitch: 0, weapons: [newWeapon('pistol')], cur: 0,
      reload: 0, cool: 0, lastHurt: -99, invuln: 0, perks: { heart: false, fizz: false, boots: false, lamp: false }, moving: false, repairCool: 0, bob: 0, sprint: false,
      crouch: 0, crouching: false, eye: EYE, ads: 0, vx: 0, vy: 0, kx: 0, ky: 0, burst: 0, burstT: 0, lastShot: -9,
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
      return true;                                              // wall, closed door, scenery, liquids, machines
    }
    function bulletSolid(tx, ty) { const k = kindAt(tx, ty); return k === K.WALL || k === K.DOOR || k === K.BLOCK || k === K.MACHINE; }   // shots fly over liquids and through barricades
    // The player may only ever stand on open floor: every wall, barricade opening (boarded or broken), yard, closed door, crate and machine is solid for the player.
    // (Creatures use solid(): they do walk through a barricade once its boards are gone.)
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
        if (x > 8 && y > 8 && x < W * T - 8 && y < H * T - 8 && !blocked(x, y, P.r, solidPlayer)) { P.x = x; P.y = y; emit({ t: 'unstick' }); return true; }
      }
      return false;
    }
    g.unstick = unstick; g.playerStuck = () => blocked(P.x, P.y, P.r, solidPlayer);
    function lineClear(x0, y0, x1, y1, fn) {                    // is the straight line free of tiles where fn(tx,ty) is true?
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 5));
      for (let i = 1; i < n; i++) { const t = i / n; if (fn(Math.floor((x0 + (x1 - x0) * t) / T), Math.floor((y0 + (y1 - y0) * t) / T))) return false; }
      return true;
    }
    g.solid = solid; g.kindAt = kindAt; g.lineClear = lineClear; g.bulletSolid = bulletSolid;

    // ---------- the path field: every walkable tile knows how far it is from the player (a flow field: the grid equivalent of a navmesh) ----------
    const walk = (k) => k === K.FLOOR || k === K.POCKET || k === K.BARRIER;
    const queue = new Int32Array(W * H);
    const clear3 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = kindAt(x + dx, y + dy); if (k !== K.FLOOR && k !== K.BARRIER) return false; } return true; };    // room for a big creature
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
      const e = {
        id: g.nextId++, type, def, x, y, vx: 0, vy: 0, r: def.r, hp: 0, maxHp: 0, flash: 0, anim: rng() * 6,
        speed: def.speed * p.speedMult * (0.9 + rng() * 0.2), dmg: def.dmg * p.dmgMult, atkCd: 0.4 + rng() * 0.4, dead: false, state: 'walk', st: 0, slowT: 0, slow: 1,
        los: false, losT: rng() * 0.3, stuck: 0, lx: x, ly: y, barrier: -1, ghost: false, born: g.t, dash: 1 + rng() * 1.5, boss: !!def.boss, kx: 0, ky: 0, side: rng() < 0.5 ? 1 : -1, enraged: false, summoned: false, zz: rng() * 6,
        atkT: 0, hitT: 0, heading: 0, h: def.h,
      };
      const base = def.hp * p.hpMult * (def.boss ? 1 + 0.35 * (g.bossesDone || 0) : 1);
      e.maxHp = opt.hp != null ? Math.max(opt.hp, 1) : base; e.hp = e.maxHp;
      g.enemies.push(e);
      return e;
    }
    function dropPowerup(x, y, force) {
      if (!force) { if (g.dropsThisRound >= 4 || rng() > 0.028) return; }
      g.dropsThisRound++;
      g.pickups.push({ id: g.nextId++, x, y, type: rng.pick(['ammo', 'twin', 'boom', 'zap']), life: 28, born: g.t });
      emit({ t: 'drop', x, y });
    }
    function killEnemy(e, cause, head) {
      if (e.dead) return;
      e.dead = true; g.kills++; if (head) g.headshots++;
      award(Math.round(e.def.pts * (head ? 1.25 : 1)));
      emit({ t: 'kill', x: e.x, y: e.y, type: e.type, color: e.def.color, boss: e.boss, r: e.r, cause, id: e.id, heading: e.heading, head: !!head, h: e.h });
      if (e.boss) { g.bossesDone++; dropPowerup(e.x, e.y, true); emit({ t: 'bossDown' }); }
      else dropPowerup(e.x, e.y, false);
      g.sinceKill = 0;
    }
    function hurtEnemy(e, dmg, o) {
      if (e.dead) return false;
      o = o || {};
      if (g.powers.zap > 0) dmg = e.boss ? e.maxHp * 0.1 : 99999;
      e.hp -= dmg; e.flash = 0.09; e.hitT = 0.3;
      if (o.pts !== false) award(o.pts || 10);
      g.hits++;
      emit({ t: 'hit', x: e.x, y: e.y, dmg: Math.min(Math.round(dmg), 9999), kill: e.hp <= 0, type: e.type, color: e.def.color, ang: o.ang || 0, w: o.w, head: !!o.head, z: o.z, id: e.id });
      if (o.slow) { e.slowT = 2.2; e.slow = o.slow; }
      if (!e.def.heavy && o.kb) { e.kx += Math.cos(o.ang || 0) * o.kb; e.ky += Math.sin(o.ang || 0) * o.kb; }
      if (e.def.enrage && !e.enraged && e.hp < e.maxHp * 0.3 && e.hp > 0) { e.enraged = true; e.speed *= 1.5; emit({ t: 'enrage', x: e.x, y: e.y, id: e.id }); }
      if (e.hp <= 0) { killEnemy(e, o.w, o.head); return true; }
      return false;
    }
    g.hurtEnemy = hurtEnemy;
    g.spawnEnemy = spawnEnemy;      // (used by tests)
    function hurtPlayer(dmg, from, sx, sy) {
      if (P.invuln > 0 || g.over) return;
      P.hp -= dmg; P.lastHurt = g.t; P.invuln = 0.3;
      emit({ t: 'hurt', dmg, x: P.x, y: P.y, from, sx, sy });
      if (P.hp <= 0) {
        if (P.perks.lamp) {                                      // Second Wind: get up again
          P.perks.lamp = false; P.hp = maxHp() * 0.6; P.invuln = 3;
          for (const e of g.enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < 70 && !e.boss) { const a = Math.atan2(e.y - P.y, e.x - P.x); e.kx += Math.cos(a) * 160; e.ky += Math.sin(a) * 160; e.st = 0; } }
          emit({ t: 'revive', x: P.x, y: P.y }); say('Second Wind! Back on your feet.');
        } else { P.hp = 0; g.over = true; emit({ t: 'gameover' }); }
      }
    }
    function explode(x, y, r, dmgPlayer, dmgEnemies) {
      emit({ t: 'boom', x, y, r });
      if (Math.hypot(P.x - x, P.y - y) < r + P.r) hurtPlayer(dmgPlayer, 'boom', x, y);
      if (dmgEnemies) for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r + e.r) hurtEnemy(e, dmgEnemies, { pts: 4, ang: Math.atan2(e.y - y, e.x - x), kb: 90 });
    }
    function knockPlayer(x, y, k) { const a = Math.atan2(P.y - y, P.x - x); P.kx += Math.cos(a) * k; P.ky += Math.sin(a) * k; }

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
      const openSpawn = (type, preferRoom) => {              // big creatures do not fit through a barricade yard: they appear in the open (the boss in the Lava Cave when it is open)
        const rs = map.rooms.filter((r) => r.unlocked), rad = D.ENEMIES[type].r;
        const pool = preferRoom != null && map.rooms[preferRoom].unlocked ? [map.rooms[preferRoom]] : rs;
        for (let tries = 0; tries < 160; tries++) {
          const r = rng.pick(pool), x = (r.x + 3 + rng() * (r.w - 6)) * T, y = (r.y + 3 + rng() * (r.h - 6)) * T, d = Math.hypot(x - P.x, y - P.y);
          if (d < (tries < 100 ? 120 : 60) || d > (preferRoom != null ? 900 : 420) || blocked(x, y, rad + 4) || !clear3(Math.floor(x / T), Math.floor(y / T))) continue;
          spawnEnemy(type, x, y); emit({ t: type === 'boss' ? 'bossSpawn' : 'bigSpawn', x, y }); return true;
        }
        return false;
      };
      if (g.bossQueue > 0 && g.toSpawn <= g.bossQueue + Math.floor(plan.count / 2)) { if (openSpawn('boss', 3)) { g.bossQueue--; return true; } return false; }
      let type = 'small1';
      {
        let tot = 0; for (const k in plan.weights) tot += plan.weights[k];
        let r = rng() * tot; for (const k in plan.weights) { r -= plan.weights[k]; if (r <= 0) { type = k; break; } }
        const big = (t) => g.enemies.filter((e) => e.type === t).length;
        if (type === 'large1' && big('large1') >= 1 + Math.floor(plan.round / 9)) type = 'medium1';
        if (type === 'large2' && big('large2') >= 1 + Math.floor(plan.round / 11)) type = 'medium3';
      }
      if (D.ENEMIES[type].r > 7) return openSpawn(type);
      const p = pickPocket(); if (!p) return false;
      const x = (p.x + 0.5 + rng() * (p.w - 1)) * T, y = (p.y + 0.5 + rng() * (p.h - 1)) * T;
      spawnEnemy(type, x, y);
      return true;
    }

    // ---------- shooting: true hit-scan rays (they respect height, so a shot at the ground or the sky misses; heads count extra) ----------
    function rayShot(s, yaw, pitch, ox, oy, eye) {
      const ca = Math.cos(yaw), sa = Math.sin(yaw), tn = Math.tan(pitch);
      let wall = s.range;
      for (let d = 4; d < s.range; d += 3) { if (bulletSolid(Math.floor((ox + ca * d) / T), Math.floor((oy + sa * d) / T))) { wall = d; break; } }
      const hits = [];
      for (const e of g.enemies) {
        if (e.dead) continue;
        const px = e.x - ox, py = e.y - oy, along = px * ca + py * sa;
        if (along < 0 || along > wall + e.r * 0.5) continue;
        const perp = Math.abs(-px * sa + py * ca); if (perp > e.r * 0.92 + 1.2) continue;
        const z = eye + tn * along / M;                                 // height of the ray when it passes the creature, in metres
        if (z < -0.1 || z > e.h + 0.6) continue;                       // (a forgiving margin above the head: small creatures are easy to hit from eye level)
        hits.push({ e, along, z, head: z > e.h * 0.72 && z <= e.h + 0.2 });
      }
      hits.sort((a, b) => a.along - b.along);
      let end = wall, endZ = eye + tn * wall / M, pierce = s.pierce, dmg = s.dmg; const out = [];
      for (const h of hits) {
        const fall = Math.max(0.35, 1 - Math.max(0, h.along - s.fall) / (s.fall * 1.6)), d = dmg * fall * (h.head ? s.head : 1);
        hurtEnemy(h.e, d, { pts: s.pellets > 1 ? 4 : 10, ang: yaw, w: s.id, head: h.head, z: h.z, kb: 30 });
        out.push(h);
        if (pierce <= 0) { end = h.along; endZ = h.z; break; } pierce--; dmg *= 0.75;
      }
      return { end, endZ, wallHit: end >= wall - 0.001, hits: out, ca, sa };
    }
    function fire(inp) {
      const w = curW(), s = D.wstat(w);
      if (P.reload > 0 || P.cool > 0) return;
      if (w.mag <= 0) { if (w.reserve > 0 || s.infinite) startReload(); else if (P.cool <= 0) { emit({ t: 'empty' }); P.cool = 0.3; } return; }
      w.mag--; g.shots++; P.cool = 1 / s.rate;
      if (g.t - P.lastShot > 0.45) P.burst = 0; P.burst++; P.lastShot = g.t;
      const ox = P.x + Math.cos(P.aim) * 3, oy = P.y + Math.sin(P.aim) * 3, spread = (s.ads * P.ads + s.spread * (1 - P.ads)) * (P.crouch > 0.5 ? 0.8 : 1) * (P.moving ? (P.sprint ? 1.6 : 1.25) : 1) * (1 + Math.min(1.0, P.burst * 0.04) * (s.auto ? 1 : 0));
      const rays = [];
      for (let i = 0; i < s.pellets; i++) {
        const sx = (rng() + rng() - 1) * spread * Math.PI / 180 * (s.pellets > 1 ? 1.4 : 1), sy = (rng() + rng() - 1) * spread * Math.PI / 180 * (s.pellets > 1 ? 1.4 : 1);
        const r = rayShot(s, P.aim + sx, P.pitch + sy, ox, oy, P.eye); rays.push({ x1: ox + r.ca * r.end, y1: oy + r.sa * r.end, z1: r.endZ, wall: r.wallHit, kills: r.hits.length });
        if (r.wallHit && r.end < s.range) emit({ t: 'spark', x: ox + r.ca * (r.end - 1.5), y: oy + r.sa * (r.end - 1.5), z: r.endZ, color: s.color, w: s.id, ang: P.aim + sx, wall: true });
      }
      emit({ t: 'shot', w: s.id, x: ox, y: oy, ang: P.aim, pitch: P.pitch, rays, shake: s.shake, kick: s.kick, wander: s.wander, burst: P.burst, ads: P.ads, eye: P.eye });
      if (w.mag <= 0 && (w.reserve > 0 || s.infinite)) startReload();
    }
    function startReload() {
      const w = curW(), s = D.wstat(w);
      if (P.reload > 0 || w.mag >= s.mag || (w.reserve <= 0 && !s.infinite)) return;
      P.reload = s.reload * (P.perks.fizz ? 0.5 : 1); P.reloadTotal = P.reload; emit({ t: 'reload', w: s.id, dur: P.reload, empty: w.mag === 0 });
    }
    function finishReload() {
      const w = curW(), s = D.wstat(w), need = s.mag - w.mag, take = Math.min(need, s.infinite ? need : w.reserve);
      w.mag += take; if (!s.infinite) w.reserve -= take; emit({ t: 'reloaded', w: s.id });
    }
    function swap(dir) {
      if (P.weapons.length < 2) return;
      P.cur = (P.cur + dir + P.weapons.length) % P.weapons.length; P.reload = 0; P.cool = 0.4; emit({ t: 'swap', w: curW().id });
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
        if (dd < 24) consider('door', dd, { door: d, cost: d.cost, label: 'Open the way to the ' + d.name });
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
          else consider('none', dd, { label: D.BOX.name + ' is opening...', cost: 0, info: true });
        } else if (m.kind === 'anvil') {
          const w = curW();
          if (w.up) consider('none', dd, { label: D.wstat(w).name + ' is already forged', cost: 0, info: true });
          else consider('anvil', dd, { m, cost: D.UPGRADE.cost, label: 'Forge ' + D.wstat(w).name + ' at the ' + D.UPGRADE.name });
        }
      }
      for (const b of map.barriers) {
        if (b.planks >= b.max) continue;
        const cx = clamp(P.x, b.x * T, (b.x + b.w) * T), cy = clamp(P.y, b.y * T, (b.y + b.h) * T), dd = Math.hypot(P.x - cx, P.y - cy);
        if (dd < 20) consider('repair', dd - 3, { b, cost: 0, label: 'Repair the barricade', hold: true });
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
      P.pitch = inp.pitch || 0;
      P.ads = D.lerp(P.ads, inp.ads ? 1 : 0, Math.min(1, dt * 12));
      // crouch: lowers the eye, slows you down, tightens the spread
      P.crouching = !!inp.crouch; P.crouch = D.lerp(P.crouch, P.crouching ? 1 : 0, Math.min(1, dt * 10)); P.eye = EYE + (EYE_CROUCH - EYE) * P.crouch;
      P.sprint = !!inp.sprint && !P.crouching && P.ads < 0.3;
      const sp = P.speed * (P.perks.boots ? 1.2 : 1) * (P.reload > 0 ? 0.92 : 1) * (P.sprint ? 1.45 : 1) * (1 - 0.45 * P.crouch) * (1 - 0.3 * P.ads);
      let mx = inp.mx || 0, my = inp.my || 0; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
      P.moving = ml > 0.1;
      const k = Math.min(1, dt * 14);                                 // a little inertia so movement does not feel pasted on
      P.vx += (mx * sp - P.vx) * k; P.vy += (my * sp - P.vy) * k;
      move(P, (P.vx + P.kx) * dt, (P.vy + P.ky) * dt, false);
      const kk = Math.pow(0.004, dt); P.kx *= kk; P.ky *= kk; if (Math.abs(P.kx) < 2) P.kx = 0; if (Math.abs(P.ky) < 2) P.ky = 0;
      if (P.moving) P.bob += dt * (P.sprint ? 13 : P.crouching ? 6 : 9.5);
      P.cool = Math.max(0, P.cool - dt); P.invuln = Math.max(0, P.invuln - dt);
      if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { P.reload = 0; finishReload(); } }
      if (inp.swap) swap(inp.swap);
      if (inp.slot != null && inp.slot < P.weapons.length && inp.slot !== P.cur) { P.cur = inp.slot; P.reload = 0; P.cool = 0.4; emit({ t: 'swap', w: curW().id }); }
      if (inp.reload) startReload();
            if (inp.fire && !P.sprint) fire(inp);                                      // holding the trigger keeps firing at the gun's rate (every gun)
      P.fireHeld = !!inp.fire;
      // using things
      g.prompt = nearestTarget();
      const t = g.prompt;
      if (inp.interactPressed && t) buy(t);
      P.repairCool -= dt;
      if (inp.interactHeld && t && t.kind === 'repair' && P.repairCool <= 0) {
        let busy = false; near(P.x, P.y, 40, (e) => { if (!e.dead && e.barrier === t.b.id && e.state === 'break') busy = true; });
        if (!busy) { t.b.planks++; award(10); P.repairCool = 0.42; emit({ t: 'repair', x: (t.b.x + t.b.w / 2) * T, y: (t.b.y + t.b.h / 2) * T, planks: t.b.planks, id: t.b.id }); }
      }
      if (g.t - P.lastHurt > 5 && P.hp < maxHp()) P.hp = Math.min(maxHp(), P.hp + 14 * dt);
      // never left without a way to fight: when every gun is dry, the pistol (endless ammo) comes back
      if (P.weapons.every((w) => w.mag + w.reserve <= 0 && !D.wstat(w).infinite)) { const had = P.weapons.findIndex((w) => w.id === 'pistol'); if (had >= 0) { P.weapons.splice(had, 1); } if (P.weapons.length >= 3) P.weapons.splice(Math.min(P.cur, P.weapons.length - 1), 1); P.weapons.push(newWeapon('pistol')); P.cur = P.weapons.length - 1; P.reload = 0; say('Out of ammo! Back to the pistol.'); emit({ t: 'take' }); }
    }

    function enemyAI(e, dt) {
      const def = e.def; e.anim += dt * 7;
      e.atkT = Math.max(0, e.atkT - dt); e.hitT = Math.max(0, e.hitT - dt); e.heading = Math.atan2(P.y - e.y, P.x - e.x);
      e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt); const slow = e.slowT > 0 ? e.slow : 1;
      if (g.sinceKill > 24 && !e.ghost && !e.boss) e.ghost = true;                      // softlock guard: nothing dies for 24s -> the leftovers float straight to the player
      const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      let spd = e.speed * slow * (e.boss && e.hp < e.maxHp * 0.5 ? 1.35 : 1);
      let tx = P.x, ty = P.y, canMove = true, direct = e.ghost;

      if (e.kx || e.ky) { move(e, e.kx * dt, e.ky * dt, e.ghost); const k = Math.pow(0.002, dt); e.kx *= k; e.ky *= k; if (Math.abs(e.kx) < 4) e.kx = 0; if (Math.abs(e.ky) < 4) e.ky = 0; }

      // line of sight (checked a few times a second)
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.25 + rng() * 0.15; e.los = dist < 240 && lineClear(e.x, e.y, P.x, P.y, solid); }
      if (!direct && e.los) direct = true;

      // creature-specific behaviour
      if (def.dash && !def.charge) {                          // Thornback and Rustclaw: crouch, then leap
        e.dash -= dt;
        if (def.flank && e.state === 'walk' && e.los && dist > 70) { const px = -dy / dist, py = dx / dist, o = e.side * Math.min(60, dist * 0.5); tx = P.x + px * o; ty = P.y + py * o; }
        if (e.state === 'walk' && e.dash <= 0 && dist < (def.flank ? 130 : 110)) { e.state = 'wind'; e.st = def.flank ? 0.4 : 0.28; }
        else if (e.state === 'wind') { canMove = false; e.atkT = 0.2; e.st -= dt; if (e.st <= 0) { e.state = 'dash'; e.st = def.flank ? 0.45 : 0.36; e.da = ang; emit({ t: 'leap', x: e.x, y: e.y, id: e.id }); } }
        else if (e.state === 'dash') { spd = def.dash * e.speed / def.speed * 0.9 * slow; e.st -= dt; tx = e.x + Math.cos(e.da) * 50; ty = e.y + Math.sin(e.da) * 50; direct = true; if (e.st <= 0) { e.state = 'walk'; e.dash = (def.flank ? 2.2 : 1.3) + rng() * 1.4; } }
      } else if (def.charge) {                                 // Rendermaw: roars, then charges in a straight line and bowls the player over
        e.dash -= dt;
        if (e.state === 'walk' && e.dash <= 0 && e.los && dist > 50 && dist < 190) { e.state = 'wind'; e.st = 0.75; emit({ t: 'roar', x: e.x, y: e.y, id: e.id }); }
        else if (e.state === 'wind') { canMove = false; e.atkT = 0.3; e.st -= dt; e.da = ang; if (e.st <= 0) { e.state = 'dash'; e.st = 0.9; } }
        else if (e.state === 'dash') { spd = def.charge * (e.speed / def.speed) * slow; e.st -= dt; tx = e.x + Math.cos(e.da) * 60; ty = e.y + Math.sin(e.da) * 60; direct = true;
          if (dist < e.r + P.r + 3 && !e.hitDone) { e.hitDone = true; hurtPlayer(e.dmg, e.type, e.x, e.y); knockPlayer(e.x, e.y, 170); emit({ t: 'bite', x: e.x, y: e.y, id: e.id, heavy: true }); }
          if (e.st <= 0 || blocked(e.x + Math.cos(e.da) * 6, e.y + Math.sin(e.da) * 6, e.r, solid)) { e.state = 'walk'; e.hitDone = false; e.dash = 3 + rng() * 2; e.stunT = 0.7; emit({ t: 'slam', x: e.x, y: e.y, r: 18, small: true }); } }
        if (e.stunT > 0) { e.stunT -= dt; canMove = false; }
      } else if (def.ranged) {                                // Gloomspitter: keeps its distance and spits acid
        e.dash -= dt;
        if (!e.ghost && dist < 75 && e.los) { tx = e.x - dx; ty = e.y - dy; spd *= 0.8; direct = true; }
        else if (!e.ghost && dist < 125 && e.los) { const px = -dy / dist, py = dx / dist; tx = e.x + px * e.side * 30; ty = e.y + py * e.side * 30; direct = true; spd *= 0.6; }
        else if (e.ghost && dist < 30) canMove = false;
        if (e.los && dist < 170 && e.dash <= 0) { e.dash = 1.9 + rng() * 0.6; g.spores.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 96, vy: Math.sin(ang) * 96, life: 2.6, dmg: e.dmg, z: 1.4 }); e.atkT = 0.5; emit({ t: 'spit', x: e.x, y: e.y, id: e.id }); }
      } else if (def.zig) {                                   // Cinderling: weaves from side to side while it runs at you
        if (dist > 28) { e.zz += dt * 7; const px = -dy / dist, py = dx / dist, o = Math.sin(e.zz) * 26; tx = P.x + px * o; ty = P.y + py * o; }
      }
      if (def.stomp) {                                        // Grimmaw: slow, then a ground stomp that hurts everything close
        e.dash -= dt;
        if (e.state === 'walk' && e.dash <= 0 && dist < 60) { e.state = 'slam'; e.st = 0.7; emit({ t: 'slamWarn', x: e.x, y: e.y, r: def.stomp, id: e.id }); }
        else if (e.state === 'slam') { canMove = false; e.atkT = 0.3; e.st -= dt; if (e.st <= 0) { e.state = 'walk'; e.dash = 3.2; emit({ t: 'slam', x: e.x, y: e.y, r: def.stomp, id: e.id }); if (Math.hypot(P.x - e.x, P.y - e.y) < def.stomp + P.r) { hurtPlayer(e.dmg, 'stomp', e.x, e.y); knockPlayer(e.x, e.y, 120); } } }
      }
      if (def.boss) {                                         // Cinder Hydra: stomps, breathes fire in a fan, and calls its brood when hurt
        e.dash -= dt; e.breathCd = (e.breathCd == null ? 4 : e.breathCd) - dt;
        if (e.state === 'walk' && e.dash <= 0 && dist < 90) { e.state = 'slam'; e.st = 0.85; emit({ t: 'slamWarn', x: e.x, y: e.y, r: def.slam, id: e.id }); }
        else if (e.state === 'slam') { canMove = false; e.atkT = 0.3; e.st -= dt; if (e.st <= 0) { e.state = 'walk'; e.dash = e.hp < e.maxHp * 0.5 ? 3 : 4.6; emit({ t: 'slam', x: e.x, y: e.y, r: def.slam, id: e.id }); if (Math.hypot(P.x - e.x, P.y - e.y) < def.slam + P.r) { hurtPlayer(e.dmg, 'boss', e.x, e.y); knockPlayer(e.x, e.y, 150); } } }
        else if (e.state === 'walk' && e.breathCd <= 0 && e.los && dist > 70 && dist < 240) { e.state = 'breath'; e.st = 1.0; e.da = ang; emit({ t: 'breathWarn', x: e.x, y: e.y, id: e.id }); }
        else if (e.state === 'breath') { canMove = false; e.atkT = 0.2; e.st -= dt; e.da = ang; if (e.st <= 0) { e.state = 'walk'; e.breathCd = e.hp < e.maxHp * 0.5 ? 4 : 6.5; const n = e.hp < e.maxHp * 0.5 ? 9 : 6; for (let i = 0; i < n; i++) { const a2 = e.da + (i - (n - 1) / 2) * 0.12 + (rng() - 0.5) * 0.05, sp2 = 80 + rng() * 40; g.spores.push({ x: e.x, y: e.y, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2, life: 2.8, dmg: e.dmg * 0.6, z: 3.2, fire: true }); } emit({ t: 'breath', x: e.x, y: e.y, ang: e.da, id: e.id }); } }
        if (!e.summoned && e.hp < e.maxHp * 0.5) { e.summoned = true; for (let i = 0; i < 4; i++) { const a2 = i * Math.PI / 2 + rng(), c = spawnEnemy('small1', e.x + Math.cos(a2) * 20, e.y + Math.sin(a2) * 20); c.ghost = false; } emit({ t: 'summon', x: e.x, y: e.y, id: e.id }); }
      }

      // contact attack / explosion
      const reach = e.r + P.r + 1.5;
      if (def.boom) { if (dist < reach + 6) { e.dead = true; explode(e.x, e.y, def.boom, e.dmg, 0); emit({ t: 'kill', x: e.x, y: e.y, type: e.type, color: def.color, boom: true, r: e.r, id: e.id, h: e.h }); g.kills++; return; } }
      else if (def.atk && !def.ranged) {
        e.atkCd -= dt;
        if (dist < reach && e.state !== 'slam' && e.state !== 'wind' && e.state !== 'breath') { canMove = false; if (e.atkCd <= 0) { e.atkCd = def.atk * (0.9 + rng() * 0.2); e.atkT = 0.5; hurtPlayer(e.dmg, e.type, e.x, e.y); emit({ t: 'bite', x: e.x, y: e.y, id: e.id }); } }
      }

      // moving: straight at the target when it can see it, otherwise down the path field
      if (e.state === 'break') e.state = 'walk';
      if (canMove) {
        let mx = 0, my = 0;
        if (direct) { const l = Math.hypot(tx - e.x, ty - e.y) || 1; mx = (tx - e.x) / l; my = (ty - e.y) / l; }
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
            if (bid >= 0 && map.barriers[bid].planks > 0 && Math.hypot(px - e.x, py - e.y) < 15) {       // a barricade in the way: tear the boards off
              const b = map.barriers[bid]; e.state = 'break'; e.barrier = bid; mx = my = 0;
              e.atkCd -= dt; e.atkT = Math.max(e.atkT, 0.15); if (e.atkCd <= 0) { e.atkCd = (e.boss ? 0.8 : 1.25) * (0.85 + rng() * 0.3); b.planks--; b.hit = 0.25; emit({ t: 'plank', x: (b.x + b.w / 2) * T, y: (b.y + b.h / 2) * T, planks: b.planks, id: b.id }); }
            }
          } else if (cur === 32767) { mx = dx / dist; my = dy / dist; e.ghost = e.ghost || g.sinceKill > 12; }
        }
        if (e.state !== 'break') { const sp2 = spd * dt; e.vx = mx * sp2; e.vy = my * sp2; move(e, e.vx, e.vy, e.ghost); }
      }
      // stuck check
      e.stuck += dt;
      if (e.stuck > 3) { if (Math.hypot(e.x - e.lx, e.y - e.ly) < 6 && e.state !== 'break' && dist > reach + 6 && e.state !== 'slam' && e.state !== 'wind' && e.state !== 'breath') { e.stuckN = (e.stuckN || 0) + 1; if (!e.boss || e.stuckN >= 3) e.ghost = true; } else e.stuckN = 0; e.lx = e.x; e.ly = e.y; e.stuck = 0; }
    }

    function updateProjectiles(dt) {
      for (let i = g.spores.length - 1; i >= 0; i--) {
        const s = g.spores[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (bulletSolid(Math.floor(s.x / T), Math.floor(s.y / T)) || s.life <= 0) { emit({ t: 'splash', x: s.x, y: s.y, fire: !!s.fire }); g.spores.splice(i, 1); continue; }
        if (Math.hypot(P.x - s.x, P.y - s.y) < P.r + 3.5 && (s.z == null || s.z > 0.2 && s.z < P.eye + 0.8)) { hurtPlayer(s.dmg, s.fire ? 'fire' : 'acid', s.x, s.y); emit({ t: 'splash', x: s.x, y: s.y, fire: !!s.fire }); g.spores.splice(i, 1); }
      }
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
        if (e.dead || e.ghost) continue;
        near(e.x, e.y, 14, (o) => {
          if (o === e || o.dead || o.id < e.id) return;
          const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 0.01, min = (e.r + o.r) * 0.85;
          if (d < min) { const k = (min - d) * 0.5 / d; move(e, -dx * k, -dy * k, e.ghost); move(o, dx * k, dy * k, o.ghost); }
        });
      }
      updateProjectiles(dt);
      updatePickups(dt);
      for (let i = g.enemies.length - 1; i >= 0; i--) if (g.enemies[i].dead) g.enemies.splice(i, 1);
      if (g.enemies.length > g.stats.maxAlive) g.stats.maxAlive = g.enemies.length;
      if (g.message && g.t - g.message.t > 2.2) g.message = null;
    };
    return g;
  };
})();
