// Feral 3.0 - the renderer: Three.js scene, camera, quality presets (Ultra / High / Medium / Low), the post-processing stack (ambient occlusion, bloom, colour grading, tone mapping)
// and the moonlight with real shadows that follows the player.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const PRESETS = {
  ultra:  { name: 'ultra',  scale: 1.0,  maxDpr: 2,   msaa: 4, ao: true,  bloom: true,  bloomRes: 1,   shadow: 4096, shadowRange: 52, flashShadow: true,  lights: 8, foliage: 1.0,  particles: 1.0,  fogDensity: 1, view: 1.0 },
  high:   { name: 'high',   scale: 1.0,  maxDpr: 1.5, msaa: 4, ao: false, bloom: true,  bloomRes: 0.5, shadow: 2048, shadowRange: 44, flashShadow: false, lights: 6, foliage: 0.75, particles: 0.75, fogDensity: 1, view: 0.85 },
  medium: { name: 'medium', scale: 0.85, maxDpr: 1.25, msaa: 0, ao: false, bloom: true,  bloomRes: 0.35, shadow: 1024, shadowRange: 34, flashShadow: false, lights: 4, foliage: 0.5,  particles: 0.5,  fogDensity: 1.1, view: 0.7 },
  low:    { name: 'low',    scale: 0.7,  maxDpr: 1,   msaa: 0, ao: false, bloom: false, bloomRes: 0.25, shadow: 0,    shadowRange: 0,  flashShadow: false, lights: 2, foliage: 0.25, particles: 0.25, fogDensity: 1.25, view: 0.5 },
};
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uVignette: { value: 0.55 }, uSat: { value: 1.08 }, uContrast: { value: 1.12 }, uShadowTint: { value: new THREE.Vector3(0.9, 1.0, 1.12) },
    uHighTint: { value: new THREE.Vector3(1.1, 1.02, 0.9) }, uGrain: { value: 0.035 }, uAberration: { value: 0.0015 }, uFlash: { value: 0 }, uDarkness: { value: 0 }, uFlashCol: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uDamage, uVignette, uSat, uContrast, uGrain, uAberration, uFlash, uDarkness; uniform vec3 uShadowTint, uHighTint, uFlashCol; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c,c);
      vec2 off = c * (uAberration * (0.6 + r2 * 3.0) + uDamage * 0.004);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat + uDamage * -0.35);
      col = mix(col * uShadowTint, col * uHighTint, smoothstep(0.02, 0.9, l));              // cool shadows, warm highlights
      col = (col - 0.18) * uContrast + 0.18; col = max(col, 0.0);
      float v = smoothstep(0.85, 0.15, r2 * 2.2 * (1.0 + uVignette)); col *= mix(1.0, v, uVignette);
      col = mix(col, col * vec3(1.0, 0.25, 0.22) + vec3(0.22, 0.0, 0.0) * uDamage, clamp(uDamage * (0.4 + r2 * 3.0), 0.0, 0.85));
      col += (hash(vUv * 1500.0 + uTime) - 0.5) * uGrain;
      col *= 1.0 - uDarkness; col = mix(col, uFlashCol * 2.0, uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas; this.q = PRESETS.ultra; this.qname = 'ultra'; this.ratioK = 1; this.auto = true; this.t = 0; this.ft = 1 / 60; this.fps = 60; this.govT = 0;
    const gl = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.25; gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.setClearColor(0x05070c, 1); gl.info.autoReset = false;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x0a1018, 0.016);
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 400); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.viewScene = new THREE.Scene(); this.viewCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10); this.viewScene.add(this.viewCamera);
    this.moon = new THREE.DirectionalLight(0x8fb0ff, 2.2); this.moon.castShadow = true; this.moon.position.set(-40, 70, 30); this.scene.add(this.moon); this.scene.add(this.moon.target);
    this.moonDir = new THREE.Vector3(-40, 70, 30).normalize();
    this.hemi = new THREE.HemisphereLight(0x4a5c88, 0x2a3224, 2.0); this.scene.add(this.hemi);
    this.grade = new ShaderPass(GradeShader); this.damage = 0; this.flash = 0; this.darkness = 0;
    this.build();
  }
  build() {
    const q = this.q, w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight), dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr), ratio = Math.max(0.4, dpr * q.scale * this.ratioK);
    const r = this.renderer; r.setPixelRatio(ratio); r.setSize(w, h, false); this.w = w; this.h = h; this.ratio = ratio;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewCamera.aspect = w / h; this.viewCamera.updateProjectionMatrix();
    // moonlight shadow
    this.moon.castShadow = q.shadow > 0; r.shadowMap.enabled = q.shadow > 0;
    if (q.shadow > 0) { if (!this.moon.shadow.map || this.moon.shadow.mapSize.x !== q.shadow) { this.moon.shadow.mapSize.set(q.shadow, q.shadow); if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; } } const s = q.shadowRange, c = this.moon.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 220; c.updateProjectionMatrix(); this.moon.shadow.bias = -0.0004; this.moon.shadow.normalBias = 0.04; this.moon.shadow.radius = 2.5; }
    // post stack
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (this.q.name === 'low') { this.composer = null; return; }
    const rt = new THREE.WebGLRenderTarget(Math.round(w * ratio), Math.round(h * ratio), { type: THREE.HalfFloatType, samples: q.msaa });
    const c = this.composer = new EffectComposer(r, rt); c.setPixelRatio(1); c.setSize(Math.round(w * ratio), Math.round(h * ratio));
    this.renderPass = new RenderPass(this.scene, this.camera); c.addPass(this.renderPass);
    if (q.ao) {
      const ao = this.gtao = new GTAOPass(this.scene, this.camera, Math.round(w * ratio), Math.round(h * ratio));
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 }); ao.blendIntensity = 0.95;
      ao._overrideVisibility = function () { const cache = this._visibilityCache; this.scene.traverse((o) => { if ((o.isPoints || o.isLine || o.userData.noAO) && o.visible) { o.visible = false; cache.push(o); } }); };
      c.addPass(ao);
    } else this.gtao = null;
    this.viewPass = new RenderPass(this.viewScene, this.viewCamera); this.viewPass.clear = false; this.viewPass.clearDepth = true; c.addPass(this.viewPass);
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.round(w * ratio * q.bloomRes), Math.round(h * ratio * q.bloomRes)), 0.55, 0.6, 0.9); c.addPass(this.bloom); } else this.bloom = null;
    c.addPass(this.grade); c.addPass(new OutputPass());
  }
  setQuality(name) { if (!PRESETS[name]) name = 'high'; this.qname = name; this.q = PRESETS[name]; this.build(); if (this.onQuality) this.onQuality(this.q); }
  resize() { this.build(); }
  // keep the shadow map centred on the player, snapped to shadow-map texels so the shadows do not shimmer when you move
  followMoon(x, z) {
    if (this.q.shadow <= 0) return; const s = this.q.shadowRange, texel = (2 * s) / this.q.shadow, sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.moon.target.position.set(sx, 0, sz); this.moon.position.set(sx + this.moonDir.x * 100, this.moonDir.y * 100, sz + this.moonDir.z * 100); this.moon.target.updateMatrixWorld(); this.moon.updateMatrixWorld();
  }
  render(dt, flashNow) {
    this.renderer.info.reset(); this.t += dt; const g = this.grade.uniforms; g.uTime.value = this.t % 100; g.uDamage.value = this.damage; g.uFlash.value = flashNow || 0; g.uDarkness.value = this.darkness;
    if (this.composer) this.composer.render(dt); else { this.renderer.autoClear = true; this.renderer.render(this.scene, this.camera); this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.viewScene, this.viewCamera); this.renderer.autoClear = true; }
    const info = this.renderer.info.render; this.calls = info.calls; this.tris = info.triangles;
    if (dt > 0) {                                                       // automatic quality: if the frame rate sags, render at a lower resolution; if it is smooth again, creep back up
      this.ft = this.ft * 0.95 + dt * 0.05; this.fps = 1 / this.ft; this.govT += dt;
      if (this.auto && this.govT > 2) { this.govT = 0; if (this.ft > 1 / 48 && this.ratioK > 0.6) { this.ratioK = Math.max(0.6, this.ratioK - 0.1); this.build(); } else if (this.ft < 1 / 57 && this.ratioK < 1) { this.ratioK = Math.min(1, this.ratioK + 0.05); this.build(); } }
    }
  }
}
