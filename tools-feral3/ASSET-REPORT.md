# Feral 3.0 - asset audit and optimisation report

All 34 files in the asset folder were inspected (read-only). Every model is a single static mesh with PBR textures (base colour, normal, metal/roughness), **no rig and no animations**, in arbitrary units, with the creatures long along Z and the guns long along X. The two Map Sections are layout blueprints only and are not used (not committed).

| asset | file before | tris before | textures before | file after | tris after (LOD0 / LOD1 / LOD2) | textures after | real size (m) |
|---|---|---|---|---|---|---|---|
| Small 1 | 22 MB | 557,882 | 2048x2048 JPEG x3 | 0.69 MB | 29,998 / 8,994 / 2,386 | 1024 WebP x3 | 1.29 x 1.75 x 2.95 |
| Small 2 | 29.8 MB | 792,650 | 2048x2048 JPEG x3 | 0.85 MB | 30,000 / 9,000 / 2,220 | 1024 WebP x3 | 1.34 x 1.85 x 2.65 |
| Small 3 | 32 MB | 894,142 | 2048x2048 JPEG x3 | 0.75 MB | 30,000 / 9,000 / 2,100 | 1024 WebP x3 | 1.29 x 1.85 x 2.69 |
| Medium 1 | 28.9 MB | 750,620 | 2048x2048 JPEG x3 | 1.98 MB | 39,998 / 11,998 / 2,798 | 2048 WebP x3 | 2.71 x 2.50 x 6.17 |
| Medium 2 | 28.8 MB | 734,896 | 2048x2048 JPEG x3 | 2.15 MB | 39,998 / 11,998 / 2,798 | 2048 WebP x3 | 2.48 x 2.70 x 5.72 |
| Medium 3 | 28 MB | 715,752 | 2048x2048 JPEG x3 | 2.00 MB | 40,000 / 12,000 / 2,800 | 2048 WebP x3 | 2.35 x 2.60 x 5.62 |
| Large 1 | 43.9 MB | 1,263,804 | 2048x2048 JPEG x3 | 2.26 MB | 49,998 / 14,998 / 5,774 | 2048 WebP x3 | 3.75 x 4.10 x 5.06 |
| Large 2 | 37.8 MB | 1,077,366 | 2048x2048 JPEG x3 | 2.02 MB | 50,000 / 15,000 / 3,500 | 2048 WebP x3 | 3.52 x 3.70 x 7.05 |
| Final Boss | 61.4 MB | 1,869,042 | 2048x2048 JPEG x3 | 2.95 MB | 79,998 / 23,998 / 6,362 | 2048 WebP x3 | 7.76 x 8.50 x 11.06 |
| Male Character | 34.1 MB | 978,170 | 2048x2048 JPEG x3 | 1.46 MB | 39,996 | 2048 WebP x3 | 0.67 x 1.80 x 0.44 |
| Female Character | 32.8 MB | 926,808 | 2048x2048 JPEG x3 | 1.51 MB | 40,000 | 2048 WebP x3 | 0.63 x 1.70 x 0.42 |
| Pistol | 38.4 MB | 1,054,858 | 2048x2048 JPEG x3 | 2.37 MB | 19,998 | 2048 WebP x3 | 0.04 x 0.15 x 0.22 |
| Shotgun | 21.4 MB | 451,806 | 2048x2048 JPEG x3 | 2.00 MB | 24,994 | 2048 WebP x3 | 0.05 x 0.32 x 0.95 |
| Rifle | 19.8 MB | 371,128 | 2048x2048 JPEG x3 | 2.24 MB | 25,000 | 2048 WebP x3 | 0.08 x 0.32 x 0.95 |
| Bolt Action Rifle | 15 MB | 241,296 | 2048x2048 JPEG x3 | 1.86 MB | 24,998 | 2048 WebP x3 | 0.10 x 0.29 x 1.15 |
| Machine Gun | 19.6 MB | 380,144 | 2048x2048 JPEG x3 | 2.10 MB | 25,000 | 2048 WebP x3 | 0.24 x 0.37 x 1.00 |
| Map Section 1 / 2 | 253.3 MB / 156.8 MB | 7,979,944 / 4,625,100 | 4096 JPEG | not used (blueprints) | - | - | - |

**Totals (16 models):** 494 MB before -> 29.2 MB after (94.1% smaller). With the procedural textures (~1.5 MB), sounds (synthesised in code, 0 MB) and the three.js library the whole game is about 38 MB; only 3 models (~5 MB) are needed before the menu appears, the rest stream in while you play.

## What was done
- Simplified with meshoptimizer (weld + simplify) to the triangle budgets: creatures 30-50k, boss 80k, guns 20-25k, survivors 40k. Creatures also get LOD1 (30%) and LOD2 (7%) copies that share vertices and textures; the game picks the level by distance.
- Textures resized (creatures 1024 / 2048, everything else 2048) and converted from JPEG to WebP; geometry quantised and meshopt-compressed (EXT_meshopt_compression).
- Orientation, scale and pivot baked into the vertices: creatures and survivors face +Z with the origin at the feet; guns have the muzzle on +Z (found by comparing the cross-section at both ends) with the origin at the centre. Sizes are in metres (survivors 1.8 m, creatures 1.75-8.5 m, guns 0.22-1.15 m).
- Because the models have no skeleton they are animated in the vertex shader (walk cycle, tail, lunge, flinch, crouch, fall-over death with a burning dissolve), and the guns are animated procedurally (bob, sway, recoil springs, pump/bolt cycles, per-gun reloads).
- KTX2 was not used (no toktx encoder installed): the WebP textures decode to GPU memory uncompressed, roughly 0.8 GB of video memory for the whole set (2048 textures x3 per model, with mip-maps). Fine on a desktop GPU with 4 GB or more; compressing to KTX2 (about 6x smaller on the GPU) is the first thing to do for the mobile version.
- Not committed: the originals and the Map Sections (the .gitignore blocks the folder and `*.glb` raw copies); the biggest committed file is under 3.1 MB.
