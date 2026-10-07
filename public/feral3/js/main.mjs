// Feral 3.0 - the game loop and the glue between the rules (sim), the picture (engine, world, creatures, weapons, effects), sound, input and the screens (ui).
import * as THREE from 'three';
import { Engine } from './engine.mjs';
import { assets, loadAssets, loadModel } from './assets.mjs';
import { buildWorld } from './world.mjs';
import { Creatures } from './creatures.mjs';
import { FX } from './fx.mjs';
import { ViewModel } from './viewmodel.mjs';
import { AU } from './audio.mjs';
import { thumbnail, CharPreview } from './previews.mjs';
import { I } from './input.mjs';
import { UI } from './ui.mjs';

const D = window.DZF, S = 1 / 8;
const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const clamp = D.clamp, PI2 = Math.PI * 2;
const view = { pitch: 0, ads: 0, adsHeld: false, sprint: false, turnRate: 0, pitchRate: 0, deadT: 0, recoilP: 0, recoilY: 0, zoomFactor: 1, shake: 0 };
let engine, world, creatures, fx, vm, preview, g = null, demo = null, state = 'boot', last = performance.now(), hudT = 0, returnTo = 'sMenu', overT = 0, deferredInstall = null, firstRun = true, demoT = 0;
let flashlight, flashOn = false, playerShadow = null, deathBody = null, stepT = 0, growlT = 3, heartT = 0, lastRoom = -1, envTex = null, loadedChars = {};
const ALL_MODELS = ['pistol', 'small1', 'small2', 'medium1', 'small3', 'medium2', 'medium3', 'shotgun', 'rifle', 'male', 'female', 'large1', 'large2', 'bolt', 'mg', 'boss'];
const CREATURE_IDS = ['small1', 'small2', 'small3', 'medium1', 'medium2', 'medium3', 'large1', 'large2', 'boss'], WEAPON_IDS = ['pistol', 'shotgun', 'rifle', 'bolt', 'mg'];

// ---------- starting and stopping ----------
function attach(game) {
  g = game; if (world) { for (const v of world.doors) { v.open = 0; v.grp.position.y = 0; v.grp.visible = true; } world.planks.last.fill(-1); }
  if (creatures) creatures.reset(); if (fx) fx.clear(); if (vm) vm.reset(); UI.clearFx(); view.pitch = 0; view.ads = 0; view.deadT = 0; view.recoilP = view.recoilY = 0; view.shake = 0; engine.darkness = 0; engine.damage = 0; UI.buildMini(game); removeDeathBody();
}
function startPlay() {
  AU.init(); newGame(); UI.hide(); UI.hud(true); state = 'play'; overT = 0; hudT = 0; AU.music('play'); AU.setIntensity(1); I.clearEdges(); I.resetTouch(); I.releaseAll(); I.wantLock = true; syncTouch();
  if (I.last === 'kbm' && !coarse) I.lock(canvas); if (preview) preview.stop();
  if (firstRun) { UI.hint(UI.controlsHint(), 9000); firstRun = false; }
  setupPlayerShadow();
}
function newGame() { attach(D.createGame({})); }
function toMenu() { state = 'menu'; UI.hud(false); UI.touch(false); I.unlock(); I.wantLock = false; g = null; removeDeathBody(); ensureDemo(); UI.show('sMenu'); AU.music('menu'); }
function ensureDemo() { demo = demo || D.createGame({ seed: 7 }); attach(demo); demo.player.aim = 0.3; demo.player.x = 64.5 * D.T; demo.player.y = 68.5 * D.T; demoT = 0; }
function doPause() { if (state !== 'play') return; state = 'pause'; UI.touch(false); I.resetTouch(); I.releaseAll(); I.unlock(); UI.show('sPause'); UI.lockHint(false); AU.ui('click'); }
function resume() { UI.hide(); state = 'play'; I.clearEdges(); syncTouch(); if (I.last === 'kbm' && !coarse) I.lock(canvas); }
function syncTouch() { UI.touch(state === 'play' && (I.last === 'touch' || (coarse && I.last !== 'pad' && I.last !== 'kbm') || (I.touchSeen && I.last !== 'pad' && I.last !== 'kbm'))); }
function enterFullscreen() { try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen && coarse) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* ignore */ } }
function toggleFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* ignore */ } }
function showCharSelect() {
  returnTo = 'sMenu'; UI.show('sChar'); if (!preview) preview = new CharPreview($('charCanvas')); preview.start(); const id = UI.settings.char; if (!preview.show(id)) loadChar(id).then(() => { if (UI.current === 'sChar') preview.show(UI.settings.char); }); updateCharUI();
}
async function loadChar(id) { await loadModel(id); loadedChars[id] = true; updateCharUI(); }
function updateCharUI() { const ok = !!assets.models[UI.settings.char]; $('bStart').disabled = !ok; $('loadInfo').textContent = ok ? '' : 'Loading your survivor...'; }

function onAction(a) {
  switch (a) {
    case 'play': showCharSelect(); break;
    case 'start': case 'again': if (a === 'again') { startPlay(); enterFullscreen(); } else { startPlay(); enterFullscreen(); } break;
    case 'how': returnTo = UI.current; UI.show('sHow'); break;
    case 'settings': returnTo = UI.current; UI.show('sSettings'); break;
    case 'back': if (UI.current === 'sChar' && preview) preview.stop(); UI.show(returnTo || 'sMenu'); break;
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
window.addEventListener('resize', () => { if (engine) engine.resize(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && state !== 'boot') { UI.settings.muted = !UI.settings.muted; UI.save(); UI.applySettings(); } });
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => AU.init(), { passive: true });
window.addEventListener('gamepadconnected', () => { setTimeout(() => { UI.refreshGlyphs(); if (state === 'play') UI.toast((I.padType === 'ps' ? 'PlayStation controller' : 'Controller') + ' connected'); }, 50); });
window.addEventListener('gamepaddisconnected', () => { UI.refreshGlyphs(); if (state === 'play') UI.toast('Controller disconnected'); });
I.onLast = function () { syncTouch(); UI.refreshGlyphs(); };

// ---------- the player's body: a shadow while you live, a falling survivor when you die ----------
function setupPlayerShadow() {
  if (playerShadow) { engine.scene.remove(playerShadow); playerShadow = null; } const m = assets.models[UI.settings.char]; if (!m) return;
  playerShadow = m.scene.clone(true); playerShadow.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); o.castShadow = true; o.receiveShadow = false; o.userData.noAO = true; o.frustumCulled = false; } }); engine.scene.add(playerShadow);
}
function makeDeathBody(game) {
  const m = assets.models[UI.settings.char]; if (!m) return; deathBody = m.scene.clone(true); deathBody.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.noAO = true; } }); const P = game.player; deathBody.position.set(P.x * S, 0, P.y * S); deathBody.rotation.y = -P.aim + Math.PI / 2; engine.scene.add(deathBody); deathBody.userData.t = 0; deathBody.userData.yaw = deathBody.rotation.y;
}
function removeDeathBody() { if (deathBody) { engine.scene.remove(deathBody); deathBody = null; } }

// ---------- one game step ----------
const angDiff = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
function bestTarget(g0, maxAng) {                    // the creature closest to the crosshair that can be seen
  const P = g0.player; let best = null, bd = maxAng;
  for (const e of g0.enemies) {
    if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 300 || d < 1) continue;
    const diff = angDiff(Math.atan2(dy, dx), P.aim), k = Math.abs(diff) - Math.atan2(e.r * 0.5, d) * 0.5;
    if (k < bd && g0.lineClear(P.x, P.y, e.x, e.y, g0.solid)) { bd = k; best = { e, diff, d }; }
  }
  return best;
}
function simInput(inp, dt) {
  const P = g.player; view.adsHeld = !!inp.ads && P.reload <= 0 && !inp.sprint; const sens = 1 / Math.max(1, view.zoomFactor);
  let yaw = inp.yaw * sens, pitch = inp.pitch * sens;
  const assist = UI.settings.aimAssist && (inp.source === 'pad' || inp.source === 'touch');
  if (assist) { const t = bestTarget(g, 0.14); if (t && (inp.fire || Math.abs(yaw) > 0)) { yaw *= 0.55; P.aim += t.diff * Math.min(1, dt * 7) * 0.6; const dz = (t.e.h * 0.7 - P.eye) / Math.max(1, t.d / 8); view.pitch += (Math.atan(dz) - view.pitch) * Math.min(1, dt * 4); } }
  P.aim = (P.aim + yaw) % PI2; if (P.aim < 0) P.aim += PI2;
  view.turnRate = dt > 0 ? yaw / dt : 0; view.pitchRate = dt > 0 ? pitch / dt : 0; view.pitch = clamp(view.pitch - pitch, -1.35, 1.35);
  const a = P.aim, fwd = inp.fwd, str = inp.strafe, can = !(I.last === 'kbm' && !I.locked && !I.noLock);
  view.sprint = inp.sprint && fwd > 0.3 && !view.adsHeld;
  if (inp.flash) { flashOn = !flashOn; AU.play('flashlight'); }
  return { mx: Math.cos(a) * fwd - Math.sin(a) * str, my: Math.sin(a) * fwd + Math.cos(a) * str, aim: P.aim, pitch: view.pitch, fire: inp.fire && can, ads: view.adsHeld, reload: inp.reload, interactPressed: inp.interactPressed, interactHeld: inp.interactHeld, swap: inp.swap, slot: inp.slot, sprint: view.sprint, crouch: inp.crouch };
}
function cameraState(P, dt) {
  const S8 = S, yaw = P.aim, rx = -Math.sin(yaw), rz = Math.cos(yaw), fx = Math.cos(yaw), fz = Math.sin(yaw);
  return { x: P.x * S8, y: P.eye, z: P.y * S8, a: yaw, rx, rz, fx, fz, fy: Math.sin(view.pitch) };
}
function snd(id, x, y, o = {}) { if (x == null) return AU.play(id, o); return AU.play(id, Object.assign({ pos: [x * S, o.h == null ? 1.2 : o.h, y * S] }, o)); }
const size = (e) => (e.boss ? 'boss' : e.r > 7 ? 'large' : e.r > 5.2 ? 'medium' : 'small');
function handleEvents(gg) {
  const cam = world ? cameraState(gg.player) : null, hooks = { shake: (n) => { if (UI.settings.shake) view.shake = Math.min(7, view.shake + n); }, muzzlePos: () => (vm && vm.cur ? { x: vm.muzzleWorld.x, y: vm.muzzleWorld.y, z: vm.muzzleWorld.z } : null) };
  for (const e of gg.events) {
    if (gg === g || gg === demo) { fx.event(e, gg, cam, hooks); }
    if (gg !== g) continue;
    vm.event(e); if (e.t === 'kill') creatures.kill(e); if (e.t === 'slam' || e.t === 'leap' || e.t === 'bite' || e.t === 'spit' || e.t === 'breath' || e.t === 'roar') creatures.pulse(e.id, e.t === 'roar' ? 'wind' : 'hit');
    switch (e.t) {
      case 'shot': {
        AU.play(e.w + '_shot', { vol: 1 }); if (e.w === 'shotgun') setTimeout(() => AU.play('shotgun_pump'), 420); else if (e.w === 'bolt') setTimeout(() => AU.play('bolt_cycle'), 450); setTimeout(() => AU.play('shell_drop', { pos: [cam.x + cam.fx * 0.5, 0.05, cam.z + cam.fz * 0.5], vol: 0.5 }), 340);
        const w = D.WEAPONS[e.w], kp = (e.kick * (1 - view.ads * 0.35)) * Math.PI / 180, ky = (Math.random() - 0.5 + Math.sin(e.burst * 1.9) * 0.4) * e.wander * Math.PI / 180 * (1 - view.ads * 0.3);
        view.pitch = clamp(view.pitch + kp, -1.35, 1.35); gg.player.aim += ky; view.recoilP += kp; view.recoilY += ky; I.rumble(60, Math.min(0.5, w.shake * 0.2)); break;
      }
      case 'reload': AU.play('reload_' + e.w); break; case 'swap': AU.play('weapon_swap'); break; case 'empty': AU.play('gun_dry'); break;
      case 'hit': snd(e.head ? 'hit_head' : 'impact_flesh', e.x, e.y, { h: e.z }); if (!e.kill) AU.play('hit_marker', { vol: 0.6 }); if (UI.settings.numbers && engine) { const p = projectToScreen(e.x * S, (e.z == null ? 1.4 : e.z) + 0.3, e.y * S); if (p) UI.num(p.x, p.y, e.dmg, e.kill, e.head); } UI.hitMarker(e.kill, e.head); break;
      case 'spark': snd('impact_hard', e.x, e.y, { h: e.z, vol: 0.6 }); break;
      case 'kill': { const sz = size({ boss: e.boss, r: e.r }); snd('kill_' + (e.boom ? 'small' : sz), e.x, e.y); if (e.boom) snd('explosion', e.x, e.y); view.shake += e.boss ? 3 : 0; break; }
      case 'boom': if (e.nuke) { AU.play('explosion', { vol: 1.2 }); AU.duckMusic(0.6, 1.5); } I.rumble(e.nuke ? 400 : 150, 0.8); break;
      case 'hurt': AU.play('player_hurt'); I.rumble(150, 0.7); UI.hurt(gg, e, gg.player.aim); AU.duckMusic(0.3, 0.5); break;
      case 'bite': snd('attack_' + (e.heavy ? 'large' : 'small'), e.x, e.y); break;
      case 'leap': snd('leap', e.x, e.y); break; case 'roar': snd('charge_roar', e.x, e.y); break; case 'spit': snd('spit', e.x, e.y); break; case 'splash': snd('acid_splash', e.x, e.y, { vol: 0.7 }); break;
      case 'slamWarn': snd('growl_large', e.x, e.y, { pitch: 0.8 }); break; case 'slam': snd('stomp', e.x, e.y); break; case 'breathWarn': snd('boss_roar', e.x, e.y); break; case 'breath': snd('breath_fire', e.x, e.y, { h: 3 }); break;
      case 'enrage': snd('enrage', e.x, e.y); break; case 'summon': snd('summon', e.x, e.y); break;
      case 'bigSpawn': snd('growl_large', e.x, e.y); break; case 'bossSpawn': snd('boss_spawn', e.x, e.y); setTimeout(() => AU.play('boss_roar', { vol: 1 }), 700); UI.banner('<small>something huge stirs in the Lava Cave</small>', true); break;
      case 'plank': snd('barricade_break', e.x, e.y, { h: 1.5 }); break; case 'repair': snd('barricade_repair', e.x, e.y, { h: 1.5 }); break;
      case 'door': AU.play('gate_open', { vol: 1 }); UI.banner(e.name + '<small>a new area is open</small>', false); UI.paintMini(gg); break;
      case 'buy': AU.play(e.what === 'perk' ? 'perk_buy' : 'buy'); break; case 'take': AU.play('buy'); break; case 'deny': AU.play('deny'); break; case 'upgrade': AU.play('bench_forge'); break;
      case 'box': if (e.state === 'spin') AU.play('crate_open'); else if (e.state === 'ready') AU.play('crate_ready'); break;
      case 'pickup': AU.play('pickup'); break; case 'drop': snd('powerup_drop', e.x, e.y); break; case 'revive': AU.play('perk_buy'); break;
      case 'round': AU.play('round_start'); AU.setIntensity(e.round); UI.banner('ROUND ' + e.round + (e.boss ? '<small>the Cinder Hydra rises</small>' : ''), e.boss); break;
      case 'roundEnd': AU.play('round_end'); break;
      case 'gameover': AU.play('player_death'); AU.music('over'); I.rumble(500, 0.9); overT = 3.4; makeDeathBody(gg); break;
      default: break;
    }
  }
  gg.events.length = 0;
}
const _v3 = new THREE.Vector3();
function projectToScreen(x, y, z) { _v3.set(x, y, z).project(engine.camera); if (_v3.z > 1 || _v3.z < -1) return null; return { x: (_v3.x * 0.5 + 0.5) * window.innerWidth, y: (-_v3.y * 0.5 + 0.5) * window.innerHeight }; }

function frame(now) { requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt); }
function tick(dt) {
  if (state === 'play') {
    const si = (D.dev && D.dev.sim) ? D.dev.sim(g, dt) : null;
    const inp = si ? { pause: false, yaw: 0, pitch: 0 } : I.frame(dt);
    if (inp.pause) doPause();
    else if (g.over) { overT -= dt; if (overT <= 0 && state === 'play') { state = 'over'; UI.hud(false); UI.touch(false); I.resetTouch(); I.unlock(); UI.gameOver(g); } handleEvents(g); }
    else {
      const steps = (D.dev && D.dev.speed) || 1, sim = si || simInput(inp, dt);
      if (si) { g.player.aim = sim.aim != null ? sim.aim : g.player.aim; view.adsHeld = false; }
      for (let i = 0; i < steps && !g.over; i++) { g.update(dt, sim); if (i < steps - 1) g.events.length = 0; }
      handleEvents(g); gameplayAudio(dt);
      hudT -= dt; if (hudT <= 0) { hudT = 0.09; UI.updateHud(g); const t = bestTarget(g, 0.05); const w = g.player.weapons[g.player.cur], s = D.wstat(w); UI.setCross(!!t, view.ads > 0.5, (s.spread * (1 - view.ads) + s.ads * view.ads) * (g.player.moving ? 1.3 : 1) * 0.6); UI.lockHint(I.last === 'kbm' && !I.locked && !I.noLock && !coarse); }
    }
    draw(g, dt);
  } else {
    for (const k of I.takeMenu()) UI.menuKey(k);
    I.frame(dt);
    const gg = g || demo;
    if (gg) { if (gg === demo && state === 'menu') { demoT += dt; demo.player.aim = 0.3 + demoT * 0.04; } draw(gg, state === 'pause' ? 0 : dt); }
  }
}
function gameplayAudio(dt) {
  const P = g.player, cam = cameraState(P);
  // footsteps follow the walking bob
  if (P.moving && !P.crouching) { stepT -= dt * (P.sprint ? 1.6 : 1); if (stepT <= 0) { stepT = 0.46; const tx = Math.floor(P.x / D.T), ty = Math.floor(P.y / D.T), a = g.map.area[ty * g.map.w + tx], room = a >= 0 ? D.ROOMS[a].floor : 'plaza'; AU.play(room === 'jungle' ? 'step_dirt' : room === 'compound' ? 'step_metal' : 'step_concrete', { vol: P.sprint ? 0.9 : 0.6 }); } } else stepT = Math.min(stepT, 0.1);
  // the heartbeat when you are hurt
  if (P.hp < P.maxHp * 0.35) { heartT -= dt; if (heartT <= 0) { heartT = 0.5 + P.hp / P.maxHp * 1.6; AU.play('heartbeat', { vol: 1.0 - P.hp / P.maxHp }); } }
  // creatures grumble now and then
  growlT -= dt; if (growlT <= 0 && g.enemies.length) { growlT = rr(1.6, 3.6); const e = g.enemies[(Math.random() * g.enemies.length) | 0], d = Math.hypot(e.x - P.x, e.y - P.y) / 8; if (d < 45) snd('growl_' + size(e), e.x, e.y, { h: e.h * 0.6, vol: 0.9 }); }
  // ambience follows the room; the music goes to the boss track while the Hydra lives
  const tx = Math.floor(P.x / D.T), ty = Math.floor(P.y / D.T), a = g.map.area[ty * g.map.w + tx]; const room = a >= 0 ? a : 0; if (room !== lastRoom) { lastRoom = room; AU.setRoom(room); }
  const boss = g.enemies.some((e) => e.boss); AU.music(boss ? 'boss' : 'play'); AU.listen(cam);
}
const rr = (a, b) => a + Math.random() * (b - a);
const eyeV = new THREE.Vector3();
function draw(gg, dt) {
  const P = gg.player, S8 = S, cam3 = engine.camera; let eye = P.eye, side = 0, roll = 0;
  const bobAmt = P.moving ? 1 : 0; view.bobA = (view.bobA || 0) + (bobAmt - (view.bobA || 0)) * Math.min(1, dt * 10);
  eye += Math.sin(P.bob) * 0.04 * view.bobA * (view.sprint ? 1.6 : 1) * (1 - view.ads * 0.8); side = Math.cos(P.bob * 0.5) * 0.03 * view.bobA * (1 - view.ads * 0.8); roll = Math.cos(P.bob * 0.5) * 0.004 * view.bobA * (view.sprint ? 2 : 1);
  let sx = 0, sy = 0, sr = 0; if (view.shake > 0.01) { const k = view.shake * 0.006; sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k; sr = (Math.random() - 0.5) * k * 0.6; view.shake *= Math.pow(0.001, dt); }
  const yaw = P.aim, rx = -Math.sin(yaw), rz = Math.cos(yaw);
  // recoil recovers part of the way
  if (dt > 0) { const rec = Math.min(1, dt * 7) * 0.55; view.pitch -= view.recoilP * rec * 0.5; view.recoilP *= 1 - rec * 0.5; view.recoilY *= 1 - rec * 0.5; }
  let px = P.x * S8 + rx * side + rx * sx, py = eye + sy, pz = P.y * S8 + rz * side + rz * sx, pitch = view.pitch, yawCam = -yaw - Math.PI / 2;
  // the death camera: pull back and up, and look down at the fallen survivor
  if (gg.over && deathBody) {
    deathBody.userData.t += dt; const t = deathBody.userData.t, k = Math.min(1, t / 1.3), e = k * k * (3 - 2 * k);
    deathBody.rotation.x = -e * 1.5; deathBody.position.y = Math.sin(e * 1.5) * 0.25; const orbit = deathBody.userData.yaw + t * 0.12, dist = 1.2 + e * 3.6;
    px = deathBody.position.x + Math.sin(orbit) * dist; pz = deathBody.position.z + Math.cos(orbit) * dist; py = 0.9 + e * 2.2; const dx = deathBody.position.x - px, dz = deathBody.position.z - pz, dy = 0.35 - py; yawCam = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz)); roll = 0;
    engine.darkness = clamp((t - 2.2) / 1.4, 0, 0.8);
  }
  cam3.position.set(px, py, pz); cam3.rotation.set(pitch + sy * 0.4, yawCam, roll + sr);
  const base = UI.settings.fov, zf = gg === g ? (view.zoomFactor = 1 + (vm.zoomFor(vm.curId) - 1) * view.ads) : 1; const fovNow = base / zf + (view.sprint ? 4 : 0); if (Math.abs(cam3.fov - fovNow) > 0.02) { cam3.fov = fovNow; cam3.updateProjectionMatrix(); }
  const cam = cameraState(P); cam.x = px; cam.y = py; cam.z = pz;
  engine.followMoon(px, pz);
  world.update(gg, dt, engine.t, cam);
  creatures.update(gg, dt, engine.t, cam);
  fx.update(dt, engine.t, cam, gg);
  // the player's own shadow and the flashlight
  if (playerShadow && gg === g) { playerShadow.visible = !gg.over; playerShadow.position.set(P.x * S8 - Math.cos(yaw) * 0.05, 0, P.y * S8 - Math.sin(yaw) * 0.05); playerShadow.rotation.y = -yaw + Math.PI / 2; playerShadow.scale.y = 1 - P.crouch * 0.38; }
  flashlight.visible = flashOn && gg === g && !gg.over; if (flashlight.visible) { flashlight.position.set(px + rx * 0.12, py - 0.1, pz + rz * 0.12); const fdx = Math.cos(yaw) * Math.cos(pitch), fdy = Math.sin(pitch), fdz = Math.sin(yaw) * Math.cos(pitch); flashlight.target.position.set(px + fdx * 10, py + fdy * 10, pz + fdz * 10); flashlight.target.updateMatrixWorld(); flashlight.intensity = 900 * (0.92 + Math.sin(engine.t * 31) * 0.03); }
  // the gun
  if (gg === g) { vm.root.visible = true; vm.update(gg, dt, view, lampFor(cam)); } else vm.root.visible = false;
  engine.damage = UI.updateFx(gg === g ? gg : null, dt); if (fx.screenFlash > 0) engine.damage = Math.max(engine.damage, 0);
  engine.render(dt, fx.screenFlash * 0.5);
  if (state === 'play') UI.drawMini(gg, P.aim);
  if (UI.settings.showFps) $('perf').textContent = Math.round(engine.fps) + ' fps  ' + engine.calls + ' calls  ' + Math.round(engine.tris / 1000) + 'k tris  ' + engine.qname + ' x' + engine.ratio.toFixed(2) + '  ' + fx.add.n + '/' + fx.smoke.n + ' particles';
}
const lampTmp = { color: new THREE.Color(), intensity: 0 };
function lampFor(cam) { let best = null, bd = 1e9; for (const l of world.lights) { const d = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2; if (d < bd) { bd = d; best = l; } } if (!best) { lampTmp.intensity = 0; return lampTmp; } lampTmp.color.copy(best.color); lampTmp.intensity = Math.min(3, best.intensity / Math.max(4, bd) * 6) * (best.f || 1); return lampTmp; }

// ---------- boot ----------
function fail(msg) { $('boot').classList.add('gone'); $('err').style.display = 'flex'; $('errMsg').textContent = msg; }
function bootProgress(p, msg) { $('bootFill').style.width = Math.round(p * 100) + '%'; if (msg) $('bootMsg').textContent = msg; }
async function boot() {
  try {
    bootProgress(0.02, 'Starting the renderer...');
    engine = new Engine(canvas); window.__engine = engine;
    I.last = coarse ? 'touch' : 'kbm'; if (coarse) document.body.classList.add('touch');
    UI.attachAudio(AU);
    UI.hooks.apply = (s) => { AU.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, amb: s.amb, muted: s.muted }); engine.auto = s.quality === 'auto'; const q = UI.effectiveQuality(); if (q !== engine.qname) engine.setQuality(q); };
    UI.hooks.char = (id) => { if (preview) { if (!preview.show(id)) loadChar(id).then(() => preview.show(UI.settings.char)); } updateCharUI(); };
    bootProgress(0.04, 'Loading textures and the first creatures...');
    await loadAssets(engine.renderer, (p) => bootProgress(0.04 + p * 0.5), ['pistol', 'small1', 'small2']);
    bootProgress(0.56, 'Tuning the sound...');
    AU.init(); await AU.load((p) => bootProgress(0.56 + p * 0.3));
    bootProgress(0.88, 'Building Hollow Reach...'); await new Promise((r) => setTimeout(r, 30));
    UI.settings.quality === 'auto' ? engine.setQuality(UI.effectiveQuality()) : engine.setQuality(UI.settings.quality);
    demo = D.createGame({ seed: 7 }); world = buildWorld(demo.map, engine.q, demo); engine.scene.add(world.root); window.__world = world;
    const pm = new THREE.PMREMGenerator(engine.renderer), envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(world.sky.geometry, world.sky.material)); const env = pm.fromScene(envScene, 0.02); envTex = env.texture; engine.scene.environment = envTex; engine.scene.environmentIntensity = 1.0; engine.scene.background = null; pm.dispose();
    creatures = new Creatures(engine); fx = new FX(engine, world); vm = new ViewModel(engine); vm.setEnv(envTex); window.__fx = fx; window.__creatures = creatures; window.__vm = vm;
    flashlight = new THREE.SpotLight(0xfff0d8, 900, 42, 0.46, 0.55, 1.8); flashlight.castShadow = false; engine.scene.add(flashlight, flashlight.target); flashlight.visible = false;
    engine.onQuality = (q) => { world.makePool(q.lights); world.plantFoliage(q); flashlight.castShadow = q.flashShadow; if (q.flashShadow) { flashlight.shadow.mapSize.set(1024, 1024); flashlight.shadow.bias = -0.0005; flashlight.shadow.camera.near = 0.3; flashlight.shadow.camera.far = 40; } };
    engine.onQuality(engine.q);
    for (const id of ['small1', 'small2']) creatures.add(id); vm.addWeapon('pistol'); vm.select('pistol', false);
    UI.icons.pistol = thumbnail('pistol', { w: 256, h: 128, side: true, dist: 2.2 }); UI.thumbs.small1 = thumbnail('small1', { w: 128, h: 128, dist: 2.1 }); UI.thumbs.small2 = thumbnail('small2', { w: 128, h: 128, dist: 2.1 });
    attach(demo); demo.player.aim = 0.3; demo.player.x = 64.5 * D.T; demo.player.y = 68.5 * D.T;
    UI.init(onAction); UI.applySettings();
    I.bindMouse(canvas, onLock);
    I.bindTouch($('touch'), { baseL: $('baseL'), knobL: $('knobL'), fire: $('tFire'), use: $('tUse'), reload: $('tReload'), swap: $('tSwap'), pause: null });
    state = 'menu'; UI.show('sMenu'); AU.music('menu');
    bootProgress(1, ''); $('boot').classList.add('gone'); setTimeout(() => { const b = $('boot'); if (b) b.remove(); }, 500);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    requestAnimationFrame((t) => { last = t; frame(t); });
    if (document.fullscreenEnabled === false || /iPhone|iPad|iPod/.test(navigator.userAgent)) $('bFs').classList.add('hidden');
    streamModels();
  } catch (e) { console.error(e); fail(String(e && e.message || e)); }
}
// the rest of the models stream in while the menu is up and during the first rounds
async function streamModels() {
  const rest = ALL_MODELS.filter((id) => !assets.models[id]);
  for (const id of rest) {
    try { await loadModel(id); } catch (e) { console.warn('model failed', id, e); continue; }
    if (CREATURE_IDS.includes(id)) { creatures.add(id); UI.thumbs[id] = thumbnail(id, { w: 128, h: 128, dist: id === 'boss' ? 2.4 : 2.1 }); }
    if (WEAPON_IDS.includes(id)) { vm.addWeapon(id); UI.icons[id] = thumbnail(id, { w: 256, h: 128, side: true, dist: 2.2 }); mountPosterGun(id); }
    if (id === 'male' || id === 'female') { loadedChars[id] = true; updateCharUI(); if (id === UI.settings.char && !playerShadow && state === 'play') setupPlayerShadow(); }
    UI.rebuildHow();
  }
}
function mountPosterGun(id) {
  for (const p of world.posters) { if (p.w.weapon !== id) continue; const m = assets.models[id], o = m.scene.clone(true); o.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.userData.noAO = true; } }); const fy = p.w.side === 'S' ? 1 : -1; o.position.set(p.pl.position.x, 3.55, p.pl.position.z + fy * 0.5); o.rotation.y = fy === 1 ? Math.PI / 2 : -Math.PI / 2; o.scale.setScalar(2.2); world.root.add(o); }
}
function onLock(locked, errored) { if (!locked && state === 'play' && !errored) doPause(); if (errored) UI.toast('Mouse capture is not available: the mouse still turns you'); }
window.__feral3 = { state: () => state, game: () => g, start: startPlay, action: onAction, pause: doPause, tick, view, engine: () => engine, world: () => world, creatures: () => creatures, fx: () => fx, vm: () => vm, D, THREE, AU, assets, I, UI };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
