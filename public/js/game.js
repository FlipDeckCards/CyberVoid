// ═══════════════════════════════════════════════════════════
// DEADZONE — First-Person Cyberpunk Zombie Survival
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ── IMAGE LOADING ──
const IMG = {};
const imgSources = {
  bg: '/assets/city_bg.png',
  player: '/assets/player.png',
  zombie_walker: '/assets/zombie_walker.png',
  zombie_runner: '/assets/zombie_runner.png',
  zombie_exploder: '/assets/zombie_exploder.png',
  zombie_tank: '/assets/zombie_tank.png'
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
const STREET_DEPTH = 220;
const LANE_W = 9;
const LANES = 7;
const ZOMBIE_W = 3.2;
const ZOMBIE_H = 6.4;
const ATTACK_RANGE = 4;

// ── WEAPONS ──
const WEAPONS = {
  pistol:  { name:'PISTOL',  dmg:30,  rate:320,  maxAmmo:Infinity, spread:0,    pellets:1, auto:false, col:'#0f0',  recoil:6 },
  shotgun: { name:'SHOTGUN', dmg:35,  rate:700,  maxAmmo:8,        spread:0.13, pellets:6, auto:false, col:'#f80',  recoil:14 },
  rifle:   { name:'RIFLE',   dmg:14,  rate:90,   maxAmmo:60,       spread:0.03, pellets:1, auto:true,  col:'#0ff',  recoil:3 },
  rocket:  { name:'ROCKET',  dmg:120, rate:1100, maxAmmo:5,        spread:0,    pellets:1, auto:false, col:'#f44',  recoil:20, explosive:true }
};
const WEAPON_ORDER = ['pistol','shotgun','rifle','rocket'];

// ── STATE ──
let W, H, cx, cy, horizonY;
let state = 'waiting';
let score = 0, wave = 1, kills = 0, killGoal = 8, health = 100, armor = 0;
let curWeapon = 'pistol', weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
let lastShot = 0, gunRecoil = 0, muzzleFlash = 0, gunBob = 0;
let zombies = [], particles = [], powerups = [];
let dmgFlash = 0, screenShake = 0;
let spawnTimer = 0, spawnInterval = 1800, spawnBudget = 0;
let mouse = {x:0, y:0};
let mouseDown = false;
let lastTime = 0;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cx = W / 2;
  cy = H / 2;
  horizonY = H * 0.38;
}
window.addEventListener('resize', resize);
resize();

function proj(wx, wy, wz) {
  if (wz < NEAR) wz = NEAR;
  const s = (H * 0.5) / (wz * Math.tan(FOV / 2));
  return { x: cx + wx * s, y: horizonY - wy * s, s };
}

function init() {
  score = 0; wave = 1; kills = 0; killGoal = 8;
  health = 100; armor = 0;
  curWeapon = 'pistol';
  weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
  lastShot = 0; gunRecoil = 0; muzzleFlash = 0; gunBob = 0;
  zombies = []; particles = []; powerups = [];
  dmgFlash = 0; screenShake = 0;
  spawnTimer = 0; spawnInterval = 1800; spawnBudget = 0;
  state = 'playing';
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
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0010');
    g.addColorStop(0.4, '#1a0030');
    g.addColorStop(1, '#0f0f1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function getZombieSprite(type) {
  switch(type) {
    case 'runner': return IMG.zombie_runner;
    case 'tank': return IMG.zombie_tank;
    case 'exploder': return IMG.zombie_exploder;
    default: return IMG.zombie_walker;
  }
}

function drawZombie(z) {
  const p = proj(z.x, 0, z.z);
  const topP = proj(z.x, ZOMBIE_H, z.z);
  const screenH = p.y - topP.y;
  const screenW = screenH * 0.6;
  if (p.x < -screenW || p.x > W + screenW || screenH < 2) return;

  const sprite = getZombieSprite(z.type);
  const bob = Math.sin(z.wobble) * screenH * 0.02;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 4, screenW * 0.5, screenW * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (sprite && sprite.complete) {
    ctx.save();
    if (z.flash > 0) {
      ctx.globalAlpha = 0.7;
      ctx.filter = 'brightness(3)';
    }
    ctx.drawImage(sprite, p.x - screenW / 2, topP.y + bob, screenW, screenH);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    ctx.fillStyle = z.flash > 0 ? '#fff' : '#1a3a1a';
    ctx.fillRect(p.x - screenW / 2, topP.y + bob, screenW, screenH);
  }

  // Health bar
  if (z.hp < z.maxHp) {
    const bw = screenW * 0.8;
    const barY = topP.y + bob - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(p.x - bw / 2 - 1, barY - 1, bw + 2, 7);
    ctx.fillStyle = '#f00';
    ctx.fillRect(p.x - bw / 2, barY, bw * (z.hp / z.maxHp), 5);
  }

  // Glowing eyes
  const eyeY = topP.y + screenH * 0.15 + bob;
  const eyeR = Math.max(2, screenW * 0.04);
  ctx.fillStyle = '#f00';
  ctx.shadowColor = '#f00'; ctx.shadowBlur = eyeR * 4;
  ctx.beginPath();
  ctx.arc(p.x - screenW * 0.1, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(p.x + screenW * 0.1, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPowerup(pu) {
  const p = proj(pu.x, 1.5 + Math.sin(Date.now() * 0.004) * 0.5, pu.z);
  const sz = Math.max(10, p.s * 2.5);
  const cols = { health:'#0f0', armor:'#07f', shotgun:'#f80', rifle:'#0ff', rocket:'#f44', nuke:'#ff0' };
  const col = cols[pu.type] || '#fff';
  ctx.shadowColor = col; ctx.shadowBlur = 20;
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(p.x, p.y, sz * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(10, sz * 0.8)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const labels = { health:'+', armor:'A', shotgun:'SG', rifle:'RF', rocket:'RL', nuke:'☢' };
  ctx.fillText(labels[pu.type] || '?', p.x, p.y);
}

function drawGun() {
  const w = WEAPONS[curWeapon];
  const bobX = Math.sin(gunBob) * 4;
  const bobY = Math.abs(Math.cos(gunBob)) * 3;
  const kickY = gunRecoil * 12;

  if (IMG.player && IMG.player.complete) {
    const spriteH = H * 0.5;
    const spriteW = spriteH * (IMG.player.width / IMG.player.height);
    const px = cx - spriteW / 2 + bobX;
    const py = H - spriteH + kickY + bobY + 20;
    ctx.drawImage(IMG.player, px, py, spriteW, spriteH);
  } else {
    const baseX = cx + bobX;
    const baseY = H - kickY + bobY;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-130, -80, 55, 90);
    ctx.fillRect(65, -80, 55, 90);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(-18, -130, 36, 100);
    ctx.restore();
  }

  if (muzzleFlash > 0) {
    const mfX = cx + bobX;
    const mfY = H * 0.42;
    const mfSize = 40 + (curWeapon === 'rocket' ? 60 : curWeapon === 'shotgun' ? 45 : 15);
    ctx.globalAlpha = muzzleFlash;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = w.col; ctx.shadowBlur = 60;
    ctx.beginPath();
    ctx.arc(mfX, mfY, mfSize * muzzleFlash, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = w.col;
    ctx.beginPath();
    ctx.arc(mfX, mfY, mfSize * muzzleFlash * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function drawHUD() {
  const w = WEAPONS[curWeapon];
  const pad = 20;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(pad, H - 65, 230, 50);
  ctx.strokeStyle = 'rgba(0,255,0,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(pad, H - 65, 230, 50);

  ctx.fillStyle = '#300';
  ctx.fillRect(pad + 50, H - 55, 160, 14);
  ctx.fillStyle = health > 30 ? '#0f0' : '#f00';
  ctx.shadowColor = health > 30 ? '#0f0' : '#f00'; ctx.shadowBlur = 8;
  ctx.fillRect(pad + 50, H - 55, 160 * (health / 100), 14);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
  ctx.fillText(`HP`, pad + 10, H - 44);
  ctx.fillText(`${Math.ceil(health)}`, pad + 55, H - 44);

  if (armor > 0) {
    ctx.fillStyle = '#003';
    ctx.fillRect(pad + 50, H - 36, 160, 10);
    ctx.fillStyle = '#07f';
    ctx.fillRect(pad + 50, H - 36, 160 * (armor / 100), 10);
    ctx.fillStyle = '#aaf'; ctx.font = 'bold 10px monospace';
    ctx.fillText(`ARM`, pad + 10, H - 28);
  }

  const ammoTxt = weaponAmmo[curWeapon] === Infinity ? '∞' : weaponAmmo[curWeapon];
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(W - 210 - pad, H - 65, 210, 50);
  ctx.strokeStyle = `${w.col}44`;
  ctx.strokeRect(W - 210 - pad, H - 65, 210, 50);
  ctx.fillStyle = w.col; ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${w.name}`, W - pad - 15, H - 45);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace';
  ctx.shadowColor = w.col; ctx.shadowBlur = 10;
  ctx.fillText(`${ammoTxt}`, W - pad - 15, H - 22);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(cx - 140, 10, 280, 45);
  ctx.strokeStyle = 'rgba(0,255,0,0.2)';
  ctx.strokeRect(cx - 140, 10, 280, 45);
  ctx.fillStyle = '#0f0'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#0f0'; ctx.shadowBlur = 10;
  ctx.fillText(`WAVE ${wave}`, cx, 32);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ccc'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`SCORE: ${score}   KILLS: ${kills}/${killGoal}`, cx, 48);
  ctx.textAlign = 'left';

  const invW = 42;
  const invStart = cx - (WEAPON_ORDER.length * invW) / 2;
  WEAPON_ORDER.forEach((wk, i) => {
    const wx = invStart + i * invW;
    const active = wk === curWeapon;
    const hasAmmo = weaponAmmo[wk] > 0 || weaponAmmo[wk] === Infinity;
    ctx.fillStyle = active ? 'rgba(0,255,0,0.2)' : 'rgba(0,0,0,0.5)';
    ctx.fillRect(wx, H - 95, invW - 4, 26);
    if (active) {
      ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2;
      ctx.shadowColor = '#0f0'; ctx.shadowBlur = 6;
      ctx.strokeRect(wx, H - 95, invW - 4, 26);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = hasAmmo ? '#fff' : '#444'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, wx + (invW - 4) / 2, H - 78);
    ctx.textAlign = 'left';
  });

  const chSize = 16;
  ctx.strokeStyle = 'rgba(0,255,0,0.9)'; ctx.lineWidth = 2;
  ctx.shadowColor = '#0f0'; ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(mouse.x - chSize, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
  ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + chSize, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - chSize); ctx.lineTo(mouse.x, mouse.y
