// Feral 2.0 - menus, HUD, mini-map, damage indicators and settings (plain DOM). Menus work with touch, mouse, keyboard or a controller.
(function () {
  const D = (window.DZF = window.DZF || {});
  const UI = (D.ui = {});
  const A = D.art, I = D.input, AU = D.audio;
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { master: 0.8, music: 0.5, sfx: 0.9, muted: false, fov: 76, mouseSens: 1, padSens: 1, touchSens: 1, invertY: false, invertYpad: false, aimAssist: true, shake: true, numbers: true, minimap: true, quality: 'auto' };
  UI.settings = Object.assign({}, DEFAULTS, D.store.get('dzf2_settings', {}));
  UI.current = null; UI.onAction = null; let focusIdx = 0, prevScreen = null;
  UI.save = () => D.store.set('dzf2_settings', UI.settings);
  UI.autoQuality = function () {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches, small = Math.min(screen.width, screen.height) < 700, cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
    if (coarse || small) return (cores >= 8 && mem >= 6) ? 'medium' : 'low';
    return cores <= 4 ? 'medium' : 'high';
  };
  UI.effectiveQuality = () => (UI.settings.quality === 'auto' ? UI.autoQuality() : UI.settings.quality);
  UI.applySettings = function () {
    const s = UI.settings;
    AU.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
    D.render.opts.shake = s.shake; D.render.opts.numbers = s.numbers;
    I.settings.mouseSens = s.mouseSens; I.settings.padSens = s.padSens; I.settings.touchSens = s.touchSens; I.settings.invertY = s.invertY; I.settings.invertYpad = s.invertYpad;
    $('bMute').innerHTML = s.muted ? '&#128263;' : '&#128266;';
    $('mini').classList.toggle('hidden', !s.minimap);
    if (D.render.ready) { D.render.auto = s.quality === 'auto'; const q = UI.effectiveQuality(); if (q !== D.render.qname) D.render.setQuality(q); if (D.render.q) D.render.q.fov = s.fov; }
    document.querySelectorAll('[data-sel]').forEach((b) => { b.textContent = s[b.dataset.sel]; });
  };

  // ---------- screens ----------
  const items = () => [].slice.call(document.querySelectorAll('#' + UI.current + ' .btn, #' + UI.current + ' .set')).filter((e) => e.offsetParent !== null);
  function setFocus(i) { const list = items(); if (!list.length) return; focusIdx = (i + list.length) % list.length; list.forEach((e, k) => e.classList.toggle('focus', k === focusIdx)); const f = list[focusIdx]; if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); }
  UI.show = function (name) {
    prevScreen = UI.current;
    document.querySelectorAll('#screens .screen').forEach((s) => s.classList.toggle('on', s.id === name));
    UI.current = name; I.setBlock(!!name); document.body.classList.toggle('menu', !!name);
    if (name) { focusIdx = 0; refreshAll(); setFocus(0); }
  };
  UI.hide = function () { document.querySelectorAll('#screens .screen').forEach((s) => s.classList.remove('on')); UI.current = null; I.setBlock(false); document.body.classList.remove('menu'); };
  UI.previous = () => prevScreen;
  function stepSel(b, dir) { const opts = b.dataset.opts.split(','), k = b.dataset.sel; let i = opts.indexOf(UI.settings[k]); i = (i + dir + opts.length) % opts.length; UI.settings[k] = opts[i]; UI.save(); UI.applySettings(); }
  UI.menuKey = function (k) {
    if (!UI.current) return;
    const list = items(), f = list[focusIdx];
    if (k === 'up') setFocus(focusIdx - 1); else if (k === 'down') setFocus(focusIdx + 1);
    else if (k === 'left' || k === 'right') {
      if (f && f.classList.contains('set')) {
        const r = f.querySelector('input[type=range]'), t = f.querySelector('.tog'), s = f.querySelector('.sel');
        if (r) { const st = r.dataset.scale === '1' ? 4 : 10; r.value = D.clamp(+r.value + (k === 'left' ? -st : st), +r.min, +r.max); r.dispatchEvent(new Event('input')); } else if (t) t.click(); else if (s) stepSel(s, k === 'left' ? -1 : 1);
      } else setFocus(focusIdx + (k === 'left' ? -1 : 1));
    } else if (k === 'ok') { if (f) { const t = f.querySelector && f.querySelector('.tog'), s = f.querySelector && f.querySelector('.sel'); if (f.classList.contains('set')) { if (t) t.click(); else if (s) stepSel(s, 1); } else f.click(); AU.sfx('click'); } }
    else if (k === 'back') { if (UI.onAction) UI.onAction(UI.current === 'sMenu' ? 'none' : UI.current === 'sPause' ? 'resume' : UI.current === 'sOver' ? 'menu' : UI.current === 'sConfirm' ? 'quitNo' : 'back'); }
    if (k !== 'ok') AU.sfx('tick');
  };

  // ---------- content ----------
  const urls = {}; const frame = (n) => urls[n] || (urls[n] = A.frameURL(n, 'idle'));
  function buildHow() {
    const en = (id, nm, tx) => '<div class="card"><img src="' + frame(id) + '" alt=""><div><b>' + nm + '</b><small>' + tx + '</small></div></div>';
    const pu = (id, tx) => '<div class="card"><img src="' + A.pickups[id].url + '" alt=""><div><b>' + D.POWERUPS[id].name + '</b><small>' + tx + '</small></div></div>';
    const pk = (id, tx) => '<div class="card"><img src="' + A.perks[id].url + '" alt=""><div><b>' + D.PERKS[id].name + ' (' + D.PERKS[id].cost + ')</b><small>' + tx + '</small></div></div>';
    $('howBody').innerHTML =
      '<h3 style="margin-top:0">The goal</h3><p>Pip\'s barn is under siege. The cute creatures of Mossy Hollow have gone <b>feral</b> and they come in <b>endless rounds</b>, each bigger and tougher than the last. Stay alive as long as you can. Every fifth round an <b>Elder Mossmaw</b> shows up. You see it all from the first person: look around, keep your back to a wall, and keep moving.</p>' +
      '<h3>Earn and spend points</h3><p>You get points for every hit, every beaten creature and every repaired window board. Spend them on things you can <b>use</b> (the <b>USE</b> button, or the key shown in the prompt):</p>' +
      '<div class="how-grid">' +
        '<div class="card"><div><b>Doors</b><small>Open a door to unlock a new area: the Pumpkin Patch, Old Mill, Crypt Garden and Lantern Pond. More area, more guns, more danger.</small></div></div>' +
        '<div class="card"><div><b>Wall guns</b><small>Walk up to a poster to buy a gun. Buy it again for half price to refill its ammo.</small></div></div>' +
        '<div class="card"><div><b>Wobble Chest (' + D.BOX.cost + ')</b><small>A random gun, some of them very silly. Take it before the lid closes.</small></div></div>' +
        '<div class="card"><div><b>Sparkle Anvil (' + D.UPGRADE.cost + ')</b><small>Makes your current gun Gilded: more damage, bigger magazine, more ammo.</small></div></div>' +
      '</div>' +
      '<h3>Perks</h3><div class="how-grid">' + pk('heart', '+50 max health.') + pk('fizz', 'Reload twice as fast.') + pk('boots', 'Run faster.') + pk('lamp', 'One extra life: you get back up once.') + '</div>' +
      '<h3>Windows</h3><p>Creatures break in through the boarded windows. Stand in front of a broken window and <b>hold USE</b> to nail the boards back for points. A creature chewing on a window is not chewing on you. The <b>mini-map</b> in the corner shows windows (red = broken), doors and creatures close by, so nothing sneaks up from behind.</p>' +
      '<h3>Power-ups</h3><p>Beaten creatures sometimes drop one. Grab it before it fades.</p><div class="how-grid">' + pu('ammo', 'Refills every gun.') + pu('twin', 'Double points for 30 seconds.') + pu('boom', 'Beats every creature on screen. +400 points.') + pu('zap', 'Every hit beats a creature for 30 seconds.') + '</div>' +
      '<h3>The ferals</h3><div class="how-grid">' +
        en('glumpkin', 'Glumpkin', 'A slow pumpkin blob. Hit it and it splits in two.') + en('zapling', 'Zapling', 'A twitchy sprout. Watch for its sudden dash.') +
        en('wisper', 'Wisper', 'A ghost that floats straight through walls.') + en('mossmaw', 'Mossmaw', 'A big mossy tank. Bring the big guns.') +
        en('boomkit', 'Boomkit', 'Runs at you and goes off. Shoot it early.') + en('spitbud', 'Spitbud', 'Stays back and spits glowing spores. Strafe!') + en('elder', 'Elder Mossmaw', 'The boss of every fifth round. Mind the red stomp circle.') +
      '</div>' +
      '<h3>Tips</h3><p>Sprint to get out of trouble (it does not make you shoot better). Shots go where the crosshair points, up and down do not matter, like the old shooters. Repair windows between waves. Open the next area before you run out of room, but not before you have a good gun. Reload while nothing is close.</p>';
  }
  function buildControls() {
    const row = (a, b) => '<div><span>' + a + '</span><span>' + b + '</span></div>';
    $('ctlHelp').innerHTML =
      '<div><h4>Keyboard and mouse</h4>' + row('Move', 'W A S D') + row('Look', 'Mouse (click to capture)') + row('Shoot', 'Left click') + row('Zoom', 'Right click') + row('Sprint', 'Shift') + row('Reload', 'R') + row('Buy / use / repair', 'E (hold to repair)') + row('Swap gun', 'Q, mouse wheel, 1 2 3') + row('Pause', 'Esc') + '</div>' +
      '<div><h4>PlayStation controller</h4>' + row('Move', 'Left stick') + row('Look', 'Right stick') + row('Shoot', 'R2') + row('Zoom', 'L2') + row('Sprint', 'L3 (press the stick)') + row('Reload', '□ Square') + row('Buy / use / repair', '✕ Cross (hold to repair)') + row('Swap gun', '△ Triangle (or L1 / R1)') + row('Pause', 'Options') + '</div>' +
      '<div><h4>Touch (landscape)</h4>' + row('Move', 'Left side: drag') + row('Sprint', 'Push the stick all the way') + row('Look', 'Right side: drag') + row('Shoot', 'FIRE button') + row('Reload', 'RELOAD button') + row('Buy / use / repair', 'USE button') + row('Swap gun', 'SWAP button') + row('Pause', 'II button') + '</div>';
  }
  function refreshAll() {
    const s = UI.settings;
    for (const k of ['master', 'music', 'sfx', 'mouseSens', 'padSens', 'touchSens']) { const r = document.querySelector('[data-set="' + k + '"]'); if (r) { r.value = Math.round(s[k] * 100); $('o' + k[0].toUpperCase() + k.slice(1)).textContent = r.value + '%'; } }
    { const r = document.querySelector('[data-set="fov"]'); r.value = s.fov; $('oFov').textContent = s.fov + '°'; }
    document.querySelectorAll('[data-tog]').forEach((t) => t.classList.toggle('on', !!s[t.dataset.tog]));
    document.querySelectorAll('[data-sel]').forEach((b) => { b.textContent = s[b.dataset.sel] + (s[b.dataset.sel] === 'auto' ? ' (' + UI.autoQuality() + ')' : ''); });
    const best = D.store.get('dzf2_best', null);
    $('hiscore').textContent = best ? 'Best: round ' + best.round + ' · ' + best.kills + ' creatures · ' + best.points + ' points' : 'No high score yet. Go set one!';
    updatePadHint();
  }
  function updatePadHint() {
    const el = $('padHint'); if (!el) return;
    if (I.padConnected) el.textContent = (I.padType === 'ps' ? 'PlayStation controller connected: ' : 'Controller connected: ') + I.glyph('ok') + ' select, ' + I.glyph('back') + ' back';
    else if (document.body.classList.contains('touch')) el.textContent = '';
    else el.textContent = 'Press any button on your controller to connect it';
  }
  UI.refreshGlyphs = updatePadHint;

  // ---------- HUD ----------
  const cache = {};
  const setText = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
  const setHtml = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).innerHTML = v; } };
  UI.hud = (on) => $('hud').classList.toggle('hidden', !on);
  UI.touch = (on) => { $('touch').classList.toggle('hidden', !on); document.body.classList.toggle('touch', !!on); };
  UI.updateHud = function (g) {
    const P = g.player, w = P.weapons[P.cur], s = D.wstat(w), art = A.weapons[w.id];
    setText('hPts', String(Math.floor(g.points)));
    $('hPtsX').classList.toggle('on', g.powers.twin > 0);
    const hpf = Math.max(0, P.hp / P.maxHp * 100); if (cache.hp !== Math.round(hpf)) { cache.hp = Math.round(hpf); $('hHpFill').style.width = hpf + '%'; }
    setText('hHp', Math.ceil(P.hp) + ' / ' + P.maxHp);
    setText('hRound', 'ROUND ' + Math.max(1, g.round));
    setText('hSub', g.state === 'intermission' ? (g.round === 0 ? 'Get ready... ' + Math.ceil(g.timer) : 'Next round in ' + Math.ceil(g.timer) + ' - repair windows, buy things') : g.toSpawn + g.enemies.length + ' creatures left');
    setText('hMag', String(w.mag)); $('hMag').classList.toggle('low', w.mag <= Math.max(2, s.mag * 0.25));
    setText('hRes', s.infinite ? ' / ∞' : ' / ' + w.reserve);
    setText('hWpnName', s.name); $('hWpnName').classList.toggle('gold', !!w.up);
    const wk = 'w' + w.id; if (cache.wk !== wk) { cache.wk = wk; $('hWpnImg').src = art.icon.url; }
    $('hReload').classList.toggle('hidden', !(P.reload > 0));
    setHtml('hSlots', P.weapons.map((x, i) => '<i class="' + (i === P.cur ? 'cur' : '') + '"><img src="' + A.weapons[x.id].icon.url + '" alt=""></i>').join(''));
    setHtml('hPerks', Object.keys(P.perks).filter((k) => P.perks[k]).map((k) => '<img src="' + A.perks[k].url + '" alt="' + D.PERKS[k].name + '" title="' + D.PERKS[k].name + '">').join(''));
    const pw = []; for (const k of ['twin', 'zap']) if (g.powers[k] > 0) { const d = D.POWERUPS[k]; pw.push('<div class="pw" style="border-color:' + d.color + '"><img src="' + A.pickups[k].url + '" alt=""><span>' + Math.ceil(g.powers[k]) + '</span></div>'); } setHtml('hPowers', pw.join(''));
    const boss = g.enemies.find((e) => e.boss);
    $('hBoss').classList.toggle('hidden', !boss); if (boss) { const f = Math.max(0, boss.hp / boss.maxHp * 100); if (cache.bf !== Math.round(f)) { cache.bf = Math.round(f); $('hBossFill').style.width = f + '%'; } }
    const p = g.prompt, el = $('prompt'), rb = $('repairBar');
    if (!p) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); rb.classList.add('hidden'); $('tUse').className = 'tbtn'; setText('tUse', 'USE'); }
    else {
      el.classList.remove('hidden');
      const afford = g.points >= (p.cost || 0), info = !!p.info;
      el.className = info ? 'info' : afford ? '' : 'no';
      $('pKey').textContent = p.hold ? 'Hold ' + I.glyph('use') : I.glyph('use');
      setText('pText', p.label); setText('pCost', p.cost ? (afford ? p.cost : p.cost + ' (need ' + Math.ceil(p.cost - g.points) + ' more)') : '');
      $('tUse').className = 'tbtn ' + (info ? '' : afford ? 'ready' : 'no');
      setText('tUse', info ? 'USE' : { door: 'OPEN', wall: 'BUY', perk: 'BUY', box: 'BOX', take: 'TAKE', anvil: 'UPGRADE', repair: 'FIX' }[p.kind] || 'USE');
      if (p.kind === 'repair') { rb.classList.remove('hidden'); rb.firstElementChild.style.width = (p.b.planks / p.b.max * 100) + '%'; } else rb.classList.add('hidden');
    }
    if (g.message && cache.msgT !== g.message.t) { cache.msgT = g.message.t; UI.toast(g.message.text); }
  };
  let toastT = null;
  UI.toast = function (text) { const t = $('toast'); t.textContent = text; t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1800); };
  UI.banner = function (html, boss) { const b = $('banner'); b.className = boss ? 'boss' : ''; b.innerHTML = html; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(UI._bt); UI._bt = setTimeout(() => b.classList.add('hidden'), 2300); };
  UI.hint = function (text, ms) { const h = $('hint'); if (!text) { h.classList.add('hidden'); return; } h.textContent = text; h.classList.remove('hidden'); clearTimeout(UI._ht); UI._ht = setTimeout(() => h.classList.add('hidden'), ms || 7000); };
  UI.lockHint = (on) => $('lockHint').classList.toggle('hidden', !on);
  UI.controlsHint = function () {
    const g = I.glyph;
    if (I.last === 'touch') return 'Left side: move  ·  Right side: look  ·  FIRE, RELOAD, USE, SWAP buttons';
    if (I.last === 'pad') return 'Left stick move  ·  Right stick look  ·  ' + g('shoot') + ' shoot  ·  ' + g('zoom') + ' zoom  ·  ' + g('reload') + ' reload  ·  ' + g('use') + ' use  ·  ' + g('swap') + ' swap  ·  ' + g('sprint') + ' sprint';
    return 'WASD move  ·  Mouse look  ·  Click shoot  ·  Shift sprint  ·  R reload  ·  E use (hold to repair)  ·  Q / wheel swap';
  };
  UI.gameOver = function (g) {
    const best = D.store.get('dzf2_best', null), now = { round: g.round, kills: g.kills, points: Math.floor(g.points) };
    const isBest = !best || now.round > best.round || (now.round === best.round && now.points > best.points);
    if (isBest) D.store.set('dzf2_best', now);
    $('oRound').textContent = now.round; $('oKills').textContent = now.kills; $('oPts').textContent = now.points;
    $('oBest').textContent = isBest ? 'New high score!' : 'Best: round ' + best.round + ' · ' + best.kills + ' creatures · ' + best.points + ' points';
    UI.show('sOver');
  };

  // ---------- screen effects: damage vignette, directional hurt arcs, hit marker, damage numbers ----------
  const vig = () => $('vig'), flashEl = () => $('flash');
  let hurtV = 0, indIdx = 0, flashV = 0;
  UI.hurt = function (g, e) {
    hurtV = Math.min(1, hurtV + 0.35 + e.dmg / 60);
    if (e.sx != null) {
      const P = g.player, rel = Math.atan2(e.sy - P.y, e.sx - P.x) - P.aim, deg = rel * 180 / Math.PI + 90;      // the arc is drawn at the top: 0 degrees = straight ahead
      const box = $('dmgInd'); let el = box.children[indIdx % 6]; if (!el) { el = document.createElement('i'); box.appendChild(el); }
      indIdx++; el.style.transition = 'none'; el.style.transform = 'rotate(' + (deg - 90) + 'deg)'; el.style.opacity = '1'; void el.offsetWidth; el.style.transition = 'opacity 1.3s ease-out'; el.style.opacity = '0';
    }
  };
  UI.screenFlash = function (color) { flashEl().style.background = color || '#fff'; flashV = 0.55; };
  UI.updateFx = function (g, dt) {
    hurtV = Math.max(0, hurtV - dt * 0.9); let low = 0;
    if (g && !g.over) { const f = g.player.hp / g.player.maxHp; if (f < 0.35) low = (0.35 - f) / 0.35 * (0.55 + 0.25 * Math.sin(performance.now() / 180)); }
    if (g && g.over) low = 0.9;
    vig().style.opacity = Math.min(1, hurtV * 0.9 + low).toFixed(3);
    flashV = Math.max(0, flashV - dt * 1.8); flashEl().style.opacity = flashV.toFixed(3);
  };
  UI.clearFx = function () { hurtV = 0; flashV = 0; vig().style.opacity = '0'; flashEl().style.opacity = '0'; for (const el of $('dmgInd').children) el.style.opacity = '0'; $('nums').innerHTML = ''; };
  UI.hitMarker = function (kill) { const h = $('hitm'); h.className = ''; void h.offsetWidth; h.className = 'on' + (kill ? ' kill' : ''); };
  UI.setCross = function (target, zoom) { const c = $('cross'); c.classList.toggle('target', !!target); c.classList.toggle('zoom', !!zoom); };
  UI.num = function (x, y, text, kill) {
    const box = $('nums'); if (box.children.length > 14) box.removeChild(box.firstChild);
    const b = document.createElement('b'); b.textContent = text; b.style.left = (x + (Math.random() - 0.5) * 26) + 'px'; b.style.top = y + 'px'; if (kill) b.className = 'kill'; box.appendChild(b); setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 720);
  };

  // ---------- mini-map ----------
  let base = null, baseCtx = null, miniCtx = null; const MK = 4;
  const ROOMC = { barn: '#7a5a3a', patch: '#3a6a44', mill: '#6a5a68', crypt: '#4a5a6a', pond: '#5a6a7a' };
  UI.buildMini = function (g) {
    const m = g.map; base = base || document.createElement('canvas'); base.width = m.w * MK; base.height = m.h * MK; baseCtx = base.getContext('2d'); miniCtx = $('mini').getContext('2d');
    UI.paintMini(g);
  };
  UI.paintMini = function (g) {
    const m = g.map, K = D.K, c = baseCtx; c.clearRect(0, 0, base.width, base.height);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const k = m.tiles[y * m.w + x]; if (k === K.WALL) continue; const a = m.area[y * m.w + x], room = a >= 0 ? D.ROOMS[a] : null;
      let col = '#222'; if (k === K.FLOOR || k === K.BLOCK || k === K.MACHINE) col = ROOMC[room ? room.floor : 'barn']; else if (k === K.DOOR) col = '#e8b840'; else if (k === K.POCKET) col = '#1c2a22'; else if (k === K.WATER) col = '#2a6aa0'; else if (k === K.BARRIER) col = '#5a4a3a';
      if (k === K.BLOCK) col = '#3a2e44'; if (k === K.MACHINE) col = '#7fe6ff';
      c.globalAlpha = room && !m.rooms[a].unlocked && k !== K.DOOR ? 0.35 : 1; c.fillStyle = col; c.fillRect(x * MK, y * MK, MK, MK);
    }
    c.globalAlpha = 1;
  };
  UI.drawMini = function (g) {
    if (!UI.settings.minimap || !miniCtx) return;
    const c = miniCtx, W = 190, P = g.player, T = D.T, k = MK / T;
    c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(10,6,22,0.6)'; c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2); c.rotate(-Math.PI / 2 - P.aim); c.translate(-P.x * k, -P.y * k);
    c.drawImage(base, 0, 0);
    for (const b of g.map.barriers) { c.fillStyle = b.planks === 0 ? '#ff4a4a' : b.planks < b.max ? '#ffa63d' : '#c8a86a'; c.fillRect(b.x * MK, b.y * MK, b.w * MK, b.h * MK); }
    for (const d of g.map.doors) if (!d.open) { c.fillStyle = '#ffd24a'; c.fillRect(d.x * MK, d.y * MK, d.w * MK, d.h * MK); }
    for (const p of g.pickups) { c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(p.x * k, p.y * k, 2.6, 0, 6.3); c.fill(); }
    for (const e of g.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 24 * T) continue; c.fillStyle = e.boss ? '#8cff6a' : '#ff5d7a'; c.beginPath(); c.arc(e.x * k, e.y * k, e.boss ? 5 : e.type === 'mossmaw' ? 3.6 : 2.6, 0, 6.3); c.fill(); }
    for (const s of g.spores) { c.fillStyle = '#ff6ad8'; c.fillRect(s.x * k - 1, s.y * k - 1, 2, 2); }
    c.restore();
    c.save(); c.translate(W / 2, W / 2); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 3); c.lineTo(-5.5, 6); c.closePath(); c.fill(); c.stroke(); c.restore();
  };

  // ---------- wiring ----------
  UI.init = function (onAction) {
    UI.onAction = onAction;
    buildHow(); buildControls();
    document.querySelectorAll('#screens [data-act]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); AU.init(); AU.sfx('click'); onAction(b.dataset.act); }));
    document.querySelectorAll('[data-set]').forEach((r) => r.addEventListener('input', () => { const k = r.dataset.set, sc = r.dataset.scale ? +r.dataset.scale : 100; UI.settings[k] = r.value / sc; const o = $('o' + k[0].toUpperCase() + k.slice(1)); if (o) o.textContent = k === 'fov' ? r.value + '°' : r.value + '%'; UI.save(); UI.applySettings(); }));
    document.querySelectorAll('[data-tog]').forEach((t) => t.addEventListener('click', () => { UI.settings[t.dataset.tog] = !UI.settings[t.dataset.tog]; t.classList.toggle('on', UI.settings[t.dataset.tog]); UI.save(); UI.applySettings(); AU.sfx('click'); }));
    document.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => { stepSel(b, 1); refreshAll(); AU.sfx('click'); }));
    document.querySelectorAll('#screens .set').forEach((row) => row.addEventListener('click', () => { setFocus(items().indexOf(row)); }));
    $('bPause').addEventListener('click', () => onAction('pause'));
    $('bMute').addEventListener('click', () => { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); });
    $('mascots').innerHTML = ['glumpkin', 'zapling', 'wisper', 'mossmaw', 'boomkit', 'spitbud'].map((n) => '<img src="' + frame(n) + '" alt="">').join('');
    UI.applySettings();
  };
})();
