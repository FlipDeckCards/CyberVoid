// Feral 3.0 - small off-screen renders of the 3D models (HUD gun icons, creature thumbnails for the how-to screen) and the rotating survivor on the character-select screen.
import * as THREE from 'three';
import { assets } from './assets.mjs';

let pr = null, scene = null, cam = null;
function setup() {
  if (pr) return; pr = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); pr.setClearColor(0x000000, 0); pr.outputColorSpace = THREE.SRGBColorSpace; pr.toneMapping = THREE.ACESFilmicToneMapping; pr.toneMappingExposure = 1.2;
  scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xcfdcff, 0x4a4030, 2.2)); const k = new THREE.DirectionalLight(0xfff0d8, 3.4); k.position.set(-2, 3, 4); scene.add(k); const r = new THREE.DirectionalLight(0x6a9aff, 1.6); r.position.set(3, 1, -3); scene.add(r); cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
}
export function thumbnail(id, opts = {}) {
  const m = assets.models[id]; if (!m) return ''; setup(); const w = opts.w || 256, h = opts.h || 128; pr.setSize(w, h, false);
  const o = m.scene.clone(true); scene.add(o); const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3()), d = Math.max(size.x, size.y, size.z) * (opts.dist || 2.4);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  if (opts.side) cam.position.set(ctr.x - d * 0.55, ctr.y + size.y * 0.25, ctr.z + d * 0.85); else cam.position.set(ctr.x + d * 0.5, ctr.y + size.y * 0.25 + d * 0.15, ctr.z + d * 0.85);
  cam.lookAt(ctr.x, ctr.y - size.y * (opts.drop || 0), ctr.z); if (opts.side) { o.rotation.y = -Math.PI / 2 + 0.35; const b2 = new THREE.Box3().setFromObject(o), c2 = b2.getCenter(new THREE.Vector3()); cam.position.set(c2.x + d * 0.2, c2.y + size.y * 0.3, c2.z + d * 1.0); cam.lookAt(c2); }
  pr.render(scene, cam); const url = pr.domElement.toDataURL('image/png'); scene.remove(o); return url;
}
// the rotating survivor
export class CharPreview {
  constructor(canvas) {
    this.canvas = canvas; this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.15; this.r.shadowMap.enabled = true;
    this.s = new THREE.Scene(); this.s.add(new THREE.HemisphereLight(0x9fb4e8, 0x2a2c24, 1.6)); const key = new THREE.DirectionalLight(0xffe2b8, 3.2); key.position.set(-2.5, 3.5, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.s.add(key); const rim = new THREE.DirectionalLight(0x5a9aff, 2.4); rim.position.set(3, 2, -3); this.s.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: 0x20302a, roughness: 0.8, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.s.add(floor);
    this.cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 50); this.cam.position.set(0, 1.25, 4.4); this.cam.lookAt(0, 0.95, 0); this.obj = null; this.id = null; this.t = 0; this.running = false;
  }
  show(id) { if (this.obj) { this.s.remove(this.obj); this.obj = null; } const m = assets.models[id]; if (!m) { this.id = id; return false; } this.obj = m.scene.clone(true); this.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); this.s.add(this.obj); this.id = id; return true; }
  start() { if (this.running) return; this.running = true; const loop = () => { if (!this.running) return; requestAnimationFrame(loop); this.t += 1 / 60; if (this.obj) { this.obj.rotation.y = this.t * 0.6; this.obj.position.y = Math.sin(this.t * 1.5) * 0.008; } const c = this.canvas, w = c.clientWidth || c.width, h = c.clientHeight || c.height; if (c.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); } this.r.render(this.s, this.cam); }; loop(); }
  stop() { this.running = false; }
}
