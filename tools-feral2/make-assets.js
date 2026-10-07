// Generates the install icons and the portal card picture for Feral 2.0 from the game's own sprites, and saves them via the local test server.
// In the page (localhost:5173/feral2/):  load /__dev/make-assets.js  ->  await DZF2Assets.all()
(function () {
  const D = window.DZF, A = D.art;
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const TAU = Math.PI * 2;
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function glow(x, cx, cy, r, c0, c1) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, c0); g.addColorStop(1, c1 || 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function creature(x, name, anim, col, cx, bottom, hgt, flip, alpha, tint) {
    const c = A.creatures[name], def = c.def, fr = A.frame(def, anim || 'idle', 0, 0), w = hgt * def.frameWidth / def.frameHeight, ay = def.anchor.y;
    x.save(); x.globalAlpha = alpha == null ? 1 : alpha; x.translate(cx, bottom); if (flip) x.scale(-1, 1); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(c.img, fr.col * def.frameWidth, fr.row * def.frameHeight, def.frameWidth, def.frameHeight, -w / 2, -hgt * ay, w, hgt);
    if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(-w / 2, -hgt * ay, w, hgt); }
    x.restore(); void col;
  }
  function shadow(x, cx, y, rx) { x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.ellipse(cx, y, rx, rx * 0.24, 0, 0, TAU); x.fill(); }
  function save(canvas, rel, type, q) { return new Promise((res) => canvas.toBlob((b) => fetch('/__save?path=' + encodeURIComponent(rel), { method: 'POST', body: b }).then((r) => r.text()).then(res), type || 'image/png', q)); }

  // a barn hallway seen in perspective, with beams, planks and hanging lanterns
  function hall(x, W, H, vx, vy) {
    const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0d0820'); sky.addColorStop(1, '#241238'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
    // far wall with a glowing doorway
    const fw = W * 0.34, fh = H * 0.30, fx = vx - fw / 2, fy = vy - fh * 0.52;
    x.fillStyle = '#3a2418'; x.fillRect(fx, fy, fw, fh);
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#4a2e1e' : '#331f14'; x.fillRect(fx + i * fw / 9, fy, fw / 9 - 2, fh); }
    glow(x, vx, vy, W * 0.55, 'rgba(255,170,80,0.75)', 'rgba(255,170,80,0)');
    x.fillStyle = '#ffd68a'; x.fillRect(vx - fw * 0.14, fy + fh * 0.22, fw * 0.28, fh * 0.78);
    // floor
    x.fillStyle = '#4a2c1c'; x.beginPath(); x.moveTo(fx, fy + fh); x.lineTo(fx + fw, fy + fh); x.lineTo(W + 80, H); x.lineTo(-80, H); x.closePath(); x.fill();
    for (let i = -8; i <= 8; i++) { x.strokeStyle = 'rgba(20,8,4,0.55)'; x.lineWidth = 2; x.beginPath(); x.moveTo(vx + i * fw / 16, fy + fh); x.lineTo(vx + i * W * 0.2, H); x.stroke(); }
    for (let k = 1; k < 9; k++) { const t = Math.pow(k / 9, 2.1), y = fy + fh + (H - fy - fh) * t; x.strokeStyle = 'rgba(20,8,4,0.5)'; x.lineWidth = 1 + t * 3; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    const fl = x.createLinearGradient(0, fy + fh, 0, H); fl.addColorStop(0, 'rgba(255,170,80,0.28)'); fl.addColorStop(1, 'rgba(0,0,0,0.55)'); x.fillStyle = fl; x.fillRect(0, fy + fh, W, H - fy - fh);
    // side walls
    for (const s of [-1, 1]) {
      x.fillStyle = '#2f1d14'; x.beginPath(); x.moveTo(vx + s * fw / 2, fy); x.lineTo(vx + s * fw / 2, fy + fh); x.lineTo(s < 0 ? -80 : W + 80, H); x.lineTo(s < 0 ? -80 : W + 80, -80); x.closePath(); x.fill();
      for (let i = 1; i < 8; i++) { const t = i / 8, px = vx + s * (fw / 2 + (W / 2 + 80 - fw / 2) * Math.pow(t, 1.6)); x.strokeStyle = 'rgba(10,4,2,0.6)'; x.lineWidth = 2 + t * 5; x.beginPath(); x.moveTo(px, fy + (-80 - fy) * Math.pow(t, 1.6)); x.lineTo(px, fy + fh + (H - fy - fh) * Math.pow(t, 1.6)); x.stroke(); }
    }
    // ceiling beams
    x.fillStyle = '#1d120c'; x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + fw, fy); x.lineTo(W + 80, -80); x.lineTo(-80, -80); x.closePath(); x.fill();
    for (let k = 1; k < 7; k++) { const t = Math.pow(k / 7, 1.9), y = fy + (-20 - fy) * t, hw = fw / 2 + (W / 2 + 80 - fw / 2) * t; x.strokeStyle = '#4a2e1e'; x.lineWidth = 3 + t * 9; x.beginPath(); x.moveTo(vx - hw, y); x.lineTo(vx + hw, y); x.stroke(); }
    // lanterns
    for (const [lx, ly, r] of [[W * 0.2, H * 0.18, 70], [W * 0.82, H * 0.2, 60], [W * 0.5, H * 0.1, 50]]) { glow(x, lx, ly, r * 3, 'rgba(255,190,90,0.7)', 'rgba(255,190,90,0)'); x.fillStyle = '#3a2418'; x.fillRect(lx - 2, -10, 4, ly + 10); x.fillStyle = '#ffe9a8'; x.fillRect(lx - 11, ly - 14, 22, 28); x.strokeStyle = '#1a0e08'; x.lineWidth = 3; x.strokeRect(lx - 11, ly - 14, 22, 28); }
    // dust and sparks
    for (let i = 0; i < 46; i++) { x.fillStyle = 'rgba(255,220,150,' + (0.2 + rnd() * 0.5) + ')'; const s = 1 + rnd() * 3; x.fillRect(rnd() * W, rnd() * H * 0.8, s, s); }
  }
  function gun(x, cx, bottom, hgt) {
    const w = A.weapons.pip, v = w.def.view, hh = hgt, ww = hgt * v.frameWidth / v.frameHeight;
    x.save(); x.imageSmoothingQuality = 'high'; x.drawImage(w.view.img, 0, 0, v.frameWidth, v.frameHeight, cx - ww / 2, bottom - hh, ww, hh); x.restore();
  }
  function card() {
    const W = 600, H = 800, c = cv(W, H), x = c.getContext('2d'); seed = 11;
    hall(x, W, H, W * 0.5, H * 0.43);
    // the cast, back to front
    creature(x, 'wisper', 'idle', null, 215, 400, 120, false, 0.9); creature(x, 'zapling', 'walk', null, 385, 420, 100);
    shadow(x, 300, 452, 90); creature(x, 'mossmaw', 'idle', null, 300, 456, 210);
    shadow(x, 120, 596, 120); creature(x, 'spitbud', 'idle', null, 505, 560, 250, true);
    shadow(x, 205, 640, 170); creature(x, 'glumpkin', 'attack', null, 180, 648, 410);
    creature(x, 'boomkit', 'idle', null, 435, 612, 150, true);
    gun(x, 395, 840, 470);
    glow(x, 395, 450, 130, 'rgba(255,230,150,0.35)', 'rgba(255,230,150,0)');
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return c;
  }
  function icon(size, maskable) {
    const c = cv(size, size), x = c.getContext('2d'); seed = 5;
    const g = x.createRadialGradient(size / 2, size * 0.45, size * 0.05, size / 2, size / 2, size * 0.75); g.addColorStop(0, '#5a3a22'); g.addColorStop(0.6, '#241238'); g.addColorStop(1, '#0b0715'); x.fillStyle = g; x.fillRect(0, 0, size, size);
    const k = maskable ? 0.78 : 1;
    // little hallway lines
    x.strokeStyle = 'rgba(255,190,120,0.18)'; x.lineWidth = Math.max(1, size / 120); for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(size / 2, size * 0.42); x.lineTo(size / 2 + i * size * 0.22, size); x.stroke(); }
    glow(x, size / 2, size * 0.42, size * 0.5 * k, 'rgba(255,190,100,0.65)', 'rgba(255,190,100,0)');
    creature(x, 'wisper', 'idle', null, size * 0.76, size * (0.5 + 0.12 * k), size * 0.36 * k, false, 0.9); creature(x, 'zapling', 'idle', null, size * 0.24, size * (0.54 + 0.1 * k), size * 0.3 * k);
    shadow(x, size / 2, size * (0.5 + 0.36 * k), size * 0.26 * k); creature(x, 'glumpkin', 'attack', null, size / 2, size * (0.5 + 0.36 * k), size * 0.66 * k);
    return c;
  }
  window.DZF2Assets = {
    all: async function () {
      const out = [];
      out.push(await save(icon(192), 'icons/icon-192.png')); out.push(await save(icon(512), 'icons/icon-512.png'));
      out.push(await save(icon(192, true), 'icons/maskable-192.png')); out.push(await save(icon(512, true), 'icons/maskable-512.png'));
      out.push(await save(icon(180), 'icons/apple-touch-icon.png'));
      out.push(await save(card(), 'card-thumb.jpg', 'image/jpeg', 0.9));
      return out;
    }, icon, card,
  };
})();
