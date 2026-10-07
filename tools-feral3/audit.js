// Audits every .glb in the asset folder (read-only): triangles, vertices, textures, animations, skins, bounding box.
// Run: node tools-feral3/audit.js "C:\IMAGES FOR 3D"   -> prints a table and writes tools-feral3/audit.json
const fs = require('fs'), path = require('path');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { getBounds } = require('@gltf-transform/functions');
const dir = process.argv[2] || 'C:\\IMAGES FOR 3D';
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.glb')).sort()) {
    const p = path.join(dir, f), doc = await io.read(p), root = doc.getRoot();
    let tris = 0, verts = 0, prims = 0;
    for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) { prims++; const idx = pr.getIndices(), pos = pr.getAttribute('POSITION'); verts += pos ? pos.getCount() : 0; tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0); }
    const tex = root.listTextures().map((t) => { const s = t.getSize(); return (s ? s.join('x') : '?') + ' ' + t.getMimeType().replace('image/', '') + ' ' + Math.round((t.getImage() || []).length / 1024) + 'KB'; });
    const b = getBounds(doc.getRoot().listScenes()[0]);
    rows.push({ file: f, sizeMB: +(fs.statSync(p).size / 1048576).toFixed(1), meshes: root.listMeshes().length, prims, tris, verts, materials: root.listMaterials().length, textures: tex, animations: root.listAnimations().length, skins: root.listSkins().length, nodes: root.listNodes().length,
      bboxMin: b.min.map((v) => +v.toFixed(3)), bboxMax: b.max.map((v) => +v.toFixed(3)), size: b.max.map((v, i) => +(v - b.min[i]).toFixed(3)), extensions: root.listExtensionsUsed().map((e) => e.extensionName) });
    const r = rows[rows.length - 1]; console.log(f.padEnd(24), String(r.sizeMB).padStart(6) + 'MB', String(Math.round(r.tris)).padStart(9) + ' tris', 'mesh', r.meshes, 'prim', r.prims, 'mat', r.materials, 'tex', r.textures.join(' | '), 'anim', r.animations, 'skin', r.skins, 'size', r.size.join('x'));
  }
  fs.writeFileSync(path.join(__dirname, 'audit.json'), JSON.stringify(rows, null, 1));
})();
