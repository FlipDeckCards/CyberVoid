// ═══════════════════════════════════════════════════════════
// DEADZONE — First-Person Cyberpunk Zombie Survival
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// ── IMAGE LOADING ──
const IMG = {};
const imgSources = {
  bg: '/assets/city_bg.png',
  player: '/assets/player.png',
  zombie_walker: '/assets/zombie_walker.png',
  zombie_runner: '/assets/zombie_runner.png',
  zombie_exploder: '/assets/zombie_exploder.png',
  zombie_tank: '/assets/zombie_tank.png',
  gun_pistol: '/assets/pistol.png',
  gun_shotgun: '/assets/shotgun.png',
  gun_rifle: '/assets/rifle.png',
  gun_rocket: '/assets/rocket.png',
  zombie_walker_sheet: '/assets/zombie_walker_sheet.png',
  zombie_runner_sheet: '/assets/zombie_runner_sheet.png',
  zombie_tank_sheet: '/assets/zombie_tank_sheet.png',
  zombie_exploder_sheet: '/assets/zombie_exploder_sheet.png',
  fog: '/assets/fog.png'
};
let imagesLoaded = 0;
const totalImages = Object.keys(imgSources).length;
Object.entries(imgSources).forEach(([key, src]) => {
  IMG[key] = new Image();
  IMG[key].onload = () => imagesLoaded++;
  IMG[key].src = src;
});

// ── CONSTANTS ──
const FOV = 60 * Math.PI / 180;
const NEAR = 0.5;
const STREET_DEPTH = 120;
const LANE_W = 1.0;
const LANES = 7;
const ZOMBIE_H = 6.4;
const ATTACK_RANGE = 4;
const CAM_H = 10;
const GROUND_CLAMP = 0.50;

// ── WEAPONS ──
const WEAPONS = {
  pistol:  { name:'PISTOL',  dmg:20,  rate:320,  spread:0,    pellets:1, auto:false, col:'#0f0',  recoil:6 },
  shotgun: { name:'SHOTGUN', dmg:45,  rate:700,  spread:0.13, pellets:6, auto:false, col:'#f80',  recoil:14 },
  rifle:   { name:'RIFLE',   dmg:35,  rate:90,   spread:0.03, pellets:1, auto:true,  col:'#0ff',  recoil:3 },
  rocket:  { name:'ROCKET',  dmg:170, rate:1100, spread:0,    pellets:1, auto:false, col:'#f44',  recoil:20, explosive:true }
};
const WEAPON_ORDER = ['pistol','rifle','shotgun','rocket'];

// ── STATE ──
let W, H, cx, cy, horizonY, roadVPx;
let state = 'waiting';
let playerName = 'OPERATOR';
let score = 0, wave = 1, kills = 0, killGoal = 8, health = 100, armor = 0;
let curWeapon = 'pistol';
let weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
let lastShot = 0, gunRecoil = 0, muzzleFlash = 0, gunBob = 0;
let zombies = [], particles = [], powerups = [];
let dmgFlash = 0, screenShake = 0;
let spawnTimer = 0, spawnInterval = 1800, spawnBudget = 0;
let mouse = { x:0, y:0 };
let mouseDown = false;
let lastTime = 0;

// ── RESIZE ──
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cx = W / 2; cy = H / 2;
  horizonY = H * 0.55;
  roadVPx = W * 0.25;
}
window.addEventListener('resize', resize);
resize();

// ── 3D PROJECTION ──
function proj(wx, wy, wz) {
  if (wz < NEAR) wz = NEAR;
  const s = (H * 0.5) / (wz * Math.tan(FOV / 2));
  const groundOffset = Math.min(H * GROUND_CLAMP, CAM_H * s);
  return { x: roadVPx + wx * s, y: horizonY + groundOffset - wy * s, s };
}

// ── INIT GAME ──
function init() {
  score = 0; wave = 1; kills = 0; killGoal = 8;
  health = 100; armor = 0;
  curWeapon = 'pistol';
  weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
  lastShot = 0; gunRecoil = 0; muzzleFlash = 0; gunBob = 0;
  zombies = []; particles = []; powerups = [];
  dmgFlash = 0; screenShake = 0;
  spawnTimer = 0; spawnInterval = 1800; spawnBudget = 0;
  spawnBudget = killGoal;
  state = 'playing';
  initRain();
}

// ═══════════════════════════════════════
//  ZOMBIE TYPES
// ═══════════════════════════════════════
function zombieStats(type, w) {
  const s = 1 + w * 0.08;
  const spd = 1 + w * 0.12;  // speed scales 12% per wave
  switch (type) {
    case 'runner':   return { hp:40*s, speed:0.16 * spd, points:15, attackDmg:8 };
    case 'tank':     return { hp:200*s, speed:0.05 * spd, points:40, attackDmg:20 };
    case 'exploder': return { hp:60*s, speed:0.10 * spd, points:25, attackDmg:35 };
    default:         return { hp:80*s, speed:0.08 * spd, points:10, attackDmg:12 };
  }
}

function pickZombieType(w) {
  if (w < 2) return 'walker';
  const r = Math.random();
  if (w >= 5 && r < 0.1) return 'tank';
  if (w >= 3 && r < 0.3) return 'exploder';
  if (r < 0.5) return 'runner';
  return 'walker';
}

function spawnZombie() {
  var type = pickZombieType(wave);
  var stats = zombieStats(type, wave);
  // Tight horde spawn — all clustered on the road
  var spawns = [
    { x: -LANE_W * 3.0 },
    { x: -LANE_W * 2.0 },
    { x: -LANE_W * 1.0 },
    { x: 0 },
    { x: LANE_W * 1.0 },
    { x: LANE_W * 2.0 },
    { x: LANE_W * 3.0 }
  ];
  var sp = spawns[Math.floor(Math.random() * spawns.length)];
  var xJitter = (Math.random() - 0.5) * LANE_W * 0.5;
  var zJitter = Math.random() * 12;
  zombies.push({
    x: sp.x + xJitter,
    z: STREET_DEPTH + zJitter,
    type: type, hp: stats.hp, maxhp: stats.hp,
    speed: stats.speed + Math.random() * 0.008,
    points: stats.points, attackDmg: stats.attackDmg,
    flash: 0,
    wobble: Math.random() * Math.PI * 2,
    animPhase: Math.random() * Math.PI * 2,
    attackCooldown: 0,
    spawnX: sp.x + xJitter
  });
}

// ═══════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════
function spawnParticle(x, y, col, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8-3,
      life: 0.5+Math.random()*0.5, col, size: 2+Math.random()*4
    });
  }
}

function spawnBlood(wx, wz) {
  const p = proj(wx, ZOMBIE_H*0.5, wz);
  spawnParticle(p.x, p.y, '#f00', 8);
  spawnParticle(p.x, p.y, '#a00', 5);
}

// ═══════════════════════════════════════
//  POWERUPS
// ═══════════════════════════════════════
function maybeDropPowerup(x, z) {
  if (Math.random() > 0.25) return;
  const types = ['health','armor','shotgun','rifle','rocket'];
  if (wave >= 4 && Math.random() < 0.08) types.push('nuke');
  const type = types[Math.floor(Math.random()*types.length)];
  powerups.push({ x, z, type, life: 12 });
}

function collectPowerup(pu) {
  switch (pu.type) {
    case 'health': health = Math.min(100, health+35); break;
    case 'armor': armor = Math.min(100, armor+30); break;
    case 'shotgun': weaponAmmo.shotgun += 8; break;
    case 'rifle': weaponAmmo.rifle += 60; break;
    case 'rocket': weaponAmmo.rocket += 3; break;
    case 'nuke':
      zombies.forEach(z => {
        const p = proj(z.x, ZOMBIE_H*0.5, z.z);
        spawnParticle(p.x, p.y, '#ff0', 15);
        score += z.points; kills++;
      });
      zombies = [];
      screenShake = 1;
      break;
  }
}

// ═══════════════════════════════════════
//  SHOOTING
// ═══════════════════════════════════════
function shoot() {
  const now = performance.now();
  const w = WEAPONS[curWeapon];
  if (now - lastShot < w.rate) return;
  if (weaponAmmo[curWeapon] !== Infinity && weaponAmmo[curWeapon] <= 0) return;
  lastShot = now;
  if (weaponAmmo[curWeapon] !== Infinity) weaponAmmo[curWeapon]--;
  gunRecoil = 1;
  muzzleFlash = 1;

  for (let p = 0; p < w.pellets; p++) {
    const aimX = mouse.x + (Math.random()-0.5) * w.spread * W;
    const aimY = mouse.y + (Math.random()-0.5) * w.spread * H * 0.5;
    const sorted = [...zombies].sort((a,b) => a.z - b.z);
    for (const z of sorted) {
      const zp = proj(z.x, 0, z.z);
      const tp = proj(z.x, ZOMBIE_H, z.z);
      const sh = zp.y - tp.y;
      const sw = sh * 0.6;
      if (aimX > zp.x-sw/2 && aimX < zp.x+sw/2 && aimY > tp.y && aimY < zp.y) {
        let dmg = w.dmg;
        if (aimY < tp.y + sh*0.3) dmg *= 2;
        z.hp -= dmg;
        z.flash = 0.15;
        spawnBlood(z.x, z.z);
        if (w.explosive) {
          screenShake = 0.6;
          zombies.forEach(oz => {
            if (oz === z) return;
            const dist = Math.sqrt((oz.x-z.x)**2 + (oz.z-z.z)**2);
            if (dist < 12) { oz.hp -= w.dmg*(1-dist/12); oz.flash = 0.1; }
          });
        }
        break;
      }
    }
  }
}

// ═══════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════
function drawBackground() {
  if (IMG.bg && IMG.bg.complete) {
    ctx.drawImage(IMG.bg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a0010'); g.addColorStop(0.4,'#1a0030'); g.addColorStop(1,'#0f0f1a');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  }
}

// ========== RAIN SYSTEM ==========
var raindrops = [];
var RAIN_COUNT = 250;
var fogOffset = 0;

function initRain() {
  raindrops = [];
  for (var i = 0; i < RAIN_COUNT; i++) {
    raindrops.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 10 + Math.random() * 14,
      len: 12 + Math.random() * 22,
      opacity: 0.08 + Math.random() * 0.25
    });
  }
}

function updateRain() {
  for (var i = 0; i < raindrops.length; i++) {
    var r = raindrops[i];
    r.y += r.speed;
    r.x += r.speed * 0.25;
    if (r.y > H) { r.y = -r.len; r.x = Math.random() * W; }
    if (r.x > W) r.x = -10;
  }
}

function drawRain() {
  ctx.lineWidth = 1.5;
  for (var i = 0; i < raindrops.length; i++) {
    var r = raindrops[i];
    ctx.globalAlpha = r.opacity;
    ctx.strokeStyle = 'rgba(180,200,230,0.6)';
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + r.len * 0.25, r.y + r.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFog() {
  if (!IMG.fog || !IMG.fog.complete) return;
  fogOffset += 0.3;
  if (fogOffset > W) fogOffset = 0;
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.globalCompositeOperation = 'screen';
  var fogY = H * 0.55;
  var fogH = H * 0.45;
  ctx.drawImage(IMG.fog, -fogOffset, fogY, W * 1.5, fogH);
  ctx.drawImage(IMG.fog, W * 1.5 - fogOffset, fogY, W * 1.5, fogH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ========== ZOMBIE DRAWING ==========
function drawZombie(z) {
  var foot = proj(z.x, 0, z.z);
  var head = proj(z.x, ZOMBIE_H, z.z);
  var bodyH = foot.y - head.y;
  var bodyW = bodyH * 0.45;
  var zcx = foot.x;

  if (bodyH < 2) return;

  var walk = z.wobble;
  var legSwing = Math.sin(walk) * 0.3;
  var armSwing = Math.sin(walk + Math.PI) * 0.35;

  var bodyColor, accentColor, eyeColor;
  if (z.type === 'tank') {
    bodyColor = '#1a0f22'; accentColor = '#4a1a5a'; eyeColor = '#ff00ff';
  } else if (z.type === 'runner') {
    bodyColor = '#0f1a0f'; accentColor = '#1a3a1a'; eyeColor = '#00ff66';
  } else if (z.type === 'exploder') {
    bodyColor = '#1a0f0a'; accentColor = '#3a1a0a'; eyeColor = '#ff4400';
  } else {
    bodyColor = '#0e0e18'; accentColor = '#1a1a30'; eyeColor = '#00aaff';
  }

  var flashCol = z.flash > 0 ? 'rgba(255,80,80,' + Math.min(1, z.flash * 8) + ')' : null;

  var headSize = bodyH * 0.16;
  var torsoTop = head.y + headSize * 0.8;
  var torsoBot = head.y + bodyH * 0.55;
  var torsoW = bodyW * 0.8;
  var limbW = Math.max(2, bodyW * 0.18);
  var hipY = torsoBot;
  var legLen = foot.y - hipY;
  var shoulderY = torsoTop + bodyH * 0.03;
  var armLen = bodyH * 0.38;

  ctx.save();

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(zcx, foot.y + 2, bodyW * 0.6, bodyH * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';

  // Left leg
  var lkx = zcx - torsoW * 0.25 + Math.sin(legSwing) * legLen * 0.25;
  var lky = hipY + legLen * 0.5;
  var lfx = zcx - torsoW * 0.25 - Math.sin(legSwing) * legLen * 0.12;
  ctx.strokeStyle = flashCol || bodyColor;
  ctx.lineWidth = limbW;
  ctx.beginPath();
  ctx.moveTo(zcx - torsoW * 0.25, hipY);
  ctx.quadraticCurveTo(lkx, lky, lfx, foot.y);
  ctx.stroke();
  ctx.strokeStyle = flashCol || accentColor;
  ctx.lineWidth = Math.max(1, limbW * 0.4);
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(zcx - torsoW * 0.25, hipY);
  ctx.quadraticCurveTo(lkx - 1, lky, lfx - 1, foot.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Right leg
  var rkx = zcx + torsoW * 0.25 + Math.sin(-legSwing) * legLen * 0.25;
  var rky = hipY + legLen * 0.5;
  var rfx = zcx + torsoW * 0.25 - Math.sin(-legSwing) * legLen * 0.12;
  ctx.strokeStyle = flashCol || bodyColor;
  ctx.lineWidth = limbW;
  ctx.beginPath();
  ctx.moveTo(zcx + torsoW * 0.25, hipY);
  ctx.quadraticCurveTo(rkx, rky, rfx, foot.y);
  ctx.stroke();
  ctx.strokeStyle = flashCol || accentColor;
  ctx.lineWidth = Math.max(1, limbW * 0.4);
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(zcx + torsoW * 0.25, hipY);
  ctx.quadraticCurveTo(rkx + 1, rky, rfx + 1, foot.y);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Torso
  ctx.fillStyle = flashCol || bodyColor;
  ctx.beginPath();
  ctx.moveTo(zcx - torsoW * 0.55, torsoTop);
  ctx.lineTo(zcx + torsoW * 0.55, torsoTop);
  ctx.lineTo(zcx + torsoW * 0.35, torsoBot);
  ctx.lineTo(zcx - torsoW * 0.35, torsoBot);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = flashCol || accentColor;
  ctx.lineWidth = Math.max(0.5, bodyH * 0.012);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(zcx - torsoW * 0.55, torsoTop);
  ctx.lineTo(zcx + torsoW * 0.55, torsoTop);
  ctx.lineTo(zcx + torsoW * 0.35, torsoBot);
  ctx.lineTo(zcx - torsoW * 0.35, torsoBot);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Left arm
  var lex = zcx - torsoW * 0.55 - bodyW * 0.1;
  var ley = shoulderY + armLen * 0.4;
  var lhx = zcx - torsoW * 0.3 + Math.sin(armSwing) * armLen * 0.4;
  var lhy = shoulderY + armLen * 0.7 + Math.cos(armSwing) * armLen * 0.15;
  ctx.strokeStyle = flashCol || bodyColor;
  ctx.lineWidth = Math.max(1.5, limbW * 0.75);
  ctx.beginPath();
  ctx.moveTo(zcx - torsoW * 0.55, shoulderY);
  ctx.quadraticCurveTo(lex, ley, lhx, lhy);
  ctx.stroke();

  // Right arm
  var rex = zcx + torsoW * 0.55 + bodyW * 0.1;
  var rey = shoulderY + armLen * 0.4;
  var rhx = zcx + torsoW * 0.3 + Math.sin(-armSwing) * armLen * 0.4;
  var rhy = shoulderY + armLen * 0.7 + Math.cos(-armSwing) * armLen * 0.15;
  ctx.strokeStyle = flashCol || bodyColor;
  ctx.lineWidth = Math.max(1.5, limbW * 0.75);
  ctx.beginPath();
  ctx.moveTo(zcx + torsoW * 0.55, shoulderY);
  ctx.quadraticCurveTo(rex, rey, rhx, rhy);
  ctx.stroke();

  // Head
  var headCY = head.y + headSize * 0.5;
  ctx.fillStyle = flashCol || bodyColor;
  ctx.beginPath();
  ctx.ellipse(zcx, headCY, headSize * 0.55, headSize * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = headSize * 0.8;
  ctx.fillStyle = flashCol || eyeColor;
  var eyeGap = headSize * 0.2;
  var eyeR = Math.max(1.5, headSize * 0.14);
  ctx.beginPath();
  ctx.arc(zcx - eyeGap, headCY - headSize * 0.05, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(zcx + eyeGap, headCY - headSize * 0.05, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Health bar
  if (z.hp < z.maxhp) {
    var barW = bodyW * 0.9;
    var barH = Math.max(2, bodyH * 0.03);
    var barY = head.y - barH - 5;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(zcx - barW/2, barY, barW, barH);
    ctx.fillStyle = z.hp/z.maxhp > 0.5 ? '#0f0' : z.hp/z.maxhp > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(zcx - barW/2, barY, barW * (z.hp/z.maxhp), barH);
  }

  ctx.restore();
}

function drawPowerup(pu) {
  const p = proj(pu.x, 1.5+Math.sin(Date.now()*0.004)*0.5, pu.z);
  const sz = Math.max(10, p.s*2.5);
  const cols = {health:'#0f0',armor:'#07f',shotgun:'#f80',rifle:'#0ff',rocket:'#f44',nuke:'#ff0'};
  const col = cols[pu.type]||'#fff';
  ctx.shadowColor = col; ctx.shadowBlur = 20;
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(p.x,p.y,sz*1.5,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(p.x,p.y,sz,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000';
  ctx.font = `bold ${Math.max(10,sz*0.8)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const labels = {health:'+',armor:'A',shotgun:'SG',rifle:'RF',rocket:'RL',nuke:'☢'};
  ctx.fillText(labels[pu.type]||'?', p.x, p.y);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

function drawGun() {
  var w = WEAPONS[curWeapon];
  var bobX = Math.sin(gunBob) * 8;
  var bobY = Math.abs(Math.cos(gunBob)) * 5;
  var kickY = gunRecoil * 35;
  var kickRot = gunRecoil * 0.06;

  // Per-weapon orientation: rot in radians, flipX mirrors horizontally
  var gunConfig = {
    pistol:  { rot: 0,    flipX: true },
    shotgun: { rot: 0,    flipX: true },
    rifle:   { rot: 0,    flipX: true },
    rocket:  { rot: 0,    flipX: true }
  };

  var gunImg;
  if (curWeapon === 'pistol') gunImg = IMG.gun_pistol;
  else if (curWeapon === 'shotgun') gunImg = IMG.gun_shotgun;
  else if (curWeapon === 'rifle') gunImg = IMG.gun_rifle;
  else gunImg = IMG.gun_rocket;

  var cfg = gunConfig[curWeapon];
  var gunW = W * 0.55;
  var gunAspect = (gunImg && gunImg.complete && gunImg.naturalWidth > 0)
    ? (gunImg.naturalHeight / gunImg.naturalWidth) : 0.5;
  var gunH = gunW * gunAspect;
  var gunX = cx - gunW / 2 + bobX;
  var gunY = H - gunH + 40 + bobY + kickY;

  if (gunImg && gunImg.complete && gunImg.naturalWidth > 0) {
    ctx.save();
    ctx.translate(gunX + gunW / 2, gunY + gunH / 2);
    ctx.rotate(-kickRot + cfg.rot);
    if (cfg.flipX) ctx.scale(-1, 1);
    ctx.translate(-(gunX + gunW / 2), -(gunY + gunH / 2));
    ctx.drawImage(gunImg, gunX, gunY, gunW, gunH);
    ctx.restore();
  }
}
function drawHUD() {
  const w = WEAPONS[curWeapon];
  const pad = 20;

  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(pad,H-65,230,50);
  ctx.strokeStyle = 'rgba(0,255,0,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(pad,H-65,230,50);
  ctx.fillStyle = '#300'; ctx.fillRect(pad+50,H-55,160,14);
  ctx.fillStyle = health>30?'#0f0':'#f00';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
  ctx.fillRect(pad+50,H-55,160*(health/100),14); ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
  ctx.fillText('HP',pad+10,H-44);
  ctx.fillText(Math.ceil(health).toString(),pad+55,H-44);

  if (armor > 0) {
    ctx.fillStyle = '#003'; ctx.fillRect(pad+50,H-36,160,10);
    ctx.fillStyle = '#07f'; ctx.fillRect(pad+50,H-36,160*(armor/100),10);
    ctx.fillStyle = '#aaf'; ctx.font = 'bold 10px monospace';
    ctx.fillText('ARM',pad+10,H-28);
  }

  const ammoTxt = weaponAmmo[curWeapon]===Infinity ? '∞' : weaponAmmo[curWeapon];
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W-210-pad,H-65,210,50);
  ctx.strokeStyle = w.col+'44'; ctx.strokeRect(W-210-pad,H-65,210,50);
  ctx.fillStyle = w.col; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right';
  ctx.fillText(w.name,W-pad-15,H-45);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace';
  ctx.shadowColor = w.col; ctx.shadowBlur = 10;
  ctx.fillText(ammoTxt.toString(),W-pad-15,H-22);
  ctx.shadowBlur = 0; ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx-140,10,280,45);
  ctx.strokeStyle = 'rgba(0,255,0,0.2)'; ctx.strokeRect(cx-140,10,280,45);
  ctx.fillStyle = '#0f0'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
  ctx.shadowColor = '#0f0'; ctx.shadowBlur = 10;
  ctx.fillText('WAVE '+wave,cx,32); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ccc'; ctx.font = 'bold 11px monospace';
  ctx.fillText('SCORE: '+score+'   KILLS: '+kills+'/'+killGoal,cx,48);
  ctx.textAlign = 'left';

  const invW = 42, invStart = cx-(WEAPON_ORDER.length*invW)/2;
  WEAPON_ORDER.forEach((wk,i) => {
    const wx = invStart+i*invW;
    const active = wk===curWeapon;
    const hasAmmo = weaponAmmo[wk]>0||weaponAmmo[wk]===Infinity;
    ctx.fillStyle = active ? 'rgba(0,255,0,0.2)' : 'rgba(0,0,0,0.5)';
    ctx.fillRect(wx,H-95,invW-4,26);
    if (active) {
      ctx.strokeStyle='#0f0'; ctx.lineWidth=2; ctx.shadowColor='#0f0'; ctx.shadowBlur=6;
      ctx.strokeRect(wx,H-95,invW-4,26); ctx.shadowBlur=0;
    }
    ctx.fillStyle = hasAmmo?'#fff':'#444'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText((i+1).toString(), wx+(invW-4)/2, H-78); ctx.textAlign = 'left';
  });

  ctx.strokeStyle = 'rgba(0,255,0,0.9)'; ctx.lineWidth = 2;
  ctx.shadowColor = '#0f0'; ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(mouse.x-16,mouse.y); ctx.lineTo(mouse.x-5,mouse.y);
  ctx.moveTo(mouse.x+5,mouse.y); ctx.lineTo(mouse.x+16,mouse.y);
  ctx.moveTo(mouse.x,mouse.y-16); ctx.lineTo(mouse.x,mouse.y-5);
  ctx.moveTo(mouse.x,mouse.y+5); ctx.lineTo(mouse.x,mouse.y+16);
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#0f0'; ctx.beginPath();
  ctx.arc(mouse.x,mouse.y,2,0,Math.PI*2); ctx.fill();
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0,p.life*2);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════
function update(dt) {
  if (state !== 'playing') return;
  updateRain();
  gunRecoil *= 0.85; muzzleFlash *= 0.8;
  dmgFlash *= 0.92; screenShake *= 0.9;
  if (screenShake < 0.01) screenShake = 0;
  if (zombies.length > 0) gunBob += dt*3;
  if (mouseDown && WEAPONS[curWeapon].auto) shoot();

  spawnTimer -= dt*1000;
  if (spawnTimer <= 0 && spawnBudget > 0) {
    spawnZombie(); spawnBudget--; spawnTimer = spawnInterval;
  }

  if (kills >= killGoal && zombies.length === 0) {
    wave++; kills = 0;
    killGoal = Math.floor(8+wave*3);
    spawnBudget = killGoal;
    spawnInterval = Math.max(400, 1800-wave*100);
    spawnTimer = 500;
  } else if (spawnBudget <= 0 && zombies.length === 0 && kills < killGoal) {
    spawnBudget = killGoal-kills; spawnTimer = 200;
  }

  // Update zombies — tight horde at spawn, perspective handles visual fan-out
  // They drift from 30% of lane position at spawn to 100% near player
  zombies.forEach(z => {
    z.z -= z.speed * dt * 60;
    z.wobble += dt * (z.type === 'runner' ? 12 : 6);

    // progress: 0 at spawn, 1 at player
    var progress = Math.max(0, 1 - (z.z / STREET_DEPTH));
    // Start at 45% of lane pos (tight cluster), grow to 100% (perspective does the rest)
    var spreadTarget = z.spawnX * (0.3 + progress * 0.7);
    var driftSpeed = 0.03 * dt * 60;
    if (z.x < spreadTarget - 0.1) z.x += driftSpeed;
    else if (z.x > spreadTarget + 0.1) z.x -= driftSpeed;

    // Subtle wobble only
    z.x += Math.sin(z.wobble * 0.5) * 0.01;

    if (z.flash > 0) z.flash -= dt;

    if (z.z <= ATTACK_RANGE) {
      z.attackCooldown -= dt;
      if (z.attackCooldown <= 0) {
        let dmg = z.attackDmg;
        if (armor > 0) { const ab = Math.min(armor,dmg*0.6); armor -= ab; dmg -= ab; }
        health -= dmg; dmgFlash = 1; screenShake = 0.4; z.attackCooldown = 1;
        if (z.type === 'exploder') {
          z.hp = 0;
          const p = proj(z.x,ZOMBIE_H*0.5,z.z);
          spawnParticle(p.x,p.y,'#f80',25); spawnParticle(p.x,p.y,'#ff0',15);
          screenShake = 0.8;
        }
      }
      z.z = ATTACK_RANGE;
    }
  });

  zombies = zombies.filter(z => {
    if (z.hp <= 0) {
      score += z.points; kills++;
      const p = proj(z.x,ZOMBIE_H*0.5,z.z);
      spawnParticle(p.x,p.y,'#f00',12); spawnParticle(p.x,p.y,'#0f0',3);
      if (z.type === 'exploder') {
        zombies.forEach(oz => {
          if (oz===z) return;
          const dist = Math.sqrt((oz.x-z.x)**2+(oz.z-z.z)**2);
          if (dist<10) oz.hp -= 50;
        });
        screenShake = 0.6;
      }
      maybeDropPowerup(z.x,z.z);
      return false;
    }
    return true;
  });

  particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.3; p.life-=dt; });
  particles = particles.filter(p => p.life>0);

  powerups.forEach(pu => {
    pu.life -= dt;
    pu.z -= dt * 10;  // drift toward player
    if (pu.z <= ATTACK_RANGE+2) { collectPowerup(pu); pu.life = 0; }
  });
  powerups = powerups.filter(pu => pu.life>0);

  if (health <= 0) {
    health = 0; state = 'dead';
    canvas.style.cursor = 'default';
    document.getElementById('goScore').textContent = 'SCORE: '+score;
    document.getElementById('goWave').textContent = 'WAVE: '+wave;
    document.getElementById('goRank').textContent = 'KILLS: '+kills;
    gameOverScreen.style.display = 'flex';
  }
}

// ═══════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════
function draw(timestamp) {
  const dt = Math.min((timestamp-lastTime)/1000, 0.05);
  lastTime = timestamp;
  update(dt);

  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random()-0.5)*screenShake*20, (Math.random()-0.5)*screenShake*20);
  }

  if (state === 'playing' || state === 'dead') {
    drawBackground();
    powerups.sort((a,b) => b.z-a.z);
    powerups.forEach(drawPowerup);
    zombies.sort((a,b) => b.z-a.z);
    zombies.forEach(drawZombie);
    drawParticles();
    drawFog();
    drawRain();
    drawGun();
    if (dmgFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,'+dmgFlash*0.4+')';
      ctx.fillRect(0,0,W,H);
    }
    drawHUD();
  }

  ctx.restore();
  requestAnimationFrame(draw);
}

// ═══════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════
canvas.addEventListener('mousemove', e => { mouse.x=e.clientX; mouse.y=e.clientY; });

canvas.addEventListener('mousedown', () => {
  if (state !== 'playing') return;
  mouseDown = true;
  shoot();
});
canvas.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('mouseleave', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
  if (state !== 'playing') return;
  const num = parseInt(e.key);
  if (num >= 1 && num <= 4) {
    const wk = WEAPON_ORDER[num-1];
    if (weaponAmmo[wk]>0||weaponAmmo[wk]===Infinity) curWeapon = wk;
  }
});

// ═══════════════════════════════════════
//  HTML BUTTON WIRING
// ═══════════════════════════════════════
startBtn.addEventListener('click', () => {
  const nameInput = document.getElementById('nameInput');
  playerName = (nameInput && nameInput.value.trim()) || 'OPERATOR';
  startScreen.style.display = 'none';
  canvas.style.cursor = 'none';
  init();
});

restartBtn.addEventListener('click', () => {
  gameOverScreen.style.display = 'none';
  canvas.style.cursor = 'none';
  init();
});

// ── START RENDER LOOP ──
requestAnimationFrame(draw);
