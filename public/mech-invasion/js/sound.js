/* ══════════════════════════════════════════════════════
   sound.js — CyberVoid SFX (Real Audio)
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var volume = 0.5;
  var muted = false;

  // ── Preload all audio ──
  var sounds = {
    pistol:       new Audio('sounds/pistol_shot.wav'),
    shotgun:      new Audio('sounds/shotgun_shot.wav'),
    rifle:        new Audio('sounds/rifle_shot.wav'),
    rocket:       new Audio('sounds/rocket_launcer_shot.wav'),
    enemyDeath:   new Audio('sounds/rocket_impact.wav'),
    hitCritical:  new Audio('sounds/bullet_impact.wav'),
    hitCorner:    new Audio('sounds/riccochet_impact.wav'),
    powerup:      new Audio('sounds/power_up.wav'),
    waveComplete: new Audio('sounds/next_wave.mp3'),
    gameOver:     new Audio('sounds/game_over.mp3'),
    gameStart:    new Audio('sounds/game_on.mp3')
  };

  // ── Background Music (gameplay) ──
  var music = new Audio('sounds/i_dont_like_monday.mp3');
  music.loop = true;
  music.volume = 0.25;

  // ── Menu Music (start screen + game over) ──  ◄ NEW
  var menuMusic = new Audio('sounds/chrome_riot.mp3');
  menuMusic.loop = true;
  menuMusic.volume = 0.35;

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

    musicStart:  function () { if (!muted) music.play().catch(function () {}); },
    musicStop:   function () { music.pause(); music.currentTime = 0; },
    musicPause:  function () { music.pause(); },
    setMusicVol: function (v) { music.volume = Math.max(0, Math.min(1, v)); },

    // ── Menu music controls ──  ◄ NEW
    menuMusicStart: function () {
      if (muted || !menuMusic.paused) return;
      menuMusic.currentTime = 0;
      menuMusic.play().catch(function () {});
    },
    menuMusicStop: function () {
      menuMusic.pause();
      menuMusic.currentTime = 0;
    },

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
