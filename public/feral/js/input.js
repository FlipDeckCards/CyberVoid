// Dead Zone: Feral - input. Touch twin-stick, keyboard + mouse, and gamepads (PlayStation pads first, any standard pad works). The game always follows whichever
// device was used last, and the on-screen prompts switch with it.
(function () {
  const D = (window.DZF = window.DZF || {});
  const I = (D.input = {});
  I.last = 'kbm'; I.padConnected = false; I.padType = 'generic'; I.touchSeen = false;
  I.onLast = null; I.settings = { autoFire: true, leftHand: false };
  I.mouse = { x: 0, y: 0, has: false, down: false };
  I.aim = { x: 1, y: 0, active: false, fromStick: false };
  I.move = { x: 0, y: 0 };
  let keys = {}, menuQ = [], pressed = {}, stickL = null, stickR = null, padPrev = {}, padAimAngle = null, wheel = 0, blockKeys = false, padLastMove = 0;
  const edge = { reload: false, use: false, swap: 0, slot: null, pause: false };
  let touchBtn = { use: false, reload: false };
  let useHeld = { key: false, pad: false, touch: false }, fireHeld = { mouse: false, pad: false, touch: false };

  function setLast(l) { if (I.last !== l) { I.last = l; if (I.onLast) I.onLast(l); } }
  I.setBlock = (b) => { blockKeys = b; };                     // true while a menu is on screen: keys then drive the menu, not the game
  I.glyph = function (action) {
    const ps = I.padType === 'ps';
    const map = {
      kbm: { use: 'E', reload: 'R', swap: 'Q', shoot: 'Click', pause: 'Esc', move: 'WASD', aim: 'Mouse', ok: 'Enter', back: 'Esc' },
      ps: { use: '✕', reload: '□', swap: '△', shoot: 'R2', pause: 'Options', move: 'Left stick', aim: 'Right stick', ok: '✕', back: '○' },
      pad: { use: 'A', reload: 'X', swap: 'Y', shoot: 'RT', pause: 'Menu', move: 'Left stick', aim: 'Right stick', ok: 'A', back: 'B' },
      touch: { use: 'Tap USE', reload: 'Tap RELOAD', swap: 'Tap SWAP', shoot: 'Right stick', pause: 'Pause button', move: 'Left stick', aim: 'Right stick', ok: 'Tap', back: 'Back' },
    };
    const set = I.last === 'pad' ? (ps ? map.ps : map.pad) : map[I.last] || map.kbm;
    return set[action] || '';
  };

  // ---------- keyboard ----------
  const GAME_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyE: 1, KeyR: 1, KeyQ: 1, Space: 1, Digit1: 1, Digit2: 1, Digit3: 1 };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    setLast('kbm');
    if (blockKeys) {
      const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'ok', Space: 'ok', Escape: 'back' }[e.code];
      if (m) { menuQ.push(m); if (e.code !== 'Enter' || (e.target && e.target.tagName !== 'BUTTON')) e.preventDefault(); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') { edge.pause = true; e.preventDefault(); return; }
    if (!GAME_KEYS[e.code]) return;
    e.preventDefault();
    if (!keys[e.code]) {
      if (e.code === 'KeyR') edge.reload = true;
      if (e.code === 'KeyE') { edge.use = true; useHeld.key = true; }
      if (e.code === 'KeyQ') edge.swap = 1;
      if (e.code === 'Digit1') edge.slot = 0; if (e.code === 'Digit2') edge.slot = 1; if (e.code === 'Digit3') edge.slot = 2;
    }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyE') useHeld.key = false; });
  window.addEventListener('blur', () => { keys = {}; useHeld = { key: false, pad: false, touch: false }; fireHeld = { mouse: false, pad: false, touch: false }; });

  // ---------- mouse ----------
  I.bindMouse = function (el) {
    el.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 0 || !I.mouse.has) setLast('kbm'); I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.has = true; });
    el.addEventListener('mousedown', (e) => { if (e.button !== 0) return; setLast('kbm'); I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.has = true; fireHeld.mouse = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) fireHeld.mouse = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { if (blockKeys) return; e.preventDefault(); setLast('kbm'); wheel += e.deltaY > 0 ? 1 : -1; }, { passive: false });
  };

  // ---------- touch: two floating sticks and big buttons ----------
  I.bindTouch = function (layer, els) {
    const mk = (base, knob) => ({ id: null, base, knob, x0: 0, y0: 0, x: 0, y: 0, r: 52 });
    stickL = mk(els.baseL, els.knobL); stickR = mk(els.baseR, els.knobR);
    const btn = (el, down, up) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); setLast('touch'); I.touchSeen = true; el.classList.add('down'); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('down'); if (up) up(); };
      el.addEventListener('touchend', end, { passive: false }); el.addEventListener('touchcancel', end, { passive: false });
    };
    btn(els.use, () => { edge.use = true; useHeld.touch = true; }, () => { useHeld.touch = false; });
    btn(els.reload, () => { edge.reload = true; });
    btn(els.swap, () => { edge.swap = 1; });
    btn(els.pause, () => { edge.pause = true; });
    const place = (s, t, show) => {
      const sx = t.clientX, sy = t.clientY; s.x0 = sx; s.y0 = sy; s.x = sx; s.y = sy;
      s.base.style.left = sx + 'px'; s.base.style.top = sy + 'px'; s.knob.style.left = sx + 'px'; s.knob.style.top = sy + 'px'; s.base.classList.add('on'); s.knob.classList.add('on');
      void show;
    };
    layer.addEventListener('touchstart', (e) => {
      e.preventDefault(); setLast('touch'); I.touchSeen = true;
      for (const t of e.changedTouches) {
        const left = t.clientX < window.innerWidth / 2, wantLeft = I.settings.leftHand ? !left : left;      // left-handed mode swaps the sticks
        const s = wantLeft ? stickL : stickR;
        if (s.id === null) { s.id = t.identifier; place(s, t); }
      }
    }, { passive: false });
    layer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) for (const s of [stickL, stickR]) if (s.id === t.identifier) {
        s.x = t.clientX; s.y = t.clientY;
        const dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy);
        if (d > s.r * 1.6) { s.x0 += dx * (1 - s.r * 1.6 / d) * 0.5; s.y0 += dy * (1 - s.r * 1.6 / d) * 0.5; s.base.style.left = s.x0 + 'px'; s.base.style.top = s.y0 + 'px'; }       // the base follows the thumb if it drifts far
        const k = Math.min(1, d / s.r), a = Math.atan2(dy, dx);
        s.knob.style.left = (s.x0 + Math.cos(a) * k * s.r) + 'px'; s.knob.style.top = (s.y0 + Math.sin(a) * k * s.r) + 'px';
      }
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) for (const s of [stickL, stickR]) if (s.id === t.identifier) { s.id = null; s.base.classList.remove('on'); s.knob.classList.remove('on'); }
    };
    layer.addEventListener('touchend', end, { passive: false }); layer.addEventListener('touchcancel', end, { passive: false });
  };
  function stickVec(s) {
    if (!s || s.id === null) return null;
    const dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy), k = Math.min(1, d / s.r);
    if (k < 0.12) return { x: 0, y: 0, mag: 0 };
    return { x: dx / d * k, y: dy / d * k, mag: k };
  }
  I.resetTouch = function () { for (const s of [stickL, stickR]) if (s) { s.id = null; s.base.classList.remove('on'); s.knob.classList.remove('on'); } useHeld.touch = false; fireHeld.touch = false; };

  // ---------- gamepad ----------
  window.addEventListener('gamepadconnected', (e) => { I.padConnected = true; identify(e.gamepad); });
  window.addEventListener('gamepaddisconnected', () => { const any = [].slice.call(navigator.getGamepads ? navigator.getGamepads() : []).some((g) => g && g.connected); I.padConnected = any; if (!any && I.last === 'pad') setLast('kbm'); });
  function identify(g) { I.padType = /054c|playstation|dualshock|dualsense|wireless controller|ps4|ps5|sony/i.test(g.id || '') ? 'ps' : 'generic'; I.padId = g.id; }
  function dz(x, y, t) { const d = Math.hypot(x, y); if (d < t) return { x: 0, y: 0, mag: 0 }; const k = Math.min(1, (d - t) / (1 - t)); return { x: x / d * k, y: y / d * k, mag: k }; }
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let g = null;
    for (const p of pads) if (p && p.connected) { g = p; if (p.mapping === 'standard') break; }
    if (!g) return null;
    if (!I.padConnected) { I.padConnected = true; } identify(g);
    const b = (i) => (g.buttons[i] ? (g.buttons[i].value > 0.4 || g.buttons[i].pressed) : false);
    const cur = {}; for (let i = 0; i < 17; i++) cur[i] = b(i);
    const down = (i) => cur[i] && !padPrev[i];
    let active = false; for (let i = 0; i < 17; i++) if (cur[i]) active = true;
    const L = dz(g.axes[0] || 0, g.axes[1] || 0, 0.2), R = dz(g.axes[2] || 0, g.axes[3] || 0, 0.22);
    if (active || L.mag > 0.4 || R.mag > 0.4) { setLast('pad'); padLastMove = performance.now(); }
    // menus
    if (blockKeys) {
      if (down(12) || (L.y < -0.7 && !(padPrev.lu))) menuQ.push('up'); if (down(13) || (L.y > 0.7 && !(padPrev.ld))) menuQ.push('down');
      if (down(14) || (L.x < -0.7 && !(padPrev.ll))) menuQ.push('left'); if (down(15) || (L.x > 0.7 && !(padPrev.lr))) menuQ.push('right');
      if (down(0)) menuQ.push('ok'); if (down(1) || down(9)) menuQ.push('back');
    } else {
      if (down(2)) edge.reload = true; if (down(0)) { edge.use = true; } if (down(3) || down(5)) edge.swap = 1; if (down(4)) edge.swap = -1; if (down(9)) edge.pause = true;
      useHeld.pad = cur[0];
    }
    padPrev = Object.assign({}, cur, { lu: L.y < -0.7, ld: L.y > 0.7, ll: L.x < -0.7, lr: L.x > 0.7 });
    const fire = !blockKeys && b(7);
    return { L, R, fire };
  }

  // ---------- one frame of input for the game ----------
  I.frame = function () {
    const pad = pollPad();
    let mx = 0, my = 0, ax = null, ay = null, aimActive = false, fire = false, aimFrom = null;
    if (!blockKeys) {
      mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    }
    const sl = stickVec(stickL), sr = stickVec(stickR);
    if (sl && sl.mag > 0) { mx = sl.x; my = sl.y; }
    if (pad && pad.L.mag > 0) { mx = pad.L.x; my = pad.L.y; }
    // aiming and shooting
    if (sr && sr.mag > 0) { ax = sr.x; ay = sr.y; aimActive = true; aimFrom = 'touch'; if (I.settings.autoFire && sr.mag > 0.28) fire = true; fireHeld.touch = fire; }
    else fireHeld.touch = false;
    if (pad) { if (pad.R.mag > 0.3) { ax = pad.R.x; ay = pad.R.y; aimActive = true; aimFrom = 'pad'; padAimAngle = Math.atan2(ay, ax); } if (pad.fire) fire = true; }
    if (fireHeld.mouse && I.last === 'kbm') fire = true;
    if (!aimActive && I.last === 'pad' && padAimAngle != null) { ax = Math.cos(padAimAngle); ay = Math.sin(padAimAngle); aimFrom = 'pad'; }
    if (ax != null) { I.aim.x = ax; I.aim.y = ay; }
    I.aim.active = aimActive; I.aim.from = aimFrom; I.move.x = mx; I.move.y = my;
    const out = { mx, my, fire, reload: edge.reload, interactPressed: edge.use, interactHeld: useHeld.key || useHeld.pad || useHeld.touch, swap: edge.swap || (wheel ? (wheel > 0 ? 1 : -1) : 0), slot: edge.slot, pause: edge.pause, aimVec: aimFrom ? { x: I.aim.x, y: I.aim.y } : null, aimFrom, mouse: I.last === 'kbm' && I.mouse.has && !aimFrom ? I.mouse : null };
    edge.reload = false; edge.use = false; edge.swap = 0; edge.slot = null; edge.pause = false; wheel = 0;
    return out;
  };
  I.takeMenu = function () { pollPad(); const q = menuQ; menuQ = []; return q; };
  I.clearEdges = function () { edge.reload = false; edge.use = false; edge.swap = 0; edge.slot = null; edge.pause = false; menuQ = []; wheel = 0; };
  I.rumble = function (ms, strong) {
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong || 0.5, weakMagnitude: (strong || 0.5) * 0.6 }); } catch (e) { /* not every browser has it */ }
    if (I.last === 'touch' && navigator.vibrate) { try { navigator.vibrate(Math.min(ms, 40)); } catch (e) { /* ignore */ } }
  };
  void padLastMove;
})();
