const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════
//  IN-MEMORY STORAGE
//  Scores reset on server restart.
//  Add a database later for persistence.
// ═══════════════════════════════════════
let leaderboard = [];
let claimedCallsigns = {}; // { "CALLSIGN": sessionToken }

// ═══════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════

// Get top 10 leaderboard
app.get('/api/leaderboard', (req, res) => {
  const top10 = [...leaderboard]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(top10);
});

// Submit a score
app.post('/api/score', (req, res) => {
  const { callsign, score, wave, kills } = req.body;
  if (!callsign || score === undefined) {
    return res.status(400).json({ error: 'Missing callsign or score' });
  }
  leaderboard.push({
    callsign: callsign.toUpperCase(),
    score,
    wave,
    kills,
    date: Date.now()
  });
  // Keep only top 100 to prevent memory bloat
  if (leaderboard.length > 100) {
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 100);
  }
  res.json({ success: true });
});

// Check / claim a callsign
app.post('/api/check-callsign', (req, res) => {
  const { callsign, token } = req.body;
  if (!callsign) return res.status(400).json({ error: 'Missing callsign' });

  const upper = callsign.toUpperCase();
  const owner = claimedCallsigns[upper];

  if (!owner) {
    // Not claimed — claim it for this session
    claimedCallsigns[upper] = token;
    return res.json({ available: true });
  }

  if (owner === token) {
    // Same player returning — allow
    return res.json({ available: true });
  }

  // Taken by someone else
  res.json({ available: false });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DEADZONE running on port ${PORT}`);
});
