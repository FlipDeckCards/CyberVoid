const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

// Base constants
const TICK_RATE = 60;
const MAP_SIZE = 3000;
const BASE_FOOD_COUNT = 200;
const INITIAL_RADIUS = 15;
const MAX_RADIUS = 120;
const BASE_BORDER_SHRINK = 0.5;
const MIN_BORDER = 400;
const BORDER_PENALTY = 10;
const BASE_BOT_COUNT = 6;
const BASE_BOT_MAX = 55;
const KILL_FEED_MAX = 6;
const FINAL_COUNTDOWN = 15;

const BOT_NAMES = ['NEXUS', 'CIPHER', 'PHANTOM', 'VECTOR', 'RAZOR', 'GLITCH', 'PULSE', 'WRAITH', 'ECHO', 'NOVA'];

const FOOD_TYPES = [
  { color: '#ff00ff', size: 4, value: 1 },
  { color: '#00ffff', size: 6, value: 1.5 },
  { color: '#ff3366', size: 8, value: 2 },
  { color: '#ffff00', size: 10, value: 2.5 },
  { color: '#00ff88', size: 12, value: 3 },
];

// Game state
let players = {};
let connections = {};
let foods = [];
let kills = [];
let borderSize = MAP_SIZE;
let gameActive = false;
let countdown = -1;
let countdownTicks = 0;
let matchOver = false;
let round = 1;
let endTimer = null;

// Difficulty scaling per round
function getDifficulty() {
  const r = round;
  return {
    botCount: Math.min(BASE_BOT_COUNT + Math.floor((r - 1) * 1.5), 12),
    botMaxRadius: Math.min(BASE_BOT_MAX + (r - 1) * 8, 100),
    borderShrink: BASE_BORDER_SHRINK + (r - 1) * 0.15,
    foodCount: Math.max(BASE_FOOD_COUNT - (r - 1) * 15, 100),
  };
}

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

function initFoods() {
  const diff = getDifficulty();
  foods = [];
  for (let i = 0; i < diff.foodCount; i++) {
    foods.push(spawnFood());
  }
}

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

function resetGame(nextRound) {
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }

  if (nextRound) {
    round = nextRound;
  }

  const diff = getDifficulty();

  // Remove all bots
  for (const id in players) {
    if (players[id].isBot) delete players[id];
  }
  // Reset real players
  const center = MAP_SIZE / 2;
  for (const id in players) {
    const p = players[id];
    p.x = center + (Math.random() - 0.5) * 200;
    p.y = center + (Math.random() - 0.5) * 200;
    p.radius = INITIAL_RADIUS;
    p.score = 0;
  }
  // Spawn bots for this round
  for (let i = 0; i < diff.botCount; i++) {
    createBot();
  }

  borderSize = MAP_SIZE;
  kills = [];
  countdown = -1;
  countdownTicks = 0;
  matchOver = false;
  initFoods();
  gameActive = true;

  // Tell all clients about new round
  broadcast(JSON.stringify({ type: 'new_round', round }));
}

function getRealPlayerCount() {
  return Object.values(players).filter((p) => !p.isBot).length;
}

function broadcast(msg) {
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

function updateBots() {
  const diff = getDifficulty();
  const center = MAP_SIZE / 2;
  const half = borderSize / 2;

  for (const id in players) {
    const bot = players[id];
    if (!bot.isBot) continue;

    if (bot.radius > diff.botMaxRadius) bot.radius = diff.botMaxRadius;

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
  while (botCount < diff.botCount) {
    createBot();
    botCount++;
  }
}

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

function getWinner() {
  let best = null;
  for (const id in players) {
    const p = players[id];
    if (!best || p.score > best.score) best = p;
  }
  return best;
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  const center = MAP_SIZE / 2;

  if (getRealPlayerCount() === 0 || matchOver) {
    resetGame(1);
  }

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

  connections[id] = ws;
  ws.playerId = id;
  ws.send(JSON.stringify({ type: 'init', id, mapSize: MAP_SIZE, round }));

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
      if (msg.type === 'restart') {
        const winner = getWinner();
        const isPlayerWinner = winner && !winner.isBot && winner.id === id;
        resetGame(isPlayerWinner ? round + 1 : 1);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    delete players[id];
    delete connections[id];
    if (getRealPlayerCount() === 0) {
      gameActive = false;
    }
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

function endMatch() {
  matchOver = true;
  gameActive = false;
  const winner = getWinner();
  const winMsg = JSON.stringify({
    type: 'match_over',
    winner: winner ? (winner.name || 'Anon') : 'Nobody',
    winnerId: winner ? winner.id : null,
    score: winner ? winner.score : 0,
    round,
    isBot: winner ? winner.isBot : false,
  });
  broadcast(winMsg);
}

function gameLoop() {
  if (!gameActive || matchOver) return;

  const diff = getDifficulty();
  const center = MAP_SIZE / 2;

  // Shrink border
  if (borderSize > MIN_BORDER) {
    borderSize -= diff.borderShrink;
    if (borderSize < MIN_BORDER) borderSize = MIN_BORDER;
  }

  // Start final countdown when border hits minimum
  if (borderSize <= MIN_BORDER && countdown < 0) {
    countdown = FINAL_COUNTDOWN;
    countdownTicks = 0;
  }

  // Tick countdown
  if (countdown >= 0) {
    countdownTicks++;
    if (countdownTicks >= TICK_RATE) {
      countdownTicks = 0;
      countdown--;
    }
    if (countdown < 0 && !matchOver) {
      // Send one final state, then end match after short delay
      const finalState = JSON.stringify({
        type: 'state',
        players,
        foods,
        kills,
        borderSize,
        mapSize: MAP_SIZE,
        countdown: 0,
        round,
      });
      broadcast(finalState);

      endTimer = setTimeout(() => {
        endMatch();
      }, 500);
      return;
    }
  }

  updateBots();

  foods = foods.filter((f) => !isOutsideBorder(f.x, f.y));
  while (foods.length < diff.foodCount) {
    foods.push(spawnFood());
  }

  for (const id in players) {
    const p = players[id];
    const speed = getSpeed(p.radius);
    const maxR = p.isBot ? diff.botMaxRadius : MAX_RADIUS;

    if (p.radius > maxR) p.radius = maxR;

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
        p.radius = Math.min(maxR, p.radius + f.value * 0.5);
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
        addKill(p.name, o.name, p.color, o.color);

        if (connections[otherId] && connections[otherId].readyState === 1) {
          connections[otherId].send(JSON.stringify({
            type: 'death',
            killer: p.name || 'Anon',
          }));
        }

        const pMax = p.isBot ? diff.botMaxRadius : MAX_RADIUS;
        p.radius = Math.min(pMax, p.radius + o.radius * 0.5);
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
    countdown,
    round,
  });

  broadcast(gameState);
}

setInterval(gameLoop, 1000 / TICK_RATE);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`⚡ CyberVoid running on port ${PORT}`);
});
