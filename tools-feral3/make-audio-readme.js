// Builds public/feral3/audio/README.md from the sound list in audio.mjs (so the list can never drift from the game).
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','public','feral3','js','audio.mjs'),'utf8');
const DESC={pistol_shot:'Pistol gunshot (3 variations recommended)',shotgun_shot:'Shotgun blast, big and boomy',rifle_shot:'Rifle shot (single round of an automatic burst; keep it short and tight)',bolt_shot:'Bolt-action rifle shot, heavy with a long tail',mg_shot:'Machine gun round (fires up to 13 times a second: keep it short, 4 variations)',gun_dry:'Empty-gun click',weapon_swap:'Switching guns',reload_pistol:'Full pistol reload sequence (mag out, mag in, slide)',reload_shotgun:'Full shotgun reload: six shells, then a pump',reload_rifle:'Full rifle reload',reload_bolt:'Full bolt rifle reload: rounds in, bolt closed',reload_mg:'Full machine gun reload: belt box open, belt, close, charge',shotgun_pump:'Shotgun pump action after every shot',bolt_cycle:'Bolt worked after every bolt rifle shot',shell_drop:'A brass casing hitting the ground',impact_hard:'A bullet hitting concrete / rock (3D positional)',impact_flesh:'A bullet hitting a creature (3D positional)',hit_head:'A headshot: sharper, cracking',hit_marker:'Tiny confirmation tick when you hit',kill_small:'A small creature dies',kill_medium:'A medium creature dies',kill_large:'A large creature dies',kill_boss:'The boss dies (long)',growl_small:'Idle growl / snarl of a small creature (positional)',growl_medium:'Idle growl of a medium creature',growl_large:'Deep rumbling growl of a large creature',boss_roar:'The Cinder Hydra roars (long, huge)',attack_small:'A small creature bites/swipes',attack_large:'A large creature attacks',leap:'A creature leaping at you',charge_roar:'A Rendermaw roars before it charges',stomp:'A ground stomp / slam (boss and Grimmaw)',spit:'A Gloomspitter spits acid',acid_splash:'Acid or fire splashing on the ground',breath_fire:'The Hydra breathing fire (long whoosh)',explosion:'A Powder Shell or Shockwave explosion',enrage:'A creature enrages',summon:'The boss calls its brood',footstep_small:'Footstep of a small creature',footstep_large:'Footstep of a large creature',step_concrete:'Your footstep on concrete / rock',step_dirt:'Your footstep on dirt and leaves',step_metal:'Your footstep on metal',player_hurt:'You take damage (grunt / impact)',player_death:'You die',heartbeat:'Heartbeat when your health is low (one beat pair, ~1 s)',barricade_break:'A creature tearing a board off a barricade',barricade_repair:'Nailing a board back',gate_open:'A gate opening after you buy it',buy:'Buying something',deny:'Not enough points',pickup:'Picking up a power-up',powerup_drop:'A power-up appears',perk_buy:'Buying a perk / Second Wind revive jingle',crate_open:'The Supply Crate rolling a gun (3 s)',crate_ready:'The Supply Crate offers your gun',bench_forge:'The Weapons Bench forging your gun',round_start:'A new round begins',round_end:'Round cleared',boss_spawn:'The boss appears in the Lava Cave',flashlight:'Flashlight click',ui_click:'Menu click',ui_tick:'Menu move tick',gameover:'Game over sting',lava_crackle:'Lava crackling (positional, randomly around the cave)',amb_wind:'Looping night wind (seamless loop, 8 to 30 s)',amb_crickets:'Looping jungle night insects (seamless loop)',amb_rumble:'Looping low volcanic rumble for the Lava Cave (seamless loop)'};
const MUS={music_menu:'Main menu music (loop)',music_low:'Gameplay music, rounds 1-5, calm and tense (loop)',music_mid:'Gameplay music, rounds 6-10, more intense (loop)',music_high:'Gameplay music, round 11+, very intense (loop)',music_boss:'Boss music while the Hydra is alive (loop)',music_over:'Game over music (loop)'};
const rows=[...src.matchAll(/^  ([a-z_0-9]+): R\(([0-9.]+),/gm)].map(m=>[m[1],+m[2]]);
const vars=Object.fromEntries([...src.matchAll(/([a-z_0-9]+): (\d+)[,}]/g)].filter(m=>/VARIATIONS/.test(src)).map(m=>[m[1],+m[2]]));
let md=`# Feral 3.0 - sound guide

The game makes its own placeholder sound for every id below, so nothing is silent. To use real sounds:

1. Put the audio files in this folder (any sub-folder is fine). **.ogg** (Vorbis/Opus) is best: small and loops cleanly. .mp3, .wav and .m4a also work.
2. Open [\`manifest.json\`](manifest.json) and list the file(s) for that id, e.g.
   \`\`\`json
   "pistol_shot": { "files": ["sfx/pistol_shot_1.ogg", "sfx/pistol_shot_2.ogg", "sfx/pistol_shot_3.ogg"], "volume": 1 }
   \`\`\`
   Give an id **several files** and the game picks one at random each time (with a little random pitch and volume), so repeated sounds do not feel robotic.
3. Reload the game (Ctrl+F5). **No code changes are needed.**

Tips
- **Loudness:** every clip is automatically normalised when it loads, so the balance between sounds stays sensible whatever level you export at. Use "volume" in the manifest (0.5 = half, 2 = double) to fine-tune one sound against the others. Export at 44.1 or 48 kHz, mono is fine for sound effects that are positional (they are placed in 3D around you), stereo for music and ambience.
- **Positional sounds** (marked "positional" below) are panned and made quieter by distance, so record them dry (no big reverb) and centred.
- **Loops** (ambience and music) must loop seamlessly: end the file exactly where it starts.
- Music files replace the built-in score. If you provide only some, the built-in score fills the rest.
- Optional per-sound settings in the manifest: \`"pitch": [0.9, 1.1]\` (random pitch range), \`"vol": [0.8, 1]\` (random volume range), \`"positional": false\`, \`"ref": 3\` (distance in metres at which it is full volume), \`"minGap": 0.03\` (seconds that must pass before it can play again).

## Every sound
| id | what it is | length of the placeholder | variations recommended |
|---|---|---|---|
`;
const POS=/POSITIONAL = new Set\(\[([^\]]+)\]/.exec(src)[1];
for(const [id,len] of rows){ const v=(/VARIATIONS = \{([^}]+)\}/.exec(src)[1].match(new RegExp(id+': (\d+)'))||[])[1]||'1'; md+=`| \`${id}\` | ${DESC[id]||''}${POS.includes("'"+id+"'")?' (positional)':''} | ${len} s | ${v} |\n`; }
md+=`\n## Music (optional files; loops)\n| id | what it is |\n|---|---|\n`;
for(const [id,d] of Object.entries(MUS)) md+=`| \`${id}\` | ${d} |\n`;
md+=`\nThe gameplay music switches between music_low / music_mid / music_high as the round number rises, and to music_boss while a boss is alive (it crossfades).\n`;
fs.writeFileSync(path.join(__dirname,'..','public','feral3','audio','README.md'),md);
console.log(rows.length+' sounds documented');
