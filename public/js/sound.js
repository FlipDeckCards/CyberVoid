/* ══════════════════════════════════════════════════════
   sound.js — CyberVoid SFX (Real Audio)
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var volume = 0.5;
  var muted = false;

  // ── Preload all audio ──
  var sounds = {
    pistol:       new Audio('/pistol_shot.wav'),
    shotgun:      new Audio('/shotgun_shot.wav'),
    rifle:        new Audio('/rifle_shot.wav'),
    rocket:       new Audio('/rocket_launcer_shot.wav'),
    enemyDeath:   new Audio('/rocket_impact.wav'),
    hitCritical:  new Audio('/bullet_impact.wav'),
    hitCorner:    new Audio('/riccochet_impact.wav'),
    powerup:      new Audio('/power_up.wav'),
    waveComplete: new Audio('/next_wave.mp3'),
    gameOver:     new Audio('/game_over.mp3'),
    gameStart:    new Audio('/game_on.mp3')
  };

  // Set initial volume on all sounds
  Object.keys(sounds).forEach(function (key) {
    sounds[key].volume = volume;
  });

  // ── Play helper (resets if already playing) ──
  function play(key) {
    if (muted || !sounds[key]) return;
    sounds[key].currentTime = 0;
    sounds[key].volume = volume;
    sounds[key].play().catch(function () {});
  }

  // ── Public API ──
  window.GameSound = {
    pistol:       function () { play('pistol'); },
    shotgun:      function () { play('shotgun'); },
    rifle:        function () { play('rifle'); },
    rocket:       function () { play('rocket'); },
    enemyDeath:   function () { play('enemyDeath'); },
    hitCritical:  function () { play('hitCritical'); },
    hitCorner:    function () { play('hitCorner'); },
    powerup:      function () { play('powerup'); },
    waveComplete: function () { play('waveComplete'); },
    gameOver:     function () { play('gameOver'); },
    gameStart:    function () { play('gameStart'); },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      Object.keys(sounds).forEach(function (key) {
        sounds[key].volume = volume;
      });
    },
    getVolume:  function () { return volume; },
    mute:       function () { muted = true; },
    unmute:     function () { muted = false; },
    isMuted:    function () { return muted; },
    toggle:     function () { muted = !muted; return muted; }
  };
})();
