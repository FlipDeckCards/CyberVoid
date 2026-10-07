// Feral 3.0 - effects: GPU-drawn particles (sparks, embers, ash, smoke, dust, fireflies), tracers, muzzle flash light, shell casings, bullet-hole and scorch decals, shock rings,
// and the ambient atmosphere that changes with the part of the park you are in.
import * as THREE from 'three';

const D = window.DZF, S = 1 / 8, TAU = Math.PI * 2;
const rr = (a, b) => a + (b - a) * Math.random();
const hexc = (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };

function spriteAtlas() {                                   // left half: a soft glow; right half: a ragged smoke puff
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  let g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) { const px = 192 + (Math.random() - 0.5) * 50, py = 64 + (Math.random() - 0.5) * 50, r = 14 + Math.random() * 22; g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
class Points {
  constructor(scene, cap, additive, tex) {
    this.cap = cap; this.n = 0; this.list = []; this.additive = additive;
    const geo = new THREE.BufferGeometry(); this.pos = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.col = new Float32Array(cap * 4); this.tx = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aTex', new THREE.BufferAttribute(this.tx, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: 'attribute float aSize; attribute vec4 aColor; attribute float aTex; varying vec4 vColor; varying float vTex; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 600.0); vColor = aColor; vTex = aTex; }',
      fragmentShader: 'uniform sampler2D uTex; varying vec4 vColor; varying float vTex; void main(){ vec2 uv = vec2(gl_PointCoord.x * 0.5 + vTex * 0.5, 1.0 - gl_PointCoord.y); float a = texture2D(uTex, uv).r; gl_FragColor = vec4(vColor.rgb, vColor.a * a); if (gl_FragColor.a < 0.003) discard; }' });
    this.obj = new THREE.Points(geo, this.mat); this.obj.frustumCulled = false; this.obj.userData.noAO = true; this.obj.renderOrder = additive ? 6 : 5; scene.add(this.obj);
  }
  add(p) { if (this.list.length < this.cap) this.list.push(p); }
  update(dt, t) {
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.life -= dt; if (p.life <= 0) continue;
      p.vy += (p.grav || 0) * dt; const drag = Math.pow(p.drag == null ? 0.5 : p.drag, dt); p.vx *= drag; p.vz *= drag; if (p.dragY) p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0.03) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const k = p.life / p.max, fade = p.fadeIn ? Math.min(1, (1 - k) * p.fadeIn) * Math.min(1, k * 2) : Math.min(1, k * (p.fadeOut || 2.5)); const j = w * 3;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z; this.size[w] = Math.max(0.01, p.size * (1 + (p.grow || 0) * (1 - k))); const f = p.flicker ? 0.6 + 0.4 * Math.sin(t * p.flicker + p.seed) : 1;
      this.col[w * 4] = p.r * f; this.col[w * 4 + 1] = p.g * f; this.col[w * 4 + 2] = p.b * f; this.col[w * 4 + 3] = (p.a == null ? 1 : p.a) * fade; this.tx[w] = p.tex || 0; L[w] = p; w++;
    }
    L.length = w; this.n = w; const g = this.obj.geometry; g.setDrawRange(0, w);
    for (const k of ['position', 'aSize', 'aColor', 'aTex']) g.attributes[k].needsUpdate = true;
  }
}

export class FX {
  constructor(engine, world) {
    this.engine = engine; this.scene = engine.scene; this.world = world; this.t = 0; const tex = spriteAtlas();
    this.add = new Points(this.scene, 3000, true, tex); this.smoke = new Points(this.scene, 1200, false, tex);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 22, 2); this.scene.add(this.flashLight); this.flash = 0; this.flashCol = new THREE.Color(0xffc070); this.shake = 0; this.screenFlash = 0;
    // tracers
    this.tracers = []; const tg = new THREE.PlaneGeometry(1, 1), tm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(tg, tm.clone()); m.visible = false; m.userData.noAO = true; m.frustumCulled = false; this.scene.add(m); this.tracers.push({ m, life: 0, max: 0.08 }); }
    // decals: bullet holes on walls, scorch marks on the floor, shock rings
    const holeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.35, 'rgba(10,8,6,0.8)'); g.addColorStop(0.7, 'rgba(40,34,28,0.4)'); g.addColorStop(1, 'rgba(40,34,28,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + Math.random(); x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * (14 + Math.random() * 16), 32 + Math.sin(a) * (14 + Math.random() * 16)); x.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    this.holes = this.makeDecals(holeTex, 160, false); this.scorch = this.makeDecals(holeTex, 48, true);
    const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 40, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    this.rings = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.noAO = true; m.renderOrder = 4; this.scene.add(m); this.rings.push({ m, t: 0, dur: 1, r: 1, active: false }); }
    // shell casings
    const sg = new THREE.CylinderGeometry(0.009, 0.009, 0.034, 6); this.shells = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 }), 24); this.shells.count = 0; this.shells.frustumCulled = false; this.shells.userData.noAO = true; this.scene.add(this.shells); this.shellList = [];
    this.ambient = { t: 0 }; this.room = 0; this.tmp = new THREE.Object3D();
  }
  makeDecals(tex, cap, floor) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1, metalness: 0 }), cap); m.count = 0; m.frustumCulled = false; m.userData.noAO = true; this.scene.add(m); return { m, cap, next: 0, filled: 0, floor };
  }
  decal(set, x, y, z, nx, ny, nz, size) {
    const o = this.tmp; o.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02); o.lookAt(x + nx, y + ny, z + nz); o.rotateZ(Math.random() * TAU); o.scale.setScalar(size); o.updateMatrix();
    const i = set.next; set.m.setMatrixAt(i, o.matrix); set.next = (i + 1) % set.cap; set.filled = Math.min(set.cap, set.filled + 1); set.m.count = set.filled; set.m.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const s of [this.holes, this.scorch]) { s.next = 0; s.filled = 0; s.m.count = 0; } this.add.list.length = 0; this.smoke.list.length = 0; this.shellList.length = 0; for (const r of this.rings) { r.active = false; r.m.visible = false; } for (const t of this.tracers) { t.life = 0; t.m.visible = false; } this.flash = 0; }
  // ----- spawning -----
  spark(x, y, z, n, o = {}) { const c = o.color || [1, 0.7, 0.3]; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = rr(1, o.speed || 6); this.add.add({ x, y, z, vx: Math.cos(a) * sp * (o.dx == null ? 1 : 0.5) + (o.dx || 0) * rr(0.5, 2), vy: rr(-0.5, 3) * (o.up || 1), vz: Math.sin(a) * sp * (o.dz == null ? 1 : 0.5) + (o.dz || 0) * rr(0.5, 2), grav: -9, drag: 0.35, size: rr(0.025, 0.06) * (o.size || 1), life: rr(0.25, 0.6), max: 0.6, r: c[0], g: c[1], b: c[2], a: 1, tex: 0, floor: true }); } }
  ember(x, y, z, n, o = {}) { const c = o.color || [1, 0.45, 0.1]; for (let i = 0; i < n; i++) this.add.add({ x: x + rr(-1, 1) * (o.r || 0.3), y: y + rr(0, 0.5), z: z + rr(-1, 1) * (o.r || 0.3), vx: rr(-0.5, 0.5), vy: rr(0.8, 2.6), vz: rr(-0.5, 0.5), grav: 0.3, drag: 0.6, size: rr(0.04, 0.11), life: rr(1.2, 3.2), max: 3.2, r: c[0], g: c[1], b: c[2], a: 1, tex: 0, flicker: rr(8, 20), seed: Math.random() * 6, fadeOut: 1.5 }); }
  puff(x, y, z, n, o = {}) { const c = o.color || [0.3, 0.3, 0.32]; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = rr(0.2, o.speed || 1.5); this.smoke.add({ x, y, z, vx: Math.cos(a) * sp, vy: rr(0.2, 1.4), vz: Math.sin(a) * sp, grav: 0.2, drag: 0.5, size: (o.size || 0.9) * rr(0.7, 1.3), grow: o.grow == null ? 2.2 : o.grow, life: rr(0.8, 1.8), max: 1.8, r: c[0], g: c[1], b: c[2], a: o.alpha == null ? 0.35 : o.alpha, tex: 1 }); } }
  fire(x, y, z, n, o = {}) { for (let i = 0; i < n; i++) this.add.add({ x: x + rr(-0.2, 0.2), y, z: z + rr(-0.2, 0.2), vx: (o.dx || 0) * rr(3, 9) + rr(-1, 1), vy: rr(-0.3, 1) + (o.up || 0), vz: (o.dz || 0) * rr(3, 9) + rr(-1, 1), grav: 1.5, drag: 0.3, size: rr(0.3, 0.8) * (o.size || 1), grow: 1.2, life: rr(0.3, 0.7), max: 0.7, r: 1, g: rr(0.35, 0.6), b: 0.08, a: 0.4, tex: 0 }); }
  ring(x, z, r, dur, color, y) { const q = this.rings.find((q) => !q.active) || this.rings[0]; q.active = true; q.t = 0; q.dur = dur; q.r = r; q.m.position.set(x, y == null ? 0.07 : y, z); q.m.material.color.setRGB(color[0], color[1], color[2]); q.m.visible = true; }
  tracer(x0, y0, z0, x1, y1, z1, color, cam) {
    const q = this.tracers.find((t) => t.life <= 0); if (!q) return; const m = q.m, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz); if (len < 0.5) return;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); const dir = new THREE.Vector3(dx, dy, dz).normalize(), toCam = new THREE.Vector3(cam.x - m.position.x, cam.y - m.position.y, cam.z - m.position.z).normalize(), side = new THREE.Vector3().crossVectors(dir, toCam).normalize(), nrm = new THREE.Vector3().crossVectors(side, dir);
    const basis = new THREE.Matrix4().makeBasis(dir, side, nrm); m.quaternion.setFromRotationMatrix(basis); m.scale.set(len, 0.035, 1); m.material.color.setRGB(color[0], color[1], color[2]); m.material.opacity = 0.9; m.visible = true; q.life = q.max = 0.07;
  }
  muzzle(color, strength) { this.flash = Math.max(this.flash, strength); this.flashCol.setRGB(color[0], color[1], color[2]); }
  shell(x, y, z, rx, rz) { if (this.shellList.length >= 24) this.shellList.shift(); this.shellList.push({ x, y, z, vx: rx * rr(1.2, 2.2) + rr(-0.3, 0.3), vy: rr(1.5, 2.6), vz: rz * rr(1.2, 2.2) + rr(-0.3, 0.3), rx: Math.random() * 6, rz: Math.random() * 6, spin: rr(8, 20), life: 2.5 }); }

  // ----- sim events -> effects -----
  event(e, g, cam, hooks) {
    const px = cam.x, pz = cam.z;
    switch (e.t) {
      case 'shot': {
        const w = D.WEAPONS[e.w], c = hexc(w.color); this.muzzle(c, e.w === 'shotgun' ? 2.4 : e.w === 'bolt' ? 2.0 : 1.3); if (hooks.shake) hooks.shake(w.shake * 0.5);
        const o = hooks.muzzlePos ? hooks.muzzlePos() : { x: px + cam.fx * 0.8, y: cam.y - 0.2, z: pz + cam.fz * 0.8 };
        for (const r of e.rays) this.tracer(o.x, o.y, o.z, r.x1 * S, r.z1, r.y1 * S, c, cam);
        this.spark(o.x, o.y, o.z, 4, { color: c, speed: 5, dx: cam.fx, dz: cam.fz, size: 0.9 }); this.puff(o.x + cam.fx * 0.4, o.y, o.z + cam.fz * 0.4, 1, { size: 0.3, speed: 0.5, alpha: 0.12, grow: 3 });
        const rx = cam.rx, rz = cam.rz; this.shell(o.x - cam.fx * 0.15 + rx * 0.05, o.y - 0.02, o.z - cam.fz * 0.15 + rz * 0.05, rx, rz);
        break;
      }
      case 'spark': if (e.wall) this.wallImpact(e, g, cam); break;
      case 'hit': { const x = e.x * S, z = e.y * S, y = Math.max(0.4, e.z == null ? 1.0 : e.z), dx = px - x, dz = pz - z, l = Math.hypot(dx, dz) || 1; this.spark(x, y, z, e.head ? 12 : 6, { color: [1, 0.55, 0.2], speed: 4, dx: dx / l, dz: dz / l }); this.ember(x, y, z, e.head ? 4 : 2, { r: 0.2 }); this.puff(x, y, z, 1, { color: [0.2, 0.18, 0.18], size: 0.5, alpha: 0.2, speed: 0.6 }); if (e.head) this.add.add({ x, y, z, vx: 0, vy: 0, vz: 0, size: 0.6, grow: 2, life: 0.15, max: 0.15, r: 1, g: 0.8, b: 0.5, a: 0.8, tex: 0 }); break; }
      case 'kill': {
        const x = e.x * S, z = e.y * S, big = e.boss ? 3 : e.r > 7 ? 2 : 1, h = (e.h || 1.2) * 0.5;
        if (e.boom) { this.explosion(x, h, z, 3.5); break; }
        this.spark(x, h, z, 14 * big, { color: [1, 0.5, 0.15], speed: 6 }); this.ember(x, h, z, 18 * big, { r: 0.7 * big }); this.puff(x, h * 0.6, z, 5 * big, { color: [0.18, 0.16, 0.16], size: 1.1 * big, alpha: 0.3, speed: 1.4 });
        this.decal(this.scorch, x, 0.02, z, 0, 1, 0, (e.boss ? 7 : e.r > 7 ? 4 : 2.2)); this.muzzle([1, 0.5, 0.2], 0.5 * big);
        break;
      }
      case 'boom': { const x = e.x * S, z = e.y * S; if (e.nuke) { this.screenFlash = 1; if (hooks.shake) hooks.shake(6); for (let i = 0; i < 80; i++) { const a = Math.random() * TAU, sp = rr(6, 22); this.add.add({ x: px + Math.cos(a) * 2, y: rr(0.3, 3), z: pz + Math.sin(a) * 2, vx: Math.cos(a) * sp, vy: rr(-1, 2), vz: Math.sin(a) * sp, drag: 0.5, size: rr(0.6, 1.6), grow: 2, life: rr(0.5, 1.0), max: 1, r: 1, g: 0.45, b: 0.15, a: 0.9, tex: 0 }); } this.ring(px, pz, 40, 0.9, [1, 0.5, 0.2], 0.2); } else this.explosion(x, 0.8, z, 3); break; }
      case 'splash': { const x = e.x * S, z = e.y * S; if (e.fire) { this.fire(x, 0.5, z, 8, { size: 0.7 }); this.ember(x, 0.3, z, 5); } else { this.spark(x, 0.6, z, 8, { color: [0.45, 1, 0.3], speed: 3 }); this.puff(x, 0.5, z, 2, { color: [0.3, 0.6, 0.2], size: 0.6, alpha: 0.25 }); this.decal(this.scorch, x, 0.02, z, 0, 1, 0, 1.2); } break; }
      case 'plank': { const x = e.x * S, z = e.y * S; this.puff(x, 1.2, z, 5, { color: [0.45, 0.36, 0.26], size: 0.5, alpha: 0.4, speed: 2 }); this.spark(x, 1.4, z, 5, { color: [0.8, 0.6, 0.35], speed: 3 }); if (hooks.shake) hooks.shake(0.4 * Math.max(0, 1 - Math.hypot(px - x, pz - z) / 25)); break; }
      case 'repair': { const x = e.x * S, z = e.y * S; this.spark(x + rr(-1.5, 1.5), 1.4, z + rr(-0.5, 0.5), 5, { color: [1, 0.9, 0.5], speed: 2 }); break; }
      case 'door': { const x = e.x * S, z = e.y * S; this.puff(x, 0.6, z, 22, { color: [0.45, 0.42, 0.38], size: 1.8, alpha: 0.35, speed: 3 }); this.spark(x, 2, z, 14, { color: [1, 0.8, 0.4], speed: 4 }); if (hooks.shake) hooks.shake(1.4); break; }
      case 'bigSpawn': case 'bossSpawn': { const x = e.x * S, z = e.y * S, boss = e.t === 'bossSpawn'; this.puff(x, 0.3, z, boss ? 30 : 14, { color: [0.3, 0.25, 0.22], size: boss ? 3 : 1.6, alpha: 0.4, speed: boss ? 5 : 2.5 }); this.ember(x, 0.2, z, boss ? 40 : 14, { r: boss ? 3 : 1, color: [1, 0.35, 0.05] }); this.ring(x, z, boss ? 12 : 5, 0.8, [1, 0.35, 0.1]); if (boss && hooks.shake) hooks.shake(2.5); break; }
      case 'slamWarn': this.ring(e.x * S, e.y * S, e.r * S, 0.8, [1, 0.25, 0.15]); break;
      case 'slam': { const x = e.x * S, z = e.y * S; this.ring(x, z, e.r * S * 1.25, 0.4, [1, 0.8, 0.5]); this.puff(x, 0.3, z, e.small ? 8 : 18, { color: [0.4, 0.36, 0.32], size: 1.6, alpha: 0.4, speed: 4 }); this.spark(x, 0.3, z, 12, { color: [1, 0.6, 0.2], speed: 5 }); if (hooks.shake) hooks.shake((e.small ? 1.5 : 3.2) * Math.max(0.3, 1 - Math.hypot(px - x, pz - z) / 40)); break; }
      case 'breath': { const x = e.x * S, z = e.y * S, dx = Math.cos(e.ang), dz = Math.sin(e.ang); for (let i = 0; i < 4; i++) this.fire(x + dx * 3, 3.2, z + dz * 3, 10, { dx, dz, size: 1.1 }); this.muzzle([1, 0.45, 0.1], 0.8); break; }
      case 'pickup': { const x = e.x * S, z = e.y * S; this.spark(x, 1, z, 14, { color: hexc(D.POWERUPS[e.type].color), speed: 4 }); this.ring(x, z, 3, 0.4, hexc(D.POWERUPS[e.type].color)); break; }
      case 'drop': this.spark(e.x * S, 1, e.y * S, 10, { color: [1, 0.95, 0.6], speed: 3 }); break;
      case 'summon': this.ember(e.x * S, 1, e.y * S, 30, { r: 4 }); this.ring(e.x * S, e.y * S, 8, 0.8, [1, 0.4, 0.1]); break;
      case 'revive': this.ring(px, pz, 5, 0.6, [0.5, 1, 0.6], 0.1); this.spark(px, 1, pz, 24, { color: [0.5, 1, 0.6], speed: 5 }); break;
      case 'upgrade': case 'buy': this.spark(px + cam.fx * 2, 1.4, pz + cam.fz * 2, 12, { color: [1, 0.85, 0.35], speed: 3 }); break;
      case 'hurt': if (hooks.shake) hooks.shake(e.dmg > 20 ? 2.4 : 1.4); break;
      case 'enrage': this.ember(e.x * S, 1.2, e.y * S, 16, { r: 0.8, color: [1, 0.2, 0.05] }); break;
      default: break;
    }
  }
  explosion(x, y, z, size) {
    this.muzzle([1, 0.55, 0.2], 2.5); this.screenFlash = Math.max(this.screenFlash, 0.15); this.ring(x, z, size * 2, 0.4, [1, 0.6, 0.25]);
    for (let i = 0; i < 24; i++) { const a = Math.random() * TAU, sp = rr(1, 7) * size * 0.4; this.add.add({ x, y, z, vx: Math.cos(a) * sp, vy: rr(0, 4), vz: Math.sin(a) * sp, drag: 0.15, grav: 1, size: rr(0.6, 1.5) * size * 0.5, grow: 1.5, life: rr(0.3, 0.8), max: 0.8, r: 1, g: rr(0.3, 0.55), b: 0.1, a: 0.9, tex: 0 }); }
    this.puff(x, y, z, 10, { color: [0.12, 0.1, 0.1], size: 2 * size * 0.5, alpha: 0.5, speed: 3 }); this.spark(x, y, z, 24, { color: [1, 0.6, 0.2], speed: 10 }); this.decal(this.scorch, x, 0.02, z, 0, 1, 0, size * 1.6);
  }
  wallImpact(e, g, cam) {
    const T = D.T, ang = e.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang), K = D.K; let x = e.x, y = e.y, nx = 0, nz = 0, hit = null;
    for (let i = 0; i < 40; i++) {
      const x2 = x + ca * 0.5, y2 = y + sa * 0.5, tx = Math.floor(x2 / T), ty = Math.floor(y2 / T), ptx = Math.floor(x / T), pty = Math.floor(y / T), k = g.kindAt(tx, ty);
      if (k === K.WALL || k === K.DOOR || k === K.BLOCK || k === K.MACHINE) { if (tx !== ptx) nx = ca > 0 ? -1 : 1; else if (ty !== pty) nz = sa > 0 ? -1 : 1; else if (Math.abs(ca) > Math.abs(sa)) nx = ca > 0 ? -1 : 1; else nz = sa > 0 ? -1 : 1; hit = [x2, y2]; break; }
      x = x2; y = y2;
    }
    if (!hit) { hit = [x, y]; nx = -Math.sign(ca) || 1; }
    let hx = hit[0] * S, hz = hit[1] * S; if (nx) hx = (nx < 0 ? Math.floor(hit[0] / T) : Math.floor(hit[0] / T) + 1) * T * S; else hz = (nz < 0 ? Math.floor(hit[1] / T) : Math.floor(hit[1] / T) + 1) * T * S;
    const hy = Math.max(0.1, e.z == null ? 1.4 : e.z), c = hexc(e.color || '#ffe27a');
    this.decal(this.holes, hx, hy, hz, nx, 0, nz, rr(0.18, 0.3)); this.spark(hx + nx * 0.1, hy, hz + nz * 0.1, 5, { color: c, speed: 4, dx: nx, dz: nz }); this.puff(hx + nx * 0.1, hy, hz + nz * 0.1, 1, { color: [0.55, 0.52, 0.48], size: 0.35, alpha: 0.25, speed: 0.5 });
  }

  // ----- the atmosphere: embers and ash in the cave, fireflies in the jungle, dust motes and drifting mist in the plaza, sparks near the generator -----
  atmosphere(dt, cam, g) {
    const q = this.engine.q.particles; this.ambient.t -= dt; if (this.ambient.t > 0) return; this.ambient.t = 0.05 / Math.max(0.2, q);
    const tx = Math.floor(cam.x / 2), ty = Math.floor(cam.z / 2); let room = 0; for (const r of D.ROOMS) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) room = r.id; this.room = room;
    const x = cam.x + rr(-14, 14), z = cam.z + rr(-14, 14);
    if (room === 3) { this.add.add({ x, y: rr(0, 2), z, vx: rr(-0.3, 0.3), vy: rr(0.6, 1.8), vz: rr(-0.3, 0.3), size: rr(0.03, 0.09), life: rr(2, 5), max: 5, r: 1, g: rr(0.3, 0.5), b: 0.06, a: 0.9, tex: 0, flicker: rr(6, 14), seed: Math.random() * 6, grav: 0.2, drag: 0.7, fadeOut: 1 }); this.smoke.add({ x, y: rr(0, 3), z, vx: rr(-0.4, 0.4), vy: rr(0.2, 0.8), vz: rr(-0.4, 0.4), size: rr(1.5, 3), grow: 1.5, life: rr(3, 6), max: 6, r: 0.25, g: 0.2, b: 0.2, a: 0.1, tex: 1, drag: 0.8 }); }
    else if (room === 1) { this.add.add({ x, y: rr(0.4, 2.6), z, vx: rr(-0.5, 0.5), vy: rr(-0.1, 0.3), vz: rr(-0.5, 0.5), size: rr(0.04, 0.08), life: rr(2, 5), max: 5, r: 0.7, g: 1, b: 0.3, a: 0.9, tex: 0, flicker: rr(2, 5), seed: Math.random() * 6, drag: 0.8, fadeIn: 3 }); this.smoke.add({ x, y: rr(0.2, 1.2), z, vx: rr(-0.3, 0.3), vy: 0.05, vz: rr(-0.3, 0.3), size: rr(3, 5), grow: 0.5, life: rr(5, 9), max: 9, r: 0.35, g: 0.45, b: 0.45, a: 0.045, tex: 1, drag: 0.9, fadeIn: 2 }); }
    else { this.add.add({ x, y: rr(0.3, 3), z, vx: rr(-0.2, 0.2), vy: rr(-0.05, 0.15), vz: rr(-0.2, 0.2), size: rr(0.02, 0.04), life: rr(3, 6), max: 6, r: 0.7, g: 0.8, b: 1, a: 0.35, tex: 0, drag: 0.9, fadeIn: 3 }); if (Math.random() < 0.3) this.smoke.add({ x, y: rr(0.1, 0.6), z, vx: rr(-0.4, 0.4), vy: 0.02, vz: rr(-0.4, 0.4), size: rr(3, 6), grow: 0.4, life: rr(6, 10), max: 10, r: 0.4, g: 0.46, b: 0.55, a: 0.04, tex: 1, drag: 0.9, fadeIn: 2 }); if (room === 2 && Math.random() < 0.3) this.spark(30 * 2 + rr(-1, 1), 1.8, 26 * 2 + rr(-1, 1), 1, { color: [1, 0.8, 0.4], speed: 2 }); }
  }
  update(dt, t, cam, g) {
    this.t = t; this.atmosphere(dt, cam, g);
    const scale = this.engine.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov) / 2)); this.add.mat.uniforms.uScale.value = scale; this.smoke.mat.uniforms.uScale.value = scale;
    this.add.update(dt, t); this.smoke.update(dt, t);
    this.flash = Math.max(0, this.flash - dt * 12); this.flashLight.color.copy(this.flashCol); this.flashLight.intensity = Math.min(300, this.flash * 100); this.flashLight.position.set(cam.x + cam.fx * 1.4, cam.y - 0.1, cam.z + cam.fz * 1.4);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.6);
    for (const q of this.tracers) if (q.life > 0) { q.life -= dt; q.m.material.opacity = Math.max(0, q.life / q.max) * 0.9; if (q.life <= 0) q.m.visible = false; }
    for (const r of this.rings) if (r.active) { r.t += dt; const k = r.t / r.dur; if (k >= 1) { r.active = false; r.m.visible = false; continue; } const s = r.r * 2 * (0.3 + 0.7 * k); r.m.scale.set(s, s, 1); r.m.material.opacity = 0.9 * (1 - k); }
    // shells
    let n = 0; const o = this.tmp; for (let i = this.shellList.length - 1; i >= 0; i--) { const s = this.shellList[i]; s.life -= dt; if (s.life <= 0) { this.shellList.splice(i, 1); continue; } s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < 0.02) { s.y = 0.02; s.vy *= -0.35; s.vx *= 0.6; s.vz *= 0.6; s.spin *= 0.5; } s.rx += s.spin * dt; }
    for (const s of this.shellList) { o.position.set(s.x, s.y, s.z); o.rotation.set(s.rx, s.rz, 0); o.scale.setScalar(1); o.updateMatrix(); this.shells.setMatrixAt(n++, o.matrix); } this.shells.count = n; this.shells.instanceMatrix.needsUpdate = true;
  }
}
