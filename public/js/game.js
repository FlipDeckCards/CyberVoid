const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nameInput = document.getElementById('nameInput');
const startBtn = document.getElementById('startBtn');
const startScreen = document.getElementById('startScreen');
const deathScreen = document.getElementById('deathScreen');
const killerNameEl = document.getElementById('killerName');
const respawnBtn = document.getElementById('respawnBtn');
const scoreEl = document.getElementById('score');

let ws;
let myId = null;
let myName = 'Anon';
let state = { players: {}, foods: [], kills: [], borderSize: 3000, mapSize: 3000 };
let mouse = { x: 0, y: 0 };
let cam = { x: 0, y: 0 };
let playing = false;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    console.log('Connected');
    setTimeout(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'name', name: myName }));
      }
    }, 300);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'init') myId = msg.id;
    if (msg.type === 'state') state = msg;
    if (msg.type === 'death') showDeath(msg.killer);
  };

  ws.onclose = () => setTimeout(connect, 2000);
}

function showDeath(killer) {
  killerNameEl.textContent = `by ${killer}`;
  deathScreen.classList.add('show');
}

function hideDeath() {
  deathScreen.classList.remove('show');
}

startBtn.addEventListener('click', () => {
  myName = nameInput.value.trim() || 'Anon';
  startScreen.style.display = 'none';
  canvas.style.display = 'block';
  playing = true;
  connect();
});

respawnBtn.addEventListener('click', () => {
  hideDeath();
  // Server already respawned our blob — just keep playing
});

canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX - canvas.width / 2;
  mouse.y = e.clientY - canvas.height / 2;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  mouse.x = t.clientX - canvas.width / 2;
  mouse.y = t.clientY - canvas.height / 2;
}, { passive: false });

setInterval(() => {
  if (ws && ws.readyState === 1 && playing) {
    ws.send(JSON.stringify({ type: 'input', x: mouse.x, y: mouse.y }));
  }
}, 1000 / 30);

function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  const g = 60;
  const sx = -cam.x % g;
  const sy = -cam.y % g;
  for (let x = sx; x < canvas.width; x += g) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = sy; y < canvas.height; y += g) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function drawBorder() {
  const bs = state.borderSize;
  const ms = state.mapSize;
  const c = ms / 2;
  const half = bs / 2;
  const x = (c - half) - cam.x;
  const y = (c - half) - cam.y;

  ctx.fillStyle = 'rgba(255, 0, 60, 0.08)';
  ctx.fillRect(0, 0, canvas.width, Math.max(0, y));
  ctx.fillRect(0, y + bs, canvas.width, canvas.height - (y + bs));
  ctx.fillRect(0, y, Math.max(0, x), bs);
  ctx.fillRect(x + bs, y, canvas.width - (x + bs), bs);

  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
  ctx.strokeStyle = `rgba(255, 0, 80, ${0.4 + pulse * 0.3})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff0050';
  ctx.shadowBlur = 20;
  ctx.strokeRect(x, y, bs, bs);
  ctx.shadowBlur = 0;
}

function drawFood() {
  for (const f of state.foods) {
    const sx = f.x - cam.x;
    const sy = f.y - cam.y;
    if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

    ctx.beginPath();
    ctx.arc(sx, sy, f.radius, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = f.radius * 3;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawPlayers() {
  for (const id in state.players) {
    const p = state.players[id];
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    if (sx < -200 || sx > canvas.width + 200 || sy < -200 || sy > canvas.height + 200) continue;

    ctx.beginPath();
    ctx.arc(sx, sy, p.radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = id === myId ? 'rgba(0, 255, 255, 0.15)' : 'rgba(255, 0, 255, 0.1)';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 25;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (p.borderHit > 20) {
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (p.name) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, sx, sy - p.radius - 10);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.score, sx, sy + 4);
  }
}

function drawKillFeed() {
  const feedKills = state.kills || [];
  if (feedKills.length === 0) return;

  const x = 20;
  let y = 80;
  const now = Date.now();

  for (let i = feedKills.length - 1; i >= 0; i--) {
    const k = feedKills[i];
    const age = (now - k.time) / 1000;
    if (age > 8) continue;

    const fade = age > 5 ? 1 - (age - 5) / 3 : 1;

    ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * fade})`;
    const text = `${k.killer}  ☠  ${k.victim}`;
    ctx.font = '13px "Orbitron", monospace';
    const w = ctx.measureText(text).width + 20;
    ctx.beginPath();
    ctx.roundRect(x, y - 14, w, 22, 4);
    ctx.fill();

    ctx.fillStyle = k.killerColor ? k.killerColor.replace(')', `, ${fade})`).replace('hsl', 'hsla') : `rgba(0, 255, 255, ${fade})`;
    ctx.textAlign = 'left';
    ctx.fillText(k.killer, x + 8, y);

    const killerW = ctx.measureText(k.killer).width;
    ctx.fillStyle = `rgba(255, 60, 80, ${fade})`;
    ctx.fillText('☠', x + 8 + killerW + 6, y);

    const skullW = ctx.measureText('☠').width;
    ctx.fillStyle = k.victimColor ? k.victimColor.replace(')', `, ${fade})`).replace('hsl', 'hsla') : `rgba(255, 0, 255, ${fade})`;
    ctx.fillText(k.victim, x + 8 + killerW + 6 + skullW + 6, y);

    y += 28;
  }
}

function drawHUD() {
  const me = state.players[myId];
  if (!me) return;

  if (scoreEl) scoreEl.textContent = 'Score: ' + me.score;

  const c = state.mapSize / 2;
  const half = state.borderSize / 2;
  const dist = Math.min(
    me.x - (c - half),
    (c + half) - me.x,
    me.y - (c - half),
    (c + half) - me.y
  );

  if (dist < 100) {
    const a = 1 - dist / 100;
    ctx.fillStyle = `rgba(255, 0, 60, ${a * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(255, 0, 60, ${a})`;
    ctx.font = '24px "Orbitron", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ BORDER', canvas.width / 2, 60);
  }

  const mm = 120;
  const mx = canvas.width - mm - 15;
  const my = canvas.height - mm - 15;
  const s = mm / state.mapSize;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(mx, my, mm, mm);
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
  ctx.strokeRect(mx, my, mm, mm);

  const bSize = state.borderSize * s;
  const bOff = (state.mapSize - state.borderSize) / 2 * s;
  ctx.strokeStyle = 'rgba(255, 0, 80, 0.5)';
  ctx.strokeRect(mx + bOff, my + bOff, bSize, bSize);

  for (const id in state.players) {
    const p = state.players[id];
    ctx.fillStyle = id === myId ? '#0ff' : '#f0f';
    ctx.beginPath();
    ctx.arc(mx + p.x * s, my + p.y * s, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop() {
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const me = state.players[myId];
  if (me) {
    cam.x += (me.x - canvas.width / 2 - cam.x) * 0.1;
    cam.y += (me.y - canvas.height / 2 - cam.y) * 0.1;
  }

  drawGrid();
  drawBorder();
  drawFood();
  drawPlayers();
  drawKillFeed();
  drawHUD();

  requestAnimationFrame(loop);
}

loop();
