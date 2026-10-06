# Dead Zone: Feral

A top-down wave-survival shooter for the Deadzone Games site. Lives at `/feral/`.

- **Play:** `public/feral/index.html` (no build step, no libraries, no image or sound files: all art and audio are generated in code).
- **Files:** `js/data.js` (weapons, creatures, perks, map, round plan) · `js/sim.js` (the rules, no DOM) · `js/art.js` (sprites drawn in code) · `js/render.js` · `js/audio.js` (Web Audio) · `js/input.js` (touch, keyboard + mouse, gamepad) · `js/ui.js` (menus and HUD) · `js/main.js` (loop).
- **Controls:** touch twin-stick, keyboard + mouse, PlayStation / any standard gamepad (the prompts follow whichever you used last).
- **Saved on the device:** settings (`dzf_settings`) and the best run (`dzf_best`), in localStorage.
- **Installable:** `manifest.webmanifest` + `sw.js` + `icons/`. Works offline after the first visit.

## Testing (Node, from the repo root)
```
node tools-feral/sim-test.js 10 25     # map checks + a bot plays up to 25 rounds on 10 seeds (no softlocks)
node tools-feral/rules-test.js         # shop, perks, windows, power-ups, creatures, safety nets
node tools-feral/serve.js 5173         # local server; open http://localhost:5173/feral/
```
`tools-feral/` is for development only and is not needed to run the game.

## Wrapping it for Google Play later
The game is a plain installable web app (manifest, maskable icons, service worker, landscape, fullscreen), so it can be wrapped as a Trusted Web Activity (for example with Bubblewrap / PWABuilder) pointing at `https://<site>/feral/`. Nothing in the game needs to change; the Play Store listing, signing key and Digital Asset Links file are the remaining steps.
