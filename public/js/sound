// ═══════════════════════════════════════════════════════════
// DEADZONE — Sound FX System (Web Audio Synthesizer)
// ═══════════════════════════════════════════════════════════

var SFX = (function() {
  var audioCtx = null;
  var masterGain = null;
  var volume = 0.5;

  function init() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(audioCtx.destination);
    } catch(e) {
      console.warn('Web Audio not supported');
    }
  }

  function resume() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function now() {
    return audioCtx ? audioCtx.currentTime : 0;
  }

  // ── PISTOL: Sharp electronic snap ──
  function pistol() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.1);

    // Click layer
    var osc2 = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(2000, t);
    osc2.frequency.exponentialRampToValueAtTime(100, t + 0.03);
    gain2.gain.setValueAtTime(0.25, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.05);
  }

  // ── SHOTGUN: Heavy blast ──
  function shotgun() {
    if (!audioCtx) return;
    var t = now();
    // Noise burst
    var bufSize = audioCtx.sampleRate * 0.15;
    var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(gain);
    gain.connect(masterGain);
    noise.start(t);

    // Low thump
    var osc = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    gain2.gain.setValueAtTime(0.5, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain2);
    gain2.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // ── RIFLE: Rapid laser zap ──
  function rifle() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  // ── ROCKET: Deep boom ──
  function rocket() {
    if (!audioCtx) return;
    var t = now();
    // Launch whoosh
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.35);

    // Explosion noise
    var bufSize = audioCtx.sampleRate * 0.4;
    var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    var nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.5, t + 0.05);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noise.connect(nGain);
    nGain.connect(masterGain);
    noise.start(t + 0.05);

    // Sub bass
    var sub = audioCtx.createOscillator();
    var subG = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t + 0.05);
    sub.frequency.exponentialRampToValueAtTime(20, t + 0.4);
    subG.gain.setValueAtTime(0.6, t + 0.05);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    sub.connect(subG);
    subG.connect(masterGain);
    sub.start(t + 0.05);
    sub.stop(t + 0.45);
  }

  // ── HIT: Critical (high ping) ──
  function hitCritical() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.1);

    // Metallic ring
    var osc2 = audioCtx.createOscillator();
    var gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(3200, t);
    gain2.gain.setValueAtTime(0.15, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t);
    osc2.stop(t + 0.12);
  }

  // ── HIT: Corner (lower thunk) ──
  function hitCorner() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.06);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // ── ENEMY DEATH: Digital explosion ──
  function enemyDeath() {
    if (!audioCtx) return;
    var t = now();
    // Descending screech
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);

    // Crunch noise
    var bufSize = audioCtx.sampleRate * 0.2;
    var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 4);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    var nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.35, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(nGain);
    nGain.connect(masterGain);
    noise.start(t);
  }

  // ── PLAYER HIT: Damage warning ──
  function playerHit() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.setValueAtTime(150, t + 0.05);
    osc.frequency.setValueAtTime(100, t + 0.1);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // ── POWERUP: Ascending chime ──
  function powerup() {
    if (!audioCtx) return;
    var t = now();
    var notes = [600, 800, 1000, 1200];
    for (var i = 0; i < notes.length; i++) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t + i * 0.06);
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.2, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.15);
    }
  }

  // ── WAVE COMPLETE: Victory fanfare ──
  function waveComplete() {
    if (!audioCtx) return;
    var t = now();
    var notes = [400, 500, 600, 800];
    for (var i = 0; i < notes.length; i++) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], t + i * 0.1);
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.25, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.3);
    }
  }

  // ── GAME OVER: Descending doom tone ──
  function gameOver() {
    if (!audioCtx) return;
    var t = now();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 1.0);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 1.2);
  }

  return {
    init: init,
    resume: resume,
    pistol: pistol,
    shotgun: shotgun,
    rifle: rifle,
    rocket: rocket,
    hitCritical: hitCritical,
    hitCorner: hitCorner,
    enemyDeath: enemyDeath,
    playerHit: playerHit,
    powerup: powerup,
    waveComplete: waveComplete,
    gameOver: gameOver
  };
})();

// Init on load
SFX.init();
