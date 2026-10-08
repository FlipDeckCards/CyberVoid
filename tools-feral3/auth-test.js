// End-to-end check of the Zombies account API. Usage: node tools-feral3/auth-test.js [baseUrl]
const base = process.argv[2] || 'http://localhost:3100';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function call(path, method, body, token) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j };
}
(async () => {
    const n = 'T' + Date.now().toString(36).slice(-7), pw = 'pw-' + Math.random().toString(36).slice(2, 10), em = n.toLowerCase() + '@example.com';
    let r = await call('/api/health', 'GET'); ok(r.s === 200, 'health ' + JSON.stringify(r.j));
    r = await call('/api/signup', 'POST', { callsign: 'x', password: pw }); ok(r.s === 400, 'short callsign rejected');
    r = await call('/api/signup', 'POST', { callsign: n, password: '123' }); ok(r.s === 400, 'short password rejected');
    r = await call('/api/signup', 'POST', { callsign: n, password: pw, email: 'nope' }); ok(r.s === 400, 'bad email rejected');
    r = await call('/api/signup', 'POST', { callsign: n, password: pw, email: em }); ok(r.s === 200 && r.j.token, 'sign-up works');
    const tok1 = r.j && r.j.token;
    r = await call('/api/signup', 'POST', { callsign: n.toLowerCase(), password: pw }); ok(r.s === 409, 'duplicate callsign (any case) rejected');
    r = await call('/api/signup', 'POST', { callsign: n + 'b', password: pw, email: em }); ok(r.s === 409, 'duplicate email rejected');
    r = await call('/api/me', 'GET', null, tok1); ok(r.s === 200 && r.j.callsign === n, 'me with sign-up token');
    r = await call('/api/login', 'POST', { login: n, password: 'wrongpass' }); ok(r.s === 401, 'wrong password rejected');
    r = await call('/api/login', 'POST', { login: 'nobody' + n, password: pw }); ok(r.s === 401, 'unknown user rejected');
    r = await call('/api/login', 'POST', { login: n, password: pw }); ok(r.s === 200 && r.j.token, 'login by callsign');
    const tok2 = r.j && r.j.token;
    r = await call('/api/login', 'POST', { login: em, password: pw }); ok(r.s === 200 && r.j.token, 'login by email');
    r = await call('/api/me', 'GET', null, 'garbage.token'); ok(r.s === 401, 'garbage token rejected');
    r = await call('/api/score', 'POST', { score: 4321, wave: 7, kills: 55 }, tok2); ok(r.s === 200 && r.j.account, 'score as account (callsign from token)');
    r = await call('/api/score', 'POST', { callsign: 'Guest One', score: 100, wave: 1, kills: 3 }); ok(r.s === 200, 'guest score');
    r = await call('/api/score', 'POST', { callsign: 'Cheat', score: 1e12 }); ok(r.s === 400, 'absurd score rejected');
    r = await call('/api/leaderboard', 'GET'); ok(r.s === 200 && Array.isArray(r.j) && r.j.some(x => x.callsign === n && x.score === 4321), 'leaderboard lists the account score');
    r = await call('/api/logout', 'POST', {}, tok2); ok(r.s === 200, 'logout');
    r = await call('/api/me', 'GET', null, tok2); ok(r.s === 401, 'token dead after logout');
    r = await call('/api/me', 'GET', null, tok1); ok(r.s === 401, 'other tokens of the account dead too');
    r = await call('/api/login', 'POST', { login: n, password: pw }); ok(r.s === 200, 're-login after logout');
    console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
