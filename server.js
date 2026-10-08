const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Storage. Postgres when DATABASE_URL works (tables are created automatically);
// otherwise a JSON file, so sign-up, login and the leaderboard never fail with
// "Server error" just because the database is missing. The file lives on the
// server's own disk and is wiped on every redeploy on Render's free plan, so a
// working DATABASE_URL is still needed for permanent accounts.
// ---------------------------------------------------------------------------
let pool = null;
try {
    if (process.env.DATABASE_URL) {
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
            max: 5
        });
        pool.on('error', e => console.error('[db] pool error:', e.message));
    }
} catch (e) { console.error('[db] pg unavailable:', e.message); }

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'store.json');
let fileData = { accounts: [], scores: [], secret: crypto.randomBytes(32).toString('hex'), nextId: 1 };
try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) fileData = Object.assign(fileData, JSON.parse(fs.readFileSync(FILE, 'utf8')));
} catch (e) { console.error('[file] load failed:', e.message); }
let saveTimer = null;
function saveFile() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try { fs.writeFileSync(FILE, JSON.stringify(fileData)); } catch (e) { console.error('[file] save failed:', e.message); }
    }, 300);
}

const fileStore = {
    name: 'file',
    async findAccount(key) {
        const k = key.toLowerCase();
        return fileData.accounts.find(a => a.callsign.toLowerCase() === k || (a.email && a.email === k)) || null;
    },
    async createAccount(a) {
        if (fileData.accounts.some(x => x.callsign.toLowerCase() === a.callsign.toLowerCase())) return { dup: 'callsign' };
        if (a.email && fileData.accounts.some(x => x.email === a.email)) return { dup: 'email' };
        const row = { id: fileData.nextId++, callsign: a.callsign, email: a.email || null, hash: a.hash, salt: a.salt, tokv: 0, created: Date.now() };
        fileData.accounts.push(row); saveFile();
        return { account: row };
    },
    async bumpToken(id) { const a = fileData.accounts.find(x => x.id === id); if (a) { a.tokv++; saveFile(); } },
    async addScore(s) {
        fileData.scores.push(s);
        if (fileData.scores.length > 5000) { fileData.scores.sort((a, b) => b.score - a.score); fileData.scores.length = 2000; }
        saveFile();
    },
    async top(n) {
        return fileData.scores.slice().sort((a, b) => b.score - a.score).slice(0, n)
            .map(s => ({ callsign: s.callsign, score: s.score, wave: s.wave, kills: s.kills }));
    },
    async getById(id) { return fileData.accounts.find(a => a.id === id) || null; }
};

const pgStore = {
    name: 'postgres',
    async init() {
        await pool.query(`CREATE TABLE IF NOT EXISTS dz_accounts (
            id SERIAL PRIMARY KEY, callsign TEXT NOT NULL, email TEXT, hash TEXT NOT NULL, salt TEXT NOT NULL,
            tokv INTEGER NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS dz_accounts_callsign ON dz_accounts (lower(callsign))');
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS dz_accounts_email ON dz_accounts (email) WHERE email IS NOT NULL');
        await pool.query(`CREATE TABLE IF NOT EXISTS dz_scores (
            id SERIAL PRIMARY KEY, callsign TEXT NOT NULL, score INTEGER NOT NULL, wave INTEGER NOT NULL DEFAULT 0,
            kills INTEGER NOT NULL DEFAULT 0, created TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await pool.query('CREATE INDEX IF NOT EXISTS dz_scores_score ON dz_scores (score DESC)');
    },
    async findAccount(key) {
        const k = key.toLowerCase();
        const r = await pool.query('SELECT * FROM dz_accounts WHERE lower(callsign)=$1 OR email=$1 LIMIT 1', [k]);
        return r.rows[0] || null;
    },
    async createAccount(a) {
        try {
            const r = await pool.query('INSERT INTO dz_accounts (callsign, email, hash, salt) VALUES ($1,$2,$3,$4) RETURNING *',
                [a.callsign, a.email || null, a.hash, a.salt]);
            return { account: r.rows[0] };
        } catch (e) {
            if (e.code === '23505') return { dup: /email/.test(e.constraint || '') ? 'email' : 'callsign' };
            throw e;
        }
    },
    async bumpToken(id) { await pool.query('UPDATE dz_accounts SET tokv=tokv+1 WHERE id=$1', [id]); },
    async addScore(s) {
        await pool.query('INSERT INTO dz_scores (callsign, score, wave, kills) VALUES ($1,$2,$3,$4)', [s.callsign, s.score, s.wave, s.kills]);
    },
    async top(n) {
        const r = await pool.query('SELECT callsign, score, wave, kills FROM dz_scores ORDER BY score DESC LIMIT $1', [n]);
        return r.rows;
    },
    async getById(id) {
        const r = await pool.query('SELECT * FROM dz_accounts WHERE id=$1', [id]);
        return r.rows[0] || null;
    }
};

// Which store is live. Start on the file store, switch to Postgres as soon as it answers,
// fall back again if it stops answering.
let store = fileStore;
let dbNote = pool ? 'connecting' : 'DATABASE_URL not set';
async function checkDb() {
    if (!pool) return;
    try {
        if (store !== pgStore) await pgStore.init();
        await pool.query('SELECT 1');
        if (store !== pgStore) console.log('[db] Postgres connected - using it for accounts and scores');
        store = pgStore; dbNote = 'ok';
    } catch (e) {
        if (store === pgStore || dbNote === 'connecting') console.error('[db] Postgres unavailable (' + (e.code || e.message) + ') - using the file store');
        store = fileStore; dbNote = e.code || e.message;
    }
}
checkDb();
setInterval(checkDb, 60000).unref();

// Run a store call; if Postgres fails mid-request, drop to the file store and retry once.
async function withStore(fn) {
    try { return await fn(store); }
    catch (e) {
        if (store === pgStore) {
            console.error('[db] request failed (' + (e.code || e.message) + ') - falling back to the file store');
            store = fileStore; dbNote = e.code || e.message;
            return fn(store);
        }
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Passwords (scrypt) and session tokens (HMAC signed, revoked by bumping tokv on logout)
// ---------------------------------------------------------------------------
const SECRET = process.env.SESSION_SECRET || fileData.secret;
saveFile();
const TOKEN_DAYS = 30;
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 32).toString('hex'); }
function makeToken(acc) {
    const body = Buffer.from(JSON.stringify({ i: acc.id, v: acc.tokv, e: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
    return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
async function authFrom(req) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : (req.body && req.body.token) || '';
    const [body, sig] = String(t).split('.');
    if (!body || !sig) return null;
    const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
    if (!p || p.e < Date.now()) return null;
    const acc = await withStore(s => s.getById(p.i));
    return acc && acc.tokv === p.v ? acc : null;
}

// Tiny in-memory rate limit (per IP) for sign-up / login attempts.
const tries = new Map();
function limited(req, max) {
    const ip = req.ip || 'x', now = Date.now();
    const rec = (tries.get(ip) || []).filter(t => now - t < 10 * 60000);
    rec.push(now); tries.set(ip, rec);
    if (tries.size > 5000) tries.clear();
    return rec.length > max;
}

const CALLSIGN_RE = /^[A-Za-z0-9 _.\-]{2,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const publicAcc = a => ({ callsign: a.callsign, email: a.email ? a.email.replace(/^(.).*(@.*)$/, '$1***$2') : null });
function fail(res, code, msg) { return res.status(code).json({ error: msg }); }

app.post('/api/signup', async (req, res) => {
    try {
        if (limited(req, 20)) return fail(res, 429, 'Too many attempts - wait a few minutes');
        const b = req.body || {};
        const callsign = String(b.callsign || '').trim();
        const email = String(b.email || '').trim().toLowerCase();
        const password = String(b.password || '');
        if (!CALLSIGN_RE.test(callsign)) return fail(res, 400, 'Callsign: 2-20 letters, numbers, space . _ -');
        if (email && !EMAIL_RE.test(email)) return fail(res, 400, 'That email address does not look right');
        if (password.length < 6 || password.length > 100) return fail(res, 400, 'Password: at least 6 characters');
        const salt = crypto.randomBytes(16).toString('hex');
        const r = await withStore(s => s.createAccount({ callsign, email: email || null, hash: hashPw(password, salt), salt }));
        if (r.dup) return fail(res, 409, r.dup === 'email' ? 'That email already has an account - log in instead' : 'That callsign is taken');
        res.json({ token: makeToken(r.account), ...publicAcc(r.account) });
    } catch (e) { console.error('Signup error:', e); fail(res, 500, 'Server error - try again'); }
});

app.post('/api/login', async (req, res) => {
    try {
        if (limited(req, 30)) return fail(res, 429, 'Too many attempts - wait a few minutes');
        const b = req.body || {};
        const key = String(b.login || b.callsign || b.email || '').trim();
        const password = String(b.password || '');
        if (!key || !password) return fail(res, 400, 'Enter your callsign (or email) and password');
        const acc = await withStore(s => s.findAccount(key));
        const salt = acc ? acc.salt : '00';
        const got = Buffer.from(hashPw(password, salt), 'hex');
        const ok = acc && crypto.timingSafeEqual(got, Buffer.from(acc.hash, 'hex'));
        if (!ok) return fail(res, 401, 'Wrong callsign or password');
        res.json({ token: makeToken(acc), ...publicAcc(acc) });
    } catch (e) { console.error('Login error:', e); fail(res, 500, 'Server error - try again'); }
});

app.post('/api/logout', async (req, res) => {
    try {
        const acc = await authFrom(req);
        if (acc) await withStore(s => s.bumpToken(acc.id));
        res.json({ ok: true });
    } catch (e) { console.error('Logout error:', e); res.json({ ok: true }); }
});

app.get('/api/me', async (req, res) => {
    try {
        const acc = await authFrom(req);
        if (!acc) return fail(res, 401, 'Not logged in');
        res.json(publicAcc(acc));
    } catch (e) { console.error('Me error:', e); fail(res, 500, 'Server error'); }
});

// Old guest endpoint: kept so older cached clients keep working. Nothing is stored.
app.post('/api/register', (req, res) => {
    const callsign = String((req.body || {}).callsign || '').trim();
    if (!CALLSIGN_RE.test(callsign)) return fail(res, 400, 'Callsign: 2-20 chars');
    res.json({ callsign, guest: true });
});

app.post('/api/score', async (req, res) => {
    try {
        const b = req.body || {};
        const acc = await authFrom(req);
        const callsign = acc ? acc.callsign : String(b.callsign || '').trim();
        const score = Math.floor(Number(b.score)), wave = Math.floor(Number(b.wave) || 0), kills = Math.floor(Number(b.kills) || 0);
        if (!CALLSIGN_RE.test(callsign) || !Number.isFinite(score)) return fail(res, 400, 'Missing fields');
        if (score < 0 || score > 5e7 || wave < 0 || wave > 999 || kills < 0 || kills > 99999) return fail(res, 400, 'Score rejected');
        await withStore(s => s.addScore({ callsign, score, wave, kills }));
        res.json({ ok: true, account: !!acc });
    } catch (e) { console.error('Score submit error:', e); fail(res, 500, 'Server error'); }
});

app.get('/api/leaderboard', async (req, res) => {
    try { res.json(await withStore(s => s.top(25))); }
    catch (e) { console.error('Leaderboard error:', e); res.json([]); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, store: store.name, db: dbNote === 'ok' ? 'ok' : (pool ? 'down' : 'not configured') }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`DEADZONE running on port ${PORT}`);
});
