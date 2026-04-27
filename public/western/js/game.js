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
        document.addEventListener('keydown', function(e) { keys[e.key] = true; });
        document.addEventListener('keyup', function(e) { keys[e.key] = false; });

        // Mouse look
        canvas.addEventListener('click', function() {
            if (state === 'playing') canvas.requestPointerLock();
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
        updateDir();
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

            // Wall color — adobe/sandstone
            var shade = side === 1 ? 0.7 : 1.0;
            var r = Math.floor(180 * shade);
            var g = Math.floor(140 * shade);
            var b = Math.floor(90 * shade);

            // Distance fog
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

            // Distance fog factor
            var fog = Math.min(1, rowDist / 12);
            var fogR = 60, fogG = 30, fogB = 50;

            for (var x = 0; x < W; x++) {
                var tx = Math.floor(fTexW * (floorX - Math.floor(floorX))) & (fTexW - 1);
                var ty = Math.floor(fTexH * (floorY - Math.floor(floorY))) & (fTexH - 1);

                var idx = (ty * fTexW + tx) * 4;
                var r = floorPix[idx];
                var g = floorPix[idx + 1];
                var b = floorPix[idx + 2];

                // Apply fog
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

    // === CROSSHAIR ===
    function drawCrosshair() {
        var cx = W / 2, cy = H / 2;
        ctx.strokeStyle = '#D4A017';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
        ctx.stroke();
    }

    // === MAIN LOOP ===
    function loop() {
        if (state === 'playing') {
            handleInput();
            drawSky();
            drawFloor();
            castRays();
            drawCrosshair();
            updateHUD();
        }
        requestAnimationFrame(loop);
    }

    // === START ===
    init();
})();
