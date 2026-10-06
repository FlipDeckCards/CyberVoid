// Dead Zone: Feral - all the art, drawn in code at startup (no image files). Each sprite is drawn small, then "crisped": soft edges are snapped to hard pixels and a dark
// outline is added, which gives a consistent chunky pixel look that stays readable on a phone. Everything is cached in canvases, so drawing a frame is just drawImage.
(function () {
  const D = (window.DZF = window.DZF || {});
  const A = (D.art = {});
  const OUT = '#150a26';
  const TAU = Math.PI * 2;

  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rect = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  const oval = (x, c, cx, cy, rx, ry, rot) => { x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); x.fill(); };
  const poly = (x, c, pts) => { x.fillStyle = c; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); };
  const line = (x, c, a, b, d, e, w) => { x.strokeStyle = c; x.lineWidth = w || 1; x.beginPath(); x.moveTo(a, b); x.lineTo(d, e); x.stroke(); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // snap alpha to 0/255 (hard pixels) and add a 1px outline around the shape
  function crisp(c, outline) {
    const w = c.width, h = c.height, x = c.getContext('2d'), im = x.getImageData(0, 0, w, h), d = im.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
    if (outline !== false) {
      const o = hex(outline || OUT), src = new Uint8ClampedArray(d);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4; if (src[i + 3]) continue;
        if ((xx > 0 && src[i - 4 + 3]) || (xx < w - 1 && src[i + 4 + 3]) || (yy > 0 && src[i - w * 4 + 3]) || (yy < h - 1 && src[i + w * 4 + 3])) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255; }
      }
    }
    x.putImageData(im, 0, 0); return c;
  }
  function sprite(w, h, fn, outline) { const c = cv(w, h), x = c.getContext('2d'); fn(x, w, h); return crisp(c, outline); }
  const flashCache = new WeakMap();
  A.flash = function (c) {                       // a white copy of a sprite, drawn for a moment when it is hit
    let f = flashCache.get(c); if (f) return f;
    f = cv(c.width, c.height); const x = f.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height);
    flashCache.set(c, f); return f;
  };
  const tintCache = new WeakMap();
  A.tinted = function (c, color, a) {            // a copy with a colour washed over it (not used per frame)
    let m = tintCache.get(c); if (!m) tintCache.set(c, (m = {})); const k = color + a; if (m[k]) return m[k];
    const t = cv(c.width, c.height), x = t.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = color; x.fillRect(0, 0, t.width, t.height); return (m[k] = t);
  };

  // ============================== creatures ==============================
  // Glumpkin: a slow pumpkin blob with one bad eye and a stitched grin. sizes 3/2/1 (it splits when hit)
  function glumpkin(size, f) {
    const s = [0, 0.55, 0.78, 1][size], W = Math.ceil(30 * s) + 2, H = Math.ceil(30 * s) + 2;
    return sprite(W, H, (x) => {
      const cx = W / 2, bob = [0, -1, 0, -1][f] * (size > 1 ? 1 : 0.6), cy = H * 0.58 + bob, rx = 12 * s, ry = 10.2 * s * (1 + [0, 0.05, 0, 0.05][f]);
      // feet
      const fo = [-1, 1, 1, -1][f] * s; oval(x, '#7a3a1a', cx - 5 * s + fo, H - 3 * s, 3 * s, 2 * s); oval(x, '#7a3a1a', cx + 5 * s - fo, H - 3 * s, 3 * s, 2 * s);
      oval(x, '#d9741a', cx, cy, rx, ry);
      oval(x, '#f59a2f', cx, cy - 0.6 * s, rx - 1.2 * s, ry - 1.2 * s);
      // ridges
      x.strokeStyle = '#c2631a'; x.lineWidth = Math.max(1, s); for (const k of [-0.55, 0, 0.55]) { x.beginPath(); x.ellipse(cx + k * rx * 0.7, cy, rx * 0.34, ry * 0.95, 0, 0, TAU); x.stroke(); }
      oval(x, '#ffc86a', cx - rx * 0.45, cy - ry * 0.55, rx * 0.22, ry * 0.14, -0.5);
      // zombie patch (grey-green, stitched)
      x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.clip(); oval(x, '#5a8a6a', cx + rx * 0.62, cy - ry * 0.1, rx * 0.4, ry * 0.8); x.restore();
      if (size > 1) { for (let i = -2; i <= 2; i++) rect(x, '#2d3b33', Math.round(cx + rx * 0.22), Math.round(cy - ry * 0.5 + i * 2 * s), Math.max(1, Math.round(3 * s)), 1); }
      // stem + curl
      rect(x, '#3f7d3a', Math.round(cx - 2 * s), Math.round(cy - ry - 4 * s), Math.max(2, Math.round(4 * s)), Math.max(2, Math.round(5 * s)));
      rect(x, '#5fb04a', Math.round(cx - 2 * s), Math.round(cy - ry - 4 * s), Math.max(1, Math.round(1.5 * s)), Math.max(2, Math.round(5 * s)));
      oval(x, '#3f7d3a', cx + 4 * s, cy - ry - 3 * s, 2.2 * s, 1.5 * s);
      // eyes: one big glowing, one crossed out
      oval(x, '#f2ffb0', cx - 4 * s, cy - 2 * s, 3.2 * s, 3.6 * s); oval(x, '#c8ff3a', cx - 4 * s, cy - 2 * s, 2.2 * s, 2.6 * s); rect(x, '#2a0c1a', Math.round(cx - 4.4 * s), Math.round(cy - 3 * s), Math.max(1, Math.round(1.6 * s)), Math.max(2, Math.round(3 * s)));
      if (size > 1) { line(x, '#2a0c1a', cx + 2 * s, cy - 4 * s, cx + 6 * s, cy, Math.max(1, s * 0.9)); line(x, '#2a0c1a', cx + 6 * s, cy - 4 * s, cx + 2 * s, cy, Math.max(1, s * 0.9)); } else rect(x, '#2a0c1a', Math.round(cx + 2 * s), Math.round(cy - 3 * s), 2, 2);
      // mouth
      const my = cy + 4 * s; rect(x, '#2a0c1a', Math.round(cx - 6 * s), Math.round(my - 1), Math.round(12 * s), Math.max(2, Math.round(3 * s)));
      if (size > 1) for (let i = 0; i < 4; i++) rect(x, '#fff3c8', Math.round(cx - 5 * s + i * 3 * s), Math.round(my - 1), Math.max(1, Math.round(1.5 * s)), Math.max(1, Math.round(1.6 * s)));
      rect(x, '#7dff5c', Math.round(cx - 3 * s), Math.round(my + 2 * s), Math.max(1, Math.round(1.5 * s)), Math.max(1, Math.round((2 + [0, 1, 2, 1][f]) * s)));   // ooze
    });
  }
  // Zapling: a twitchy sprout full of static
  function zapling(f) {
    return sprite(20, 22, (x) => {
      const bob = [0, -1, 0, 1][f] || 0, wind = f === 4, dash = f === 5, sx = dash ? 1.25 : 1, sy = dash ? 0.82 : wind ? 0.86 : 1;
      x.save(); x.translate(10, 14 + bob); x.scale(sx, sy);
      for (const k of [-4, 0, 4]) line(x, '#3a6a2a', k, 5, k * 1.4, 8, 1.5);       // root feet
      const lf = Math.sin(f * 1.6) * 0.3; oval(x, '#2f9a4a', -5, -8, 4.6, 2.2, -0.9 + lf); oval(x, '#2f9a4a', 5, -8, 4.6, 2.2, 0.9 - lf); oval(x, '#5ed06a', -5, -8.5, 3.2, 1.2, -0.9 + lf); oval(x, '#5ed06a', 5, -8.5, 3.2, 1.2, 0.9 - lf);
      oval(x, '#3fae5a', 0, 0, 7, 6.4); oval(x, '#7be98a', 0, 1.6, 5.2, 3.8);
      const e = wind ? 1.2 : 0, px = [-1, 1, 0, 1][f] || 0;
      oval(x, '#fff', -3, -1, 2.6 + e, 3 + e); oval(x, '#fff', 3.2, -1, 2.6 + e, 3 + e); rect(x, '#2a0c1a', -3 + px - 0.5, -1.5, 1.6, 2.6); rect(x, '#2a0c1a', 3.2 + px - 0.5, -1.5, 1.6, 2.6);
      line(x, '#2a0c1a', -3, 4, -1, 5, 1); line(x, '#2a0c1a', -1, 5, 1, 4, 1); line(x, '#2a0c1a', 1, 4, 3, 5, 1);
      x.restore();
      // static: a zig-zag of yellow between the leaves
      const zx = 10, zy = 5 + bob; x.strokeStyle = wind || dash ? '#ffffff' : '#fff04a'; x.lineWidth = 1; x.beginPath(); x.moveTo(zx - 4, zy + 1); x.lineTo(zx - 1, zy - 1 - (f & 1)); x.lineTo(zx + 1, zy + 1); x.lineTo(zx + 4, zy - 1 - ((f + 1) & 1)); x.stroke();
    });
  }
  // Wisper: a floating ghost with hollow eyes that drifts through walls
  function wisper(f) {
    return sprite(22, 26, (x) => {
      const w = Math.sin(f * 1.57) * 1.2;
      x.fillStyle = '#d8e6ff'; x.beginPath(); x.moveTo(3, 12); x.bezierCurveTo(3, 2, 19, 2, 19, 12); x.lineTo(19, 21 + w);
      for (let i = 0; i < 4; i++) x.lineTo(19 - (i + 0.5) * 4, (i & 1 ? 21 : 24) + (i & 1 ? w : -w)); x.lineTo(3, 21 - w); x.closePath(); x.fill();
      oval(x, '#f2f7ff', 9, 8, 5, 3.4, -0.3);
      oval(x, '#2a1050', 7.5, 11, 2.6, 3.4); oval(x, '#2a1050', 14.5, 11, 2.6, 3.4); oval(x, '#e08aff', 7.5, 11.6, 1.2, 1.8); oval(x, '#e08aff', 14.5, 11.6, 1.2, 1.8);
      oval(x, '#2a1050', 11, 17, 2.2, 1.6 + (f & 1) * 0.6);
      poly(x, '#8fe8ff', [11, 0, 8.6, 4, 13.4, 4]); oval(x, '#c8f6ff', 11, 3.2, 1.4, 1.2);      // a little spirit flame
      oval(x, '#9fb4ff', 4, 16 + w * 0.4, 1.8, 3);                                                 // a slightly darker side
    });
  }
  // Mossmaw: a big mossy tank with mushrooms on its back
  function mossmaw(f, elder) {
    const s = elder ? 1.45 : 1, W = Math.round(42 * s), H = Math.round(36 * s);
    return sprite(W, H, (x) => {
      const cx = W / 2, bob = [0, -1, 0, -1][f] * s, cy = H * 0.52 + bob, k = (n) => n * s;
      const fo = [-1, 1, 1, -1][f] * s;
      for (const [lx, fl] of [[-13, 1], [-5, -1], [5, 1], [13, -1]]) oval(x, '#3d4f3a', cx + k(lx), H - k(4), k(4.4), k(3.2) + fl * fo * 0.4);
      oval(x, elder ? '#4a6a45' : '#52704b', cx, cy, k(18), k(13.5));
      oval(x, elder ? '#6c9a58' : '#71915d', cx, cy - k(1.5), k(16), k(11)); oval(x, '#3f5a3d', cx, cy + k(9), k(14), k(4));
      for (const [mx, my, mr] of [[-9, -7, 4.2], [4, -9, 5.4], [11, -4, 3.4], [-1, -3, 3]]) oval(x, '#8fcf6a', cx + k(mx), cy + k(my), k(mr), k(mr * 0.62));     // moss patches
      for (const [mx, my] of [[-9, -10], [7, -12]]) { rect(x, '#efe2c4', cx + k(mx) - k(1), cy + k(my), k(2), k(4)); oval(x, '#e0475a', cx + k(mx), cy + k(my) - 0.5, k(3.4), k(2.4)); rect(x, '#fff', Math.round(cx + k(mx) - 1), Math.round(cy + k(my) - 2), 1, 1); rect(x, '#fff', Math.round(cx + k(mx) + 1.5), Math.round(cy + k(my) - 1), 1, 1); }
      for (const [ax, ay, bx, by] of [[-4, 0, -2, 4], [8, -2, 6, 3]]) line(x, '#33463a', cx + k(ax), cy + k(ay), cx + k(bx), cy + k(by), 1);     // cracks
      // face: a wide jaw full of teeth, angry red eyes
      rect(x, '#25131f', Math.round(cx - k(11)), Math.round(cy + k(1)), Math.round(k(22)), Math.round(k(7.5)));
      for (let i = 0; i < 6; i++) { poly(x, '#fff3c8', [cx - k(10) + i * k(4), cy + k(1), cx - k(8) + i * k(4), cy + k(1), cx - k(9) + i * k(4), cy + k(5)]); }
      for (let i = 0; i < 4; i++) poly(x, '#fff3c8', [cx - k(8) + i * k(5), cy + k(8.5), cx - k(6) + i * k(5), cy + k(8.5), cx - k(7) + i * k(5), cy + k(5)]);
      oval(x, '#ffefa0', cx - k(6), cy - k(3), k(3.2), k(2.6)); oval(x, '#ffefa0', cx + k(6), cy - k(3), k(3.2), k(2.6)); oval(x, '#ff3a3a', cx - k(6), cy - k(3), k(1.7), k(1.7)); oval(x, '#ff3a3a', cx + k(6), cy - k(3), k(1.7), k(1.7));
      line(x, '#1b0f14', cx - k(10), cy - k(7), cx - k(3), cy - k(4.6), Math.max(1, k(1.4))); line(x, '#1b0f14', cx + k(10), cy - k(7), cx + k(3), cy - k(4.6), Math.max(1, k(1.4)));
      if (elder) {                                                          // dead-branch crown and glowing runes
        for (const [bx, by, ex, ey] of [[-12, -10, -16, -22], [-5, -12, -7, -24], [3, -12, 4, -25], [10, -10, 15, -21], [0, -11, 0, -19]]) { line(x, '#5a3d24', cx + k(bx), cy + k(by), cx + k(ex), cy + k(ey), Math.max(1.5, k(1.6))); line(x, '#5a3d24', cx + k(ex), cy + k(ey), cx + k(ex) + k(2), cy + k(ey) - k(3), 1); }
        for (const [rx, ry] of [[-12, 4], [12, 4], [0, 9]]) { oval(x, '#b6ff8a', cx + k(rx), cy + k(ry), k(1.8), k(1.8)); }
      }
    });
  }
  // Boomkit: a tiny round bomb-cat with a lit fuse tail
  function boomkit(f) {
    return sprite(18, 20, (x) => {
      const bob = [0, -1, 0, -1][f] || 0, cy = 12 + bob;
      oval(x, '#3a2c52', 9, cy, 7, 6.2); oval(x, '#51407a', 9, cy - 1, 5.6, 4.4);
      poly(x, '#3a2c52', [3, cy - 4, 4, cy - 10, 8, cy - 5]); poly(x, '#3a2c52', [15, cy - 4, 14, cy - 10, 10, cy - 5]); poly(x, '#ff7aa8', [4.3, cy - 5, 4.6, cy - 8, 6.6, cy - 5.2]); poly(x, '#ff7aa8', [13.7, cy - 5, 13.4, cy - 8, 11.4, cy - 5.2]);
      oval(x, '#fff', 6.4, cy - 1, 2.4, 2.8); oval(x, '#fff', 11.8, cy - 1, 2.4, 2.8); rect(x, '#1a0f2a', 6, cy - 1.6, 1.6, 2); rect(x, '#1a0f2a', 11.4, cy - 1.6, 1.6, 2);
      oval(x, '#ff7aa8', 4.6, cy + 2.4, 1.8, 1.2); oval(x, '#ff7aa8', 13.8, cy + 2.4, 1.8, 1.2);
      line(x, '#1a0f2a', 7.5, cy + 3.4, 9, cy + 4.4, 1); line(x, '#1a0f2a', 9, cy + 4.4, 10.5, cy + 3.4, 1);
      line(x, '#6a5a3a', 9, cy - 6, 12 + (f & 1), 1, 1.2); oval(x, f & 1 ? '#fff0a0' : '#ff9a30', 12 + (f & 1), 1, 2, 2);          // the fuse
    });
  }
  // Spitbud: a flower bud that spits glowing spores
  function spitbud(f) {
    return sprite(22, 26, (x) => {
      const sway = Math.sin(f * 1.57) * 1.2, open = f === 2 ? 1.6 : 0;
      rect(x, '#3b8a46', 10 + sway * 0.3, 14, 3, 10); oval(x, '#4fae5a', 6, 21, 4.6, 1.8, -0.5); oval(x, '#4fae5a', 16, 20, 4.6, 1.8, 0.5);
      for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) oval(x, a === 0 ? '#ff8ae0' : '#e04cc0', 11 + sway + Math.sin(a) * 7, 9 - Math.cos(a) * 3 + Math.abs(a) * 2, 3.6, 5.6, a);
      oval(x, '#7a1f6a', 11 + sway, 10, 5.6 + open * 0.5, 4.6 + open); oval(x, '#2a0c2a', 11 + sway, 10.6, 4.2, 3.2 + open * 0.7);
      for (const dx of [-3, 0, 3]) poly(x, '#fff3c8', [11 + sway + dx - 1, 8, 11 + sway + dx + 1, 8, 11 + sway + dx, 11]);
      oval(x, '#f9ff7a', 11 + sway, 12.5, 1.2, 1.2); oval(x, '#f9ff7a', 8 + sway, 13.5, 0.9, 0.9);
      rect(x, '#fff', 8.4 + sway, 3.4, 1, 1); rect(x, '#fff', 13.4 + sway, 3.4, 1, 1);
    });
  }

  // ============================== the player ("Pip", a kid in a yellow raincoat with a lantern) ==============================
  function pip(f) {
    return sprite(18, 24, (x) => {
      const walk = f < 4, bob = walk ? [0, -1, 0, -1][f] : 0, step = walk ? [-1.5, 0, 1.5, 0][f] : 0, cx = 9;
      oval(x, '#2a2036', cx - 2.6 + step, 21.5, 2.2, 1.7); oval(x, '#2a2036', cx + 2.6 - step, 21.5, 2.2, 1.7);                         // boots
      oval(x, '#ffcf3a', cx, 15 + bob, 5.8, 6.4); oval(x, '#ffe27a', cx - 1, 14 + bob, 3.6, 4.4);                                                // raincoat
      rect(x, '#d99a1a', cx - 5, 18 + bob, 10, 1.6);
      oval(x, '#ffcf3a', cx, 8 + bob, 6.6, 6.4); poly(x, '#ffcf3a', [cx - 2.4, 3.2 + bob, cx, -0.4 + bob, cx + 2.4, 3.2 + bob]); oval(x, '#ffe27a', cx - 2, 6 + bob, 2.8, 2.4);   // hood with a point
      oval(x, '#f4c9a0', cx, 9.6 + bob, 4.4, 3.8); oval(x, '#2a2036', cx - 1.7, 9.6 + bob, 0.9, 1.2); oval(x, '#2a2036', cx + 1.9, 9.6 + bob, 0.9, 1.2); oval(x, '#ff9aa0', cx - 3, 11.4 + bob, 1, 0.7); oval(x, '#ff9aa0', cx + 3.2, 11.4 + bob, 1, 0.7);
      rect(x, '#8a6a4a', cx - 6.5, 14.4 + bob, 1.2, 3); oval(x, '#ffa63d', cx - 6, 18.2 + bob, 1.8, 2); oval(x, '#fff0a0', cx - 6, 18 + bob, 0.8, 1);     // the lantern on its strap
    });
  }

  // ============================== weapons (drawn pointing right, 16x10) ==============================
  const WSPR = {
    pip: (x) => { rect(x, '#3a8a9a', 2, 4, 9, 4); rect(x, '#7fe6f2', 2, 4, 9, 1); rect(x, '#ffe27a', 11, 4.5, 3, 3); rect(x, '#2a5a6a', 3, 7, 3, 3); oval(x, '#ffe27a', 14.5, 6, 1, 1); },
    rattle: (x) => { rect(x, '#4a7a3a', 1, 3, 12, 4); rect(x, '#7fd16a', 1, 3, 12, 1); rect(x, '#2a4a24', 12, 4, 3, 2); rect(x, '#3a5a2a', 5, 7, 3, 3); rect(x, '#2a4a24', 8, 7, 2, 2.5); oval(x, '#b6ff8a', 4, 4, 1.2, 1); oval(x, '#b6ff8a', 8, 3.6, 1.2, 1); },
    scatter: (x) => { oval(x, '#e8892a', 5, 5.5, 4.4, 3.4); oval(x, '#ffb35c', 4, 4.4, 2.2, 1.4); rect(x, '#8a5a2a', 8, 4, 7, 3); rect(x, '#5a3a1a', 13, 3.4, 2.5, 4.2); rect(x, '#3f7d3a', 4, 1, 2, 2); },
    longthorn: (x) => { rect(x, '#c24a8a', 1, 4.4, 13, 3); rect(x, '#ff7ab8', 1, 4.4, 13, 1); rect(x, '#8a2a5a', 13, 4.8, 3, 2); poly(x, '#fff0f6', [4, 4.4, 5.4, 1.2, 6.6, 4.4]); poly(x, '#fff0f6', [8, 4.4, 9.4, 1.6, 10.6, 4.4]); rect(x, '#5a2a4a', 2, 7.4, 3, 2.6); },
    bubble: (x) => { rect(x, '#3aa6c8', 2, 3, 9, 5); rect(x, '#9ff0ff', 2, 3, 9, 1.4); oval(x, '#7fe6ff', 12, 5.5, 3.4, 3.4); oval(x, '#d8fbff', 11, 4.2, 1.2, 1.2); rect(x, '#2a7a9a', 4, 8, 3, 2); },
    sunbeam: (x) => { rect(x, '#d8a82a', 2, 4, 8, 4); oval(x, '#fff27a', 11, 6, 3.6, 3.6); oval(x, '#fff', 11, 6, 1.6, 1.6); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(x, '#fff27a', 11 + Math.cos(a) * 3.6, 6 + Math.sin(a) * 3.6, 11 + Math.cos(a) * 5.2, 6 + Math.sin(a) * 5.2, 1); } rect(x, '#9a6a1a', 3, 8, 3, 2); },
    party: (x) => { poly(x, '#ff8ae6', [1, 5.4, 12, 2, 12, 9]); rect(x, '#ffd0f4', 1, 5, 4, 1); oval(x, '#7fe6ff', 6, 6, 0.9, 0.9); oval(x, '#ffe27a', 9, 5, 0.9, 0.9); oval(x, '#9dff8a', 9, 7.4, 0.9, 0.9); rect(x, '#8a2a7a', 11.5, 2.6, 3, 5.8); rect(x, '#fff', 14, 3.4, 1, 1); rect(x, '#ffe27a', 14.6, 6.2, 1, 1); },
  };
  A.weapon = {}; A.weaponUp = {};
  for (const id in WSPR) {
    A.weapon[id] = sprite(18, 12, (x) => WSPR[id](x));
    A.weaponUp[id] = (function () { const t = A.tinted(A.weapon[id], '#ffd84a', 0.55); return t; })();
  }

  // ============================== props and icons ==============================
  A.icon = { power: {}, perk: {} };
  A.icon.power.ammo = sprite(16, 16, (x) => { oval(x, '#b6783a', 8, 9.6, 5.2, 5.6); oval(x, '#d9a05a', 6.6, 8, 2.2, 2.6); rect(x, '#6a4a22', 6, 3, 4, 2.6); rect(x, '#3f7d3a', 7.4, 1, 1.4, 3); oval(x, '#fff0a0', 11, 6, 1, 1.4); });
  A.icon.power.twin = sprite(16, 16, (x) => { for (const [cx, cy, r] of [[5, 6, 4.4], [11, 10, 4.4]]) { poly(x, '#ffd84a', [cx, cy - r, cx + r * 0.3, cy - r * 0.3, cx + r, cy - r * 0.2, cx + r * 0.45, cy + r * 0.25, cx + r * 0.62, cy + r, cx, cy + r * 0.5, cx - r * 0.62, cy + r, cx - r * 0.45, cy + r * 0.25, cx - r, cy - r * 0.2, cx - r * 0.3, cy - r * 0.3]); oval(x, '#fff3a0', cx - 1, cy - 1, 1, 1); } });
  A.icon.power.boom = sprite(16, 16, (x) => { oval(x, '#ff4a6a', 8, 10, 5.4, 5.2); oval(x, '#ff8aa0', 6.4, 8.4, 1.8, 1.6); rect(x, '#6a4a22', 7, 2.6, 2, 3); oval(x, '#ffb347', 10, 2.4, 2, 2); oval(x, '#fff0a0', 10, 2.4, 0.9, 0.9); rect(x, '#3f7d3a', 4, 4, 3, 1.6); });
  A.icon.power.zap = sprite(16, 16, (x) => { for (let i = 0; i < 8; i++) { const a = i * TAU / 8; oval(x, '#b78cff', 8 + Math.cos(a) * 4.4, 8 + Math.sin(a) * 4.4, 2.6, 1.6, a); } oval(x, '#fff27a', 8, 8, 2.6, 2.6); poly(x, '#2a1050', [8.6, 4.6, 6.2, 8.4, 8, 8.4, 7.2, 11.6, 10, 7.4, 8.2, 7.4]); });
  A.icon.perk.heart = sprite(16, 16, (x) => { oval(x, '#ff5d8f', 5.6, 6, 3.6, 3.6); oval(x, '#ff5d8f', 10.4, 6, 3.6, 3.6); poly(x, '#ff5d8f', [2.2, 7, 13.8, 7, 8, 14]); oval(x, '#ffb0c8', 5, 5, 1.2, 1.2); rect(x, '#fff', 9.4, 4.2, 1, 1); });
  A.icon.perk.fizz = sprite(16, 16, (x) => { rect(x, '#5dd6ff', 5, 6, 6, 8); rect(x, '#9ff0ff', 5, 6, 2, 8); rect(x, '#e8c27a', 6, 2, 4, 4); rect(x, '#b8423a', 5.4, 1, 5.2, 2); oval(x, '#fff', 9, 9, 0.9, 0.9); oval(x, '#fff', 7.4, 11.4, 0.7, 0.7); });
  A.icon.perk.boots = sprite(16, 16, (x) => { rect(x, '#e8a81a', 3, 2, 6, 9); rect(x, '#ffd24a', 3, 2, 2, 9); poly(x, '#e8a81a', [3, 9, 13, 10, 13, 14, 3, 14]); rect(x, '#5a3a1a', 3, 13, 10, 1.6); poly(x, '#fff', [9, 6, 12, 6, 10, 9]); });
  A.icon.perk.lamp = sprite(16, 16, (x) => { rect(x, '#8a6a4a', 7, 1, 2, 3); rect(x, '#6a4a2a', 4, 3, 8, 2); oval(x, '#ffa63d', 8, 9, 4.6, 5); oval(x, '#fff0a0', 8, 9, 2.4, 3); rect(x, '#6a4a2a', 4, 13, 8, 1.6); });
  A.icon.heartSmall = A.icon.perk.heart;

  // vending-style machines: a cabinet with a coloured sign and a screen, 32x30 (feet on the lower edge)
  function cabinet(color, iconFn) {
    return sprite(34, 32, (x) => {
      rect(x, '#3a2b52', 2, 6, 30, 24); rect(x, '#51407a', 2, 6, 30, 3); rect(x, color, 4, 2, 26, 7); rect(x, '#fff', 5, 3, 3, 1.4);
      rect(x, '#1b1230', 6, 12, 22, 14); rect(x, '#0e0a1c', 7, 13, 20, 12);
      for (let i = 0; i < 4; i++) rect(x, i & 1 ? color : '#ffffff22', 9 + i * 5, 15, 3, 8);
      rect(x, '#2a2036', 4, 27, 26, 3); rect(x, '#ffd24a', 27, 14, 2, 3);
      if (iconFn) iconFn(x);
    });
  }
  A.machine = {
    heart: cabinet('#ff5d8f'), fizz: cabinet('#5dd6ff'), boots: cabinet('#ffd24a'), lamp: cabinet('#ffa63d'),
    box: sprite(34, 26, (x) => { rect(x, '#6a4a2a', 2, 8, 30, 15); rect(x, '#8a6a3a', 2, 8, 30, 3); rect(x, '#4a3018', 2, 20, 30, 3); rect(x, '#ffd24a', 14, 10, 6, 7); rect(x, '#2a1a0a', 16, 12, 2, 3); for (const px of [4, 28]) rect(x, '#3a2a14', px, 8, 2, 15); poly(x, '#7a5a2a', [2, 8, 4, 3, 30, 3, 32, 8]); rect(x, '#ffd24a', 5, 4, 24, 1.4); }),
    boxOpen: sprite(34, 28, (x) => { rect(x, '#6a4a2a', 2, 10, 30, 15); rect(x, '#4a3018', 2, 22, 30, 3); poly(x, '#7a5a2a', [2, 10, 5, 1, 29, 1, 32, 10]); rect(x, '#fff6c0', 5, 11, 24, 8); rect(x, '#ffd24a', 5, 2, 24, 1.4); }),
    anvil: sprite(34, 28, (x) => { rect(x, '#4a3a5a', 8, 20, 18, 5); poly(x, '#7a6a8a', [4, 8, 30, 8, 26, 14, 21, 14, 21, 20, 13, 20, 13, 14, 9, 14]); rect(x, '#a89ac0', 4, 8, 26, 2); oval(x, '#ffe27a', 17, 5, 2, 2); rect(x, '#ffe27a', 16.4, 1, 1.2, 8); rect(x, '#ffe27a', 13, 4.4, 8, 1.2); }),
  };
  A.poster = sprite(18, 18, (x) => { rect(x, '#6a4a2a', 0, 0, 18, 18); rect(x, '#e8dcc0', 2, 2, 14, 14); for (const [px, py] of [[1, 1], [16, 1], [1, 16], [16, 16]]) rect(x, '#3a2a14', px, py, 1, 1); rect(x, '#d4c4a0', 2, 12, 14, 4); });
  A.glow = {};
  A.glowOf = function (color, r) {
    const k = color + r; if (A.glow[k]) return A.glow[k];
    const c = cv(r * 2, r * 2), x = c.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r), h = hex(color);
    g.addColorStop(0, 'rgba(' + h.join(',') + ',0.85)'); g.addColorStop(0.45, 'rgba(' + h.join(',') + ',0.28)'); g.addColorStop(1, 'rgba(' + h.join(',') + ',0)');
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2); return (A.glow[k] = c);
  };

  // ============================== the sprite tables ==============================
  A.glump = [null, [], [], []]; for (let s = 1; s <= 3; s++) for (let f = 0; f < 4; f++) A.glump[s].push(glumpkin(s, f));
  A.zap = []; for (let f = 0; f < 6; f++) A.zap.push(zapling(f));
  A.wisp = []; for (let f = 0; f < 4; f++) A.wisp.push(wisper(f));
  A.moss = []; A.elder = []; for (let f = 0; f < 4; f++) { A.moss.push(mossmaw(f, false)); A.elder.push(mossmaw(f, true)); }
  A.boom = []; for (let f = 0; f < 4; f++) A.boom.push(boomkit(f));
  A.spit = []; for (let f = 0; f < 4; f++) A.spit.push(spitbud(f));
  A.pip = []; for (let f = 0; f < 5; f++) A.pip.push(pip(f));

  // ============================== the world: floors, walls, scenery (drawn once into one big canvas) ==============================
  const FLOORS = {
    barn:  { a: '#5a3f2e', b: '#664735', c: '#4a3326', grain: '#3a281c' },
    patch: { a: '#2f5a3a', b: '#376643', c: '#254a30', grain: '#1c3a26' },
    mill:  { a: '#5a5a6a', b: '#666678', c: '#4a4a5a', grain: '#383848' },
    crypt: { a: '#3a3f4a', b: '#444a56', c: '#2e323c', grain: '#242730' },
    pond:  { a: '#6a5238', b: '#775d42', c: '#58442e', grain: '#3e2e1e' },
  };
  function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function floorTile(theme, x, y) {
    const f = FLOORS[theme], c = cv(16, 16), g = c.getContext('2d'), r = hash(x, y, 1);
    rect(g, r < 0.33 ? f.a : r < 0.66 ? f.b : f.c, 0, 0, 16, 16);
    if (theme === 'barn') { rect(g, f.grain, 0, 15, 16, 1); rect(g, f.grain, (x * 5 + y * 3) % 12 + 2, 0, 1, 15); for (let i = 0; i < 3; i++) rect(g, f.grain, Math.floor(hash(x, y, 10 + i) * 14), Math.floor(hash(x, y, 20 + i) * 14), 2, 1); }
    else if (theme === 'patch') { for (let i = 0; i < 6; i++) { const px = Math.floor(hash(x, y, 30 + i) * 15), py = Math.floor(hash(x, y, 40 + i) * 15); rect(g, hash(x, y, 50 + i) > 0.5 ? '#4a8a4a' : f.grain, px, py, 1, 2); } if (hash(x, y, 7) > 0.93) { oval(g, '#ffb3d9', 8, 8, 1.4, 1.4); rect(g, '#ffe27a', 8, 8, 1, 1); } }
    else if (theme === 'mill') { rect(g, f.grain, 0, 0, 16, 1); rect(g, f.grain, 0, 0, 1, 16); rect(g, '#7a7a8c', 1, 1, 6, 1); if (hash(x, y, 8) > 0.8) rect(g, '#4a7a4a', 3, 9, 3, 2); }
    else if (theme === 'crypt') { rect(g, f.grain, 0, 0, 16, 1); rect(g, f.grain, 0, 0, 1, 16); rect(g, '#4f5662', 1, 1, 14, 1); for (let i = 0; i < 4; i++) rect(g, '#3f6a4a', Math.floor(hash(x, y, 60 + i) * 14), Math.floor(hash(x, y, 70 + i) * 14), 2, 1); }
    else { rect(g, f.grain, 0, 7, 16, 1); rect(g, f.grain, 0, 15, 16, 1); rect(g, '#8a6a4a', 2, 3, 1, 1); rect(g, '#8a6a4a', 13, 11, 1, 1); }
    return c;
  }
  function wallTop(x, y, faceBelow) {
    const c = cv(16, 16), g = c.getContext('2d'), r = hash(x, y, 3);
    rect(g, r < 0.5 ? '#2b2142' : '#30264a', 0, 0, 16, 16); rect(g, '#3a2f58', 0, 0, 16, 2); rect(g, '#1f1731', 0, 14, 16, 2);
    for (let i = 0; i < 4; i++) rect(g, '#3a2f58', Math.floor(hash(x, y, 80 + i) * 14), Math.floor(hash(x, y, 90 + i) * 12) + 2, 2, 1);
    if (faceBelow) { rect(g, '#4a3a2a', 0, 9, 16, 7); rect(g, '#5a4634', 0, 9, 16, 1); rect(g, '#3a2c20', 0, 15, 16, 1); for (let i = 0; i < 3; i++) rect(g, '#3a2c20', i * 5 + 2, 10, 1, 5); }
    return c;
  }
  A.buildWorld = function (map, T) {
    const W = map.w, H = map.h, K = D.K, canvas = cv(W * T, H * T), g = canvas.getContext('2d');
    const themes = map.rooms.map((r) => r.floor);
    const kindAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? K.WALL : map.tiles[y * W + x]);
    rect(g, '#0b0715', 0, 0, W * T, H * T);
    const tileCache = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = map.tiles[y * W + x], a = map.area[y * W + x];
      if (k === K.WALL) {
        // only draw walls near something (the far void stays black)
        let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (kindAt(x + dx, y + dy) !== K.WALL) { near = true; break; }
        if (!near) continue;
        const below = kindAt(x, y + 1) !== K.WALL;
        g.drawImage(wallTop(x, y, below), x * T, y * T);
      } else if (k === K.POCKET) {                         // the dark yard outside a window: mossy ground, tufts and the odd bone
        rect(g, '#1a2024', x * T, y * T, T, T); for (let i = 0; i < 5; i++) rect(g, hash(x, y, 120 + i) > 0.5 ? '#26382c' : '#2a2438', Math.floor(hash(x, y, 100 + i) * 13) + x * T, Math.floor(hash(x, y, 110 + i) * 13) + y * T, 3, 2);
        for (let i = 0; i < 3; i++) { const tx = Math.floor(hash(x, y, 130 + i) * 13) + x * T, ty = Math.floor(hash(x, y, 140 + i) * 11) + y * T; rect(g, '#3a6a44', tx, ty + 1, 1, 3); rect(g, '#4a8a54', tx + 1, ty, 1, 3); }
        if (hash(x, y, 150) > 0.86) { rect(g, '#d8d0c0', x * T + 4, y * T + 8, 5, 2); rect(g, '#d8d0c0', x * T + 3, y * T + 7, 2, 2); } }
      else if (k === K.BARRIER) { const th = themes[a >= 0 ? a : 0]; g.drawImage(floorTile(th, x, y), x * T, y * T); }
      else if (k === K.WATER) { rect(g, '#1e4a6a', x * T, y * T, T, T); rect(g, '#2a6a8a', x * T + 2, y * T + 3, 5, 1); rect(g, '#2a6a8a', x * T + 8, y * T + 10, 6, 1); }
      else {
        const th = themes[a >= 0 ? a : 0], key = th + ((x * 3 + y * 7) & 3);
        g.drawImage(tileCache[key] || (tileCache[key] = floorTile(th, x & 3, y & 3)), x * T, y * T);
      }
    }
    // pond edge
    const [px, py, pw, ph] = map.pond; g.strokeStyle = '#8a6a4a'; g.lineWidth = 2; g.strokeRect(px * T - 1, py * T - 1, pw * T + 2, ph * T + 2);
    for (let i = 0; i < 5; i++) oval(g, '#6ad0ff', (px + 1 + i * 1.3) * T, (py + 1 + (i % 3)) * T, 2, 1);
    for (const b of map.blocks) drawBlock(g, b, T);
    // decoration: a few lanterns, tufts and bones (not on the walkways)
    A.lights = [];
    for (const r of map.rooms) {
      for (const [lx, ly] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) if (kindAt(lx, ly) === K.FLOOR) { drawLantern(g, lx * T, ly * T); A.lights.push({ x: (lx + 0.5) * T, y: (ly + 0.5) * T, color: '#ffa63d', r: 26 }); }
    }
    return canvas;
  };
  function drawLantern(g, x, y) { rect(g, '#2a2036', x + 6, y + 3, 4, 10); rect(g, '#ffa63d', x + 4, y + 5, 8, 6); rect(g, '#fff0a0', x + 6, y + 6, 4, 4); rect(g, '#2a2036', x + 3, y + 3, 10, 2); rect(g, '#2a2036', x + 3, y + 11, 10, 2); }
  function drawBlock(g, b, T) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    if (b.style === 'crate') { rect(g, '#7a5a34', x, y, w, h); rect(g, '#9a7444', x, y, w, 3); rect(g, '#4a3418', x, y + h - 3, w, 3); rect(g, '#5a4020', x + 2, y + 2, w - 4, 1); line(g, '#5a4020', x + 2, y + 3, x + w - 2, y + h - 3, 1); rect(g, '#2a1a0a', x, y, 1, h); rect(g, '#2a1a0a', x + w - 1, y, 1, h); }
    else if (b.style === 'barrel') { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) { oval(g, '#6a4a2a', x + i * T + 8, y + j * T + 8, 7, 7.4); oval(g, '#8a6a3a', x + i * T + 8, y + j * T + 6, 6, 4); rect(g, '#2a2036', x + i * T + 2, y + j * T + 5, 12, 1); rect(g, '#2a2036', x + i * T + 2, y + j * T + 10, 12, 1); } }
    else if (b.style === 'hay') { rect(g, '#d4b04a', x, y, w, h); rect(g, '#e8c862', x, y, w, 3); for (let i = 0; i < 6; i++) rect(g, '#a8882a', x + 2 + i * (w / 6), y + 3, 1, h - 5); rect(g, '#6a4a22', x, y + h / 2 - 1, w, 2); }
    else if (b.style === 'pumpkins') { for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) { oval(g, '#e8892a', x + i * T + 8, y + j * T + 9, 7.6, 6.4); oval(g, '#ffb35c', x + i * T + 6, y + j * T + 7, 3, 2); rect(g, '#3f7d3a', x + i * T + 7, y + j * T + 2, 2, 3); rect(g, '#b8631a', x + i * T + 8, y + j * T + 4, 1, 10); } }
    else if (b.style === 'grave') { for (let j = 0; j < b.h; j++) { const yy = y + j * T; if (j === 0) { oval(g, '#7a8296', x + 8, yy + 7, 6, 6); rect(g, '#7a8296', x + 2, yy + 7, 12, 9); oval(g, '#98a0b4', x + 6, yy + 5, 2, 2); rect(g, '#4a5266', x + 7, yy + 4, 2, 7); rect(g, '#4a5266', x + 5, yy + 6, 6, 2); } else { rect(g, '#7a8296', x + 2, yy, 12, 11); rect(g, '#4a7a4a', x + 1, yy + 10, 14, 4); rect(g, '#3a5a3a', x + 3, yy + 11, 3, 2); } } }
    else rect(g, '#555', x, y, w, h);
  }

  // doors: a chunky plank gate. Drawn per frame (they change when opened), so we keep ready-made sprites per size
  A.door = function (w, h, T) {
    const key = 'door' + w + 'x' + h; if (A[key]) return A[key];
    const c = cv(w * T, h * T), g = c.getContext('2d'), W = w * T, H = h * T;
    rect(g, '#3a2a1a', 0, 0, W, H); const horizontal = w > h;
    if (horizontal) { for (let i = 0; i < w * 2; i++) { rect(g, i & 1 ? '#7a5634' : '#8a6440', i * (W / (w * 2)), 2, W / (w * 2) - 1, H - 4); rect(g, '#5a3c22', i * (W / (w * 2)) + 3, 4, 1, H - 8); } rect(g, '#2a2036', 0, H / 2 - 2, W, 4); }
    else { for (let i = 0; i < h * 2; i++) { rect(g, i & 1 ? '#7a5634' : '#8a6440', 2, i * (H / (h * 2)), W - 4, H / (h * 2) - 1); } rect(g, '#2a2036', W / 2 - 2, 0, 4, H); }
    for (const [px, py] of [[4, 4], [W - 6, 4], [4, H - 6], [W - 6, H - 6]]) { rect(g, '#d8d0c0', px, py, 2, 2); }
    return (A[key] = c);
  };
  A.chain = function () { const c = cv(10, 10), g = c.getContext('2d'); rect(g, '#9a9ab0', 0, 4, 10, 2); rect(g, '#6a6a80', 2, 2, 2, 6); rect(g, '#6a6a80', 6, 2, 2, 6); return c; }();

  // ============================== the pixel font (digits and a few signs), for numbers drawn in the world ==============================
  const DIG = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '!': '010010010000010', '-': '000000111000000', '$': '011110011101110' };
  A.digit = {};
  A.text = function (str, color) {                  // a small canvas with the text in the 3x5 font (cached)
    const k = str + color; if (A.digit[k]) return A.digit[k];
    const c = cv(str.length * 4 + 1, 7), g = c.getContext('2d');
    for (let i = 0; i < str.length; i++) { const p = DIG[str[i]]; if (!p) continue; for (let n = 0; n < 15; n++) if (p[n] === '1') { rect(g, '#000', i * 4 + (n % 3) + 1 + 1, Math.floor(n / 3) + 1 + 1, 1, 1); } }
    for (let i = 0; i < str.length; i++) { const p = DIG[str[i]]; if (!p) continue; for (let n = 0; n < 15; n++) if (p[n] === '1') { rect(g, color, i * 4 + (n % 3) + 1, Math.floor(n / 3) + 1, 1, 1); } }
    return (A.digit[k] = c);
  };
  A.textCache = A.digit;
  // for the HUD and menus: any sprite as a data URL
  A.url = function (c) { return c.toDataURL('image/png'); };
})();
