// Feral 3.0 - sound. Every sound id in audio/manifest.json can be a list of real audio files (several variations, picked at random with a little pitch and volume variation);
// when a file is missing the game uses a placeholder it synthesises in code, so nothing is silent. Effects are positional (3D panning, distance, HRTF), all clips are loudness-normalised
// when they load, and the music and the area ambience are layers that fade with the round number and where you are. See audio/README.md for every file the game can use.
const D = window.DZF;
const rand = (a, b) => a + Math.random() * (b - a);
export const AU = { ready: false, vol: { master: 0.8, music: 0.45, sfx: 0.9, amb: 0.7, muted: false }, buffers: {}, manifest: null, loaded: 0, fromFile: 0 };
let ctx = null, master, comp, sfxBus, musBus, ambBus, noiseBuf, listener, duck, voices = 0; const last = {};
const SR = 44100;

// ---------- placeholder synthesis (OfflineAudioContext graphs) ----------
function render(dur, build, stereo) {
  const oc = new OfflineAudioContext(stereo ? 2 : 1, Math.max(64, Math.floor(dur * SR)), SR), nb = oc.createBuffer(1, SR, SR), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const H = {
    t: (type, f0, f1, t0, len, g, att = 0.004, dest) => { const o = oc.createOscillator(), a = oc.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + len); a.gain.setValueAtTime(0.0001, t0); a.gain.linearRampToValueAtTime(g, t0 + att); a.gain.exponentialRampToValueAtTime(0.0001, t0 + len); o.connect(a); a.connect(dest || oc.destination); o.start(t0); o.stop(t0 + len + 0.02); },
    n: (kind, f0, f1, t0, len, g, q = 0.8, att = 0.002, dest) => { const s = oc.createBufferSource(), f = oc.createBiquadFilter(), a = oc.createGain(); s.buffer = nb; s.loop = true; f.type = kind; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + len); f.Q.value = q; a.gain.setValueAtTime(0.0001, t0); a.gain.linearRampToValueAtTime(g, t0 + att); a.gain.exponentialRampToValueAtTime(0.0001, t0 + len); s.connect(f); f.connect(a); a.connect(dest || oc.destination); s.start(t0, Math.random() * 0.5); s.stop(t0 + len + 0.02); },
    oc,
  };
  build(H, oc); return oc.startRendering();
}
// each recipe: [duration, (H, ctx, v) => ...]  v = random variation 0..1
const R = (dur, fn) => ({ dur, fn });
const SYN = {
  pistol_shot: R(0.45, (H, c, v) => { H.n('bandpass', 2600 + v * 800, 500, 0, 0.12, 0.9, 0.7); H.n('lowpass', 1200, 200, 0, 0.35, 0.55, 0.5); H.t('sine', 190 + v * 30, 55, 0, 0.18, 0.75); H.n('highpass', 5000, 3000, 0.0, 0.05, 0.5); H.n('lowpass', 800, 150, 0.04, 0.4, 0.15, 0.5, 0.02); }),
  shotgun_shot: R(0.85, (H, c, v) => { H.n('lowpass', 2500, 120, 0, 0.55, 1.2, 0.6); H.t('sine', 110 + v * 20, 32, 0, 0.5, 1.1); H.n('bandpass', 1800, 400, 0, 0.18, 0.8, 0.8); H.n('lowpass', 500, 90, 0.05, 0.75, 0.35, 0.4, 0.05); }),
  rifle_shot: R(0.5, (H, c, v) => { H.n('bandpass', 3200 + v * 900, 600, 0, 0.1, 0.9, 0.8); H.n('lowpass', 1600, 180, 0, 0.3, 0.6); H.t('square', 240, 70, 0, 0.1, 0.25); H.t('sine', 160, 50, 0, 0.16, 0.55); H.n('lowpass', 700, 120, 0.04, 0.4, 0.14, 0.5, 0.02); }),
  bolt_shot: R(1.1, (H, c, v) => { H.n('lowpass', 3500, 100, 0, 0.7, 1.3, 0.6); H.t('sine', 130, 28, 0, 0.7, 1.2); H.n('bandpass', 2400, 500, 0, 0.12, 1.0, 0.8); H.n('lowpass', 600, 80, 0.06, 1.0, 0.4, 0.4, 0.05); }),
  mg_shot: R(0.38, (H, c, v) => { H.n('bandpass', 2400 + v * 700, 450, 0, 0.09, 0.9, 0.7); H.n('lowpass', 1400, 180, 0, 0.26, 0.55); H.t('sine', 150 + v * 20, 48, 0, 0.14, 0.6); }),
  gun_dry: R(0.1, (H) => { H.n('highpass', 3500, 5000, 0, 0.04, 0.7); H.t('square', 900, 600, 0.0, 0.03, 0.15); }),
  weapon_swap: R(0.3, (H, c, v) => { H.n('bandpass', 1500, 700, 0, 0.1, 0.6, 2); H.t('triangle', 400, 620, 0.02, 0.08, 0.2); H.n('lowpass', 900, 300, 0.12, 0.14, 0.5); }),
  reload_pistol: R(1.4, (H) => { H.n('highpass', 3000, 3000, 0.1, 0.05, 0.6); H.t('square', 300, 200, 0.12, 0.05, 0.15); H.n('lowpass', 1200, 400, 0.5, 0.1, 0.7, 2); H.t('square', 480, 320, 0.9, 0.05, 0.2); H.n('highpass', 2500, 2500, 1.0, 0.06, 0.8); H.n('bandpass', 1800, 900, 1.2, 0.08, 0.6, 2); }),
  reload_shotgun: R(2.6, (H) => { for (let i = 0; i < 6; i++) { H.n('lowpass', 1600, 500, 0.15 + i * 0.28, 0.1, 0.55, 2); H.t('square', 360, 240, 0.15 + i * 0.28, 0.04, 0.1); } H.n('bandpass', 900, 300, 2.0, 0.22, 0.9, 1.5); H.t('square', 140, 90, 2.0, 0.12, 0.25); H.n('bandpass', 1100, 500, 2.25, 0.18, 0.9, 1.5); }),
  reload_rifle: R(2.1, (H) => { H.n('bandpass', 1400, 700, 0.1, 0.1, 0.7, 2); H.t('square', 280, 180, 0.12, 0.06, 0.2); H.n('lowpass', 1300, 400, 0.65, 0.12, 0.8, 2); H.t('square', 360, 260, 0.7, 0.05, 0.2); H.n('highpass', 2500, 2500, 1.2, 0.08, 0.6); H.t('square', 200, 120, 1.6, 0.1, 0.3); H.n('bandpass', 1600, 600, 1.6, 0.1, 0.8, 2); }),
  reload_bolt: R(2.9, (H) => { H.n('bandpass', 1100, 500, 0.15, 0.1, 0.7, 2); for (let i = 0; i < 4; i++) { H.n('lowpass', 1800, 500, 0.6 + i * 0.3, 0.07, 0.6, 2); H.t('square', 420, 300, 0.6 + i * 0.3, 0.03, 0.12); } H.n('bandpass', 1400, 600, 1.95, 0.15, 0.9, 2); H.t('square', 170, 110, 1.95, 0.1, 0.3); H.n('bandpass', 1000, 400, 2.3, 0.2, 0.9, 2); }),
  reload_mg: R(4.6, (H) => { H.n('bandpass', 1200, 500, 0.2, 0.2, 0.8, 1.5); H.t('square', 160, 100, 0.2, 0.1, 0.3); H.n('lowpass', 900, 200, 1.3, 0.3, 0.8, 1); for (let i = 0; i < 8; i++) H.n('bandpass', 1800, 900, 1.7 + i * 0.18, 0.05, 0.5, 2); H.n('lowpass', 1200, 300, 3.3, 0.2, 0.9, 1); H.t('square', 140, 90, 3.8, 0.12, 0.3); H.n('bandpass', 1500, 600, 3.8, 0.14, 0.9, 2); }),
  shotgun_pump: R(0.5, (H) => { H.n('bandpass', 900, 300, 0, 0.18, 0.9, 1.5); H.t('square', 150, 90, 0, 0.1, 0.3); H.n('bandpass', 1200, 500, 0.24, 0.18, 0.9, 1.5); H.t('square', 180, 110, 0.24, 0.1, 0.3); }),
  bolt_cycle: R(0.8, (H) => { H.n('bandpass', 1600, 800, 0.05, 0.1, 0.7, 2); H.t('square', 260, 170, 0.08, 0.06, 0.2); H.n('bandpass', 1300, 600, 0.45, 0.14, 0.8, 2); H.t('square', 210, 130, 0.46, 0.08, 0.25); }),
  shell_drop: R(0.3, (H, c, v) => { H.t('triangle', 3200 + v * 800, 2800, 0, 0.18, 0.12); H.t('triangle', 2400, 2200, 0.07, 0.12, 0.06); }),
  impact_hard: R(0.3, (H, c, v) => { H.n('bandpass', 2400 + v * 900, 800, 0, 0.06, 0.8, 1.2); H.t('sine', 600, 300, 0, 0.06, 0.2); H.n('lowpass', 1500, 300, 0, 0.14, 0.5); }),
  impact_flesh: R(0.3, (H, c, v) => { H.n('lowpass', 900 + v * 300, 200, 0, 0.12, 0.9, 0.8); H.t('sine', 180, 80, 0, 0.1, 0.5); H.n('bandpass', 700, 300, 0.01, 0.1, 0.4, 1.5); }),
  hit_head: R(0.35, (H) => { H.n('bandpass', 1800, 600, 0, 0.08, 0.9, 1); H.t('sine', 320, 120, 0, 0.1, 0.5); H.t('triangle', 1400, 900, 0, 0.14, 0.3); }),
  hit_marker: R(0.08, (H) => { H.t('square', 1300, 1000, 0, 0.04, 0.12); }),
  kill_small: R(0.6, (H, c, v) => { H.t('sawtooth', 420 + v * 80, 90, 0, 0.35, 0.3); H.n('lowpass', 1800, 200, 0, 0.4, 0.5); H.n('highpass', 3000, 5000, 0.05, 0.3, 0.12); }),
  kill_medium: R(0.9, (H, c, v) => { H.t('sawtooth', 260 + v * 50, 60, 0, 0.55, 0.4); H.n('lowpass', 1500, 150, 0, 0.6, 0.6); H.t('sine', 90, 35, 0.05, 0.5, 0.5); }),
  kill_large: R(1.6, (H, c, v) => { H.t('sawtooth', 160, 38, 0, 1.0, 0.5); H.n('lowpass', 1200, 90, 0, 1.2, 0.8); H.t('sine', 70, 26, 0.05, 1.2, 0.8); H.n('lowpass', 500, 80, 0.5, 1.0, 0.4, 0.5, 0.2); }),
  kill_boss: R(3.2, (H) => { H.t('sawtooth', 130, 26, 0, 2.5, 0.55); H.t('sawtooth', 138, 28, 0, 2.5, 0.45); H.n('lowpass', 900, 60, 0, 2.8, 0.9); H.t('sine', 55, 20, 0.1, 2.8, 0.9); for (let i = 0; i < 6; i++) H.n('lowpass', 1500, 200, 0.4 + i * 0.35, 0.3, 0.4); }),
  growl_small: R(0.7, (H, c, v) => { const f = 150 + v * 60; H.t('sawtooth', f, f * 0.7, 0, 0.55, 0.22, 0.05); H.t('sawtooth', f * 1.51, f * 1.2, 0, 0.5, 0.1, 0.06); H.n('bandpass', 900, 500, 0, 0.55, 0.35, 3, 0.08); }),
  growl_medium: R(1.1, (H, c, v) => { const f = 90 + v * 30; H.t('sawtooth', f, f * 0.65, 0, 0.9, 0.3, 0.1); H.t('sawtooth', f * 1.5, f, 0, 0.9, 0.12, 0.1); H.n('bandpass', 500, 260, 0, 0.9, 0.5, 4, 0.12); H.t('sine', f * 0.5, f * 0.4, 0, 1.0, 0.4, 0.1); }),
  growl_large: R(1.8, (H, c, v) => { const f = 55 + v * 14; H.t('sawtooth', f, f * 0.6, 0, 1.5, 0.4, 0.2); H.t('sawtooth', f * 1.49, f * 0.9, 0, 1.5, 0.2, 0.2); H.n('lowpass', 400, 120, 0, 1.6, 0.8, 3, 0.2); H.t('sine', f * 0.5, f * 0.35, 0, 1.7, 0.7, 0.2); }),
  boss_roar: R(3.2, (H) => { H.t('sawtooth', 95, 40, 0, 2.8, 0.5, 0.2); H.t('sawtooth', 103, 44, 0, 2.8, 0.4, 0.2); H.t('sawtooth', 142, 62, 0.1, 2.6, 0.25, 0.2); H.n('bandpass', 700, 200, 0, 2.8, 0.9, 3, 0.2); H.n('lowpass', 300, 60, 0, 3.0, 1.0, 1, 0.3); H.t('sine', 40, 28, 0, 3.0, 1.0, 0.2); }),
  attack_small: R(0.4, (H, c, v) => { H.n('bandpass', 1400, 600, 0, 0.18, 0.7, 2); H.t('sawtooth', 320 + v * 90, 160, 0, 0.2, 0.25); H.n('highpass', 3000, 4500, 0.0, 0.1, 0.2); }),
  attack_large: R(0.7, (H, c, v) => { H.n('lowpass', 1400, 200, 0, 0.35, 1.0, 1); H.t('sawtooth', 130 + v * 30, 55, 0, 0.4, 0.4); H.t('sine', 80, 40, 0, 0.35, 0.6); }),
  leap: R(0.5, (H) => { H.n('bandpass', 700, 2200, 0, 0.35, 0.7, 1); H.t('sawtooth', 260, 520, 0, 0.3, 0.2); }),
  charge_roar: R(1.0, (H) => { H.t('sawtooth', 90, 130, 0, 0.9, 0.4, 0.1); H.t('sawtooth', 100, 150, 0, 0.9, 0.3, 0.1); H.n('bandpass', 600, 1200, 0, 0.9, 0.6, 3); }),
  stomp: R(1.0, (H) => { H.t('sine', 80, 24, 0, 0.8, 1.3); H.n('lowpass', 700, 70, 0, 0.7, 1.2, 0.8); H.n('bandpass', 2200, 400, 0, 0.12, 0.6); }),
  spit: R(0.4, (H, c, v) => { H.t('sine', 500, 180, 0, 0.18, 0.25); H.n('bandpass', 1400, 600, 0, 0.14, 0.5, 2); H.n('lowpass', 900, 400, 0.05, 0.25, 0.3); }),
  acid_splash: R(0.5, (H) => { H.n('bandpass', 2400, 600, 0, 0.3, 0.6, 1); H.n('highpass', 4000, 6000, 0, 0.2, 0.2); H.t('sine', 700, 200, 0, 0.1, 0.2); }),
  breath_fire: R(1.8, (H) => { H.n('bandpass', 700, 1600, 0, 1.4, 1.0, 0.8, 0.2); H.n('lowpass', 1500, 400, 0, 1.6, 0.8, 0.5, 0.3); H.t('sawtooth', 60, 50, 0, 1.5, 0.3, 0.3); }),
  explosion: R(1.8, (H) => { H.t('sine', 100, 22, 0, 1.2, 1.5); H.n('lowpass', 2500, 60, 0, 1.4, 1.5, 0.5); H.n('bandpass', 1800, 300, 0, 0.2, 0.7); H.n('lowpass', 500, 60, 0.15, 1.5, 0.5, 0.5, 0.1); }),
  enrage: R(0.9, (H) => { H.t('sawtooth', 110, 220, 0, 0.7, 0.4, 0.05); H.n('bandpass', 1200, 2400, 0, 0.7, 0.4, 2); }),
  summon: R(1.4, (H) => { H.t('sawtooth', 60, 120, 0, 1.2, 0.4, 0.3); H.n('lowpass', 300, 1500, 0, 1.2, 0.7, 1, 0.4); }),
  footstep_small: R(0.2, (H, c, v) => { H.n('lowpass', 700 + v * 200, 200, 0, 0.1, 0.5, 0.7); H.t('sine', 120, 60, 0, 0.08, 0.3); }),
  footstep_large: R(0.5, (H, c, v) => { H.t('sine', 70, 28, 0, 0.35, 0.9); H.n('lowpass', 500, 90, 0, 0.3, 0.8, 0.6); }),
  step_concrete: R(0.25, (H, c, v) => { H.n('bandpass', 1500 + v * 500, 600, 0, 0.07, 0.35, 1.5); H.n('lowpass', 600, 200, 0, 0.1, 0.4); }),
  step_dirt: R(0.25, (H, c, v) => { H.n('lowpass', 900 + v * 300, 250, 0, 0.12, 0.4, 0.7); H.n('highpass', 3000, 4000, 0.0, 0.05, 0.1); }),
  step_metal: R(0.3, (H, c, v) => { H.n('bandpass', 2200 + v * 700, 900, 0, 0.06, 0.4, 3); H.t('triangle', 900 + v * 200, 700, 0, 0.12, 0.08); }),
  player_hurt: R(0.6, (H, c, v) => { H.t('sine', 150 + v * 30, 55, 0, 0.35, 0.6); H.n('lowpass', 900, 150, 0, 0.35, 0.6); H.t('sawtooth', 300, 150, 0, 0.2, 0.1); }),
  player_death: R(2.4, (H) => { H.t('sine', 120, 30, 0, 1.8, 0.8); H.n('lowpass', 1200, 60, 0, 2.0, 0.6); H.t('sawtooth', 220, 60, 0.1, 1.4, 0.15); }),
  heartbeat: R(1.0, (H) => { H.t('sine', 60, 38, 0, 0.18, 1.0); H.t('sine', 55, 36, 0.28, 0.2, 0.8); }),
  barricade_break: R(0.6, (H, c, v) => { H.n('bandpass', 700 + v * 200, 200, 0, 0.3, 0.9, 1); H.t('square', 130, 60, 0, 0.12, 0.3); H.n('lowpass', 1200, 300, 0.05, 0.3, 0.6); }),
  barricade_repair: R(0.35, (H, c, v) => { H.t('square', 170 + v * 30, 90, 0, 0.08, 0.3); H.n('lowpass', 1300, 300, 0, 0.1, 0.5); H.n('bandpass', 2400, 1200, 0.0, 0.04, 0.3); }),
  gate_open: R(2.2, (H) => { H.n('lowpass', 800, 150, 0, 1.8, 0.8, 0.8, 0.2); H.t('sawtooth', 70, 45, 0, 1.6, 0.25, 0.2); H.n('bandpass', 1800, 700, 0.1, 1.5, 0.15, 3, 0.3); H.t('triangle', 523, 523, 1.5, 0.5, 0.1); H.t('triangle', 784, 784, 1.7, 0.5, 0.1); }),
  buy: R(0.5, (H) => { H.t('square', 988, 988, 0, 0.08, 0.1); H.t('square', 1319, 1319, 0.08, 0.2, 0.1); H.t('sine', 2637, 2637, 0.08, 0.3, 0.05); }),
  deny: R(0.4, (H) => { H.t('sawtooth', 130, 100, 0, 0.2, 0.2); H.t('sawtooth', 98, 80, 0.1, 0.2, 0.2); }),
  pickup: R(0.6, (H) => { for (let i = 0; i < 5; i++) H.t('triangle', 523 * Math.pow(2, i * 4 / 12), 523 * Math.pow(2, i * 4 / 12), i * 0.05, 0.16, 0.12); }),
  powerup_drop: R(0.4, (H) => { H.t('sine', 1046, 2093, 0, 0.2, 0.12); }),
  perk_buy: R(1.2, (H) => { for (let i = 0; i < 7; i++) H.t('sine', 262 * Math.pow(2, i * 3 / 12), 262 * Math.pow(2, i * 3 / 12), i * 0.07, 0.4, 0.12); H.n('highpass', 3000, 3000, 0, 0.5, 0.1); }),
  crate_open: R(2.8, (H) => { for (let i = 0; i < 9; i++) H.t('triangle', 523 * Math.pow(2, [0, 4, 7, 12, 7, 4, 0, 5, 9][i] / 12), 523, i * 0.3, 0.25, 0.1); }),
  crate_ready: R(0.8, (H) => { H.t('triangle', 1046, 1046, 0, 0.5, 0.15); H.t('triangle', 1318, 1318, 0.12, 0.5, 0.12); }),
  bench_forge: R(1.6, (H) => { for (let i = 0; i < 4; i++) { H.t('square', 180, 90, i * 0.3, 0.08, 0.3); H.n('bandpass', 3000, 1000, i * 0.3, 0.12, 0.7, 2); } for (let i = 0; i < 6; i++) H.t('triangle', 1568 * Math.pow(2, i * 2 / 12), 1568, 1.0 + i * 0.05, 0.2, 0.1); }),
  round_start: R(2.0, (H) => { [67, 64, 60].forEach((n, i) => { const f = 440 * Math.pow(2, (n - 69) / 12); H.t('triangle', f, f, i * 0.4, 0.8, 0.2); H.t('sine', f / 2, f / 2, i * 0.4, 0.8, 0.3); }); H.n('lowpass', 500, 150, 0, 1.6, 0.2, 0.5, 0.3); }),
  round_end: R(1.6, (H) => { [60, 64, 67, 72].forEach((n, i) => { const f = 440 * Math.pow(2, (n - 69) / 12); H.t('triangle', f, f, i * 0.12, 0.6, 0.15); }); }),
  boss_spawn: R(3.5, (H) => { H.t('sawtooth', 50, 36, 0, 3, 0.4, 0.4); H.t('sawtooth', 52, 38, 0, 3, 0.3, 0.4); H.n('lowpass', 250, 70, 0, 3.2, 0.9, 1, 0.5); H.t('sine', 35, 28, 0, 3.2, 0.9, 0.3); }),
  flashlight: R(0.1, (H) => { H.t('square', 1800, 1200, 0, 0.02, 0.12); H.n('highpass', 4000, 4000, 0, 0.02, 0.2); }),
  ui_click: R(0.08, (H) => { H.t('square', 700, 500, 0, 0.04, 0.1); }),
  ui_tick: R(0.05, (H) => { H.t('square', 900, 900, 0, 0.02, 0.06); }),
  gameover: R(3.5, (H) => { [64, 62, 59, 55, 52].forEach((n, i) => { const f = 440 * Math.pow(2, (n - 69) / 12); H.t('sawtooth', f, f * 0.96, i * 0.5, 0.9, 0.18); }); H.n('lowpass', 600, 80, 0.4, 2.6, 0.3, 0.5, 0.3); }),
  lava_crackle: R(0.5, (H, c, v) => { H.n('bandpass', 2600 + v * 1200, 900, 0, 0.07, 0.6, 2); H.n('lowpass', 800, 200, 0, 0.2, 0.3); }),
  amb_wind: R(8, (H) => { H.n('bandpass', 420, 420, 0, 8, 0.5, 0.6, 0.6); H.n('lowpass', 260, 260, 0, 8, 0.7, 0.4, 1.0); H.n('bandpass', 900, 900, 2, 4, 0.12, 1, 1.0); }),
  amb_crickets: R(8, (H) => { for (let i = 0; i < 90; i++) { const t0 = Math.random() * 7.6, f = 3800 + Math.random() * 900; for (let k = 0; k < 4; k++) H.t('sine', f, f, t0 + k * 0.045, 0.03, 0.012 + Math.random() * 0.01, 0.003); } }),
  amb_rumble: R(8, (H) => { H.n('lowpass', 120, 120, 0, 8, 0.9, 0.5, 1.0); H.t('sine', 42, 41, 0, 8, 0.5, 1.0); for (let i = 0; i < 20; i++) H.n('bandpass', 2500 + Math.random() * 1500, 800, Math.random() * 7.5, 0.06, 0.25, 2); }),
};
const CATEGORY = (id) => (id.startsWith('music_') ? 'music' : id.startsWith('amb_') ? 'amb' : 'sfx');
const POSITIONAL = new Set(['growl_small', 'growl_medium', 'growl_large', 'boss_roar', 'attack_small', 'attack_large', 'leap', 'charge_roar', 'stomp', 'spit', 'acid_splash', 'breath_fire', 'explosion', 'enrage', 'summon', 'footstep_small', 'footstep_large', 'barricade_break', 'barricade_repair', 'impact_hard', 'impact_flesh', 'hit_head', 'kill_small', 'kill_medium', 'kill_large', 'kill_boss', 'lava_crackle', 'powerup_drop', 'gate_open', 'boss_spawn']);
const VARIATIONS = { pistol_shot: 3, shotgun_shot: 3, rifle_shot: 3, bolt_shot: 2, mg_shot: 4, impact_hard: 4, impact_flesh: 4, hit_head: 2, growl_small: 4, growl_medium: 4, growl_large: 3, attack_small: 3, attack_large: 3, footstep_small: 4, footstep_large: 3, step_concrete: 4, step_dirt: 4, step_metal: 4, player_hurt: 3, barricade_break: 3, barricade_repair: 3, shell_drop: 3, lava_crackle: 4, kill_small: 3, kill_medium: 3, kill_large: 2, spit: 2, acid_splash: 3, stomp: 2, explosion: 2 };

function normalise(buf, targetRms, peakCap) {            // loudness: bring every clip to a similar level, without clipping
  let sum = 0, n = 0, peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 4) { sum += d[i] * d[i]; n++; if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]); } }
  const rms = Math.sqrt(sum / Math.max(1, n)) || 1e-4; let g = targetRms / rms; if (peak * g > peakCap) g = peakCap / peak; return Math.min(g, 12);
}
async function loadManifest() { try { const r = await fetch(new URL('../audio/manifest.json', import.meta.url), { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) { /* use defaults */ } return { sounds: {} }; }

AU.init = function () {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; } AU.ctx = ctx;
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
  master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain(); ambBus = ctx.createGain(); duck = ctx.createGain(); musBus.connect(duck); duck.connect(master); sfxBus.connect(master); ambBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, SR, SR); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; listener = ctx.listener; AU.ready = true; apply();
};
function apply() { if (!AU.ready) return; const v = AU.vol; master.gain.setTargetAtTime(v.muted ? 0 : v.master, ctx.currentTime, 0.03); sfxBus.gain.value = v.sfx; musBus.gain.value = v.music * 0.6; ambBus.gain.value = v.amb * 0.55; }
AU.setVolumes = function (v) { Object.assign(AU.vol, v); apply(); };
AU.ui = (n) => AU.play(n === 'click' ? 'ui_click' : 'ui_tick');

// load: real files where the manifest lists them, otherwise placeholders synthesised now
AU.load = async function (progress, only) {
  AU.init(); if (!ctx) return; const man = AU.manifest = await loadManifest(), ids = Object.keys(SYN).filter((id) => !only || only.includes(id)), total = ids.length; let done = 0;
  for (const id of ids) {
    const entry = (man.sounds && man.sounds[id]) || {}, list = []; let fromFile = false;
    for (const f of entry.files || []) { try { const r = await fetch(new URL('../audio/' + f, import.meta.url)); if (r.ok) { const buf = await ctx.decodeAudioData(await r.arrayBuffer()); list.push({ buf, gain: normalise(buf, id.startsWith('music') || id.startsWith('amb') ? 0.06 : 0.1, 0.9) * (entry.volume || 1) }); fromFile = true; } } catch (e) { /* missing file: placeholder below */ } }
    if (!list.length) { const n = VARIATIONS[id] || 1, syn = SYN[id]; for (let i = 0; i < n; i++) { const v = n > 1 ? i / (n - 1) : Math.random(); const buf = await render(syn.dur, (H, c) => syn.fn(H, c, v)); list.push({ buf, gain: normalise(buf, id.startsWith('music') || id.startsWith('amb') ? 0.05 : id.startsWith('ui') ? 0.05 : 0.1, 0.9) * (entry.volume || 1) }); } } else AU.fromFile++;
    AU.buffers[id] = { list, pitch: entry.pitch || [0.94, 1.06], vol: entry.vol || [0.9, 1.0], loop: !!(entry.loop || id.startsWith('amb_')), positional: entry.positional != null ? entry.positional : POSITIONAL.has(id), ref: entry.ref || 3, max: entry.max || 60, minGap: entry.minGap || 0.03 };
    done++; if (progress) progress(done / total);
  }
  AU.loaded = ids.length; await loadMusicFiles();
};
// play a sound: { pos:[x,y,z] world metres (positional), vol, pitch }
AU.play = function (id, o = {}) {
  if (!AU.ready || AU.vol.muted) return null; const b = AU.buffers[id]; if (!b) return null;
  const now = ctx.currentTime; if (last[id] && now - last[id] < b.minGap) return null; last[id] = now; if (voices > 56) return null;
  const clip = b.list[(Math.random() * b.list.length) | 0], src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = clip.buf; src.playbackRate.value = (o.pitch || 1) * rand(b.pitch[0], b.pitch[1]); g.gain.value = clip.gain * (o.vol == null ? 1 : o.vol) * rand(b.vol[0], b.vol[1]); src.loop = b.loop && !!o.loop;
  let node = g;
  if (o.pos && b.positional) { const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = o.ref || b.ref; p.maxDistance = 120; p.rolloffFactor = o.rolloff == null ? 1.25 : o.rolloff; p.positionX.value = o.pos[0]; p.positionY.value = o.pos[1]; p.positionZ.value = o.pos[2]; g.connect(p); node = p; }
  src.connect(g); node.connect(CATEGORY(id) === 'amb' ? ambBus : CATEGORY(id) === 'music' ? musBus : sfxBus); voices++; src.onended = () => { voices--; try { node.disconnect(); g.disconnect(); } catch (e) { /* gone */ } }; src.start(); return { src, g };
};
AU.listen = function (cam) {     // cam: world position and orientation of the player's head
  if (!AU.ready || !listener) return; const t = ctx.currentTime;
  if (listener.positionX) { listener.positionX.setTargetAtTime(cam.x, t, 0.02); listener.positionY.setTargetAtTime(cam.y, t, 0.02); listener.positionZ.setTargetAtTime(cam.z, t, 0.02); listener.forwardX.setTargetAtTime(cam.fx, t, 0.02); listener.forwardY.setTargetAtTime(cam.fy || 0, t, 0.02); listener.forwardZ.setTargetAtTime(cam.fz, t, 0.02); listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0; }
};
AU.duckMusic = function (amount, secs) { if (!AU.ready) return; const t = ctx.currentTime; duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(1 - amount, t, 0.02); duck.gain.setTargetAtTime(1, t + secs, 0.4); };

// ---------- ambience layers: wind and crickets outside, a rumble in the cave, mixed by where you are ----------
const amb = { layers: {}, room: -1 };
AU.setRoom = function (room) {
  if (!AU.ready || room === amb.room) return; amb.room = room; const wants = { amb_wind: room === 3 ? 0.15 : 0.7, amb_crickets: room === 1 ? 0.8 : room === 0 || room === 2 ? 0.35 : 0.0, amb_rumble: room === 3 ? 1.0 : 0.12 };
  for (const [id, vol] of Object.entries(wants)) { let L = amb.layers[id]; if (!L) { const h = AU.play(id, { loop: true, vol: 0.0001 }); if (!h) continue; L = amb.layers[id] = h; } L.g.gain.cancelScheduledValues(ctx.currentTime); L.g.gain.setTargetAtTime(Math.max(0.0001, vol * (AU.buffers[id].list[0].gain)), ctx.currentTime, 0.8); }
};

// ---------- music: a procedural score that gets denser and faster with the round (replace it by dropping music_*.ogg files in and listing them in the manifest) ----------
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12), MS = { mode: null, timer: null, step: 0, nextT: 0, intensity: 0, bpm: 78, filesOn: false };
const CH = [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 43, 47]];       // Am F G Em, low
function mt(type, f, t0, len, g, dest, att = 0.01) { const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.value = f; a.gain.setValueAtTime(0.0001, t0); a.gain.linearRampToValueAtTime(g, t0 + att); a.gain.exponentialRampToValueAtTime(0.0001, t0 + len); o.connect(a); a.connect(dest || musBus); o.start(t0); o.stop(t0 + len + 0.05); }
function mn(f0, t0, len, g, kind = 'lowpass', q = 0.8) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), a = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = kind; f.frequency.value = f0; f.Q.value = q; a.gain.setValueAtTime(0.0001, t0); a.gain.linearRampToValueAtTime(g, t0 + 0.005); a.gain.exponentialRampToValueAtTime(0.0001, t0 + len); s.connect(f); f.connect(a); a.connect(musBus); s.start(t0, Math.random()); s.stop(t0 + len + 0.05); }
function schedule() {
  if (!AU.ready || MS.filesOn) return;
  while (MS.nextT < ctx.currentTime + 0.3) {
    const sixteenth = 60 / MS.bpm / 4, s = MS.step % 128, bar = Math.floor(s / 32) % 4, beat = s % 32, ch = CH[bar], I = MS.intensity, t = MS.nextT, mode = MS.mode;
    if (mode === 'menu' || mode === 'over') {
      if (beat === 0) { mt('sawtooth', NOTE(ch[0] - 12), t, 7, 0.07, musBus, 1.5); mt('sawtooth', NOTE(ch[0] - 12) * 1.006, t, 7, 0.06, musBus, 1.5); mt('sine', NOTE(ch[0] + 12), t + 0.5, 6, 0.04, musBus, 1.0); }
      if (beat % 8 === 0 && Math.random() < 0.5) mt('triangle', NOTE(ch[(beat / 8) % 3] + 24), t, 2.4, 0.03, musBus, 0.05);
    } else {
      // the bed: a low drone and a slow heartbeat that speeds up with the round
      if (beat === 0) { mt('sawtooth', NOTE(ch[0] - 12), t, 4.5, 0.06 + I * 0.03, musBus, 0.8); mt('sawtooth', NOTE(ch[0] - 12) * 1.007, t, 4.5, 0.05, musBus, 0.8); mt('sine', NOTE(ch[0] - 24), t, 4.5, 0.18, musBus, 0.3); }
      if (beat % 16 === 0) { mt('sine', 58, t, 0.22, 0.24, musBus, 0.004); mt('sine', 52, t + sixteenth * 2.4, 0.22, 0.2, musBus, 0.004); }
      if (beat % 4 === 0 && I > 0.25) mn(160, t, 0.12, 0.2 * I, 'lowpass', 1);
      if (beat % 2 === 1 && I > 0.5) mn(7000, t, 0.03, 0.05 * I, 'highpass', 1);
      if (beat % 8 === 4 && I > 0.35) mt('square', NOTE(ch[0]), t, 0.12, 0.025 + I * 0.02, musBus, 0.003);
      if (beat === 8 || beat === 24) { const n = ch[Math.floor(Math.random() * 3)] + 24 + (Math.random() < 0.3 ? 1 : 0); mt('sine', NOTE(n), t, 3.2, 0.03 + I * 0.015, musBus, 0.8); }          // cold high strings
      if (mode === 'boss') { if (beat % 8 === 0) { mt('sine', 48, t, 0.6, 0.45, musBus, 0.004); mn(120, t, 0.3, 0.5, 'lowpass', 1); } if (beat % 16 === 8) { mn(2000, t, 0.12, 0.2, 'bandpass', 2); } if (beat === 0) { mt('sawtooth', NOTE(ch[0]), t, 4, 0.05, musBus, 0.3); mt('sawtooth', NOTE(ch[0] + 1), t, 4, 0.04, musBus, 0.3); } }
    }
    MS.nextT += sixteenth; MS.step++;
  }
}
const MUSIC_IDS = ['music_menu', 'music_low', 'music_mid', 'music_high', 'music_boss', 'music_over'], MUS = { files: {}, curId: null, cur: null };
async function loadMusicFiles() {
  const man = AU.manifest; if (!man || !man.sounds) return;
  for (const id of MUSIC_IDS) { const e = man.sounds[id]; if (!e || !e.files || !e.files.length) continue; try { const r = await fetch(new URL('../audio/' + e.files[0], import.meta.url)); if (!r.ok) continue; const buf = await ctx.decodeAudioData(await r.arrayBuffer()); MUS.files[id] = { buf, gain: (e.volume || 1) * normalise(buf, 0.05, 0.9) }; } catch (err) { /* missing: the procedural score plays instead */ } }
}
AU.loadMusicFiles = loadMusicFiles;
function trackFor(mode) { return mode === 'menu' ? 'music_menu' : mode === 'over' ? 'music_over' : mode === 'boss' ? 'music_boss' : MS.intensity < 0.3 ? 'music_low' : MS.intensity < 0.65 ? 'music_mid' : 'music_high'; }
function playTrack(id) {
  if (MUS.curId === id) return; const old = MUS.cur; MUS.curId = id; const f = MUS.files[id], src = ctx.createBufferSource(), gn = ctx.createGain(); src.buffer = f.buf; src.loop = true; gn.gain.value = 0; src.connect(gn); gn.connect(musBus); src.start(); gn.gain.setTargetAtTime(f.gain, ctx.currentTime, 0.8); MUS.cur = { src, gn };
  if (old) { old.gn.gain.setTargetAtTime(0, ctx.currentTime, 0.6); setTimeout(() => { try { old.src.stop(); } catch (e) { /* done */ } }, 3000); }
}
function stopFileMusic() { if (MUS.cur) { const o = MUS.cur; o.gn.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { o.src.stop(); } catch (e) { /* done */ } }, 2000); MUS.cur = null; MUS.curId = null; } }
AU.music = function (mode) {
  if (!AU.ready) { MS.pending = mode; return; }
  if (mode !== 'off') { const id = trackFor(mode); if (MUS.files[id]) { MS.mode = mode; MS.filesOn = true; if (MS.timer) { clearInterval(MS.timer); MS.timer = null; } playTrack(id); return; } }
  if (MS.filesOn) { MS.filesOn = false; stopFileMusic(); MS.mode = null; }
  if (mode === MS.mode) return; MS.mode = mode; if (MS.timer) { clearInterval(MS.timer); MS.timer = null; } if (mode === 'off') { stopFileMusic(); return; }
  MS.step = 0; MS.nextT = ctx.currentTime + 0.1; MS.bpm = mode === 'boss' ? 104 : mode === 'play' ? 76 + MS.intensity * 30 : 64; MS.timer = setInterval(schedule, 40); schedule();
};
AU.setIntensity = function (round) { MS.intensity = Math.min(1, (round - 1) / 16); if (MS.mode === 'play') { MS.bpm = 76 + MS.intensity * 30; if (MS.filesOn) AU.music('play'); } };
