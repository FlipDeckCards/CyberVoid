// Inspects the Zombies map GLB (Draco-compressed): meshes, triangle counts, textures, bounds.  node tools-feral3/inspect-map.js <file>
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions'); const { getBounds } = require('@gltf-transform/functions'); const draco3d = require('draco3dgltf');
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const doc = await io.read(process.argv[2]), root = doc.getRoot();
  console.log('scene nodes', root.listNodes().length, 'meshes', root.listMeshes().length, 'materials', root.listMaterials().length, 'textures', root.listTextures().length);
  let total = 0; const rows = [];
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; let t = 0; for (const p of m.listPrimitives()) t += p.getIndices() ? p.getIndices().getCount() / 3 : 0; total += t; const b = getBounds(n); rows.push([n.getName(), Math.round(t), b.min.map((v) => Math.round(v)).join(','), b.max.map((v) => Math.round(v)).join(','), (n.getMesh().listPrimitives()[0].getMaterial() || {getName: () => ''}).getName()]); }
  rows.sort((a, b) => b[1] - a[1]); for (const r of rows.slice(0, 45)) console.log(r.join(' | ')); console.log('total tris', Math.round(total));
  const tx = root.listTextures().map((t) => { const s = t.getSize(); return s ? s.join('x') : '?'; }); console.log('textures', tx.join(' '));
})();
