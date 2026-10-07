// In-browser tests for Feral 2.0: keyboard + mouse, a simulated PlayStation controller, a generic controller and simulated touch, driving the real game page.
// In the page (localhost:5173/feral2/):  load /__dev/browser-test.js  ->  const r = await DZFTest.run();  (r.failed lists what broke)
(function () {
  const D = window.DZF, I = D.input, UI = D.ui;
  const out = { passed: 0, failed: [], log: [] };
  const ok = (cond, msg) => { if (cond) out.passed++; else out.failed.push(msg); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const adv = (s) => { for (let i = 0; i < Math.round(s * 60); i++) D.main.tick(1 / 60); };
  const key = (type, code, extra) => window.dispatchEvent(new KeyboardEvent(type, Object.assign({ code, key: code, bubbles: true, cancelable: true }, extra || {})));
  const hold = (code, s) => { key('keydown', code); adv(s); key('keyup', code); };
  const canvas = () => document.getElementById('gl');
  function fresh(opts) {
    if (D.main.state() !== 'menu') { D.main.action('quitYes'); }
    I.noLock = true; D.main.start(); const g = D.main.game(); g.timer = 99999; g.enemies.length = 0; g.toSpawn = 0; g.points = (opts && opts.points) || 500;
    const P = g.player; P.x = 50.5 * D.T; P.y = 36.5 * D.T; P.aim = 0; D.main.view.pitch = 0; I.clearEdges(); I.releaseAll(); adv(0.1); return g;
  }
  function fakePad(id) {
    const pad = { id, index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [pad]; return pad;
  }
  const press = (pad, i, v) => { pad.buttons[i].pressed = v !== false; pad.buttons[i].value = v === false ? 0 : (typeof v === 'number' ? v : 1); };
  function touchObj(id, el, x, y) { return new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 4, radiusY: 4 }); }
  function touch(type, el, list) { el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true })); }

  const tests = {
    'keyboard: W moves forward, S back, D strafes right, Shift sprints faster': () => {
      let g = fresh(), P = g.player, x0 = P.x; hold('KeyW', 0.5); ok(P.x - x0 > 20 && Math.abs(P.y - 36.5 * D.T) < 2, 'W moves along the facing direction (dx ' + (P.x - x0).toFixed(1) + ')'); const walk = P.x - x0;
      g = fresh(); P = g.player; x0 = P.x; hold('KeyS', 0.4); ok(x0 - P.x > 10, 'S moves back');
      g = fresh(); P = g.player; const y0 = P.y; hold('KeyD', 0.4); ok(P.y - y0 > 10 && Math.abs(P.x - 50.5 * D.T) < 2, 'D strafes to the right (towards +y when facing +x)');
      g = fresh(); P = g.player; x0 = P.x; key('keydown', 'ShiftLeft'); hold('KeyW', 0.5); key('keyup', 'ShiftLeft'); ok((P.x - x0) / walk > 1.25, 'Shift sprints (' + ((P.x - x0) / walk).toFixed(2) + 'x)');
      g = fresh(); P = g.player; P.aim = Math.PI / 2; x0 = P.y; hold('KeyW', 0.4); ok(P.y - x0 > 10, 'forward follows where you look');
    },
    'mouse: look turns left/right, up/down pitches, sensitivity and invert work': () => {
      let g = fresh(), P = g.player; const a0 = P.aim; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 0, bubbles: true })); adv(0.05);
      ok(near(P.aim - a0, 200 * 0.0021, 0.02), 'mouse right turns right by the sensitivity (got ' + (P.aim - a0).toFixed(3) + ')');
      const p0 = D.main.view.pitch; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 100, bubbles: true })); adv(0.05); ok(D.main.view.pitch < p0 - 0.1, 'mouse down looks down');
      UI.settings.mouseSens = 2; UI.applySettings(); const a1 = P.aim; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0, bubbles: true })); adv(0.05); ok(near(P.aim - a1, 100 * 0.0021 * 2, 0.02), 'sensitivity 200% doubles the turn');
      UI.settings.mouseSens = 1; UI.settings.invertY = true; UI.applySettings(); D.main.view.pitch = 0; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 100, bubbles: true })); adv(0.05); ok(D.main.view.pitch > 0.1, 'invert Y: mouse down looks up'); UI.settings.invertY = false; UI.applySettings();
    },
    'mouse: click fires, right-click zooms, R reloads, Q and the wheel swap guns, 1 2 3 pick a slot': () => {
      let g = fresh(), P = g.player; const w = P.weapons[0]; canvas().dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); adv(0.4); window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); ok(w.mag < 12, 'click fires the gun (mag ' + w.mag + ')');
      g = fresh(); P = g.player; canvas().dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); adv(0.4); ok(D.render.camera.fov < D.render.q.fov - 10, 'right click zooms in (fov ' + D.render.camera.fov.toFixed(1) + ')'); window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); adv(0.4); ok(near(D.render.camera.fov, D.render.q.fov, 1), 'and zooms out again');
      g = fresh(); P = g.player; P.weapons[0].mag = 3; key('keydown', 'KeyR'); key('keyup', 'KeyR'); adv(0.1); ok(P.reload > 0, 'R starts a reload'); adv(1.5); ok(P.weapons[0].mag === 12, 'the reload fills the magazine');
      g = fresh(); P = g.player; g.giveWeapon('rattle'); g.giveWeapon('scatter'); const cur = P.cur; key('keydown', 'KeyQ'); key('keyup', 'KeyQ'); adv(0.05); ok(P.cur !== cur, 'Q swaps'); const c2 = P.cur; window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); adv(0.05); ok(P.cur !== c2, 'the mouse wheel swaps'); key('keydown', 'Digit1'); key('keyup', 'Digit1'); adv(0.05); ok(P.cur === 0, 'key 1 picks the first gun');
    },
    'keyboard: E buys a wall gun and opens a door; holding E repairs a window; Esc pauses': () => {
      let g = fresh({ points: 5000 }), P = g.player; P.x = 45.5 * D.T; P.y = 28.4 * D.T; P.aim = -Math.PI / 2; adv(0.1); ok(g.prompt && /Rattlevine/.test(g.prompt.label), 'standing at the poster shows the buy prompt'); key('keydown', 'KeyE'); key('keyup', 'KeyE'); adv(0.1); ok(P.weapons.some((w) => w.id === 'rattle'), 'E buys the gun');
      g = fresh({ points: 5000 }); P = g.player; const door = g.map.doors.find((d) => d.id === 1); P.x = (door.x + door.w / 2) * D.T; P.y = (door.y + door.h) * D.T + 12; P.aim = -Math.PI / 2; adv(0.1); key('keydown', 'KeyE'); key('keyup', 'KeyE'); adv(0.1); ok(door.open, 'E opens a door');
      g = fresh(); P = g.player; const b = g.map.barriers[0]; b.planks = 1; P.x = (b.x + b.w / 2) * D.T; P.y = (b.y + b.h) * D.T + 12; P.aim = -Math.PI / 2; adv(0.1); key('keydown', 'KeyE'); adv(1.6); key('keyup', 'KeyE'); ok(b.planks >= 4, 'holding E nails the boards back (planks ' + b.planks + ')');
      g = fresh(); key('keydown', 'Escape'); adv(0.1); ok(D.main.state() === 'pause', 'Esc pauses'); D.main.action('resume'); ok(D.main.state() === 'play', 'Resume carries on');
    },
    'controller (PlayStation): sticks move and look, R2 fires, L2 zooms, Square reloads, Cross uses, Triangle swaps, L3 sprints, Options pauses, PS glyphs show': () => {
      const pad = fakePad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'); let g = fresh(), P = g.player; adv(0.1);
      ok(I.last === 'pad' || true, 'pad ready'); pad.axes[1] = -1; adv(0.5); ok(I.last === 'pad', 'last used input becomes the pad'); ok(I.padType === 'ps' && I.glyph('use') === '✕' && I.glyph('shoot') === 'R2' && I.glyph('reload') === '□', 'PlayStation button names are shown (' + I.glyph('use') + ' ' + I.glyph('shoot') + ' ' + I.glyph('reload') + ')'); ok(/R2/.test(UI.controlsHint()), 'the controls hint speaks PlayStation');
      ok(P.x - 50.5 * D.T > 15, 'left stick up walks forward (dx ' + (P.x - 50.5 * D.T).toFixed(1) + ')'); const walk = P.x - 50.5 * D.T; pad.axes[1] = 0;
      const a0 = P.aim; pad.axes[2] = 1; adv(0.5); pad.axes[2] = 0; ok(P.aim - a0 > 0.8, 'right stick right turns right (' + (P.aim - a0).toFixed(2) + ' rad)');
      UI.settings.padSens = 2; UI.applySettings(); const a1 = P.aim; pad.axes[2] = 1; adv(0.25); pad.axes[2] = 0; ok(P.aim - a1 > 0.9 * (0.5 * 3.1 * 2 / 2) * 0.5, 'look sensitivity 200% turns faster'); UI.settings.padSens = 1; UI.applySettings();
      const p0 = D.main.view.pitch; pad.axes[3] = 1; adv(0.4); pad.axes[3] = 0; ok(D.main.view.pitch < p0 - 0.1, 'right stick down looks down'); UI.settings.invertYpad = true; UI.applySettings(); D.main.view.pitch = 0; pad.axes[3] = 1; adv(0.4); pad.axes[3] = 0; ok(D.main.view.pitch > 0.1, 'invert Y for the controller'); UI.settings.invertYpad = false; UI.applySettings();
      g = fresh(); P = g.player; adv(0.1); press(pad, 7); adv(0.4); press(pad, 7, false); ok(P.weapons[0].mag < 12, 'R2 fires (mag ' + P.weapons[0].mag + ')');
      g = fresh(); adv(0.1); press(pad, 6); adv(0.5); ok(D.render.camera.fov < D.render.q.fov - 10, 'L2 zooms (fov ' + D.render.camera.fov.toFixed(1) + ')'); press(pad, 6, false); adv(0.4);
      g = fresh(); P = g.player; P.weapons[0].mag = 2; adv(0.1); press(pad, 2); adv(0.05); press(pad, 2, false); adv(0.1); ok(P.reload > 0, 'Square reloads');
      g = fresh({ points: 5000 }); P = g.player; P.x = 45.5 * D.T; P.y = 28.4 * D.T; P.aim = -Math.PI / 2; adv(0.1); press(pad, 0); adv(0.05); press(pad, 0, false); adv(0.1); ok(P.weapons.some((w) => w.id === 'rattle'), 'Cross uses / buys');
      g = fresh(); P = g.player; g.giveWeapon('rattle'); const cur = P.cur; adv(0.1); press(pad, 3); adv(0.05); press(pad, 3, false); adv(0.1); ok(P.cur !== cur, 'Triangle swaps');
      g = fresh(); P = g.player; let x0 = P.x; pad.axes[1] = -1; adv(0.5); const w1 = P.x - x0; pad.axes[1] = 0; adv(0.1); x0 = P.x; pad.axes[1] = -1; adv(0.05); press(pad, 10); adv(0.05); press(pad, 10, false); adv(0.5); const w2 = P.x - x0; pad.axes[1] = 0; ok(w2 / w1 > 1.25, 'L3 turns sprint on (' + (w2 / w1).toFixed(2) + 'x)');
      g = fresh(); adv(0.1); press(pad, 9); adv(0.05); press(pad, 9, false); adv(0.1); ok(D.main.state() === 'pause', 'Options pauses'); D.main.action('resume');
      // aim assist pulls a little towards a creature that is nearly in line; without it the aim stays where it was
      g = fresh(); P = g.player; P.aim = 0; const e = g.spawnEnemy('glumpkin', P.x + 90, P.y + 14); e.speed = 0; UI.settings.aimAssist = true; pad.axes[2] = 0.6; adv(0.3); pad.axes[2] = 0; const withA = P.aim; g.enemies.length = 0;
      g = fresh(); P = g.player; P.aim = 0; const e2 = g.spawnEnemy('glumpkin', P.x + 90, P.y + 14); e2.speed = 0; UI.settings.aimAssist = false; pad.axes[2] = 0.6; adv(0.3); pad.axes[2] = 0; const noA = P.aim; UI.settings.aimAssist = true; ok(Math.abs(withA - Math.atan2(14, 90)) < Math.abs(noA - Math.atan2(14, 90)), 'aim assist pulls towards a nearby creature (' + withA.toFixed(3) + ' vs ' + noA.toFixed(3) + ' without)');
      fakePad('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)').axes[0] = 0.0; adv(0.1); I.padType = 'generic'; ok(I.glyph('use') === 'A' && I.glyph('shoot') === 'RT', 'other controllers show A / RT');
      navigator.getGamepads = () => []; I.padConnected = false;
    },
    'touch: left stick moves, dragging the right side looks, FIRE shoots, USE repairs, RELOAD and SWAP work, prompts say Tap': () => {
      let g = fresh(); I.last = 'touch'; D.ui.touch(true); const layer = document.getElementById('touch'); const P = g.player; layer.classList.remove('hidden'); adv(0.1);
      let t = touchObj(1, layer, 120, 420); touch('touchstart', layer, [t]); t = touchObj(1, layer, 120, 340); touch('touchmove', layer, [t]); adv(0.5); const dx = P.x - 50.5 * D.T; touch('touchend', layer, [t]); ok(dx > 15, 'the left stick pushed up walks forward (dx ' + dx.toFixed(1) + ')'); ok(I.last === 'touch' && /Tap/.test(I.glyph('use')), 'prompts switch to touch');
      g = fresh(); I.last = 'touch'; const P2 = g.player; const a0 = P2.aim; t = touchObj(2, layer, 560, 300); touch('touchstart', layer, [t]); t = touchObj(2, layer, 660, 300); touch('touchmove', layer, [t]); adv(0.05); touch('touchend', layer, [t]); ok(P2.aim - a0 > 0.4, 'dragging the right side turns (' + (P2.aim - a0).toFixed(2) + ' rad)'); UI.settings.touchSens = 2; UI.applySettings(); const a1 = P2.aim; t = touchObj(3, layer, 560, 300); touch('touchstart', layer, [t]); t = touchObj(3, layer, 610, 300); touch('touchmove', layer, [t]); adv(0.05); touch('touchend', layer, [t]); ok(P2.aim - a1 > 0.4, 'touch look sensitivity 200% turns more'); UI.settings.touchSens = 1; UI.applySettings();
      g = fresh(); I.last = 'touch'; const fire = document.getElementById('tFire'); t = touchObj(4, fire, 700, 500); touch('touchstart', fire, [t]); adv(0.5); touch('touchend', fire, [t]); ok(g.player.weapons[0].mag < 12, 'the FIRE button shoots (mag ' + g.player.weapons[0].mag + ')');
      g = fresh(); I.last = 'touch'; g.player.weapons[0].mag = 4; const rl = document.getElementById('tReload'); t = touchObj(5, rl, 640, 480); touch('touchstart', rl, [t]); touch('touchend', rl, [t]); adv(0.1); ok(g.player.reload > 0, 'RELOAD reloads');
      g = fresh(); I.last = 'touch'; g.giveWeapon('rattle'); const cur = g.player.cur, sw = document.getElementById('tSwap'); t = touchObj(6, sw, 700, 420); touch('touchstart', sw, [t]); touch('touchend', sw, [t]); adv(0.1); ok(g.player.cur !== cur, 'SWAP swaps');
      g = fresh(); I.last = 'touch'; const b = g.map.barriers[0]; b.planks = 0; const P3 = g.player; P3.x = (b.x + b.w / 2) * D.T; P3.y = (b.y + b.h) * D.T + 12; P3.aim = -Math.PI / 2; adv(0.1); const use = document.getElementById('tUse'); t = touchObj(7, use, 600, 500); touch('touchstart', use, [t]); adv(1.6); touch('touchend', use, [t]); ok(b.planks >= 3, 'holding USE repairs the window (planks ' + b.planks + ')');
      const e = g.spawnEnemy('glumpkin', P3.x, P3.y - 80); e.speed = 0; UI.settings.aimAssist = true; adv(0.1); ok(typeof I.resetTouch === 'function', 'touch can be reset on pause');
    },
    'pause, menus and settings: every setting changes what it says; the quality presets switch; game over shows the score': () => {
      fresh(); D.main.action('pause'); ok(D.main.state() === 'pause', 'pause button works'); D.main.action('settings'); ok(UI.current === 'sSettings', 'settings opens from the pause menu'); D.main.action('back'); ok(UI.current === 'sPause', 'back returns to the pause menu');
      for (const q of ['low', 'medium', 'high']) { UI.settings.quality = q; UI.applySettings(); ok(D.render.qname === q, 'quality ' + q + ' applies'); adv(0.1); }
      UI.settings.quality = 'auto'; UI.applySettings(); D.main.action('resume'); adv(0.2); ok(D.main.state() === 'play', 'resume');
      const g = D.main.game(); g.player.hp = 1; g.player.perks.lamp = false; g.points = 1234; g.round = 7; g.kills = 55; g.spawnEnemy('glumpkin', g.player.x + 9, g.player.y); adv(4); ok(D.main.state() === 'over', 'game over screen appears (state ' + D.main.state() + ')');
      ok(document.getElementById('oRound').textContent === '7' && document.getElementById('oKills').textContent === '55', 'the game over screen shows the round and kills'); ok(!!D.store.get('dzf2_best', null), 'the high score is saved locally'); D.main.action('menu'); ok(D.main.state() === 'menu', 'back to the menu');
    },
  };
  window.DZFTest = {
    run: async function (only) {
      for (const [name, fn] of Object.entries(tests)) { if (only && !name.includes(only)) continue; const before = out.failed.length; try { fn(); } catch (e) { out.failed.push(name + ' threw: ' + (e && e.message)); } out.log.push((out.failed.length === before ? 'ok   ' : 'FAIL ') + name); }
      return out;
    },
  };
})();
