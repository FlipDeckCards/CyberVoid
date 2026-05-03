// assets/map/arena.js
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const cache = {};

console.log("scene from window:", window.scene);
const scene = window.scene;

const PIECES = './assets/map/pieces/';

const fenceMap = {
  intact:     PIECES + 'chain_link.glb',
  broken:     PIECES + 'broken_chain_link.glb',
  collapsed:  PIECES + 'collapsed_fence.glb',
  gate:       PIECES + 'damaged_fence_gate.glb',
  gateIntact: PIECES + 'prison_fence_gate.glb',
};

const blockMap = {
  block_a: PIECES + 'city_block_one.glb',
  block_b: PIECES + 'map_piece_two.glb',
  block_c: PIECES + 'map_piece_three.glb',
  block_d: PIECES + 'map_piece_four.glb',
};

function loadGLB(key, url) {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => {
      cache[key] = gltf.scene;
      console.log("loaded:", key, url);
      resolve();
    });
  });
}

function place(key, x, z, rotY = 0) {
  const base = cache[key];
  if (!base) return;
  const mesh = base.clone();
  mesh.scale.setScalar(50);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
}

const ARENA_HALF = 40;
const FENCE_LENGTH = 16;
const FENCE_OFFSET = ARENA_HALF;

window.initArena = async function() {
  console.log("initArena called");

  await Promise.all([
    loadGLB('intact',      fenceMap.intact),
    loadGLB('broken',      fenceMap.broken),
    loadGLB('collapsed',   fenceMap.collapsed),
    loadGLB('gate',        fenceMap.gate),
    loadGLB('gateIntact',  fenceMap.gateIntact),
    loadGLB('block_a',     blockMap.block_a),
    loadGLB('block_b',     blockMap.block_b),
    loadGLB('block_c',     blockMap.block_c),
    loadGLB('block_d',     blockMap.block_d),
  ]);

  const north = ['intact','intact','broken','intact','collapsed'];
  north.forEach((type, i) => {
    const x = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, x, -FENCE_OFFSET, 0);
  });

  const south = ['collapsed','intact','gate','intact','broken'];
  south.forEach((type, i) => {
    const x = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, x, FENCE_OFFSET, Math.PI);
  });

  const east = ['intact','broken','gateIntact','collapsed','intact'];
  east.forEach((type, i) => {
    const z = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, FENCE_OFFSET, z, Math.PI / 2);
  });

  const west = ['gateIntact','intact','intact','broken','intact'];
  west.forEach((type, i) => {
    const z = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, -FENCE_OFFSET, z, -Math.PI / 2);
  });

  const blocks = [
    { key: 'block_a', x: -30, z: -30 },
    { key: 'block_b', x:  30, z: -30 },
    { key: 'block_c', x: -30, z:  30 },
    { key: 'block_d', x:  30, z:  30 },
  ];
  blocks.forEach(({ key, x, z }) => place(key, x, z));
};
window.initArena();
