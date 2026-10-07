# Feral 3.0 - sound guide

The game makes its own placeholder sound for every id below, so nothing is silent. To use real sounds:

1. Put the audio files in this folder (any sub-folder is fine). **.ogg** (Vorbis/Opus) is best: small and loops cleanly. .mp3, .wav and .m4a also work.
2. Open [`manifest.json`](manifest.json) and list the file(s) for that id, e.g.
   ```json
   "pistol_shot": { "files": ["sfx/pistol_shot_1.ogg", "sfx/pistol_shot_2.ogg", "sfx/pistol_shot_3.ogg"], "volume": 1 }
   ```
   Give an id **several files** and the game picks one at random each time (with a little random pitch and volume), so repeated sounds do not feel robotic.
3. Reload the game (Ctrl+F5). **No code changes are needed.**

Tips
- **Loudness:** every clip is automatically normalised when it loads, so the balance between sounds stays sensible whatever level you export at. Use "volume" in the manifest (0.5 = half, 2 = double) to fine-tune one sound against the others. Export at 44.1 or 48 kHz, mono is fine for sound effects that are positional (they are placed in 3D around you), stereo for music and ambience.
- **Positional sounds** (marked "positional" below) are panned and made quieter by distance, so record them dry (no big reverb) and centred.
- **Loops** (ambience and music) must loop seamlessly: end the file exactly where it starts.
- Music files replace the built-in score. If you provide only some, the built-in score fills the rest.
- Optional per-sound settings in the manifest: `"pitch": [0.9, 1.1]` (random pitch range), `"vol": [0.8, 1]` (random volume range), `"positional": false`, `"ref": 3` (distance in metres at which it is full volume), `"minGap": 0.03` (seconds that must pass before it can play again).

## Every sound
| id | what it is | length of the placeholder | variations recommended |
|---|---|---|---|
| `pistol_shot` | Pistol gunshot (3 variations recommended) | 0.45 s | 1 |
| `shotgun_shot` | Shotgun blast, big and boomy | 0.85 s | 1 |
| `rifle_shot` | Rifle shot (single round of an automatic burst; keep it short and tight) | 0.5 s | 1 |
| `bolt_shot` | Bolt-action rifle shot, heavy with a long tail | 1.1 s | 1 |
| `mg_shot` | Machine gun round (fires up to 13 times a second: keep it short, 4 variations) | 0.38 s | 1 |
| `gun_dry` | Empty-gun click | 0.1 s | 1 |
| `weapon_swap` | Switching guns | 0.3 s | 1 |
| `reload_pistol` | Full pistol reload sequence (mag out, mag in, slide) | 1.4 s | 1 |
| `reload_shotgun` | Full shotgun reload: six shells, then a pump | 2.6 s | 1 |
| `reload_rifle` | Full rifle reload | 2.1 s | 1 |
| `reload_bolt` | Full bolt rifle reload: rounds in, bolt closed | 2.9 s | 1 |
| `reload_mg` | Full machine gun reload: belt box open, belt, close, charge | 4.6 s | 1 |
| `shotgun_pump` | Shotgun pump action after every shot | 0.5 s | 1 |
| `bolt_cycle` | Bolt worked after every bolt rifle shot | 0.8 s | 1 |
| `shell_drop` | A brass casing hitting the ground | 0.3 s | 1 |
| `impact_hard` | A bullet hitting concrete / rock (3D positional) (positional) | 0.3 s | 1 |
| `impact_flesh` | A bullet hitting a creature (3D positional) (positional) | 0.3 s | 1 |
| `hit_head` | A headshot: sharper, cracking (positional) | 0.35 s | 1 |
| `hit_marker` | Tiny confirmation tick when you hit | 0.08 s | 1 |
| `kill_small` | A small creature dies (positional) | 0.6 s | 1 |
| `kill_medium` | A medium creature dies (positional) | 0.9 s | 1 |
| `kill_large` | A large creature dies (positional) | 1.6 s | 1 |
| `kill_boss` | The boss dies (long) (positional) | 3.2 s | 1 |
| `growl_small` | Idle growl / snarl of a small creature (positional) (positional) | 0.7 s | 1 |
| `growl_medium` | Idle growl of a medium creature (positional) | 1.1 s | 1 |
| `growl_large` | Deep rumbling growl of a large creature (positional) | 1.8 s | 1 |
| `boss_roar` | The Cinder Hydra roars (long, huge) (positional) | 3.2 s | 1 |
| `attack_small` | A small creature bites/swipes (positional) | 0.4 s | 1 |
| `attack_large` | A large creature attacks (positional) | 0.7 s | 1 |
| `leap` | A creature leaping at you (positional) | 0.5 s | 1 |
| `charge_roar` | A Rendermaw roars before it charges (positional) | 1 s | 1 |
| `stomp` | A ground stomp / slam (boss and Grimmaw) (positional) | 1 s | 1 |
| `spit` | A Gloomspitter spits acid (positional) | 0.4 s | 1 |
| `acid_splash` | Acid or fire splashing on the ground (positional) | 0.5 s | 1 |
| `breath_fire` | The Hydra breathing fire (long whoosh) (positional) | 1.8 s | 1 |
| `explosion` | A Powder Shell or Shockwave explosion (positional) | 1.8 s | 1 |
| `enrage` | A creature enrages (positional) | 0.9 s | 1 |
| `summon` | The boss calls its brood (positional) | 1.4 s | 1 |
| `footstep_small` | Footstep of a small creature (positional) | 0.2 s | 1 |
| `footstep_large` | Footstep of a large creature (positional) | 0.5 s | 1 |
| `step_concrete` | Your footstep on concrete / rock | 0.25 s | 1 |
| `step_dirt` | Your footstep on dirt and leaves | 0.25 s | 1 |
| `step_metal` | Your footstep on metal | 0.3 s | 1 |
| `player_hurt` | You take damage (grunt / impact) | 0.6 s | 1 |
| `player_death` | You die | 2.4 s | 1 |
| `heartbeat` | Heartbeat when your health is low (one beat pair, ~1 s) | 1 s | 1 |
| `barricade_break` | A creature tearing a board off a barricade (positional) | 0.6 s | 1 |
| `barricade_repair` | Nailing a board back (positional) | 0.35 s | 1 |
| `gate_open` | A gate opening after you buy it (positional) | 2.2 s | 1 |
| `buy` | Buying something | 0.5 s | 1 |
| `deny` | Not enough points | 0.4 s | 1 |
| `pickup` | Picking up a power-up | 0.6 s | 1 |
| `powerup_drop` | A power-up appears (positional) | 0.4 s | 1 |
| `perk_buy` | Buying a perk / Second Wind revive jingle | 1.2 s | 1 |
| `crate_open` | The Supply Crate rolling a gun (3 s) | 2.8 s | 1 |
| `crate_ready` | The Supply Crate offers your gun | 0.8 s | 1 |
| `bench_forge` | The Weapons Bench forging your gun | 1.6 s | 1 |
| `round_start` | A new round begins | 2 s | 1 |
| `round_end` | Round cleared | 1.6 s | 1 |
| `boss_spawn` | The boss appears in the Lava Cave (positional) | 3.5 s | 1 |
| `flashlight` | Flashlight click | 0.1 s | 1 |
| `ui_click` | Menu click | 0.08 s | 1 |
| `ui_tick` | Menu move tick | 0.05 s | 1 |
| `gameover` | Game over sting | 3.5 s | 1 |
| `lava_crackle` | Lava crackling (positional, randomly around the cave) (positional) | 0.5 s | 1 |
| `amb_wind` | Looping night wind (seamless loop, 8 to 30 s) | 8 s | 1 |
| `amb_crickets` | Looping jungle night insects (seamless loop) | 8 s | 1 |
| `amb_rumble` | Looping low volcanic rumble for the Lava Cave (seamless loop) | 8 s | 1 |

## Music (optional files; loops)
| id | what it is |
|---|---|
| `music_menu` | Main menu music (loop) |
| `music_low` | Gameplay music, rounds 1-5, calm and tense (loop) |
| `music_mid` | Gameplay music, rounds 6-10, more intense (loop) |
| `music_high` | Gameplay music, round 11+, very intense (loop) |
| `music_boss` | Boss music while the Hydra is alive (loop) |
| `music_over` | Game over music (loop) |

The gameplay music switches between music_low / music_mid / music_high as the round number rises, and to music_boss while a boss is alive (it crossfades).
