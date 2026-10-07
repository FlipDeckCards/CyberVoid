// Optimises the raw character / creature / weapon models for the web. NEVER writes to the asset folder; reads from it and writes optimised copies only.
//   stage 1 (slow):  node tools-feral3/optimize.js stage1 [name]   simplify + resize/convert textures  -> <work>/stage1/<id>.glb
//   stage 2 (fast):  node tools-feral3/optimize.js stage2 [name]   orient, scale, pivot, meshopt-compress -> public/feral3/models/<id>.glb
// The per-model settings (triangle budget, texture size, orientation, real-world size) live in MODELS below.
const fs = require('fs'), path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const F = require('@gltf-transform/functions');
const { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');
const SRC = process.env.FERAL3_ASSETS || 'C:\\IMAGES FOR 3D', WORK = process.env.FERAL3_WORK || 'C:\\Users\\livin\\feral3-work', OUT = path.join(__dirname, '..', 'public', 'feral3', 'models');
// tris: triangle budget; tex: texture size (px); rotY: degrees to turn the model so it faces +Z (forward); height: target height in metres (the model is scaled to this);
// pivot: 'feet' puts the origin at the middle of the bottom of the bounding box, 'grip' keeps the origin at the model centre (weapons)
const MODELS = {
  small1: { lods: [0.3, 0.07], src: 'Small 1', tris: 30000, tex: 1024, rotY: 0, height: 1.75 }, small2: { lods: [0.3, 0.07], src: 'Small 2', tris: 30000, tex: 1024, rotY: 0, height: 1.85 }, small3: { lods: [0.3, 0.07], src: 'Small 3', tris: 30000, tex: 1024, rotY: 0, height: 1.85 },
  medium1: { lods: [0.3, 0.07], src: 'Medium 1', tris: 40000, tex: 2048, rotY: 0, height: 2.5 }, medium2: { lods: [0.3, 0.07], src: 'Medium 2', tris: 40000, tex: 2048, rotY: 0, height: 2.7 }, medium3: { lods: [0.3, 0.07], src: 'Medium 3', tris: 40000, tex: 2048, rotY: 0, height: 2.6 },
  large1: { lods: [0.3, 0.07], src: 'Large 1', tris: 50000, tex: 2048, rotY: 0, height: 4.1 }, large2: { lods: [0.3, 0.07], src: 'Large 2', tris: 50000, tex: 2048, rotY: 0, height: 3.7 },
  boss: { lods: [0.3, 0.07], src: 'Final Boss', tris: 80000, tex: 2048, rotY: 0, height: 8.5 },
  male: { src: 'Male Character', tris: 40000, tex: 2048, rotY: 0, height: 1.8 }, female: { src: 'Female Character', tris: 40000, tex: 2048, rotY: 0, height: 1.7 },
  pistol: { src: 'Pistol', tris: 20000, tex: 2048, rotY: 0, length: 0.22, pivot: 'grip' }, shotgun: { src: 'Shotgun', tris: 25000, tex: 2048, rotY: 0, length: 0.95, pivot: 'grip' },
  rifle: { src: 'Rifle', tris: 25000, tex: 2048, rotY: 0, length: 0.95, pivot: 'grip' }, bolt: { src: 'Bolt Action Rifle', tris: 25000, tex: 2048, rotY: 0, length: 1.15, pivot: 'grip' },
  mg: { src: 'Machine Gun', tris: 25000, tex: 2048, rotY: 0, length: 1.0, pivot: 'grip' },
};
const mergeOrient = () => { try { const o = JSON.parse(fs.readFileSync(path.join(__dirname, 'orient.json'), 'utf8')); for (const [k, v] of Object.entries(o)) MODELS[k] = Object.assign({}, MODELS[k], v); } catch (e) { /* none */ } };
mergeOrient();

async function stage1(id) {
  const m = MODELS[id], io = new NodeIO().registerExtensions(ALL_EXTENSIONS), doc = await io.read(path.join(SRC, m.src + '.glb')), t0 = Date.now();
  const before = F.getSceneVertexCount ? 0 : 0; void before;
  let tris0 = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) tris0 += p.getIndices().getCount() / 3;
  await MeshoptSimplifier.ready;
  await doc.transform(F.weld(), F.simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, m.tris / tris0), error: 0.05, lockBorder: false }), F.prune(),
    F.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.tex, m.tex], quality: 88 }));
  let tris1 = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) tris1 += p.getIndices().getCount() / 3;
  fs.mkdirSync(path.join(WORK, 'stage1'), { recursive: true }); const out = path.join(WORK, 'stage1', id + '.glb'); await io.write(out, doc);
  console.log(id.padEnd(8), 'tris', Math.round(tris0), '->', Math.round(tris1), ' file', (fs.statSync(path.join(SRC, m.src + '.glb')).size / 1048576).toFixed(1) + 'MB ->', (fs.statSync(out).size / 1048576).toFixed(2) + 'MB', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  return { id, tris0, tris1 };
}
async function stage2(id) {
  mergeOrient(); const m = MODELS[id];
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(path.join(WORK, 'stage1', id + '.glb')), root = doc.getRoot(), scene = root.listScenes()[0];
  // bake orientation, scale and pivot into the vertices so the game never needs per-model fixes
  const b0 = F.getBounds(scene), size0 = b0.max.map((v, i) => v - b0.min[i]);
  const ry = (m.rotY || 0) * Math.PI / 180, c = Math.cos(ry), s = Math.sin(ry);
  const rot = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];              // column-major rotation about Y
  const w = (x, y, z) => [c * x + s * z, y, -s * x + c * z];
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) { const p = w(sx ? b0.max[0] : b0.min[0], sy ? b0.max[1] : b0.min[1], sz ? b0.max[2] : b0.min[2]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } }
  const sz1 = mx.map((v, i) => v - mn[i]), scale = m.height ? m.height / sz1[1] : m.length / Math.max(sz1[0], sz1[2]) * (m.pivot === 'grip' ? 1 : 1);
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, cy = m.pivot === 'grip' ? (mn[1] + mx[1]) / 2 : mn[1];
  const T = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, -cx * scale, -cy * scale, -cz * scale, 1];
  // M = T * R (rotate first, then scale/translate)
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
  const M = mul(T, rot);
  for (const me of root.listMeshes()) F.transformMesh(me, M);
  // level-of-detail copies for creatures: LOD0 = the full mesh, LOD1 / LOD2 = the same vertices with far fewer triangles (they share the textures and the vertex data)
  const lodTris = [];
  if (m.lods) {
    await MeshoptSimplifier.ready; const mesh0 = root.listMeshes()[0], prim0 = mesh0.listPrimitives()[0], node0 = root.listNodes()[0]; node0.setName('LOD0');
    for (const [i, ratio] of m.lods.entries()) { const prim = prim0.clone(); F.simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.2, lockBorder: false }); const me = doc.createMesh('LOD' + (i + 1)).addPrimitive(prim); const nd = doc.createNode('LOD' + (i + 1)).setMesh(me); scene.addChild(nd); }
  }
  for (const n of root.listNodes()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }
  for (const n of root.listNodes()) { const me = n.getMesh(); if (me) { let t = 0; for (const p of me.listPrimitives()) t += p.getIndices().getCount() / 3; lodTris.push(Math.round(t)); } }
  await doc.transform(F.dedup(), F.prune(), F.reorder({ encoder: MeshoptEncoder, level: 'medium' }), F.quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), F.meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  fs.mkdirSync(OUT, { recursive: true }); const out = path.join(OUT, id + '.glb'); await io.write(out, doc);
  const b1 = F.getBounds(doc.getRoot().listScenes()[0]);
  let tris = 0; for (const me of root.listMeshes()) for (const p of me.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(id.padEnd(8), 'tris', Math.round(tris), 'file', (fs.statSync(out).size / 1048576).toFixed(2) + 'MB', 'size', b1.max.map((v, i) => (v - b1.min[i]).toFixed(2)).join(' x '), 'rotY', m.rotY || 0);
  return { id, tris: lodTris[0] || Math.round(tris), lods: lodTris, bytes: fs.statSync(out).size, size: b1.max.map((v, i) => +(v - b1.min[i]).toFixed(3)), min: b1.min.map((v) => +v.toFixed(3)), max: b1.max.map((v) => +v.toFixed(3)), file: id + '.glb' };
}
(async () => {
  const [stage, only] = [process.argv[2], process.argv[3]], ids = Object.keys(MODELS).filter((k) => !only || only.split(',').includes(k)), res = [];
  for (const id of ids) res.push(await (stage === 'stage1' ? stage1(id) : stage2(id)));
  if (stage === 'stage2') { fs.writeFileSync(path.join(__dirname, 'optimized.json'), JSON.stringify(res, null, 1)); const man = {}; for (const r of res) man[r.id] = { file: r.file, size: r.size, min: r.min, max: r.max, lods: r.lods, bytes: r.bytes }; let old = {}; try { old = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); } catch (e) { /* first run */ } fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(Object.assign(old, man), null, 1)); }
})();
