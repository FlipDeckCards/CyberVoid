// assets/map/arena.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene } from './scene.js';

const loader = new GLTFLoader();
const cache = {};

// ─── File Paths ─────────────────────────────────────────────────────
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

// ─── Loader ─────────────────────────────────────────────────────────
function loadGLB(key, url) {
  return new Promise((resolve) => {
    loader.load(url, (gltf) => {
      cache[key] = gltf.scene;
      resolve();
    });
  });
}

// ─── Placement Helper ────────────────────────────────────────────────
function place(key, x, z, rotY = 0) {
  const base = cache[key];
  if (!base) return;
  const mesh = base.clone();
  mesh.position.set(x, 0, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
}

// ─── Perimeter Fence Config ─────────────────────────────────────────
// 80×80 arena: 5 fence sections per side, ~16 units each
const FENCE_PER_SIDE = 5;
const ARENA_HALF = 40;
const FENCE_LENGTH = 16;
const FENCE_OFFSET = ARENA_HALF + FENCE_LENGTH / 2;

// ─── Build Border ────────────────────────────────────────────────────
function buildBorder(side, pattern, getCoords, rotY) {
  pattern.forEach((type, i) => {
    const pos = getCoords(i);
    place(type, pos.x, pos.z, rotY);
  });
}

// ─── Init ────────────────────────────────────────────────────────────
export async function initArena() {
  // Load all assets
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

  // ── North Border (z = -40) ──
  const north = ['intact','intact','broken','intact','collapsed'];
  north.forEach((type, i) => {
    const x = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, x, 0, -FENCE_OFFSET, 0);
  });

  // ── South Border (z = +40) ──
  const south = ['collapsed','intact','gate','intact','broken'];
  south.forEach((type, i) => {
    const x = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, x, 0, FENCE_OFFSET, Math.PI);
  });

  // ── East Border (x = +40) ──
  const east = ['intact','broken','gateIntact','collapsed','intact'];
  east.forEach((type, i) => {
    const z = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, FENCE_OFFSET, 0, z, Math.PI / 2);
  });

  // ── West Border (x = -40) ──
  const west = ['gateIntact','intact','intact','broken','intact'];
  west.forEach((type, i) => {
    const z = -FENCE_OFFSET + i * FENCE_LENGTH + FENCE_LENGTH / 2;
    place(type, -FENCE_OFFSET, 0, z, -Math.PI / 2);
  });

  // ── City Blocks (2×2 grid) ──
  const blocks = [
    { key: 'block_a', x: -20, z: -20 },
    { key: 'block_b', x:  20, z: -20 },
    { key: 'block_c', x: -20, z:  20 },
    { key: 'block_d', x:  20, z:  20 },
  ];
  blocks.forEach(({ key, x, z }) => place(key, x, 0, z));
}
