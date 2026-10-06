// Generates the install icons and the portal card picture from the game's own sprites, and saves them via the local test server.
// In the page (localhost:5173/feral/):  load /__dev/make-assets.js  ->  DZFAssets.all()
(function () {
  const D = window.DZF, A = D.art;
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function stamp(x, spr, cx, bottom, scale, flip) { x.save(); x.imageSmoothingEnabled = false; x.translate(cx, bottom); if (flip) x.scale(-1, 1); x.drawImage(spr, -spr.width * scale / 2, -spr.height * scale, spr.width * scale, spr.height * scale); x.restore(); }
  function shadow(x, cx, y, rx) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(cx, y, rx, rx * 0.28, 0, 0, Math.PI * 2); x.fill(); }
  function stars(x, w, h, n, seed) { let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < n; i++) { x.fillStyle = r() > 0.8 ? '#ffe27a' : '#cdbdf2'; const z = r() > 0.85 ? 3 : 2; x.fillRect(Math.floor(r() * w), Math.floor(r() * h * 0.6), z, z); } }
  function save(canvas, rel, type, q) { return new Promise((res) => canvas.toBlob((b) => fetch('/__save?path=' + encodeURIComponent(rel), { method: 'POST', body: b }).then((r) => r.text()).then(res), type || 'image/png', q)); }

  function icon(size, maskable) {
    const c = cv(size, size), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const g = x.createRadialGradient(size / 2, size * 0.45, size * 0.05, size / 2, size / 2, size * 0.75); g.addColorStop(0, '#4a2a78'); g.addColorStop(0.6, '#1d1236'); g.addColorStop(1, '#0b0715');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    stars(x, size, size, 26, 11);
    const k = maskable ? 0.82 : 1;
    const glowR = size * 0.36 * k, gg = x.createRadialGradient(size / 2, size * 0.52, 0, size / 2, size * 0.52, glowR); gg.addColorStop(0, 'rgba(140,255,106,0.55)'); gg.addColorStop(1, 'rgba(140,255,106,0)'); x.fillStyle = gg; x.fillRect(0, 0, size, size);
    const spr = A.glump[3][0], sc = Math.floor(size * 0.52 * k / spr.height * 4) / 4;
    shadow(x, size / 2, size * (0.5 + 0.3 * k), size * 0.2 * k);
    stamp(x, spr, size / 2, size * (0.5 + 0.3 * k), sc);
    // little friends
    stamp(x, A.zap[0], size * 0.22, size * (0.5 + 0.3 * k), Math.max(1, Math.floor(size * 0.16 * k / A.zap[0].height * 4) / 4));
    stamp(x, A.wisp[0], size * 0.8, size * (0.38 + 0.22 * k), Math.max(1, Math.floor(size * 0.2 * k / A.wisp[0].height * 4) / 4));
    return c;
  }
  function card() {
    const W = 600, H = 800, c = cv(W, H), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#120a2a'); sky.addColorStop(0.55, '#3a1d5a'); sky.addColorStop(1, '#1a0f2a'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
    stars(x, W, H, 70, 5);
    x.fillStyle = '#ffe9b0'; x.beginPath(); x.arc(470, 190, 70, 0, 6.3); x.fill(); x.fillStyle = '#f2d890'; x.beginPath(); x.arc(450, 175, 14, 0, 6.3); x.fill(); x.beginPath(); x.arc(492, 214, 9, 0, 6.3); x.fill();
    const mg = x.createRadialGradient(470, 190, 60, 470, 190, 260); mg.addColorStop(0, 'rgba(255,233,176,0.35)'); mg.addColorStop(1, 'rgba(255,233,176,0)'); x.fillStyle = mg; x.fillRect(0, 0, W, H);
    // hills and a barn
    x.fillStyle = '#150b26'; x.beginPath(); x.moveTo(0, 520); x.quadraticCurveTo(160, 440, 330, 520); x.quadraticCurveTo(470, 580, 600, 500); x.lineTo(600, H); x.lineTo(0, H); x.fill();
    x.fillStyle = '#2a1840'; x.fillRect(60, 470, 150, 90); x.beginPath(); x.moveTo(50, 470); x.lineTo(135, 410); x.lineTo(220, 470); x.fill(); x.fillStyle = '#ffb347'; x.fillRect(120, 505, 26, 40); x.fillRect(80, 490, 14, 14); x.fillRect(172, 490, 14, 14);
    const fg = x.createLinearGradient(0, 560, 0, H); fg.addColorStop(0, '#2a3f2e'); fg.addColorStop(1, '#10180f'); x.fillStyle = fg; x.beginPath(); x.moveTo(0, 600); x.quadraticCurveTo(300, 540, 600, 610); x.lineTo(600, H); x.lineTo(0, H); x.fill();
    // title
    x.textAlign = 'center'; x.lineJoin = 'round'; x.font = '900 86px "Trebuchet MS", "Segoe UI", sans-serif';
    x.lineWidth = 14; x.strokeStyle = '#2a0610'; x.strokeText('DEAD ZONE', W / 2, 108); x.fillStyle = '#ff6a6a'; x.fillText('DEAD ZONE', W / 2, 108);
    x.font = '900 118px "Trebuchet MS", "Segoe UI", sans-serif'; x.lineWidth = 16; x.strokeStyle = '#0a2a08'; x.strokeText('FERAL', W / 2, 218); x.fillStyle = '#8cff6a'; x.fillText('FERAL', W / 2, 218);
    // the cast
    const base = 575;
    stamp(x, A.wisp[0], 92, 355, 6.5); x.globalAlpha = 1;
    stamp(x, A.spit[0], 545, 540, 6);
    shadow(x, 150, base - 10, 90); stamp(x, A.glump[3][0], 150, base, 9, true);
    shadow(x, 460, base - 10, 110); stamp(x, A.moss[0], 450, base + 4, 7);
    shadow(x, 300, base + 40, 70); stamp(x, A.zap[0], 232, base + 30, 7); stamp(x, A.boom[0], 372, base + 30, 7);
    shadow(x, 300, base - 40, 80); stamp(x, A.pip[4], 300, base - 20, 10);
    x.save(); x.translate(300 + 54, base - 20 - 110); x.imageSmoothingEnabled = false; x.drawImage(A.weapon.pip, 0, -6 * 8, 18 * 8, 12 * 8); x.restore();
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return c;
  }
  window.DZFAssets = {
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
