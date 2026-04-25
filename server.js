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
const BORDER_SHRINK_RATE = 0.5;
const MIN_BORDER = 400;
const BORDER_PENALTY = 10;
const BOT_COUNT = 6;
const KILL_FEED_MAX = 6;

const BOT_NAMES = ['NEXUS', 'CIPHER', 'PHANTOM', 'VECTOR', 'RAZOR', 'GLITCH', 'PULSE', 'WRAITH'];

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
let kills = [];
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

// --- BOT SYSTEM ---

function createBot() {
  const id = 'bot_' + Math.random().toString(36).substr(2, 9);
  const center = MAP_SIZE / 2;
  players[id] = {
    id,
    x: center + (Math.random() - 0.5) * 400,
    y: center + (Math.random() - 0.5) * 400,
    radius: INITIAL_RADIUS,
    color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 60%)`,
    targetX: 0,
    targetY: 0,
    score: 0,
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    borderHit: 0,
    isBot: true,
  };
}

for (let i = 0; i < BOT_COUNT; i++) {
  createBot();
}

function updateBots() {
  const center = MAP_SIZE / 2;
  const half = borderSize / 2;

  for (const id in players) {
    const bot = players[id];
    if (!bot.isBot) continue;

    let bestFood = null;
    let bestScore = 0;
    for (const f of foods) {
      const d = Math.sqrt((bot.x - f.x) ** 2 + (bot.y - f.y) ** 2);
      const score = f.value / (d + 1);
      if (score > bestScore) {
        bestScore = score;
        bestFood = f;
      }
    }

    let flee = null;
    let chase = null;
    let fleeDist = Infinity;
    let chaseDist = Infinity;

    for (const otherId in players) {
      if (otherId === id) continue;
      const o = players[otherId];
      const d = Math.sqrt((bot.x - o.x) ** 2 + (bot.y - o.y) ** 2);

      if (o.radius > bot.radius * 1.2 && d < 250 && d < fleeDist) {
        flee = o;
        fleeDist = d;
      } else if (bot.radius > o.radius * 1.2 && d < 200 && d < chaseDist) {
        chase = o;
        chaseDist = d;
      }
    }

    if (flee) {
      bot.targetX = bot.x - flee.x;
      bot.targetY = bot.y - flee.y;
    } else if (chase) {
      bot.targetX = chase.x - bot.x;
      bot.targetY = chase.y - bot.y;
    } else if (bestFood) {
      bot.targetX = bestFood.x - bot.x;
      bot.targetY = bestFood.y - bot.y;
    }

    const margin = 80;
    if (bot.x < center - half + margin) bot.targetX = Math.abs(bot.targetX) + 3;
    if (bot.x > center + half - margin) bot.targetX = -Math.abs(bot.targetX) - 3;
    if (bot.y < center - half + margin) bot.targetY = Math.abs(bot.targetY) + 3;
    if (bot.y > center + half - margin) bot.targetY = -Math.abs(bot.targetY) - 3;
  }

  let botCount = Object.values(players).filter((p) => p.isBot).length;
  while (botCount < BOT_COUNT) {
    createBot();
    botCount++;
  }
}

// --- END BOT SYSTEM ---

function getSpeed(radius) {
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
    isBot: false,
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

function addKill(killerName, victimName, killerColor, victimColor) {
  kills.push({
    killer: killerName || 'Anon',
    victim: victimName || 'Anon',
    killerColor,
    victimColor,
    time: Date.now(),
  });
  if (kills.length > KILL_FEED_MAX) kills.shift();
}

function gameLoop() {
  const center = MAP_SIZE / 2;

  if (borderSize > MIN_BORDER) {
    borderSize -= BORDER_SHRINK_RATE;
    if (borderSize < MIN_BORDER) borderSize = MIN_BORDER;
  }

  updateBots();

  foods = foods.filter((f) => !isOutsideBorder(f.x, f.y));
  while (foods.length < FOOD_COUNT) {
    foods.push(spawnFood());
  }

  for (const id in players) {
    const p = players[id];
    const speed = getSpeed(p.radius);

    const dx = p.targetX;
    const dy = p.targetY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      p.x += (dx / len) * speed;
      p.y += (dy / len) * speed;
    }

    if (p.borderHit > 0) p.borderHit--;

    if (isOutsideBorder(p.x, p.y)) {
      p.x = clampToBorder(p.x, center);
      p.y = clampToBorder(p.y, center);

      if (p.borderHit <= 0) {
        p.radius = Math.max(INITIAL_RADIUS, p.radius - BORDER_PENALTY);
        p.borderHit = 30;
      }
    }

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

    for (const otherId in players) {
      if (otherId === id) continue;
      const o = players[otherId];
      const dist = Math.sqrt((p.x - o.x) ** 2 + (p.y - o.y) ** 2);
      if (dist < p.radius - o.radius * 0.5 && p.radius > o.radius * 1.2) {
        // Kill event
        addKill(p.name, o.name, p.color, o.color);

        p.radius += o.radius * 0.5;
        p.score += o.score + 50;

        o.x = center + (Math.random() - 0.5) * 200;
        o.y = center + (Math.random() - 0.5) * 200;
        o.radius = INITIAL_RADIUS;
        o.score = 0;
      }
    }
  }

  const gameState = JSON.stringify({
    type: 'state',
    players,
    foods,
    kills,
    borderSize,
    mapSize: MAP_SIZE,
  });

  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(gameState);
  });
}

setInterval(gameLoop, 1000 / TICK_RATE);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`⚡ CyberVoid running on port ${PORT}`);
});
