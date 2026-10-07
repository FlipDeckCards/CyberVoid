# Feral 2.0 - art guide

Every creature, gun, pickup, icon and effect picture in Feral 2.0 is a normal **transparent PNG** that the game loads from
[`manifest.json`](manifest.json) when it starts. To use your own art:

1. Draw (or generate) the PNG so that it matches the layout described below.
2. Save it over the old file with **the same file name** (or save it with a new name and change the `"file"` entry in `manifest.json`).
3. If your picture has a different size or number of frames, change the numbers for it in `manifest.json` (frame size, frames per animation, height in the world).
4. Reload the game. **No code changes are needed.** (If the game still shows the old picture, hard-refresh with Ctrl+F5, because the browser and the install-as-app copy cache files.)

Everything is a PNG with a **transparent background** (real alpha, not a white or black box). Bigger is fine: the game scales every picture to the size
given in the manifest, so you can use 256, 512 or even 1024 pixel frames for sharper art. Keep every frame of one sheet exactly the same size.
Leave a few pixels of empty space around the drawing inside each frame so nothing is cut off (flames, antennae, crowns, shadows).

The pictures the game ships with are original placeholders made by `tools-feral2/make-art.js`; replace them whenever you like.

---

## 1. Creatures - `creatures/<name>.png`

One **sprite sheet** per creature. The creature always turns to face the player (it is a "billboard", like the monsters in the old Doom games),
so the minimum is **one view: the creature seen from the front**. If you draw more views the game picks the right one automatically (see "Directions").

| name file | creature | default frame | world height in `manifest.json` |
|---|---|---|---|
| `glumpkin.png` | Glumpkin (pumpkin blob; splits when hit) | 128 x 128 | 2.3 |
| `zapling.png`  | Zapling (twitchy sprout, dashes) | 128 x 128 | 1.9 |
| `wisper.png`   | Wisper (ghost, floats) | 128 x 128 | 2.6 (and `hover` 0.7) |
| `mossmaw.png`  | Mossmaw (big mossy tank) | 128 x 128 | 3.4 |
| `boomkit.png`  | Boomkit (runs at you and explodes) | 128 x 128 | 1.7 |
| `spitbud.png`  | Spitbud (flower that spits spores) | 128 x 128 | 2.7 |
| `elder.png`    | Elder Mossmaw (boss, every 5th round) | 256 x 256 | 6.2 |

### Sheet layout (default, 1 direction)

The sheet is a grid of equally sized frames. **Rows are animations, columns are the frames of that animation, left to right.**
The default order, top to bottom:

| row | animation | frames | speed | plays |
|---|---|---|---|---|
| 0 | `idle`   | 2 | 3 fps | looping, when standing still |
| 1 | `walk`   | 4 | 8 fps | looping, when moving |
| 2 | `attack` | 3 | 10 fps | once, when it bites / spits / slams |
| 3 | `hurt`   | 1 | 8 fps | when it is hit (also shows a white flash) |
| 4 | `death`  | 4 | 7 fps | once when it is beaten, then the last frame stays on the floor for a few seconds and sinks away |

So a default sheet is `4 frames x 128 px = 512 px` wide and `5 rows x 128 px = 640 px` high (the Elder: 1024 x 1280).
Unused cells stay empty/transparent. The sheet may have more columns than any animation uses.

### The `manifest.json` entry

```json
"glumpkin": {
  "file": "creatures/glumpkin.png",
  "frameWidth": 128, "frameHeight": 128,
  "directions": 1,
  "height": 2.3,
  "anchor": { "x": 0.5, "y": 0.89 },
  "hover": 0,
  "animations": {
    "idle":   { "row": 0, "frames": 2, "fps": 3,  "loop": true  },
    "walk":   { "row": 1, "frames": 4, "fps": 8,  "loop": true  },
    "attack": { "row": 2, "frames": 3, "fps": 10, "loop": false },
    "hurt":   { "row": 3, "frames": 1, "fps": 8,  "loop": false },
    "death":  { "row": 4, "frames": 4, "fps": 7,  "loop": false }
  }
}
```

* `frameWidth` / `frameHeight` - size in pixels of **one frame** of your sheet.
* `height` - how tall the whole frame is in the game world. The player's eyes are at 1.45 and a door is about 3.8 high, so 2.3 is a bit taller than the player.
  The width follows from the frame shape. Make the creature bigger or smaller in the game by changing only this number.
* `anchor` - the point of the frame that stands on the floor, as a fraction of the frame (`x` 0 = left edge, 1 = right edge; `y` 0 = top, 1 = bottom).
  `{ "x": 0.5, "y": 0.89 }` means "centred, with the feet 89 percent of the way down". Draw the feet on that line.
* `hover` - lifts the creature off the floor (in world units). Used for the floating Wisper.
* `animations` - for each animation: `row` (which row of the sheet), `frames` (how many), `fps` (speed), `loop` (`true` = repeat, `false` = play once).
  Any animation you leave out falls back to `idle`; `idle` is required. You may give an animation more or fewer frames than the default.

### Directions (optional)

By default `"directions": 1` and the creature is drawn from the front. To draw it from several sides set `"directions"` to **4** or **8**.
Then **every animation takes `directions` rows** instead of one: the animation's `row` is its first row and the following rows are the other views.
View order (row offset 0, 1, 2 ...): the creature seen **from the front** (it is facing the player), then turning **clockwise as you look down on it** - i.e. as the player
walks round it to its right: front, front-right, right, back-right, back, back-left, left, front-left (for 4 directions: front, right, back, left).
Example for 8 directions: `idle` at `row: 0`, `walk` at `row: 8`, `attack` at `row: 16`, `hurt` at `row: 24`, `death` at `row: 32` (death always uses the first view).

---

## 2. Weapons in your hands - `weapons/<id>_view.png` and `weapons/<id>_icon.png`

Seven guns: `pip`, `rattle`, `scatter`, `longthorn`, `bubble`, `sunbeam`, `party`.

### `<id>_view.png` - the gun in first person

A sprite sheet drawn **from behind the gun, pointing up the picture**, as in the old shooters. It is drawn at the bottom centre of the screen. Default frame 192 x 192.

| row | animation | frames | notes |
|---|---|---|---|
| 0 | `idle`   | 1 | resting |
| 1 | `fire`   | 3 | the muzzle flash and the kick; plays once per shot (28 fps) |
| 2 | `reload` | 4 | spread over the reload time of the gun, whatever it is |

The game adds walking bob, sprint lowering, turn sway, recoil kick, the lowering/raising when you swap, and a glow at the muzzle - you only draw the poses.

```json
"pip": { "view": {
  "file": "weapons/pip_view.png", "frameWidth": 192, "frameHeight": 192,
  "scale": 0.44,
  "anchor": { "x": 0.5, "y": 1 },
  "offset": { "x": 0, "y": 0 },
  "muzzle": { "x": 0.5, "y": 0.1 },
  "animations": { "idle": {"row":0,"frames":1,"fps":1,"loop":true}, "fire": {"row":1,"frames":3,"fps":28,"loop":false}, "reload": {"row":2,"frames":4,"fps":7,"loop":false} }
}, "icon": { "file": "weapons/pip_icon.png", "width": 192, "height": 96 } }
```

* `scale` - how much of the screen height one frame covers (0.44 = 44 percent of the height).
* `anchor` - the part of the frame that sits on the bottom edge of the screen (fractions; `{0.5, 1}` = bottom centre).
* `offset` - nudge it (fractions of the screen: `x` positive = right, `y` positive = down).
* `muzzle` - where the muzzle is in the frame (fractions); the flash glow is drawn there.
* `animations` - as for creatures (`row`, `frames`, `fps`, `loop`).

### `<id>_icon.png` - the picture for the HUD, the wall posters and the Wobble Chest

One single picture of the gun from the side, **2 : 1 wide** (default 192 x 96), transparent. It is used in the ammo display, on the poster for wall guns, and floating above the Wobble Chest.

---

## 3. Pickups - `pickups/<id>.png`

One picture each, square, default 128 x 128: `ammo` (Ammo Acorn), `twin` (Twin Star), `boom` (Boom Berry), `zap` (Zap Daisy).
They float and bob in the world and also appear in the HUD.

```json
"ammo": { "file": "pickups/ammo.png", "width": 128, "height": 128, "size": 1.1, "hover": 1, "color": "#c8884a" }
```
`size` = world size, `hover` = height above the floor, `color` = the colour of the glow around it.

## 4. Perk icons - `icons/perk_<id>.png`

Square, default 96 x 96: `perk_heart.png` (Gummy Heart), `perk_fizz.png` (Fizz Flip), `perk_boots.png` (Zoom Boots), `perk_lamp.png` (Lucky Lantern).
Used on the perk machines and in the HUD.

## 5. Effect pictures - `fx/<id>.png`

White or coloured pictures on a transparent background that the game tints and scales:

| file | size | used for |
|---|---|---|
| `fx/bubble.png` | 128 x 128 | Bubblurp bubbles and bubble pops |
| `fx/spore.png`  | 64 x 64   | Spitbud spores |
| `fx/spark.png`  | 64 x 64   | sparkles and hit sparks (additive: black = invisible) |
| `fx/splat.png`  | 128 x 128 | goo splats on creatures, the floor and the death puddles (drawn in the creature's colour) |
| `fx/decal.png`  | 64 x 64   | bullet marks on walls |

---

## 6. Walls, floors and ceilings (optional)

The walls, floors, ceilings, doors and scenery are drawn by the game in code. To replace one with your own picture, put a **square, seamlessly tiling PNG**
(256 x 256 or 512 x 512 recommended) in this folder and name it in the `"textures"` section at the bottom of `manifest.json`:

```json
"textures": { "barn_wall": "textures/barn_wall.png", "barn_floor": null, ... }
```
Available names: `barn_wall`, `barn_floor`, `patch_wall`, `patch_floor`, `mill_wall`, `mill_floor`, `crypt_wall`, `crypt_floor`, `pond_wall`, `pond_floor`,
`yard`, `yard_wall`, `hall_wall`, `hall_floor`, `door`, `crate`, `barrel`, `hay`, `pumpkin`, `grave`, `water`, `plank`, `ceiling_wood`, `ceiling_stone`, `sky`.
`null` keeps the built-in texture. The game adds its lantern lighting, fog and flicker on top, so draw them in normal even light.

---

## Checklist

* Transparent background (PNG-24/32 with alpha), not JPG.
* Every frame in a sheet the same size; the sheet is exactly `columns x frameWidth` wide and `rows x frameHeight` high.
* Feet on the anchor line; some empty margin around the drawing.
* Numbers in `manifest.json` match the picture (`frameWidth`, `frameHeight`, `frames`, `row`).
* After changing pictures, check the file with `node tools-feral2/art-test.js` (it checks that every file in the manifest exists, is a PNG and has the size the manifest says).
