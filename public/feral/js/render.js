// Dead Zone: Feral - drawing. The world is drawn at a small fixed height (270 pixels) and scaled up with hard pixels, which keeps it fast on phones and gives the chunky look.
(function () {
  const D = (window.DZF = window.DZF || {});
  const R = (D.render = {});
  const A = D.art, T = D.T, K = D.K;
  const TAU = Math.PI * 2;
  let cvs, ctx, VW = 480, VH = 270, world = null, darkMask = null, map = null;
  const cam = { x: 0, y: 0, shake: 0 };
  const parts = [], texts = [], flashes = [], rings = [];
  R.opts = { shake: true, numbers: true };
  R.size = () => ({ w: VW, h: VH });

  R.init = function (canvas) { cvs = canvas; ctx = canvas.getContext('2d', { alpha: false }); R.resize(); };
  R.resize = function () {
    const iw = window.innerWidth || 800, ih = window.innerHeight || 450, dpr = window.devicePixelRatio || 1;
    // whole-number scaling (each game pixel is exactly k device pixels), so the pixel art stays razor sharp on every screen; the height is as close to 270 as the screen allows
    let k = 1, best = 1e9; for (let c = 1; c <= 10; c++) { const h = Math.floor(ih * dpr / c), d = Math.abs(h - 270); if (h >= 200 && d < best) { best = d; k = c; } }
    VH = Math.floor(ih * dpr / k); VW = Math.floor(D.clamp(iw / ih, 1.45, 2.4) * VH); if (VW * k > iw * dpr) VW = Math.floor(iw * dpr / k);
    cvs.width = VW; cvs.height = VH;
    const sc = k / dpr; cvs.style.width = (VW * sc) + 'px'; cvs.style.height = (VH * sc) + 'px';
    R.scale = sc; R.cssW = VW * sc; R.cssH = VH * sc;
    ctx.imageSmoothingEnabled = false;
    // the darkness: a soft hole of light around the player
    darkMask = document.createElement('canvas'); darkMask.width = VW * 2; darkMask.height = VH * 2;
    const x = darkMask.getContext('2d'), g = x.createRadialGradient(VW, VH, 30, VW, VH, 190);
    g.addColorStop(0, 'rgba(8,4,20,0)'); g.addColorStop(0.5, 'rgba(8,4,20,0.28)'); g.addColorStop(1, 'rgba(8,4,20,0.62)');
    x.fillStyle = g; x.fillRect(0, 0, VW * 2, VH * 2);          // beyond the outer radius a radial gradient keeps its last (dark) colour
  };
  R.reset = function (m) { map = m; world = A.buildWorld(m, T); parts.length = 0; texts.length = 0; flashes.length = 0; rings.length = 0; cam.shake = 0; cam.init = false; };
  R.toWorld = (sx, sy) => ({ x: cam.x + sx / (R.scale || 1), y: cam.y + sy / (R.scale || 1) });
  R.toScreen = (wx, wy) => ({ x: (wx - cam.x) * (R.scale || 1), y: (wy - cam.y) * (R.scale || 1) });
  R.camera = cam;

  // ---------- effects from game events ----------
  function burst(x, y, color, n, spd, life, size, grav) {
    for (let i = 0; i < n && parts.length < 600; i++) { const a = Math.random() * TAU, s = spd * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, color, size: size || 1.5, grav: grav || 0 }); }
  }
  const CONF = ['#ff8ae6', '#7fe6ff', '#ffe27a', '#9dff8a', '#ff9a6a', '#b78cff'];
  function addText(x, y, text, color, big) { if (texts.length < 60) texts.push({ x, y, text, color, t: 0, big }); }
  R.shake = function (a) { if (R.opts.shake) cam.shake = Math.min(7, Math.max(cam.shake, a)); };
  R.fx = function (e, g) {
    switch (e.t) {
      case 'shot': { const w = D.WEAPONS[e.w]; burst(e.x + Math.cos(e.ang) * 3, e.y + Math.sin(e.ang) * 3, w.confetti ? '#fff' : w.color, w.pellets > 3 ? 5 : 2, 70, 0.14, 1.5); flashes.push({ x: e.x, y: e.y, r: 26, color: w.color, t: 0.07, max: 0.07 }); R.shake(e.shake * 0.7); if (w.confetti) for (let i = 0; i < 8; i++) parts.push({ x: e.x, y: e.y, vx: Math.cos(e.ang + (Math.random() - 0.5) * 0.8) * (80 + Math.random() * 120), vy: Math.sin(e.ang + (Math.random() - 0.5) * 0.8) * (80 + Math.random() * 120), life: 0.5, max: 0.5, color: CONF[(Math.random() * 6) | 0], size: 1.5, grav: 140 }); break; }
      case 'hit': { burst(e.x, e.y, e.color, e.kill ? 6 : 3, 60, 0.3, 1.6); if (R.opts.numbers) addText(e.x + (Math.random() - 0.5) * 6, e.y - 8, String(e.dmg), e.kill ? '#ffd84a' : '#ffffff', e.kill); break; }
      case 'kill': { burst(e.x, e.y, e.color, e.boss ? 40 : 10, e.boss ? 140 : 80, 0.55, 2, 60); burst(e.x, e.y, '#fff', 4, 50, 0.3, 1); if (!e.boom) rings.push({ x: e.x, y: e.y, r: 2, max: e.boss ? 40 : 14, t: 0, dur: 0.3, color: e.color }); if (e.boss) R.shake(6); break; }
      case 'split': burst(e.x, e.y, '#ffd37a', 6, 60, 0.25, 1.5); break;
      case 'spark': burst(e.x, e.y, e.color, 3, 40, 0.18, 1); break;
      case 'pop': burst(e.x, e.y, '#bff4ff', 10, 60, 0.3, 1.5); rings.push({ x: e.x, y: e.y, r: 3, max: 30, t: 0, dur: 0.22, color: '#7fe6ff' }); break;
      case 'boom': rings.push({ x: e.x, y: e.y, r: 4, max: e.nuke ? 260 : e.r, t: 0, dur: e.nuke ? 0.5 : 0.28, color: e.nuke ? '#ffffff' : '#ffb347', fill: true }); burst(e.x, e.y, '#ff9a3c', e.nuke ? 40 : 18, 140, 0.6, 2, 0); if (e.nuke) flashes.push({ screen: true, color: '#ffffff', t: 0.45, max: 0.45 }); R.shake(e.nuke ? 6 : 3.5); break;
      case 'hurt': flashes.push({ screen: true, color: '#ff2a4a', t: 0.28, max: 0.28, a: 0.38 }); R.shake(3); burst(e.x, e.y, '#ff5d8f', 8, 70, 0.4, 1.5); break;
      case 'repair': burst(e.x, e.y, '#d8b070', 5, 50, 0.25, 1.4); addText(e.x, e.y - 12, '+10', '#9dff8a'); break;
      case 'plank': burst(e.x, e.y, '#8a6440', 8, 80, 0.35, 1.6, 120); R.shake(0.8); break;
      case 'door': burst(e.x, e.y, '#d8b070', 30, 100, 0.8, 2, 80); R.shake(4); break;
      case 'pickup': burst(e.x, e.y, '#ffffff', 16, 90, 0.5, 1.5); rings.push({ x: e.x, y: e.y, r: 3, max: 36, t: 0, dur: 0.35, color: '#ffe27a' }); break;
      case 'revive': rings.push({ x: e.x, y: e.y, r: 4, max: 80, t: 0, dur: 0.6, color: '#ffa63d', fill: true }); flashes.push({ screen: true, color: '#ffe9a0', t: 0.4, max: 0.4, a: 0.5 }); break;
      case 'slam': rings.push({ x: e.x, y: e.y, r: 4, max: e.r + 6, t: 0, dur: 0.3, color: '#ffe27a', fill: true }); burst(e.x, e.y, '#8fb86e', 20, 110, 0.5, 2, 0); R.shake(5); break;
      case 'spit': burst(e.x, e.y, '#f9ff7a', 4, 40, 0.2, 1.2); break;
      case 'upgrade': burst(g.player.x, g.player.y, '#ffd84a', 30, 110, 0.7, 1.6, -40); R.shake(1.5); break;
      case 'drop': addText(e.x, e.y - 10, '!', '#ffe27a', true); break;
      case 'bossSpawn': case 'bigSpawn': rings.push({ x: e.x, y: e.y, r: 3, max: 50, t: 0, dur: 0.6, color: '#8fb86e', fill: true }); burst(e.x, e.y, '#6e8f5a', 24, 90, 0.7, 2, 40); R.shake(3); break;
      case 'bite': R.shake(1.2); break;
      case 'take': burst(g.player.x, g.player.y, '#fff6c0', 12, 80, 0.5, 1.6); break;
      case 'buy': burst(g.player.x, g.player.y - 4, '#ffe27a', 8, 60, 0.4, 1.4, -30); break;
    }
  };
  R.addPopup = function (x, y, text, color, big) { addText(x, y, text, color, big); };

  // ---------- drawing ----------
  const on = (x, y, m) => x > cam.x - m && x < cam.x + VW + m && y > cam.y - m && y < cam.y + VH + m;
  const sx = (v) => Math.round(v - cam.x), sy = (v) => Math.round(v - cam.y);
  function shadow(x, y, rx) { ctx.fillStyle = 'rgba(8,4,20,0.4)'; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), rx, rx * 0.45, 0, 0, TAU); ctx.fill(); }
  function glow(x, y, color, r, a) { ctx.globalAlpha = a == null ? 1 : a; const c = A.glowOf(color, r); ctx.drawImage(c, sx(x) - r, sy(y) - r); ctx.globalAlpha = 1; }

  function drawBarrier(b, t) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    if (!on(x + w / 2, y + h / 2, 60)) return;
    const horiz = w > h, shake = b.hit > 0 ? Math.sin(t * 90) * 1.2 : 0, X = sx(x), Y = sy(y);
    ctx.fillStyle = '#0c0816'; ctx.fillRect(X, Y, w, h);
    ctx.fillStyle = '#5a3c22'; if (horiz) { ctx.fillRect(X - 1, Y - 1, w + 2, 2); ctx.fillRect(X - 1, Y + h - 1, w + 2, 2); } else { ctx.fillRect(X - 1, Y - 1, 2, h + 2); ctx.fillRect(X + w - 1, Y - 1, 2, h + 2); }
    const n = b.max;
    for (let i = 0; i < b.planks; i++) {
      const slot = horiz ? w / n : h / n, off = i * slot + 0.5;
      ctx.fillStyle = i & 1 ? '#9a7444' : '#8a6440';
      if (horiz) { ctx.fillRect(Math.round(X + off + shake), Y + 1, Math.max(2, Math.floor(slot - 1)), h - 2); ctx.fillStyle = '#5a3c22'; ctx.fillRect(Math.round(X + off + shake), Y + 6, Math.max(2, Math.floor(slot - 1)), 1); }
      else { ctx.fillRect(X + 1, Math.round(Y + off + shake), w - 2, Math.max(2, Math.floor(slot - 1))); ctx.fillStyle = '#5a3c22'; ctx.fillRect(X + 6, Math.round(Y + off + shake), 1, Math.max(2, Math.floor(slot - 1))); }
    }
    if (b.planks === 0) { ctx.fillStyle = '#6a4a2a'; if (horiz) { ctx.fillRect(X + 2, Y + h - 3, 5, 2); ctx.fillRect(X + w - 8, Y + 1, 5, 2); } else { ctx.fillRect(X + w - 3, Y + 2, 2, 5); ctx.fillRect(X + 1, Y + h - 8, 2, 5); } }
  }

  R.draw = function (g, dt, ui) {
    const P = g.player, t = g.t;
    // camera
    const tx = P.x - VW / 2, ty = P.y - VH / 2 - 6;
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    const k = 1 - Math.pow(0.0005, dt); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.x = D.clamp(cam.x, 0, map.w * T - VW); cam.y = D.clamp(cam.y, 0, map.h * T - VH);
    cam.shake = Math.max(0, cam.shake - dt * 14);
    const ox = cam.shake ? (Math.random() - 0.5) * cam.shake : 0, oy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    const cxo = cam.x, cyo = cam.y; cam.x += ox; cam.y += oy;

    ctx.fillStyle = '#0b0715'; ctx.fillRect(0, 0, VW, VH);
    const cxr = Math.round(cam.x), cyr = Math.round(cam.y); cam.x = cxr; cam.y = cyr;
    ctx.drawImage(world, cxr, cyr, VW, VH, 0, 0, VW, VH);

    // doors still shut
    for (const d of map.doors) if (!d.open && on((d.x + d.w / 2) * T, (d.y + d.h / 2) * T, 80)) {
      ctx.drawImage(A.door(d.w, d.h, T), sx(d.x * T), sy(d.y * T));
      const lbl = A.text(String(d.cost), '#ffe27a'), lx = sx((d.x + d.w / 2) * T) - lbl.width / 2, ly = sy((d.y + d.h / 2) * T) - 3;
      ctx.fillStyle = 'rgba(10,6,20,0.8)'; ctx.fillRect(lx - 2, ly - 2, lbl.width + 4, lbl.height + 3); ctx.drawImage(lbl, Math.round(lx), Math.round(ly));
    }
    for (const b of map.barriers) drawBarrier(b, t);
    // wall posters
    for (const wb of map.wallbuys) { const wx = wb.x * T, wy = wb.y * T; if (!on(wx, wy, 40)) continue; ctx.drawImage(A.poster, sx(wx) - 1, sy(wy) - 1); const sp = A.weapon[wb.weapon]; ctx.drawImage(sp, sx(wx) - 1, sy(wy) + 1); const lbl = A.text(String(D.WEAPONS[wb.weapon].cost), g.points >= D.WEAPONS[wb.weapon].cost ? '#5a3a1a' : '#a02a2a'); ctx.drawImage(lbl, sx(wx) + 8 - Math.floor(lbl.width / 2), sy(wy) + 11); }
    // machines
    const lights = [];
    for (const m of map.machines) {
      const mx = m.x * T, my = (m.y + 1) * T; if (!on(mx, my, 60)) continue;
      let spr = A.machine[m.id];
      if (m.kind === 'box') spr = m.state === 'idle' ? A.machine.box : A.machine.boxOpen;
      if (m.kind === 'anvil') spr = A.machine.anvil;
      ctx.drawImage(spr, sx(mx) - 1, sy(my) - spr.height + 3);
      if (m.kind === 'perk') { const pk = D.PERKS[m.id], own = g.player.perks[m.id]; ctx.drawImage(A.icon.perk[m.id], sx(mx) + 9, sy(my) - 15); if (!own) { const lbl = A.text(String(pk.cost), g.points >= pk.cost ? '#ffe27a' : '#ff7a7a'); ctx.drawImage(lbl, sx(mx) + 16 - Math.floor(lbl.width / 2), sy(my) - 2); } lights.push([mx + 16, my - 10, pk.color, 22, own ? 0.25 : 0.7]); }
      else if (m.kind === 'box') {
        if (m.state === 'idle') { const lbl = A.text(String(D.BOX.cost), g.points >= D.BOX.cost ? '#ffe27a' : '#ff7a7a'); ctx.drawImage(lbl, sx(mx) + 16 - Math.floor(lbl.width / 2), sy(my) - 22); lights.push([mx + 16, my - 8, '#ffd24a', 24, 0.5]); }
        else {
          const ids = D.BOX_POOL, wid = m.state === 'spin' ? ids[Math.floor(t * 12) % ids.length] : m.weapon, bob = Math.sin(t * 6) * 1.5;
          ctx.drawImage(A.weapon[wid], sx(mx) + 8, sy(my) - 28 + bob); lights.push([mx + 16, my - 20, '#fff6c0', 30, 0.9]);
          if (m.state === 'ready' && (Math.floor(t * 4) & 1)) ctx.fillStyle = '#fff6c0', ctx.fillRect(sx(mx) + 14, sy(my) - 30, 4, 1);
        }
      } else if (m.kind === 'anvil') { const lbl = A.text(String(D.UPGRADE.cost), g.points >= D.UPGRADE.cost ? '#ffe27a' : '#ff7a7a'); ctx.drawImage(lbl, sx(mx) + 16 - Math.floor(lbl.width / 2), sy(my) - 2); lights.push([mx + 16, my - 14, '#ffd84a', 24, 0.45 + Math.sin(t * 5) * 0.15]); }
    }

    // pickups
    for (const p of g.pickups) {
      if (!on(p.x, p.y, 20)) continue;
      if (p.life < 6 && (Math.floor(t * 8) & 1)) continue;
      const bob = Math.sin(t * 4 + p.id) * 1.6; shadow(p.x, p.y + 6, 5);
      ctx.drawImage(A.icon.power[p.type], sx(p.x) - 8, sy(p.y) - 8 + bob); lights.push([p.x, p.y, D.POWERUPS[p.type].color, 22, 0.9]);
    }

    // creatures and the player, back to front
    const list = []; for (const e of g.enemies) if (!e.dead && on(e.x, e.y, 40)) list.push(e); list.push(P);
    list.sort((a, b) => a.y - b.y);
    for (const o of list) { if (o === P) drawPlayer(g, t); else drawEnemy(o, t, g); }

    // shots
    for (const b of g.bullets) {
      if (!on(b.x, b.y, 8)) continue;
      if (b.kind === 'bubble') { const r = 4 + Math.sin(b.wob) * 0.6; ctx.strokeStyle = '#d8fbff'; ctx.fillStyle = 'rgba(127,230,255,0.4)'; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(sx(b.x) - 2, sy(b.y) - 2, 1, 1); }
      else if (b.confetti) { ctx.fillStyle = CONF[(b.born * 100 + (b.x | 0)) % 6 | 0]; ctx.fillRect(sx(b.x), sy(b.y), 2, 2); }
      else { ctx.strokeStyle = b.color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sx(b.x - b.vx * 0.022), sy(b.y - b.vy * 0.022)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(sx(b.x) - 1, sy(b.y) - 1, 2, 2); }
    }
    for (const s of g.spores) { if (!on(s.x, s.y, 8)) continue; ctx.fillStyle = '#f9ff7a'; ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), 2.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(sx(s.x), sy(s.y) - 1, 1, 1); lights.push([s.x, s.y, '#f9ff7a', 12, 0.7]); }
    for (const b of g.beams) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4 * (b.t / 0.09); ctx.beginPath(); ctx.moveTo(sx(b.x0), sy(b.y0)); ctx.lineTo(sx(b.x1), sy(b.y1)); ctx.stroke(); ctx.strokeStyle = b.color; ctx.lineWidth = 5 * (b.t / 0.09); ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1; }

    // particles and rings
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.vx *= 1 - dt * 2.2; p.vy *= p.grav ? 1 : 1 - dt * 2.2;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6); ctx.fillStyle = p.color; ctx.fillRect(sx(p.x), sy(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; if (r.t >= r.dur) { rings.splice(i, 1); continue; }
      const k = r.t / r.dur, rad = r.r + (r.max - r.r) * (1 - Math.pow(1 - k, 2));
      ctx.globalAlpha = (1 - k) * (r.fill ? 0.5 : 0.9); ctx.strokeStyle = r.color; ctx.lineWidth = r.fill ? 3 : 1.6; ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), rad, 0, TAU); ctx.stroke();
      if (r.fill) { ctx.globalAlpha *= 0.4; ctx.fillStyle = r.color; ctx.fill(); } ctx.globalAlpha = 1;
    }
    // the boss' slam warning
    for (const e of g.enemies) if (e.state === 'slam' && !e.dead) { const k = 1 - e.st / 0.85; ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), e.def.slam, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,60,60,' + (0.12 + k * 0.28) + ')'; ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), e.def.slam * k, 0, TAU); ctx.fill(); }

    // darkness, then light
    ctx.drawImage(darkMask, Math.round(P.x - cam.x) - VW, Math.round(P.y - cam.y) - VH);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of A.lights) if (on(l.x, l.y, 40)) { ctx.globalAlpha = 0.55 + Math.sin(t * 3 + l.x) * 0.08; ctx.drawImage(A.glowOf(l.color, l.r), sx(l.x) - l.r, sy(l.y) - l.r); }
    for (const l of lights) { ctx.globalAlpha = l[4]; ctx.drawImage(A.glowOf(l[2], l[3]), sx(l[0]) - l[3], sy(l[1]) - l[3]); }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t -= dt; if (f.t <= 0) { flashes.splice(i, 1); continue; } if (f.screen) continue; ctx.globalAlpha = f.t / f.max; ctx.drawImage(A.glowOf(f.color, f.r), sx(f.x) - f.r, sy(f.y) - f.r); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // floating numbers
    for (let i = texts.length - 1; i >= 0; i--) {
      const q = texts[i]; q.t += dt; if (q.t > 0.8) { texts.splice(i, 1); continue; }
      const c = A.text(q.text, q.color), yy = q.y - q.t * 22 - (q.big ? 4 : 0); ctx.globalAlpha = Math.min(1, (0.8 - q.t) * 3);
      const s = q.big ? 1 : 1; ctx.drawImage(c, Math.round(sx(q.x) - c.width / 2), Math.round(sy(yy)), c.width * s, c.height * s); ctx.globalAlpha = 1;
    }
    // screen tints
    for (const f of flashes) if (f.screen) { ctx.globalAlpha = (f.a || 1) * (f.t / f.max) * (f.a ? 1 : 0.9); ctx.fillStyle = f.color; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (g.powers.zap > 0) { ctx.globalAlpha = 0.06 + Math.sin(t * 10) * 0.03; ctx.fillStyle = '#b78cff'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (P.hp < P.maxHp * 0.3 && !g.over) { const a = 0.18 + Math.sin(t * 6) * 0.07; const gr = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85); gr.addColorStop(0, 'rgba(160,0,30,0)'); gr.addColorStop(1, 'rgba(160,0,30,' + a + ')'); ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH); }
    cam.x = cxo; cam.y = cyo; void ui;
  };

  function drawEnemy(e, t, g) {
    const def = e.def, T0 = e.type;
    let spr;
    const fr = Math.floor(e.anim) & 3;
    if (T0 === 'glumpkin') spr = A.glump[e.size][fr];
    else if (T0 === 'zapling') spr = A.zap[e.state === 'wind' ? 4 : e.state === 'dash' ? 5 : fr];
    else if (T0 === 'wisper') spr = A.wisp[fr];
    else if (T0 === 'mossmaw') spr = A.moss[fr];
    else if (T0 === 'elder') spr = A.elder[fr];
    else if (T0 === 'boomkit') spr = A.boom[fr];
    else spr = A.spit[e.dash < 0.3 ? 2 : fr];
    const hover = T0 === 'wisper' ? Math.sin(e.anim * 1.2) * 2 - 4 : 0;
    if (T0 !== 'wisper') shadow(e.x, e.y + e.r * 0.6, e.r * 0.95); else shadow(e.x, e.y + 8, 5);
    const X = sx(e.x), Y = sy(e.y + e.r * 0.78 + hover), w = spr.width, h = spr.height;
    ctx.save(); ctx.translate(X, Y); if (e.face < 0) ctx.scale(-1, 1);
    if (T0 === 'wisper') ctx.globalAlpha = 0.82; else if (e.ghost && !def.ghost) ctx.globalAlpha = 0.65;
    ctx.drawImage(spr, Math.round(-w / 2), -h);
    if (e.slowT > 0) { ctx.globalAlpha = 0.55; ctx.drawImage(A.tinted(spr, '#7fe6ff', 0.55), Math.round(-w / 2), -h); }
    if (e.flash > 0) { ctx.globalAlpha = 0.9; ctx.drawImage(A.flash(spr), Math.round(-w / 2), -h); }
    else if (T0 === 'boomkit' && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 60 && (Math.floor(t * 10) & 1)) { ctx.globalAlpha = 0.6; ctx.drawImage(A.tinted(spr, '#ff2a2a', 0.8), Math.round(-w / 2), -h); }
    else if (e.state === 'wind' && (Math.floor(t * 16) & 1)) { ctx.globalAlpha = 0.7; ctx.drawImage(A.flash(spr), Math.round(-w / 2), -h); }
    ctx.restore(); ctx.globalAlpha = 1;
    if (e.boss) { /* the boss bar is in the HUD */ }
    else if (e.hp < e.maxHp && e.maxHp > 60 && def.heavy) { const bw = 14; ctx.fillStyle = '#150a26'; ctx.fillRect(X - bw / 2 - 1, Y - h - 3, bw + 2, 4); ctx.fillStyle = '#ff5d6a'; ctx.fillRect(X - bw / 2, Y - h - 2, Math.max(1, bw * e.hp / e.maxHp), 2); }
  }

  function drawPlayer(g, t) {
    const P = g.player, moving = P.moving, fr = moving ? Math.floor(P.bob * 0.55) & 3 : 4, spr = A.pip[fr];
    shadow(P.x, P.y + 6, 5.5);
    const blink = P.invuln > 0 && (Math.floor(t * 20) & 1);
    const X = sx(P.x), Y = sy(P.y + 8 + (moving ? 0 : Math.sin(t * 3) * 0.4));
    const cs = Math.cos(P.aim), sn = Math.sin(P.aim), wid = P.weapons[P.cur].id, up = P.weapons[P.cur].up, gun = up ? A.weaponUp[wid] : A.weapon[wid];
    const drawGun = () => { ctx.save(); ctx.translate(X + cs * (4 - P.recoil), Y - 11 + sn * 4 - P.recoil * sn); ctx.rotate(P.aim); if (cs < 0) ctx.scale(1, -1); ctx.drawImage(gun, -3, -6); ctx.restore(); };
    const behind = sn < -0.3;                       // aiming up: the gun is behind the body
    if (blink) ctx.globalAlpha = 0.45;
    if (behind) drawGun();
    ctx.save(); ctx.translate(X, Y); if (P.face < 0) ctx.scale(-1, 1); ctx.drawImage(spr, -9, -24); if (P.invuln > 0.25 && !blink) { ctx.globalAlpha = 0.6; ctx.drawImage(A.flash(spr), -9, -24); } ctx.restore();
    if (!behind) drawGun();
    ctx.globalAlpha = 1;
    // reload ring
    if (P.reload > 0) { const k = 1 - P.reload / (P.reloadTotal || 1); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y - 11, 10, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke(); }
    // aim dots
    if (g.aimDots) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 1; i <= 3; i++) ctx.fillRect(Math.round(X + cs * (22 + i * 9)), Math.round(Y - 11 + sn * (22 + i * 9)), 1, 1); }
  }
})();
