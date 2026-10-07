// Feral 3.0 - asset loading with progress: optimised .glb models (meshopt-compressed) and the PBR texture set. Everything comes from models/manifest.json and textures/.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const assets = { models: {}, tex: {}, manifest: null, ready: false, maxAniso: 8 };
const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();
const TEX_SETS = ['concrete', 'pavers', 'dirt', 'grass', 'asphalt', 'basalt', 'lava', 'wall', 'rock', 'steel', 'lab', 'wood', 'bark', 'metal', 'paint'];
const SINGLES = [['noise', 'noise.webp', 'linear'], ['water_n', 'water_n.webp', 'linear'], ['leaf_fern', 'leaf_fern.webp', 'srgb'], ['leaf_palm', 'leaf_palm.webp', 'srgb'], ['leaf_broad', 'leaf_broad.webp', 'srgb'], ['leaf_grass', 'leaf_grass.webp', 'srgb'], ['leaf_vine', 'leaf_vine.webp', 'srgb']];
const base = new URL('../', import.meta.url).href;       // .../feral3/

function loadTex(url, srgb, repeat) {
  return new Promise((res, rej) => texLoader.load(url, (t) => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = assets.maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; res(t); }, undefined, () => rej(new Error('Could not load ' + url))));
}
// which models are needed straight away, and which stream in while you are already playing
export const ESSENTIAL = ['pistol', 'small1', 'small2'];
export function prepareModel(id, g, entry) {
  const lods = []; let boundsSize = entry.size;
  g.scene.traverse((o) => { if (o.isMesh) { const m = /LOD(\d)/.exec(o.name) || /LOD(\d)/.exec(o.parent && o.parent.name || ''); const level = m ? +m[1] : 0; lods[level] = o; } });
  const conv = new Map(), toFloat = (at) => { let f = conv.get(at); if (!f) { f = new THREE.Float32BufferAttribute(at.count * 3, 3); for (let i = 0; i < at.count; i++) f.setXYZ(i, at.getX(i), at.getY(i), at.getZ(i)); conv.set(at, f); } return f; };
  for (const l of lods) if (l) { for (const n of ['position', 'normal']) { const at = l.geometry.attributes[n]; if (at && (at.normalized || at.isInterleavedBufferAttribute || !(at.array instanceof Float32Array))) l.geometry.setAttribute(n, toFloat(at)); } }          // (quantised data cannot hold metres: widen it before the scale is baked in)
  g.scene.updateMatrixWorld(true); const seen = new Set();            // the models are quantised: their node transforms hold the scale, so bake it into the vertices (LODs share vertex data: do each buffer once)
  for (const l of lods) { if (!l) continue; const pos = l.geometry.attributes.position; if (seen.has(pos)) continue; seen.add(pos); l.geometry.applyMatrix4(l.matrixWorld); }
  for (const l of lods) if (l) { l.position.set(0, 0, 0); l.quaternion.set(0, 0, 0, 1); l.scale.set(1, 1, 1); l.updateMatrix(); }
  g.scene.updateMatrixWorld(true);
  const mesh = lods[0] || (() => { let f = null; g.scene.traverse((o) => { if (o.isMesh && !f) f = o; }); return f; })();
  if (mesh && mesh.material) { const mat = mesh.material; mat.envMapIntensity = 1.0; if (mat.map) mat.map.anisotropy = assets.maxAniso; if (mat.normalMap) mat.normalMap.anisotropy = assets.maxAniso; if (mat.metalnessMap) mat.metalnessMap.anisotropy = assets.maxAniso; }
  return { id, scene: g.scene, material: mesh && mesh.material, geoms: lods.map((l) => l && l.geometry), meshes: lods, size: boundsSize, min: entry.min, max: entry.max };
}
export async function loadModel(id) {
  if (assets.models[id]) return assets.models[id];
  const entry = assets.manifest[id]; if (!entry) throw new Error('No model ' + id);
  const g = await gltf.loadAsync(base + 'models/' + entry.file);
  return (assets.models[id] = prepareModel(id, g, entry));
}
export async function loadAssets(renderer, progress, ids) {
  assets.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const res = await fetch(base + 'models/manifest.json', { cache: 'no-cache' }); if (!res.ok) throw new Error('models/manifest.json is missing'); assets.manifest = await res.json();
  const jobs = []; let done = 0, total = 0;
  const track = (p) => { total++; return p.then((v) => { done++; if (progress) progress(done / total); return v; }); };
  for (const n of TEX_SETS) {
    for (const [slot, srgb] of [['a', true], ['n', false], ['orm', false]]) jobs.push(track(loadTex(base + 'textures/' + n + '_' + slot + '.webp', srgb, true).then((t) => { (assets.tex[n] = assets.tex[n] || {})[slot] = t; })));
    if (n === 'basalt' || n === 'lava') jobs.push(track(loadTex(base + 'textures/' + n + '_e.webp', true, true).then((t) => { assets.tex[n].e = t; })));
  }
  for (const [n, f, cs] of SINGLES) jobs.push(track(loadTex(base + 'textures/' + f, cs === 'srgb', n.startsWith('leaf') ? false : true).then((t) => { assets.tex[n] = t; })));
  for (const id of ids || ESSENTIAL) jobs.push(track(loadModel(id)));
  await Promise.all(jobs);
  assets.ready = true; if (progress) progress(1);
}
