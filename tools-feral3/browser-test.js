// In-browser tests for Feral 3.0: keyboard + mouse, a simulated PlayStation controller, a generic controller and simulated touch, driving the real game page.
// In the page (localhost:5174/feral3/):  load /__dev/browser-test.js  ->  const r = await DZFTest.run();  (r.failed lists what broke)
(function () {
  const F = window.__feral3, I = F.I, UI = F.UI, D = F.D;
  const out = { passed: 0, failed: [], log: [] };
  const ok = (cond, msg) => { if (cond) out.passed++; else out.failed.push(msg); };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const adv = (s) => { for (let i = 0; i < Math.round(s * 60); i++) F.tick(1 / 60); };
  const key = (type, code, extra) => window.dispatchEvent(new KeyboardEvent(type, Object.assign({ code, key: code, bubbles: true, cancelable: true }, extra || {})));
  const hold = (code, s) => { key('keydown', code); adv(s); key('keyup', code); };
  const canvas = () => document.getElementById('gl');
  function fresh(opts) {
    if (F.state() !== 'menu') F.action('quitYes'); I.noLock = true; F.action('play'); F.action('start'); const g = F.game(); g.timer = 99999; g.enemies.length = 0; g.toSpawn = 0; g.points = (opts && opts.points) || 500;
    const P = g.player; P.x = 64.5 * D.T; P.y = 66.5 * D.T; P.aim = 0; F.view.pitch = 0; I.clearEdges(); I.releaseAll(); adv(0.15); return g;
  }
  function fakePad(id) { const pad = { id, index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [pad]; return pad; }
  const press = (pad, i, v) => { pad.buttons[i].pressed = v !== false; pad.buttons[i].value = v === false ? 0 : 1; };
  function touchObj(id, el, x, y) { return new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 4, radiusY: 4 }); }
  function touch(type, el, list) { el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true })); }
  const P0 = [64.5 * D.T, 66.5 * D.T];

  const tests = {
    'keyboard: W/S/A/D move relative to where you look; Shift sprints faster; Ctrl crouches (lower eye, slower)': () => {
      let g = fresh(), P = g.player, x0 = P.x; hold('KeyW', 0.5); ok(P.x - x0 > 20 && Math.abs(P.y - P0[1]) < 2, 'W moves forward (dx ' + (P.x - x0).toFixed(1) + ')'); const walk = P.x - x0;
      g = fresh(); P = g.player; x0 = P.x; hold('KeyS', 0.4); ok(x0 - P.x > 8, 'S moves back');
      g = fresh(); P = g.player; const y0 = P.y; hold('KeyD', 0.4); ok(P.y - y0 > 8, 'D strafes right');
      g = fresh(); P = g.player; x0 = P.x; key('keydown', 'ShiftLeft'); hold('KeyW', 0.5); key('keyup', 'ShiftLeft'); ok((P.x - x0) / walk > 1.25, 'Shift sprints (' + ((P.x - x0) / walk).toFixed(2) + 'x)');
      g = fresh(); P = g.player; x0 = P.x; key('keydown', 'ControlLeft'); adv(0.5); ok(P.eye < 1.2, 'Ctrl crouches (eye ' + P.eye.toFixed(2) + ')'); hold('KeyW', 0.5); ok((P.x - x0) / walk < 0.8, 'crouching is slower'); key('keyup', 'ControlLeft'); adv(0.5); ok(P.eye > 1.5, 'standing up again');
    },
    'mouse: look turns and pitches, sensitivity and invert Y work; click fires, right-click aims down sights (zoom), R reloads, Q / wheel / 1-3 swap': () => {
      let g = fresh(), P = g.player; const a0 = P.aim; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 0, bubbles: true })); adv(0.05); ok(near(P.aim - a0, 200 * 0.0021, 0.03), 'mouse right turns right (' + (P.aim - a0).toFixed(3) + ')');
      const p0 = F.view.pitch; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 100, bubbles: true })); adv(0.05); ok(F.view.pitch < p0 - 0.1, 'mouse down looks down');
      UI.settings.invertY = true; UI.applySettings(); F.view.pitch = 0; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 100, bubbles: true })); adv(0.05); ok(F.view.pitch > 0.1, 'invert Y'); UI.settings.invertY = false; UI.applySettings();
      UI.settings.mouseSens = 2; UI.applySettings(); const a1 = P.aim; document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0, bubbles: true })); adv(0.05); ok(near(P.aim - a1, 100 * 0.0021 * 2, 0.03), 'sensitivity 200% doubles it'); UI.settings.mouseSens = 1; UI.applySettings();
      g = fresh(); P = g.player; const w = P.weapons[0]; canvas().dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); adv(0.4); window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); ok(w.mag < 12, 'click fires (mag ' + w.mag + ')');
      g = fresh(); P = g.player; const fov0 = F.engine().camera.fov; canvas().dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); adv(0.6); ok(F.engine().camera.fov < fov0 - 8, 'right click aims down sights: zoom (fov ' + F.engine().camera.fov.toFixed(1) + ')'); ok(F.view.ads > 0.8, 'aim blend'); window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); adv(0.6); ok(near(F.engine().camera.fov, UI.settings.fov, 1), 'and back');
      g = fresh(); P = g.player; P.weapons[0].mag = 3; key('keydown', 'KeyR'); key('keyup', 'KeyR'); adv(0.1); ok(P.reload > 0, 'R reloads'); adv(2); ok(P.weapons[0].mag === 12, 'magazine filled');
      g = fresh(); P = g.player; g.giveWeapon('rifle'); g.giveWeapon('shotgun'); const cur = P.cur; key('keydown', 'KeyQ'); key('keyup', 'KeyQ'); adv(0.05); ok(P.cur !== cur, 'Q swaps'); const c2 = P.cur; window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })); adv(0.05); ok(P.cur !== c2, 'wheel swaps'); key('keydown', 'Digit1'); key('keyup', 'Digit1'); adv(0.05); ok(P.cur === 0, 'key 1');
    },
    'keyboard: E buys a wall gun and opens a gate; holding E repairs a barricade; F toggles the flashlight; Esc pauses': () => {
      let g = fresh({ points: 5000 }), P = g.player; const wb = g.map.wallbuys.find((w) => w.weapon === 'shotgun'); P.x = (wb.x + 0.5) * D.T; P.y = (wb.y + 1.5) * D.T; P.aim = -Math.PI / 2; adv(0.1); ok(g.prompt && /Breacher/.test(g.prompt.label), 'buy prompt at the poster'); key('keydown', 'KeyE'); key('keyup', 'KeyE'); adv(0.1); ok(P.weapons.some((w) => w.id === 'shotgun'), 'E buys the gun');
      g = fresh({ points: 5000 }); P = g.player; const door = g.map.doors.find((d) => d.id === 1); P.x = door.x * D.T - 8; P.y = (door.y + door.h / 2) * D.T; adv(0.1); key('keydown', 'KeyE'); key('keyup', 'KeyE'); adv(0.1); ok(door.open, 'E opens a gate');
      g = fresh(); P = g.player; const b = g.map.barriers[0]; b.planks = 1; P.x = (b.x + b.w / 2) * D.T + b.dir[0] * 19; P.y = (b.y + b.h / 2) * D.T + b.dir[1] * 19; adv(0.1); key('keydown', 'KeyE'); adv(1.6); key('keyup', 'KeyE'); ok(b.planks >= 4, 'holding E nails boards (planks ' + b.planks + ')');
      g = fresh(); const fl0 = F.engine().scene.children.some((o) => o.isSpotLight && o.visible); key('keydown', 'KeyF'); key('keyup', 'KeyF'); adv(0.1); ok(F.engine().scene.children.some((o) => o.isSpotLight && o.visible) && !fl0, 'F turns the flashlight on'); key('keydown', 'KeyF'); key('keyup', 'KeyF'); adv(0.1);
      g = fresh(); key('keydown', 'Escape'); adv(0.1); ok(F.state() === 'pause', 'Esc pauses'); F.action('resume'); ok(F.state() === 'play', 'resume');
    },
    'controller (PlayStation): sticks move and look, R2 fires, L2 aims, Square reloads, Cross uses, Triangle swaps, L3 sprints, Circle crouches, Options pauses; PS glyphs': () => {
      const pad = fakePad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'); let g = fresh(), P = g.player; adv(0.1);
      pad.axes[1] = -1; adv(0.5); ok(I.last === 'pad', 'last used input is the pad'); ok(I.padType === 'ps' && I.glyph('use') === '✕' && I.glyph('shoot') === 'R2' && I.glyph('reload') === '□' && I.glyph('ads') === 'L2' && I.glyph('crouch') === '○', 'PlayStation glyphs'); ok(/R2/.test(UI.controlsHint()), 'hint speaks PlayStation');
      ok(P.x - P0[0] > 15, 'left stick up walks forward'); const walk = P.x - P0[0]; pad.axes[1] = 0;
      const a0 = P.aim; pad.axes[2] = 1; adv(0.5); pad.axes[2] = 0; ok(P.aim - a0 > 0.8, 'right stick right turns right (' + (P.aim - a0).toFixed(2) + ')');
      UI.settings.padSens = 2; UI.applySettings(); const a1 = P.aim; pad.axes[2] = 1; adv(0.25); pad.axes[2] = 0; ok(P.aim - a1 > 0.5, 'look sensitivity 200% turns faster'); UI.settings.padSens = 1; UI.applySettings();
      const p0 = F.view.pitch; pad.axes[3] = 1; adv(0.4); pad.axes[3] = 0; ok(F.view.pitch < p0 - 0.1, 'right stick down looks down'); UI.settings.invertYpad = true; UI.applySettings(); F.view.pitch = 0; pad.axes[3] = 1; adv(0.4); pad.axes[3] = 0; ok(F.view.pitch > 0.1, 'invert Y for the controller'); UI.settings.invertYpad = false; UI.applySettings();
      g = fresh(); P = g.player; adv(0.1); press(pad, 7); adv(0.4); press(pad, 7, false); ok(P.weapons[0].mag < 12, 'R2 fires');
      g = fresh(); adv(0.1); const fov0 = F.engine().camera.fov; press(pad, 6); adv(0.6); ok(F.engine().camera.fov < fov0 - 8, 'L2 aims down sights (zoom)'); press(pad, 6, false); adv(0.5);
      g = fresh(); P = g.player; P.weapons[0].mag = 2; adv(0.1); press(pad, 2); adv(0.05); press(pad, 2, false); adv(0.1); ok(P.reload > 0, 'Square reloads');
      g = fresh({ points: 5000 }); P = g.player; const wb = g.map.wallbuys.find((w) => w.weapon === 'shotgun'); P.x = (wb.x + 0.5) * D.T; P.y = (wb.y + 1.5) * D.T; adv(0.1); press(pad, 0); adv(0.05); press(pad, 0, false); adv(0.1); ok(P.weapons.some((w) => w.id === 'shotgun'), 'Cross uses / buys');
      g = fresh(); P = g.player; g.giveWeapon('rifle'); const cur = P.cur; adv(0.1); press(pad, 3); adv(0.05); press(pad, 3, false); adv(0.1); ok(P.cur !== cur, 'Triangle swaps');
      g = fresh(); P = g.player; let x0 = P.x; pad.axes[1] = -1; adv(0.5); const w1 = P.x - x0; pad.axes[1] = 0; adv(0.2); P.x = P0[0]; x0 = P.x; pad.axes[1] = -1; adv(0.05); press(pad, 10); adv(0.05); press(pad, 10, false); adv(0.5); const w2 = P.x - x0; pad.axes[1] = 0; ok(w2 / w1 > 1.25, 'L3 sprints (' + (w2 / w1).toFixed(2) + 'x)');
      g = fresh(); P = g.player; adv(0.1); press(pad, 1); adv(0.05); press(pad, 1, false); adv(0.5); ok(P.eye < 1.2, 'Circle crouches'); press(pad, 1); adv(0.05); press(pad, 1, false); adv(0.5);
      g = fresh(); adv(0.1); press(pad, 9); adv(0.05); press(pad, 9, false); adv(0.1); ok(F.state() === 'pause', 'Options pauses'); F.action('resume');
      g = fresh(); P = g.player; P.aim = 0; const e = g.spawnEnemy('medium1', P.x + 90, P.y + 12); e.speed = 0; UI.settings.aimAssist = true; pad.axes[2] = 0.6; adv(0.3); pad.axes[2] = 0; const withA = P.aim; g.enemies.length = 0;
      g = fresh(); P = g.player; P.aim = 0; const e2 = g.spawnEnemy('medium1', P.x + 90, P.y + 12); e2.speed = 0; UI.settings.aimAssist = false; pad.axes[2] = 0.6; adv(0.3); pad.axes[2] = 0; const noA = P.aim; UI.settings.aimAssist = true; const tgt = Math.atan2(12, 90); ok(Math.abs(withA - tgt) < Math.abs(noA - tgt), 'aim assist pulls towards a nearby creature (' + withA.toFixed(3) + ' vs ' + noA.toFixed(3) + ')');
      fakePad('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)'); adv(0.1); I.padType = 'generic'; ok(I.glyph('use') === 'A' && I.glyph('shoot') === 'RT', 'other controllers show A / RT'); navigator.getGamepads = () => []; I.padConnected = false;
    },
    'touch (basic): left stick moves, dragging the right side looks, FIRE shoots, USE repairs, RELOAD and SWAP work, prompts say Tap': () => {
      let g = fresh(); I.last = 'touch'; UI.touch(true); const layer = document.getElementById('touch'); const P = g.player; layer.classList.remove('hidden'); adv(0.1);
      let t = touchObj(1, layer, 120, 420); touch('touchstart', layer, [t]); t = touchObj(1, layer, 120, 340); touch('touchmove', layer, [t]); adv(0.5); const dx = P.x - P0[0]; touch('touchend', layer, [t]); ok(dx > 15, 'left stick up walks forward'); ok(I.last === 'touch' && /Tap/.test(I.glyph('use')), 'prompts say Tap');
      g = fresh(); I.last = 'touch'; const P2 = g.player; const a0 = P2.aim; t = touchObj(2, layer, 560, 300); touch('touchstart', layer, [t]); t = touchObj(2, layer, 660, 300); touch('touchmove', layer, [t]); adv(0.05); touch('touchend', layer, [t]); ok(P2.aim - a0 > 0.4, 'dragging the right side turns');
      g = fresh(); I.last = 'touch'; const fire = document.getElementById('tFire'); t = touchObj(4, fire, 700, 500); touch('touchstart', fire, [t]); adv(0.5); touch('touchend', fire, [t]); ok(g.player.weapons[0].mag < 12, 'FIRE shoots');
      g = fresh(); I.last = 'touch'; g.player.weapons[0].mag = 4; const rl = document.getElementById('tReload'); t = touchObj(5, rl, 640, 480); touch('touchstart', rl, [t]); touch('touchend', rl, [t]); adv(0.1); ok(g.player.reload > 0, 'RELOAD reloads');
      g = fresh(); I.last = 'touch'; g.giveWeapon('rifle'); const cur = g.player.cur, sw = document.getElementById('tSwap'); t = touchObj(6, sw, 700, 420); touch('touchstart', sw, [t]); touch('touchend', sw, [t]); adv(0.1); ok(g.player.cur !== cur, 'SWAP swaps');
      g = fresh(); I.last = 'touch'; const b = g.map.barriers[0]; b.planks = 0; const P3 = g.player; P3.x = (b.x + b.w / 2) * D.T + b.dir[0] * 19; P3.y = (b.y + b.h / 2) * D.T + b.dir[1] * 19; adv(0.1); const use = document.getElementById('tUse'); t = touchObj(7, use, 600, 500); touch('touchstart', use, [t]); adv(1.6); touch('touchend', use, [t]); ok(b.planks >= 3, 'holding USE repairs (planks ' + b.planks + ')');
    },
    'game flow: character select, pause, settings and quality presets, game over with the survivor falling, high score saved': () => {
      F.action('quitYes'); F.action('play'); ok(UI.current === 'sChar', 'Play opens the character select'); ok(!document.getElementById('bStart').disabled, 'a survivor is ready'); F.action('start'); ok(F.state() === 'play', 'Start begins the run');
      F.action('pause'); ok(F.state() === 'pause', 'pause'); F.action('settings'); ok(UI.current === 'sSettings', 'settings'); F.action('back'); ok(UI.current === 'sPause', 'back to pause');
      for (const q of ['low', 'medium', 'high', 'ultra']) { UI.settings.quality = q; UI.applySettings(); ok(F.engine().qname === q, 'quality ' + q); adv(0.1); } UI.settings.quality = 'auto'; UI.applySettings(); F.action('resume'); adv(0.2);
      const g = F.game(); g.timer = 99999; g.player.hp = 1; g.points = 1234; g.round = 7; g.kills = 55; for (let k = 0; k < 4; k++) g.spawnEnemy('small1', g.player.x + 8, g.player.y + k); adv(6); ok(F.state() === 'over', 'game over appears (' + F.state() + ')');
      ok(document.getElementById('oRound').textContent === '7' && document.getElementById('oKills').textContent === '55', 'game over shows round and kills'); ok(!!D.store.get('dzf3_best', null), 'high score saved'); F.action('menu'); ok(F.state() === 'menu', 'main menu');
    },
  };
  window.DZFTest = { run: async function (only) { for (const [name, fn] of Object.entries(tests)) { if (only && !name.includes(only)) continue; const before = out.failed.length; try { fn(); } catch (e) { out.failed.push(name + ' threw: ' + (e && e.message)); } out.log.push((out.failed.length === before ? 'ok   ' : 'FAIL ') + name); } return out; } };
})();
