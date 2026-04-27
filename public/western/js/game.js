(function() {
    'use strict';

    // === CANVAS ===
    var canvas = document.getElementById('gameCanvas');
    var ctx = canvas.getContext('2d');
    var W, H;

    // === GAME STATE ===
    var state = 'menu';
    var score = 0;
    var wave = 1;
    var health = 100;

    // === MAP ===
    var map = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
        [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
        [1,0,2,2,2,0,0,0,0,0,3,3,3,3,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
        [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
        [1,0,4,4,4,4,0,0,0,0,0,5,5,5,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,6,6,0,0,0,0,0,0,0,2,2,2,0,1],
        [1,0,6,6,0,0,0,0,0,0,0,2,2,2,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    var mapW = 16, mapH = 16;
// === WALL COLORS BY BUILDING TYPE ===
    var WALL_COLORS = {
        1: {light: '#8B7355', dark: '#6B5335'},
        2: {light: '#5C3A1E', dark: '#3E2712'},
        3: {light: '#808080', dark: '#5A5A5A'},
        4: {light: '#D4B896', dark: '#A89070'},
        5: {light: '#8B3A1A', dark: '#6B2A0A'},
        6: {light: '#B8956A', dark: '#8B7040'}
    };

    function fogColor(hex, fog) {
        var r = parseInt(hex.substr(1, 2), 16);
        var g = parseInt(hex.substr(3, 2), 16);
        var b = parseInt(hex.substr(5, 2), 16);
        r = Math.floor(r * (1 - fog) + 60 * fog);
        g = Math.floor(g * (1 - fog) + 30 * fog);
        b = Math.floor(b * (1 - fog) + 50 * fog);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    // === WORLD SPRITES (depth objects) ===
    var worldSprites = [
        {x: 5.5, y: 5.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 10.5, y: 5.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 7.5, y: 10.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 8.0, y: 6.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 5.5, y: 1.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 9.5, y: 11.5, type: 'barrel', w: 0.4, h: 0.5},
        {x: 1.5, y: 1.5, type: 'cactus', w: 0.5, h: 0.9},
        {x: 14.5, y: 1.5, type: 'cactus', w: 0.5, h: 0.9},
        {x: 1.5, y: 14.5, type: 'cactus', w: 0.5, h: 0.9},
        {x: 14.5, y: 14.5, type: 'cactus', w: 0.5, h: 0.9},
        {x: 8.5, y: 1.5, type: 'cactus', w: 0.4, h: 0.8},
        {x: 7.5, y: 14.5, type: 'cactus', w: 0.4, h: 0.8},
        {x: 5.5, y: 2.5, type: 'hitch', w: 0.7, h: 0.5},
        {x: 9.5, y: 4.5, type: 'trough', w: 0.7, h: 0.4},
        {x: 11.5, y: 10.5, type: 'crate', w: 0.4, h: 0.45},
        {x: 12.0, y: 10.8, type: 'crate', w: 0.35, h: 0.4},
        {x: 4.5, y: 11.5, type: 'wheel', w: 0.5, h: 0.6}
    ];
    // === PLAYER ===
    var px = 7.5, py = 5.5, pa = 0;
    var dx, dy, plX, plY;
    var FOV = 0.66;
    var moveSpd = 0.05, rotSpd = 0.03;

    // === FLOOR TEXTURE ===
    var floorImg = new Image();
    var floorPix = null;
    var fTexW = 64, fTexH = 64;
    var floorReady = false;

// === WALL TEXTURES ===
var wallTextures = {};
var wallTextureCanvases = {};
var textureSize = 64;
var texturesLoaded = 0;
var totalTextures = 6;
var textureMap = {
    1: 'wall_border',
    2: 'wall_saloon',
    3: 'wall_store',
    4: 'wall_sheriff',
    5: 'wall_bank',
    6: 'wall_jail'
};

function loadTextures(callback) {
    for (var key in textureMap) {
        (function(k) {
            var img = new Image();
            img.onload = function() {
                var tc = document.createElement('canvas');
                tc.width = textureSize;
                tc.height = textureSize;
                var tctx = tc.getContext('2d');
                tctx.drawImage(img, 0, 0, textureSize, textureSize);
                wallTextureCanvases[k] = tc;
                wallTextures[k] = tctx.getImageData(0, 0, textureSize, textureSize).data;
                texturesLoaded++;
                if (texturesLoaded === totalTextures && callback) callback();
            };
            img.src = 'assets/' + textureMap[k] + '.png';
        })(key);
    }
}
    
    // === Z-BUFFER ===
    var zBuf = [];

    // === INPUT ===
    var keys = {};
    var touchJoy = null;
    var touchLook = null;
    var shooting = false;
    var fireTimer = 0;

    // === WEAPONS ===
    var WEAPONS = {
        revolver: {
            name: 'Revolver',
            damage: 25,
            fireRate: 15,
            spread: 0.5,
            ammo: Infinity,
            maxAmmo: Infinity,
            aoe: false,
            kickback: 4,
            color: '#8B6914'
        },
        shotgun: {
            name: 'Shotgun',
            damage: 40,
            fireRate: 30,
            spread: 1.2,
            ammo: 12,
            maxAmmo: 12,
            aoe: false,
            kickback: 10,
            color: '#5C4033'
        },
        rifle: {
            name: 'Rifle',
            damage: 70,
            fireRate: 40,
            spread: 0.25,
            ammo: 8,
            maxAmmo: 8,
            aoe: false,
            kickback: 7,
            color: '#3B2716'
        },
        dynamite: {
            name: 'Dynamite',
            damage: 50,
            fireRate: 60,
            spread: 0,
            ammo: 3,
            maxAmmo: 3,
            aoe: true,
            aoeRadius: 3,
            kickback: 2,
            color: '#CC0000'
        }
    };

    var weaponKeys = ['revolver', 'shotgun', 'rifle', 'dynamite'];
    var currentWeapon = 0;
    var weaponAmmo = [Infinity, 12, 8, 3];
    var weaponKick = 0; // visual recoil

    // === ENEMY TYPES ===
    var ENEMY_TYPES = {
        bandit: {
            name: 'Bandit', hp: 30, speed: 0.018, damage: 5, score: 100,
            color: '#8B4513', hatColor: '#654321', width: 0.4, height: 0.6
        },
        gunslinger: {
            name: 'Gunslinger', hp: 60, speed: 0.014, damage: 10, score: 200,
            color: '#2F1B14', hatColor: '#1A1A1A', width: 0.5, height: 0.7
        },
        outlaw: {
            name: 'Outlaw Boss', hp: 120, speed: 0.008, damage: 20, score: 500,
            color: '#660000', hatColor: '#330000', width: 0.7, height: 0.9
        },
        dynamite: {
            name: 'Dynamite Runner', hp: 20, speed: 0.03, damage: 40, score: 300,
            color: '#CC5500', hatColor: '#FF6600', width: 0.35, height: 0.5
        }
    };

    // === ENEMIES ===
    var enemies = [];
    var enemiesPerWave = 4;

    // === DAMAGE FLASH ===
    var dmgFlash = 0;

    // === INIT ===
    function init() {
        resize();
        window.addEventListener('resize', resize);

        floorImg.onload = function() {
            var tc = document.createElement('canvas');
            tc.width = fTexW; tc.height = fTexH;
            var tctx = tc.getContext('2d');
            tctx.drawImage(floorImg, 0, 0, fTexW, fTexH);
            floorPix = tctx.getImageData(0, 0, fTexW, fTexH).data;
            floorReady = true;
        };
        floorImg.src = 'assets/floor_sand.png';

        // Keyboard
        document.addEventListener('keydown', function(e) {
            keys[e.key] = true;
            if (e.key === ' ' && state === 'playing') shooting = true;
            // Weapon switching 1-4
            if (e.key >= '1' && e.key <= '4' && state === 'playing') {
                var idx = parseInt(e.key) - 1;
                if (idx !== currentWeapon) {
                    currentWeapon = idx;
                    fireTimer = 10; // brief swap delay
                }
            }
        });
        document.addEventListener('keyup', function(e) {
            keys[e.key] = false;
            if (e.key === ' ') shooting = false;
        });

        // Mouse
        canvas.addEventListener('click', function() {
            if (state === 'playing' && !document.pointerLockElement) {
                canvas.requestPointerLock();
            }
        });
        canvas.addEventListener('mousedown', function() {
            if (state === 'playing' && document.pointerLockElement === canvas) shooting = true;
        });
        canvas.addEventListener('mouseup', function() { shooting = false; });
        document.addEventListener('mousemove', function(e) {
            if (document.pointerLockElement === canvas && state === 'playing') {
                pa += e.movementX * 0.002;
            }
        });

        // Mouse wheel weapon switch
        canvas.addEventListener('wheel', function(e) {
            if (state !== 'playing') return;
            if (e.deltaY > 0) currentWeapon = (currentWeapon + 1) % 4;
            else currentWeapon = (currentWeapon + 3) % 4;
            fireTimer = 10;
            e.preventDefault();
        }, {passive: false});

        // Touch
        canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
        canvas.addEventListener('touchmove', handleTouchMove, {passive: false});
        canvas.addEventListener('touchend', handleTouchEnd, {passive: false});

        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', startGame);

        updateDir();
        loop();
    }

    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W; canvas.height = H;
        zBuf = new Array(W);
    }

    function updateDir() {
        dx = Math.cos(pa); dy = Math.sin(pa);
        plX = -dy * FOV; plY = dx * FOV;
    }

    function startGame() {
        state = 'playing';
        score = 0; wave = 1; health = 100;
        px = 8; py = 8; pa = 0;
        enemies = []; dmgFlash = 0;
        currentWeapon = 0;
        weaponAmmo = [Infinity, 12, 8, 3];
        weaponKick = 0;
        updateDir();
        spawnWave();
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        updateHUD();
    }

    function updateHUD() {
        document.getElementById('health').textContent = health;
        document.getElementById('wave').textContent = wave;
        document.getElementById('score').textContent = score;
        var wep = WEAPONS[weaponKeys[currentWeapon]];
        var ammoText = weaponAmmo[currentWeapon] === Infinity ? '∞' : weaponAmmo[currentWeapon];
        document.getElementById('ammo').textContent = wep.name + ' | ' + ammoText;
    }

    // === TOUCH CONTROLS ===
    function handleTouchStart(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];

            // Check if tapping weapon bar area (bottom center)
            var slotW = 70, slotH = 45, gap = 6;
            var totalW = weaponKeys.length * slotW + (weaponKeys.length - 1) * gap;
            var startX = (W - totalW) / 2;
            var barY = H - 55;

            if (t.clientY >= barY && t.clientY <= barY + slotH) {
                for (var wi = 0; wi < weaponKeys.length; wi++) {
                    var sx = startX + wi * (slotW + gap);
                    if (t.clientX >= sx && t.clientX <= sx + slotW) {
                        if (wi !== currentWeapon) {
                            currentWeapon = wi;
                            fireTimer = 10;
                        }
                        return; // consume this touch
                    }
                }
            }

            // Left third = joystick
            if (t.clientX < W / 3) {
                touchJoy = {startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY, id: t.identifier};
            // Right third = look + swipe weapon switch
            } else if (t.clientX > W * 2 / 3) {
                touchLook = {startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY, id: t.identifier, switched: false};
            // Middle = fire
            } else {
                shooting = true;
            }
        }
    }
   
    function handleTouchMove(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (touchJoy && t.identifier === touchJoy.id) {
                touchJoy.currX = t.clientX; touchJoy.currY = t.clientY;
            }
            if (touchLook && t.identifier === touchLook.id) {
                // Horizontal = look
                var deltaX = t.clientX - touchLook.currX;
                pa += deltaX * 0.004;
                touchLook.currX = t.clientX;
                touchLook.currY = t.clientY;

                // Vertical swipe = weapon switch
                if (!touchLook.switched) {
                    var swipeY = t.clientY - touchLook.startY;
                    if (swipeY < -40) {
                        // Swipe up = next weapon
                        currentWeapon = (currentWeapon + 1) % 4;
                        fireTimer = 10;
                        touchLook.switched = true;
                    } else if (swipeY > 40) {
                        // Swipe down = prev weapon
                        currentWeapon = (currentWeapon + 3) % 4;
                        fireTimer = 10;
                        touchLook.switched = true;
                    }
                }
            }
        }
    }
     // === TOUCH END ===
    function handleTouchEnd(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (touchJoy && t.identifier === touchJoy.id) touchJoy = null;
            if (touchLook && t.identifier === touchLook.id) touchLook = null;
        }
        var midTouch = false;
        for (var j = 0; j < e.touches.length; j++) {
            if (e.touches[j].clientX > W / 3 && e.touches[j].clientX < W * 2 / 3) midTouch = true;
        }
        if (!midTouch) shooting = false;
    }
    // === MOVEMENT ===
    function handleInput() {
        var ms = moveSpd;
        if (keys['w'] || keys['W'] || keys['ArrowUp']) {
            var nx = px + dx * ms, ny = py + dy * ms;
            if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
            if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
        }
        if (keys['s'] || keys['S'] || keys['ArrowDown']) {
            var nx = px - dx * ms, ny = py - dy * ms;
            if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
            if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
        }
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) pa -= rotSpd;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) pa += rotSpd;

        if (touchJoy) {
            var jdx = Math.max(-1, Math.min(1, (touchJoy.currX - touchJoy.startX) / 50));
            var jdy = Math.max(-1, Math.min(1, (touchJoy.currY - touchJoy.startY) / 50));
            if (Math.abs(jdy) > 0.1) {
                var nx = px - dx * jdy * ms, ny = py - dy * jdy * ms;
                if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
                if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
            }
            if (Math.abs(jdx) > 0.1) {
                var sx = -dy, sy = dx;
                var nx = px + sx * jdx * ms, ny = py + sy * jdx * ms;
                if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
                if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
            }
        }
        updateDir();
    }
        // === ENEMY SPAWNING ===
    function spawnWave() {
        var count = enemiesPerWave + Math.floor(wave * 1.5);
        var hpScale = 1 + (wave - 1) * 0.08;

        // Refill ammo each wave
        weaponAmmo[1] = WEAPONS.shotgun.maxAmmo;
        weaponAmmo[2] = WEAPONS.rifle.maxAmmo;
        weaponAmmo[3] = WEAPONS.dynamite.maxAmmo;

        for (var i = 0; i < count; i++) {
            var type;
            var roll = Math.random();
            if (wave < 3) {
                type = roll < 0.7 ? 'bandit' : 'gunslinger';
            } else if (wave < 6) {
                type = roll < 0.5 ? 'bandit' : roll < 0.8 ? 'gunslinger' : roll < 0.95 ? 'dynamite' : 'outlaw';
            } else {
                type = roll < 0.3 ? 'bandit' : roll < 0.55 ? 'gunslinger' : roll < 0.75 ? 'dynamite' : 'outlaw';
            }

            var template = ENEMY_TYPES[type];
            var ex, ey, attempts = 0;
            do {
                ex = 1.5 + Math.random() * (mapW - 3);
                ey = 1.5 + Math.random() * (mapH - 3);
                attempts++;
            } while (
                (map[Math.floor(ey)][Math.floor(ex)] !== 0 ||
                Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py)) < 3) &&
                attempts < 50
            );

            enemies.push({
                x: ex, y: ey, type: type,
                hp: Math.floor(template.hp * hpScale),
                maxHp: Math.floor(template.hp * hpScale),
                speed: template.speed, damage: template.damage, score: template.score,
                color: template.color, hatColor: template.hatColor,
                w: template.width, h: template.height,
                hitTimer: 0, attackTimer: 0
            });
        }
    }

    // === ENEMY AI ===
    function updateEnemies() {
        for (var i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i];
            var edx = px - e.x, edy = py - e.y;
            var dist = Math.sqrt(edx * edx + edy * edy);
            var ndx = dist > 0 ? edx / dist : 0;
            var ndy = dist > 0 ? edy / dist : 0;

            var moveX = ndx, moveY = ndy;
            var speed = e.speed;
            var doMove = dist > 0.6;
            var canAttack = false;
            var attackSpeed = 30;

            if (e.type === 'gunslinger') {
                if (dist < 3.5) {
                    var strafe = ((i % 2) === 0) ? 1 : -1;
                    moveX = -ndy * strafe;
                    moveY = ndx * strafe;
                    doMove = true;
                } else if (dist < 6) {
                    doMove = false;
                }
                if (dist < 7) { canAttack = true; attackSpeed = 25; }

            } else if (e.type === 'outlaw') {
                if (dist < 3) speed = e.speed * 2.5;
                if (dist < 0.8) { canAttack = true; attackSpeed = 25; }

            } else if (e.type === 'dynamite') {
                if (dist < 2.5) {
                    moveX = -ndx; moveY = -ndy; doMove = true;
                } else if (dist < 5) {
                    doMove = false;
                }
                if (dist < 6 && dist > 1.5) { canAttack = true; attackSpeed = 45; }

            } else {
                if (dist < 0.8) { canAttack = true; attackSpeed = 30; }
            }

            if (doMove) {
                var nx = e.x + moveX * speed;
                var ny = e.y + moveY * speed;
                if (map[Math.floor(e.y)][Math.floor(nx)] === 0) e.x = nx;
                if (map[Math.floor(ny)][Math.floor(e.x)] === 0) e.y = ny;
            }

            if (canAttack) {
                e.attackTimer++;
                if (e.attackTimer >= attackSpeed) {
                    health -= e.damage;
                    dmgFlash = 10;
                    e.attackTimer = 0;
                    if (health <= 0) { health = 0; gameOver(); return; }
                }
            } else {
                e.attackTimer = Math.max(0, e.attackTimer - 3);
            }

            if (e.hitTimer > 0) e.hitTimer--;
            if (e.hp <= 0) {
                score += e.score;
                enemies.splice(i, 1);
            }

            if (enemies.length === 0) { wave++; spawnWave(); }
        }
    }
    // === SHOOTING ===
    function handleShooting() {
        if (fireTimer > 0) { fireTimer--; return; }
        if (!shooting) return;

        var wepKey = weaponKeys[currentWeapon];
        var wep = WEAPONS[wepKey];

        // Check ammo
        if (weaponAmmo[currentWeapon] <= 0) {
            // Auto-switch to revolver
            currentWeapon = 0;
            return;
        }

        fireTimer = wep.fireRate;
        if (weaponAmmo[currentWeapon] !== Infinity) weaponAmmo[currentWeapon]--;
        weaponKick = wep.kickback;

        if (wep.aoe) {
            // Dynamite — AOE damage to all enemies within radius
            for (var i = 0; i < enemies.length; i++) {
                var e = enemies[i];
                var edx = e.x - px, edy = e.y - py;
                var dist = Math.sqrt(edx * edx + edy * edy);
                if (dist < wep.aoeRadius) {
                    var falloff = 1 - (dist / wep.aoeRadius);
                    e.hp -= Math.floor(wep.damage * falloff);
                    e.hitTimer = 8;
                }
            }
            dmgFlash = 3; // screen shake effect
        } else {
            // Hitscan — find enemies near crosshair within spread
            var hits = [];
            for (var i = 0; i < enemies.length; i++) {
                var e = enemies[i];
                var edx = e.x - px, edy = e.y - py;
                var invDet = 1.0 / (plX * dy - dx * plY);
                var txf = invDet * (dy * edx - dx * edy);
                var tyf = invDet * (-plY * edx + plX * edy);

                if (tyf <= 0.1) continue;

                var screenX = Math.floor((W / 2) * (1 + txf / tyf));
                var spriteW = Math.floor(Math.abs(H / tyf) * e.w);
                var halfW = spriteW / 2;

                // Spread check — how far from crosshair center
                var distFromCenter = Math.abs(screenX - W / 2);
                var spreadPx = wep.spread * (H / 4);

                if (distFromCenter < halfW + spreadPx) {
                    hits.push({enemy: e, dist: tyf});
                }
            }

            // Sort by distance, hit closest
            hits.sort(function(a, b) { return a.dist - b.dist; });

            if (wepKey === 'shotgun') {
                // Shotgun hits up to 3 closest enemies
                var maxHits = Math.min(3, hits.length);
                for (var h = 0; h < maxHits; h++) {
                    var falloff = 1 - (h * 0.25);
                    hits[h].enemy.hp -= Math.floor(wep.damage * falloff);
                    hits[h].enemy.hitTimer = 6;
                }
            } else {
                // Single target
                if (hits.length > 0) {
                    hits[0].enemy.hp -= wep.damage;
                    hits[0].enemy.hitTimer = 6;
                }
            }
        }
    }

    // === GAME OVER ===
    function gameOver() {
        state = 'gameover';
        document.getElementById('final-wave').textContent = wave;
        document.getElementById('final-score').textContent = score;
        document.getElementById('game-over-screen').style.display = 'flex';
        document.getElementById('hud').style.display = 'none';
    }

        // === RAYCASTING ===
    function castRays() {
        for (var x = 0; x < W; x++) {
            var camX = 2 * x / W - 1;
            var rayDX = dx + plX * camX;
            var rayDY = dy + plY * camX;

            var mapX = Math.floor(px), mapY = Math.floor(py);
            var ddX = Math.abs(1 / rayDX), ddY = Math.abs(1 / rayDY);
            var stepX, stepY, sDistX, sDistY;

            if (rayDX < 0) { stepX = -1; sDistX = (px - mapX) * ddX; }
            else { stepX = 1; sDistX = (mapX + 1 - px) * ddX; }
            if (rayDY < 0) { stepY = -1; sDistY = (py - mapY) * ddY; }
            else { stepY = 1; sDistY = (mapY + 1 - py) * ddY; }

            var hit = 0, side = 0;
            while (!hit) {
                if (sDistX < sDistY) { sDistX += ddX; mapX += stepX; side = 0; }
                else { sDistY += ddY; mapY += stepY; side = 1; }
                if (mapX < 0 || mapX >= mapS || mapY < 0 || mapY >= mapS) { hit = 1; break; }
                if (map[mapY][mapX] > 0) hit = 1;
            }

            var perpDist;
            if (side === 0) perpDist = (mapX - px + (1 - stepX) / 2) / rayDX;
            else perpDist = (mapY - py + (1 - stepY) / 2) / rayDY;
            if (perpDist < 0.01) perpDist = 0.01;
            zBuf[x] = perpDist;

            var lineH = Math.floor(H / perpDist);
            var drawStart = Math.floor(-lineH / 2 + H / 2);
            var drawEnd = Math.floor(lineH / 2 + H / 2);
            var wallType = map[mapY][mapX];

            var texCanvas = wallTextureCanvases[wallType];
            if (texCanvas) {
                var wallX;
                if (side === 0) wallX = py + perpDist * rayDY;
                else wallX = px + perpDist * rayDX;
                wallX -= Math.floor(wallX);

                var texX = Math.floor(wallX * textureSize);
                if (texX >= textureSize) texX = textureSize - 1;

                ctx.drawImage(texCanvas, texX, 0, 1, textureSize, x, drawStart, 1, lineH);

                if (side === 1) {
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(x, Math.max(0, drawStart), 1, Math.min(H, drawEnd) - Math.max(0, drawStart));
                }

                var fogAmount = Math.min(0.6, perpDist / 14);
                if (fogAmount > 0.02) {
                    ctx.fillStyle = 'rgba(26,10,46,' + fogAmount + ')';
                    ctx.fillRect(x, Math.max(0, drawStart), 1, Math.min(H, drawEnd) - Math.max(0, drawStart));
                }
            } else {
                var colors = WALL_COLORS[wallType] || WALL_COLORS[1];
                var wallColor = side === 0 ? colors.light : colors.dark;
                ctx.fillStyle = fogColor(wallColor, Math.min(0.6, perpDist / 14));
                ctx.fillRect(x, Math.max(0, drawStart), 1, Math.min(H, drawEnd) - Math.max(0, drawStart));
            }
        }
    }
        // === SKY GRADIENT ===
    function drawSky() {
        var grad = ctx.createLinearGradient(0, 0, 0, H / 2);
        grad.addColorStop(0, '#1A0A2E');
        grad.addColorStop(0.4, '#4A1942');
        grad.addColorStop(0.7, '#CC5500');
        grad.addColorStop(1, '#D4A017');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H / 2);
    }

    // === FLOOR RAYCASTING ===
    function drawFloor() {
        if (!floorReady) {
            ctx.fillStyle = '#8B7355';
            ctx.fillRect(0, H / 2, W, H / 2);
            return;
        }

        var imgData = ctx.createImageData(W, Math.ceil(H / 2));
        var buf = imgData.data;
        var halfH = Math.floor(H / 2);

        for (var y = halfH; y < H; y++) {
            var rowDist = H / (2.0 * (y - halfH) + 0.01);
            var floorStepX = rowDist * (2 * plX) / W;
            var floorStepY = rowDist * (2 * plY) / W;
            var floorX = px + rowDist * (dx - plX);
            var floorY = py + rowDist * (dy - plY);
            var localY = y - halfH;
            var fog = Math.min(1, rowDist / 12);

            for (var x = 0; x < W; x++) {
                var tx = Math.floor(fTexW * (floorX - Math.floor(floorX))) & (fTexW - 1);
                var ty = Math.floor(fTexH * (floorY - Math.floor(floorY))) & (fTexH - 1);
                var idx = (ty * fTexW + tx) * 4;
                var r = floorPix[idx], g = floorPix[idx + 1], b = floorPix[idx + 2];

                r = Math.floor(r * (1 - fog) + 60 * fog);
                g = Math.floor(g * (1 - fog) + 30 * fog);
                b = Math.floor(b * (1 - fog) + 50 * fog);

                var bIdx = (localY * W + x) * 4;
                buf[bIdx] = r; buf[bIdx + 1] = g; buf[bIdx + 2] = b; buf[bIdx + 3] = 255;
                floorX += floorStepX; floorY += floorStepY;
            }
        }
        ctx.putImageData(imgData, 0, halfH);
    }

    // === RENDER ENEMIES ===
    function renderEnemies() {
        var sorted = enemies.slice().sort(function(a, b) {
            var da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
            var db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
            return db - da;
        });

        for (var i = 0; i < sorted.length; i++) {
            var e = sorted[i];
            var edx = e.x - px, edy = e.y - py;
            var invDet = 1.0 / (plX * dy - dx * plY);
            var txf = invDet * (dy * edx - dx * edy);
            var tyf = invDet * (-plY * edx + plX * edy);
            if (tyf <= 0.1) continue;

            var screenX = Math.floor((W / 2) * (1 + txf / tyf));
            var spriteH = Math.floor(Math.abs(H / tyf) * e.h);
            var spriteW = Math.floor(Math.abs(H / tyf) * e.w);
            var drawStartX = Math.floor(screenX - spriteW / 2);
            var drawEndX = drawStartX + spriteW;
            var drawStartY = Math.floor(H / 2 - spriteH / 2);
            var drawEndY = drawStartY + spriteH;

            for (var sx = Math.max(0, drawStartX); sx < Math.min(W, drawEndX); sx++) {
                if (tyf >= zBuf[sx]) continue;

                var bodyColor = e.hitTimer > 0 ? '#FFFFFF' : e.color;
                var hatCol = e.hitTimer > 0 ? '#FFFFFF' : e.hatColor;

                var bodyTop = drawStartY + Math.floor(spriteH * 0.25);
                ctx.fillStyle = bodyColor;
                ctx.fillRect(sx, Math.max(0, bodyTop), 1, Math.min(H, drawEndY) - Math.max(0, bodyTop));

                var hatTop = drawStartY;
                var hatBot = drawStartY + Math.floor(spriteH * 0.25);
                var hatPad = spriteW * 0.15;
                if (sx >= drawStartX - hatPad && sx <= drawEndX + hatPad) {
                    ctx.fillStyle = hatCol;
                    ctx.fillRect(sx, Math.max(0, hatTop), 1, Math.min(H, hatBot) - Math.max(0, hatTop));
                }

                var beltY = drawStartY + Math.floor(spriteH * 0.55);
                ctx.fillStyle = '#D4A017';
                ctx.fillRect(sx, beltY, 1, Math.max(1, Math.floor(spriteH * 0.03)));
            }

            // Eyes
            var eyeY = drawStartY + Math.floor(spriteH * 0.32);
            var eyeSpacing = Math.floor(spriteW * 0.15);
            var eyeSize = Math.max(1, Math.floor(spriteW * 0.08));
            if (eyeY > 0 && eyeY < H) {
                ctx.fillStyle = e.hitTimer > 0 ? '#FF0000' : '#FF3300';
                ctx.fillRect(screenX - eyeSpacing, eyeY, eyeSize, eyeSize);
                ctx.fillRect(screenX + eyeSpacing - eyeSize, eyeY, eyeSize, eyeSize);
            }

            // HP bar
            if (e.hp < e.maxHp) {
                var barW = spriteW, barH = Math.max(2, Math.floor(spriteH * 0.04));
                var barX = screenX - barW / 2, barY = drawStartY - barH - 4;
                if (barY > 0) {
                    ctx.fillStyle = '#330000';
                    ctx.fillRect(barX, barY, barW, barH);
                    var hpPct = e.hp / e.maxHp;
                    ctx.fillStyle = hpPct > 0.5 ? '#D4A017' : hpPct > 0.25 ? '#CC5500' : '#FF0000';
                    ctx.fillRect(barX, barY, barW * hpPct, barH);
                }
            }
        }
    }
    // === RENDER FLOOR (sand raycasting) ===
    function renderFloor() {
        var halfH = H / 2;
        var rayDirX0 = dx - plX;
        var rayDirY0 = dy - plY;
        var rayDirX1 = dx + plX;
        var rayDirY1 = dy + plY;

        for (var y = Math.ceil(halfH); y < H; y += 2) {
            var rowDist = halfH / (y - halfH);
            var fog = Math.min(0.8, rowDist / 14);

            var floorX = px + rowDist * rayDirX0;
            var floorY = py + rowDist * rayDirY0;
            var stepX = rowDist * (rayDirX1 - rayDirX0) / W * 4;
            var stepY = rowDist * (rayDirY1 - rayDirY0) / W * 4;

            for (var x = 0; x < W; x += 4) {
                var fx = Math.floor(floorX * 64);
                var fy = Math.floor(floorY * 64);
                var hash = ((fx * 374761 + fy * 668265) >> 2) & 7;
                var r = 190 + hash * 3;
                var g = 160 + hash * 2;
                var b = 100 + hash * 2;

                r = Math.floor(r * (1 - fog));
                g = Math.floor(g * (1 - fog));
                b = Math.floor(b * (1 - fog));

                ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                ctx.fillRect(x, y, 4, 2);

                floorX += stepX;
                floorY += stepY;
            }
        }
    }
// === RENDER WORLD SPRITES ===
    function renderWorldSprites() {
        var sorted = worldSprites.slice().sort(function(a, b) {
            var da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
            var db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
            return db - da;
        });

        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            var sdx = s.x - px, sdy = s.y - py;
            var invDet = 1.0 / (plX * dy - dx * plY);
            var txf = invDet * (dy * sdx - dx * sdy);
            var tyf = invDet * (-plY * sdx + plX * sdy);
            if (tyf <= 0.2) continue;

            var screenX = Math.floor((W / 2) * (1 + txf / tyf));
            var unitH = H / tyf;
            var spriteH = Math.floor(unitH * s.h);
            var spriteW = Math.floor(unitH * s.w);

            var baseY = Math.floor(H / 2 + unitH / 2);
            var topY = baseY - spriteH;
            var leftX = Math.floor(screenX - spriteW / 2);

            if (screenX >= 0 && screenX < W && tyf >= zBuf[screenX]) continue;

            var fog = Math.min(0.7, tyf / 15);
            drawWorldSprite(s.type, leftX, topY, spriteW, spriteH, fog);
        }
    }

    function drawWorldSprite(type, x, y, w, h, fog) {
        if (type === 'barrel') {
            ctx.fillStyle = fogColor('#8B6914', fog);
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = fogColor('#555555', fog);
            ctx.fillRect(x, y + h * 0.2, w, Math.max(1, h * 0.06));
            ctx.fillRect(x, y + h * 0.7, w, Math.max(1, h * 0.06));
            ctx.fillStyle = fogColor('#A07B30', fog);
            ctx.fillRect(x + 2, y, w - 4, Math.max(1, h * 0.05));

        } else if (type === 'cactus') {
            var trunkW = w * 0.3;
            var tx = x + w / 2 - trunkW / 2;
            ctx.fillStyle = fogColor('#2D5A1E', fog);
            ctx.fillRect(tx, y, trunkW, h);
            ctx.fillRect(x, y + h * 0.35, w * 0.35, trunkW);
            ctx.fillRect(x, y + h * 0.15, trunkW, h * 0.2 + trunkW);
            ctx.fillRect(x + w * 0.65, y + h * 0.5, w * 0.35, trunkW);
            ctx.fillRect(x + w - trunkW, y + h * 0.3, trunkW, h * 0.2 + trunkW);
            ctx.fillStyle = fogColor('#3D7A2E', fog);
            ctx.fillRect(tx + 1, y, Math.max(1, trunkW * 0.3), h);

        } else if (type === 'hitch') {
            var postW = Math.max(2, w * 0.12);
            ctx.fillStyle = fogColor('#8B7355', fog);
            ctx.fillRect(x + w * 0.15, y, postW, h);
            ctx.fillRect(x + w * 0.75, y, postW, h);
            ctx.fillStyle = fogColor('#A08B60', fog);
            ctx.fillRect(x, y + h * 0.2, w, Math.max(2, h * 0.1));

        } else if (type === 'trough') {
            ctx.fillStyle = fogColor('#6B5335', fog);
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = fogColor('#2244AA', fog);
            ctx.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, h * 0.5);
            ctx.fillStyle = fogColor('#8B7355', fog);
            ctx.fillRect(x, y, w, Math.max(1, h * 0.12));

        } else if (type === 'crate') {
            ctx.fillStyle = fogColor('#A08050', fog);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = fogColor('#6B5335', fog);
            ctx.lineWidth = Math.max(1, w * 0.06);
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
            ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
            ctx.stroke();
            ctx.strokeStyle = fogColor('#5A4030', fog);
            ctx.lineWidth = Math.max(1, w * 0.04);
            ctx.strokeRect(x, y, w, h);

        } else if (type === 'wheel') {
            var cx = x + w / 2, cy = y + h / 2;
            var r = Math.min(w, h) / 2;
            ctx.strokeStyle = fogColor('#8B6914', fog);
            ctx.lineWidth = Math.max(1, r * 0.15);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, r * 0.08);
            for (var s = 0; s < 8; s++) {
                var angle = s * Math.PI / 4;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                ctx.stroke();
            }
            ctx.fillStyle = fogColor('#555555', fog);
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // === RENDER WEAPON (first person) ===
    function drawWeapon() {
        var wepKey = weaponKeys[currentWeapon];
        var wep = WEAPONS[wepKey];

        // Kick animation (recoil)
        if (weaponKick > 0) weaponKick -= 0.8;
        if (weaponKick < 0) weaponKick = 0;

        var baseX = W / 2;
        var baseY = H - 10 + weaponKick;

        ctx.save();

        if (wepKey === 'revolver') {
            // Revolver — small, angled grip + barrel
            var gripW = 18, gripH = 50;
            var barrelW = 8, barrelH = 35;

            // Grip
            ctx.fillStyle = '#5C3A1E';
            ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
            // Grip detail lines
            ctx.fillStyle = '#3E2712';
            ctx.fillRect(baseX - gripW / 2 + 3, baseY - gripH + 8, gripW - 6, 2);
            ctx.fillRect(baseX - gripW / 2 + 3, baseY - gripH + 16, gripW - 6, 2);

            // Barrel
            ctx.fillStyle = '#6B6B6B';
            ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, barrelW, barrelH);
            // Barrel shine
            ctx.fillStyle = '#8A8A8A';
            ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 2, barrelH);

            // Cylinder
            ctx.fillStyle = '#555555';
            ctx.beginPath();
            ctx.arc(baseX, baseY - gripH + 2, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#444444';
            ctx.beginPath();
            ctx.arc(baseX, baseY - gripH + 2, 6, 0, Math.PI * 2);
            ctx.fill();

            // Trigger guard
            ctx.strokeStyle = '#6B6B6B';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(baseX, baseY - gripH + 18, 7, 0, Math.PI);
            ctx.stroke();

        } else if (wepKey === 'shotgun') {
            // Shotgun — wide double barrel
            var gripW = 22, gripH = 60;
            var barrelW = 20, barrelH = 50;

            // Stock
            ctx.fillStyle = '#5C3A1E';
            ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
            ctx.fillStyle = '#3E2712';
            ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 5, gripW - 4, 3);
            ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 14, gripW - 4, 3);

            // Double barrels
            ctx.fillStyle = '#555555';
            ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, 8, barrelH);
            ctx.fillRect(baseX - barrelW / 2 + 12, baseY - gripH - barrelH, 8, barrelH);
            // Barrel shine
            ctx.fillStyle = '#6B6B6B';
            ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 2, barrelH);
            ctx.fillRect(baseX - barrelW / 2 + 13, baseY - gripH - barrelH, 2, barrelH);

            // Fore-end
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(baseX - 12, baseY - gripH - 8, 24, 10);

        } else if (wepKey === 'rifle') {
            // Lever-action rifle — long barrel
            var gripW = 16, gripH = 55;
            var barrelW = 6, barrelH = 65;

            // Stock
            ctx.fillStyle = '#5C3A1E';
            ctx.fillRect(baseX - gripW / 2, baseY - gripH, gripW, gripH);
            ctx.fillStyle = '#3E2712';
            for (var li = 0; li < 4; li++) {
                ctx.fillRect(baseX - gripW / 2 + 2, baseY - gripH + 6 + li * 10, gripW - 4, 2);
            }

            // Long barrel
            ctx.fillStyle = '#4A4A4A';
            ctx.fillRect(baseX - barrelW / 2, baseY - gripH - barrelH, barrelW, barrelH);
            ctx.fillStyle = '#5A5A5A';
            ctx.fillRect(baseX - barrelW / 2 + 1, baseY - gripH - barrelH, 1, barrelH);

            // Lever
            ctx.strokeStyle = '#8B6914';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(baseX - 8, baseY - gripH + 20);
            ctx.quadraticCurveTo(baseX - 14, baseY - gripH + 35, baseX - 6, baseY - gripH + 40);
            ctx.stroke();

            // Scope
            ctx.fillStyle = '#333333';
            ctx.fillRect(baseX - 4, baseY - gripH - barrelH + 10, 8, 6);
            ctx.fillStyle = '#222222';
            ctx.fillRect(baseX - 2, baseY - gripH - barrelH + 5, 4, 20);

        } else if (wepKey === 'dynamite') {
            // Dynamite stick
            var stickW = 14, stickH = 45;

            // Red stick
            ctx.fillStyle = '#CC0000';
            ctx.fillRect(baseX - stickW / 2, baseY - stickH, stickW, stickH);
            // Label band
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(baseX - stickW / 2 - 1, baseY - stickH + 10, stickW + 2, 8);
            ctx.fillStyle = '#AA0000';
            ctx.font = '6px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TNT', baseX, baseY - stickH + 17);

            // Dark end caps
            ctx.fillStyle = '#8B0000';
            ctx.fillRect(baseX - stickW / 2, baseY - stickH, stickW, 4);
            ctx.fillRect(baseX - stickW / 2, baseY - 4, stickW, 4);

            // Fuse
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(baseX, baseY - stickH);
            ctx.quadraticCurveTo(baseX + 8, baseY - stickH - 15, baseX - 2, baseY - stickH - 25);
            ctx.stroke();

            // Fuse spark
            var sparkSize = 3 + Math.random() * 3;
            ctx.fillStyle = '#FF6600';
            ctx.beginPath();
            ctx.arc(baseX - 2, baseY - stickH - 25, sparkSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(baseX - 2, baseY - stickH - 25, sparkSize * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Hand holding it
            ctx.fillStyle = '#C4956A';
            ctx.fillRect(baseX - stickW / 2 - 4, baseY - 20, stickW + 8, 20);
        }

        ctx.restore();
    }

    // === WEAPON SELECTOR UI ===
    function drawWeaponBar() {
        var barY = H - 55;
        var slotW = 70, slotH = 45, gap = 6;
        var totalW = weaponKeys.length * slotW + (weaponKeys.length - 1) * gap;
        var startX = (W - totalW) / 2;

        for (var i = 0; i < weaponKeys.length; i++) {
            var wep = WEAPONS[weaponKeys[i]];
            var sx = startX + i * (slotW + gap);
            var active = i === currentWeapon;

            // Slot background
            ctx.fillStyle = active ? 'rgba(212, 160, 23, 0.4)' : 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(sx, barY, slotW, slotH);

            // Border
            ctx.strokeStyle = active ? '#D4A017' : '#555555';
            ctx.lineWidth = active ? 2 : 1;
            ctx.strokeRect(sx, barY, slotW, slotH);

            // Key number
            ctx.fillStyle = active ? '#D4A017' : '#888888';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('' + (i + 1), sx + 4, barY + 12);

            // Weapon name
            ctx.fillStyle = active ? '#FFFFFF' : '#AAAAAA';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(wep.name, sx + slotW / 2, barY + 25);

            // Ammo count
            var ammoText = weaponAmmo[i] === Infinity ? '∞' : '' + weaponAmmo[i];
            ctx.fillStyle = weaponAmmo[i] <= 0 ? '#FF0000' : active ? '#D4A017' : '#888888';
            ctx.font = '10px monospace';
            ctx.fillText(ammoText, sx + slotW / 2, barY + 38);
        }
    }

    // === DAMAGE FLASH ===
    function drawDamageFlash() {
        if (dmgFlash > 0) {
            ctx.fillStyle = 'rgba(200, 0, 0, ' + (dmgFlash / 15) + ')';
            ctx.fillRect(0, 0, W, H);
            dmgFlash--;
        }
    }

    // === CROSSHAIR ===
    function drawCrosshair() {
        var cx = W / 2, cy = H / 2;
        var wep = WEAPONS[weaponKeys[currentWeapon]];

        // Spread indicator — larger circle for wider spread
        var spreadR = wep.spread * 15;
        ctx.strokeStyle = 'rgba(212, 160, 23, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, spreadR, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair lines
        ctx.strokeStyle = '#D4A017';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#CC5500';
        ctx.fillRect(cx - 1, cy - 1, 3, 3);
    }

    // === MAIN LOOP ===
    function loop() {
        if (state === 'playing') {
            handleInput();
            handleShooting();
            updateEnemies();

            drawSky();
            drawFloor();
            renderFloor();
            castRays();
            renderEnemies();
            renderWorldSprites();
            drawWeapon();
            drawCrosshair();
            drawWeaponBar();
            drawDamageFlash();
            updateHUD();
        }
        requestAnimationFrame(loop);
    }

    // === START ===
    loadTextures(function() {
    init();
});
})();
