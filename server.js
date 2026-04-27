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
let claimedCallsigns = {}; // { "CALLSIGN": { token, email } }  ◄ CHANGED

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
  const { callsign, score, wave, kills, token, email } = req.body; // ◄ CHANGED
  if (!callsign || score === undefined) {
    return res.status(400).json({ error: 'Missing callsign or score' });
  }

  // Update email link if provided  ◄ NEW
  const upper = callsign.toUpperCase();
  if (email && claimedCallsigns[upper]) {
    claimedCallsigns[upper].email = email.toLowerCase();
  }

  leaderboard.push({
    callsign: upper,
    score,
    wave,
    kills,
    email: email ? email.toLowerCase() : null, // ◄ NEW
    date: Date.now()
  });
  if (leaderboard.length > 100) {
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 100);
  }
  res.json({ success: true });
});

// Check / claim a callsign  ◄ CHANGED
app.post('/api/check-callsign', (req, res) => {
  const { callsign, token, email } = req.body;
  if (!callsign) return res.status(400).json({ error: 'Missing callsign' });

  const upper = callsign.toUpperCase();
  const owner = claimedCallsigns[upper];

  if (!owner) {
    // Not claimed — claim it
    claimedCallsigns[upper] = {
      token: token,
      email: email ? email.toLowerCase() : null
    };
    return res.json({ available: true });
  }

  // Same session token
  if (owner.token === token) {
    if (email && !owner.email) owner.email = email.toLowerCase();
    return res.json({ available: true });
  }

  // Same email — allow + update token for new device
  if (email && owner.email && owner.email === email.toLowerCase()) {
    owner.token = token;
    return res.json({ available: true });
  }

  // Taken by someone else
  res.json({ available: false });
});

// Get callsign linked to an email  ◄ NEW
app.post('/api/get-callsign', (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ callsign: null });

  const lower = email.toLowerCase();
  for (const [callsign, owner] of Object.entries(claimedCallsigns)) {
    if (owner.email === lower) {
      return res.json({ callsign: callsign });
    }
  }
  res.json({ callsign: null });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DEADZONE running on port ${PORT}`);
});
