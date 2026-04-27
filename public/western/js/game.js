import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

(function () {
  "use strict";

  // ============================================================
  //  WESTERN SHOWDOWN — Three.js Engine + Post-Processing
  // ============================================================

  // === CANVAS & RENDERER ===
  var canvas = document.getElementById("gameCanvas");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.2; // CHANGED from 1.5

  // 2D overlay for weapon, crosshair, weapon bar, damage flash
  var overlay = document.createElement("canvas");
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;";
  document.body.appendChild(overlay);
  var ctx = overlay.getContext("2d");

  var W, H;

  // === THREE.JS SCENE ===
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1a3e); // CHANGED from 0x1a0a2e
  scene.fog = new THREE.FogExp2(0x2a1a3e, 0.008); // CHANGED from 0x1a0a2e, 0.018

  var camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 200
  );

  // === POST-PROCESSING ===
  var composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  var bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3, 0.4, 0.82 // CHANGED strength from 0.45 to 0.3
  );
  composer.addPass(bloomPass);

  var vignettePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      darkness: { value: 0.5 } // CHANGED from 1.3
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float darkness;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  vec2 uv = (vUv - 0.5) * 2.0;',
      '  float vig = 1.0 - dot(uv, uv) * darkness * 0.25;',
      '  vig = clamp(pow(vig, 1.5), 0.0, 1.0);',
      '  c.rgb *= vig;',
      '  c.r *= 1.08; c.g *= 0.95; c.b *= 0.82;',
      '  c.rgb = (c.rgb - 0.5) * 1.12 + 0.5;',
      '  gl_FragColor = c;',
      '}'
    ].join('\n')
  });
  composer.addPass(vignettePass);

  // === GAME STATE ===
  var state = "menu";
  var score = 0;
  var wave = 1;
  var health = 100;
  var spawnInvincible = 0; // ADDED — frames of spawn invincibility

  // === MAP ===
  var map = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
    [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
    [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
    [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
    [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,6,6,0,0,0,0,0,0,0,2,2,2,0,1],
    [1,0,6,6,0,0,0,0,0,0,0,2,2,2,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
  ];
  var mapW = 16, mapH = 16;
  var CELL = 4;

  // === WORLD SPRITE DATA ===
  var worldSpriteData = [
    {x:5.5,y:5.5,type:"barrel"},{x:10.5,y:5.5,type:"barrel"},
    {x:7.5,y:10.5,type:"barrel"},{x:8.0,y:6.5,type:"barrel"},
    {x:5.5,y:1.5,type:"barrel"},{x:9.5,y:11.5,type:"barrel"},
    {x:1.5,y:1.5,type:"cactus"},{x:14.5,y:1.5,type:"cactus"},
    {x:1.5,y:14.5,type:"cactus"},{x:14.5,y:14.5,type:"cactus"},
    {x:8.5,y:1.5,type:"cactus"},{x:7.5,y:14.5,type:"cactus"},
    {x:5.5,y:2.5,type:"hitch"},{x:9.5,y:4.5,type:"trough"},
    {x:11.5,y:10.5,type:"crate"},{x:12.0,y:10.8,type:"crate"},
    {x:4.5,y:11.5,type:"wheel"}
  ];

  // === PLAYER ===
  var px = 7.5, py = 5.5, pa = 0;
  var pitchAngle = 0;
  var moveSpd = 0.05, rotSpd = 0.03;

  // === INPUT ===
  var keys = {};
  var touchJoy = null;
  var touchLook = null;
  var shooting = false;
  var fireTimer = 0;

  // === WEAPONS ===
  var WEAPONS = {
    revolver: { name:"Revolver", damage:25, fireRate:15, spread:0.02, ammo:Infinity, maxAmmo:Infinity, aoe:false, kickback:4, color:"#8B6914" },
    shotgun:  { name:"Shotgun",  damage:40, fireRate:30, spread:0.06, ammo:12, maxAmmo:12, aoe:false, kickback:10, color:"#5C4033" },
    rifle:    { name:"Rifle",    damage:70, fireRate:40, spread:0.01, ammo:8,  maxAmmo:8,  aoe:false, kickback:7,  color:"#3B2716" },
    dynamite: { name:"Dynamite", damage:50, fireRate:60, spread:0,    ammo:3,  maxAmmo:3,  aoe:true, aoeRadius:3, kickback:2, color:"#CC0000" }
  };
  var weaponKeys = ["revolver","shotgun","rifle","dynamite"];
  var currentWeapon = 0;
  var weaponAmmo = [Infinity, 12, 8, 3];
  var weaponKick = 0;

  // === ENEMY TYPES ===
  var ENEMY_TYPES = {
    bandit:    { name:"Bandit",          hp:30,  speed:0.018, damage:5,  score:100, color:0x8B4513, hatColor:0x654321, width:0.4,  height:0.6 },
    gunslinger:{ name:"Gunslinger",      hp:60,  speed:0.014, damage:10, score:200, color:0x2F1B14, hatColor:0x1A1A1A, width:0.5,  height:0.7 },
    outlaw:    { name:"Outlaw Boss",     hp:120, speed:0.008, damage:20, score:500, color:0x660000, hatColor:0x330000, width:0.7,  height:0.9 },
    dynamite:  { name:"Dynamite Runner", hp:20,  speed:0.03,  damage:40, score:300, color:0xCC5500, hatColor:0xFF6600, width:0.35, height:0.5 }
  };

  var enemies = [];
  var enemiesPerWave = 4;
  var dmgFlash = 0;
  var torches = [];

  // ============================================================
  //  BUILD THREE.JS WORLD
  // ============================================================

  function makeBrickNormal(tileW, tileH) {
    var c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    var g = c.getContext("2d");
    g.fillStyle = "rgb(128,128,255)";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgb(128,128,200)";
    var bH = tileH || 32, bW = tileW || 64, m = 3;
    for (var row = 0; row < 256 / bH; row++) {
      var yy = row * bH;
      g.fillRect(0, yy, 256, m);
      var off = row % 2 === 0 ? 0 : bW / 2;
      for (var col = -1; col < 256 / bW + 1; col++) {
        g.fillRect(col * bW + off, yy, m, bH);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  var wallDefs = {
    1: { color:0x8B6914, rough:0.95, metal:0.0,  brick:[64,32] },
    2: { color:0x5C3317, rough:0.8,  metal:0.0,  brick:[48,24] },
    3: { color:0x808080, rough:0.85, metal:0.05, brick:[40,40] },
    4: { color:0xD2B48C, rough:0.9,  metal:0.0,  brick:[60,30] },
    5: { color:0xA0522D, rough:0.75, metal:0.1,  brick:[50,28] },
    6: { color:0x2F2F2F, rough:0.4,  metal:0.5,  brick:[32,32] }
  };

  var wallMaterials = {};
  for (var wk in wallDefs) {
    var wd = wallDefs[wk];
    wallMaterials[wk] = new THREE.MeshStandardMaterial({
      color: wd.color, roughness: wd.rough, metalness: wd.metal,
      normalMap: makeBrickNormal(wd.brick[0], wd.brick[1]),
      normalScale: new THREE.Vector2(0.8, 0.8)
    });
  }

  // --- Build walls ---
  var wallGeo = new THREE.BoxGeometry(CELL, CELL, CELL);
  for (var wy = 0; wy < mapH; wy++) {
    for (var wx = 0; wx < mapW; wx++) {
      if (map[wy][wx] > 0) {
        var wall = new THREE.Mesh(wallGeo, wallMaterials[map[wy][wx]] || wallMaterials[1]);
        wall.position.set(wx * CELL + CELL / 2, CELL / 2, wy * CELL + CELL / 2);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
      }
    }
  }

  // --- Ground ---
  (function buildGround() {
    var gc = document.createElement("canvas");
    gc.width = 512; gc.height = 512;
    var gg = gc.getContext("2d");
    gg.fillStyle = "#C2A062";
    gg.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 10000; i++) {
      var gx = Math.random() * 512, gy = Math.random() * 512;
      var sh = Math.floor(170 + Math.random() * 50);
      gg.fillStyle = "rgba(" + sh + "," + Math.floor(sh * 0.8) + "," + Math.floor(sh * 0.5) + ",0.3)";
      gg.fillRect(gx, gy, 2, 2);
    }
    var gtex = new THREE.CanvasTexture(gc);
    gtex.wrapS = THREE.RepeatWrapping;
    gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(10, 10);
    var gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(mapW * CELL, mapH * CELL),
      new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.set((mapW * CELL) / 2, 0, (mapH * CELL) / 2);
    gnd.receiveShadow = true;
    scene.add(gnd);
  })();

  // --- Sky sphere ---
  (function buildSky() {
    var skyGeo = new THREE.SphereGeometry(120, 32, 32);
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor:    { value: new THREE.Color(0x2a1a3e) }, // CHANGED to match fog
        bottomColor: { value: new THREE.Color(0xe06800) }, // CHANGED brighter sunset
        offset:   { value: 10 },
        exponent: { value: 0.6 }
      },
      vertexShader: [
        'varying vec3 vWP;',
        'void main(){',
        '  vWP=(modelMatrix*vec4(position,1.0)).xyz;',
        '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;',
        'varying vec3 vWP;',
        'void main(){',
        '  float h=normalize(vWP+offset).y;',
        '  gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  })();

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0xffeedd, 1.4)); // CHANGED from 0.6

  var sun = new THREE.DirectionalLight(0xffaa44, 1.8); // CHANGED from 1.2
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xffaa44, 0x8B4513, 0.9)); // CHANGED from 0.5

  // --- Torches ---
  var torchPositions = [
    [3,1],[8,1],[13,1],[1,6],[1,11],[14,6],[14,11],[6,6],[10,10],[8,14]
  ];
  torchPositions.forEach(function (pos) {
    var tLight = new THREE.PointLight(0xff6b35, 3.0, 22); // CHANGED from 2.0, 14
    tLight.position.set(pos[0] * CELL + CELL / 2, 3.5, pos[1] * CELL + CELL / 2);
    tLight.castShadow = true;
    tLight.shadow.mapSize.width = 256;
    tLight.shadow.mapSize.height = 256;
    scene.add(tLight);

    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8c00 })
    );
    glow.position.copy(tLight.position);
    scene.add(glow);

    torches.push({ light: tLight, base: 3.0 }); // CHANGED from 2.0
  });

  // ============================================================
  //  WORLD SPRITE BUILDERS
  // ============================================================

  function buildBarrel(x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.6, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85 })
    );
    body.position.y = 0.7; body.castShadow = true; g.add(body);
    var bandMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    [0.3, 0.7, 1.1].forEach(function (by) {
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 8, 16), bandMat);
      band.rotation.x = Math.PI / 2; band.position.y = by; g.add(band);
    });
    g.position.set(x * CELL + CELL / 2, 0, z * CELL + CELL / 2);
    scene.add(g);
  }

  function buildCactus(x, z) {
    var mat = new THREE.MeshStandardMaterial({ color: 0x2D6B1E, roughness: 0.8 });
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.8, 8), mat);
    trunk.position.y = 1.4; trunk.castShadow = true; g.add(trunk);
    var armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.0, 8), mat);
    armL.position.set(-0.35, 1.6, 0); armL.rotation.z = Math.PI / 4; armL.castShadow = true; g.add(armL);
    var armLUp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), mat);
    armLUp.position.set(-0.65, 2.2, 0); armLUp.castShadow = true; g.add(armLUp);
    var armR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.8, 8), mat);
    armR.position.set(0.3, 1.2, 0); armR.rotation.z = -Math.PI / 4; armR.castShadow = true; g.add(armR);
    var armRUp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), mat);
    armRUp.position.set(0.55, 1.7, 0); armRUp.castShadow = true; g.add(armRUp);
    g.position.set(x * CELL + CELL / 2, 0, z * CELL + CELL / 2);
    scene.add(g);
  }

  function buildCrate(x, z) {
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xA08050, roughness: 0.9 })
    );
    box.position.set(x * CELL + CELL / 2, 0.55, z * CELL + CELL / 2);
    box.castShadow = true; box.receiveShadow = true;
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: 0x5A4030 })
    );
    box.add(edges);
    scene.add(box);
  }

  function buildHitch(x, z) {
    var mat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9 });
    var g = new THREE.Group();
    var post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), mat);
    post1.position.set(-0.6, 0.7, 0); post1.castShadow = true; g.add(post1);
    var post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), mat);
    post2.position.set(0.6, 0.7, 0); post2.castShadow = true; g.add(post2);
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), mat);
    bar.rotation.z = Math.PI / 2; bar.position.y = 1.2; bar.castShadow = true; g.add(bar);
    g.position.set(x * CELL + CELL / 2, 0, z * CELL + CELL / 2);
    scene.add(g);
  }

  function buildTrough(x, z) {
    var mat = new THREE.MeshStandardMaterial({ color: 0x6B5335, roughness: 0.9 });
    var g = new THREE.Group();
    var outer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.8), mat);
    outer.position.y = 0.3; outer.castShadow = true; g.add(outer);
    var water = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.1, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2244AA, roughness: 0.2, metalness: 0.3 })
    );
    water.position.y = 0.45; g.add(water);
    g.position.set(x * CELL + CELL / 2, 0, z * CELL + CELL / 2);
    scene.add(g);
  }

  function buildWheel(x, z) {
    var mat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85 });
    var g = new THREE.Group();
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24), mat);
    g.add(rim);
    for (var s = 0; s < 8; s++) {
      var spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), mat);
      spoke.rotation.z = (s * Math.PI) / 4; g.add(spoke);
    }
    var hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 })
    );
    hub.rotation.x = Math.PI / 2; g.add(hub);
    g.rotation.x = Math.PI / 2; g.rotation.z = 0.3;
    g.position.set(x * CELL + CELL / 2, 0.65, z * CELL + CELL / 2);
    scene.add(g);
  }

  worldSpriteData.forEach(function (s) {
    switch (s.type) {
      case "barrel":  buildBarrel(s.x - 0.5, s.y - 0.5); break;
      case "cactus":  buildCactus(s.x - 0.5, s.y - 0.5); break;
      case "crate":   buildCrate(s.x - 0.5, s.y - 0.5); break;
      case "hitch":   buildHitch(s.x - 0.5, s.y - 0.5); break;
      case "trough":  buildTrough(s.x - 0.5, s.y - 0.5); break;
      case "wheel":   buildWheel(s.x - 0.5, s.y - 0.5); break;
    }
  });
   // ============================================================
  //  ENEMY 3D MESHES
  // ============================================================

  function createEnemyMesh(e) {
    var g = new THREE.Group();
    var template = ENEMY_TYPES[e.type];

    var bodyH = template.height * CELL * 0.6;
    var bodyW = template.width * CELL * 0.5;
    var hatH = template.height * CELL * 0.2;

    var bodyMat = new THREE.MeshStandardMaterial({ color: template.color, roughness: 0.7 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyW * 0.6), bodyMat);
    body.position.y = bodyH / 2; body.castShadow = true; g.add(body);
    g.userData.bodyMat = bodyMat;
    g.userData.bodyColor = template.color;

    var hatMat = new THREE.MeshStandardMaterial({ color: template.hatColor, roughness: 0.6 });
    var brim = new THREE.Mesh(new THREE.CylinderGeometry(bodyW * 0.8, bodyW * 0.8, 0.06, 12), hatMat);
    brim.position.y = bodyH + 0.03; g.add(brim);
    var crown = new THREE.Mesh(new THREE.CylinderGeometry(bodyW * 0.4, bodyW * 0.5, hatH, 12), hatMat);
    crown.position.y = bodyH + hatH / 2 + 0.06; crown.castShadow = true; g.add(crown);

    var eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    var eyeSize = bodyW * 0.12;
    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 6, 6), eyeMat);
    eyeL.position.set(-bodyW * 0.18, bodyH * 0.78, bodyW * 0.32); g.add(eyeL);
    var eyeR = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 6, 6), eyeMat);
    eyeR.position.set(bodyW * 0.18, bodyH * 0.78, bodyW * 0.32); g.add(eyeR);
    g.userData.eyeMat = eyeMat;

    var belt = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 1.05, bodyH * 0.05, bodyW * 0.65),
      new THREE.MeshStandardMaterial({ color: 0xD4A017, metalness: 0.3 })
    );
    belt.position.y = bodyH * 0.45; g.add(belt);

    var hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyW * 1.2, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide })
    );
    hpBg.position.y = bodyH + hatH + 0.3; g.add(hpBg);

    var hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyW * 1.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xD4A017, side: THREE.DoubleSide })
    );
    hpFill.position.y = bodyH + hatH + 0.3;
    hpFill.position.z = 0.01; g.add(hpFill);
    g.userData.hpFill = hpFill;
    g.userData.hpWidth = bodyW * 1.2;

    scene.add(g);
    return g;
  }

  function removeEnemyMesh(mesh) {
    scene.remove(mesh);
    mesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  // ============================================================
  //  INIT
  // ============================================================

  function init() {
    resize();
    window.addEventListener("resize", resize);

    document.addEventListener("keydown", function (e) {
      keys[e.key] = true;
      if (e.key === " " && state === "playing") shooting = true;
      if (e.key >= "1" && e.key <= "4" && state === "playing") {
        var idx = parseInt(e.key) - 1;
        if (idx !== currentWeapon) { currentWeapon = idx; fireTimer = 10; }
      }
    });
    document.addEventListener("keyup", function (e) {
      keys[e.key] = false;
      if (e.key === " ") shooting = false;
    });

    canvas.addEventListener("click", function () {
      if (state === "playing" && !document.pointerLockElement) canvas.requestPointerLock();
    });
    canvas.addEventListener("mousedown", function () {
      if (state === "playing" && document.pointerLockElement === canvas) shooting = true;
    });
    canvas.addEventListener("mouseup", function () { shooting = false; });
    document.addEventListener("mousemove", function (e) {
      if (document.pointerLockElement === canvas && state === "playing") {
        pa += e.movementX * 0.002;
        pitchAngle -= e.movementY * 0.002;
        pitchAngle = Math.max(-1.2, Math.min(1.2, pitchAngle));
      }
    });

    canvas.addEventListener("wheel", function (e) {
      if (state !== "playing") return;
      if (e.deltaY > 0) currentWeapon = (currentWeapon + 1) % 4;
      else currentWeapon = (currentWeapon + 3) % 4;
      fireTimer = 10; e.preventDefault();
    }, { passive: false });

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    document.getElementById("start-btn").addEventListener("click", startGame);
    document.getElementById("restart-btn").addEventListener("click", startGame);

    loop();
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    overlay.width = W; overlay.height = H;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    composer.setSize(W, H);
  }

  function startGame() {
    state = "playing";
    score = 0; wave = 1; health = 100;
    px = 8; py = 8; pa = 0; pitchAngle = 0;
    dmgFlash = 0; currentWeapon = 0;
    weaponAmmo = [Infinity, 12, 8, 3];
    weaponKick = 0; shooting = false; fireTimer = 0;
    spawnInvincible = 180; // ADDED — 3 seconds of spawn protection

    for (var i = 0; i < enemies.length; i++) {
      if (enemies[i].mesh) removeEnemyMesh(enemies[i].mesh);
    }
    enemies = [];
    spawnWave();

    document.getElementById("menu-screen").style.display = "none";
    document.getElementById("game-over-screen").style.display = "none";
    document.getElementById("hud").style.display = "block";
    updateHUD();
  }

  function updateHUD() {
    document.getElementById("health").textContent = health;
    document.getElementById("wave").textContent = wave;
    document.getElementById("score").textContent = score;
    var wep = WEAPONS[weaponKeys[currentWeapon]];
    var ammoText = weaponAmmo[currentWeapon] === Infinity ? "∞" : weaponAmmo[currentWeapon];
    document.getElementById("ammo").textContent = wep.name + " | " + ammoText;
  }

  // ============================================================
  //  TOUCH CONTROLS
  // ============================================================

  function handleTouchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var slotW = 70, slotH = 45, gap = 6;
      var totalTW = weaponKeys.length * slotW + (weaponKeys.length - 1) * gap;
      var startX = (W - totalTW) / 2;
      var barY = H - 55;

      if (t.clientY >= barY && t.clientY <= barY + slotH) {
        for (var wi = 0; wi < weaponKeys.length; wi++) {
          var sx = startX + wi * (slotW + gap);
          if (t.clientX >= sx && t.clientX <= sx + slotW) {
            if (wi !== currentWeapon) { currentWeapon = wi; fireTimer = 10; }
            return;
          }
        }
      }

      if (t.clientX < W / 3) {
        touchJoy = { startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY, id: t.identifier };
      } else if (t.clientX > (W * 2) / 3) {
        touchLook = { startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY, id: t.identifier, switched: false };
      } else {
        shooting = true;
      }
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (touchJoy && t.identifier === touchJoy.id) {
        touchJoy.currX = t.clientX; touchJoy.currY = t.clientY;
      }
      if (touchLook && t.identifier === touchLook.id) {
        var deltaX = t.clientX - touchLook.currX;
        pa += deltaX * 0.004;
        touchLook.currX = t.clientX; touchLook.currY = t.clientY;
        if (!touchLook.switched) {
          var swipeY = t.clientY - touchLook.startY;
          if (swipeY < -40) {
            currentWeapon = (currentWeapon + 1) % 4; fireTimer = 10; touchLook.switched = true;
          } else if (swipeY > 40) {
            currentWeapon = (currentWeapon + 3) % 4; fireTimer = 10; touchLook.switched = true;
          }
        }
      }
    }
  }

  function handleTouchEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (touchJoy && t.identifier === touchJoy.id) touchJoy = null;
      if (touchLook && t.identifier === touchLook.id) touchLook = null;
    }
    var midTouch = false;
    for (var j = 0; j < e.touches.length; j++) {
      if (e.touches[j].clientX > W / 3 && e.touches[j].clientX < (W * 2) / 3) midTouch = true;
    }
    if (!midTouch) shooting = false;
  }

  // ============================================================
  //  MOVEMENT
  // ============================================================

  function canWalk(mx, my) {
    var gx = Math.floor(mx), gy = Math.floor(my);
    if (gx < 0 || gx >= mapW || gy < 0 || gy >= mapH) return false;
    return map[gy][gx] === 0;
  }

  function handleInput() {
    var ms = moveSpd;
    var dx = Math.cos(pa), dy = Math.sin(pa);

    if (keys["w"] || keys["W"] || keys["ArrowDown"]) {
      var nx = px + dx * ms, ny = py + dy * ms;
      if (canWalk(nx, py)) px = nx;
      if (canWalk(px, ny)) py = ny;
    }
    if (keys["s"] || keys["S"] || keys["ArrowUp"]) {
      var nx = px - dx * ms, ny = py - dy * ms;
      if (canWalk(nx, py)) px = nx;
      if (canWalk(px, ny)) py = ny;
    }
    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) pa -= rotSpd;
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) pa += rotSpd;

    if (touchJoy) {
      var jdx = Math.max(-1, Math.min(1, (touchJoy.currX - touchJoy.startX) / 50));
      var jdy = Math.max(-1, Math.min(1, (touchJoy.currY - touchJoy.startY) / 50));
      if (Math.abs(jdy) > 0.1) {
        var nx = px - dx * jdy * ms, ny = py - dy * jdy * ms;
        if (canWalk(nx, py)) px = nx;
        if (canWalk(px, ny)) py = ny;
      }
      if (Math.abs(jdy) > 0.1) {
  var nx = px + dx * jdy * ms, ny = py + dy * jdy * ms;  // CHANGED: was - -
  if (canWalk(nx, py)) px = nx;
  if (canWalk(px, ny)) py = ny;
}
    }

    camera.position.set(px * CELL, 2.0, py * CELL);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -pa + Math.PI / 2;
    camera.rotation.x = pitchAngle;
  }

  // ============================================================
  //  ENEMY SPAWNING
  // ============================================================

  function spawnWave() {
    var count = enemiesPerWave + Math.floor(wave * 1.5);
    var hpScale = 1 + (wave - 1) * 0.08;

    weaponAmmo[1] = WEAPONS.shotgun.maxAmmo;
    weaponAmmo[2] = WEAPONS.rifle.maxAmmo;
    weaponAmmo[3] = WEAPONS.dynamite.maxAmmo;

    if (wave > 1) spawnInvincible = 120; // ADDED — 2 seconds protection on new waves

    for (var i = 0; i < count; i++) {
      var type;
      var roll = Math.random();
      if (wave < 3) {
        type = roll < 0.7 ? "bandit" : "gunslinger";
      } else if (wave < 6) {
        type = roll < 0.5 ? "bandit" : roll < 0.8 ? "gunslinger" : roll < 0.95 ? "dynamite" : "outlaw";
      } else {
        type = roll < 0.3 ? "bandit" : roll < 0.55 ? "gunslinger" : roll < 0.75 ? "dynamite" : "outlaw";
      }

      var template = ENEMY_TYPES[type];
      var ex, ey, attempts = 0;
      do {
        ex = 1.5 + Math.random() * (mapW - 3);
        ey = 1.5 + Math.random() * (mapH - 3);
        attempts++;
      } while (
        (map[Math.floor(ey)][Math.floor(ex)] !== 0 ||
          Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py)) < 5) && // CHANGED from 3 to 5
        attempts < 50
      );

      var e = {
        x: ex, y: ey, type: type,
        hp: Math.floor(template.hp * hpScale),
        maxHp: Math.floor(template.hp * hpScale),
        speed: template.speed, damage: template.damage, score: template.score,
        w: template.width, h: template.height,
        hitTimer: 0, attackTimer: 0, mesh: null
      };
      e.mesh = createEnemyMesh(e);
      enemies.push(e);
    }
  }

  // ============================================================
  //  ENEMY AI
  // ============================================================

  function updateEnemies() {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var edx = px - e.x, edy = py - e.y;
      var dist = Math.sqrt(edx * edx + edy * edy);
      var ndx = dist > 0 ? edx / dist : 0;
      var ndy = dist > 0 ? edy / dist : 0;

      var moveX = ndx, moveY = ndy;
      var speed = e.speed;
      var doMove = dist > 0.6;
      var canAttack = false;
      var attackSpeed = 30;

      if (e.type === "gunslinger") {
        if (dist < 3.5) {
          var strafe = i % 2 === 0 ? 1 : -1;
          moveX = -ndy * strafe; moveY = ndx * strafe; doMove = true;
        } else if (dist < 6) { doMove = false; }
        if (dist < 7) { canAttack = true; attackSpeed = 25; }
      } else if (e.type === "outlaw") {
        if (dist < 3) speed = e.speed * 2.5;
        if (dist < 0.8) { canAttack = true; attackSpeed = 25; }
      } else if (e.type === "dynamite") {
        if (dist < 2.5) { moveX = -ndx; moveY = -ndy; doMove = true; }
        else if (dist < 5) { doMove = false; }
        if (dist < 6 && dist > 1.5) { canAttack = true; attackSpeed = 45; }
      } else {
        if (dist < 0.8) { canAttack = true; attackSpeed = 30; }
      }

      if (doMove) {
        var nx = e.x + moveX * speed;
        var ny = e.y + moveY * speed;
        if (canWalk(nx, e.y)) e.x = nx;
        if (canWalk(e.x, ny)) e.y = ny;
      }

      // CHANGED — skip damage while spawn shield is active
      if (canAttack && spawnInvincible <= 0) {
        e.attackTimer++;
        if (e.attackTimer >= attackSpeed) {
          health -= e.damage;
          dmgFlash = 10;
          e.attackTimer = 0;
          if (health <= 0) { health = 0; gameOver(); return; }
        }
      } else if (spawnInvincible > 0) {
        e.attackTimer = 0; // ADDED — reset attack timers during shield
      } else {
        e.attackTimer = Math.max(0, e.attackTimer - 3);
      }

      if (e.hitTimer > 0) e.hitTimer--;

      if (e.mesh) {
        e.mesh.position.set(e.x * CELL, 0, e.y * CELL);
        e.mesh.lookAt(camera.position.x, 0, camera.position.z);

        if (e.hitTimer > 0) {
          e.mesh.userData.bodyMat.emissive.setHex(0xffffff);
          e.mesh.userData.bodyMat.emissiveIntensity = e.hitTimer / 6;
          e.mesh.userData.eyeMat.color.setHex(0xff0000);
        } else {
          e.mesh.userData.bodyMat.emissive.setHex(0x000000);
          e.mesh.userData.bodyMat.emissiveIntensity = 0;
          e.mesh.userData.eyeMat.color.setHex(0xff3300);
        }

        var hpPct = e.hp / e.maxHp;
        if (e.mesh.userData.hpFill) {
          e.mesh.userData.hpFill.scale.x = Math.max(0.001, hpPct);
          e.mesh.userData.hpFill.position.x = (-e.mesh.userData.hpWidth * (1 - hpPct)) / 2;
          if (hpPct > 0.5) e.mesh.userData.hpFill.material.color.setHex(0xD4A017);
          else if (hpPct > 0.25) e.mesh.userData.hpFill.material.color.setHex(0xCC5500);
          else e.mesh.userData.hpFill.material.color.setHex(0xFF0000);
        }
      }

      if (e.hp <= 0) {
        score += e.score;
        if (e.mesh) removeEnemyMesh(e.mesh);
        enemies.splice(i, 1);
      }
    }

    if (enemies.length === 0 && state === "playing") {
      wave++;
      spawnWave();
    }
  }

  // ============================================================
  //  SHOOTING
  // ============================================================

  // ============================================================
  //  SHOOTING
  // ============================================================

  function handleShooting() {
    if (fireTimer > 0) { fireTimer--; return; }
    if (!shooting) return;

    var wepKey = weaponKeys[currentWeapon];
    var wep = WEAPONS[wepKey];

    if (weaponAmmo[currentWeapon] <= 0) { currentWeapon = 0; return; }

    fireTimer = wep.fireRate;
    if (weaponAmmo[currentWeapon] !== Infinity) weaponAmmo[currentWeapon]--;
    weaponKick = wep.kickback;

    if (wep.aoe) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var edx = e.x - px, edy = e.y - py;
        var dist = Math.sqrt(edx * edx + edy * edy);
        if (dist < wep.aoeRadius) {
          var falloff = 1 - dist / wep.aoeRadius;
          e.hp -= Math.floor(wep.damage * falloff);
          e.hitTimer = 8;
        }
      }
      dmgFlash = 3;
    } else {
      var camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      var hits = [];
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var enemyPos = new THREE.Vector3(e.x * CELL, 1.5, e.y * CELL);
        var toEnemy = new THREE.Vector3().subVectors(enemyPos, camera.position).normalize();
        var angle = camDir.angleTo(toEnemy);
        var edx = e.x - px, edy = e.y - py;
        var dist = Math.sqrt(edx * edx + edy * edy);

        var spreadAngle = wep.spread + (e.w * 0.5) / Math.max(dist, 0.5);
        if (angle < spreadAngle) {
          hits.push({ enemy: e, dist: dist });
        }
      }

      hits.sort(function (a, b) { return a.dist - b.dist; });

      if (wepKey === "shotgun") {
        var maxHits = Math.min(3, hits.length);
        for (var h = 0; h < maxHits; h++) {
          var falloff = 1 - h * 0.25;
          hits[h].enemy.hp -= Math.floor(wep.damage * falloff);
          hits[h].enemy.hitTimer = 6;
        }
      } else {
        if (hits.length > 0) {
          hits[0].enemy.hp -= wep.damage;
          hits[0].enemy.hitTimer = 6;
        }
      }
    }
  }

  // ============================================================
  //  GAME OVER
  // ============================================================

  function gameOver() {
    state = "gameover";
    document.getElementById("final-wave").textContent = wave;
    document.getElementById("final-score").textContent = score;
    document.getElementById("game-over-screen").style.display = "flex";
    document.getElementById("hud").style.display = "none";
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ============================================================
  //  2D OVERLAY — Weapon, Crosshair, Weapon Bar, Damage Flash
  // ============================================================

  function drawWeapon() {
    var wepKey = weaponKeys[currentWeapon];

    if (weaponKick > 0) weaponKick -= 0.8;
    if (weaponKick < 0) weaponKick = 0;

    var baseX = W / 2;
    var baseY = H - 10 + weaponKick;

    ctx.save();

    if (wepKey === "revolver") {
      var gripW = 18, gripH = 50;
      var barrelW = 8, barrelH = 35;
      ctx.fillStyle = "#5C3A1E";
      ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
      ctx.fillStyle = "#3E2712";
      ctx.fillRect(baseX - gripW / 2 + 3, baseY - gripH + 8, gripW - 6, 2);
      ctx.fillRect(baseX - gripW / 2 + 3, baseY - gripH + 16, gripW - 6, 2);
      ctx.fillStyle = "#6B6B6B";
      ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, barrelW, barrelH);
      ctx.fillStyle = "#8A8A8A";
      ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 2, barrelH);
      ctx.fillStyle = "#555555";
      ctx.beginPath();
      ctx.arc(baseX, baseY - gripH + 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#444444";
      ctx.beginPath();
      ctx.arc(baseX, baseY - gripH + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6B6B6B";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(baseX, baseY - gripH + 18, 7, 0, Math.PI);
      ctx.stroke();

    } else if (wepKey === "shotgun") {
      var gripW = 22, gripH = 60;
      var barrelW = 20, barrelH = 50;
      ctx.fillStyle = "#5C3A1E";
      ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
      ctx.fillStyle = "#3E2712";
      ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 5, gripW - 4, 3);
      ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 14, gripW - 4, 3);
      ctx.fillStyle = "#555555";
      ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, 8, barrelH);
      ctx.fillRect(baseX - barrelW / 2 + 12, baseY - gripH - barrelH, 8, barrelH);
      ctx.fillStyle = "#6B6B6B";
      ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 2, barrelH);
      ctx.fillRect(baseX - barrelW / 2 + 13, baseY - gripH - barrelH, 2, barrelH);
      ctx.fillStyle = "#8B6914";
      ctx.fillRect(baseX - 12, baseY - gripH - 8, 24, 10);

    } else if (wepKey === "rifle") {
      var gripW = 16, gripH = 55;
      var barrelW = 6, barrelH = 65;
      ctx.fillStyle = "#5C3A1E";
      ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
      ctx.fillStyle = "#3E2712";
      for (var li = 0; li < 4; li++) {
        ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 6 + li * 10, gripW - 4, 2);
      }
      ctx.fillStyle = "#4A4A4A";
      ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, barrelW, barrelH);
      ctx.fillStyle = "#5A5A5A";
      ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 1, barrelH);
      ctx.strokeStyle = "#8B6914";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(baseX - 8, baseY - gripH + 20);
      ctx.quadraticCurveTo(baseX - 14, baseY - gripH + 35, baseX - 6, baseY - gripH + 40);
      ctx.stroke();
      ctx.fillStyle = "#333333";
      ctx.fillRect(baseX - 4, baseY - gripH - barrelH + 10, 8, 6);
      ctx.fillStyle = "#222222";
      ctx.fillRect(baseX - 2, baseY - gripH - barrelH + 5, 4, 20);

    } else if (wepKey === "dynamite") {
      var stickW = 14, stickH = 45;
      ctx.fillStyle = "#CC0000";
      ctx.fillRect(baseX - stickW / 2, baseY - stickH, stickW, stickH);
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(baseX - stickW / 2 - 1, baseY - stickH + 10, stickW + 2, 8);
      ctx.fillStyle = "#AA0000";
      ctx.font = "6px monospace";
      ctx.textAlign = "center";
      ctx.fillText("TNT", baseX, baseY - stickH + 17);
      ctx.fillStyle = "#8B0000";
      ctx.fillRect(baseX - stickW / 2, baseY - stickH, stickW, 4);
      ctx.fillRect(baseX - stickW / 2, baseY - 4, stickW, 4);
      ctx.strokeStyle = "#FFD700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY - stickH);
      ctx.quadraticCurveTo(baseX + 8, baseY - stickH - 15, baseX - 2, baseY - stickH - 25);
      ctx.stroke();
      var sparkSize = 3 + Math.random() * 3;
      ctx.fillStyle = "#FF6600";
      ctx.beginPath();
      ctx.arc(baseX - 2, baseY - stickH - 25, sparkSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFF00";
      ctx.beginPath();
      ctx.arc(baseX - 2, baseY - stickH - 25, sparkSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#C4956A";
      ctx.fillRect(baseX - stickW / 2 - 4, baseY - 20, stickW + 8, 20);
    }

    ctx.restore();
  }

  function drawWeaponBar() {
    var barY = H - 55;
    var slotW = 70, slotH = 45, gap = 6;
    var totalW = weaponKeys.length * slotW + (weaponKeys.length - 1) * gap;
    var startX = (W - totalW) / 2;

    for (var i = 0; i < weaponKeys.length; i++) {
      var wep = WEAPONS[weaponKeys[i]];
      var sx = startX + i * (slotW + gap);
      var active = i === currentWeapon;

      ctx.fillStyle = active ? "rgba(212, 160, 23, 0.4)" : "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(sx, barY, slotW, slotH);

      ctx.strokeStyle = active ? "#D4A017" : "#555555";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(sx, barY, slotW, slotH);

      ctx.fillStyle = active ? "#D4A017" : "#888888";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText("" + (i + 1), sx + 4, barY + 12);

      ctx.fillStyle = active ? "#FFFFFF" : "#AAAAAA";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(wep.name, sx + slotW / 2, barY + 25);

      var ammoText = weaponAmmo[i] === Infinity ? "∞" : "" + weaponAmmo[i];
      ctx.fillStyle = weaponAmmo[i] <= 0 ? "#FF0000" : active ? "#D4A017" : "#888888";
      ctx.font = "10px monospace";
      ctx.fillText(ammoText, sx + slotW / 2, barY + 38);
    }
  }

  function drawCrosshair() {
    var cx = W / 2, cy = H / 2;
    var wep = WEAPONS[weaponKeys[currentWeapon]];

    var spreadR = wep.spread * 400;
    ctx.strokeStyle = "rgba(212, 160, 23, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, spreadR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#D4A017";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    ctx.fillStyle = "#CC5500";
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
  }

  function drawDamageFlash() {
    if (dmgFlash > 0) {
      ctx.fillStyle = "rgba(200, 0, 0, " + dmgFlash / 15 + ")";
      ctx.fillRect(0, 0, W, H);
      dmgFlash--;
    }
  }

  // ADDED — spawn shield visual indicator
  function drawSpawnShield() {
    if (spawnInvincible > 0) {
      var alpha = Math.min(0.15, spawnInvincible / 180 * 0.15);
      ctx.strokeStyle = "rgba(100, 200, 255, " + (alpha * 3) + ")";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 80, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(100, 200, 255, 0.8)";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("SHIELD " + Math.ceil(spawnInvincible / 60) + "s", W / 2, H / 2 + 100);
    }
  }

  // ============================================================
  //  TORCH FLICKER
  // ============================================================

  function flickerTorches() {
    for (var i = 0; i < torches.length; i++) {
      var t = torches[i];
      t.light.intensity = t.base + (Math.random() - 0.5) * 0.8;
    }
  }

  // ============================================================
  //  MAIN LOOP
  // ============================================================

  function loop() {
    if (state === "playing") {
      if (spawnInvincible > 0) spawnInvincible--; // ADDED — countdown shield
      handleInput();
      handleShooting();
      updateEnemies();
      flickerTorches();

      // Render 3D with post-processing
      composer.render();

      // Render 2D overlay
      ctx.clearRect(0, 0, W, H);
      drawWeapon();
      drawCrosshair();
      drawWeaponBar();
      drawDamageFlash();
      drawSpawnShield(); // ADDED — draw shield indicator
      updateHUD();
    }
    requestAnimationFrame(loop);
  }

  // ============================================================
  //  START
  // ============================================================

  init();
})();
