// Feral 2.0 - input. Keyboard + mouse (pointer-lock look), PlayStation and other gamepads (Gamepad API), and touch (floating move stick, drag-to-look, fire button).
// The game always follows whichever device was used last, and the on-screen prompts switch with it.
(function () {
  const D = (window.DZF = window.DZF || {});
  const I = (D.input = {});
  I.last = 'kbm'; I.padConnected = false; I.padType = 'generic'; I.touchSeen = false; I.onLast = null; I.locked = false; I.noLock = false;
  I.settings = { mouseSens: 1, padSens: 1, touchSens: 1, invertY: false, invertYpad: false };
  let keys = {}, menuQ = [], stickL = null, padPrev = {}, wheel = 0, blockKeys = false, lookDX = 0, lookDY = 0, sprintToggle = false, touchLook = null;
  const edge = { reload: false, use: false, swap: 0, slot: null, pause: false };
  let useHeld = { key: false, pad: false, touch: false }, fireHeld = { mouse: false, pad: false, touch: false }, zoomHeld = { mouse: false, pad: false }, touchBtnFire = false;
  I.padLook = { x: 0, y: 0 };

  function setLast(l) { if (I.last !== l) { I.last = l; if (I.onLast) I.onLast(l); } }
  I.setBlock = (b) => { blockKeys = b; };
  I.glyph = function (action) {
    const ps = I.padType === 'ps';
    const map = {
      kbm: { use: 'E', reload: 'R', swap: 'Q', shoot: 'Click', zoom: 'Right click', sprint: 'Shift', pause: 'Esc', move: 'WASD', aim: 'Mouse', ok: 'Enter', back: 'Esc' },
      ps: { use: '✕', reload: '□', swap: '△', shoot: 'R2', zoom: 'L2', sprint: 'L3', pause: 'Options', move: 'Left stick', aim: 'Right stick', ok: '✕', back: '○' },
      pad: { use: 'A', reload: 'X', swap: 'Y', shoot: 'RT', zoom: 'LT', sprint: 'L3', pause: 'Menu', move: 'Left stick', aim: 'Right stick', ok: 'A', back: 'B' },
      touch: { use: 'Tap USE', reload: 'Tap RELOAD', swap: 'Tap SWAP', shoot: 'FIRE button', zoom: '', sprint: 'Push the stick all the way', pause: 'Pause button', move: 'Left stick', aim: 'Drag the right side', ok: 'Tap', back: 'Back' },
    };
    const set = I.last === 'pad' ? (ps ? map.ps : map.pad) : map[I.last] || map.kbm;
    return set[action] || '';
  };

  // ---------- keyboard ----------
  const GAME_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyE: 1, KeyR: 1, KeyQ: 1, Space: 1, Digit1: 1, Digit2: 1, Digit3: 1, ShiftLeft: 1, ShiftRight: 1, KeyF: 1 };
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
  function releaseAll() { keys = {}; useHeld = { key: false, pad: false, touch: false }; fireHeld = { mouse: false, pad: false, touch: false }; zoomHeld = { mouse: false, pad: false }; }
  window.addEventListener('blur', releaseAll);

  // ---------- mouse (pointer lock) ----------
  I.lock = function (el) {
    if (I.noLock || !el || !el.requestPointerLock) { I.noLock = true; return; }
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => { I.noLock = true; }); } catch (e) { I.noLock = true; }
  };
  I.unlock = function () { try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ } };
  I.bindMouse = function (el, onLockChange) {
    document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === el; if (!I.locked) { fireHeld.mouse = false; zoomHeld.mouse = false; } if (onLockChange) onLockChange(I.locked); });
    document.addEventListener('pointerlockerror', () => { I.noLock = true; if (onLockChange) onLockChange(false, true); });
    document.addEventListener('mousemove', (e) => {
      if (blockKeys) return;
      if (I.locked || I.noLock) { if (e.movementX || e.movementY) { setLast('kbm'); lookDX += e.movementX; lookDY += e.movementY; } }
    });
    el.addEventListener('mousedown', (e) => {
      if (blockKeys) return; setLast('kbm');
      if (!I.locked && !I.noLock && I.wantLock) I.lock(el);
      if (e.button === 0) fireHeld.mouse = true; else if (e.button === 2) zoomHeld.mouse = true; e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) fireHeld.mouse = false; if (e.button === 2) zoomHeld.mouse = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (blockKeys) return; setLast('kbm'); wheel += e.deltaY > 0 ? 1 : -1; }, { passive: true });
  };

  // ---------- touch: a floating move stick on the left, drag to look on the right, buttons ----------
  I.bindTouch = function (layer, els) {
    stickL = { id: null, base: els.baseL, knob: els.knobL, x0: 0, y0: 0, x: 0, y: 0, r: 56 };
    const btn = (el, down, up) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); setLast('touch'); I.touchSeen = true; el.classList.add('down'); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('down'); if (up) up(); };
      el.addEventListener('touchend', end, { passive: false }); el.addEventListener('touchcancel', end, { passive: false });
    };
    btn(els.fire, () => { touchBtnFire = true; }, () => { touchBtnFire = false; });
    btn(els.use, () => { edge.use = true; useHeld.touch = true; }, () => { useHeld.touch = false; });
    btn(els.reload, () => { edge.reload = true; });
    btn(els.swap, () => { edge.swap = 1; });
    btn(els.pause, () => { edge.pause = true; });
    layer.addEventListener('touchstart', (e) => {
      e.preventDefault(); setLast('touch'); I.touchSeen = true;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && stickL.id === null) { stickL.id = t.identifier; stickL.x0 = stickL.x = t.clientX; stickL.y0 = stickL.y = t.clientY; for (const n of [stickL.base, stickL.knob]) { n.style.left = t.clientX + 'px'; n.style.top = t.clientY + 'px'; n.classList.add('on'); } }
        else if (t.clientX >= window.innerWidth * 0.45 && !touchLook) touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    layer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (stickL.id === t.identifier) {
          stickL.x = t.clientX; stickL.y = t.clientY; const dx = stickL.x - stickL.x0, dy = stickL.y - stickL.y0, d = Math.hypot(dx, dy);
          if (d > stickL.r * 1.6) { const k = (1 - stickL.r * 1.6 / d) * 0.5; stickL.x0 += dx * k; stickL.y0 += dy * k; stickL.base.style.left = stickL.x0 + 'px'; stickL.base.style.top = stickL.y0 + 'px'; }
          const kk = Math.min(1, d / stickL.r), a = Math.atan2(dy, dx); stickL.knob.style.left = (stickL.x0 + Math.cos(a) * kk * stickL.r) + 'px'; stickL.knob.style.top = (stickL.y0 + Math.sin(a) * kk * stickL.r) + 'px';
        } else if (touchLook && touchLook.id === t.identifier) { lookDX += (t.clientX - touchLook.x) * 1.0; lookDY += (t.clientY - touchLook.y) * 1.0; touchLook.x = t.clientX; touchLook.y = t.clientY; touchLook.moved = true; }
      }
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) { if (stickL.id === t.identifier) { stickL.id = null; stickL.base.classList.remove('on'); stickL.knob.classList.remove('on'); } if (touchLook && touchLook.id === t.identifier) touchLook = null; }
    };
    layer.addEventListener('touchend', end, { passive: false }); layer.addEventListener('touchcancel', end, { passive: false });
  };
  function stickVec(s) {
    if (!s || s.id === null) return null;
    const dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy), k = Math.min(1, d / s.r);
    if (k < 0.12) return { x: 0, y: 0, mag: 0 };
    return { x: dx / d * k, y: dy / d * k, mag: k };
  }
  I.resetTouch = function () { if (stickL) { stickL.id = null; stickL.base.classList.remove('on'); stickL.knob.classList.remove('on'); } touchLook = null; touchBtnFire = false; useHeld.touch = false; };

  // ---------- gamepad ----------
  window.addEventListener('gamepadconnected', (e) => { I.padConnected = true; identify(e.gamepad); });
  window.addEventListener('gamepaddisconnected', () => { const any = [].slice.call(navigator.getGamepads ? navigator.getGamepads() : []).some((g) => g && g.connected); I.padConnected = any; if (!any && I.last === 'pad') setLast('kbm'); });
  function identify(g) { I.padType = /054c|playstation|dualshock|dualsense|wireless controller|ps4|ps5|sony/i.test(g.id || '') ? 'ps' : 'generic'; I.padId = g.id; }
  function dz(x, y, t) { const d = Math.hypot(x, y); if (d < t) return { x: 0, y: 0, mag: 0 }; const k = Math.min(1, (d - t) / (1 - t)); return { x: x / d * k, y: y / d * k, mag: k }; }
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let g = null;
    for (const p of pads) if (p && p.connected) { g = p; if (p.mapping === 'standard') break; }
    if (!g) return null;
    I.padConnected = true; identify(g);
    const b = (i) => (g.buttons[i] ? (g.buttons[i].value > 0.4 || g.buttons[i].pressed) : false);
    const cur = {}; for (let i = 0; i < 17; i++) cur[i] = b(i);
    const down = (i) => cur[i] && !padPrev[i];
    let active = false; for (let i = 0; i < 17; i++) if (cur[i]) active = true;
    const L = dz(g.axes[0] || 0, g.axes[1] || 0, 0.2), R = dz(g.axes[2] || 0, g.axes[3] || 0, 0.18);
    if (active || L.mag > 0.4 || R.mag > 0.4) setLast('pad');
    if (blockKeys) {
      if (down(12) || (L.y < -0.7 && !(padPrev.lu))) menuQ.push('up'); if (down(13) || (L.y > 0.7 && !(padPrev.ld))) menuQ.push('down');
      if (down(14) || (L.x < -0.7 && !(padPrev.ll))) menuQ.push('left'); if (down(15) || (L.x > 0.7 && !(padPrev.lr))) menuQ.push('right');
      if (down(0)) menuQ.push('ok'); if (down(1) || down(9)) menuQ.push('back');
    } else {
      if (down(2)) edge.reload = true; if (down(0)) edge.use = true; if (down(3) || down(5)) edge.swap = 1; if (down(4)) edge.swap = -1; if (down(9)) edge.pause = true;
      if (down(10)) sprintToggle = !sprintToggle;
      useHeld.pad = cur[0];
    }
    padPrev = Object.assign({}, cur, { lu: L.y < -0.7, ld: L.y > 0.7, ll: L.x < -0.7, lr: L.x > 0.7 });
    return { L, R, fire: !blockKeys && b(7), zoom: !blockKeys && b(6) };
  }

  // ---------- one frame of input for the game ----------
  I.frame = function (dt) {
    const pad = pollPad();
    let fwd = 0, strafe = 0, lx = 0, ly = 0, fire = false, zoom = false, sprint = false, source = null;
    if (!blockKeys) {
      strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      if (strafe && fwd) { strafe *= 0.7071; fwd *= 0.7071; }
      if (keys.ShiftLeft || keys.ShiftRight) sprint = true;
    }
    const sl = stickVec(stickL);
    if (sl && sl.mag > 0) { strafe = sl.x; fwd = -sl.y; if (sl.mag > 0.97) sprint = true; source = 'touch'; }
    if (pad && pad.L.mag > 0) { strafe = pad.L.x; fwd = -pad.L.y; if (sprintToggle) sprint = true; }
    if (!pad || pad.L.mag === 0) sprintToggle = false;
    // looking: mouse/touch deltas are in pixels; the stick turns at a speed
    const S = I.settings;
    let yaw = 0, pitch = 0;
    if (lookDX || lookDY) { const k = (touchLook || I.last === 'touch') ? 0.0052 * S.touchSens : 0.0021 * S.mouseSens; yaw = lookDX * k; pitch = lookDY * k * (S.invertY ? -1 : 1); source = I.last === 'touch' ? 'touch' : 'mouse'; }
    lookDX = lookDY = 0;
    I.padLook.x = I.padLook.y = 0;
    if (pad && pad.R.mag > 0) {
      const m = pad.R.mag, curve = m * (0.55 + 0.45 * m), sp = 3.1 * S.padSens * (dt || 1 / 60);
      I.padLook.x = pad.R.x / m * curve; I.padLook.y = pad.R.y / m * curve;
      yaw += I.padLook.x * sp; pitch += I.padLook.y * sp * 0.75 * (S.invertYpad ? -1 : 1); source = 'pad';
    }
    if (fireHeld.mouse && I.last === 'kbm') fire = true;
    if (touchBtnFire) fire = true;
    if (pad && pad.fire) fire = true;
    if (zoomHeld.mouse && I.last === 'kbm') zoom = true;
    if (pad && pad.zoom) zoom = true;
    const out = { fwd, strafe, yaw, pitch, fire, zoom, sprint, reload: edge.reload, interactPressed: edge.use, interactHeld: useHeld.key || useHeld.pad || useHeld.touch,
      swap: edge.swap || (wheel ? (wheel > 0 ? 1 : -1) : 0), slot: edge.slot, pause: edge.pause, source, padLook: I.padLook, touchFire: touchBtnFire };
    edge.reload = false; edge.use = false; edge.swap = 0; edge.slot = null; edge.pause = false; wheel = 0;
    return out;
  };
  I.takeMenu = function () { pollPad(); const q = menuQ; menuQ = []; return q; };
  I.clearEdges = function () { edge.reload = false; edge.use = false; edge.swap = 0; edge.slot = null; edge.pause = false; menuQ = []; wheel = 0; lookDX = lookDY = 0; };
  I.releaseAll = releaseAll;
  I.rumble = function (ms, strong) {
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.vibrationActuator && p.vibrationActuator.playEffect) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong || 0.5, weakMagnitude: (strong || 0.5) * 0.6 }); } catch (e) { /* not every browser has it */ }
    if (I.last === 'touch' && navigator.vibrate) { try { navigator.vibrate(Math.min(ms, 40)); } catch (e) { /* ignore */ } }
  };
  // for tests: feed raw look and key state
  I._test = { addLook(dx, dy) { lookDX += dx; lookDY += dy; }, setKey(code, v) { keys[code] = v; }, setFire(v) { fireHeld.mouse = v; }, press(what) { if (what === 'use') { edge.use = true; } if (what === 'reload') edge.reload = true; if (what === 'swap') edge.swap = 1; }, setUseHeld(v) { useHeld.key = v; } };
})();
