// Feral 2.0 - the first-person weapon: a 2D sprite sheet drawn over the 3D view, with walking bob, sprint lower, recoil kick, turn sway, reload and swap animations.
// The picture comes from art/manifest.json (weapons.<id>.view); this file only knows how to move it.
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = D.art;
  const VM = (D.viewmodel = { fireT: 9, swapT: 9, kick: 0, sway: 0, swayY: 0, lastW: null });
  let cv, x, tmp, tx, W = 1, H = 1;
  VM.init = function (canvas) { cv = canvas; x = cv.getContext('2d'); tmp = document.createElement('canvas'); tx = tmp.getContext('2d'); };
  VM.resize = function (w, h, dpr) { if (!cv) return; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); W = cv.width; H = cv.height; };
  VM.event = function (e) {
    if (e.t === 'shot') { VM.fireT = 0; VM.kick = Math.min(1.6, VM.kick + (D.WEAPONS[e.w].recoil || 0.5) * 0.35 + 0.25); }
    else if (e.t === 'swap') VM.swapT = 0;
    else if (e.t === 'reload') VM.swapT = 9;
  };
  VM.reset = function () { VM.fireT = 9; VM.swapT = 0.1; VM.kick = 0; VM.sway = 0; VM.swayY = 0; };
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

  VM.draw = function (g, dt, view) {
    if (!x) return; x.clearRect(0, 0, W, H); if (!g || g.over && (view.deadT || 0) > 0.6) return;
    const P = g.player, w = P.weapons[P.cur], art = A.weapons[w.id]; if (!art) return;
    const v = art.def.view, img = art.view.img, cols = art.view.cols, fw = v.frameWidth, fh = v.frameHeight;
    VM.fireT += dt; VM.swapT += dt; VM.kick = Math.max(0, VM.kick - dt * 6);
    // which animation row/frame
    let anim = 'idle', f = 0; const an = v.animations;
    if (P.reload > 0 && an.reload) { anim = 'reload'; const prog = 1 - P.reload / (P.reloadTotal || P.reload); f = Math.min(an.reload.frames - 1, Math.floor(prog * an.reload.frames)); }
    else if (an.fire && VM.fireT * an.fire.fps < an.fire.frames) { anim = 'fire'; f = Math.floor(VM.fireT * an.fire.fps); }
    const row = an[anim].row;
    // motion
    const sc = v.scale, hgt = H * sc, wid = hgt * fw / fh, moving = P.moving ? 1 : 0, sprint = view.sprint && moving ? 1 : 0, bob = P.bob;
    VM.mv = (VM.mv || 0) + (moving - (VM.mv || 0)) * Math.min(1, dt * 8); VM.sp = (VM.sp || 0) + (sprint - (VM.sp || 0)) * Math.min(1, dt * 8);
    const turn = view.turnRate || 0; VM.sway += (-turn * 0.012 - VM.sway) * Math.min(1, dt * 8); VM.swayY += ((view.pitchRate || 0) * -0.012 - VM.swayY) * Math.min(1, dt * 8);
    let ox = Math.sin(bob * 0.5) * W * 0.011 * VM.mv * (1 + VM.sp * 0.8) + VM.sway * W, oy = Math.abs(Math.cos(bob * 0.5)) * H * 0.016 * VM.mv * (1 + VM.sp * 0.8) + VM.swayY * H;
    oy += VM.sp * H * 0.07 + VM.kick * H * 0.035; ox += VM.sp * W * 0.03;
    if (VM.swapT < 0.26) oy += H * 0.5 * (1 - ease(VM.swapT / 0.26));
    if (anim === 'reload') { const prog = 1 - P.reload / (P.reloadTotal || P.reload); oy += Math.sin(prog * Math.PI) * H * 0.05; }
    const zoom = view.zoom > 1.05 ? (view.zoom - 1) * 0.35 : 0; oy += zoom * H * 0.1; ox -= zoom * W * 0.04;
    const px = W / 2 + (v.offset.x || 0) * W - v.anchor.x * wid + ox, py = H * (1 + (v.offset.y || 0)) - v.anchor.y * hgt + oy;
    const flash = anim === 'fire' && VM.fireT < 0.07;
    // draw the frame (tinted by the light around the player; gold for an upgraded gun)
    const dw = Math.ceil(wid), dh = Math.ceil(hgt);
    if (tmp.width !== dw || tmp.height !== dh) { tmp.width = dw; tmp.height = dh; }
    tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, dw, dh); tx.drawImage(img, f * fw, row * fh, fw, fh, 0, 0, dw, dh);
    tx.globalCompositeOperation = 'source-atop';
    const lit = Math.min(1, Math.max(0.35, view.light == null ? 1 : view.light)) + (flash ? 0.4 : 0);
    if (lit < 0.98) { tx.fillStyle = 'rgba(8,4,20,' + (0.8 * (1 - lit)).toFixed(3) + ')'; tx.fillRect(0, 0, dw, dh); }
    if (w.up) { tx.fillStyle = 'rgba(255,200,40,0.28)'; tx.fillRect(0, 0, dw, dh); }
    x.imageSmoothingEnabled = true; x.drawImage(tmp, px, py);
    if (flash) {                                         // a soft glow at the muzzle
      const mx = px + v.muzzle.x * wid, my = py + v.muzzle.y * hgt, c = D.WEAPONS[w.id].color, r = hgt * 0.45;
      x.save(); x.globalCompositeOperation = 'lighter'; const gr = x.createRadialGradient(mx, my, 0, mx, my, r); gr.addColorStop(0, c + 'cc'); gr.addColorStop(0.35, c + '55'); gr.addColorStop(1, c + '00'); x.fillStyle = gr; x.fillRect(mx - r, my - r, r * 2, r * 2); x.restore();
    }
  };
})();
