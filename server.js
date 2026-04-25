const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

// Game constants
const TICK_RATE = 60;
const MAP_SIZE = 3000;
const FOOD_COUNT = 200;
const INITIAL_RADIUS = 15;
const BORDER_SHRINK_RATE = 0.15;
const MIN_BORDER = 400;
const BORDER_PENALTY = 1;

// Food types — color determines size and value
const FOOD_TYPES = [
  { color: '#ff00ff', size: 4, value: 1 },
  { color: '#00ffff', size: 6, value: 1.5 },
  { color: '#ff3366', size: 8, value: 2 },
  { color: '#ffff00', size: 10, value: 2.5 },
  { color: '#00ff88', size: 12, value: 3 },
];

let players = {};
let foods = [];
let borderSize = MAP_SIZE;

function spawnFood() {
  const type = FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)];
  const center = MAP_SIZE / 2;
  return {
    id: Math.random().toString(36).substr(2, 9),
    x: center + (Math.random() - 0.5) * (borderSize - 40),
    y: center + (Math.random() - 0.5) * (borderSize - 40),
    radius: type.size,
    color: type.color,
    value: type.value,
  };
}

for (let i = 0; i < FOOD_COUNT; i++) {
  foods.push(spawnFood());
}

function getSpeed(radius) {
  // Exponential dampening — stays fast even when big
  const base = 5;
  const speed = base * Math.pow(INITIAL_RADIUS / radius, 0.35);
  return Math.max(speed, 2);
}

function isOutsideBorder(x, y) {
  const center = MAP_SIZE / 2;
  const half = borderSize / 2;
  return x < center - half || x > center + half || y < center - half || y > center + half;
}

function clampToBorder(val, center) {
  const half = borderSize / 2;
  return Math.max(center - half, Math.min(center + half, val));
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  const center = MAP_SIZE / 2;

  players[id] = {
    id,
    x: center + (Math.random() - 0.5) * 200,
    y: center + (Math.random() - 0.5) * 200,
    radius: INITIAL_RADIUS,
    color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 60%)`,
    targetX: 0,
    targetY: 0,
    score: 0,
    name: '',
    borderHit: 0,
  };

  ws.playerId = id;
  ws.send(JSON.stringify({ type: 'init', id, mapSize: MAP_SIZE }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'input' && players[id]) {
        players[id].targetX = msg.x || 0;
        players[id].targetY = msg.y || 0;
      }
      if (msg.type === 'name' && players[id]) {
        players[id].name = String(msg.name).slice(0, 16);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    delete players[id];
  });
});

function gameLoop() {
  const center = MAP_SIZE / 2;

  // Shrink border
  if (borderSize > MIN_BORDER) {
    borderSize -= BORDER_SHRINK_RATE;
    if (borderSize < MIN_BORDER) borderSize = MIN_BORDER;
  }

  // Remove food that ended up outside border
  foods = foods.filter((f) => !isOutsideBorder(f.x, f.y));
  while (foods.length < FOOD_COUNT) {
    foods.push(spawnFood());
  }

  for (const id in players) {
    const p = players[id];
    const speed = getSpeed(p.radius);

    // Movement
    const dx = p.targetX;
    const dy = p.targetY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      p.x += (dx / len) * speed;
      p.y += (dy / len) * speed;
    }

    // Border collision — penalty, not death
    if (p.borderHit > 0) p.borderHit--;

    if (isOutsideBorder(p.x, p.y)) {
      p.x = clampToBorder(p.x, center);
      p.y = clampToBorder(p.y, center);

      if (p.borderHit <= 0) {
        p.radius = Math.max(INITIAL_RADIUS, p.radius - BORDER_PENALTY);
        p.borderHit = 30; // half-second cooldown at 60 ticks
      }
    }

    // Eat food
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dist = Math.sqrt((p.x - f.x) ** 2 + (p.y - f.y) ** 2);
      if (dist < p.radius + f.radius) {
        p.radius += f.value * 0.5;
        p.score += Math.round(f.value * 10);
        foods.splice(i, 1);
        foods.push(spawnFood());
      }
    }

    // Eat smaller players
    for (const otherId in players) {
      if (otherId === id) continue;
      const o = players[otherId];
      const dist = Math.sqrt((p.x - o.x) ** 2 + (p.y - o.y) ** 2);
      if (dist < p.radius - o.radius * 0.5 && p.radius > o.radius * 1.2) {
        p.radius += o.radius * 0.5;
        p.score += o.score + 50;
        o.x = center + (Math.random() - 0.5) * 200;
        o.y = center + (Math.random() - 0.5) * 200;
        o.radius = INITIAL_RADIUS;
        o.score = 0;
      }
    }
  }

  // Broadcast
  const state = JSON.stringify({
    type: 'state',
    players,
    foods,
    borderSize,
    mapSize: MAP_SIZE,
  });

  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(state);
  });
}

setInterval(gameLoop, 1000 / TICK_RATE);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`⚡ CyberVoid running on port ${PORT}`);
});
