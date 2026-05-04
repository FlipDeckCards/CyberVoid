import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const scene = window.scene;

loader.load('./assets/map/mega_village.glb', (gltf) => {
  const mesh = gltf.scene;
  mesh.scale.setScalar(10);
  mesh.position.set(0, -1, 0);
  scene.add(mesh);
  console.log("map loaded");
});
