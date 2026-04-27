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
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,1],
        [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,0,0,0,0,0,0,0,0,1,0,0,1],
        [1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    var mapW = 16, mapH = 16;

    // === PLAYER ===
    var px = 8, py = 8, pa = 0;
    var dx, dy, plX, plY;
    var FOV = 0.66;
    var moveSpd = 0.05, rotSpd = 0.03;

    // === FLOOR TEXTURE ===
    var floorImg = new Image();
    var floorPix = null;
    var fTexW = 64, fTexH = 64;
    var floorReady = false;

    // === Z-BUFFER ===
    var zBuf = [];

    // === INPUT ===
    var keys = {};
    var touchJoy = null;
    var touchLook = null;
    var shooting = false;
    var fireTimer = 0;
    var fireRate = 15; // frames between shots

    // === ENEMY TYPES ===
    var ENEMY_TYPES = {
        bandit: {
            name: 'Bandit',
            hp: 30,
            speed: 0.018,
            damage: 5,
            score: 100,
            color: '#8B4513',    // brown
            hatColor: '#654321', // dark brown hat
            width: 0.4,
            height: 0.6
        },
        gunslinger: {
            name: 'Gunslinger',
            hp: 60,
            speed: 0.014,
            damage: 10,
            score: 200,
            color: '#2F1B14',    // dark leather
            hatColor: '#1A1A1A', // black hat
            width: 0.5,
            height: 0.7
        },
        outlaw: {
            name: 'Outlaw Boss',
            hp: 120,
            speed: 0.008,
            damage: 20,
            score: 500,
            color: '#660000',    // blood red
            hatColor: '#330000', // dark red hat
            width: 0.7,
            height: 0.9
        },
        dynamite: {
            name: 'Dynamite Runner',
            hp: 20,
            speed: 0.03,
            damage: 40,
            score: 300,
            color: '#CC5500',    // burnt orange
            hatColor: '#FF6600', // bright orange
            width: 0.35,
            height: 0.5
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

        // Load floor texture
        floorImg.onload = function() {
            var tc = document.createElement('canvas');
            tc.width = fTexW;
            tc.height = fTexH;
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
        });
        document.addEventListener('keyup', function(e) {
            keys[e.key] = false;
            if (e.key === ' ') shooting = false;
        });

        // Mouse
        canvas.addEventListener('click', function() {
            if (state === 'playing') {
                if (!document.pointerLockElement) {
                    canvas.requestPointerLock();
                }
            }
        });
        canvas.addEventListener('mousedown', function(e) {
            if (state === 'playing' && document.pointerLockElement === canvas) {
                shooting = true;
            }
        });
        canvas.addEventListener('mouseup', function() {
            shooting = false;
        });
        document.addEventListener('mousemove', function(e) {
            if (document.pointerLockElement === canvas && state === 'playing') {
                pa += e.movementX * 0.002;
            }
        });

        // Touch
        canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
        canvas.addEventListener('touchmove', handleTouchMove, {passive: false});
        canvas.addEventListener('touchend', handleTouchEnd, {passive: false});

        // Buttons
        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', startGame);

        updateDir();
        loop();
    }

    function resize() {
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W;
        canvas.height = H;
        zBuf = new Array(W);
    }

    function updateDir() {
        dx = Math.cos(pa);
        dy = Math.sin(pa);
        plX = -dy * FOV;
        plY = dx * FOV;
    }

    function startGame() {
        state = 'playing';
        score = 0;
        wave = 1;
        health = 100;
        px = 8; py = 8; pa = 0;
        enemies = [];
        dmgFlash = 0;
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
    }

    // === TOUCH CONTROLS ===
    function handleTouchStart(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (t.clientX < W / 3) {
                touchJoy = {startX: t.clientX, startY: t.clientY, currX: t.clientX, currY: t.clientY, id: t.identifier};
            } else if (t.clientX > W * 2 / 3) {
                touchLook = {startX: t.clientX, currX: t.clientX, id: t.identifier};
            } else {
                // Middle of screen = fire
                shooting = true;
            }
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (touchJoy && t.identifier === touchJoy.id) {
                touchJoy.currX = t.clientX;
                touchJoy.currY = t.clientY;
            }
            if (touchLook && t.identifier === touchLook.id) {
                var deltaX = t.clientX - touchLook.currX;
                pa += deltaX * 0.004;
                touchLook.currX = t.clientX;
            }
        }
    }

    function handleTouchEnd(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var t = e.changedTouches[i];
            if (touchJoy && t.identifier === touchJoy.id) touchJoy = null;
            if (touchLook && t.identifier === touchLook.id) touchLook = null;
        }
        // Stop firing if no middle touches active
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
            var nx = px + dx * ms;
            var ny = py + dy * ms;
            if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
            if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
        }
        if (keys['s'] || keys['S'] || keys['ArrowDown']) {
            var nx = px - dx * ms;
            var ny = py - dy * ms;
            if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
            if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
        }
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) pa -= rotSpd;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) pa += rotSpd;

        // Touch joystick
        if (touchJoy) {
            var jdx = Math.max(-1, Math.min(1, (touchJoy.currX - touchJoy.startX) / 50));
            var jdy = Math.max(-1, Math.min(1, (touchJoy.currY - touchJoy.startY) / 50));
            if (Math.abs(jdy) > 0.1) {
                var nx = px - dx * jdy * ms;
                var ny = py - dy * jdy * ms;
                if (map[Math.floor(py)][Math.floor(nx)] === 0) px = nx;
                if (map[Math.floor(ny)][Math.floor(px)] === 0) py = ny;
            }
            if (Math.abs(jdx) > 0.1) {
                var sx = -dy, sy = dx;
                var nx = px + sx * jdx * ms;
                var ny = py + sy * jdx * ms;
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

        for (var i = 0; i < count; i++) {
            // Pick type based on wave
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

            // Find open spawn position away from player
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
                x: ex,
                y: ey,
                type: type,
                hp: Math.floor(template.hp * hpScale),
                maxHp: Math.floor(template.hp * hpScale),
                speed: template.speed,
                damage: template.damage,
                score: template.score,
                color: template.color,
                hatColor: template.hatColor,
                w: template.width,
                h: template.height,
                hitTimer: 0,
                attackTimer: 0
            });
        }
    }

    // === ENEMY AI ===
    function updateEnemies() {
        for (var i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i];

            // Move toward player
            var edx = px - e.x;
            var edy = py - e.y;
            var dist = Math.sqrt(edx * edx + edy * edy);

            if (dist > 0.6) {
                var nx = e.x + (edx / dist) * e.speed;
                var ny = e.y + (edy / dist) * e.speed;

                // Wall collision
                if (map[Math.floor(e.y)][Math.floor(nx)] === 0) e.x = nx;
                if (map[Math.floor(ny)][Math.floor(e.x)] === 0) e.y = ny;
            }

            // Attack player when close
            if (dist < 0.8) {
                e.attackTimer++;
                if (e.attackTimer >= 30) {
                    health -= e.damage;
                    dmgFlash = 10;
                    e.attackTimer = 0;
                    if (health <= 0) {
                        health = 0;
                        gameOver();
                        return;
                    }
                }
            } else {
                e.attackTimer = Math.max(0, e.attackTimer - 1);
            }

            // Hit flash decay
            if (e.hitTimer > 0) e.hitTimer--;

            // Remove dead enemies
            if (e.hp <= 0) {
                score += e.score;
                enemies.splice(i, 1);
            }
        }

        // Next wave check
        if (enemies.length === 0) {
            wave++;
            spawnWave();
        }
    }

    // === SHOOTING ===
    function handleShooting() {
        if (fireTimer > 0) { fireTimer--; return; }
        if (!shooting) return;

        fireTimer = fireRate;

        // Check hit — find closest enemy near crosshair
        var bestDist = 999;
        var bestEnemy = null;

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            var edx = e.x - px;
            var edy = e.y - py;
            var dist = Math.sqrt(edx * edx + edy * edy);

            // Transform to camera space
            var invDet = 1.0 / (plX * dy - dx * plY);
            var txf = invDet * (dy * edx - dx * edy);
            var tyf = invDet * (-plY * edx + plX * edy);

            if (tyf <= 0.1) continue; // behind camera

            var screenX = Math.floor((W / 2) * (1 + txf / tyf));
            var spriteH = Math.floor(Math.abs(H / tyf) * e.h);
            var spriteW = Math.floor(Math.abs(H / tyf) * e.w);

            // Check if crosshair (center screen) hits this sprite
            var halfW = spriteW / 2;
            if (Math.abs(screenX - W / 2) < halfW && tyf < bestDist) {
                bestDist = tyf;
                bestEnemy = e;
            }
        }

        if (bestEnemy) {
            bestEnemy.hp -= 25;
            bestEnemy.hitTimer = 6;
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

            var mapX = Math.floor(px);
            var mapY = Math.floor(py);

            var ddX = Math.abs(1 / rayDX);
            var ddY = Math.abs(1 / rayDY);

            var stepX, stepY, sDistX, sDistY;

            if (rayDX < 0) { stepX = -1; sDistX = (px - mapX) * ddX; }
            else { stepX = 1; sDistX = (mapX + 1 - px) * ddX; }
            if (rayDY < 0) { stepY = -1; sDistY = (py - mapY) * ddY; }
            else { stepY = 1; sDistY = (mapY + 1 - py) * ddY; }

            var hit = 0, side = 0;
            while (!hit) {
                if (sDistX < sDistY) { sDistX += ddX; mapX += stepX; side = 0; }
                else { sDistY += ddY; mapY += stepY; side = 1; }
                if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) { hit = 1; break; }
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

            var shade = side === 1 ? 0.7 : 1.0;
            var r = Math.floor(180 * shade);
            var g = Math.floor(140 * shade);
            var b = Math.floor(90 * shade);

            var fog = Math.min(1, perpDist / 12);
            var fogR = 60, fogG = 30, fogB = 50;
            r = Math.floor(r * (1 - fog) + fogR * fog);
            g = Math.floor(g * (1 - fog) + fogG * fog);
            b = Math.floor(b * (1 - fog) + fogB * fog);

            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.fillRect(x, Math.max(0, drawStart), 1, Math.min(H, drawEnd) - Math.max(0, drawStart));
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
            var fogR = 60, fogG = 30, fogB = 50;

            for (var x = 0; x < W; x++) {
                var tx = Math.floor(fTexW * (floorX - Math.floor(floorX))) & (fTexW - 1);
                var ty = Math.floor(fTexH * (floorY - Math.floor(floorY))) & (fTexH - 1);

                var idx = (ty * fTexW + tx) * 4;
                var r = floorPix[idx];
                var g = floorPix[idx + 1];
                var b = floorPix[idx + 2];

                r = Math.floor(r * (1 - fog) + fogR * fog);
                g = Math.floor(g * (1 - fog) + fogG * fog);
                b = Math.floor(b * (1 - fog) + fogB * fog);

                var bIdx = (localY * W + x) * 4;
                buf[bIdx] = r;
                buf[bIdx + 1] = g;
                buf[bIdx + 2] = b;
                buf[bIdx + 3] = 255;

                floorX += floorStepX;
                floorY += floorStepY;
            }
        }

        ctx.putImageData(imgData, 0, halfH);
    }

    // === RENDER ENEMIES ===
    function renderEnemies() {
        // Sort back to front
        var sorted = enemies.slice().sort(function(a, b) {
            var da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
            var db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
            return db - da;
        });

        for (var i = 0; i < sorted.length; i++) {
            var e = sorted[i];

            // Transform to camera space
            var edx = e.x - px;
            var edy = e.y - py;
            var invDet = 1.0 / (plX * dy - dx * plY);
            var txf = invDet * (dy * edx - dx * edy);
            var tyf = invDet * (-plY * edx + plX * edy);

            if (tyf <= 0.1) continue; // behind camera

            var screenX = Math.floor((W / 2) * (1 + txf / tyf));
            var spriteH = Math.floor(Math.abs(H / tyf) * e.h);
            var spriteW = Math.floor(Math.abs(H / tyf) * e.w);

            var drawStartX = Math.floor(screenX - spriteW / 2);
            var drawEndX = drawStartX + spriteW;
            var drawStartY = Math.floor(H / 2 - spriteH / 2);
            var drawEndY = drawStartY + spriteH;

            // Z-buffer clipping (per-stripe)
            for (var sx = Math.max(0, drawStartX); sx < Math.min(W, drawEndX); sx++) {
                if (tyf >= zBuf[sx]) continue; // behind wall

                // Hit flash — white on hit, else normal color
                var bodyColor = e.hitTimer > 0 ? '#FFFFFF' : e.color;
                var hatCol = e.hitTimer > 0 ? '#FFFFFF' : e.hatColor;

                // Body (lower 70%)
                var bodyTop = drawStartY + Math.floor(spriteH * 0.25);
                var bodyBot = drawEndY;
                ctx.fillStyle = bodyColor;
                ctx.fillRect(sx, Math.max(0, bodyTop), 1, Math.min(H, bodyBot) - Math.max(0, bodyTop));

                // Hat (top 25%)
                var hatTop = drawStartY;
                var hatBot = drawStartY + Math.floor(spriteH * 0.25);
                // Hat is slightly wider
                var hatPad = spriteW * 0.15;
                if (sx >= drawStartX - hatPad && sx <= drawEndX + hatPad) {
                    ctx.fillStyle = hatCol;
                    ctx.fillRect(sx, Math.max(0, hatTop), 1, Math.min(H, hatBot) - Math.max(0, hatTop));
                }

                // Belt line
                var beltY = drawStartY + Math.floor(spriteH * 0.55);
                ctx.fillStyle = '#D4A017';
                ctx.fillRect(sx, beltY, 1, Math.max(1, Math.floor(spriteH * 0.03)));
            }

            // Eyes (two dots)
            var eyeY = drawStartY + Math.floor(spriteH * 0.32);
            var eyeSpacing = Math.floor(spriteW * 0.15);
            var eyeSize = Math.max(1, Math.floor(spriteW * 0.08));
            if (eyeY > 0 && eyeY < H) {
                ctx.fillStyle = e.hitTimer > 0 ? '#FF0000' : '#FF3300';
                ctx.fillRect(screenX - eyeSpacing, eyeY, eyeSize, eyeSize);
                ctx.fillRect(screenX + eyeSpacing - eyeSize, eyeY, eyeSize, eyeSize);
            }

            // HP bar (above head)
            if (e.hp < e.maxHp) {
                var barW = spriteW;
                var barH = Math.max(2, Math.floor(spriteH * 0.04));
                var barX = screenX - barW / 2;
                var barY = drawStartY - barH - 4;

                if (barY > 0) {
                    // Background
                    ctx.fillStyle = '#330000';
                    ctx.fillRect(barX, barY, barW, barH);
                    // Health
                    var hpPct = e.hp / e.maxHp;
                    ctx.fillStyle = hpPct > 0.5 ? '#D4A017' : hpPct > 0.25 ? '#CC5500' : '#FF0000';
                    ctx.fillRect(barX, barY, barW * hpPct, barH);
                }
            }
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
        ctx.strokeStyle = '#D4A017';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
        ctx.stroke();

        // Dot center
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
            castRays();
            renderEnemies();
            drawCrosshair();
            drawDamageFlash();
            updateHUD();
        }
        requestAnimationFrame(loop);
    }

    // === START ===
    init();
})();
