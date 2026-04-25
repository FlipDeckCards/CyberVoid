// ═══════════════════════════════════════════════════════════
// DEADZONE — First-Person Cyberpunk Zombie Survival
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

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
let state = 'waiting'; // waiting | playing | dead
let score, wave, kills, killGoal, health, armor;
let curWeapon, weaponAmmo, lastShot, gunRecoil, muzzleFlash, gunBob;
let zombies = [], particles = [], powerups = [];
let dmgFlash = 0, screenShake = 0;
let spawnTimer, spawnInterval, spawnBudget;
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

// ── 3D PROJECTION ──
function proj(wx, wy, wz) {
  if (wz < NEAR) wz = NEAR;
  const s = (H * 0.5) / (wz * Math.tan(FOV / 2));
  return { x: cx + wx * s, y: horizonY - wy * s, s };
}

// ── INIT ──
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
//  DRAWING — ENVIRONMENT
// ═══════════════════════════════════════

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, '#0a0010');
  g.addColorStop(0.5, '#1a0030');
  g.addColorStop(1, '#2a0845');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY);

  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 80; i++) {
    const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
    const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * horizonY * 0.7;
    ctx.fillRect(sx, sy, 1.2, 1.2);
  }

  // neon glow on horizon
  const hg = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, W * 0.6);
  hg.addColorStop(0, 'rgba(0,255,100,0.12)');
  hg.addColorStop(0.5, 'rgba(150,0,255,0.06)');
  hg.addColorStop(1, 'transparent');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, horizonY + 40);
}

function drawStreet() {
  // road surface
  const g = ctx.createLinearGradient(0, horizonY, 0, H);
  g.addColorStop(0, '#1a1a2e');
  g.addColorStop(1, '#0f0f1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // lane lines (perspective)
  for (let d = 8; d < STREET_DEPTH; d += 6) {
    const p = proj(0, 0, d);
    const alpha = Math.max(0, 1 - d / STREET_DEPTH) * 0.3;
    const lineW = Math.max(1, p.s * 0.15);
    ctx.strokeStyle = `rgba(0,255,80,${alpha})`;
    ctx.lineWidth = lineW;

    // center dashes
    if (Math.floor(d / 6) % 2 === 0) {
      ctx.beginPath();
      const p1 = proj(0, 0, d);
      const p2 = proj(0, 0, d + 3);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  // side gutters
  const halfStreet = LANES * LANE_W / 2;
  for (let side = -1; side <= 1; side += 2) {
    ctx.strokeStyle = 'rgba(0,255,80,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = 2; d < STREET_DEPTH; d += 2) {
      const p = proj(side * halfStreet, 0, d);
      d === 2 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function drawBuildings() {
  const halfStreet = LANES * LANE_W / 2;
  const bldgW = 18;
  const colors = ['#0a0a1a','#0d0d20','#08081a','#0b0b22'];
  const neons = ['#0f0','#f0f','#0ff','#f80','#ff0'];

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 12; i++) {
      const bz = 10 + i * 18;
      const bx = side * (halfStreet + bldgW * 0.5 + 2);
      const bh = 20 + Math.sin(i * 73.7) * 12;

      const bl = proj(bx - bldgW / 2 * side, 0, bz);
      const br = proj(bx + bldgW / 2 * side, 0, bz);
      const tl = proj(bx - bldgW / 2 * side, bh, bz);
      const tr = proj(bx + bldgW / 2 * side, bh, bz);

      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y);
      ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y);
      ctx.closePath(); ctx.fill();

      // neon window strips
      const neonCol = neons[(i + (side > 0 ? 3 : 0)) % neons.length];
      const rows = 2 + (i % 3);
      for (let r = 0; r < rows; r++) {
        const wy = bh * (0.2 + r * 0.25);
        const wl = proj(bx - bldgW * 0.35 * side, wy, bz);
        const wr = proj(bx + bldgW * 0.1 * side, wy, bz);
        ctx.fillStyle = neonCol;
        ctx.globalAlpha = 0.35 + Math.sin(Date.now() * 0.003 + i + r) * 0.15;
        ctx.fillRect(Math.min(wl.x, wr.x), wl.y - 2, Math.abs(wr.x - wl.x), 3);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ═══════════════════════════════════════
//  DRAWING — ZOMBIES
// ═══════════════════════════════════════

function drawZombie(z) {
  const p = proj(z.x, 0, z.z);
  const topP = proj(z.x, ZOMBIE_H, z.z);
  const screenH = p.y - topP.y;
  const screenW = screenH * 0.5;

  if (p.x < -screenW || p.x > W + screenW || screenH < 2) return;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, screenW * 0.5, screenW * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = Math.sin(z.wobble) * screenH * 0.02;

  // body
  ctx.save();
  ctx.translate(p.x, topP.y + bob);

  // legs
  const legOff = Math.sin(z.wobble * 2) * screenW * 0.15;
  ctx.fillStyle = z.flash > 0 ? '#fff' : '#2a2a3a';
  ctx.fillRect(-screenW * 0.2 + legOff, screenH * 0.55, screenW * 0.18, screenH * 0.45);
  ctx.fillRect(screenW * 0.05 - legOff, screenH * 0.55, screenW * 0.18, screenH * 0.45);

  // torso
  const tCol = z.type === 'runner' ? (z.flash > 0 ? '#fff' : '#4a1a2a') : (z.flash > 0 ? '#fff' : '#1a3a1a');
  ctx.fillStyle = tCol;
  ctx.fillRect(-screenW * 0.3, screenH * 0.2, screenW * 0.6, screenH * 0.4);

  // arms reaching forward
  const armReach = Math.sin(z.wobble * 1.5) * screenW * 0.1;
  ctx.fillStyle = z.flash > 0 ? '#fff' : '#3a5a3a';
  ctx.fillRect(-screenW * 0.45 - armReach, screenH * 0.2, screenW * 0.15, screenH * 0.35);
  ctx.fillRect(screenW * 0.3 + armReach, screenH * 0.2, screenW * 0.15, screenH * 0.35);

  // head
  ctx.fillStyle = z.flash > 0 ? '#fff' : '#3a5a3a';
  ctx.beginPath();
  ctx.arc(0, screenH * 0.12, screenW * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // eyes (red glow)
  const eyeR = screenW * 0.06;
  ctx.fillStyle = z.type === 'runner' ? '#f00' : '#f44';
  ctx.shadowColor = '#f00'; ctx.shadowBlur = eyeR * 3;
  ctx.beginPath();
  ctx.arc(-screenW * 0.08, screenH * 0.1, eyeR, 0, Math.PI * 2);
  ctx.arc(screenW * 0.08, screenH * 0.1, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // health bar (if damaged)
  if (z.hp < z.maxHp) {
    const bw = screenW * 0.7;
    ctx.fillStyle = '#300'; ctx.fillRect(-bw / 2, -8, bw, 4);
    ctx.fillStyle = '#f00'; ctx.fillRect(-bw / 2, -8, bw * (z.hp / z.maxHp), 4);
  }

  ctx.restore();
}

// ═══════════════════════════════════════
//  DRAWING — POWERUPS
// ═══════════════════════════════════════

function drawPowerup(pu) {
  const p = proj(pu.x, 1.5 + Math.sin(Date.now() * 0.004) * 0.5, pu.z);
  const sz = Math.max(8, p.s * 2);
  const cols = { health:'#0f0', armor:'#07f', shotgun:'#f80', rifle:'#0ff', rocket:'#f44', nuke:'#ff0' };
  const col = cols[pu.type] || '#fff';

  ctx.shadowColor = col; ctx.shadowBlur = 15;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(8, sz)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const labels = { health:'+', armor:'A', shotgun:'SG', rifle:'RF', rocket:'RL', nuke:'☢' };
  ctx.fillText(labels[pu.type] || '?', p.x, p.y);
}

// ═══════════════════════════════════════
//  DRAWING — GUN & HANDS
// ═══════════════════════════════════════

function drawGun() {
  const w = WEAPONS[curWeapon];
  const bobX = Math.sin(gunBob) * 3;
  const bobY = Math.abs(Math.cos(gunBob)) * 2;
  const kickY = gunRecoil * 8;
  const baseX = cx + bobX;
  const baseY = H - kickY + bobY;

  ctx.save();
  ctx.translate(baseX, baseY);

  // ── HANDS ──
  const skinCol = '#c4956a';
  const gloveCol = '#1a1a2e';

  // Left hand
  ctx.fillStyle = gloveCol;
  ctx.fillRect(-130, -80, 55, 90);
  ctx.fillStyle = skinCol;
  ctx.fillRect(-125, -85, 45, 20);

  // Right hand (on grip)
  ctx.fillStyle = gloveCol;
  ctx.fillRect(65, -80, 55, 90);
  ctx.fillStyle = skinCol;
  ctx.fillRect(70, -85, 45, 20);

  // ── WEAPON BODY ──
  if (curWeapon === 'pistol') {
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-18, -130, 36, 100);
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(-14, -125, 28, 60);
    ctx.fillStyle = '#444'; ctx.fillRect(-10, -135, 20, 15); // barrel
    ctx.fillStyle = w.col; ctx.shadowColor = w.col; ctx.shadowBlur = 8;
    ctx.fillRect(-3, -140, 6, 6); ctx.shadowBlur = 0;
  } else if (curWeapon === 'shotgun') {
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-14, -90, 28, 70); // stock
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-10, -180, 20, 100); // barrel
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(-12, -185, 24, 12);
    ctx.fillStyle = '#222'; ctx.fillRect(-8, -175, 7, 90);
    ctx.fillRect(1, -175, 7, 90); // double barrel
    ctx.fillStyle = w.col; ctx.shadowColor = w.col; ctx.shadowBlur = 10;
    ctx.fillRect(-5, -190, 10, 6); ctx.shadowBlur = 0;
  } else if (curWeapon === 'rifle') {
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(-12, -200, 24, 160);
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(-8, -205, 16, 20);
    ctx.fillStyle = '#444'; ctx.fillRect(-6, -210, 12, 15);
    ctx.fillStyle = w.col; ctx.shadowColor = w.col; ctx.shadowBlur = 12;
    ctx.fillRect(-2, -215, 4, 8); ctx.shadowBlur = 0;
    // scope
    ctx.fillStyle = '#0ff'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(0, -170, 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (curWeapon === 'rocket') {
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-16, -190, 32, 150);
    ctx.fillStyle = '#2a4a2a'; ctx.fillRect(-20, -140, 40, 30);
    ctx.fillStyle = '#f44'; ctx.fillRect(-12, -195, 24, 12);
    ctx.fillStyle = w.col; ctx.shadowColor = w.col; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.arc(0, -200, 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── MUZZLE FLASH ──
  if (muzzleFlash > 0) {
    const mfSize = 30 + (curWeapon === 'rocket' ? 40 : curWeapon === 'shotgun' ? 30 : 10);
    ctx.globalAlpha = muzzleFlash;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = w.col; ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(0, -200, mfSize * muzzleFlash, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ═══════════════════════════════════════
//  DRAWING — HUD
// ═══════════════════════════════════════

function drawHUD() {
  const w = WEAPONS[curWeapon];
  const pad = 20;

  // Health bar (bottom left)
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(pad, H - 60, 220, 40);
  ctx.fillStyle = '#300';
  ctx.fillRect(pad + 5, H - 55, 130, 12);
  ctx.fillStyle = health > 30 ? '#0f0' : '#f00';
  ctx.fillRect(pad + 5, H - 55, 130 * (health / 100), 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`HP ${Math.ceil(health)}`, pad + 8, H - 45);

  if (armor > 0) {
    ctx.fillStyle = '#004';
    ctx.fillRect(pad + 5, H - 38, 130, 10);
    ctx.fillStyle = '#07f';
    ctx.fillRect(pad + 5, H - 38, 130 * (armor / 100), 10);
    ctx.fillStyle = '#aaf'; ctx.font = 'bold 9px monospace';
    ctx.fillText(`ARM ${Math.ceil(armor)}`, pad + 8, H - 30);
  }

  // Ammo (bottom right)
  const ammoTxt = weaponAmmo[curWeapon] === Infinity ? '∞' : weaponAmmo[curWeapon];
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(W - 200 - pad, H - 60, 200, 40);
  ctx.fillStyle = w.col; ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${w.name}`, W - pad - 10, H - 40);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace';
  ctx.fillText(`${ammoTxt}`, W - pad - 10, H - 20);
  ctx.textAlign = 'left';

  // Score & Wave (top)
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(cx - 120, 10, 240, 40);
  ctx.fillStyle = '#0f0'; ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`WAVE ${wave}`, cx, 30);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`SCORE: ${score}   KILLS: ${kills}/${killGoal}`, cx, 44);
  ctx.textAlign = 'left';

  // Weapon inventory (bottom center)
  const invW = 36;
  const invStart = cx - (WEAPON_ORDER.length * invW) / 2;
  WEAPON_ORDER.forEach((wk, i) => {
    const wx = invStart + i * invW;
    const active = wk === curWeapon;
    const hasAmmo = weaponAmmo[wk] > 0 || weaponAmmo[wk] === Infinity;
    ctx.fillStyle = active ? 'rgba(0,255,0,0.3)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(wx, H - 90, invW - 4, 24);
    if (active) { ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.strokeRect(wx, H - 90, invW - 4, 24); }
    ctx.fillStyle = hasAmmo ? '#fff' : '#555'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, wx + (invW - 4) / 2, H - 74);
    ctx.textAlign = 'left';
  });

  // Crosshair
  const chSize = 14;
  ctx.strokeStyle = 'rgba(0,255,0,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mouse.x - chSize, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y);
  ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + chSize, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - chSize); ctx.lineTo(mouse.x, mouse.y - 4);
  ctx.moveTo(mouse.x, mouse.y + 4); ctx.lineTo(mouse.x, mouse.y + chSize);
  ctx.stroke();
  ctx.fillStyle = '#0f0';
  ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 2, 0, Math.PI * 2); ctx.fill();
}

function drawDamageOverlay() {
  if (dmgFlash > 0) {
    ctx.fillStyle = `rgba(255,0,0,${dmgFlash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f00'; ctx.font = 'bold 60px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#f00'; ctx.shadowBlur = 30;
  ctx.fillText('FLATLINED', cx, cy - 40);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff'; ctx.font = '20px monospace';
  ctx.fillText(`Score: ${score}  |  Wave: ${wave}  |  Kills: ${kills}`, cx, cy + 20);

  ctx.fillStyle = '#0f0'; ctx.font = '16px monospace';
  ctx.fillText('[ CLICK TO JACK BACK IN ]', cx, cy + 70);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════

function spawnParticles(wx, wy, wz, count, col) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: wx, y: wy + Math.random() * ZOMBIE_H,
      z: wz,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 10,
      vz: (Math.random() - 0.5) * 4,
      life: 0.6 + Math.random() * 0.4,
      col: col,
      size: 1 + Math.random() * 2
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 20 * dt; // gravity
    p.life -= dt;
    if (p.life <= 0 || p.y < -2) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    const sp = proj(p.x, Math.max(0, p.y), p.z);
    const sz = Math.max(1, sp.s * p.size * 0.3);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.col;
    ctx.fillRect(sp.x - sz / 2, sp.y - sz / 2, sz, sz);
  });
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════
//  SHOOTING
// ═══════════════════════════════════════

function screenToWorld(sx, sy) {
  // Approximate: convert screen coords to a direction in world space
  const dx = (sx - cx) / (H * 0.5) * Math.tan(FOV / 2);
  const dy = -(sy - horizonY) / (H * 0.5) * Math.tan(FOV / 2);
  return { dx, dy, dz: 1 };
}

function shoot() {
  const now = performance.now();
  const w = WEAPONS[curWeapon];
  if (now - lastShot < w.rate) return;
  if (weaponAmmo[curWeapon] !== Infinity && weaponAmmo[curWeapon] <= 0) {
    curWeapon = 'pistol'; return;
  }
  lastShot = now;
  if (weaponAmmo[curWeapon] !== Infinity) weaponAmmo[curWeapon]--;
  gunRecoil = 1;
  muzzleFlash = 1;
  screenShake = w.recoil * 0.3;

  for (let p = 0; p < w.pellets; p++) {
    const spreadX = (Math.random() - 0.5) * w.spread * W;
    const spreadY = (Math.random() - 0.5) * w.spread * H;
    const aim = screenToWorld(mouse.x + spreadX, mouse.y + spreadY);

    // Ray test against all zombies (front to back)
    const sorted = [...zombies].sort((a, b) => a.z - b.z);
    for (const z of sorted) {
      const t = z.z; // ray param at zombie's depth
      const hitX = aim.dx * t;
      const hitY = aim.dy * t;
      const hw = ZOMBIE_W * 0.6;
      const hh = ZOMBIE_H;
      if (hitX > z.x - hw && hitX < z.x + hw && hitY > -0.5 && hitY < hh) {
        let dmg = w.dmg;
        // headshot
        if (hitY > hh * 0.75) { dmg *= 2; spawnParticles(z.x, hh, z.z, 6, '#f00'); }

        z.hp -= dmg;
        z.flash = 0.12;
        spawnParticles(z.x, hitY, z.z, 4, '#f44');

        if (w.explosive) {
          // splash damage
          zombies.forEach(oz => {
            if (oz === z) return;
            const dist = Math.sqrt((oz.x - z.x) ** 2 + (oz.z - z.z) ** 2);
            if (dist < 15) {
              oz.hp -= w.dmg * (1 - dist / 15);
              oz.flash = 0.1;
            }
          });
          spawnParticles(z.x, 3, z.z, 20, '#f80');
          screenShake = 8;
        }
        break; // bullet stops at first zombie hit
      }
    }
  }
}

// ═══════════════════════════════════════
//  POWERUP LOGIC
// ═══════════════════════════════════════

function tryDropPowerup(x, z) {
  if (Math.random() > 0.35) return;
  const types = ['health','health','armor','shotgun','shotgun','rifle','rifle','rocket','nuke'];
  const type = types[Math.random() * types.length | 0];
  powerups.push({ x, z, type, life: 12 });
}

function collectPowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.life -= dt;
    if (pu.life <= 0) { powerups.splice(i, 1); continue; }
    // auto-collect if close
    if (pu.z < 6) {
      switch (pu.type) {
        case 'health': health = Math.min(100, health + 25); break;
        case 'armor': armor = Math.min(100, armor + 30); break;
        case 'shotgun': weaponAmmo.shotgun += 8; break;
        case 'rifle': weaponAmmo.rifle += 40; break;
        case 'rocket': weaponAmmo.rocket += 3; break;
        case 'nuke':
          zombies.forEach(z => { z.hp = 0; spawnParticles(z.x, 3, z.z, 10, '#ff0'); });
          screenShake = 12; score += zombies.length * 50;
          break;
      }
      powerups.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════
//  ZOMBIE SPAWNING & AI
// ═══════════════════════════════════════

function spawnZombie() {
  const halfLanes = Math.floor(LANES / 2);
  const lane = (Math.random() * LANES | 0) - halfLanes;
  const isRunner = Math.random() < 0.12 + wave * 0.03;
  const z = {
    x: lane * LANE_W + (Math.random() - 0.5) * LANE_W * 0.5,
    z: STREET_DEPTH + Math.random() * 30,
    speed: (isRunner ? 22 : 10) + wave * 1.2 + Math.random() * 3,
    hp: (isRunner ? 40 : 60) + wave * 12,
    maxHp: (isRunner ? 40 : 60) + wave * 12,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 4 + Math.random() * 3,
    flash: 0,
    type: isRunner ? 'runner' : 'walker',
    attackCooldown: 0
  };
  zombies.push(z);
}

function updateZombies(dt) {
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];

    // dead?
    if (z.hp <= 0) {
      score += z.type === 'runner' ? 150 : 100;
      kills++;
      spawnParticles(z.x, 3, z.z, 12, '#4a0');
      tryDropPowerup(z.x, z.z);
      zombies.splice(i, 1);
      continue;
    }

    // move toward player
    z.z -= z.speed * dt;
    z.wobble += z.wobbleSpeed * dt;
    z.x += Math.sin(z.wobble) * dt * 2; // weave
    z.flash = Math.max(0, z.flash - dt);

    // attack
    if (z.z < ATTACK_RANGE) {
      z.attackCooldown -= dt;
      if (z.attackCooldown <= 0) {
        const dmg = 8 + wave * 2;
        if (armor > 0) {
          const absorbed = Math.min(armor, dmg * 0.6);
          armor -= absorbed;
          health -= dmg - absorbed;
        } else {
          health -= dmg;
        }
        dmgFlash = 1;
        screenShake = 4;
        z.attackCooldown = 1.2;
      }
      z.z = ATTACK_RANGE; // stay at melee range
    }

    if (health <= 0) { health = 0; state = 'dead'; }
  }
}

// ═══════════════════════════════════════
//  WAVE SYSTEM
// ═══════════════════════════════════════

function updateWaves(dt) {
  if (kills >= killGoal) {
    wave++;
    kills = 0;
    killGoal = 8 + wave * 4;
    spawnInterval = Math.max(400, 1800 - wave * 120);
    // wave bonus
    health = Math.min(100, health + 10);
  }

  spawnTimer -= dt * 1000;
  if (spawnTimer <= 0 && zombies.length < 15 + wave * 2) {
    spawnZombie();
    spawnTimer = spawnInterval + Math.random() * 400;
  }
}

// ═══════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════

function update(dt) {
  if (state !== 'playing') return;
  if (mouseDown) shoot();
  gunRecoil = Math.max(0, gunRecoil - dt * 8);
  muzzleFlash = Math.max(0, muzzleFlash - dt * 12);
  gunBob += dt * 1.5;
  screenShake = Math.max(0, screenShake - dt * 15);
  dmgFlash = Math.max(0, dmgFlash - dt * 3);
  updateZombies(dt);
  updateWaves(dt);
  updateParticles(dt);
  collectPowerups(dt);
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake * 2, (Math.random() - 0.5) * screenShake * 2);
  }

  drawSky();
  drawStreet();
  drawBuildings();

  // sort all world objects back-to-front
  const sorted = [...zombies].sort((a, b) => b.z - a.z);
  const sortedPU = [...powerups].sort((a, b) => b.z - a.z);

  // interleave drawing by depth
  let zi = 0, pi = 0;
  while (zi < sorted.length || pi < sortedPU.length) {
    const zd = zi < sorted.length ? sorted[zi].z : -1;
    const pd = pi < sortedPU.length ? sortedPU[pi].z : -1;
    if (zd > pd) { drawZombie(sorted[zi]); zi++; }
    else { drawPowerup(sortedPU[pi]); pi++; }
  }

  drawParticles();
  ctx.restore();

  drawGun();
  drawDamageOverlay();
  drawHUD();

  if (state === 'dead') drawGameOver();
}

function gameLoop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════

canvas.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
});

canvas.addEventListener('mousedown', e => {
  if (state === 'waiting') { init(); }
  else if (state === 'dead') { init(); }
  else { mouseDown = true; }
});

canvas.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (state !== 'playing') return;
  const num = parseInt(e.key);
  if (num >= 1 && num <= WEAPON_ORDER.length) {
    const wk = WEAPON_ORDER[num - 1];
    if (weaponAmmo[wk] > 0 || weaponAmmo[wk] === Infinity) curWeapon = wk;
  }
  // R to reload (switch back to pistol)
  if (e.key === 'r' || e.key === 'R') curWeapon = 'pistol';
});

// ═══════════════════════════════════════
//  START
// ═══════════════════════════════════════

// Hide start screen, show canvas
document.getElementById('startScreen').style.display = 'none';
canvas.style.display = 'block';
canvas.style.cursor = 'none';

// Draw title screen
function drawTitleScreen() {
  ctx.fillStyle = '#0a0010'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0f0'; ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#0f0'; ctx.shadowBlur = 40;
  ctx.fillText('DEADZONE', cx, cy - 60);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#888'; ctx.font = '18px monospace';
  ctx.fillText('FIRST PERSON // CYBERPUNK // SURVIVAL', cx, cy);
  ctx.fillStyle = '#0f0'; ctx.font = '16px monospace';
  ctx.fillText('[ CLICK TO JACK IN ]', cx, cy + 60);
  ctx.fillStyle = '#555'; ctx.font = '12px monospace';
  ctx.fillText('1-4: SWITCH WEAPONS  |  R: PISTOL  |  MOUSE: AIM & SHOOT', cx, cy + 110);
  ctx.textAlign = 'left';
}

drawTitleScreen();
requestAnimationFrame(gameLoop);
