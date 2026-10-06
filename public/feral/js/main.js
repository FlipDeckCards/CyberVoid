// Dead Zone: Feral - the game loop and the glue between the rules (sim), the picture (render), sound, input and the screens (ui).
(function () {
  const D = (window.DZF = window.DZF || {});
  const R = D.render, UI = D.ui, I = D.input, AU = D.audio;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  let g = null, demo = null, state = 'menu', last = performance.now(), hudT = 0, returnTo = 'sMenu', overT = 0, deferredInstall = null, firstRun = true;
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  // ---------- starting and stopping ----------
  function newGame() { g = D.createGame({}); R.reset(g.map); AU.setIntensity(1); }
  function startPlay() {
    AU.init(); newGame(); UI.hide(); UI.hud(true); state = 'play'; overT = 0; hudT = 0;
    AU.music('play'); syncTouch(); I.clearEdges(); I.resetTouch();
    if (firstRun) { UI.hint(UI.controlsHint(), 9000); firstRun = false; }
    enterFullscreen();
  }
  function toMenu() { state = 'menu'; UI.hud(false); UI.touch(false); g = null; ensureDemo(); UI.show('sMenu'); AU.music('menu'); }
  function ensureDemo() { demo = demo || D.createGame({ seed: 7 }); R.reset(demo.map); demo.player.aim = 0.3; }
  function doPause() { if (state !== 'play') return; state = 'pause'; UI.touch(false); I.resetTouch(); UI.show('sPause'); AU.sfx('click'); }
  function resume() { UI.hide(); state = 'play'; I.clearEdges(); syncTouch(); }
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
  window.addEventListener('blur', () => { if (state === 'play') doPause(); });
  window.addEventListener('resize', () => { R.resize(); if (state === 'play' && window.innerHeight > window.innerWidth && window.innerWidth < 900) doPause(); });        // turned the phone upright: pause until it is turned back
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); } });
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => AU.init(), { passive: true });      // browsers (iPhone especially) keep sound locked until a tap or key press
  window.addEventListener('gamepadconnected', () => { setTimeout(() => { UI.refreshGlyphs(); if (state === 'play') UI.toast((I.padType === 'ps' ? 'PlayStation controller' : 'Controller') + ' connected'); }, 50); });
  window.addEventListener('gamepaddisconnected', () => { UI.refreshGlyphs(); if (state === 'play') UI.toast('Controller disconnected'); });
  I.onLast = function () { syncTouch(); UI.refreshGlyphs(); if (g && state === 'play') g.aimDots = I.last !== 'kbm'; };

  // ---------- one game step ----------
  const PI2 = Math.PI * 2;
  function assist(g0, aim) {                         // a gentle pull towards a creature that is nearly in line (touch and controller)
    const P = g0.player; let best = null, bd = 0.3;
    for (const e of g0.enemies) {
      if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 200) continue;
      let diff = Math.atan2(dy, dx) - aim; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); const k = Math.abs(diff) * (1 + d / 400);
      if (k < bd && g0.lineClear(P.x, P.y, e.x, e.y, g0.solid)) { bd = k; best = Math.atan2(dy, dx); }
    }
    if (best == null) return aim;
    let diff = best - aim; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); return aim + diff * 0.55;
  }
  function simInput(inp) {
    const P = g.player; let aim = P.aim;
    if (inp.aimVec) { aim = Math.atan2(inp.aimVec.y, inp.aimVec.x); if (UI.settings.aimAssist && (inp.aimFrom === 'touch' || inp.aimFrom === 'pad')) aim = assist(g, aim); }
    else if (inp.mouse) { const r = canvas.getBoundingClientRect(), cam = R.camera, wx = cam.x + (inp.mouse.x - r.left) / R.scale, wy = cam.y + (inp.mouse.y - r.top) / R.scale; aim = Math.atan2(wy - (P.y - 4), wx - P.x); }
    return { mx: inp.mx, my: inp.my, aim, fire: inp.fire, reload: inp.reload, interactPressed: inp.interactPressed, interactHeld: inp.interactHeld, swap: inp.swap, slot: inp.slot };
  }
  const SFX_SHOT = { pip: 'pip', rattle: 'rattle', scatter: 'scatter', longthorn: 'longthorn', bubble: 'bubble', sunbeam: 'sunbeam', party: 'party' };
  function handleEvents() {
    for (const e of g.events) {
      R.fx(e, g);
      switch (e.t) {
        case 'shot': AU.sfx(SFX_SHOT[e.w] || 'pip'); if (e.shake > 1.5) I.rumble(60, 0.35); break;
        case 'hit': AU.sfx('hit'); break;
        case 'kill': AU.sfx(e.boss ? 'bigKill' : e.type === 'mossmaw' ? 'bigKill' : e.boom ? 'boomSmall' : 'kill'); break;
        case 'boom': AU.sfx(e.nuke ? 'boom' : 'boomSmall'); I.rumble(e.nuke ? 400 : 150, 0.8); break;
        case 'hurt': AU.sfx('hurt'); I.rumble(150, 0.7); break;
        case 'reload': AU.sfx('reload'); break; case 'reloaded': AU.sfx('reloaded'); break; case 'empty': AU.sfx('empty'); break; case 'swap': AU.sfx('swap'); break;
        case 'buy': AU.sfx('buy'); break; case 'deny': AU.sfx('deny'); break; case 'door': AU.sfx('door'); UI.banner(e.name + '<small>a new area is open</small>', false); break;
        case 'repair': AU.sfx('repair'); break; case 'plank': AU.sfx('plank'); break; case 'pickup': AU.sfx('pickup'); break; case 'drop': AU.sfx('drop'); break;
        case 'take': AU.sfx('buy'); break; case 'upgrade': AU.sfx('upgrade'); break; case 'revive': AU.sfx('revive'); break;
        case 'box': if (e.state === 'spin') AU.sfx('boxSpin'); else if (e.state === 'ready') AU.sfx('boxReady'); break;
        case 'split': AU.sfx('split'); break; case 'bite': AU.sfx('bite'); break; case 'spit': AU.sfx('spit'); break;
        case 'slamWarn': AU.sfx('slamWarn'); break; case 'slam': AU.sfx('slam'); break;
        case 'round': AU.sfx('round'); AU.setIntensity(e.round); UI.banner('ROUND ' + e.round + (e.boss ? '<small>the Elder Mossmaw is coming</small>' : ''), e.boss); if (e.boss) AU.sfx('boss'); break;
        case 'roundEnd': AU.sfx('roundEnd'); break;
        case 'bossSpawn': AU.sfx('boss'); break;
        case 'gameover': AU.sfx('gameover'); AU.music('off'); I.rumble(500, 0.9); overT = 1.4; break;
        default: break;
      }
    }
    g.events.length = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
  }
  function tick(dt) {
    if (state === 'play') {
      const inp = (D.dev && D.dev.input) ? D.dev.input(g, dt) : I.frame();          // D.dev only exists in tests (a bot plays through it)
      if (inp.pause) doPause();
      else if (g.over) { overT -= dt; if (overT <= 0 && state === 'play') { state = 'over'; UI.hud(false); UI.touch(false); I.resetTouch(); UI.gameOver(g); AU.music('over'); } handleEvents(); }
      else {
        const steps = (D.dev && D.dev.speed) || 1, si = simInput(inp);
        for (let i = 0; i < steps && !g.over; i++) { g.update(dt, si); if (i < steps - 1) g.events.length = 0; }
        handleEvents();
        hudT -= dt; if (hudT <= 0) { hudT = 0.09; UI.updateHud(g); }
      }
      R.draw(g, dt, null);
    } else {
      for (const k of I.takeMenu()) UI.menuKey(k);
      I.frame();
      const gg = g || demo;
      if (gg) R.draw(gg, state === 'pause' ? 0 : dt, null);
    }
  }

  // ---------- boot ----------
  function boot() {
    R.init(canvas);
    UI.init(onAction);
    I.bindMouse(canvas);
    I.bindTouch($('touch'), { baseL: $('baseL'), knobL: $('knobL'), baseR: $('baseR'), knobR: $('knobR'), use: $('tUse'), reload: $('tReload'), swap: $('tSwap'), pause: null });
    I.last = coarse ? 'touch' : 'kbm'; if (coarse) document.body.classList.add('touch');
    ensureDemo(); UI.show('sMenu'); AU.music('menu');
    $('boot').classList.add('gone'); setTimeout(() => $('boot').remove(), 400);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    requestAnimationFrame((t) => { last = t; frame(t); });
    if (document.fullscreenEnabled === false || /iPhone|iPad|iPod/.test(navigator.userAgent)) $('bFs').classList.add('hidden');
  }
  D.main = { state: () => state, game: () => g, start: startPlay, action: onAction, pause: doPause, tick };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
