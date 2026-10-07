// Feral 2.0 - the game loop and the glue between the rules (sim), the picture (render3d, viewmodel), sound, input and the screens (ui).
(function () {
  const D = (window.DZF = window.DZF || {});
  const R = D.render, UI = D.ui, I = D.input, AU = D.audio, VM = D.viewmodel, A = D.art, S = 1 / 8;
  const $ = (id) => document.getElementById(id);
  const canvas = $('gl');
  let g = null, demo = null, state = 'boot', last = performance.now(), hudT = 0, returnTo = 'sMenu', overT = 0, deferredInstall = null, firstRun = true, demoT = 0;
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const view = { pitch: 0, zoom: 1, sprint: false, turnRate: 0, pitchRate: 0, light: 1, deadT: 0 };
  const clamp = D.clamp;

  // ---------- starting and stopping ----------
  function attach(game) { R.game = game; if (R.world) { R.world.resetDynamic(); } if (R.ents) D.ents.reset(R.ents); VM.reset(); UI.clearFx(); view.pitch = 0; view.zoom = 1; view.deadT = 0; UI.buildMini(game); }
  function newGame() { g = D.createGame({}); attach(g); AU.setIntensity(1); }
  function startPlay() {
    AU.init(); newGame(); UI.hide(); UI.hud(true); state = 'play'; overT = 0; hudT = 0;
    AU.music('play'); syncTouch(); I.clearEdges(); I.resetTouch(); I.releaseAll(); I.wantLock = true;
    if (I.last === 'kbm' && !coarse) I.lock(canvas);
    if (firstRun) { UI.hint(UI.controlsHint(), 9000); firstRun = false; }
    enterFullscreen();
  }
  function toMenu() { state = 'menu'; UI.hud(false); UI.touch(false); I.unlock(); I.wantLock = false; g = null; ensureDemo(); UI.show('sMenu'); AU.music('menu'); }
  function ensureDemo() { demo = demo || D.createGame({ seed: 7 }); attach(demo); demo.player.aim = 0.3; demo.player.x = 46.5 * D.T; demo.player.y = 33.5 * D.T; demoT = 0; }
  function doPause() { if (state !== 'play') return; state = 'pause'; UI.touch(false); I.resetTouch(); I.releaseAll(); I.unlock(); UI.show('sPause'); AU.sfx('click'); UI.lockHint(false); }
  function resume() { UI.hide(); state = 'play'; I.clearEdges(); syncTouch(); if (I.last === 'kbm' && !coarse) I.lock(canvas); }
  function syncTouch() { UI.touch(state === 'play' && (I.last === 'touch' || (coarse && I.last !== 'pad' && I.last !== 'kbm') || (I.touchSeen && I.last !== 'pad' && I.last !== 'kbm'))); }
  function enterFullscreen() {
    try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen && (coarse || window.innerWidth < 1100)) { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); } } catch (e) { /* not available (iPhone): the page still works */ }
  }
  function toggleFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); else UI.toast('On iPhone: Share > Add to Home Screen for full screen'); } catch (e) { /* ignore */ } }

  function onAction(a) {
    switch (a) {
      case 'play': case 'again': startPlay(); break;
      case 'how': returnTo = UI.current; UI.show('sHow'); break;
      case 'settings': returnTo = UI.current; UI.show('sSettings'); break;
      case 'back': UI.show(returnTo || 'sMenu'); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; $('bInstall').classList.add('hidden'); } break;
      case 'pause': if (state === 'play') doPause(); else if (state === 'pause') resume(); break;
      case 'resume': resume(); break;
      case 'quit': UI.show('sConfirm'); break;
      case 'quitNo': UI.show('sPause'); break;
      case 'quitYes': AU.music('off'); toMenu(); break;
      case 'menu': toMenu(); break;
      default: break;
    }
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('bInstall').classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => $('bInstall').classList.add('hidden'));
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') doPause(); });
  window.addEventListener('blur', () => { if (state === 'play' && !I.locked) doPause(); });
  function onResize() { R.resize(); VM.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 1.5)); if (state === 'play' && window.innerHeight > window.innerWidth && window.innerWidth < 900) doPause(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); } });
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => AU.init(), { passive: true });
  window.addEventListener('gamepadconnected', () => { setTimeout(() => { UI.refreshGlyphs(); if (state === 'play') UI.toast((I.padType === 'ps' ? 'PlayStation controller' : 'Controller') + ' connected'); }, 50); });
  window.addEventListener('gamepaddisconnected', () => { UI.refreshGlyphs(); if (state === 'play') UI.toast('Controller disconnected'); });
  I.onLast = function () { syncTouch(); UI.refreshGlyphs(); };

  // ---------- one game step ----------
  const PI2 = Math.PI * 2;
  const angDiff = (a, b) => { let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; };
  function bestTarget(g0, maxAng) {                    // the creature closest to the crosshair that can be seen
    const P = g0.player; let best = null, bd = maxAng;
    for (const e of g0.enemies) {
      if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 230 || d < 1) continue;
      const diff = angDiff(Math.atan2(dy, dx), P.aim), k = Math.abs(diff) - Math.atan2(e.r * 0.5, d) * 0.5;
      if (k < bd && g0.lineClear(P.x, P.y, e.x, e.y, g0.solid)) { bd = k; best = { e, diff, d }; }
    }
    return best;
  }
  function simInput(inp, dt) {
    const P = g.player; let yaw = inp.yaw, pitch = inp.pitch;
    const zoom = inp.zoom && P.reload <= 0 ? 1.4 : 1; view.zoom = zoom; const sens = 1 / R.zoomNow;
    yaw *= sens; pitch *= sens;
    const assist = UI.settings.aimAssist && (inp.source === 'pad' || inp.source === 'touch' || I.last === 'pad' || I.last === 'touch');
    if (assist) {
      const t = bestTarget(g, 0.16);
      if (t && (inp.fire || Math.abs(yaw) > 0)) { yaw *= 0.55; P.aim += t.diff * Math.min(1, dt * 7) * 0.6; }
    }
    P.aim = (P.aim + yaw) % PI2; if (P.aim < 0) P.aim += PI2;
    view.turnRate = dt > 0 ? yaw / dt : 0; view.pitchRate = dt > 0 ? pitch / dt : 0;
    view.pitch = clamp(view.pitch - pitch, -0.7, 0.7);
    if (assist && !pitch && inp.source) view.pitch *= Math.pow(0.6, dt);       // controller and touch drift back to level
    const a = P.aim, fwd = inp.fwd, str = inp.strafe;
    const sprint = inp.sprint && fwd > 0.3 && !inp.zoom; view.sprint = sprint;
    const can = !(I.last === 'kbm' && !I.locked && !I.noLock);
    return { mx: Math.cos(a) * fwd - Math.sin(a) * str, my: Math.sin(a) * fwd + Math.cos(a) * str, aim: P.aim, fire: inp.fire && can, reload: inp.reload, interactPressed: inp.interactPressed, interactHeld: inp.interactHeld, swap: inp.swap, slot: inp.slot, sprint };
  }
  const SFX_SHOT = { pip: 'pip', rattle: 'rattle', scatter: 'scatter', longthorn: 'longthorn', bubble: 'bubble', sunbeam: 'sunbeam', party: 'party' };
  function snd(name, x, y, far) {                      // a sound at a place in the world: panned left/right and softer with distance
    if (x == null || !R.cam) { AU.sfx(name); return; }
    const c = R.cam, dx = x * S - c.x, dz = y * S - c.z, d = Math.hypot(dx, dz) || 1, pan = (dx * c.rx + dz * c.rz) / d * Math.min(1, d / 5);
    AU.sfx(name, { pan, vol: Math.max(0.12, 1.15 - d / (far || 42)) });
  }
  function handleEvents(gg) {
    for (const e of gg.events) {
      R.event(e, gg); VM.event(e);
      switch (e.t) {
        case 'shot': AU.sfx(SFX_SHOT[e.w] || 'pip'); if (e.shake > 1.5) I.rumble(60, 0.35); break;
        case 'hit': snd('hit', e.x, e.y); if (gg === g) { UI.hitMarker(e.kill); if (UI.settings.numbers && R.ready) { const p = R.project(e.x * S, 1.6, e.y * S); if (p) UI.num(p.x, p.y, e.dmg, e.kill); } } break;
        case 'kill': snd(e.boss || e.type === 'mossmaw' ? 'bigKill' : e.boom ? 'boomSmall' : 'kill', e.x, e.y); break;
        case 'boom': if (e.nuke) AU.sfx('boom'); else snd('boomSmall', e.x, e.y); I.rumble(e.nuke ? 400 : 150, 0.8); break;
        case 'hurt': AU.sfx('hurt'); I.rumble(150, 0.7); if (gg === g) UI.hurt(gg, e); break;
        case 'reload': AU.sfx('reload'); break; case 'reloaded': AU.sfx('reloaded'); break; case 'empty': AU.sfx('empty'); break; case 'swap': AU.sfx('swap'); break;
        case 'buy': AU.sfx('buy'); break; case 'deny': AU.sfx('deny'); break;
        case 'door': AU.sfx('door'); if (gg === g) { UI.banner(e.name + '<small>a new area is open</small>', false); UI.paintMini(gg); } break;
        case 'repair': AU.sfx('repair'); break; case 'plank': snd('plank', e.x, e.y); break; case 'pickup': AU.sfx('pickup'); break; case 'drop': snd('drop', e.x, e.y); break;
        case 'take': AU.sfx('buy'); break; case 'upgrade': AU.sfx('upgrade'); break; case 'revive': AU.sfx('revive'); break;
        case 'box': if (e.state === 'spin') AU.sfx('boxSpin'); else if (e.state === 'ready') AU.sfx('boxReady'); break;
        case 'split': snd('split', e.x, e.y); break; case 'bite': snd('bite', e.x, e.y, 30); break; case 'spit': snd('spit', e.x, e.y); break;
        case 'slamWarn': snd('slamWarn', e.x, e.y, 70); break; case 'slam': snd('slam', e.x, e.y, 70); break;
        case 'round': AU.sfx('round'); AU.setIntensity(e.round); if (gg === g) UI.banner('ROUND ' + e.round + (e.boss ? '<small>the Elder Mossmaw is coming</small>' : ''), e.boss); if (e.boss) AU.sfx('boss'); break;
        case 'roundEnd': AU.sfx('roundEnd'); break;
        case 'bossSpawn': AU.sfx('boss'); break;
        case 'gameover': AU.sfx('gameover'); AU.music('off'); I.rumble(500, 0.9); overT = 2.0; break;
        default: break;
      }
    }
    gg.events.length = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
  }
  function tick(dt) {
    if (state === 'play') {
      const si = (D.dev && D.dev.sim) ? D.dev.sim(g, dt) : null;
      const inp = si ? { pause: false, yaw: 0, pitch: 0 } : I.frame(dt);
      if (inp.pause) doPause();
      else if (g.over) { overT -= dt; if (overT <= 0 && state === 'play') { state = 'over'; UI.hud(false); UI.touch(false); I.resetTouch(); I.unlock(); UI.gameOver(g); AU.music('over'); } handleEvents(g); }
      else {
        const steps = (D.dev && D.dev.speed) || 1, sim = si || simInput(inp, dt);
        if (si) { g.player.aim = sim.aim != null ? sim.aim : g.player.aim; view.zoom = 1; }
        for (let i = 0; i < steps && !g.over; i++) { g.update(dt, sim); if (i < steps - 1) g.events.length = 0; }
        handleEvents(g);
        hudT -= dt; if (hudT <= 0) { hudT = 0.09; UI.updateHud(g); const t = bestTarget(g, 0.05); UI.setCross(!!t, view.zoom > 1.05); UI.lockHint(I.last === 'kbm' && !I.locked && !I.noLock && !coarse); }
      }
      if (g.player) { view.light = Math.max(...R.world.lightAt(g.player.x, g.player.y, 1.2)); }
      R.draw(g, dt, view); VM.draw(g, dt, view); UI.updateFx(g, dt); UI.drawMini(g);
    } else {
      for (const k of I.takeMenu()) UI.menuKey(k);
      I.frame(dt);
      const gg = g || demo;
      if (gg) {
        if (gg === demo && state === 'menu') { demoT += dt; demo.player.aim = 0.3 + Math.sin(demoT * 0.15) * 0.9 + demoT * 0.04; demo.player.bob = 0; }
        const d = state === 'pause' ? 0 : dt; R.draw(gg, d, { pitch: 0.02, zoom: 1, sprint: false, light: 1 }); if (state === 'pause' || state === 'over') VM.draw(gg, 0, view); else VM.draw(null, 0, view);
        UI.updateFx(gg === g ? gg : null, dt);
      }
    }
  }

  // ---------- boot ----------
  function fail(msg) { $('boot').classList.add('gone'); $('err').style.display = 'flex'; $('errMsg').textContent = msg; }
  function bootProgress(p, msg) { $('bootFill').style.width = Math.round(p * 100) + '%'; if (msg) $('bootMsg').textContent = msg; }
  async function boot() {
    try {
      if (!window.THREE) throw new Error('The 3D engine did not load.');
      if (!R.init(canvas)) throw new Error('Your browser could not start WebGL, which this game needs. Try a different browser or turn on hardware acceleration.');
      VM.init($('vm')); onResize();
      bootProgress(0.05, 'Loading creatures and guns...');
      await A.load((p) => bootProgress(0.05 + p * 0.8));
      bootProgress(0.9, 'Building the hollow...');
      await new Promise((r) => setTimeout(r, 30));
      R.setQuality(UI.effectiveQuality(), true); R.auto = UI.settings.quality === 'auto'; R.q.fov = UI.settings.fov;
      ensureDemoFirst();
      UI.init(onAction); UI.applySettings();
      I.bindMouse(canvas, onLock);
      I.bindTouch($('touch'), { baseL: $('baseL'), knobL: $('knobL'), fire: $('tFire'), use: $('tUse'), reload: $('tReload'), swap: $('tSwap'), pause: null });
      I.last = coarse ? 'touch' : 'kbm'; if (coarse) document.body.classList.add('touch');
      state = 'menu'; UI.show('sMenu'); AU.music('menu');
      bootProgress(1, ''); $('boot').classList.add('gone'); setTimeout(() => { const b = $('boot'); if (b) b.remove(); }, 500);
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
      requestAnimationFrame((t) => { last = t; frame(t); });
      if (document.fullscreenEnabled === false || /iPhone|iPad|iPod/.test(navigator.userAgent)) $('bFs').classList.add('hidden');
    } catch (e) { console.error(e); fail(String(e && e.message || e)); }
  }
  function ensureDemoFirst() { demo = D.createGame({ seed: 7 }); R.reset(demo); attach(demo); demo.player.aim = 0.3; demo.player.x = 46.5 * D.T; demo.player.y = 33.5 * D.T; }
  function onLock(locked, errored) {
    if (!locked && state === 'play' && !errored) doPause();
    if (errored) UI.toast('Mouse capture is not available: the mouse still turns you');
  }
  D.main = { state: () => state, game: () => g, start: startPlay, action: onAction, pause: doPause, tick, view, stats: () => ({ fps: R.fps, calls: R.drawCalls, tris: R.tris, ratio: R.ratioK, quality: R.qname }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
