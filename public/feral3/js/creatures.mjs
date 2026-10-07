// Feral 3.0 - the creatures. Your 3D models are static meshes (no rig), so they are animated in the vertex shader: legs swing, the body bobs and rolls, the tail whips, they lunge when
// they bite, flinch when they are shot, crouch before a leap, rear up before a stomp, and fall over and burn away when they die. All of one type share one instanced mesh per
// level of detail, so thirty monsters cost a handful of draw calls.
import * as THREE from 'three';
import { assets } from './assets.mjs';

const D = window.DZF, S = 1 / 8;
const CAP = 64;
const DEFORM = /* glsl */`
  attribute vec4 aAnim; attribute vec4 aState;
  uniform vec3 uBox; uniform float uTime;
  varying float vDeath; varying float vFlash; varying float vHeat; varying vec3 vObj; varying float vFall;
  mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  float fallAngle(){ return smoothstep(0.0, 0.2, aState.x) * 1.5; }
  vec3 creatureDeform(vec3 p){
    float H = uBox.y, Wd = uBox.x, L = uBox.z;
    float hy = clamp(p.y / H, 0.0, 1.3), fz = p.z / L, sx = p.x / (Wd * 0.5);
    float walk = aAnim.y, ph = aAnim.x, atk = aAnim.z, hurt = aAnim.w, seed = aState.w;
    float wind = clamp(-atk, 0.0, 1.0), lunge = max(atk, 0.0);
    // breathing
    p.y *= 1.0 + 0.012 * sin(uTime * 1.9 + seed);
    // walk cycle: legs swing in opposite phase (left against right), feet lift, the body bobs and rolls
    float legMask = 1.0 - smoothstep(0.06, 0.4, hy);
    float side = sx > 0.0 ? 1.0 : -1.0, lateral = smoothstep(0.05, 0.45, abs(sx));
    float legPh = ph + (side > 0.0 ? 3.14159 : 0.0);
    p.z += sin(legPh) * 0.15 * H * legMask * lateral * walk;
    p.y += max(0.0, cos(legPh)) * 0.09 * H * legMask * lateral * walk;
    p.y += abs(sin(ph)) * 0.03 * H * walk * smoothstep(0.15, 0.5, hy);
    p.xy = rot2(sin(ph) * 0.045 * walk) * p.xy;
    p.xz = rot2(sin(ph * 0.5) * 0.06 * walk) * p.xz;
    float tail = smoothstep(0.0, -0.5, fz);
    p.x += sin(ph * 0.5 - fz * 7.0 + seed) * 0.11 * Wd * tail * (0.35 + walk);
    p.y += sin(ph - fz * 5.0) * 0.015 * H * tail * walk;
    // crouch / rear back before a leap, a stomp, a breath
    p.y *= 1.0 - 0.2 * wind * smoothstep(0.15, 0.9, hy);
    p.z -= 0.10 * L * wind * smoothstep(-0.2, 0.5, fz);
    p.y += 0.0;
    // the bite / leap / stomp: the front of the body shoots forward and the head dips
    float a = sin(lunge * 3.14159);
    p.z += a * 0.24 * L * smoothstep(-0.35, 0.5, fz);
    p.y -= a * 0.13 * H * smoothstep(0.35, 0.95, hy) * smoothstep(-0.1, 0.4, fz);
    // a hit: it flinches backwards
    p.z -= hurt * 0.12 * L * smoothstep(-0.2, 0.5, fz); p.y *= 1.0 - hurt * 0.05; p.x += sin(uTime * 60.0 + seed) * 0.012 * H * hurt;
    // death: falls onto its side
    float fa = fallAngle();
    if (fa > 0.0) { p.xy = rot2(fa) * p.xy; p.y += sin(min(fa, 1.5)) * Wd * 0.42; p.y -= aState.x * 0.05 * H; }
    return p;
  }
`;
function patchMaterial(mat, box, depth) {
  const uniforms = { uBox: { value: new THREE.Vector3(box[0], box[1], box[2]) }, uTime: { value: 0 } }; mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBox = uniforms.uBox; shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = DEFORM + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n { float fa = fallAngle(); objectNormal.xy = rot2(fa) * objectNormal.xy; }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = transformed; transformed = creatureDeform(transformed); vDeath = aState.x; vFlash = aState.y; vHeat = aState.z; vFall = aAnim.w;');
    shader.fragmentShader = 'varying float vDeath; varying float vFlash; varying float vHeat; varying vec3 vObj; varying float vFall; uniform float uTime;\n' + shader.fragmentShader;
    const dissolve = `
      float dn = fract(sin(dot(floor(vObj * 52.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float dth = (vDeath - 0.5) / 0.5 * 1.15;
      if (vDeath > 0.5 && dn < dth) discard;`;
    if (depth) shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + dissolve);
    else {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + dissolve)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (vDeath > 0.5 && dn < dth + 0.1) totalEmissiveRadiance += vec3(4.0, 1.3, 0.25);
          totalEmissiveRadiance += vec3(1.0, 0.55, 0.35) * vFlash * 1.6;
          totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * vHeat * (0.6 + 0.4 * sin(uTime * 18.0)) * 1.4;`);
    }
  };
  mat.customProgramCacheKey = () => 'creature' + (depth ? 'D' : 'M');
}

export class Creatures {
  constructor(engine) {
    this.engine = engine; this.scene = engine.scene; this.types = {}; this.vis = new Map(); this.corpses = []; this.group = new THREE.Group(); this.group.userData.noAO = true; this.scene.add(this.group);
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3(); this.tmpS = new THREE.Vector3(); this.tmpE = new THREE.Euler();
  }
  add(id) {
    if (this.types[id] || !assets.models[id]) return; const model = assets.models[id], lods = [];
    const mat = model.material.clone(); mat.envMapIntensity = 1.1; patchMaterial(mat, model.size, false);
    const dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); patchMaterial(dmat, model.size, true);
    for (let l = 0; l < model.geoms.length; l++) {
      const geo = model.geoms[l]; if (!geo) continue;
      const g = geo.clone(); g.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aState', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(g, mat, CAP); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = dmat; im.userData.noAO = true; this.group.add(im); lods[l] = im;
    }
    this.types[id] = { id, model, lods, mat, dmat };
  }
  kill(e) {            // a creature was beaten: it stays as a corpse that falls over, lies there, then burns away
    if (e.boom) return; this.corpses.push({ type: e.type, x: e.x, y: e.y, yaw: this.lastYaw(e.id, e.heading), t: 0, id: e.id }); if (this.corpses.length > 30) this.corpses.shift();
  }
  lastYaw(id, fallback) { const v = this.vis.get(id); return v ? v.yaw : Math.PI / 2 - fallback; }
  pulse(id, kind) { const v = this.vis.get(id); if (v) { v.pulse = kind === 'wind' ? 0 : 0.5; v.pulseMax = 0.5; } }
  update(g, dt, t, cam) {
    for (const ty of Object.values(this.types)) { ty.mat.userData.uniforms.uTime.value = t; ty.dmat.userData.uniforms.uTime.value = t; for (const im of ty.lods) if (im) im.count = 0; }
    const seen = new Set(), P = g.player;
    const place = (type, x, z, yaw, scale, anim, state) => {
      let ty = this.types[type]; if (!ty) ty = this.types.small1 || Object.values(this.types)[0]; if (!ty) return;
      const d = Math.hypot(x - cam.x, z - cam.z), lodDist = D.ENEMIES[type] && D.ENEMIES[type].boss ? [45, 110] : D.ENEMIES[type] && D.ENEMIES[type].r > 7 ? [26, 70] : [16, 42];
      let l = d < lodDist[0] ? 0 : d < lodDist[1] ? 1 : 2; while (l > 0 && !ty.lods[l]) l--; const im = ty.lods[l]; if (!im || im.count >= CAP) return;
      const i = im.count++; this.tmpE.set(0, yaw, 0); this.tmpQ.setFromEuler(this.tmpE); this.tmpV.set(x, 0, z); this.tmpS.setScalar(scale); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); im.setMatrixAt(i, this.tmpM);
      const aa = im.geometry.attributes.aAnim, as = im.geometry.attributes.aState; aa.setXYZW(i, anim[0], anim[1], anim[2], anim[3]); as.setXYZW(i, state[0], state[1], state[2], state[3]);
    };
    for (const e of g.enemies) {
      if (e.dead) continue; seen.add(e.id); const x = e.x * S, z = e.y * S;
      let v = this.vis.get(e.id); if (!v) { v = { yaw: Math.PI / 2 - e.heading, px: e.x, py: e.y, mv: 0, ph: Math.random() * 6, pulse: 0, pulseMax: 0.5, seed: (e.id * 37 % 97) / 97 * 6.28 }; this.vis.set(e.id, v); }
      const dx = e.x - v.px, dy = e.y - v.py, sp = dt > 0 ? Math.hypot(dx, dy) / dt / 8 : 0; v.px = e.x; v.py = e.y; v.mv += (Math.min(sp / 1.6, 1) - v.mv) * Math.min(1, dt * 7); v.ph += dt * (1.5 + sp * 1.9);
      // face where it is going; when it is near, or shooting, it faces you
      const toP = Math.PI / 2 - e.heading, mvAng = sp > 0.4 ? Math.atan2(dx, dy) : toP; const close = Math.hypot(P.x - e.x, P.y - e.y) < 90 || e.state === 'wind' || e.state === 'slam' || e.state === 'breath' || e.def.ranged;
      const target = close ? toP : mvAng; let dyaw = target - v.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); v.yaw += dyaw * Math.min(1, dt * (e.def.heavy ? 4 : 9)); if (v.lockYaw !== undefined) v.yaw = v.lockYaw;
      let atk = 0;
      if (e.state === 'wind') { const tot = e.def.charge ? 0.75 : e.def.flank ? 0.4 : 0.28; atk = -Math.min(1, 1 - (e.st || 0) / tot); } else if (e.state === 'slam') { atk = -Math.min(1, 1 - (e.st || 0) / (e.def.boss ? 0.85 : 0.7)); } else if (e.state === 'breath') { atk = -Math.min(1, 1 - (e.st || 0)); } else if (e.state === 'dash') atk = e.def.charge ? 0.5 : 0.55;
      else if (e.atkT > 0.001) atk = 1 - e.atkT / 0.5; else if (v.pulse > 0) { v.pulse -= dt; atk = 1 - Math.max(0, v.pulse) / v.pulseMax; }
      const heat = e.state === 'breath' ? Math.min(1, 1 - (e.st || 0)) : e.enraged ? 0.6 : 0;
      place(e.type, x, z, v.yaw, 1, [v.ph, v.mv, atk, e.hitT > 0 ? e.hitT / 0.3 : 0], [0, e.flash > 0 ? e.flash / 0.09 : 0, heat, v.seed]);
    }
    for (const id of this.vis.keys()) if (!seen.has(id)) this.vis.delete(id);
    for (let i = this.corpses.length - 1; i >= 0; i--) { const c = this.corpses[i]; c.t += dt; if (c.t > 4.6) { this.corpses.splice(i, 1); continue; } place(c.type, c.x * S, c.y * S, c.yaw, 1, [0, 0, 0, 0], [Math.min(1, c.t / 4.5), 0, 0, (c.id % 97) / 97 * 6.28]); }
    for (const ty of Object.values(this.types)) for (const im of ty.lods) if (im) { im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aAnim.needsUpdate = true; im.geometry.attributes.aState.needsUpdate = true; }
  }
  reset() { this.vis.clear(); this.corpses.length = 0; }
}
