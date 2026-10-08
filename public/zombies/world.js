// Zombies arena visuals: a walled military yard built from the props in layout.js. Everything is procedural (small canvas
// textures, shared materials, merged geometry per material), so it adds almost nothing to the download and only a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS, GATES, HALF, WALL_T } from './layout.js';

function canvasTex(size, draw, repeatX, repeatY, srgb = true) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function noise(g, s, n, light, dark, a) {
    for (let i = 0; i < n; i++) { const v = rnd(); g.fillStyle = v < .5 ? dark : light; g.globalAlpha = a * rnd(); g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3); }
    g.globalAlpha = 1;
}

function makeMaterials() {
    const asphalt = canvasTex(512, (g, s) => {
        g.fillStyle = '#2b2c2e'; g.fillRect(0, 0, s, s); noise(g, s, 9000, '#4a4b4d', '#151618', .5);
        g.strokeStyle = 'rgba(10,10,10,.6)'; g.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) { g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .5) * 70; y += (rnd() - .5) * 70; g.lineTo(x, y); } g.stroke(); }
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(70,52,30,.18)'; g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 30 + rnd() * 50, 20 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); }
    }, 12, 12);
    const dirt = canvasTex(256, (g, s) => { g.fillStyle = '#3a3226'; g.fillRect(0, 0, s, s); noise(g, s, 6000, '#5a4d3a', '#1e1a12', .6); }, 60, 60);
    const concrete = canvasTex(256, (g, s) => {
        g.fillStyle = '#8a8a86'; g.fillRect(0, 0, s, s); noise(g, s, 7000, '#a5a5a0', '#60605c', .5);
        g.fillStyle = 'rgba(40,40,36,.25)'; for (let i = 0; i < 6; i++) g.fillRect(rnd() * s, 0, 2 + rnd() * 3, s * (.3 + rnd() * .7));
    }, 1, 1);
    const hesco = canvasTex(256, (g, s) => {   // wire-mesh gabion filled with earth
        g.fillStyle = '#6b5f48'; g.fillRect(0, 0, s, s); noise(g, s, 6000, '#8b7d60', '#3a3224', .6);
        g.strokeStyle = 'rgba(30,30,28,.9)'; g.lineWidth = 3;
        for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * s / 8, 0); g.lineTo(i * s / 8, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke(); }
    }, 1, 1);
    const sandbag = canvasTex(256, (g, s) => {
        g.fillStyle = '#7a6c4c'; g.fillRect(0, 0, s, s);
        for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
            const x = c * s / 4 + (r % 2 ? s / 8 : 0) - s / 8, y = r * s / 6;
            g.fillStyle = `hsl(40,${25 + rnd() * 10}%,${38 + rnd() * 10}%)`; g.strokeStyle = '#3a3220'; g.lineWidth = 3;
            g.beginPath(); g.roundRect(x + 3, y + 3, s / 4 - 6, s / 6 - 6, 12); g.fill(); g.stroke();
        }
    }, 1, 1);
    const wood = canvasTex(256, (g, s) => {
        g.fillStyle = '#6b4a28'; g.fillRect(0, 0, s, s); noise(g, s, 4000, '#8a6236', '#3c2810', .6);
        g.strokeStyle = '#2a1a0a'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12);
        g.beginPath(); g.moveTo(6, 6); g.lineTo(s - 6, s - 6); g.moveTo(s - 6, 6); g.lineTo(6, s - 6); g.stroke();
    }, 1, 1);
    const containerTex = (hex) => canvasTex(256, (g, s) => {
        g.fillStyle = hex; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.08)'; g.fillRect(i * s / 16, 0, s / 32, s); }
        noise(g, s, 4000, '#9a5a30', '#1a1008', .45);
    }, 1, 1);
    const rust = canvasTex(256, (g, s) => { g.fillStyle = '#4a4036'; g.fillRect(0, 0, s, s); noise(g, s, 7000, '#8a4a22', '#1e1610', .6); }, 1, 1);
    const doorTex = canvasTex(256, (g, s) => {   // riveted steel slats with a hazard-stripe band
        g.fillStyle = '#4b535c'; g.fillRect(0, 0, s, s); noise(g, s, 5000, '#6a737d', '#262b30', .5);
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, i * s / 8, s, 3); g.fillStyle = '#8b949e'; for (const x of [10, s - 10]) { g.beginPath(); g.arc(x, i * s / 8 + 12, 3, 0, 7); g.fill(); } }
        g.fillStyle = '#d6a21c'; g.fillRect(0, s - 40, s, 32); g.fillStyle = '#16181a';
        for (let x = -40; x < s + 40; x += 32) { g.beginPath(); g.moveTo(x, s - 8); g.lineTo(x + 16, s - 8); g.lineTo(x + 40, s - 40); g.lineTo(x + 24, s - 40); g.fill(); }
    }, 1, 1);
    const std = (map, rough, metal, color) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal || 0, color: color || 0xffffff });
    return {
        asphalt: std(asphalt, .95), dirt: std(dirt, 1), concrete: std(concrete, .9), hesco: std(hesco, 1), sandbag: std(sandbag, 1), wood: std(wood, .85),
        rust: std(rust, .7, .5),
        container: [containerTex('#5d6b3c'), containerTex('#7a3a2c'), containerTex('#2f4a63'), containerTex('#8a7436')].map(t => std(t, .6, .35)),
        car: std(canvasTex(128, (g, s) => { g.fillStyle = '#2a2420'; g.fillRect(0, 0, s, s); noise(g, s, 3000, '#6a3a1a', '#0c0806', .7); }), .6, .6),
        dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: .8, metalness: .3 }),
        lampOn: new THREE.MeshBasicMaterial({ color: 0xfff1cc }),
        gateRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
        // the spawn doors are solid steel gates (lit, with a faint red glow) so they read as doors, not as holes
        gateDoor: new THREE.MeshStandardMaterial({ map: doorTex, color: 0xffffff, roughness: .55, metalness: .45, emissive: 0x3a0a08, emissiveIntensity: 1 })
    };
}

// Box with UVs scaled to real size so textures do not stretch (tex tile = 'tile' metres)
function boxGeo(w, h, d, tile) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    return g;
}

export function buildArena(scene, renderer) {
    const M = makeMaterials();
    const solids = [];            // meshes that stop bullets
    const fires = [];             // flickering lights
    const batches = new Map();    // material -> [geometry]
    const add = (mat, geo, x, y, z, ry) => {
        geo = geo.clone(); if (ry) geo.rotateY(ry); geo.translate(x, y, z);
        if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(geo);
    };

    // ground: asphalt yard inside the walls, dirt runs out to the horizon
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), M.asphalt);
    yard.rotation.x = -Math.PI / 2; yard.receiveShadow = true; scene.add(yard); solids.push(yard);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), M.dirt);
    out.rotation.x = -Math.PI / 2; out.position.y = -0.05; scene.add(out);

    // perimeter wall (HESCO style) with a concrete cap
    const L = HALF * 2 + WALL_T, hh = 4;
    for (const s of [-1, 1]) {
        add(M.hesco, boxGeo(L, hh, WALL_T, 2), 0, hh / 2, s * HALF); add(M.hesco, boxGeo(WALL_T, hh, L, 2), s * HALF, hh / 2, 0);
        add(M.concrete, boxGeo(L, .3, WALL_T + .3, 2), 0, hh + .15, s * HALF); add(M.concrete, boxGeo(WALL_T + .3, .3, L, 2), s * HALF, hh + .15, 0);
    }

    for (const p of PROPS) {
        const h = p.h;
        switch (p.kind) {
            case 'bunker': add(M.concrete, boxGeo(p.w, h, p.d, 2), p.x, h / 2, p.z); add(M.dark, boxGeo(p.w + .2, .25, p.d + .2, 2), p.x, h + .12, p.z); break;
            case 'crate': add(M.wood, boxGeo(p.w, h, p.d, p.w), p.x, h / 2, p.z); break;
            case 'container': add(M.container[p.col % 4], boxGeo(p.w, h, p.d, 2.6), p.x, h / 2 + .1, p.z); add(M.dark, boxGeo(p.w, .2, p.d, 2), p.x, .1, p.z); break;
            case 'barrier': add(M.concrete, boxGeo(p.w, h, p.d, 2), p.x, h / 2, p.z); break;
            case 'sandbag': add(M.sandbag, boxGeo(p.w, h, p.d, 1.2), p.x, h / 2, p.z); break;
            case 'car':
                add(M.car, boxGeo(p.w, .9, p.d, 2), p.x, .75, p.z);
                if (p.w > p.d) add(M.car, boxGeo(p.w * .5, .6, p.d * .85, 2), p.x - p.w * .08, 1.5, p.z); else add(M.car, boxGeo(p.w * .85, .6, p.d * .5, 2), p.x, 1.5, p.z - p.d * .08);
                for (const sx of [-.32, .32]) for (const sz of [-.5, .5]) {
                    const along = p.w > p.d; const wx = along ? p.x + sx * p.w * 1.45 : p.x + sz * p.w * 1.9, wz = along ? p.z + sz * p.d * .95 : p.z + sx * p.d * 1.45;
                    add(M.dark, new THREE.CylinderGeometry(.38, .38, .3, 10).rotateZ(Math.PI / 2), wx, .38, wz, along ? 0 : Math.PI / 2);
                }
                break;
            case 'barrel': add(M.rust, new THREE.CylinderGeometry(p.r, p.r, h, 12), p.x, h / 2, p.z); add(M.dark, new THREE.CylinderGeometry(p.r + .03, p.r + .03, .1, 12), p.x, h * .7, p.z); break;
            case 'pole': {
                add(M.dark, new THREE.CylinderGeometry(.18, .3, h, 8), p.x, h / 2, p.z);
                add(M.dark, boxGeo(2.2, .3, 1.2, 1), p.x, h + .1, p.z); add(M.lampOn, boxGeo(1.9, .1, .9, 1), p.x, h - .1, p.z);
                break;
            }
            case 'tower': {
                const hw = p.w / 2 - .2;
                for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(M.wood, boxGeo(.35, h, .35, 1), p.x + sx * hw, h / 2, p.z + sz * hw);
                add(M.wood, boxGeo(p.w, .3, p.d, 1), p.x, h, p.z); add(M.wood, boxGeo(p.w + .6, .3, p.d + .6, 1), p.x, h + 2.2, p.z);
                for (const sx of [-1, 1]) { add(M.wood, boxGeo(.2, 2.2, p.d, 1), p.x + sx * hw, h + 1.1, p.z); add(M.wood, boxGeo(p.w, 2.2, .2, 1), p.x, h + 1.1, p.z + sx * hw); }
                break;
            }
        }
        if (p.fire) {   // burning barrel: flame cone + flickering light
            const flame = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: .85 }));
            flame.position.set(p.x, h + .5, p.z); scene.add(flame);
            const light = new THREE.PointLight(0xff7a2a, 40, 14, 2); light.position.set(p.x, h + 1.2, p.z); scene.add(light);
            fires.push({ light, flame, t: Math.random() * 10 });
        }
    }

    // enemy gates: dark frame + red lamp on the wall
    for (const [gx, gz] of GATES) {
        const onX = Math.abs(gx) > Math.abs(gz); const sx = Math.sign(gx), sz = Math.sign(gz);
        const px = onX ? sx * (HALF - WALL_T / 2 - .05) : gx, pz = onX ? gz : sz * (HALF - WALL_T / 2 - .05);
        add(M.gateDoor, boxGeo(onX ? .2 : 5, 3.2, onX ? 5 : .2, 2), px, 1.6, pz);
        add(M.dark, boxGeo(onX ? .3 : 5.4, .3, onX ? 5.4 : .3, 2), px, 3.3, pz);   // lintel
        for (const e of [-2.6, 2.6]) add(M.dark, boxGeo(onX ? .3 : .3, 3.3, onX ? .3 : .3, 1), onX ? px : px + e, 1.65, onX ? pz + e : pz);   // posts
        add(M.gateRed, boxGeo(onX ? .3 : .6, .4, onX ? .6 : .3, 1), px - (onX ? sx * .1 : 0), 3.5, pz - (onX ? 0 : sz * .1));
    }

    // merge everything per material -> a few draw calls
    for (const [mat, geos] of batches) {
        const merged = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
        const mesh = new THREE.Mesh(merged, mat);
        const lit = mat === M.lampOn || mat === M.gateRed || mat === M.gateDoor;
        mesh.castShadow = !lit; mesh.receiveShadow = !lit; scene.add(mesh); if (!lit) solids.push(mesh);
        geos.forEach(g => g.dispose());
    }

    // floodlights: real spot lights on the four poles
    const lamps = [];
    for (const [x, z] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) {
        const sl = new THREE.SpotLight(0xffe2b0, 900, 70, Math.PI / 3.2, .6, 2);
        sl.position.set(x, 11.8, z); sl.target.position.set(x * -.3, 0, z * -.3); scene.add(sl, sl.target); lamps.push(sl);
    }

    // low hills on the horizon so the yard is not floating in a void (kept very simple; fog does the rest)
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x151a14, roughness: 1, flatShading: true });
    const hills = [];
    for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2, r = 190 + rnd() * 60, hgt = 14 + rnd() * 26;
        const g = new THREE.ConeGeometry(30 + rnd() * 40, hgt, 7); g.translate(Math.cos(a) * r, hgt / 2 - 2, Math.sin(a) * r); hills.push(g);
    }
    const hillMesh = new THREE.Mesh(mergeGeometries(hills), hillMat); scene.add(hillMesh); hills.forEach(g => g.dispose());

    return {
        solids,
        update(dt, time) {
            for (const f of fires) {
                f.t += dt * 9; const fl = 1 + Math.sin(f.t) * .12 + Math.sin(f.t * 2.7) * .1 + (Math.random() - .5) * .1;
                f.light.intensity = 38 * fl; f.flame.scale.set(1 + (fl - 1) * .8, fl, 1 + (fl - 1) * .8); f.flame.rotation.y += dt * 2;
            }
        },
        dispose() { /* the arena lives for the whole page visit */ }
    };
}
