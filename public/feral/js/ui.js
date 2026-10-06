// Dead Zone: Feral - menus, HUD and settings (plain DOM). Menus can be used with touch, mouse, keyboard or a controller.
(function () {
  const D = (window.DZF = window.DZF || {});
  const UI = (D.ui = {});
  const A = D.art, I = D.input, AU = D.audio;
  const $ = (id) => document.getElementById(id);
  const urls = {};
  const url = (key, c) => urls[key] || (urls[key] = A.url(c));
  UI.settings = Object.assign({}, D.DEFAULT_SETTINGS, D.store.get('dzf_settings', {}));
  UI.current = null; UI.onAction = null; let focusIdx = 0, prevScreen = null;

  UI.save = () => D.store.set('dzf_settings', UI.settings);
  UI.applySettings = function () {
    const s = UI.settings;
    AU.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
    D.render.opts.shake = s.shake; D.render.opts.numbers = s.numbers; I.settings.autoFire = s.autoFire; I.settings.leftHand = s.leftHand;
    $('bMute').innerHTML = s.muted ? '&#128263;' : '&#128266;';
  };

  // ---------- screens ----------
  const items = () => [].slice.call(document.querySelectorAll('#' + UI.current + ' .btn, #' + UI.current + ' .set')).filter((e) => e.offsetParent !== null);
  function setFocus(i) { const list = items(); if (!list.length) return; focusIdx = (i + list.length) % list.length; list.forEach((e, k) => e.classList.toggle('focus', k === focusIdx)); const f = list[focusIdx]; if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); }
  UI.show = function (name) {
    prevScreen = UI.current;
    document.querySelectorAll('#screens .screen').forEach((s) => s.classList.toggle('on', s.id === name));
    UI.current = name; I.setBlock(!!name);
    if (name) { focusIdx = 0; refreshAll(); setFocus(0); }
  };
  UI.hide = function () { document.querySelectorAll('#screens .screen').forEach((s) => s.classList.remove('on')); UI.current = null; I.setBlock(false); };
  UI.previous = () => prevScreen;
  UI.menuKey = function (k) {                         // from the keyboard / controller
    if (!UI.current) return;
    const list = items(), f = list[focusIdx];
    if (k === 'up') setFocus(focusIdx - 1); else if (k === 'down') setFocus(focusIdx + 1);
    else if (k === 'left' || k === 'right') {
      if (f && f.classList.contains('set')) { const r = f.querySelector('input[type=range]'), t = f.querySelector('.tog'); if (r) { r.value = D.clamp(+r.value + (k === 'left' ? -10 : 10), 0, 100); r.dispatchEvent(new Event('input')); } else if (t) t.click(); }
      else setFocus(focusIdx + (k === 'left' ? -1 : 1));
    } else if (k === 'ok') { if (f) { const t = f.querySelector && f.querySelector('.tog'); if (f.classList.contains('set')) { if (t) t.click(); } else f.click(); AU.sfx('click'); } }
    else if (k === 'back') { if (UI.onAction) UI.onAction(UI.current === 'sMenu' ? 'none' : UI.current === 'sPause' ? 'resume' : UI.current === 'sOver' ? 'menu' : UI.current === 'sConfirm' ? 'quitNo' : 'back'); }
    if (k !== 'ok') AU.sfx('tick');
  };

  // ---------- content ----------
  function img(c, key, cls) { return '<img src="' + url(key, c) + '" alt="" ' + (cls ? 'class="' + cls + '"' : '') + '>'; }
  function buildHow() {
    const en = (id, nm, tx, spr) => '<div class="card">' + img(spr, 'e' + id) + '<div><b>' + nm + '</b><small>' + tx + '</small></div></div>';
    const pu = (id, tx) => '<div class="card">' + img(A.icon.power[id], 'p' + id) + '<div><b>' + D.POWERUPS[id].name + '</b><small>' + tx + '</small></div></div>';
    const pk = (id, tx) => '<div class="card">' + img(A.icon.perk[id], 'k' + id) + '<div><b>' + D.PERKS[id].name + ' (' + D.PERKS[id].cost + ')</b><small>' + tx + '</small></div></div>';
    $('howBody').innerHTML =
      '<h3 style="margin-top:0">The goal</h3><p>Pip\'s barn is under siege. The cute creatures of Mossy Hollow have gone <b>feral</b> and they come in <b>endless rounds</b>, each bigger and tougher than the last. Stay alive as long as you can. Every fifth round an <b>Elder Mossmaw</b> shows up.</p>' +
      '<h3>Earn and spend points</h3><p>You get points for every hit, every beaten creature and every repaired window board. Spend them on things you can <b>use</b> (the <b>USE</b> button, or the key shown in the prompt):</p>' +
      '<div class="how-grid">' +
        '<div class="card"><div><b>Doors</b><small>Open a door to unlock a new area: the Pumpkin Patch, Old Mill, Crypt Garden and Lantern Pond. More area, more guns, more danger.</small></div></div>' +
        '<div class="card"><div><b>Wall guns</b><small>Walk up to a poster to buy a gun. Buy it again for half price to refill its ammo.</small></div></div>' +
        '<div class="card">' + img(A.machine.box, 'box') + '<div><b>Wobble Chest (' + D.BOX.cost + ')</b><small>A random gun, some of them very silly. Take it before the lid closes.</small></div></div>' +
        '<div class="card">' + img(A.machine.anvil, 'anv') + '<div><b>Sparkle Anvil (' + D.UPGRADE.cost + ')</b><small>Makes your current gun Gilded: more damage, bigger magazine, more ammo.</small></div></div>' +
      '</div>' +
      '<h3>Perks</h3><div class="how-grid">' + pk('heart', '+50 max health.') + pk('fizz', 'Reload twice as fast.') + pk('boots', 'Run faster.') + pk('lamp', 'One extra life: you get back up once.') + '</div>' +
      '<h3>Windows</h3><p>Creatures break in through the boarded windows. <b>Hold USE</b> near a broken window to nail the boards back for points. A creature chewing on a window is not chewing on you.</p>' +
      '<h3>Power-ups</h3><p>Beaten creatures sometimes drop one. Grab it before it fades.</p><div class="how-grid">' + pu('ammo', 'Refills every gun.') + pu('twin', 'Double points for 30 seconds.') + pu('boom', 'Beats every creature on screen. +400 points.') + pu('zap', 'Every hit beats a creature for 30 seconds.') + '</div>' +
      '<h3>The ferals</h3><div class="how-grid">' +
        en('g', 'Glumpkin', 'A slow pumpkin blob. Hit it and it splits in two.', A.glump[3][0]) + en('z', 'Zapling', 'A twitchy sprout. Watch for its sudden dash.', A.zap[0]) +
        en('w', 'Wisper', 'A ghost that floats straight through walls.', A.wisp[0]) + en('m', 'Mossmaw', 'A big mossy tank. Bring the big guns.', A.moss[0]) +
        en('b', 'Boomkit', 'Runs at you and goes off. Shoot it early.', A.boom[0]) + en('s', 'Spitbud', 'Stays back and spits glowing spores.', A.spit[0]) + en('e', 'Elder Mossmaw', 'The boss of every fifth round. Mind the stomp circle.', A.elder[0]) +
      '</div>' +
      '<h3>Tips</h3><p>Keep moving: creatures are slower than you. Repair windows between waves. Open the next area before you run out of room, but not before you have a good gun. Reload while nothing is close.</p>';
  }
  function buildControls() {
    const row = (a, b) => '<div><span>' + a + '</span><span>' + b + '</span></div>';
    $('ctlHelp').innerHTML =
      '<div><h4>Touch</h4>' + row('Move', 'Left stick') + row('Aim and shoot', 'Right stick') + row('Reload', 'RELOAD button') + row('Buy / use / repair', 'USE button') + row('Swap gun', 'SWAP button') + row('Pause', 'II button') + '</div>' +
      '<div><h4>Keyboard and mouse</h4>' + row('Move', 'W A S D') + row('Aim', 'Mouse') + row('Shoot', 'Left click') + row('Reload', 'R') + row('Buy / use / repair', 'E (hold to repair)') + row('Swap gun', 'Q or mouse wheel (1 2 3)') + row('Pause', 'Esc') + '</div>' +
      '<div><h4>PlayStation controller</h4>' + row('Move', 'Left stick') + row('Aim', 'Right stick') + row('Shoot', 'R2') + row('Reload', '□ Square') + row('Buy / use / repair', '✕ Cross (hold to repair)') + row('Swap gun', '△ Triangle (or L1 / R1)') + row('Pause', 'Options') + '</div>';
  }
  function refreshAll() {
    const s = UI.settings;
    for (const k of ['master', 'music', 'sfx']) { const r = document.querySelector('[data-set="' + k + '"]'); if (r) { r.value = Math.round(s[k] * 100); $('o' + k[0].toUpperCase() + k.slice(1)).textContent = r.value + '%'; } }
    document.querySelectorAll('[data-tog]').forEach((t) => t.classList.toggle('on', !!s[t.dataset.tog]));
    const best = D.store.get('dzf_best', null);
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
    const P = g.player, w = P.weapons[P.cur], s = D.wstat(w);
    setText('hPts', String(Math.floor(g.points)));
    $('hPtsX').classList.toggle('on', g.powers.twin > 0);
    const hpf = Math.max(0, P.hp / P.maxHp * 100); if (cache.hp !== Math.round(hpf)) { cache.hp = Math.round(hpf); $('hHpFill').style.width = hpf + '%'; }
    setText('hHp', Math.ceil(P.hp) + ' / ' + P.maxHp);
    setText('hRound', 'ROUND ' + Math.max(1, g.round));
    setText('hSub', g.state === 'intermission' ? (g.round === 0 ? 'Get ready... ' + Math.ceil(g.timer) : 'Next round in ' + Math.ceil(g.timer) + ' - repair windows, buy things') : g.toSpawn + g.enemies.length + ' creatures left');
    setText('hMag', String(w.mag)); $('hMag').classList.toggle('low', w.mag <= Math.max(2, s.mag * 0.25));
    setText('hRes', s.infinite ? ' / ∞' : ' / ' + w.reserve);
    setText('hWpnName', s.name); $('hWpnName').classList.toggle('gold', !!w.up);
    const wk = 'w' + w.id + (w.up ? 'u' : ''); if (cache.wk !== wk) { cache.wk = wk; $('hWpnImg').src = url(wk, w.up ? A.weaponUp[w.id] : A.weapon[w.id]); }
    $('hReload').classList.toggle('hidden', !(P.reload > 0));
    const sl = P.weapons.map((x, i) => '<i class="' + (i === P.cur ? 'cur' : '') + '"><img src="' + url('w' + x.id + (x.up ? 'u' : ''), x.up ? A.weaponUp[x.id] : A.weapon[x.id]) + '" alt=""></i>').join('');
    setHtml('hSlots', sl);
    const pk = Object.keys(P.perks).filter((k) => P.perks[k]).map((k) => '<img src="' + url('k' + k, A.icon.perk[k]) + '" alt="' + D.PERKS[k].name + '" title="' + D.PERKS[k].name + '">').join(''); setHtml('hPerks', pk);
    const pw = []; for (const k of ['twin', 'zap']) if (g.powers[k] > 0) { const d = D.POWERUPS[k]; pw.push('<div class="pw" style="border-color:' + d.color + '">' + '<img src="' + url('p' + k, A.icon.power[k]) + '" alt=""><span>' + Math.ceil(g.powers[k]) + '</span></div>'); } setHtml('hPowers', pw.join(''));
    const boss = g.enemies.find((e) => e.boss);
    $('hBoss').classList.toggle('hidden', !boss); if (boss) { const f = Math.max(0, boss.hp / boss.maxHp * 100); if (cache.bf !== Math.round(f)) { cache.bf = Math.round(f); $('hBossFill').style.width = f + '%'; } }
    // the prompt and the touch button
    const p = g.prompt, el = $('prompt');
    if (!p) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); $('tUse').className = 'tbtn'; setText('tUse', 'USE'); }
    else {
      el.classList.remove('hidden');
      const afford = g.points >= (p.cost || 0), info = !!p.info;
      el.className = info ? 'info' : afford ? '' : 'no';
      $('pKey').textContent = p.hold ? 'Hold ' + I.glyph('use') : I.glyph('use');
      setText('pText', p.label); setText('pCost', p.cost ? (afford ? p.cost : p.cost + ' (need ' + Math.ceil(p.cost - g.points) + ' more)') : '');
      $('tUse').className = 'tbtn ' + (info ? '' : afford ? 'ready' : 'no');
      setText('tUse', info ? 'USE' : { door: 'OPEN', wall: 'BUY', perk: 'BUY', box: 'BOX', take: 'TAKE', anvil: 'UPGRADE', repair: 'FIX' }[p.kind] || 'USE');
    }
    if (g.message && cache.msgT !== g.message.t) { cache.msgT = g.message.t; UI.toast(g.message.text); }
  };
  let toastT = null;
  UI.toast = function (text) { const t = $('toast'); t.textContent = text; t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1800); };
  UI.banner = function (html, boss) { const b = $('banner'); b.className = boss ? 'boss' : ''; b.innerHTML = html; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(UI._bt); UI._bt = setTimeout(() => b.classList.add('hidden'), 2300); };
  UI.hint = function (text, ms) { const h = $('hint'); if (!text) { h.classList.add('hidden'); return; } h.textContent = text; h.classList.remove('hidden'); clearTimeout(UI._ht); UI._ht = setTimeout(() => h.classList.add('hidden'), ms || 7000); };
  UI.controlsHint = function () {
    const g = I.glyph;
    if (I.last === 'touch') return 'Left stick: move  ·  Right stick: aim and shoot  ·  USE to buy and repair';
    if (I.last === 'pad') return 'Left stick move  ·  Right stick aim  ·  ' + g('shoot') + ' shoot  ·  ' + g('reload') + ' reload  ·  ' + g('use') + ' use  ·  ' + g('swap') + ' swap';
    return 'WASD move  ·  Mouse aim  ·  Click shoot  ·  R reload  ·  E use (hold to repair)  ·  Q / wheel swap';
  };
  UI.gameOver = function (g) {
    const best = D.store.get('dzf_best', null), now = { round: g.round, kills: g.kills, points: Math.floor(g.points) };
    const isBest = !best || now.round > best.round || (now.round === best.round && now.points > best.points);
    if (isBest) D.store.set('dzf_best', now);
    $('oRound').textContent = now.round; $('oKills').textContent = now.kills; $('oPts').textContent = now.points;
    $('oBest').textContent = isBest ? 'New high score!' : 'Best: round ' + best.round + ' · ' + best.kills + ' creatures · ' + best.points + ' points';
    UI.show('sOver');
  };

  // ---------- wiring ----------
  UI.init = function (onAction) {
    UI.onAction = onAction;
    buildHow(); buildControls();
    document.querySelectorAll('#screens [data-act]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); AU.init(); AU.sfx('click'); onAction(b.dataset.act); }));
    document.querySelectorAll('[data-set]').forEach((r) => r.addEventListener('input', () => { UI.settings[r.dataset.set] = r.value / 100; $('o' + r.dataset.set[0].toUpperCase() + r.dataset.set.slice(1)).textContent = r.value + '%'; UI.save(); UI.applySettings(); }));
    document.querySelectorAll('[data-tog]').forEach((t) => t.addEventListener('click', () => { UI.settings[t.dataset.tog] = !UI.settings[t.dataset.tog]; t.classList.toggle('on', UI.settings[t.dataset.tog]); UI.save(); UI.applySettings(); AU.sfx('click'); }));
    document.querySelectorAll('#screens .set').forEach((row) => row.addEventListener('click', (e) => { const list = items(); setFocus(list.indexOf(row)); void e; }));
    $('bPause').addEventListener('click', () => onAction('pause'));
    $('bMute').addEventListener('click', () => { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); });
    // mascots on the title screen
    $('mascots').innerHTML = [A.glump[3][0], A.zap[0], A.pip[4], A.wisp[0], A.moss[0], A.boom[0], A.spit[0]].map((c, i) => img(c, 'm' + i)).join('');
    UI.applySettings();
  };
})();
