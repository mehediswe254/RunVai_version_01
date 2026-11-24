(() => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    const $ = id => document.getElementById(id);

    const heroSprite = new Image();
    heroSprite.src = 'assets/player-hero.png';

    const runSprite = new Image();
    runSprite.src = 'assets/run-cycle.png';

    const screens = [
        'menuScreen',
        'pauseScreen',
        'overScreen',
        'shopScreen',
        'missionsScreen',
        'highScoreScreen'
    ];

    const show = id => {
        screens.forEach(s => {
            $(s).classList.toggle('active', s === id);
        });
    };

    const saved = JSON.parse(
        localStorage.getItem('RunVaiSave') || '{}'
    );

    let wallet = saved.wallet || 0;
    let best = saved.best || 0;
    let lastScore = saved.lastScore || 0;

    let owned = saved.owned || [0];
    let selected = saved.selected || 0;

    let soundOn = saved.soundOn !== false;
    let autoMission = saved.autoMission !== false;

    const heroes = [
        {
            name: 'Neon Runner',
            icon: '🧑‍🚀',
            price: 0,
            color: '#31e7ff'
        },
        {
            name: 'Fire Hero',
            icon: '🦸',
            price: 100,
            color: '#ff664d'
        },
        {
            name: 'Cyber Ninja',
            icon: '🥷',
            price: 250,
            color: '#b18cff'
        },
        {
            name: 'Star Knight',
            icon: '🤖',
            price: 500,
            color: '#ffd76a'
        }
    ];

    let running = false;
    let paused = false;

    let score = 0;
    let runCoins = 0;
    let passed = 0;

    let world = 0;
    let speed = 5;
    let frame = 0;

    let obstacles = [];
    let coins = [];
    let particles = [];

    let player = {
        x: 150,
        y: 390,
        w: 72,
        h: 104,
        vy: 0,
        onGround: true,
        jumpCount: 0,
        sliding: false,
        slideTime: 0
    };

    const ground = 455;

    let missionClaimed = {
        coins: false,
        obstacles: false,
        score: false
    };

    // ================= SAVE & UPDATE =================

    function save() {
        localStorage.setItem(
            'RunVaiSave',
            JSON.stringify({
                wallet,
                best,
                lastScore,
                owned,
                selected,
                soundOn,
                autoMission
            })
        );

        updateStats();
    }

    function updateStats() {
        $('wallet').textContent = wallet;
        $('best').textContent = best;
        $('menuBest').textContent = best;
        $('recordBest').textContent = best;
        $('recordLast').textContent = lastScore;

        $('soundBtn').textContent = soundOn ? '♫' : '♪';

        const toggle = $('autoMissionToggle');

        if (toggle) {
            toggle.checked = autoMission;
        }
    }

    // ================= SOUND =================

    function sound(freq = 440) {
        if (!soundOn) return;

        try {
            const a = new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

            const o = a.createOscillator();
            const g = a.createGain();

            o.frequency.value = freq;

            g.gain.setValueAtTime(
                0.06,
                a.currentTime
            );

            g.gain.exponentialRampToValueAtTime(
                0.001,
                a.currentTime + 0.12
            );

            o.connect(g);
            g.connect(a.destination);

            o.start();
            o.stop(a.currentTime + 0.12);

            o.onended = () => a.close();

        } catch (e) {}
    }

    function resizeCanvas() {
        /* The game world stays at 960x540; CSS fits it to portrait or landscape. */
    }

    async function enterFullscreen() {
        const target = document.querySelector('.game-shell');
        try {
            if (!document.fullscreenElement && target.requestFullscreen) {
                await target.requestFullscreen();
            }
        } catch (error) {
            // Some mobile browsers require fullscreen to be enabled by browser settings.
        }
    }

    function exitFullscreen() {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    // ================= GAME CONTROL =================

    function start() {
        score = 0;
        runCoins = 0;
        passed = 0;

        speed = 5;
        frame = 0;
        world = 0;

        obstacles = [];
        coins = [];
        particles = [];

        missionClaimed = {
            coins: false,
            obstacles: false,
            score: false
        };

        player.y = ground - player.h;
        player.vy = 0;
        player.onGround = true;
        player.jumpCount = 0;
        player.sliding = false;

        running = true;
        paused = false;

        document
            .querySelector('.game-shell')
            .classList.add('playing');

        enterFullscreen();

        show('');

        screens.forEach(s => {
            $(s).classList.remove('active');
        });

        updateHUD();

        requestAnimationFrame(loop);
    }

    function updateHUD() {
        $('score').textContent = Math.floor(score);
        $('runCoins').textContent = runCoins;
    }

    function jump() {
        if (running && !paused && player.jumpCount < 2) {
            player.jumpCount++;

            player.vy = player.jumpCount === 1 ? -14 : -13.5;

            player.onGround = false;
            player.sliding = false;

            sound(player.jumpCount === 1 ? 620 : 820);
        }
    }

    function slide() {
        if (running && !paused && player.onGround) {
            player.sliding = true;
            player.slideTime = 32;

            sound(250);
        }
    }

    // ================= OBJECT GENERATION =================

    function spawn() {
        if (frame % 85 === 0) {
            obstacles.push({
                x: canvas.width + 20,
                w: 34 + Math.random() * 20,
                h: 42 + Math.random() * 25
            });
        }

        if (frame % 48 === 0) {
            let y = ground - 100 - Math.random() * 105;

            for (let i = 0; i < 4; i++) {
                coins.push({
                    x: canvas.width + i * 34,
                    y: y - Math.sin(i / 3 * Math.PI) * 18,
                    r: 11,
                    t: 0
                });
            }
        }
    }

    function burst(x, y) {
        for (let i = 0; i < 8; i++) {
            particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                life: 25
            });
        }
    }

    function collide(a, b) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    // ================= MISSIONS =================

    function missions() {
        const c = Math.min(runCoins, 20);
        const o = Math.min(passed, 10);
        const s = Math.min(Math.floor(score), 500);

        $('mCoins').textContent = c + ' / 20';
        $('mObstacles').textContent = o + ' / 10';
        $('mScore').textContent = s + ' / 500';

        $('barCoins').style.width = c / 20 * 100 + '%';
        $('barObstacles').style.width = o / 10 * 100 + '%';
        $('barScore').style.width = s / 500 * 100 + '%';

        if (autoMission) {
            if (c >= 20 && !missionClaimed.coins) {
                wallet += 50;
                missionClaimed.coins = true;

                sound(800);
            }

            if (o >= 10 && !missionClaimed.obstacles) {
                wallet += 100;
                missionClaimed.obstacles = true;

                sound(800);
            }

            if (s >= 500 && !missionClaimed.score) {
                wallet += 150;
                missionClaimed.score = true;

                sound(800);
            }
        }

        save();
    }

    // ================= GAME OVER =================

    function endGame() {
        running = false;

        document
            .querySelector('.game-shell')
            .classList.remove('playing');

        wallet += runCoins;

        lastScore = Math.floor(score);
        best = Math.max(best, lastScore);

        $('finalScore').textContent = lastScore;
        $('finalCoins').textContent = runCoins;

        save();
        missions();

        show('overScreen');
    }

    // ================= MAIN GAME LOOP =================

    function loop() {
        if (!running || paused) return;

        frame++;

        score += 0.12;

        speed = Math.min(10, 5 + score / 450);
        world = Math.floor(score / 350) % 3;

        spawn();

        // Player movement

        player.vy += 0.65;
        player.y += player.vy;

        if (player.y >= ground - player.h) {
            player.y = ground - player.h;
            player.vy = 0;

            player.onGround = true;
            player.jumpCount = 0;
        }

        if (player.sliding && --player.slideTime <= 0) {
            player.sliding = false;
        }

        const ph = player.sliding ? 34 : player.h;
        const py = player.sliding ? ground - 34 : player.y;

        // Move obstacles and coins

        obstacles.forEach(o => {
            o.x -= speed;
        });

        coins.forEach(c => {
            c.x -= speed;
            c.t++;
        });

        // Remove passed obstacles

        obstacles = obstacles.filter(o => {
            if (o.x + o.w < player.x && !o.counted) {
                o.counted = true;
                passed++;

                missions();
            }

            return o.x + o.w > -10;
        });

        // Collect coins

        coins = coins.filter(c => {
            if (
                Math.hypot(
                    c.x - (player.x + 36),
                    c.y - (py + ph / 2)
                ) < c.r + 30
            ) {
                runCoins++;

                burst(c.x, c.y);
                sound(900);
                missions();

                return false;
            }

            return c.x > -20;
        });

        // Collision detection

        for (const o of obstacles) {
            if (
                collide(
                    {
                        x: player.x + 18,
                        y: py + 12,
                        w: player.sliding ? 52 : 48,
                        h: ph - 18
                    },
                    {
                        x: o.x,
                        y: ground - o.h,
                        w: o.w,
                        h: o.h
                    }
                )
            ) {
                endGame();
                return;
            }
        }

        // Particle movement

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
        });

        particles = particles.filter(p => p.life > 0);

        updateHUD();
        draw();

        requestAnimationFrame(loop);
    }

    // ================= DRAW GAME =================

    function draw() {
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background

        const sky = ctx.createLinearGradient(0, 0, 0, h);

        sky.addColorStop(
            0,
            ['#11183e', '#102c2c', '#34233b'][world]
        );

        sky.addColorStop(1, '#090d24');

        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Buildings

        ctx.fillStyle = '#171f4a';

        for (let i = 0; i < 15; i++) {
            let x = i * 82 - (frame * 1.2) % 82;
            let bh = 100 + (i * 47 % 170);

            ctx.fillRect(x, ground - bh, 55, bh);

            ctx.fillStyle = '#2b4d82';

            for (
                let y = ground - bh + 14;
                y < ground - 10;
                y += 25
            ) {
                for (let xx = x + 10; xx < x + 48; xx += 20) {
                    ctx.fillRect(xx, y, 7, 9);
                }
            }

            ctx.fillStyle = '#171f4a';
        }

        // Ground

        ctx.fillStyle = '#10183a';
        ctx.fillRect(0, ground, w, h - ground);

        ctx.strokeStyle = '#22dfff';
        ctx.lineWidth = 3;

        ctx.shadowBlur = 15;
        ctx.shadowColor = '#22dfff';

        ctx.beginPath();
        ctx.moveTo(0, ground);
        ctx.lineTo(w, ground);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Ground markings

        for (let i = 0; i < 18; i++) {
            let x = (i * 65 - frame * speed * 1.5) % (w + 65);

            ctx.fillStyle = '#263a70';
            ctx.fillRect(x, ground + 28, 35, 4);
        }

        // Draw coins

        coins.forEach(c => {
            ctx.save();

            ctx.translate(c.x, c.y);
            ctx.rotate(c.t * 0.05);

            ctx.fillStyle = '#ffd85a';
            ctx.shadowColor = '#ffcb35';
            ctx.shadowBlur = 18;

            ctx.beginPath();
            ctx.arc(0, 0, c.r, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;

            ctx.strokeStyle = '#fff2a6';
            ctx.lineWidth = 3;

            ctx.stroke();
            ctx.restore();
        });

        // Draw obstacles

        obstacles.forEach(o => {
            ctx.fillStyle = '#ff416f';
            ctx.shadowColor = '#ff275f';
            ctx.shadowBlur = 18;

            ctx.fillRect(o.x, ground - o.h, o.w, o.h);

            ctx.shadowBlur = 0;

            ctx.fillStyle = '#ff9db8';

            ctx.fillRect(
                o.x + 6,
                ground - o.h + 7,
                o.w - 12,
                5
            );
        });

        // Draw particles

        particles.forEach(p => {
            ctx.fillStyle = '#ffe16b';
            ctx.globalAlpha = p.life / 25;

            ctx.fillRect(p.x, p.y, 5, 5);

            ctx.globalAlpha = 1;
        });

        // Draw player

        const hero = heroes[selected];

        let px = player.x - 18;
        let py = player.sliding ? ground - 62 : player.y - 5;

        if (runSprite.complete && runSprite.naturalWidth) {
            ctx.save();

            const bob = player.onGround && !player.sliding
                ? Math.abs(Math.sin(frame * 0.42)) * 3
                : 0;

            const runFrame = Math.floor(frame / 5) % 8;

            const sourceX = (runFrame % 4) * 384;
            const sourceY = Math.floor(runFrame / 4) * 512;

            ctx.shadowColor = hero.color;

            ctx.shadowBlur = hero.color === '#31e7ff' ? 12 : 7;

            if (player.sliding) {
                ctx.globalAlpha = 0.98;

                ctx.drawImage(
                    heroSprite,
                    px + 15,
                    py + 18,
                    82,
                    58
                );

            } else {
                ctx.drawImage(
                    runSprite,
                    sourceX,
                    sourceY,
                    384,
                    512,
                    px,
                    player.y - 38 + bob,
                    112,
                    142
                );
            }

            ctx.restore();

        } else if (heroSprite.complete && heroSprite.naturalWidth) {
            ctx.drawImage(
                heroSprite,
                px,
                ground - 142,
                112,
                142
            );

        } else {
            ctx.fillStyle = hero.color;

            roundRect(
                player.x,
                player.y,
                player.w,
                player.h,
                12
            );

            ctx.fill();
        }

        // World name

        ctx.fillStyle = '#ffffff22';
        ctx.font = '16px Orbitron';

        ctx.fillText(
            ['NEON CITY', 'GREEN FOREST', 'DESERT WORLD'][world],
            w - 180,
            35
        );
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    }

    // ================= CHARACTER SHOP =================

    function renderShop() {
        const grid = $('shopGrid');

        grid.innerHTML = '';

        heroes.forEach((h, i) => {
            const card = document.createElement('div');

            card.className =
                'character' + (selected === i ? ' selected' : '');

            const isOwned = owned.includes(i);

            card.innerHTML = `
                <span class="avatar">
                    <img
                        src="assets/player-hero.png"
                        alt="Human runner character"
                        style="
                            width:58px;
                            height:64px;
                            object-fit:contain;
                            filter:hue-rotate(${i * 48}deg)
                        "
                    >
                </span>

                <b>${h.name}</b>

                <small>
                    ${isOwned ? 'UNLOCKED' : h.price + ' COINS'}
                </small>

                <button>
                    ${
                        selected === i
                            ? 'SELECTED'
                            : isOwned
                                ? 'SELECT'
                                : 'UNLOCK'
                    }
                </button>
            `;

            card.querySelector('button').onclick = () => {
                if (isOwned) {
                    selected = i;

                    save();
                    renderShop();

                } else if (wallet >= h.price) {
                    wallet -= h.price;

                    owned.push(i);
                    selected = i;

                    save();
                    renderShop();

                } else {
                    card.querySelector('small').textContent =
                        'NOT ENOUGH COINS';
                }
            };

            grid.appendChild(card);
        });
    }

    // ================= BUTTON EVENTS =================

    $('startBtn').onclick = start;
    $('againBtn').onclick = start;

    $('shopBtn').onclick = () => {
        renderShop();
        show('shopScreen');
    };

    $('missionsBtn').onclick = () => {
        missions();
        show('missionsScreen');
    };

    $('highScoreBtn').onclick = () => {
        updateStats();
        show('highScoreScreen');
    };

    $('autoMissionToggle').onchange = e => {
        autoMission = e.target.checked;

        save();

        if (autoMission) {
            missions();
        }
    };

    $('resumeBtn').onclick = () => {
        paused = false;

        show('');

        screens.forEach(s => {
            $(s).classList.remove('active');
        });

        requestAnimationFrame(loop);
    };

    $('pauseBtn').onclick = () => {
        if (running) {
            paused = true;
            show('pauseScreen');
        }
    };

    $('pauseHomeBtn').onclick = $('overHomeBtn').onclick = () => {
        running = false;

        document
            .querySelector('.game-shell')
            .classList.remove('playing');

        exitFullscreen();
        show('menuScreen');
    };

    document.querySelectorAll('[data-home]').forEach(b => {
        b.onclick = () => show('menuScreen');
    });

    // ================= MOBILE CONTROLS =================

    $('jumpBtn').addEventListener('pointerdown', e => {
        e.preventDefault();
        jump();
    });

    $('slideBtn').addEventListener('pointerdown', e => {
        e.preventDefault();
        slide();
    });

    $('soundBtn').onclick = () => {
        soundOn = !soundOn;
        save();
    };

    // ================= KEYBOARD CONTROLS =================

    window.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            jump();
        }

        if (e.code === 'ArrowDown') {
            slide();
        }

        if (e.code === 'Escape' && running && !paused) {
            paused = true;
            show('pauseScreen');
        }
    });

    // ================= TOUCH ANYWHERE CONTROLS =================

    const gameShell = document.querySelector('.game-shell');
    let pointerStart = null;

    gameShell.addEventListener('pointerdown', e => {
        if (!running || paused) return;
        if (e.target.closest('button, input, label, .screen, .touch-controls')) return;
        pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
        if (gameShell.setPointerCapture) {
            try { gameShell.setPointerCapture(e.pointerId); } catch (error) {}
        }
        e.preventDefault();
    });

    gameShell.addEventListener('pointerup', e => {
        if (!pointerStart || pointerStart.id !== e.pointerId) return;
        const dx = e.clientX - pointerStart.x;
        const dy = e.clientY - pointerStart.y;
        pointerStart = null;

        if (!running || paused) return;
        if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
            if (dy < 0) jump();
            else slide();
        } else if (Math.abs(dx) < 35 && Math.abs(dy) < 35) {
            jump();
        }
        e.preventDefault();
    });

    gameShell.addEventListener('pointercancel', () => {
        pointerStart = null;
    });

    $('fullscreenBtn').onclick = async () => {
        if (document.fullscreenElement) {
            exitFullscreen();
        } else {
            await enterFullscreen();
        }
    };

    document.addEventListener('fullscreenchange', () => {
        const btn = $('fullscreenBtn');
        btn.textContent = document.fullscreenElement ? '⛶' : '⛶';
        resizeCanvas();
    });

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 150);
    });

    // ================= INITIALIZATION =================

    updateStats();
    draw();
    missions();

})();