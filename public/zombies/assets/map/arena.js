// assets/map/arena.js
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const scene = window.scene;

window.initArena = async function() {
  console.log("initArena called - loading mega village");

  loader.load(
    './assets/map/mega_village.glb',
    (gltf) => {
      const mesh = gltf.scene;
      
      // Center on ground, scale to arena size
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      // Place floor at y=0, scale so it spans the arena
      mesh.position.set(0, 0, 0);
      mesh.scale.setScalar(50);
      
      scene.add(mesh);
      console.log("mega village loaded", "box:", size.x, size.y, size.z);
    }
  );
};
window.initArena();
