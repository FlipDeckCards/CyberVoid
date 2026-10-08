// Simplifies the Zombies character models (about 100k triangles each) to a few thousand and re-compresses them with Draco.
// Usage: node optimize-zombies.js <ratio> [names...]   (run inside tools-feral3; originals stay in git)
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, draco, textureCompress, prune, dedup } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const draco3d = require('draco3dgltf');
const sharp = require('sharp');
const fs = require('fs'), path = require('path');
(async () => {
    const ratio = parseFloat(process.argv[2] || '0.12');
    const names = process.argv.length > 3 ? process.argv.slice(3) : ['shambler', 'runner', 'brute', 'tank', 'boss'];
    await MeshoptSimplifier.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()
    });
    for (const n of names) {
        const file = path.join(__dirname, '..', 'public', 'zombies', 'Zombies', n + '.glb');
        const before = fs.statSync(file).size;
        const doc = await io.read(file);
        const tris = () => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return t | 0; };
        const t0 = tris();
        const texs = doc.getRoot().listTextures().map(t => t.getSize() && t.getSize().join('x'));
        await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.03, lockBorder: false }), prune(),
            textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }), draco());
        await io.write(file, doc);
        console.log(n, 'tris', t0, '->', tris(), 'size', (before / 1e6).toFixed(2), '->', (fs.statSync(file).size / 1e6).toFixed(2), 'MB; textures', texs.join(' '));
    }
})();
