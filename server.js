const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Register / link callsign to email
app.post('/api/register', async (req, res) => {
    const { email, callsign } = req.body;
    if (!callsign || callsign.length < 2 || callsign.length > 20)
        return res.status(400).json({ error: 'Callsign: 2-20 chars' });
    try {
        if (email) {
            const exists = await pool.query('SELECT id, callsign FROM players WHERE email=$1', [email.toLowerCase()]);
            if (exists.rows.length) {
                // Email already registered — update callsign
                await pool.query('UPDATE players SET callsign=$1 WHERE email=$2', [callsign, email.toLowerCase()]);
                return res.json({ callsign, linked: true });
            }
            // New email registration
            await pool.query('INSERT INTO players (email, callsign) VALUES ($1, $2)', [email.toLowerCase(), callsign]);
            return res.json({ callsign, linked: true });
        }
        // No email — just store callsign
        const r = await pool.query('INSERT INTO players (callsign) VALUES ($1) RETURNING id', [callsign]);
        res.json({ callsign, player_id: r.rows[0].id });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Lookup callsign by email
app.get('/api/callsign', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });
    try {
        const r = await pool.query('SELECT callsign FROM players WHERE email=$1', [email.toLowerCase()]);
        res.json({ callsign: r.rows.length ? r.rows[0].callsign : null });
    } catch (e) {
        console.error('Callsign lookup error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit score
app.post('/api/score', async (req, res) => {
    const { callsign, score, wave, kills } = req.body;
    if (!callsign || score == null)
        return res.status(400).json({ error: 'Missing fields' });
    try {
        const p = await pool.query('SELECT id FROM players WHERE callsign=$1 ORDER BY id DESC LIMIT 1', [callsign]);
        const pid = p.rows.length ? p.rows[0].id : null;
        await pool.query(
            'INSERT INTO scores (player_id, callsign, score, wave, kills) VALUES ($1,$2,$3,$4,$5)',
            [pid, callsign, score, wave, kills]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Score submit error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Leaderboard — top 25
app.get('/api/leaderboard', async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT callsign, score, wave, kills FROM scores ORDER BY score DESC LIMIT 25'
        );
        res.json(r.rows);
    } catch (e) {
        console.error('Leaderboard error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve zombies index
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`DEADZONE running on port ${PORT}`);
});
