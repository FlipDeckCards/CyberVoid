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

// ── EMAIL SYNC (optional cross-device callsign) ──  ◄ NEW
let playerEmail = localStorage.getItem('dz_email') || '';

window.addEventListener('DOMContentLoaded', function() {
  var emailInput = document.getElementById('emailInput');
  var nameInput = document.getElementById('nameInput');
  if (emailInput && playerEmail) {
    emailInput.value = playerEmail;
    fetch('/api/get-callsign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: playerEmail })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.callsign && nameInput) {
        nameInput.value = data.callsign;
      }
    })
    .catch(function(){});
  }
});

// ── MOBILE DETECTION ──
var mobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

if (mobileDevice && screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('landscape').catch(function(){});
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
const ATTACK_RANGE = 22;
const CAM_H = 10;
const GROUND_CLAMP = 0.50;

// ── WEAPONS (buffed ~1.5-1.7x) ──
const WEAPONS = {
  pistol:  { name:'PISTOL',  dmg:34,  rate:320,  spread:0,    pellets:1, auto:false, col:'#0f0',  recoil:6 },
  shotgun: { name:'SHOTGUN', dmg:70,  rate:700,  spread:0.13, pellets:6, auto:false, col:'#f80',  recoil:14 },
  rifle:   { name:'RIFLE',   dmg:55,  rate:90,   spread:0.03, pellets:1, auto:true,  col:'#0ff',  recoil:3 },
  rocket:  { name:'ROCKET',  dmg:260, rate:1100, spread:0,    pellets:1, auto:false, col:'#f44',  recoil:20, explosive:true }
};
const WEAPON_ORDER = ['pistol','rifle','shotgun','rocket'];

// ── ENEMY CONFIG ──
const ENEMY_GLOW = {
  sentinel: '#0ff',
  phantom:  '#0f0',
  titan:    '#f0f',
  scorch:   '#f80'
};

// ── PER-ENEMY HITBOXES ──
const ENEMY_HITBOXES = {
  scorch: [
    { ox: 0,    oy: 0,     r: 0.25, critical: true,  mult: 1.0   },
    { ox: 0,    oy: 0,     r: 0.45, critical: false, mult: 0.333 }
  ],
  sentinel: [
    { ox: 0,    oy: 0,     r: 0.22, critical: true,  mult: 1.0   },
    { ox:-0.55, oy: 0,     r: 0.22, critical: false, mult: 0.333 },
    { ox: 0.55, oy: 0,     r: 0.22, critical: false, mult: 0.333 }
  ],
  phantom: [
    { ox: 0,    oy:-0.05,  r: 0.16, critical: true,  mult: 1.0   },
    { ox:-0.35, oy: 0,     r: 0.15, critical: false, mult: 0.333 },
    { ox: 0.35, oy: 0,     r: 0.15, critical: false, mult: 0.333 },
    { ox:-0.62, oy: 0.02,  r: 0.12, critical: false, mult: 0.333 },
    { ox: 0.62, oy: 0.02,  r: 0.12, critical: false, mult: 0.333 }
  ],
  titan: [
    { ox: 0,    oy:-0.35,  r: 0.12, critical: true,  mult: 1.0   },
    { ox: 0,    oy:-0.12,  r: 0.14, critical: true,  mult: 1.0   },
    { ox:-0.32, oy:-0.18,  r: 0.14, critical: false, mult: 0.333 },
    { ox: 0.32, oy:-0.18,  r: 0.14, critical: false, mult: 0.333 },
    { ox:-0.28, oy: 0.08,  r: 0.13, critical: false, mult: 0.333 },
    { ox: 0.28, oy: 0.08,  r: 0.13, critical: false, mult: 0.333 },
    { ox:-0.22, oy: 0.30,  r: 0.14, critical: false, mult: 0.333 },
    { ox: 0,    oy: 0.25,  r: 0.14, critical: false, mult: 0.333 },
    { ox: 0.22, oy: 0.30,  r: 0.14, critical: false, mult: 0.333 }
  ]
};

// ── MOBILE CONTROLS STATE ──
var joystick = {
  active: false,
  touchId: null,
  baseX: 0, baseY: 0,
  thumbX: 0, thumbY: 0,
  dx: 0, dy: 0,
  baseRadius: 55,
  thumbRadius: 22,
  maxDist: 45
};
var fireBtn = {
  active: false,
  touchId: null,
  x: 0, y: 0,
  radius: 42
};
var AIM_SPEED = 1.5;

function updateMobileLayout() {
  fireBtn.x = W - 90;
  fireBtn.y = H - 175;
}

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

// ── DAMAGE NUMBERS ──
var damageNumbers = [];

// ── RESIZE ──
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cx = W / 2; cy = H / 2;
  horizonY = H * 0.55;
  roadVPx = W * 0.25;
  updateMobileLayout();
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
        token: sessionToken,
        email: playerEmail  // ◄ NEW
      })
    });
  } catch (e) {}
}

async function checkCallsign(name) {
  try {
    var emailInput = document.getElementById('emailInput');  // ◄ NEW
    var email = (emailInput && emailInput.value.trim()) || '';  // ◄ NEW
    const res = await fetch('/api/check-callsign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callsign: name, token: sessionToken, email: email })  // ◄ CHANGED
    });
    const data = await res.json();
    return data.available;
  } catch (e) {
    return true;
  }
}

leaderboardBox.addEventListener('click', () => {
  GameSound.menuMusicStart();
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
  damageNumbers = [];
  dmgFlash = 0; screenShake = 0;
  spawnTimer = 0; spawnInterval = 1800; spawnBudget = 0;
  spawnBudget = killGoal;
  scoreSubmitted = false;
  state = 'playing';
  if (mobileDevice) {
    mouse.x = cx;
    mouse.y = cy;
  }
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

  var hoverBase;
  var sizeScale;
  switch (type) {
    case 'phantom':  hoverBase = 17.0 + Math.random() * 5.0; sizeScale = 1.0;  break;
    case 'titan':    hoverBase = 1.0 + Math.random() * 1.0; sizeScale = 4/3;  break;
    case 'scorch':   hoverBase = 0.2 + Math.random() * 0.6; sizeScale = 2/3;  break;
    default:         hoverBase = 10.0 + Math.random() * 4.0; sizeScale = 3/4;  break;
  }

  enemies.push({
    x: sp.x + xJitter,
    z: STREET_DEPTH + zJitter,
    type: type, hp: stats.hp, maxhp: stats.hp,
    speed: stats.speed + Math.random() * 0.008,
    points: stats.points, attackDmg: stats.attackDmg,
    flash: 0,
    flashColor: '#fff',
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
  GameSound.powerup();
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
//  PER-ENEMY HITBOX DETECTION
// ═══════════════════════════════════════
function checkHit(aimX, aimY, screenCX, screenCY, projSize, enemyType) {
  var zones = ENEMY_HITBOXES[enemyType] || ENEMY_HITBOXES.sentinel;

  for (var pass = 0; pass < 2; pass++) {
    var wantCritical = (pass === 0);
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (z.critical !== wantCritical) continue;
      var zx = screenCX + z.ox * projSize;
      var zy = screenCY + z.oy * projSize;
      var zr = z.r * projSize;
      var dx = aimX - zx;
      var dy = aimY - zy;
      if (Math.sqrt(dx * dx + dy * dy) < zr) {
        return { hit: true, critical: z.critical, multiplier: z.mult };
      }
    }
  }

  return { hit: false, critical: false, multiplier: 0 };
}

// ═══════════════════════════════════════
//  FLOATING DAMAGE NUMBERS
// ═══════════════════════════════════════
function spawnDamageNumber(x, y, amount, critical) {
  damageNumbers.push({
    x: x + (Math.random() - 0.5) * 20,
    y: y,
    amount: amount,
    critical: critical,
    life: 0.8,
    vy: -80
  });
}

function updateDamageNumbers(dt) {
  for (var i = damageNumbers.length - 1; i >= 0; i--) {
    var d = damageNumbers[i];
    d.y += d.vy * dt;
    d.life -= dt;
    if (d.life <= 0) damageNumbers.splice(i, 1);
  }
}

function drawDamageNumbers() {
  for (var i = 0; i < damageNumbers.length; i++) {
    var d = damageNumbers[i];
    var alpha = Math.max(d.life / 0.8, 0);
    ctx.globalAlpha = alpha;
    ctx.font = d.critical ? 'bold 22px Orbitron' : '16px Orbitron';
    ctx.fillStyle = d.critical ? '#ff0' : '#f80';
    ctx.shadowColor = d.critical ? '#ff0' : '#f80';
    ctx.shadowBlur = d.critical ? 12 : 6;
    ctx.textAlign = 'center';
    ctx.fillText(d.amount, d.x, d.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
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
  GameSound[curWeapon]();

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

      var screenCX = bp.x;
      var screenCY = (tp.y + bp.y) / 2;
      var result = checkHit(aimX, aimY, screenCX, screenCY, sh, e.type);

      if (result.hit) {
        var dmg = w.dmg * result.multiplier;
        e.hp -= dmg;
        e.flash = 0.15;
        e.flashColor = result.critical ? '#ff0' : '#f80';
        spawnSparks(e.x, hoverY + scaledH*0.5, e.z);
        spawnDamageNumber(screenCX, screenCY, Math.round(dmg), result.critical);
        if (result.critical) GameSound.hitCritical(); else GameSound.hitCorner();
        if (w.explosive) {
          screenShake = 0.6;
          enemies.forEach(oe => {
            if (oe === e) return;
            const dist = Math.sqrt((oe.x-e.x)**2 + (oe.z-e.z)**2);
            if (dist < 12) { oe.hp -= w.dmg*(1-dist/12); oe.flash = 0.1; oe.flashColor = '#f44'; }
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
  var scaledH = ENEMY_H * (e.sizeScale || 1);
  var foot = proj(e.x, hoverY, e.z);
  var head = proj(e.x, hoverY + scaledH, e.z);
  var bodyH = foot.y - head.y;
  var bodyW = bodyH * 0.6;
  var ecx = foot.x;

  if (bodyH < 2) return;

  var img = IMG[e.type];
  var glowCol = ENEMY_GLOW[e.type] || '#0ff';

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

  if (drawY < 0) {
    drawH = Math.max(2, drawH + drawY);
    drawW = drawH * aspect;
    drawX = ecx - drawW / 2;
    drawY = 0;
  }

  ctx.save();

  if (img && img.complete && img.naturalWidth > 0) {
    if (e.flash > 0) {
      var flashIntensity = e.flashColor === '#ff0' ? 18 : 10;
      ctx.filter = 'brightness(' + (1 + e.flash * flashIntensity) + ')';
      ctx.shadowColor = e.flashColor || '#fff';
      ctx.shadowBlur = e.flash * 40;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = glowCol;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(ecx, drawY + drawH * 0.5, drawW * 0.4, drawH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

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

// ── Helper: rounded rect path ──  ◄ NEW
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

  // ── Weapon bar — right side stacked ──  ◄ CHANGED
  var isMobileHUD = W < 800;
  var wpW = isMobileHUD ? 52 : 140;
  var wpH = isMobileHUD ? 42 : 46;
  var wpGap = isMobileHUD ? 4 : 6;
  var wpX = W - wpW - (isMobileHUD ? 10 : 20);
  var totalWpH = WEAPON_ORDER.length * wpH + (WEAPON_ORDER.length - 1) * wpGap;
  var wpStartY = isMobileHUD ? 10 : (H - totalWpH) / 2;
  weaponBtnRects = [];

  WEAPON_ORDER.forEach(function(wk, i) {
    var yy = wpStartY + i * (wpH + wpGap);
    var active = wk === curWeapon;
    var hasAmmo = weaponAmmo[wk] > 0 || weaponAmmo[wk] === Infinity;
    var wData = WEAPONS[wk];

    weaponBtnRects.push({ x: wpX, y: yy, w: wpW, h: wpH, weapon: wk });

    ctx.fillStyle = active ? 'rgba(0,255,255,0.1)' : 'rgba(0,0,0,0.55)';
    roundRect(ctx, wpX, yy, wpW, wpH, 6);
    ctx.fill();

    ctx.strokeStyle = active ? wData.col : (hasAmmo ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
    ctx.lineWidth = active ? 2 : 1;
    if (active) { ctx.shadowColor = wData.col; ctx.shadowBlur = 14; }
    roundRect(ctx, wpX, yy, wpW, wpH, 6);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (active) {
      ctx.fillStyle = wData.col;
      ctx.shadowColor = wData.col;
      ctx.shadowBlur = 10;
      roundRect(ctx, wpX, yy + 4, 3, wpH - 8, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (isMobileHUD) {
      ctx.fillStyle = hasAmmo ? (active ? '#fff' : '#888') : '#333';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText(wData.name.slice(0, 3), wpX + wpW / 2, yy + wpH / 2 - 3);
      var ammo = weaponAmmo[wk] === Infinity ? '∞' : weaponAmmo[wk];
      ctx.fillStyle = active ? wData.col : '#555';
      ctx.font = '9px Orbitron';
      ctx.fillText(ammo.toString(), wpX + wpW / 2, yy + wpH / 2 + 12);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = active ? wData.col : 'rgba(255,255,255,0.2)';
      ctx.font = 'bold 10px Orbitron';
      ctx.textAlign = 'left';
      ctx.fillText((i + 1).toString(), wpX + 12, yy + 20);
      ctx.fillStyle = hasAmmo ? (active ? '#fff' : '#aaa') : '#444';
      ctx.font = (active ? 'bold ' : '') + '11px Orbitron';
      ctx.fillText(wData.name, wpX + 28, yy + 20);
      var ammoTxt2 = weaponAmmo[wk] === Infinity ? '∞' : weaponAmmo[wk];
      ctx.fillStyle = active ? wData.col : '#666';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'right';
      ctx.fillText(ammoTxt2.toString(), wpX + wpW - 12, yy + 20);
      ctx.textAlign = 'left';
      if (weaponAmmo[wk] !== Infinity) {
        var maxA = wk === 'shotgun' ? 24 : wk === 'rifle' ? 120 : 12;
        var barW2 = wpW - 24;
        var barH2 = 3;
        var barX2 = wpX + 12;
        var barY2 = yy + wpH - 10;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(barX2, barY2, barW2, barH2);
        var fillR = Math.min(weaponAmmo[wk] / maxA, 1);
        ctx.fillStyle = fillR > 0.25 ? wData.col : '#f00';
        ctx.fillRect(barX2, barY2, barW2 * fillR, barH2);
      }
    }
  });

  // Crosshair
  if (!mobileDevice) {
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
  } else {
    ctx.strokeStyle = 'rgba(0,255,0,0.8)'; ctx.lineWidth = 2;
    ctx.shadowColor = '#0f0'; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(mouse.x-12,mouse.y); ctx.lineTo(mouse.x-4,mouse.y);
    ctx.moveTo(mouse.x+4,mouse.y); ctx.lineTo(mouse.x+12,mouse.y);
    ctx.moveTo(mouse.x,mouse.y-12); ctx.lineTo(mouse.x,mouse.y-4);
    ctx.moveTo(mouse.x,mouse.y+4); ctx.lineTo(mouse.x,mouse.y+12);
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#0f0'; ctx.beginPath();
    ctx.arc(mouse.x,mouse.y,2,0,Math.PI*2); ctx.fill();
  }
}

// ═══════════════════════════════════════
//  MOBILE CONTROLS DRAWING
// ═══════════════════════════════════════
function drawMobileControls() {
  if (!mobileDevice || state !== 'playing') return;

  if (joystick.active) {
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joystick.baseX, joystick.baseY, joystick.baseRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0f0';
    ctx.shadowColor = '#0f0';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(joystick.thumbX, joystick.thumbY, joystick.thumbRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#0f0';
    ctx.fillRect(0, H * 0.3, W * 0.35, H * 0.5);
    ctx.globalAlpha = 0.3;
    ctx.font = '12px monospace';
    ctx.fillStyle = '#0f0';
    ctx.textAlign = 'center';
    ctx.fillText('DRAG TO AIM', W * 0.175, H * 0.55);
    ctx.textAlign = 'left';
  }

  var fbAlpha = fireBtn.active ? 0.6 : 0.35;
  ctx.globalAlpha = fbAlpha;
  ctx.fillStyle = fireBtn.active ? '#f44' : '#f00';
  ctx.shadowColor = '#f00';
  ctx.shadowBlur = fireBtn.active ? 20 : 8;
  ctx.beginPath();
  ctx.arc(fireBtn.x, fireBtn.y, fireBtn.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Orbitron';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FIRE', fireBtn.x, fireBtn.y);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
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
  updateDamageNumbers(dt);
  gunRecoil *= 0.85; muzzleFlash *= 0.8;
  dmgFlash *= 0.92; screenShake *= 0.9;
  if (screenShake < 0.01) screenShake = 0;
  if (enemies.length > 0) gunBob += dt*3;
  if (mouseDown && WEAPONS[curWeapon].auto) shoot();

  if (mobileDevice && joystick.active) {
    mouse.x += joystick.dx * AIM_SPEED;
    mouse.y += joystick.dy * AIM_SPEED;
    if (mouse.x < 20) mouse.x = 20;           // ◄ CHANGED
    if (mouse.x > W - 20) mouse.x = W - 20;   // ◄ CHANGED
    if (mouse.y < 20) mouse.y = 20;            // ◄ CHANGED
    if (mouse.y > H - 60) mouse.y = H - 60;   // ◄ CHANGED
  }

  spawnTimer -= dt*1000;
  if (spawnTimer <= 0 && spawnBudget > 0) {
    spawnEnemy(); spawnBudget--; spawnTimer = spawnInterval;
  }

  if (kills >= killGoal && enemies.length === 0) {
    wave++;
    GameSound.waveComplete();
    kills = 0;
    killGoal = Math.floor(8+wave*3);
    spawnBudget = killGoal;
    spawnInterval = Math.max(400, 1800-wave*100);
    spawnTimer = 500;
  } else if (spawnBudget <= 0 && enemies.length === 0 && kills < killGoal) {
    spawnBudget = killGoal-kills; spawnTimer = 200;
  }

  enemies.forEach(e => {
    e.z -= e.speed * dt * 60;
    var bobSpeed = e.type === 'phantom' ? 5 : e.type === 'scorch' ? 7 : e.type === 'titan' ? 2.5 : 3.5;
    e.hoverPhase += dt * bobSpeed;
    e.wobble += dt * (e.type === 'phantom' ? 12 : 6);
    if (e.z < 40) {
      var swoopFactor = 1 - ((40 - e.z) / 40);
      var minHover = 2.0;
      e.hoverBase = minHover + (e.hoverBase - minHover) * Math.max(swoopFactor, 0.15);
    }
    var progress = Math.max(0, 1 - (e.z / STREET_DEPTH));
    var spreadTarget = e.spawnX * (0.3 + progress * 0.7);
    var driftSpeed = 0.03 * dt * 60;
    if (e.x < spreadTarget - 0.1) e.x += driftSpeed;
    else if (e.x > spreadTarget + 0.1) e.x -= driftSpeed;
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
      GameSound.enemyDeath();
      const p = proj(e.x, e.hoverBase, e.z);
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
    GameSound.gameOver();
    GameSound.musicStop();
    GameSound.menuMusicStart(); // ◄ NEW
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
    drawDamageNumbers();
    drawFog();
    drawRain();
    drawGun();
    if (dmgFlash > 0) {
      ctx.fillStyle = 'rgba(255,0,0,'+dmgFlash*0.4+')';
      ctx.fillRect(0,0,W,H);
    }
    drawHUD();
    drawMobileControls();
  }

  ctx.restore();
  requestAnimationFrame(draw);
}

// ═══════════════════════════════════════
//  INPUT — Desktop (Mouse + Keyboard)
// ═══════════════════════════════════════
canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
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
  var num = parseInt(e.key);
  if (num >= 1 && num <= 4) {
    var wk = WEAPON_ORDER[num - 1];
    if (weaponAmmo[wk] > 0 || weaponAmmo[wk] === Infinity) curWeapon = wk;
  }
});

// ═══════════════════════════════════════
//  INPUT — Mobile (Joystick + Fire Button)
// ═══════════════════════════════════════
var weaponBtnRects = [];

function hitTestWeaponButton(tx, ty) {
  for (var i = 0; i < weaponBtnRects.length; i++) {
    var r = weaponBtnRects[i];
    if (tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h) {
      return r.weapon;
    }
  }
  return null;
}

function hitTestFireBtn(tx, ty) {
  var dx = tx - fireBtn.x;
  var dy = ty - fireBtn.y;
  return Math.sqrt(dx * dx + dy * dy) < fireBtn.radius + 15;
}

function isLeftSide(tx) {
  return tx < W * 0.4;
}

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  if (state !== 'playing') return;

  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var rect = canvas.getBoundingClientRect();
    var tx = (t.clientX - rect.left) * (canvas.width / rect.width);
    var ty = (t.clientY - rect.top) * (canvas.height / rect.height);

    var wpnHit = hitTestWeaponButton(tx, ty);
    if (wpnHit) {
      if (weaponAmmo[wpnHit] > 0 || weaponAmmo[wpnHit] === Infinity) curWeapon = wpnHit;
      continue;
    }

    if (hitTestFireBtn(tx, ty)) {
      fireBtn.active = true;
      fireBtn.touchId = t.identifier;
      mouseDown = true;
      shoot();
      continue;
    }

    if (isLeftSide(tx) && !joystick.active) {
      joystick.active = true;
      joystick.touchId = t.identifier;
      joystick.baseX = tx;
      joystick.baseY = ty;
      joystick.thumbX = tx;
      joystick.thumbY = ty;
      joystick.dx = 0;
      joystick.dy = 0;
      continue;
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];

    if (t.identifier === joystick.touchId && joystick.active) {
      var rect = canvas.getBoundingClientRect();
      var dx = (t.clientX - rect.left) * (canvas.width / rect.width) - joystick.baseX;
      var dy = (t.clientY - rect.top) * (canvas.height / rect.height) - joystick.baseY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > joystick.maxDist) {
        dx = dx / dist * joystick.maxDist;
        dy = dy / dist * joystick.maxDist;
        dist = joystick.maxDist;
      }
      joystick.thumbX = joystick.baseX + dx;
      joystick.thumbY = joystick.baseY + dy;
      joystick.dx = dx / joystick.maxDist;
      joystick.dy = dy / joystick.maxDist;
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === joystick.touchId) {
      joystick.active = false;
      joystick.touchId = null;
      joystick.dx = 0;
      joystick.dy = 0;
    }
    if (t.identifier === fireBtn.touchId) {
      fireBtn.active = false;
      fireBtn.touchId = null;
      mouseDown = false;
    }
  }
}, { passive: false });

canvas.addEventListener('touchcancel', function(e) {
  joystick.active = false;
  joystick.touchId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  fireBtn.active = false;
  fireBtn.touchId = null;
  mouseDown = false;
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

  // Save email if provided  ◄ NEW
  var emailInput = document.getElementById('emailInput');
  var email = (emailInput && emailInput.value.trim()) || '';
  if (email) {
    playerEmail = email;
    localStorage.setItem('dz_email', email);
  }

  GameSound.menuMusicStop(); // ◄ NEW
  GameSound.gameStart();
  GameSound.musicStart();
  playerName = name.toUpperCase();
  startScreen.style.display = 'none';
  canvas.style.cursor = mobileDevice ? 'default' : 'none';
  init();
});

restartBtn.addEventListener('click', () => {
  GameSound.menuMusicStop(); // ◄ NEW
  GameSound.gameStart();
  GameSound.musicStart();
  gameOverScreen.style.display = 'none';
  canvas.style.cursor = mobileDevice ? 'default' : 'none';
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
  GameSound.menuMusicStart(); // ◄ NEW
});

fetchLeaderboard();

requestAnimationFrame(draw);
