// Test helpers for the Feral 3.0 page: window.H.start() boots a game; H.adv(sec) steps it; H.look(tx,ty,aim,pitch) teleports; H.shot(name) saves the 3D canvas to public/feral3/shots/<name>.jpg
(function () {
  const F = window.__feral3; if (!F) throw new Error('game not ready');
  const H = window.H = {};
  H.adv = (s) => { for (let i = 0; i < Math.round(s * 60); i++) F.tick(1 / 60); };
  H.start = async () => { F.I.noLock = true; if (F.state() === 'menu') { F.action('play'); await new Promise((r) => setTimeout(r, 300)); F.action('start'); } H.adv(0.3); const g = F.game(); g.timer = 99999; return g; };
  H.look = (tx, ty, a, pitch = 0) => { const g = F.game(); g.player.x = tx * 16; g.player.y = ty * 16; g.player.aim = a; F.view.pitch = pitch; g.timer = 99999; g.enemies.length = 0; H.adv(0.4); };
  H.shot = async (name) => { F.tick(0.0001); const c = document.getElementById('gl'); const u = c.toDataURL('image/jpeg', 0.9); const b = await (await fetch(u)).blob(); await fetch('/__save?path=' + encodeURIComponent('shots/' + name + '.jpg'), { method: 'POST', body: b }); return 1; };
  H.put = (t, dx, dy, yaw) => { const g = F.game(), P = g.player, e = g.spawnEnemy(t, P.x + dx, P.y + dy); e.speed = 0.01; e.hp = e.maxHp = 99999; H.adv(0.1); if (yaw != null) F.creatures().vis.get(e.id).lockYaw = yaw; return e; };
  H.F = F;
})();
