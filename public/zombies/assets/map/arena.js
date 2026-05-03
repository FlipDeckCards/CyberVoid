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
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      
      // Scale so village fits in 80x80 arena
      const scale = 40 / Math.max(size.x, size.z);
      mesh.position.set(0, 0, 0);
      mesh.scale.setScalar(scale);
      
      scene.add(mesh);
      console.log("mega village loaded", "scale:", scale.toFixed(3));
    }
  );
};
window.initArena();
