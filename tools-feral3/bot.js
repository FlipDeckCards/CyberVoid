// A bot that plays Feral 3.0 (used by the Node balance test and, in a browser, to play through the real game). It kites, shoots the nearest creature and shops between rounds.
(function (root) {
  const D = root.DZF, K = D.K, T = D.T;
function bot(g, shop) {
  const P = g.player, map = g.map, W = map.w, tl = map.tiles;
  const walk = (k) => k === K.FLOOR || k === K.POCKET;
  let target = null;
  const dist = new Int16Array(W * map.h);
  function fieldTo(tx, ty) { dist.fill(32767); const q = [ty * W + tx]; dist[q[0]] = 0; let h = 0; while (h < q.length) { const c = q[h++], x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= map.h) continue; const n = ny * W + nx; if (dist[n] === 32767 && walk(tl[n])) { dist[n] = dist[c] + 1; q.push(n); } } } }
  function stepToward(tx, ty) { fieldTo(tx, ty); const cx = Math.floor(P.x / T), cy = Math.floor(P.y / T); let b = null, bd = dist[cy * W + cx]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const d = dist[(cy + dy) * W + cx + dx]; if (d < bd) { bd = d; b = [dx, dy]; } } return b ? { mx: b[0], my: b[1] } : { mx: 0, my: 0 }; }
  function standSpot(item) { // a floor tile next to the thing we want
    const spots = []; const [ax, ay, aw, ah] = item.rect;
    for (let y = ay - 1; y <= ay + ah; y++) for (let x = ax - 1; x <= ax + aw; x++) if (tl[y * W + x] === K.FLOOR) spots.push([x, y]);
    return spots.sort((a, b) => Math.hypot(a[0] * T - P.x, a[1] * T - P.y) - Math.hypot(b[0] * T - P.x, b[1] * T - P.y))[0];
  }
  return function decide() {
    const inp = { mx: 0, my: 0, aim: P.aim, pitch: 0, fire: false, reload: false, interactPressed: false, interactHeld: false };
    let ne = null, nd = 1e9, danger = 0, fx = 0, fy = 0;
    for (const e of g.enemies) { const d = Math.hypot(e.x - P.x, e.y - P.y) - e.r; if (d < nd) { nd = d; ne = e; } if (d < 70) { danger++; const w = 1 / (d * d + 20); fx -= (e.x - P.x) * w; fy -= (e.y - P.y) * w; } }
    if (ne) { inp.aim = Math.atan2(ne.y - P.y, ne.x - P.x); inp.pitch = Math.atan2(ne.h * 0.55 - P.eye, Math.max(1, nd + ne.r) / 8); if (nd < 170 && g.lineClear(P.x, P.y, ne.x, ne.y, (tx, ty) => g.kindAt(tx, ty) === K.WALL || g.kindAt(tx, ty) === K.BLOCK)) inp.fire = true; }
    // best weapon with ammo
    let bi = 0, bs = -1; P.weapons.forEach((w, i) => { const s = D.wstat(w), v = s.dmg * s.rate * s.pellets * (w.mag + w.reserve > 0 || s.infinite ? 1 : 0); if (v > bs) { bs = v; bi = i; } });
    if (bi !== P.cur && P.reload <= 0) inp.slot = bi;
    const w = P.weapons[P.cur]; if (w.mag < D.wstat(w).mag * 0.35 && nd > 60) inp.reload = true;
    if (danger) {   // kite: try 16 directions, keep the one that stays on open floor and ends furthest from the crowd
      let best = null, bsc = -1e9;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); let free = 0;
        for (let k = 1; k <= 8; k++) { if (g.solid(Math.floor((P.x + cs * k * 8) / T), Math.floor((P.y + sn * k * 8) / T))) break; free = k; }
        if (free < 2) continue;
        const qx = P.x + cs * Math.min(free, 5) * 8, qy = P.y + sn * Math.min(free, 5) * 8; let sc = free * 3;
        for (const e of g.enemies) { const d = Math.hypot(e.x - qx, e.y - qy); if (d < 140) sc += Math.min(d, 90) * (e.type === 'small2' || e.type === 'medium3' ? 1.4 : 1); }
        if (sc > bsc) { bsc = sc; best = [cs, sn]; }
      }
      if (best) { inp.mx = best[0]; inp.my = best[1]; }
    }
    else {
      // shopping
      if (!target) { for (const it of shop) { if (it.done) continue; if (g.points >= it.cost + (it.reserve || 0)) { target = it; break; } else break; } }
      if (target) {
        if (!target.spot) target.spot = standSpot(target);
        const sx = (target.spot[0] + .5) * T, sy = (target.spot[1] + .5) * T;
        if (Math.hypot(sx - P.x, sy - P.y) > 3) { P.x = sx; P.y = sy; target.tries = 0; target.before = null; return inp; }       // (the test bot shops by jumping to the shop: a person walks there in a few seconds)
        target.tries = (target.tries || 0) + 1; if (target.before == null) target.before = g.points;
        const t = g.prompt;
        if (g.points < target.before) { target.done = true; target = null; }
        else if (t && !t.info && t.kind !== 'repair' && g.points >= t.cost) inp.interactPressed = target.tries % 3 === 1;
        else if (target.tries > 30) { target.done = true; target = null; }
      } else { const home = stepToward(Math.floor(D.PLAYER_START[0]), Math.floor(D.PLAYER_START[1])); const d = Math.hypot((D.PLAYER_START[0] + .5) * T - P.x, (D.PLAYER_START[1] + .5) * T - P.y); if (d > 24) { inp.mx = home.mx * 0.7; inp.my = home.my * 0.7; } }
    }
    return inp;
  };
}
const SHOP_FULL = (map) => {
  const door = (id) => { const d = map.doors.find((x) => x.id === id); return { cost: d.cost, rect: [d.x, d.y, d.w, d.h] }; };
  const wall = (id) => { const w = map.wallbuys.find((x) => x.weapon === id); return { cost: D.WEAPONS[id].cost, rect: [w.x, w.y, 1, 1] }; };
  const mach = (id) => { const m = map.machines.find((x) => x.id === id); const cost = id === 'anvil' ? D.UPGRADE.cost : D.PERKS[id].cost; return { cost, rect: [m.x, m.y, 2, 1] }; };
  return [wall('shotgun'), mach('heart'), door(1), wall('rifle'), mach('boots'), door(2), mach('fizz'), wall('bolt'), door(3), mach('lamp'), wall('mg'), mach('anvil')];
};


  root.DZFBot = { bot, SHOP_FULL };
})(typeof window !== 'undefined' ? window : globalThis);
