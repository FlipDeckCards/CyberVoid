// Lists every node of the Zombies map GLB with its world position and mesh (to find the camp props). Usage: node map-nodes.js <glb>
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');
(async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
    const doc = await io.read(process.argv[2]);
    for (const n of doc.getRoot().listNodes()) {
        const m = n.getMesh(); const w = n.getWorldTranslation(); const s = n.getWorldScale ? n.getWorldScale() : [1, 1, 1];
        let tris = 0; if (m) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
        console.log([n.getName() || '(unnamed)', m ? 'mesh:' + (m.getName() || '?') : '-', w.map(v => v.toFixed(1)).join(','), 's' + s.map(v => v.toFixed(2)).join(','), tris | 0, n.listChildren().length + 'ch'].join(' | '));
    }
})();
