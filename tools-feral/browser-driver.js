// Drives the REAL game in a browser with the test bot (local testing only; never part of the shipped game).
// In the page:  load /__dev/bot.js and /__dev/browser-driver.js, then DZFDev.play({ speed: 1, shop: true }).
(function () {
  const D = window.DZF;
  const dev = (window.DZFDev = { stats: { frames: 0, updMs: 0, maxMs: 0 }, errors: [] });
  window.addEventListener('error', (e) => dev.errors.push(String(e.message) + ' @' + e.filename + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => dev.errors.push('promise: ' + e.reason));
  let bot = null, gameRef = null;
  dev.play = function (opt) {
    opt = opt || {};
    D.dev = {
      speed: opt.speed || 1,
      input: function (g) {
        if (gameRef !== g) { gameRef = g; bot = window.DZFBot.bot(g, opt.shop === false ? [] : window.DZFBot.SHOP_FULL(g.map)); }
        const i = bot(), t0 = performance.now();
        dev.stats.frames++; dev.last = t0;
        return { mx: i.mx, my: i.my, fire: i.fire, reload: i.reload, interactPressed: i.interactPressed, interactHeld: i.interactHeld, swap: 0, slot: i.slot, pause: false, aimVec: { x: Math.cos(i.aim), y: Math.sin(i.aim) }, aimFrom: 'bot' };
      },
    };
    if (D.main.state() !== 'play') D.main.start();
  };
  // the page's own animation timer is slow in an unfocused test browser, so the test steps the real game loop itself: n frames of 1/60 s (each one runs input, rules, sound hooks, HUD and drawing)
  dev.run = function (n) { const t0 = performance.now(); let worst = 0; for (let i = 0; i < n; i++) { const a = performance.now(); D.main.tick(1 / 60); const d = performance.now() - a; if (d > worst) worst = d; const g = D.main.game(); if (!g || g.over || D.main.state() !== 'play') { n = i + 1; break; } } return { frames: n, avgMs: +((performance.now() - t0) / n).toFixed(2), worstMs: +worst.toFixed(1), state: dev.state() }; };
  dev.stop = function () { D.dev = null; };
  dev.state = function () { const g = D.main.game(); return g ? { round: g.round, kills: g.kills, pts: Math.floor(g.points), hp: Math.round(g.player.hp), alive: g.enemies.length, state: g.state, over: g.over, weapons: g.player.weapons.map((w) => w.id + (w.up ? '*' : '')), perks: Object.keys(g.player.perks).filter((k) => g.player.perks[k]), doors: g.map.doors.filter((d) => d.open).length, ui: D.main.state() } : { ui: D.main.state() }; };
  // frame-time probe: how long one update+draw takes (the machine here is not a phone, but it shows what the cost is)
  dev.perf = function (n) {
    const g = D.main.game(); if (!g) return null; const t0 = performance.now(); let worst = 0;
    for (let i = 0; i < n; i++) { const a = performance.now(); g.update(1 / 60, {}); g.events.length = 0; D.render.draw(g, 1 / 60, null); worst = Math.max(worst, performance.now() - a); }
    return { avgMs: +((performance.now() - t0) / n).toFixed(2), worstMs: +worst.toFixed(2), enemies: g.enemies.length };
  };
})();
