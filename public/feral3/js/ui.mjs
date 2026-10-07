// Feral 3.0 - menus, HUD, mini-map, hit markers, damage numbers and settings (plain DOM). Menus work with touch, mouse, keyboard or a controller.
import { I } from './input.mjs';
const D = window.DZF;
export const UI = { current: null, onAction: null, icons: {}, thumbs: {}, hooks: {} };
const $ = (id) => document.getElementById(id);
const DEFAULTS = { master: 0.8, music: 0.45, sfx: 0.9, amb: 0.7, muted: false, fov: 80, mouseSens: 1, padSens: 1, touchSens: 1, invertY: false, invertYpad: false, aimAssist: true, toggleCrouch: false, toggleAds: false, shake: true, numbers: true, minimap: true, showFps: false, quality: 'auto', char: 'male' };
UI.settings = Object.assign({}, DEFAULTS, D.store.get('dzf3_settings', {}));
let focusIdx = 0, prevScreen = null, AUDIO = null;
UI.attachAudio = (a) => { AUDIO = a; };
const sfx = (n) => { if (AUDIO) AUDIO.ui(n); };

UI.save = () => D.store.set('dzf3_settings', UI.settings);
UI.autoQuality = function () {
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches, small = Math.min(screen.width, screen.height) < 700, cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if (coarse || small) return 'low';
  if (cores <= 4 || mem <= 4) return 'high';
  return 'ultra';
};
UI.effectiveQuality = () => (UI.settings.quality === 'auto' ? UI.autoQuality() : UI.settings.quality);
UI.applySettings = function () {
  const s = UI.settings;
  I.settings.mouseSens = s.mouseSens; I.settings.padSens = s.padSens; I.settings.touchSens = s.touchSens; I.settings.invertY = s.invertY; I.settings.invertYpad = s.invertYpad; I.settings.toggleCrouch = s.toggleCrouch; I.settings.toggleAds = s.toggleAds;
  $('bMute').innerHTML = s.muted ? '&#128263;' : '&#128266;';
  $('mini').classList.toggle('hidden', !s.minimap);
  $('perf').classList.toggle('hidden', !s.showFps);
  document.querySelectorAll('[data-sel]').forEach((b) => { b.textContent = s[b.dataset.sel]; });
  if (UI.hooks.apply) UI.hooks.apply(s);
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
  } else if (k === 'ok') { if (f) { const t = f.querySelector && f.querySelector('.tog'), s = f.querySelector && f.querySelector('.sel'); if (f.classList.contains('set')) { if (t) t.click(); else if (s) stepSel(s, 1); } else f.click(); sfx('click'); } }
  else if (k === 'back') { if (UI.onAction) UI.onAction(UI.current === 'sMenu' ? 'none' : UI.current === 'sPause' ? 'resume' : UI.current === 'sOver' ? 'menu' : UI.current === 'sConfirm' ? 'quitNo' : 'back'); }
  if (k !== 'ok') sfx('tick');
};

// ---------- content ----------
function buildHow() {
  const en = (id, nm, tx) => '<div class="card">' + (UI.thumbs[id] ? '<img src="' + UI.thumbs[id] + '" alt="">' : '') + '<div><b>' + nm + '</b><small>' + tx + '</small></div></div>';
  const pk = (id, tx) => '<div class="card"><div><b>' + D.PERKS[id].name + ' (' + D.PERKS[id].cost + ')</b><small>' + tx + '</small></div></div>';
  const pu = (id, tx) => '<div class="card"><div><b>' + D.POWERUPS[id].name + '</b><small>' + tx + '</small></div></div>';
  const wp = (id, tx) => '<div class="card">' + (UI.icons[id] ? '<img src="' + UI.icons[id] + '" alt="" style="width:72px;height:44px">' : '') + '<div><b>' + D.WEAPONS[id].name + (D.WEAPONS[id].cost ? ' (' + D.WEAPONS[id].cost + ')' : '') + '</b><small>' + tx + '</small></div></div>';
  $('howBody').innerHTML =
    '<h3 style="margin-top:0">The goal</h3><p>Hollow Reach was a jungle park. Now it is overgrown, dark and full of <b>monsters</b> that come in <b>endless rounds</b>, each bigger and tougher than the last. Survive as long as you can. Every fifth round the <b>Cinder Hydra</b> rises from the Lava Cave. Learn the map, keep moving and watch your back.</p>' +
    '<h3>Earn and spend points</h3><p>You get points for hits, kills, headshots and repairing barricade boards. Spend them on things you can <b>use</b>:</p>' +
    '<div class="how-grid">' +
      '<div class="card"><div><b>Gates</b><small>Open a gate to unlock the Jungle Boardwalk, the Research Compound and then the Lava Cave. More room, more guns, more danger.</small></div></div>' +
      '<div class="card"><div><b>Wall guns</b><small>Walk up to a poster to buy a gun. Buy it again for half price to refill its ammo.</small></div></div>' +
      '<div class="card"><div><b>Supply Crate (' + D.BOX.cost + ')</b><small>A random gun. Take it before the lid closes.</small></div></div>' +
      '<div class="card"><div><b>Weapons Bench (' + D.UPGRADE.cost + ')</b><small>Forges your current gun: more damage, bigger magazine, more ammo.</small></div></div>' +
    '</div>' +
    '<h3>Guns</h3><div class="how-grid">' + wp('pistol', 'Your sidearm. Endless ammo.') + wp('shotgun', 'Devastating up close. Nine pellets.') + wp('rifle', 'Fast and accurate. Good all-rounder.') + wp('bolt', 'Slow, massive damage, pierces several creatures. Headshots love it.') + wp('mg', 'A huge magazine and a high rate of fire. Slow to reload.') + '</div>' +
    '<h3>Perks</h3><div class="how-grid">' + pk('heart', '+50 max health.') + pk('fizz', 'Reload twice as fast.') + pk('boots', 'Run faster.') + pk('lamp', 'One extra life: you get back up once.') + '</div>' +
    '<h3>Barricades</h3><p>Creatures break in through the boarded barricades in the outer walls. Stand in front of a broken barricade and <b>hold USE</b> to nail the boards back for points. A creature chewing on a barricade is not chewing on you. Your <b>flashlight</b> (F) helps in the dark.</p>' +
    '<h3>Power-ups</h3><p>Beaten creatures sometimes drop one.</p><div class="how-grid">' + pu('ammo', 'Refills every gun.') + pu('twin', 'Double points for 30 seconds.') + pu('boom', 'Beats every creature (a boss only takes a chunk). +400 points.') + pu('zap', 'Every hit beats a creature for 30 seconds.') + '</div>' +
    '<h3>The creatures</h3><div class="how-grid">' +
      en('small1', 'Cinderling', 'Fast and swarming. Weaves as it runs.') + en('small2', 'Thornback', 'Crouches, then leaps at you.') + en('small3', 'Powder Shell', 'Runs at you and explodes. Shoot it early.') +
      en('medium1', 'Ashfang', 'A solid brawler. Enrages when hurt.') + en('medium2', 'Gloomspitter', 'Keeps its distance and spits acid. Strafe!') + en('medium3', 'Rustclaw', 'Circles round, then pounces.') +
      en('large1', 'Grimmaw', 'Slow tank. Its ground stomp hits everything close.') + en('large2', 'Rendermaw', 'Roars, then charges and bowls you over. Sidestep!') + en('boss', 'Cinder Hydra', 'Stomps, breathes fire in a fan and calls its brood.') +
    '</div>' +
    '<h3>Tips</h3><p>Aim for the head: headshots do extra damage. Crouch to steady your aim, aim down sights for accuracy. Sprint to escape, but you cannot shoot while sprinting. Repair barricades between rounds. Open the next area only when you have a good gun.</p>';
}
function buildControls() {
  const row = (a, b) => '<div><span>' + a + '</span><span>' + b + '</span></div>';
  $('ctlHelp').innerHTML =
    '<div><h4>Keyboard and mouse</h4>' + row('Move', 'W A S D') + row('Look', 'Mouse (click to capture)') + row('Shoot', 'Left click') + row('Aim down sights', 'Right click') + row('Sprint', 'Shift') + row('Crouch', 'Ctrl or C') + row('Reload', 'R') + row('Buy / use / repair', 'E (hold to repair)') + row('Swap gun', 'Q, wheel, 1 2 3') + row('Flashlight', 'F') + row('Pause', 'Esc') + '</div>' +
    '<div><h4>PlayStation controller</h4>' + row('Move', 'Left stick') + row('Look', 'Right stick') + row('Shoot', 'R2') + row('Aim down sights', 'L2') + row('Sprint', 'L3') + row('Crouch', '○ Circle') + row('Reload', '□ Square') + row('Buy / use / repair', '✕ Cross (hold to repair)') + row('Swap gun', '△ Triangle (or L1 / R1)') + row('Flashlight', 'D-pad up') + row('Pause', 'Options') + '</div>' +
    '<div><h4>Touch (basic)</h4>' + row('Move', 'Left side: drag') + row('Sprint', 'Push the stick all the way') + row('Look', 'Right side: drag') + row('Shoot', 'FIRE button') + row('Reload / use / swap', 'The buttons') + '</div>';
}
function refreshAll() {
  const s = UI.settings;
  for (const k of ['master', 'music', 'sfx', 'amb', 'mouseSens', 'padSens', 'touchSens']) { const r = document.querySelector('[data-set="' + k + '"]'); if (r) { r.value = Math.round(s[k] * 100); $('o' + k[0].toUpperCase() + k.slice(1)).textContent = r.value + '%'; } }
  { const r = document.querySelector('[data-set="fov"]'); r.value = s.fov; $('oFov').textContent = s.fov + '°'; }
  document.querySelectorAll('[data-tog]').forEach((t) => t.classList.toggle('on', !!s[t.dataset.tog]));
  document.querySelectorAll('[data-sel]').forEach((b) => { b.textContent = s[b.dataset.sel] + (s[b.dataset.sel] === 'auto' ? ' (' + UI.autoQuality() + ')' : ''); });
  document.querySelectorAll('.sel-char').forEach((b) => b.classList.toggle('chosen', b.dataset.char === s.char));
  const best = D.store.get('dzf3_best', null);
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
UI.rebuildHow = buildHow;

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
  setText('hSub', g.state === 'intermission' ? (g.round === 0 ? 'Get ready... ' + Math.ceil(g.timer) : 'Next round in ' + Math.ceil(g.timer) + ' - repair barricades, buy things') : g.toSpawn + g.enemies.length + ' creatures left');
  setText('hMag', String(w.mag)); $('hMag').classList.toggle('low', w.mag <= Math.max(2, s.mag * 0.25));
  setText('hRes', s.infinite ? ' / ∞' : ' / ' + w.reserve);
  setText('hWpnName', s.name); $('hWpnName').classList.toggle('gold', !!w.up);
  const wk = 'w' + w.id + (UI.icons[w.id] ? 1 : 0); if (cache.wk !== wk) { cache.wk = wk; $('hWpnImg').src = UI.icons[w.id] || ''; }
  $('hReload').classList.toggle('hidden', !(P.reload > 0));
  setHtml('hSlots', P.weapons.map((x, i) => '<i class="' + (i === P.cur ? 'cur' : '') + '">' + (UI.icons[x.id] ? '<img src="' + UI.icons[x.id] + '" alt="">' : '') + '</i>').join(''));
  setHtml('hPerks', Object.keys(P.perks).filter((k) => P.perks[k]).map((k) => '<span class="perk" style="border-color:' + D.PERKS[k].color + ';color:' + D.PERKS[k].color + '" title="' + D.PERKS[k].name + '">' + D.PERKS[k].name.split(' ').map((x) => x[0]).join('') + '</span>').join(''));
  const pw = []; for (const k of ['twin', 'zap']) if (g.powers[k] > 0) { const d = D.POWERUPS[k]; pw.push('<div class="pw" style="border-color:' + d.color + '"><span>' + d.name + '</span><b>' + Math.ceil(g.powers[k]) + '</b></div>'); } setHtml('hPowers', pw.join(''));
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
    setText('tUse', info ? 'USE' : { door: 'OPEN', wall: 'BUY', perk: 'BUY', box: 'CRATE', take: 'TAKE', anvil: 'FORGE', repair: 'FIX' }[p.kind] || 'USE');
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
  if (I.last === 'pad') return 'Left stick move  ·  Right stick look  ·  ' + g('shoot') + ' shoot  ·  ' + g('ads') + ' aim  ·  ' + g('reload') + ' reload  ·  ' + g('use') + ' use  ·  ' + g('swap') + ' swap  ·  ' + g('sprint') + ' sprint  ·  ' + g('crouch') + ' crouch';
  return 'WASD move  ·  Mouse look  ·  Click shoot  ·  Right-click aim  ·  Shift sprint  ·  Ctrl crouch  ·  R reload  ·  E use (hold to repair)  ·  Q swap  ·  F flashlight';
};
UI.gameOver = function (g) {
  const best = D.store.get('dzf3_best', null), now = { round: g.round, kills: g.kills, points: Math.floor(g.points) };
  const isBest = !best || now.round > best.round || (now.round === best.round && now.points > best.points);
  if (isBest) D.store.set('dzf3_best', now);
  $('oRound').textContent = now.round; $('oKills').textContent = now.kills; $('oHead').textContent = g.headshots || 0; $('oPts').textContent = now.points;
  $('oBest').textContent = isBest ? 'New high score!' : 'Best: round ' + best.round + ' · ' + best.kills + ' creatures · ' + best.points + ' points';
  UI.show('sOver');
};

// ---------- screen effects: damage vignette, directional hurt arcs, hit marker, damage numbers ----------
let hurtV = 0, indIdx = 0, flashV = 0;
UI.hurtLevel = () => hurtV;
UI.hurt = function (g, e, aim) {
  hurtV = Math.min(1, hurtV + 0.35 + e.dmg / 60);
  if (e.sx != null) {
    const P = g.player, rel = Math.atan2(e.sy - P.y, e.sx - P.x) - aim, deg = rel * 180 / Math.PI;
    const box = $('dmgInd'); let el = box.children[indIdx % 6]; if (!el) { el = document.createElement('i'); box.appendChild(el); }
    indIdx++; el.style.transition = 'none'; el.style.transform = 'rotate(' + deg + 'deg)'; el.style.opacity = '1'; void el.offsetWidth; el.style.transition = 'opacity 1.3s ease-out'; el.style.opacity = '0';
  }
};
UI.screenFlash = function (color) { $('flash').style.background = color || '#fff'; flashV = 0.5; };
UI.updateFx = function (g, dt) {
  hurtV = Math.max(0, hurtV - dt * 0.9); let low = 0;
  if (g && !g.over) { const f = g.player.hp / g.player.maxHp; if (f < 0.35) low = (0.35 - f) / 0.35 * (0.55 + 0.25 * Math.sin(performance.now() / 180)); }
  if (g && g.over) low = 0.9;
  $('vig').style.opacity = Math.min(1, hurtV * 0.6 + low * 0.6).toFixed(3);
  flashV = Math.max(0, flashV - dt * 1.8); $('flash').style.opacity = flashV.toFixed(3);
  return Math.min(1, hurtV + low * 0.7);
};
UI.clearFx = function () { hurtV = 0; flashV = 0; $('vig').style.opacity = '0'; $('flash').style.opacity = '0'; for (const el of $('dmgInd').children) el.style.opacity = '0'; $('nums').innerHTML = ''; };
UI.hitMarker = function (kill, head) { const h = $('hitm'); h.className = ''; void h.offsetWidth; h.className = 'on' + (kill ? ' kill' : '') + (head ? ' head' : ''); };
UI.setCross = function (target, ads, spread) { const c = $('cross'); c.classList.toggle('target', !!target); c.classList.toggle('zoom', !!ads); c.style.setProperty('--sp', (spread || 0).toFixed(2)); };
UI.num = function (x, y, text, kill, head) {
  const box = $('nums'); if (box.children.length > 16) box.removeChild(box.firstChild);
  const b = document.createElement('b'); b.textContent = text; b.style.left = (x + (Math.random() - 0.5) * 30) + 'px'; b.style.top = y + 'px'; if (kill) b.className = 'kill'; if (head) b.className += ' head'; box.appendChild(b); setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 720);
};

// ---------- mini-map ----------
let base = null, baseCtx = null, miniCtx = null; const MK = 3;
const ROOMC = { plaza: '#6a6a60', jungle: '#2f5a34', compound: '#4a5058', cave: '#4a3028' };
UI.buildMini = function (g) {
  const m = g.map; base = base || document.createElement('canvas'); base.width = m.w * MK; base.height = m.h * MK; baseCtx = base.getContext('2d'); miniCtx = $('mini').getContext('2d'); UI.paintMini(g);
};
UI.paintMini = function (g) {
  const m = g.map, K = D.K, c = baseCtx; c.clearRect(0, 0, base.width, base.height);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const k = m.tiles[y * m.w + x]; if (k === K.WALL) continue; const a = m.area[y * m.w + x], room = a >= 0 ? D.ROOMS[a] : null;
    let col = '#222'; if (k === K.FLOOR || k === K.BLOCK || k === K.MACHINE) col = ROOMC[room ? room.floor : 'plaza']; else if (k === K.DOOR) col = '#e8b840'; else if (k === K.POCKET) col = '#18261c'; else if (k === K.WATER) col = (m.liquids.find((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) || {}).kind === 'lava' ? '#d84a14' : '#2a6aa0'; else if (k === K.BARRIER) col = '#5a4a3a';
    if (k === K.BLOCK) col = '#2a2e32'; if (k === K.MACHINE) col = '#7fe6ff';
    c.globalAlpha = room && !m.rooms[a].unlocked && k !== K.DOOR ? 0.3 : 1; c.fillStyle = col; c.fillRect(x * MK, y * MK, MK, MK);
  }
  c.globalAlpha = 1;
};
UI.drawMini = function (g, aim) {
  if (!UI.settings.minimap || !miniCtx) return;
  const c = miniCtx, W = 200, P = g.player, T = D.T, k = MK / T;
  c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(6,10,10,0.7)'; c.fillRect(0, 0, W, W);
  c.translate(W / 2, W / 2); c.rotate(-Math.PI / 2 - aim); c.translate(-P.x * k, -P.y * k);
  c.drawImage(base, 0, 0);
  for (const b of g.map.barriers) { c.fillStyle = b.planks === 0 ? '#ff4a4a' : b.planks < b.max ? '#ffa63d' : '#c8a86a'; c.fillRect(b.x * MK, b.y * MK, b.w * MK, b.h * MK); }
  for (const d of g.map.doors) if (!d.open) { c.fillStyle = '#ffd24a'; c.fillRect(d.x * MK, d.y * MK, d.w * MK, d.h * MK); }
  for (const p of g.pickups) { c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(p.x * k, p.y * k, 2.4, 0, 6.3); c.fill(); }
  for (const e of g.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 30 * T) continue; c.fillStyle = e.boss ? '#ff9a3a' : '#ff5d6a'; c.beginPath(); c.arc(e.x * k, e.y * k, e.boss ? 4.5 : e.def.r > 7 ? 3.2 : 2.2, 0, 6.3); c.fill(); }
  for (const s of g.spores) { c.fillStyle = '#ff9a3a'; c.fillRect(s.x * k - 1, s.y * k - 1, 2, 2); }
  c.restore();
  c.save(); c.translate(W / 2, W / 2); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 3); c.lineTo(-5.5, 6); c.closePath(); c.fill(); c.stroke(); c.restore();
};

// ---------- wiring ----------
UI.init = function (onAction) {
  UI.onAction = onAction;
  buildHow(); buildControls();
  document.querySelectorAll('#screens [data-act]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); if (AUDIO) AUDIO.init(); sfx('click'); onAction(b.dataset.act); }));
  document.querySelectorAll('[data-char]').forEach((b) => b.addEventListener('click', () => { UI.settings.char = b.dataset.char; UI.save(); refreshAll(); sfx('click'); if (UI.hooks.char) UI.hooks.char(UI.settings.char); }));
  document.querySelectorAll('[data-set]').forEach((r) => r.addEventListener('input', () => { const k = r.dataset.set, sc = r.dataset.scale ? +r.dataset.scale : 100; UI.settings[k] = r.value / sc; const o = $('o' + k[0].toUpperCase() + k.slice(1)); if (o) o.textContent = k === 'fov' ? r.value + '°' : r.value + '%'; UI.save(); UI.applySettings(); }));
  document.querySelectorAll('[data-tog]').forEach((t) => t.addEventListener('click', () => { UI.settings[t.dataset.tog] = !UI.settings[t.dataset.tog]; t.classList.toggle('on', UI.settings[t.dataset.tog]); UI.save(); UI.applySettings(); sfx('click'); }));
  document.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => { stepSel(b, 1); refreshAll(); sfx('click'); }));
  document.querySelectorAll('#screens .set').forEach((row) => row.addEventListener('click', () => { setFocus(items().indexOf(row)); }));
  $('bPause').addEventListener('click', () => onAction('pause'));
  $('bMute').addEventListener('click', () => { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); });
  UI.applySettings();
};
