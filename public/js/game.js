// ═══════════════════════════════════════════════════════════
// DEADZONE — First-Person Cyberpunk Robot Survival
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const mainMenuBtn = document.getElementById('mainMenuBtn');
const leaderboardBox = document.getElementById('leaderboardBox');
const leaderboardList = document.getElementById('leaderboardList');
const callsignError = document.getElementById('callsignError');

// ── SESSION TOKEN (for callsign ownership) ──
let sessionToken = localStorage.getItem('dz_session');
if (!sessionToken) {
  sessionToken = 'dz_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
  localStorage.setItem('dz_session', sessionToken);
}

// ── IMAGE LOADING ──
const IMG = {};
const imgSources = {
  bg: '/assets/city_bg.png',
  fog: '/assets/fog.png',
  gun_pistol: '/assets/pistol.png',
  gun_shotgun: '/assets/shotgun.png',
  gun_rifle: '/assets/rifle.png',
  gun_rocket: '/assets/rocket.png',
  sentinel: '/assets/sentinel.png',
  phantom: '/assets/phantom.png',
  titan: '/assets/titan.png',
  scorch: '/assets/scorch.png'
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
const ENEMY_H = 6.4;
const ATTACK_RANGE = 8;
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

// ── ENEMY CONFIG ──
const ENEMY_GLOW = {
  sentinel: '#0ff',
  phantom:  '#0f0',
  titan:    '#f0f',
  scorch:   '#f80'
};

// ── STATE ──
let W, H, cx, cy, horizonY, roadVPx;
let state = 'waiting';
let playerName = 'OPERATOR';
let score = 0, wave = 1, kills = 0, killGoal = 8, health = 100, armor = 0;
let curWeapon = 'pistol';
let weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
let lastShot = 0, gunRecoil = 0, muzzleFlash = 0, gunBob = 0;
let enemies = [], particles = [], powerups = [];
let dmgFlash = 0, screenShake = 0;
let spawnTimer = 0, spawnInterval = 1800, spawnBudget = 0;
let mouse = { x:0, y:0 };
let mouseDown = false;
let lastTime = 0;
let scoreSubmitted = false;

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

// ═══════════════════════════════════════
//  LEADERBOARD
// ═══════════════════════════════════════
async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    leaderboardList.innerHTML = '<div class="lb-empty">SIGNAL LOST</div>';
  }
}

function renderLeaderboard(entries) {
  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="lb-empty">NO OPERATORS YET — BE THE FIRST</div>';
    return;
  }
  let html = '<div class="lb-header"><span class="lb-rank"></span><span class="lb-name">CALLSIGN</span><span class="lb-score">SCORE</span><span class="lb-wave">WAVE</span><span class="lb-kills">KILLS</span></div>';
  html += entries.map((e, i) => `
    <div class="lb-entry">
      <span class="lb-rank">#${i + 1}</span>
      <span class="lb-name">${e.callsign}</span>
      <span class="lb-score">${e.score}</span>
      <span class="lb-wave">W${e.wave}</span>
      <span class="lb-kills">${e.kills}</span>
    </div>
  `).join('');
  leaderboardList.innerHTML = html;
}

async function submitScore() {
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  try {
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callsign: playerName,
        score,
        wave,
        kills,
        token: sessionToken
      })
    });
  } catch (e) {}
}

async function checkCallsign(name) {
  try {
    const res = await fetch('/api/check-callsign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign: name, token: sessionToken })
    });
    const data = await res.json();
    return data.available;
  } catch (e) {
    return true;
  }
}

leaderboardBox.addEventListener('click', () => {
  leaderboardList.classList.toggle('open');
  const title = leaderboardBox.querySelector('.lb-title');
  if (leaderboardList.classList.contains('open')) {
    title.textContent = '▼ TOP OPERATORS';
    fetchLeaderboard();
  } else {
    title.textContent = '▶ TOP OPERATORS';
  }
});

// ── INIT GAME ──
function init() {
  score = 0; wave = 1; kills = 0; killGoal = 8;
  health = 100; armor = 0;
  curWeapon = 'pistol';
  weaponAmmo = { pistol:Infinity, shotgun:0, rifle:0, rocket:0 };
  lastShot = 0; gunRecoil = 0; muzzleFlash = 0; gunBob = 0;
  enemies = []; particles = []; powerups = [];
  dmgFlash = 0; screenShake = 0;
  spawnTimer = 0; spawnInterval = 1800; spawnBudget = 0;
  spawnBudget = killGoal;
  scoreSubmitted = false;
  state = 'playing';
  initRain();
}

// ═══════════════════════════════════════
//  ENEMY TYPES
// ═══════════════════════════════════════
function enemyStats(type, w) {
  const s = 1 + w * 0.08;
  const spd = 1 + w * 0.12;
  switch (type) {
    case 'phantom':  return { hp:40*s,  speed:0.16*spd, points:15, attackDmg:8 };
    case 'titan':    return { hp:200*s, speed:0.05*spd, points:40, attackDmg:20 };
    case 'scorch':   return { hp:60*s,  speed:0.10*spd, points:25, attackDmg:35 };
    default:         return { hp:80*s,  speed:0.08*spd, points:10, attackDmg:12 };
  }
}

function pickEnemyType(w) {
  if (w < 2) return 'sentinel';
  const r = Math.random();
  if (w >= 5 && r < 0.1) return 'titan';
  if (w >= 3 && r < 0.3) return 'scorch';
  if (r < 0.5) return 'phantom';
  return 'sentinel';
}

function spawnEnemy() {
  var type = pickEnemyType(wave);
  var stats = enemyStats(type, wave);
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

  // Flying height — each type hovers at a different base altitude
  var hoverBase;
  switch (type) {
    case 'phantom':  hoverBase = 7.0 + Math.random() * 3.0; sizeScale = 1.0;  break;
      case 'titan':    hoverBase = 1.0 + Math.random() * 1.0; sizeScale = 4/3;  break;
      case 'scorch':   hoverBase = 0.2 + Math.random() * 0.6; sizeScale = 2/3;  break;
      default:         hoverBase = 1.8 + Math.random() * 1.5; sizeScale = 3/4;  break;
  }

  enemies.push({
    x: sp.x + xJitter,
    z: STREET_DEPTH + zJitter,
    type: type, hp: stats.hp, maxhp: stats.hp,
    speed: stats.speed + Math.random() * 0.008,
    points: stats.points, attackDmg: stats.attackDmg,
    flash: 0,
    wobble: Math.random() * Math.PI * 2,
    hoverBase: hoverBase,
    hoverPhase: Math.random() * Math.PI * 2,
    attackCooldown: 0,
    spawnX: sp.x + xJitter,
    sizeScale: sizeScale
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

function spawnSparks(wx, wy, wz) {
  const p = proj(wx, wy, wz);
  const col = '#ff0';
  spawnParticle(p.x, p.y, col, 6);
  spawnParticle(p.x, p.y, '#fff', 4);
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
      enemies.forEach(e => {
        const p = proj(e.x, e.hoverBase, e.z);
        spawnParticle(p.x, p.y, '#ff0', 15);
        score += e.points; kills++;
      });
      enemies = [];
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
    const sorted = [...enemies].sort((a,b) => a.z - b.z);
    for (const e of sorted) {
      const hoverY = e.hoverBase + Math.sin(e.hoverPhase) * 0.8;
      const scaledH = ENEMY_H * (e.sizeScale || 1);
      const bp = proj(e.x, hoverY, e.z);
      const tp = proj(e.x, hoverY + scaledH, e.z);
      const sh = bp.y - tp.y;
      const sw = sh * 0.6;
      if (aimX > bp.x-sw/2 && aimX < bp.x+sw/2 && aimY > tp.y && aimY < bp.y) {
        let dmg = w.dmg;
        if (aimY < tp.y + sh*0.3) dmg *= 2; // headshot
        e.hp -= dmg;
        e.flash = 0.15;
        spawnSparks(e.x, hoverY + ENEMY_H*0.5, e.z);
        if (w.explosive) {
          screenShake = 0.6;
          enemies.forEach(oe => {
            if (oe === e) return;
            const dist = Math.sqrt((oe.x-e.x)**2 + (oe.z-e.z)**2);
            if (dist < 12) { oe.hp -= w.dmg*(1-dist/12); oe.flash = 0.1; }
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

// ========== ENEMY DRAWING ==========
function drawEnemy(e) {
  var hoverY = e.hoverBase + Math.sin(e.hoverPhase) * 0.8;
  var foot = proj(e.x, hoverY, e.z);
  var scaledH = ENEMY_H * (e.sizeScale || 1);
  var head = proj(e.x, hoverY + scaledH, e.z);
  var bodyH = foot.y - head.y;
  var bodyW = bodyH * 0.6;
  var ecx = foot.x;

  if (bodyH < 2) return;

  var img = IMG[e.type];
  var glowCol = ENEMY_GLOW[e.type] || '#0ff';

  // Shadow on ground (faint — they're flying)
  var ground = proj(e.x, 0, e.z);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y + 2, bodyW * 0.4, bodyH * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();

  var drawH = Math.min(bodyH, H * 0.45);
  var aspect = (img && img.complete && img.naturalWidth > 0) ? img.naturalWidth / img.naturalHeight : 1;
  var drawW = drawH * aspect;
  var drawX = ecx - drawW / 2;
  var drawY = head.y;

  // Clamp to screen
  if (drawY < 0) {
    drawH = Math.max(2, drawH + drawY);
    drawW = drawH * aspect;
    drawX = ecx - drawW / 2;
    drawY = 0;
  }

  ctx.save();

  if (img && img.complete && img.naturalWidth > 0) {
    // Hit flash — brighten the sprite itself, no overlay box
    if (e.flash > 0) {
      ctx.filter = 'brightness(' + (1 + e.flash * 15) + ') saturate(0)';
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = glowCol;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(ecx, drawY + drawH * 0.5, drawW * 0.4, drawH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Health bar
  if (e.hp < e.maxhp) {
    var barW = bodyW * 0.9;
    var barH = Math.max(2, bodyH * 0.03);
    var barY = head.y - barH - 5;
    if (barY < 0) barY = drawY + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(ecx - barW / 2, barY, barW, barH);
    ctx.fillStyle = e.hp / e.maxhp > 0.5 ? '#0f0' : e.hp / e.maxhp > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(ecx - barW / 2, barY, barW * (e.hp / e.maxhp), barH);
  }

  // Type label
  if (bodyH > 30) {
    ctx.globalAlpha = Math.min(1, (bodyH - 30) / 60);
    ctx.fillStyle = glowCol;
    ctx.font = 'bold ' + Math.max(9, Math.floor(bodyH * 0.06)) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e.type.toUpperCase(), ecx, (barY || head.y) - 8);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

function drawPowerup(pu) {
  const p = proj(pu.x, 1.5+Math.sin(Date.now()*0.004)*0.5, pu.z);
  const sz = Math.max(4, p.s * 0.83);
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
  var bobX = Math.sin(gunBob) * 8;
  var bobY = Math.abs(Math.cos(gunBob)) * 5;
  var kickY = gunRecoil * 35;
  var kickRot = gunRecoil * 0.06;

  var gunConfig = {
    pistol:  { rot: 0,    flipX: false },
    shotgun: { rot: 0.35, flipX: false },
    rifle:   { rot: 0.45, flipX: false },
    rocket:  { rot: 0.45, flipX: false }
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
  if (enemies.length > 0) gunBob += dt*3;
  if (mouseDown && WEAPONS[curWeapon].auto) shoot();

  spawnTimer -= dt*1000;
  if (spawnTimer <= 0 && spawnBudget > 0) {
    spawnEnemy(); spawnBudget--; spawnTimer = spawnInterval;
  }

  if (kills >= killGoal && enemies.length === 0) {
    wave++; kills = 0;
    killGoal = Math.floor(8+wave*3);
    spawnBudget = killGoal;
    spawnInterval = Math.max(400, 1800-wave*100);
    spawnTimer = 500;
  } else if (spawnBudget <= 0 && enemies.length === 0 && kills < killGoal) {
    spawnBudget = killGoal-kills; spawnTimer = 200;
  }

  enemies.forEach(e => {
    e.z -= e.speed * dt * 60;

    // Hover bob animation
    var bobSpeed = e.type === 'phantom' ? 5 : e.type === 'scorch' ? 7 : e.type === 'titan' ? 2.5 : 3.5;
    e.hoverPhase += dt * bobSpeed;

    e.wobble += dt * (e.type === 'phantom' ? 12 : 6);

    var progress = Math.max(0, 1 - (e.z / STREET_DEPTH));
    var spreadTarget = e.spawnX * (0.3 + progress * 0.7);
    var driftSpeed = 0.03 * dt * 60;
    if (e.x < spreadTarget - 0.1) e.x += driftSpeed;
    else if (e.x > spreadTarget + 0.1) e.x -= driftSpeed;

    // Lateral sway
    e.x += Math.sin(e.wobble * 0.5) * 0.015;

    if (e.flash > 0) e.flash -= dt;

    if (e.z <= ATTACK_RANGE) {
      e.attackCooldown -= dt;
      if (e.attackCooldown <= 0) {
        let dmg = e.attackDmg;
        if (armor > 0) { const ab = Math.min(armor,dmg*0.6); armor -= ab; dmg -= ab; }
        health -= dmg; dmgFlash = 1; screenShake = 0.4; e.attackCooldown = 1;
        if (e.type === 'scorch') {
          e.hp = 0;
          const p = proj(e.x, e.hoverBase, e.z);
          spawnParticle(p.x, p.y, '#f80', 25);
          spawnParticle(p.x, p.y, '#ff0', 15);
          spawnParticle(p.x, p.y, '#fff', 8);
          screenShake = 0.8;
        }
      }
      e.z = ATTACK_RANGE;
    }
  });

  enemies = enemies.filter(e => {
    if (e.hp <= 0) {
      score += e.points; kills++;
      const p = proj(e.x, e.hoverBase, e.z);
      // Sparks + type-colored explosion
      spawnParticle(p.x, p.y, '#fff', 8);
      spawnParticle(p.x, p.y, ENEMY_GLOW[e.type] || '#0ff', 10);
      spawnParticle(p.x, p.y, '#ff0', 5);
      if (e.type === 'scorch') {
        enemies.forEach(oe => {
          if (oe === e) return;
          const dist = Math.sqrt((oe.x-e.x)**2+(oe.z-e.z)**2);
          if (dist < 10) oe.hp -= 50;
        });
        screenShake = 0.6;
      }
      maybeDropPowerup(e.x, e.z);
      return false;
    }
    return true;
  });

  particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.3; p.life-=dt; });
  particles = particles.filter(p => p.life>0);

  powerups.forEach(pu => {
    pu.life -= dt;
    pu.z -= dt * 10;
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
    submitScore();
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
    enemies.sort((a,b) => b.z-a.z);
    enemies.forEach(drawEnemy);
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
startBtn.addEventListener('click', async () => {
  const nameInput = document.getElementById('nameInput');
  const name = (nameInput && nameInput.value.trim()) || '';

  if (!name) {
    callsignError.textContent = 'ENTER A CALLSIGN, OPERATOR';
    return;
  }

  const available = await checkCallsign(name);
  if (!available) {
    callsignError.textContent = 'CALLSIGN TAKEN — CHOOSE ANOTHER';
    return;
  }

  callsignError.textContent = '';
  playerName = name.toUpperCase();
  startScreen.style.display = 'none';
  canvas.style.cursor = 'none';
  init();
});

restartBtn.addEventListener('click', () => {
  gameOverScreen.style.display = 'none';
  canvas.style.cursor = 'none';
  init();
});

mainMenuBtn.addEventListener('click', () => {
  gameOverScreen.style.display = 'none';
  state = 'waiting';
  startScreen.style.display = 'flex';
  canvas.style.cursor = 'default';
  fetchLeaderboard();
  leaderboardList.classList.add('open');
  const title = leaderboardBox.querySelector('.lb-title');
  title.textContent = '▼ TOP OPERATORS';
});

// ── LOAD LEADERBOARD ON PAGE LOAD ──
fetchLeaderboard();

// ── START RENDER LOOP ──
requestAnimationFrame(draw);
