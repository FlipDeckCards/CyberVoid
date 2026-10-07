// Feral 3.0 - the first-person weapon. Your gun models are single static meshes, so every motion is procedural: sway and bob, sprint pose, recoil kick (springs), the pump and bolt
// cycles, and a different reload for each gun. A separate scene and camera draw it on top of the world (so it never pokes into walls), lit to match its surroundings.
import * as THREE from 'three';
import { assets } from './assets.mjs';

const D = window.DZF;
const ease = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
const bump = (k, a, b) => ease((k - a) / (b - a)) * (1 - ease((k - b) / (b - a + 0.0001)));       // 0 before a, 1 at b, 0 again after
// per gun: where it sits in view space (x right, y up, z forward away from you), how far it zooms when aiming, and how it behaves
const GUNS = {
  pistol:  { pos: [0.17, -0.16, -0.36], ads: [0.0, -0.075, -0.30], zoom: 1.25, kick: [0.045, 0.05], scale: 1.0, flash: 0.9, sprint: [0.7, 0.35] },
  shotgun: { pos: [0.19, -0.20, -0.46], ads: [0.0, -0.105, -0.42], zoom: 1.2, kick: [0.10, 0.09], scale: 1.0, flash: 1.6, sprint: [0.55, 0.45], pump: true },
  rifle:   { pos: [0.19, -0.20, -0.48], ads: [0.0, -0.100, -0.42], zoom: 1.45, kick: [0.035, 0.04], scale: 1.0, flash: 1.0, sprint: [0.55, 0.45] },
  bolt:    { pos: [0.20, -0.21, -0.50], ads: [0.0, -0.105, -0.44], zoom: 2.6, kick: [0.11, 0.10], scale: 1.0, flash: 1.5, sprint: [0.55, 0.45], bolt: true },
  mg:      { pos: [0.20, -0.22, -0.50], ads: [0.0, -0.115, -0.45], zoom: 1.3, kick: [0.03, 0.04], scale: 1.0, flash: 1.0, sprint: [0.6, 0.5] },
};
export class ViewModel {
  constructor(engine) {
    this.engine = engine; this.scene = engine.viewScene; this.root = new THREE.Group(); this.scene.add(this.root); this.guns = {}; this.cur = null; this.curId = null;
    this.hemi = new THREE.HemisphereLight(0x5a6c98, 0x2a2e26, 1.6); this.sun = new THREE.DirectionalLight(0x9ab4ff, 2.4); this.sun.position.set(-0.6, 1, 0.5); this.lamp = new THREE.PointLight(0xffd29a, 0, 6, 2); this.lamp.position.set(0.2, 0.3, 0.2); this.flashL = new THREE.PointLight(0xffc070, 0, 4, 2);
    this.scene.add(this.hemi, this.sun, this.lamp, this.flashL, this.root);
    const ft = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,210,140,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,230,170,0.9)'; x.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); x.stroke(); } return new THREE.CanvasTexture(c); })();
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); this.flashMesh.visible = false; this.flashMesh.renderOrder = 10;
    // state
    this.fireT = 9; this.swapT = 9; this.kickZ = 0; this.kickP = 0; this.kickPv = 0; this.kickZv = 0; this.kickY = 0; this.cycleT = 9; this.reloadT = 0; this.reloading = false; this.sway = new THREE.Vector2(); this.ads = 0; this.sprintK = 0; this.bobK = 0; this.forged = false; this.t = 0; this.muzzleWorld = new THREE.Vector3();
  }
  addWeapon(id) {
    if (this.guns[id] || !assets.models[id]) return; const m = assets.models[id], holder = new THREE.Group(), mesh = m.scene.clone(true);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.material = o.material.clone(); o.material.envMapIntensity = 1.4; o.material.userData.base = { color: o.material.color.clone() }; } });
    mesh.rotation.y = Math.PI; holder.add(mesh);                    // the model's barrel points +Z; in view space "forward" is -Z
    const len = m.size[2]; this.guns[id] = { id, holder, mesh, def: GUNS[id], len, muzzle: new THREE.Vector3(0, m.max[1] * 0.55, -len / 2), forgedMats: null }; holder.visible = false; this.root.add(holder);
  }
  setEnv(tex) { this.scene.environment = tex; this.scene.environmentIntensity = 0.9; }
  select(id, forged) {
    if (!this.guns[id]) id = this.guns.pistol ? 'pistol' : null; if (!id) return;
    if (this.curId !== id) { if (this.cur) this.cur.holder.visible = false; this.cur = this.guns[id]; this.curId = id; this.cur.holder.visible = true; this.swapT = 0; this.cur.holder.add(this.flashMesh); this.reloading = false; }
    this.setForged(!!forged);
  }
  setForged(on) {
    if (!this.cur || this.forged === on && this.cur.forgedState === on) return; this.forged = on; this.cur.forgedState = on;
    this.cur.mesh.traverse((o) => { if (o.isMesh) { const m = o.material; if (on) { m.color.copy(m.userData.base.color).multiply(new THREE.Color(1.25, 1.0, 0.6)); m.emissive.setHex(0xff9a20); m.emissiveIntensity = 0.28; m.metalness = Math.min(1, (m.metalness || 0) + 0.2); } else { m.color.copy(m.userData.base.color); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; } } });
  }
  event(e) {
    if (e.t === 'shot') { const g = this.cur && this.cur.def; if (!g) return; this.fireT = 0; this.kickZv += g.kick[0] * 14; this.kickPv += g.kick[1] * 10 * (1 - this.ads * 0.5); this.kickY = (Math.random() - 0.5) * 0.04; if (g.pump || g.bolt) this.cycleT = 0; }
    else if (e.t === 'swap') this.swapT = 0;
    else if (e.t === 'reload') { this.reloading = true; this.reloadT = 0; this.reloadDur = e.dur; }
    else if (e.t === 'reloaded') this.reloading = false;
    else if (e.t === 'upgrade') { this.setForged(true); }
  }
  reset() { this.fireT = 9; this.swapT = 0; this.kickZ = this.kickP = this.kickZv = this.kickPv = 0; this.reloading = false; this.cycleT = 9; }
  // light the gun like its surroundings: the nearest world light tints it
  setSurround(color, intensity) { this.lamp.color.copy(color); this.lamp.intensity = intensity; }
  update(g, dt, view, lampInfo) {
    this.t += dt; const P = g.player, cur = this.cur; if (!cur) return; const def = cur.def, ids = P.weapons[P.cur];
    if (ids && ids.id !== this.curId) this.select(ids.id, ids.up); else this.setForged(!!(ids && ids.up));
    this.fireT += dt; this.swapT += dt; this.cycleT += dt;
    // springs for the recoil
    this.kickZv -= (this.kickZ * 220 + this.kickZv * 18) * dt; this.kickZ += this.kickZv * dt; this.kickPv -= (this.kickP * 160 + this.kickPv * 14) * dt; this.kickP += this.kickPv * dt; this.kickY *= Math.pow(0.02, dt);
    this.ads += ((view.adsHeld ? 1 : 0) - this.ads) * Math.min(1, dt * (def.zoom > 2 ? 7 : 10)); view.ads = this.ads;
    const moving = P.moving ? 1 : 0, sprint = view.sprint ? 1 : 0; this.sprintK += (sprint - this.sprintK) * Math.min(1, dt * 8); this.bobK += (moving - this.bobK) * Math.min(1, dt * 8);
    const bobA = (1 - this.ads * 0.85), bx = Math.sin(P.bob * 0.5) * 0.012 * this.bobK * bobA * (1 + this.sprintK * 0.8), by = Math.abs(Math.cos(P.bob * 0.5)) * 0.014 * this.bobK * bobA * (1 + this.sprintK * 0.8);
    this.sway.x += (-view.turnRate * 0.0018 - this.sway.x) * Math.min(1, dt * 7); this.sway.y += (view.pitchRate * 0.0018 - this.sway.y) * Math.min(1, dt * 7);
    const breathe = Math.sin(this.t * 1.7) * 0.0025 * (1 - this.ads * 0.7);
    // base pose, blended towards the aiming pose
    let x = D.lerp(def.pos[0], def.ads[0], this.ads), y = D.lerp(def.pos[1], def.ads[1], this.ads), z = D.lerp(def.pos[2], def.ads[2], this.ads), rx = 0, ry = 0, rz = 0;
    x += bx + this.sway.x * 0.6; y += by + breathe + this.sway.y * 0.5; z += this.kickZ * 0.5; rx += this.kickP + this.sway.y * 0.6; ry += this.kickY + this.sway.x * 0.8;
    // sprint: the gun drops and turns across the body
    x -= this.sprintK * 0.08; y -= this.sprintK * 0.07; rx -= this.sprintK * def.sprint[0] * 0.5; ry += this.sprintK * def.sprint[1] * 0.9; rz -= this.sprintK * 0.25;
    // crouch: a touch lower and closer
    y -= P.crouch * 0.015;
    // swap: the new gun comes up from below
    if (this.swapT < 0.42) { const k = 1 - ease(this.swapT / 0.42); y -= 0.42 * k; rx -= 0.7 * k; }
    // the pump / bolt cycle between shots
    if (def.pump && this.cycleT < 0.55) { const k = this.cycleT / 0.55; z += Math.sin(k * Math.PI) * 0.09 * (k < 0.5 ? 1 : 1); rx += Math.sin(k * Math.PI * 2) * 0.05; y -= bump(k, 0.1, 0.5) * 0.015; }
    if (def.bolt && this.cycleT < 0.9) { const k = this.cycleT / 0.9; rz += bump(k, 0.15, 0.4) * 0.45 - bump(k, 0.55, 0.75) * 0.45; z += (bump(k, 0.35, 0.55) - bump(k, 0.6, 0.8)) * 0.05; y -= bump(k, 0.1, 0.5) * 0.01; }
    // reloads: each gun does something a little different
    let reloadK = 0; if (this.reloading) { this.reloadT += dt; reloadK = Math.min(1, this.reloadT / Math.max(0.2, this.reloadDur || 1.5)); const r = reloadK, id = this.curId;
      if (id === 'pistol') { y -= bump(r, 0.0, 0.45) * 0.1 * (1 - ease((r - 0.6) / 0.4)); rz += bump(r, 0.05, 0.4) * 0.65 * (1 - ease((r - 0.55) / 0.45)); rx += bump(r, 0.1, 0.45) * 0.25 * (1 - ease((r - 0.6) / 0.4)); z += bump(r, 0.55, 0.7) * 0.04 - bump(r, 0.7, 0.8) * 0.04; ry += Math.sin(r * 18) * 0.012 * bump(r, 0.2, 0.4); }
      else if (id === 'shotgun') { const shells = 6; y -= bump(r, 0.0, 0.2) * 0.07 * (1 - ease((r - 0.8) / 0.2)); rz += bump(r, 0.0, 0.25) * 0.5 * (1 - ease((r - 0.8) / 0.2)); rx += 0.18 * bump(r, 0.0, 0.2) * (1 - ease((r - 0.8) / 0.2)); const s = (r * shells) % 1; y -= Math.sin(s * Math.PI) * 0.012 * (r > 0.1 && r < 0.8 ? 1 : 0); z += (r > 0.86 ? Math.sin((r - 0.86) / 0.14 * Math.PI) * 0.09 : 0); }
      else if (id === 'bolt') { y -= bump(r, 0.0, 0.3) * 0.08 * (1 - ease((r - 0.75) / 0.25)); rz += bump(r, 0.05, 0.35) * 0.55 * (1 - ease((r - 0.7) / 0.3)); rx += 0.15 * bump(r, 0.1, 0.3); z += (bump(r, 0.55, 0.65) - bump(r, 0.68, 0.78)) * 0.06; rz += bump(r, 0.55, 0.65) * 0.3 - bump(r, 0.68, 0.78) * 0.3; }
      else { y -= bump(r, 0.0, 0.3) * 0.12 * (1 - ease((r - 0.7) / 0.3)); rz += bump(r, 0.0, 0.3) * 0.55 * (1 - ease((r - 0.65) / 0.35)); rx += bump(r, 0.05, 0.3) * 0.3 * (1 - ease((r - 0.7) / 0.3)); z += bump(r, 0.4, 0.5) * 0.03 - bump(r, 0.5, 0.6) * 0.03; ry += bump(r, 0.78, 0.86) * 0.08 - bump(r, 0.86, 0.94) * 0.08; z += bump(r, 0.82, 0.9) * 0.05; if (this.curId === 'mg') { y -= bump(r, 0.2, 0.5) * 0.05; } }
    }
    cur.holder.position.set(x, y, z); cur.holder.rotation.set(rx, ry, rz);
    // the muzzle flash
    const fl = this.fireT < 0.055; this.flashMesh.visible = fl; if (fl) { this.flashMesh.position.set(cur.muzzle.x, cur.muzzle.y, cur.muzzle.z * 1.06 - 0.03); this.flashMesh.scale.setScalar((0.8 + Math.random() * 0.5) * def.flash); this.flashMesh.rotation.z = Math.random() * 6; this.flashMesh.quaternion.copy(this.engine.viewCamera.quaternion); }
    this.flashL.intensity = fl ? 40 * def.flash : 0; this.flashL.position.set(cur.holder.position.x, cur.holder.position.y + 0.05, cur.holder.position.z - cur.len * 0.5 - 0.05);
    if (lampInfo) this.setSurround(lampInfo.color, lampInfo.intensity);
    // the camera that draws the gun: a narrower field of view when aiming, so the gun does not balloon
    const vc = this.engine.viewCamera; const fov = D.lerp(58, 40, this.ads * 0.6) * (def.zoom > 2 ? 1 : 1); if (Math.abs(vc.fov - fov) > 0.05) { vc.fov = fov; vc.updateProjectionMatrix(); }
    // world position of the muzzle (for tracers and shells)
    cur.holder.updateMatrixWorld(true); this.muzzleWorld.copy(cur.muzzle); cur.holder.localToWorld(this.muzzleWorld); this.muzzleWorld.applyMatrix4(this.engine.camera.matrixWorld);
    view.reloadK = reloadK; view.zoomFactor = D.lerp(1, def.zoom, this.ads);
  }
  zoomFor(id) { return GUNS[id] ? GUNS[id].zoom : 1.2; }
}
