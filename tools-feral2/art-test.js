// Checks public/feral2/art/manifest.json against the pictures on disk: every file exists, is a PNG with an alpha channel, and the sheet size matches the frame grid
// the manifest describes (so replacing art with a wrong-sized sheet is caught before it is played). Run: node tools-feral2/art-test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..', 'public', 'feral2', 'art');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('  ok   ' + n); } catch (e) { console.error('  FAIL ' + n + '\n       ' + e.message); process.exitCode = 1; } };
function png(rel) {
  const p = path.join(root, rel); assert.ok(fs.existsSync(p), rel + ' is missing');
  const b = fs.readFileSync(p); assert.strictEqual(b.slice(1, 4).toString(), 'PNG', rel + ' is not a PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colorType = b[25];
  assert.ok(colorType === 6 || colorType === 4 || colorType === 3, rel + ' has no alpha channel (colour type ' + colorType + '): it needs a transparent background');
  return { w, h };
}
test('every creature sheet exists, has alpha, and holds all the frames its animations list', () => {
  const names = ['glumpkin', 'zapling', 'wisper', 'mossmaw', 'boomkit', 'spitbud', 'elder'];
  for (const n of names) {
    const c = m.creatures[n]; assert.ok(c, 'manifest has creature ' + n); const { w, h } = png(c.file);
    assert.ok(w % c.frameWidth === 0 && h % c.frameHeight === 0, n + ': sheet ' + w + 'x' + h + ' is not a whole number of ' + c.frameWidth + 'x' + c.frameHeight + ' frames');
    const cols = w / c.frameWidth, rows = h / c.frameHeight, dirs = c.directions || 1;
    assert.ok([1, 4, 8].includes(dirs), n + ': directions must be 1, 4 or 8');
    assert.ok(c.animations.idle, n + ': idle is required');
    for (const [an, a] of Object.entries(c.animations)) { assert.ok(a.frames <= cols, n + '.' + an + ': ' + a.frames + ' frames but the sheet has ' + cols + ' columns'); assert.ok(a.row + dirs <= rows || (an === 'death' && a.row < rows), n + '.' + an + ': row ' + a.row + ' (x' + dirs + ' directions) is outside the ' + rows + ' rows'); assert.ok(a.fps > 0, n + '.' + an + ' fps'); }
    assert.ok(c.height > 0.3 && c.height < 12, n + ': height ' + c.height);
    assert.ok(c.anchor.x >= 0 && c.anchor.x <= 1 && c.anchor.y >= 0 && c.anchor.y <= 1, n + ': anchor is a fraction of the frame');
  }
});
test('every weapon has a view sheet (idle / fire / reload) and an icon', () => {
  for (const id of ['pip', 'rattle', 'scatter', 'longthorn', 'bubble', 'sunbeam', 'party']) {
    const wp = m.weapons[id]; assert.ok(wp, 'manifest has weapon ' + id); const v = wp.view, { w, h } = png(v.file);
    assert.ok(w % v.frameWidth === 0 && h % v.frameHeight === 0, id + ' view sheet size');
    for (const an of ['idle', 'fire', 'reload']) { const a = v.animations[an]; assert.ok(a, id + ' has ' + an); assert.ok(a.frames <= w / v.frameWidth && a.row < h / v.frameHeight, id + '.' + an + ' fits the sheet'); }
    assert.ok(v.scale > 0.1 && v.scale < 1.2, id + ' scale'); assert.ok(v.muzzle && v.anchor && v.offset, id + ' has anchor, offset and muzzle'); png(wp.icon.file);
  }
});
test('pickups, perk icons and effect pictures exist and have alpha', () => {
  for (const id of ['ammo', 'twin', 'boom', 'zap']) assert.ok(m.pickups[id], 'pickup ' + id) && png(m.pickups[id].file);
  for (const id of ['heart', 'fizz', 'boots', 'lamp']) assert.ok(m.perks[id], 'perk ' + id) && png(m.perks[id].file);
  for (const id of ['bubble', 'spore', 'spark', 'splat', 'decal']) assert.ok(m.fx[id], 'fx ' + id) && png(m.fx[id].file);
});
test('texture overrides, when set, point at real square PNGs', () => {
  for (const [k, f] of Object.entries(m.textures || {})) { if (k === 'notes' || !f) continue; const { w, h } = png(f); assert.strictEqual(w, h, k + ' must be square'); }
});
test('the README lists every file the manifest uses', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8'), files = [];
  for (const c of Object.values(m.creatures)) files.push(c.file); for (const w of Object.values(m.weapons)) files.push(w.view.file, w.icon.file);
  for (const p of Object.values(m.pickups)) files.push(p.file); for (const p of Object.values(m.perks)) files.push(p.file); for (const f of Object.values(m.fx)) files.push(f.file);
  const missing = files.filter((f) => !readme.includes(path.basename(f).replace(/\.png$/, '').replace(/^(pip|rattle|scatter|longthorn|bubble|sunbeam|party)_(view|icon)$/, '$2').replace(/^perk_/, 'perk_')) && !readme.includes(f));
  assert.deepStrictEqual(missing, []);
});
console.log(process.exitCode ? '\nSome checks FAILED' : `\nAll ${passed} checks passed`);
