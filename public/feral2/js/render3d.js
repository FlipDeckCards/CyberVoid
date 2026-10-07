// Feral 2.0 - the renderer: Three.js scene, first-person camera (bob, shake, zoom, death fall), quality presets, fog, flicker, muzzle and blast lighting.
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = D.art, S = 1 / 8;
  const R = (D.render = { opts: { shake: true, numbers: true }, quality: 'high', qname: 'high', fps: 60, ratioK: 1, auto: true, ready: false, drawCalls: 0, tris: 0 });

  const PRESETS = {
    low:    { name: 'low',    scale: 0.62, maxDpr: 1,   particles: 70,  floorDecals: 20, wallDecals: 24, fxScale: 0.5, halos: false, lights: 0, fogNear: 4, fogFar: 34, fov: 76, shadows: false },
    medium: { name: 'medium', scale: 0.85, maxDpr: 1.25, particles: 150, floorDecals: 40, wallDecals: 48, fxScale: 0.8, halos: true,  lights: 1, fogNear: 5, fogFar: 42, fov: 76, shadows: false },
    high:   { name: 'high',   scale: 1.15, maxDpr: 2,   particles: 300, floorDecals: 80, wallDecals: 96, fxScale: 1,   halos: true,  lights: 2, fogNear: 6, fogFar: 54, fov: 76, shadows: false },
  };
  R.PRESETS = PRESETS;
  const FOG = 0x0b0716;

  R.init = function (canvas) {
    R.canvas = canvas;
    let gl = null;
    try { R.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); gl = R.renderer; } catch (e) { gl = null; }
    if (!gl) { R.failed = true; return false; }
    R.renderer.setClearColor(FOG, 1); R.renderer.outputEncoding = THREE.LinearEncoding;
    R.scene = new THREE.Scene(); R.scene.fog = new THREE.Fog(FOG, 6, 50);
    R.camera = new THREE.PerspectiveCamera(76, 16 / 9, 0.1, 120); R.camera.rotation.order = 'YXZ';
    R.ambient = new THREE.AmbientLight(0xffffff, 1); R.scene.add(R.ambient);
    R.q = PRESETS.high; R.view = { yaw: 0, pitch: 0, zoom: 1, deadT: 0, shake: 0, kick: 0 }; R.shakeAmp = 0; R.zoomNow = 1;
    R.resize(); R.ready = true; return true;
  };
  R.setQuality = function (name, silent) {
    if (!PRESETS[name]) name = 'high'; R.qname = name; R.q = PRESETS[name];
    if (R.scene) { R.scene.fog.near = R.q.fogNear; R.scene.fog.far = R.q.fogFar; }
    R.resize(); if (R.game && !silent) R.reset(R.game);
  };
  R.resize = function () {
    if (!R.renderer) return; const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight), dpr = Math.min(window.devicePixelRatio || 1, R.q.maxDpr);
    const ratio = Math.max(0.4, dpr * R.q.scale * R.ratioK); R.renderer.setPixelRatio(ratio); R.renderer.setSize(w, h, false);
    R.w = w; R.h = h; R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); if (R.onResize) R.onResize(w, h);
  };

  R.reset = function (game) {
    R.game = game; const q = R.q;
    if (R.world) { R.scene.remove(R.world.root); R.world.dispose && R.world.dispose(); }
    if (R.ents) { for (const b of R.ents.batches) { R.scene.remove(b.mesh); b.mesh.geometry.dispose(); } }
    for (const l of R.pl || []) R.scene.remove(l);
    R.world = D.world.build(game.map, q);
    R.scene.add(R.world.root);
    R.ents = D.ents.create(R.scene, R.world, q);
    R.ents.hooks.shake = (n) => { if (R.opts.shake) R.shakeAmp = Math.min(6, R.shakeAmp + n); };
    R.ents.hooks.screenFlash = (c) => { if (R.onScreenFlash) R.onScreenFlash(c); };
    R.ents.hooks.hit = (e) => { if (R.onHit) R.onHit(e); };
    R.pl = []; for (let i = 0; i < q.lights; i++) { const l = new THREE.PointLight(0xffc060, 0, 30, 1.4); R.scene.add(l); R.pl.push(l); }
    R.cam = { x: 0, y: 1.45, z: 0, a: 0, rx: 0, rz: 1, fx: 1, fz: 0 }; R.eyeY = 1.45; R.bobY = 0; R.bobX = 0; R.shakeAmp = 0; R.nukeT = 0;
  };

  R.event = function (e, g) { if (!R.ents) return; D.ents.event(R.ents, e, g, R.cam); };

  const tv = { x: 0, y: 0 };
  R.project = function (wx, wy, wz) {                       // world -> screen pixels (for damage numbers); null when behind the camera
    const v = new THREE.Vector3(wx, wy, wz).project(R.camera); if (v.z > 1 || v.z < -1) return null; tv.x = (v.x * 0.5 + 0.5) * R.w; tv.y = (-v.y * 0.5 + 0.5) * R.h; return tv;
  };

  R.draw = function (g, dt, view) {
    if (!R.ready || !R.world) return;
    const P = g.player, cam = R.camera, t = (R.t = (R.t || 0) + dt);
    const yaw = P.aim, pitch = view.pitch || 0;
    // ---- eye: bob, sprint lean, shake, death fall ----
    const moving = P.moving ? 1 : 0, sprint = view.sprint ? 1 : 0;
    R.bobAmt = (R.bobAmt || 0) + (moving - (R.bobAmt || 0)) * Math.min(1, dt * 10);
    let eye = 1.45 + Math.sin(P.bob * 0.9) * 0.06 * R.bobAmt * (1 + sprint * 0.7), side = Math.cos(P.bob * 0.45) * 0.04 * R.bobAmt;
    let roll = Math.cos(P.bob * 0.45) * 0.006 * R.bobAmt * (1 + sprint), shakeY = 0, shakeX = 0, shakeR = 0;
    if (R.shakeAmp > 0.01) { const k = R.shakeAmp * 0.012; shakeX = (Math.random() - 0.5) * k * 2; shakeY = (Math.random() - 0.5) * k * 2; shakeR = (Math.random() - 0.5) * k * 0.8; R.shakeAmp *= Math.pow(0.0006, dt); }
    if (g.over) { view.deadT = Math.min(1.5, (view.deadT || 0) + dt); const k = view.deadT / 1.5; eye = eye * (1 - 0.72 * k * k); roll += k * 0.9; } else view.deadT = 0;
    const rx = -Math.sin(yaw), rz = Math.cos(yaw), fx = Math.cos(yaw), fz = Math.sin(yaw);
    cam.position.set(P.x * S + rx * side + rx * shakeX, eye + shakeY, P.y * S + rz * side + rz * shakeX);
    cam.rotation.set(pitch + shakeY * 0.5, -yaw - Math.PI / 2, roll + shakeR);
    const zt = view.zoom || 1; R.zoomNow += (zt - R.zoomNow) * Math.min(1, dt * 14);
    const fov = R.q.fov / R.zoomNow + (sprint && moving ? 4 : 0) * 1; if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    R.cam = { x: cam.position.x, y: cam.position.y, z: cam.position.z, a: yaw, rx, rz, fx, fz };
    // ---- world and creatures ----
    R.world.update(g, dt, t);
    D.ents.update(R.ents, g, dt, t, R.cam);
    // ---- muzzle / blast light ----
    const fl = R.ents.flash, c = R.ents.flashCol;
    for (let i = 0; i < R.pl.length; i++) {
      const l = R.pl[i];
      if (i === 0) { l.position.set(R.cam.x + fx * 1.2, 1.4, R.cam.z + fz * 1.2); l.color.setRGB(c[0], c[1], c[2]); l.intensity = Math.min(4, fl * 2.2); }
      else { l.position.set(R.cam.x - fx * 0.5, 2.6, R.cam.z - fz * 0.5); l.color.setRGB(0.5, 0.5, 0.6); l.intensity = Math.min(1.5, fl * 0.7); }
    }
    R.renderer.render(R.scene, cam);
    const info = R.renderer.info.render; R.drawCalls = info.calls; R.tris = info.triangles;
    // ---- automatic quality: if the frame rate sags, render at a lower resolution; if it is smooth again, creep back up ----
    if (R.auto && dt > 0) {
      R.ft = (R.ft || 1 / 60) * 0.95 + dt * 0.05; R.fps = 1 / R.ft; R.govT = (R.govT || 0) + dt;
      if (R.govT > 1.5) { R.govT = 0; if (R.ft > 1 / 42 && R.ratioK > 0.55) { R.ratioK = Math.max(0.55, R.ratioK - 0.1); R.resize(); } else if (R.ft < 1 / 56 && R.ratioK < 1) { R.ratioK = Math.min(1, R.ratioK + 0.05); R.resize(); } }
    }
  };
})();
