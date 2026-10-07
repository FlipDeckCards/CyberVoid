// Feral 2.0 - sound (a copy of Feral's, plus positional stereo: effects can be panned and softened by distance).
// Dead Zone: Feral - sound. Every effect and the music are made in code with the Web Audio API (no audio files), so there is nothing to download.
(function () {
  const D = (window.DZF = window.DZF || {});
  const AU = (D.audio = {});
  let ctx = null, master, sfxBus, musBus, comp, noiseBuf, ready = false, target = null;
  const vol = { master: 0.8, music: 0.5, sfx: 0.9, muted: false };
  const lastPlay = {}; let voices = 0;

  AU.init = function () {                           // must be called from a tap / key press (browsers keep audio locked until then)
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain();
    sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ready = true; apply();
    if (pendingMode) AU.music(pendingMode);
  };
  function apply() { if (!ready) return; const m = vol.muted ? 0 : vol.master; master.gain.setTargetAtTime(m, ctx.currentTime, 0.02); sfxBus.gain.value = vol.sfx; musBus.gain.value = vol.music * 0.55; }
  AU.setVolumes = function (v) { Object.assign(vol, v); apply(); };
  AU.toggleMute = function () { vol.muted = !vol.muted; apply(); return vol.muted; };
  AU.isMuted = () => vol.muted;
  AU.now = () => (ctx ? ctx.currentTime : 0);

  function tone(type, f0, f1, dur, v, delay, bus, attack) {
    if (!ready) return; const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || target || sfxBus); o.start(t); o.stop(t + dur + 0.03); voices++; o.onended = () => { voices--; };
  }
  function noise(dur, v, ftype, f0, f1, delay, q, bus) {
    if (!ready) return; const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = ftype || 'lowpass'; f.frequency.setValueAtTime(f0 || 2000, t); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); f.Q.value = q || 0.7;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || target || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03); voices++; s.onended = () => { voices--; };
  }
  const note = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const FX = {
    pip: () => { tone('square', 820, 180, 0.09, 0.16); noise(0.05, 0.12, 'highpass', 2500); },
    rattle: () => { tone('sawtooth', 520, 240, 0.06, 0.13); noise(0.04, 0.1, 'bandpass', 1800, 900, 0, 1); },
    scatter: () => { noise(0.28, 0.5, 'lowpass', 2400, 260); tone('square', 150, 50, 0.2, 0.28); },
    longthorn: () => { tone('sawtooth', 1000, 70, 0.2, 0.22); noise(0.14, 0.3, 'lowpass', 3000, 400); },
    bubble: () => { tone('sine', 260, 760, 0.14, 0.26); tone('sine', 520, 1500, 0.1, 0.1, 0.03); },
    sunbeam: () => { tone('sawtooth', 1500, 1000, 0.07, 0.1); tone('sine', 2600, 2200, 0.07, 0.07); },
    party: () => { noise(0.18, 0.28, 'bandpass', 2400, 1200, 0, 1.5); tone('triangle', 700, 1500, 0.1, 0.18); tone('sine', 1760, 2100, 0.2, 0.08, 0.04); },
    hit: () => { noise(0.05, 0.16, 'bandpass', 1400, 700, 0, 2); tone('sine', 220, 120, 0.05, 0.1); },
    kill: () => { tone('sine', 340, 70, 0.17, 0.2); noise(0.1, 0.18, 'lowpass', 900, 200); },
    bigKill: () => { tone('sine', 150, 35, 0.5, 0.4); noise(0.4, 0.4, 'lowpass', 900, 100); },
    split: () => { tone('sine', 400, 900, 0.07, 0.14); tone('sine', 300, 700, 0.07, 0.1, 0.03); },
    bite: () => { noise(0.06, 0.14, 'highpass', 1200); tone('square', 120, 80, 0.06, 0.08); },
    hurt: () => { tone('sine', 140, 50, 0.22, 0.4); noise(0.16, 0.3, 'lowpass', 700, 150); },
    reload: () => { noise(0.04, 0.2, 'highpass', 3500); tone('square', 300, 200, 0.04, 0.06); },
    reloaded: () => { noise(0.04, 0.22, 'highpass', 3000); tone('square', 420, 300, 0.05, 0.08, 0.02); tone('square', 520, 380, 0.05, 0.06, 0.09); },
    empty: () => { noise(0.03, 0.18, 'highpass', 4000); },
    swap: () => { noise(0.05, 0.14, 'bandpass', 2000, 1000, 0, 2); tone('triangle', 500, 700, 0.05, 0.07); },
    buy: () => { tone('square', 988, 988, 0.07, 0.12); tone('square', 1319, 1319, 0.16, 0.12, 0.07); tone('sine', 2637, 2637, 0.2, 0.05, 0.07); },
    deny: () => { tone('sawtooth', 130, 100, 0.2, 0.22); tone('sawtooth', 98, 80, 0.2, 0.18, 0.1); },
    door: () => { noise(0.5, 0.4, 'lowpass', 900, 180); tone('sawtooth', 90, 60, 0.45, 0.2); tone('sine', 523, 523, 0.3, 0.1, 0.35); tone('sine', 784, 784, 0.4, 0.1, 0.45); },
    repair: () => { tone('square', 170, 90, 0.07, 0.2); noise(0.05, 0.18, 'lowpass', 1200, 300); },
    plank: () => { noise(0.14, 0.36, 'bandpass', 700, 200, 0, 1.2); tone('square', 120, 60, 0.1, 0.16); },
    pickup: () => { for (let i = 0; i < 5; i++) tone('triangle', note(72 + i * 4), note(72 + i * 4), 0.14, 0.15, i * 0.05); },
    boom: () => { tone('sine', 120, 28, 0.7, 0.55); noise(0.6, 0.5, 'lowpass', 1400, 80); },
    boomSmall: () => { tone('sine', 140, 40, 0.3, 0.35); noise(0.25, 0.3, 'lowpass', 1800, 150); },
    drop: () => { tone('sine', note(84), note(96), 0.18, 0.12); },
    round: () => { [67, 64, 60].forEach((n, i) => tone('triangle', note(n), note(n), 0.5, 0.2, i * 0.28)); noise(0.5, 0.1, 'lowpass', 500, 200); },
    roundEnd: () => { [60, 64, 67, 72].forEach((n, i) => tone('triangle', note(n), note(n), 0.35, 0.16, i * 0.1)); },
    boss: () => { tone('sawtooth', 70, 45, 1.4, 0.3); tone('sawtooth', 73, 48, 1.4, 0.25); noise(1, 0.2, 'lowpass', 300, 100); },
    slamWarn: () => { tone('sawtooth', 55, 90, 0.8, 0.2); },
    slam: () => { tone('sine', 90, 25, 0.6, 0.5); noise(0.4, 0.4, 'lowpass', 900, 100); },
    spit: () => { tone('sine', 500, 200, 0.12, 0.14); noise(0.06, 0.1, 'bandpass', 900, 500); },
    revive: () => { for (let i = 0; i < 7; i++) tone('sine', note(60 + i * 3), note(60 + i * 3), 0.3, 0.14, i * 0.06); },
    upgrade: () => { for (let i = 0; i < 6; i++) tone('triangle', note(79 + i * 2), note(79 + i * 2), 0.22, 0.12, i * 0.05); noise(0.5, 0.12, 'highpass', 3000); },
    boxSpin: () => { for (let i = 0; i < 9; i++) tone('triangle', note(72 + [0, 4, 7, 12, 7, 4, 0, 5, 9][i]), null, 0.18, 0.1, i * 0.27); },
    boxReady: () => { tone('triangle', note(84), note(84), 0.5, 0.18); tone('triangle', note(88), note(88), 0.5, 0.14, 0.12); },
    gameover: () => { [64, 62, 59, 55, 52].forEach((n, i) => tone('sawtooth', note(n), note(n) * 0.97, 0.5, 0.18, i * 0.3)); noise(1.2, 0.12, 'lowpass', 600, 100, 0.3); },
    click: () => { tone('square', 700, 500, 0.03, 0.08); },
    tick: () => { tone('square', 900, 900, 0.02, 0.05); },
  };
  AU.sfx = function (name, o) {                          // o = { pan: -1..1, vol: 0..1 } places the sound in the stereo field
    if (!ready || vol.muted || !FX[name]) return;
    const t = performance.now(); if (lastPlay[name] && t - lastPlay[name] < (name === 'hit' ? 45 : name === 'bite' ? 80 : 30)) return; lastPlay[name] = t;
    if (voices > 40) return;
    if (o && (o.pan != null || o.vol != null) && ctx.createStereoPanner) {
      const g = ctx.createGain(); g.gain.value = o.vol == null ? 1 : Math.max(0, Math.min(1.2, o.vol)); const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan || 0)); g.connect(p); p.connect(sfxBus);
      target = g; try { FX[name](); } finally { target = null; }
      setTimeout(() => { try { g.disconnect(); p.disconnect(); } catch (e) { /* already gone */ } }, 2500);
    } else FX[name]();
  };

  // ---------- music: a music-box melody over a soft pad and a heartbeat bass; faster and busier as the rounds go up ----------
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]];       // Am F C E
  const SCALE = [69, 72, 74, 76, 79, 81, 84];
  let mode = null, pendingMode = null, timer = null, nextT = 0, step = 0, intensity = 0, bpm = 84, melody = [], padNodes = null;
  function schedule() {
    if (!ready) return;
    while (nextT < ctx.currentTime + 0.25) {
      const sixteenth = 60 / bpm / 4, s = step % 64, bar = Math.floor(s / 16) % 4, beat = s % 16, ch = CHORDS[bar];
      if (mode === 'menu' || mode === 'break' || mode === 'over') {
        if (beat % 4 === 0) tone('triangle', note(ch[(beat / 4) % 3] + 12), null, 0.9, mode === 'over' ? 0.05 : 0.08, nextT - ctx.currentTime, musBus, 0.01);
        if (beat === 0) tone('sine', note(ch[0] - 12), null, 1.6, 0.12, nextT - ctx.currentTime, musBus, 0.05);
        if (beat === 8 && mode !== 'over' && Math.random() < 0.7) tone('sine', note(SCALE[(Math.random() * 7) | 0] + 12), null, 1.1, 0.05, nextT - ctx.currentTime, musBus, 0.01);
      } else if (mode === 'play') {
        if (beat % 2 === 0) tone('triangle', note(ch[(beat / 2) % 3] + 12), null, 0.28, 0.07, nextT - ctx.currentTime, musBus, 0.003);                   // music-box arpeggio
        if (beat === 0 || beat === 8) tone('sine', note(ch[0] - 12), note(ch[0] - 12) * 0.98, 0.5, 0.17, nextT - ctx.currentTime, musBus, 0.01);          // bass
        if (beat === 0) tone('sawtooth', note(ch[0]), null, 3.2, 0.035, nextT - ctx.currentTime, musBus, 0.4);                                                // pad
        if (beat === 0 && step % 64 === 0) melody = Array.from({ length: 16 }, () => (Math.random() < 0.45 + intensity * 0.2 ? SCALE[(Math.random() * 7) | 0] : 0));
        if (melody[beat]) tone('sine', note(melody[beat] + 12), null, 0.35, 0.05 + intensity * 0.02, nextT - ctx.currentTime, musBus, 0.004);
        if (intensity > 0.3 && beat % 4 === 0) noise(0.08, 0.08 * (0.5 + intensity), 'lowpass', 200, 60, nextT - ctx.currentTime, 1, musBus);                    // soft kick
        if (intensity > 0.55 && beat % 2 === 1) noise(0.03, 0.04, 'highpass', 6000, 6000, nextT - ctx.currentTime, 1, musBus);                                  // tick
        if (intensity > 0.8 && beat % 8 === 4) tone('square', note(ch[0]), null, 0.12, 0.03, nextT - ctx.currentTime, musBus, 0.003);
      }
      nextT += sixteenth; step++;
    }
  }
  AU.music = function (m) {
    if (!ready) { pendingMode = m; return; }
    if (m === mode) return; mode = m; pendingMode = null;
    if (timer) { clearInterval(timer); timer = null; }
    if (m === 'off') return;
    step = 0; nextT = ctx.currentTime + 0.1; bpm = m === 'play' ? 84 + intensity * 28 : m === 'over' ? 60 : 72;
    timer = setInterval(schedule, 40); schedule();
  };
  AU.setIntensity = function (round) { intensity = Math.min(1, (round - 1) / 14); if (mode === 'play') bpm = 84 + intensity * 28; };
  AU.fx = FX;
})();
