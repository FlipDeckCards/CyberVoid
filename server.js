const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Leaderboard (in-memory, resets on redeploy)
let leaderboard = [];
const MAX_ENTRIES = 10;

app.get('/api/leaderboard', (req, res) => {
  res.json(leaderboard);
});

app.post('/api/leaderboard', (req, res) => {
  const { name, score, wave } = req.body;
  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const entry = {
    name: String(name).slice(0, 16),
    score: Math.floor(score),
    wave: wave || 0,
    time: Date.now(),
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > MAX_ENTRIES) {
    leaderboard = leaderboard.slice(0, MAX_ENTRIES);
  }

  const rank = leaderboard.findIndex((e) => e.time === entry.time) + 1;
  res.json({ rank: rank > 0 ? rank : null });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`⚡ DEADZONE running on port ${PORT}`);
});
