// Checks the Zombies arena layout: every free cell reachable, gates free, flow field leads every gate to the player, collision slides.
// Usage: node tools-feral3/zombies-layout-test.js
(async () => {
    const L = await import('../public/zombies/layout.js');
    let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
    let free = 0; for (let k = 0; k < L.N * L.N; k++) if (!L.blocked[k]) free++;
    L.updateFlow(0, 0, true);
    let reach = 0, lost = []; for (let k = 0; k < L.N * L.N; k++) if (!L.blocked[k]) { if (L.dist[k] < 1e9) reach++; else lost.push([L.cellCenter(k % L.N), L.cellCenter((k / L.N) | 0)]); }
    ok(reach === free, `all free cells reachable from the centre (${reach}/${free})` + (lost.length ? ' unreachable e.g. ' + JSON.stringify(lost.slice(0, 5)) : ''));
    for (const [x, z] of L.GATES) ok(!L.isBlockedAt(x, z), `gate ${x},${z} is free`);
    // walk a simulated enemy from every gate to several player spots by following the flow field
    const targets = [[0, 0], [20, 20], [-30, -10], [0, 12], [-40, 41], [30, -40], [5, -30]];
    for (const [tx, tz] of targets) {
        L.updateFlow(tx, tz, true);
        let allOk = true, worst = 0;
        for (const [gx, gz] of L.GATES) {
            const p = { x: gx, z: gz }, d = {}; let steps = 0;
            while (Math.hypot(p.x - tx, p.z - tz) > 2.0 && steps < 4000) {
                if (!L.flowDir(p.x, p.z, d)) { allOk = false; break; }
                p.x += d.x * 0.1; p.z += d.z * 0.1; L.resolveCircle(p, 0.45); steps++;
            }
            if (steps >= 4000) { allOk = false; console.log("  stuck gate", gx, gz, "at", p.x.toFixed(1), p.z.toFixed(1)); } worst = Math.max(worst, steps * 0.1);
        }
        ok(allOk, `every gate reaches the player at ${tx},${tz} (longest walk ${worst.toFixed(0)} m)`);
    }
    // sliding: push a circle diagonally into a wall; it must keep moving along it, never get stuck inside
    const o = { x: -32, z: 6 + 0.65 + 2 }; let moved = 0;
    for (let s = 0; s < 25; s++) { const ox = o.x; o.x += 0.1; o.z -= 0.1; L.resolveCircle(o, 0.4); moved += o.x - ox; }
    ok(moved > 2.0 && o.z >= 6 + 0.65 + 0.4 - 1e-3, `slides along a sandbag wall (moved ${moved.toFixed(1)} m along it)`);
    const q = { x: 0, z: 0 }; L.resolveCircle(q, 0.4); ok(q.x === 0 && q.z === 0, 'bunker centre is open floor');
    const e = { x: 49.9, z: 0 }; L.resolveCircle(e, 0.4); ok(e.x <= L.FLOOR - 0.4 + 1e-6, 'perimeter wall holds');
    console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
