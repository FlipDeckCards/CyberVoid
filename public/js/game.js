// === DEADZONE — Wave Zombie Shooter ===

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const nameInput = document.getElementById('nameInput');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const goTitle = document.getElementById('goTitle');
const goWave = document.getElementById('goWave');
const goScore = document.getElementById('goScore');
const goRank = document.getElementById('goRank');
const leaderboardList = document.getElementById('leaderboardList');

gameOverScreen.style.display = 'none';

// === ASSET LOADING ===
const IMG = {};
let assetsReady = false;

function loadImages(cb) {
  const srcs = {
    player: '/assets/player.png',
    walker: '/assets/zombie_walker.png',
    runner: '/assets/zombie_runner.png',
    exploder: '/assets/zombie_exploder.png',
    tank: '/assets/zombie_tank.png',
    city: '/assets/city_bg.png',
  };
  const keys = Object.keys(srcs);
  let count = 0;
  keys.forEach((k) => {
    IMG[k] = new Image();
    IMG[k].onload = IMG[k].onerror = () => {
      count++;
      if (count === keys.length) { assetsReady = true; cb(); }
    };
    IMG[k].src = srcs[k];
  });
}

// === CONFIG ===
const ZOMBIE_TYPES = {
  walker:   { hp: 40,  speed: 1.2, damage: 10, radius: 14, color: '#00ff66', points: 10,  sprite: 'walker' },
  runner:   { hp: 25,  speed: 2.8, damage: 8,  radius: 10, color: '#ffff00', points: 15,  sprite: 'runner' },
  exploder: { hp: 35,  speed: 1.6, damage: 20, radius: 13, color: '#ff8800', points: 20,  sprite: 'exploder', explodeRadius: 80 },
  tank:     { hp: 120, speed: 0.7, damage: 30, radius: 22, color: '#ff0044', points: 35,  sprite: 'tank' },
};

const WEAPONS = {
  pistol:  { damage: 18, fireRate: 280, speed: 12, radius: 3, color: '#0ff',    spread: 0,    count: 1, ammo: Infinity },
  shotgun: { damage: 12, fireRate: 550, speed: 10, radius: 3, color: '#f0f',    spread: 0.3,  count: 5, ammo: 24 },
  rifle:   { damage: 14, fireRate: 90,  speed: 16, radius: 2, color: '#0ff',    spread: 0.05, count: 1, ammo: 50 },
  rocket:  { damage: 90, fireRate: 900, speed: 6,  radius: 6, color: '#ff4400', spread: 0,    count: 1, ammo: 5, explodeRadius: 100 },
};

const POWERUP_TYPES = {
  health:  { color: '#00ff66', label: '+HP',  glow: '#00ff66' },
  shotgun: { color: '#f0f',    label: 'SGN',  glow: '#f0f' },
  rifle:   { color: '#0ff',    label: 'RFL',  glow: '#0ff' },
  rocket:  { color: '#ff4400', label: 'RKT',  glow: '#ff4400' },
  nuke:    { color: '#ffff00', label: 'NUKE', glow: '#ffff00' },
  shield:  { color: '#00ccff', label: 'SHD',  glow: '#00ccff' },
};

// === STATE ===
let playerName = 'Anon';
let gameState = 'menu';
let mouse = { x: 0, y: 0 };
let mouseDown = false;

let player = {};
let zombies = [];
let bullets = [];
let powerups = [];
let particles = [];
let spawnQueue = [];
let spawnTimer = 0;

let wave = 0;
let score = 0;
let stateTimer = 0;
let lastFireTime = 0;
let shieldTimer = 0;
let damageFlash = 0;
let comboCount = 0;
let comboTimer = 0;
let shakeIntensity = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// === LEADERBOARD ===
async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    leaderboardList.innerHTML = '<div class="lb-empty">Unable to load</div>';
  }
}

function renderLeaderboard(data) {
  if (!data.length) {
    leaderboardList.innerHTML = '<div class="lb-empty">No scores yet — be the first</div>';
    return;
  }
  leaderboardList.innerHTML = data.map((e, i) =>
    `<div class="lb-row">
      <span class="lb-rank">#${i + 1}</span>
      <span class="lb-name">${e.name}</span>
      <span class="lb-score">${e.score.toLocaleString()}</span>
      <span class="lb-wave">W${e.wave}</span>
    </div>`
  ).join('');
}

async function submitScore() {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playerName, score, wave }),
    });
    const data = await res.json();
    return data.rank;
  } catch (e) { return null; }
}

// === INIT ===
function resetGame() {
  player = {
    x: canvas.width / 2,
    y: canvas.height - 80,
    radius: 18,
    hp: 100,
    maxHp: 100,
    weapon: 'pistol',
    ammo: Infinity,
  };
  zombies = [];
  bullets = [];
  powerups = [];
  particles = [];
  spawnQueue = [];
  wave = 0;
  score = 0;
  shieldTimer = 0;
  damageFlash = 0;
  comboCount = 0;
  comboTimer = 0;
  shakeIntensity = 0;
  lastFireTime = 0;
  nextWave();
}

// === WAVES ===
function generateWave(w) {
  const queue = [];
  const speedMult = 1 + (w - 1) * 0.06;
  const hpMult = 1 + (w - 1) * 0.12;
  const baseDelay = Math.max(15, 40 - w * 2);

  for (let i = 0; i < 3 + w * 2; i++)
    queue.push({ type: 'walker', delay: i * baseDelay, speedMult, hpMult });

  if (w >= 2) {
    for (let i = 0; i < Math.floor(w * 1.2); i++)
      queue.push({ type: 'runner', delay: i * (baseDelay - 5) + 50, speedMult, hpMult });
  }
  if (w >= 3) {
    for (let i = 0; i < Math.floor((w - 1) * 0.9); i++)
      queue.push({ type: 'exploder', delay: i * (baseDelay + 10) + 80, speedMult, hpMult });
  }
  if (w >= 4) {
    for (let i = 0; i < Math.floor((w - 2) * 0.6) + 1; i++)
      queue.push({ type: 'tank', delay: i * (baseDelay + 30) + 100, speedMult, hpMult });
  }

  queue.sort((a, b) => a.delay - b.delay);
  return queue;
}

function nextWave() {
  wave++;
  spawnQueue = generateWave(wave);
  spawnTimer = 0;
  gameState = 'waveIntro';
  stateTimer = 120;
}

function spawnZombie(t) {
  const base = ZOMBIE_TYPES[t.type];
  const side = Math.random();
  let x, y;
  if (side < 0.6) { x = Math.random() * canvas.width; y = -40; }
  else if (side < 0.8) { x = -40; y = Math.random() * canvas.height * 0.3; }
  else { x = canvas.width + 40; y = Math.random() * canvas.height * 0.3; }

  zombies.push({
    x, y,
    hp: base.hp * t.hpMult, maxHp: base.hp * t.hpMult,
    speed: base.speed * t.speedMult, damage: base.damage,
    radius: base.radius, color: base.color, type: t.type,
    points: base.points, explodeRadius: base.explodeRadius || 0,
    sprite: base.sprite, alive: true, hitFlash: 0,
  });
}

// === SHOOTING ===
function fire() {
  const now = performance.now();
  const wep = WEAPONS[player.weapon];
  if (now - lastFireTime < wep.fireRate) return;
  if (player.ammo <= 0) { player.weapon = 'pistol'; player.ammo = Infinity; return; }

  lastFireTime = now;
  if (player.ammo !== Infinity) player.ammo--;

  const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  for (let i = 0; i < wep.count; i++) {
    const a = angle + (Math.random() - 0.5) * wep.spread * 2;
    bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(a) * wep.speed, vy: Math.sin(a) * wep.speed,
      damage: wep.damage, radius: wep.radius, color: wep.color,
      weapon: player.weapon, alive: true,
    });
  }
  for (let i = 0; i < 3; i++) spawnParticle(player.x, player.y, wep.color, 2, 10);
}

// === POWERUPS ===
function tryDropPowerup(x, y) {
  if (Math.random() > 0.40) return;
const types = ['health', 'shotgun', 'shotgun', 'rifle', 'rifle', 'rocket', 'nuke', 'shield'];
  powerups.push({
    x, y, type: types[Math.floor(Math.random() * types.length)],
    radius: 14, alive: true, life: 480, bob: Math.random() * Math.PI * 2,
  });
}

function collectPowerup(p) {
  switch (p.type) {
    case 'health': player.hp = Math.min(player.maxHp, player.hp + 30); break;
    case 'shotgun': player.weapon = 'shotgun'; player.ammo = WEAPONS.shotgun.ammo; break;
    case 'rifle': player.weapon = 'rifle'; player.ammo = WEAPONS.rifle.ammo; break;
    case 'rocket': player.weapon = 'rocket'; player.ammo = WEAPONS.rocket.ammo; break;
    case 'nuke':
      zombies.forEach((z) => { if (z.alive) { score += z.points; spawnExplosion(z.x, z.y, z.color, 8); } z.alive = false; });
      damageFlash = 15; shakeIntensity = 15; break;
    case 'shield': shieldTimer = 300; break;
  }
  for (let i = 0; i < 8; i++) spawnParticle(p.x, p.y, POWERUP_TYPES[p.type].color, 3, 20);
}

// === PARTICLES ===
function spawnParticle(x, y, color, r, life) {
  const a = Math.random() * Math.PI * 2;
  const s = 1 + Math.random() * 3;
  particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, radius: r || 2, life: life || 20, maxLife: life || 20 });
}

function spawnExplosion(x, y, color, n) {
  for (let i = 0; i < (n || 10); i++) spawnParticle(x, y, color, 2 + Math.random() * 3, 15 + Math.random() * 15);
}

// === UPDATE ===
function update() {
  if (gameState === 'waveIntro') { stateTimer--; if (stateTimer <= 0) gameState = 'playing'; return; }
  if (gameState === 'waveClear') { stateTimer--; if (stateTimer <= 0) nextWave(); return; }
  if (gameState !== 'playing') return;

  player.x += (mouse.x - player.x) * 0.15;
  player.x = Math.max(40, Math.min(canvas.width - 40, player.x));

  if (mouseDown) fire();
  if (shieldTimer > 0) shieldTimer--;
  if (damageFlash > 0) damageFlash--;
  if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) comboCount = 0; }

  spawnTimer++;
  while (spawnQueue.length > 0 && spawnQueue[0].delay <= spawnTimer) spawnZombie(spawnQueue.shift());

  for (const z of zombies) {
    if (!z.alive) continue;
    const dx = player.x - z.x, dy = player.y - z.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) { z.x += (dx / dist) * z.speed; z.y += (dy / dist) * z.speed; }
    if (z.hitFlash > 0) z.hitFlash--;

    if (dist < player.radius + z.radius + 20) {
      if (shieldTimer <= 0) { player.hp -= z.damage; damageFlash = 10; shakeIntensity = Math.max(shakeIntensity, z.damage * 0.5); }
      if (z.type === 'exploder') {
        spawnExplosion(z.x, z.y, '#ff8800', 15);
        for (const oz of zombies) { if (oz === z || !oz.alive) continue; const ed = Math.sqrt((oz.x - z.x) ** 2 + (oz.y - z.y) ** 2); if (ed < z.explodeRadius) { oz.hp -= 30; if (oz.hp <= 0) { oz.alive = false; score += oz.points; } } }
      }
      z.alive = false; spawnExplosion(z.x, z.y, z.color, 6);
      if (player.hp <= 0) { player.hp = 0; showGameOver(); return; }
    }
  }

  for (const b of bullets) {
    if (!b.alive) continue;
    b.x += b.vx; b.y += b.vy;
    if (b.x < -50 || b.x > canvas.width + 50 || b.y < -50 || b.y > canvas.height + 50) { b.alive = false; continue; }

    for (const z of zombies) {
      if (!z.alive) continue;
      const dist = Math.sqrt((b.x - z.x) ** 2 + (b.y - z.y) ** 2);
      if (dist < b.radius + z.radius + 5) {
        z.hp -= b.damage; z.hitFlash = 6; b.alive = false;
        if (b.weapon === 'rocket') {
          spawnExplosion(b.x, b.y, '#ff4400', 20); shakeIntensity = 10;
          for (const oz of zombies) { if (!oz.alive) continue; const ed = Math.sqrt((oz.x - b.x) ** 2 + (oz.y - b.y) ** 2); if (ed < WEAPONS.rocket.explodeRadius) { oz.hp -= WEAPONS.rocket.damage * 0.6; oz.hitFlash = 6; } }
        }
        if (z.hp <= 0) {
          z.alive = false; score += z.points; comboCount++; comboTimer = 60;
          if (comboCount > 1) score += comboCount * 2;
          spawnExplosion(z.x, z.y, z.color, 8); tryDropPowerup(z.x, z.y);
          if (z.type === 'exploder') {
            spawnExplosion(z.x, z.y, '#ff8800', 15); shakeIntensity = 8;
            for (const oz of zombies) { if (oz === z || !oz.alive) continue; const ed = Math.sqrt((oz.x - z.x) ** 2 + (oz.y - z.y) ** 2); if (ed < z.explodeRadius) { oz.hp -= 30; if (oz.hp <= 0) { oz.alive = false; score += oz.points; spawnExplosion(oz.x, oz.y, oz.color, 6); } } }
          }
        }
        break;
      }
    }

    if (b.alive) {
      for (const p of powerups) {
        if (!p.alive) continue;
        const pd = Math.sqrt((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
        if (pd < b.radius + p.radius + 4) { collectPowerup(p); p.alive = false; b.alive = false; break; }
      }
    }
  }

  for (const p of powerups) {
    if (!p.alive) continue;
    p.life--; p.bob += 0.05;
    if (p.life <= 0) { p.alive = false; continue; }
    const pdx = player.x - p.x, pdy = player.y - p.y;
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pdist > 1) { const pull = pdist < 150 ? 3.5 : 1.2; p.x += (pdx / pdist) * pull; p.y += (pdy / pdist) * pull; }
    if (pdist < player.radius + p.radius + 14) { collectPowerup(p); p.alive = false; }
  }

  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--; }

  zombies = zombies.filter((z) => z.alive);
  bullets = bullets.filter((b) => b.alive);
  powerups = powerups.filter((p) => p.alive);
  particles = particles.filter((p) => p.life > 0);

  if (spawnQueue.length === 0 && zombies.length === 0) { gameState = 'waveClear'; stateTimer = 90; }
}

// === GAME OVER ===
async function showGameOver() {
  gameState = 'gameOver';
  goWave.textContent = `Wave ${wave}`;
  goScore.textContent = `Score: ${score.toLocaleString()}`;
  goRank.textContent = 'Submitting...';
  gameOverScreen.style.display = 'flex';
  const rank = await submitScore();
  goRank.textContent = rank ? `Leaderboard: #${rank}` : '';
}

// === RENDER ===
function getDepthScale(y) {
  return 0.35 + 0.65 * Math.max(0, Math.min(1, y / canvas.height));
}

function drawSprite(img, x, y, h, flipX) {
  if (!img || !img.naturalWidth) return;
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.save();
  ctx.translate(x, y);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

function drawBackground() {
  if (IMG.city && IMG.city.naturalWidth) {
    const scale = Math.max(canvas.width / IMG.city.naturalWidth, canvas.height / IMG.city.naturalHeight);
    const w = IMG.city.naturalWidth * scale;
    const h = IMG.city.naturalHeight * scale;
    ctx.drawImage(IMG.city, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.fillStyle = 'rgba(0, 0, 20, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 0; y < canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
}

function drawPlayer() {
  const p = player;
  if (damageFlash > 0 && damageFlash % 2 === 0) return;

  const flipX = mouse.x < p.x;

  if (shieldTimer > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y - 30, 55, 0, Math.PI * 2);
    const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 100);
    ctx.strokeStyle = `rgba(0, 200, 255, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 25;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Gun barrel line
  const angle = Math.atan2(mouse.y - (p.y - 70), mouse.x - p.x);
ctx.beginPath();
ctx.moveTo(p.x, p.y - 70);
ctx.lineTo(p.x + Math.cos(angle) * 45, p.y - 70 + Math.sin(angle) * 45);
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Player sprite with glow
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 20;
  drawSprite(IMG.player, p.x, p.y, 225, flipX);
  ctx.shadowBlur = 0;
}

function drawZombies() {
  for (const z of zombies) {
    if (!z.alive) continue;

    const scale = getDepthScale(z.y);
    const h = (z.radius * 18) * scale;
    const flipX = z.x > player.x;
    const bob = Math.sin(Date.now() / 200 + z.x) * 3 * scale;

    // Glow
    ctx.shadowColor = z.hitFlash > 0 ? '#fff' : z.color;
    ctx.shadowBlur = z.hitFlash > 0 ? 30 : 15;
    drawSprite(IMG[z.sprite], z.x, z.y + bob, h, flipX);
    ctx.shadowBlur = 0;

    // HP bar
    if (z.hp < z.maxHp) {
      const barW = h * 0.6;
      const barH = 3;
      const barX = z.x - barW / 2;
      const barY = z.y - h - 5 + bob;
      const pct = z.hp / z.maxHp;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = pct > 0.5 ? '#00ff66' : pct > 0.25 ? '#ffff00' : '#ff0044';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
  }
}

function drawBullets() {
  for (const b of bullets) {
    if (!b.alive) continue;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 1, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = b.radius * 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 3, b.y - b.vy * 3);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.radius;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPowerups() {
  for (const p of powerups) {
    if (!p.alive) continue;
    const bobY = Math.sin(p.bob) * 4;
    const info = POWERUP_TYPES[p.type];
    if (p.life < 120 && Math.floor(p.life / 8) % 2 === 0) continue;

    ctx.beginPath();
    ctx.arc(p.x, p.y + bobY, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y + bobY, p.radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = info.glow;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = info.color;
    ctx.font = '8px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(info.label, p.x, p.y + bobY + 3);
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * a, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = a;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  const s = 14;
  ctx.strokeStyle = '#ff0050';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff0050';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(mouse.x - s, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
  ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + s, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - s); ctx.lineTo(mouse.x, mouse.y - 5);
  ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ff0050';
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHUD() {
  const hpW = 200, hpH = 14, hpX = 20, hpY = canvas.height - 40;
  const hpPct = player.hp / player.maxHp;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(hpX, hpY, hpW, hpH);
  ctx.fillStyle = hpPct > 0.5 ? '#00ff66' : hpPct > 0.25 ? '#ffff00' : '#ff0044';
  ctx.fillRect(hpX, hpY, hpW * hpPct, hpH);
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(hpX, hpY, hpW, hpH);
  ctx.fillStyle = '#fff';
  ctx.font = '10px "Orbitron", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(player.hp)}/${player.maxHp}`, hpX + 6, hpY + 11);

  const wepLabel = player.weapon.toUpperCase();
  const ammoLabel = player.ammo === Infinity ? '∞' : player.ammo;
  ctx.fillStyle = WEAPONS[player.weapon].color;
  ctx.font = '14px "Orbitron", monospace';
  ctx.fillText(`${wepLabel}  ${ammoLabel}`, hpX, hpY - 12);

  ctx.fillStyle = '#0ff';
  ctx.font = '16px "Orbitron", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`WAVE ${wave}`, canvas.width / 2, 30);
  ctx.fillStyle = '#ffff00';
  ctx.font = '14px "Orbitron", monospace';
  ctx.fillText(score.toLocaleString(), canvas.width / 2, 52);

  if (comboCount > 1) {
    ctx.fillStyle = `rgba(255, 0, 80, ${comboTimer / 60})`;
    ctx.font = '20px "Orbitron", monospace';
    ctx.fillText(`${comboCount}x COMBO`, canvas.width / 2, 80);
  }

  if (shieldTimer > 0) {
    ctx.fillStyle = '#00ccff';
    ctx.font = '12px "Orbitron", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`SHIELD ${Math.ceil(shieldTimer / 60)}s`, canvas.width - 20, canvas.height - 30);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '11px "Orbitron", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${zombies.length + spawnQueue.length} left`, canvas.width - 20, 30);
}

function drawWaveIntro() {
  const a = stateTimer > 60 ? (120 - stateTimer) / 60 : stateTimer / 60;
  ctx.fillStyle = `rgba(0, 255, 255, ${a * 0.9})`;
  ctx.font = '48px "Orbitron", monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#0ff';
  ctx.shadowBlur = 30;
  ctx.fillText(`WAVE ${wave}`, canvas.width / 2, canvas.height / 2 - 20);
  ctx.shadowBlur = 0;
  const labels = ['', 'WARMING UP', 'WARMING UP', 'GETTING REAL', 'GETTING REAL', 'ESCALATION', 'ESCALATION', 'ESCALATION', 'NIGHTMARE', 'NIGHTMARE', 'NIGHTMARE'];
  ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.4})`;
  ctx.font = '14px "Orbitron", monospace';
  ctx.fillText(labels[Math.min(wave, labels.length - 1)] || 'EXTINCTION', canvas.width / 2, canvas.height / 2 + 20);
}

function drawWaveClear() {
  const a = stateTimer > 45 ? (90 - stateTimer) / 45 : stateTimer / 45;
  ctx.fillStyle = `rgba(0, 255, 100, ${a * 0.9})`;
  ctx.font = '36px "Orbitron", monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#00ff66';
  ctx.shadowBlur = 30;
  ctx.fillText('WAVE CLEAR', canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
}

function drawDamageOverlay() {
  if (damageFlash <= 0) return;
  ctx.fillStyle = `rgba(255, 0, 0, ${(damageFlash / 15) * 0.3})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// === MAIN LOOP ===
function loop() {
  if (gameState === 'menu' || gameState === 'gameOver') { requestAnimationFrame(loop); return; }

  // Screen shake
  if (shakeIntensity > 0.5) { shakeIntensity *= 0.88; } else { shakeIntensity = 0; }
  const sx = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity * 2 : 0;
  const sy = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity * 2 : 0;

  ctx.save();
  ctx.translate(sx, sy);

  drawBackground();
  drawGrid();
  drawPowerups();
  drawZombies();
  drawBullets();
  drawParticles();
  drawPlayer();

  ctx.restore();

  drawCrosshair();
  drawDamageOverlay();
  drawHUD();
  if (gameState === 'waveIntro') drawWaveIntro();
  if (gameState === 'waveClear') drawWaveClear();

  update();
  requestAnimationFrame(loop);
}

// === INPUT ===
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', () => { mouseDown = true; });
canvas.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); mouseDown = true; const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; mouse.x = t.clientX; mouse.y = t.clientY; }, { passive: false });
canvas.addEventListener('touchend', () => { mouseDown = false; });
// === START / RESTART ===
startBtn.addEventListener('click', () => {
  playerName = nameInput.value.trim() || 'Anon';
  startScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  loadImages(() => {
    resetGame();
    loop();
  });
});

restartBtn.addEventListener('click', () => {
  gameOverScreen.style.display = 'none';
  resetGame();
  loop();
});

// === BOOT ===
fetchLeaderboard();
canvas.style.cursor = 'none';
