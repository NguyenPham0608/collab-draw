// ============================================
// CONFIGURATION
// ============================================
const WS_URL = 'wss://collab-draw-backend-86k5.onrender.com';

// Helper for safe WebSocket sends
function safeSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        return true;
    }
    return false;
}

// ============================================
// GAME CONSTANTS
// ============================================
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 650;
const DEFENSE_PHASE_DURATION = 15;
const ATTACK_PHASE_DURATION = 30;
const STUN_DURATION = 2000;
const INK_MAX = 100;
const INK_DRAIN_RATE = 15; // per second while drawing
const INK_REGEN_RATE = 20; // per second while not drawing
const FADING_INK_COST_MULTIPLIER = 0.5;
const FADING_INK_DURATION = 8000; // 8 seconds
const LINE_WIDTH = 8;
const TARGET_RADIUS = 40;
const PROTECTED_ZONE_RADIUS = 120;
const SPAWN_ZONE_RADIUS = 60;
const POINTS_TARGET_REACHED = 100;
const POINTS_PER_DISTANCE = 0.5;
const EXPLOSION_RADIUS = 25; // How much of defender line gets destroyed on collision

// Coin & Powerup Constants
const COIN_RADIUS = 18;
const COIN_COLLECT_DISTANCE = 25;

// Powerup definitions (will be received from server too)
let POWERUPS = {
    quickRecovery: { cost: 3, name: 'Quick Recovery', desc: 'Stun time reduced to 1s' },
    extraInk: { cost: 4, name: 'Extra Ink', desc: '+50% ink capacity' },
    biggerBlast: { cost: 5, name: 'Bigger Blast', desc: '+50% explosion radius' },
    speedDraw: { cost: 3, name: 'Speed Draw', desc: 'Ink drains 30% slower' }
};

// ============================================
// DOM ELEMENTS
// ============================================
const menuScreen = document.getElementById('menuScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const usernameInput = document.getElementById('usernameInput');
const findMatchBtn = document.getElementById('findMatchBtn');
const leaveLobbyBtn = document.getElementById('leaveLobbyBtn');
const lobbyStatusText = document.getElementById('lobbyStatusText');
const lobbyPlayerCount = document.getElementById('lobbyPlayerCount');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const phaseIndicator = document.getElementById('phaseIndicator');
const timer = document.getElementById('timer');
const roundNum = document.getElementById('roundNum');
const redScore = document.getElementById('redScore');
const blueScore = document.getElementById('blueScore');
const roleBadge = document.getElementById('roleBadge');
const stunOverlay = document.getElementById('stunOverlay');
const inkFill = document.getElementById('inkFill');
const playerTeam = document.getElementById('playerTeam');
const playerName = document.getElementById('playerName');
const teammate = document.getElementById('teammate');
const permanentInkBtn = document.getElementById('permanentInkBtn');
const fadingInkBtn = document.getElementById('fadingInkBtn');

const transitionOverlay = document.getElementById('transitionOverlay');
const transitionTitle = document.getElementById('transitionTitle');
const transitionSubtitle = document.getElementById('transitionSubtitle');
const transitionCountdown = document.getElementById('transitionCountdown');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverTitle = document.getElementById('gameOverTitle');
const finalRedScore = document.getElementById('finalRedScore');
const finalBlueScore = document.getElementById('finalBlueScore');
const playAgainBtn = document.getElementById('playAgainBtn');

// Coin & Shop elements
const coinCounter = document.getElementById('coinCounter');
const coinCount = document.getElementById('coinCount');
const shopBtn = document.getElementById('shopBtn');
const shopOverlay = document.getElementById('shopOverlay');
const shopContent = document.getElementById('shopContent');
const closeShopBtn = document.getElementById('closeShopBtn');
const activePowerupsList = document.getElementById('activePowerupsList');

// ============================================
// GAME STATE
// ============================================
let ws = null;
let myId = null;
let myUsername = '';
let myTeam = null; // 'red' or 'blue'
let lobbyPlayers = []; // Players currently in the lobby
let gameState = {
    phase: 'waiting', // waiting, defense, attack, transition, gameover
    round: 1,
    attackingTeam: 'red',
    defendingTeam: 'blue',
    timeRemaining: 0,
    scores: { red: 0, blue: 0 },
    players: {}
};

// Drawing state
let isDrawing = false;
let currentPath = [];
let ink = INK_MAX;
let inkType = 'permanent'; // or 'fading'
let isStunned = false;
let stunTimeout = null;

// Lines storage
let permanentLines = []; // { team, points, color }
let fadingLines = []; // { team, points, color, createdAt }
let attackerPaths = {}; // { odeli: { points, maxDistance } }
let remoteDrawingPaths = {}; // Track other players' current drawing in progress
let explosionEffects = []; // Visual explosion effects

// Coin & Powerup state
let coins = [];
let teamCoins = 0;
let activePowerups = [];
let coinCollectEffects = []; // Visual effects when collecting coins

// Spawn points (will be set based on team)
let mySpawnPoint = null;
let targetPoint = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };

// ============================================
// INITIALIZATION
// ============================================
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

usernameInput.focus();

// ============================================
// EVENT LISTENERS
// ============================================
findMatchBtn.addEventListener('click', findMatch);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') findMatch();
});

leaveLobbyBtn.addEventListener('click', leaveLobby);

playAgainBtn.addEventListener('click', () => {
    location.reload();
});

permanentInkBtn.addEventListener('click', () => {
    inkType = 'permanent';
    permanentInkBtn.classList.add('active');
    fadingInkBtn.classList.remove('active');
});

fadingInkBtn.addEventListener('click', () => {
    inkType = 'fading';
    fadingInkBtn.classList.add('active');
    permanentInkBtn.classList.remove('active');
});

// Canvas drawing events
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e);
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
});
canvas.addEventListener('touchend', stopDrawing);

// Shop events
shopBtn.addEventListener('click', openShop);
closeShopBtn.addEventListener('click', closeShop);
shopOverlay.addEventListener('click', (e) => {
    if (e.target === shopOverlay) closeShop();
});

// ============================================
// MATCHMAKING
// ============================================
function findMatch() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameInput.focus();
        return;
    }

    myUsername = name;

    // Switch to lobby screen
    menuScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    // Initialize lobby with self
    lobbyPlayers = [{ username: myUsername, isMe: true }];
    updateLobbyUI();

    connectWebSocket();
}

function leaveLobby() {
    if (ws) {
        ws.close();
        ws = null;
    }
    lobbyPlayers = [];
    lobbyScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    usernameInput.focus();
}

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        lobbyStatusText.textContent = 'Connected! Waiting for players...';
        ws.send(JSON.stringify({
            type: 'join_queue',
            username: myUsername
        }));
    };

    ws.onclose = () => {
        lobbyStatusText.textContent = 'Disconnected. Reconnecting...';
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
        lobbyStatusText.textContent = 'Connection error. Retrying...';
    };

    ws.onmessage = handleMessage;
}

// ============================================
// LOBBY UI UPDATES
// ============================================
function updateLobbyUI() {
    const count = lobbyPlayers.length;
    lobbyPlayerCount.textContent = count;

    // Update status text
    if (count === 4) {
        lobbyStatusText.textContent = 'Match found! Starting game...';
    } else {
        lobbyStatusText.textContent = `Waiting for ${4 - count} more player${4 - count === 1 ? '' : 's'}...`;
    }

    // Update player slots
    // For now, we'll assign players to slots in order
    // In a real scenario, server would tell us team assignments
    const slots = [
        { id: 'slot-red-0', team: 'red', index: 0 },
        { id: 'slot-red-1', team: 'red', index: 1 },
        { id: 'slot-blue-0', team: 'blue', index: 0 },
        { id: 'slot-blue-1', team: 'blue', index: 1 }
    ];

    // Reset all slots first
    slots.forEach((slot, i) => {
        const el = document.getElementById(slot.id);
        if (!el) return;

        const player = lobbyPlayers[i];

        if (player) {
            el.classList.add('filled');
            el.classList.toggle('you', player.isMe);

            const avatar = el.querySelector('.slot-avatar');
            const name = el.querySelector('.slot-name');
            const status = el.querySelector('.slot-status');

            avatar.textContent = player.username[0].toUpperCase();
            avatar.classList.remove('empty');
            name.textContent = player.username;
            status.textContent = player.isMe ? 'You' : 'Ready';
        } else {
            el.classList.remove('filled', 'you');

            const avatar = el.querySelector('.slot-avatar');
            const name = el.querySelector('.slot-name');
            const status = el.querySelector('.slot-status');

            avatar.textContent = '?';
            avatar.classList.add('empty');
            name.textContent = 'Waiting...';
            status.textContent = 'Empty slot';
        }
    });
}

// ============================================
// MESSAGE HANDLING
// ============================================
function handleMessage(event) {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
        case 'queue_update':
            handleQueueUpdate(msg);
            break;

        case 'game_start':
            startGame(msg);
            break;

        case 'phase_change':
            handlePhaseChange(msg);
            break;

        case 'draw_line':
            handleRemoteDraw(msg);
            break;

        case 'line_complete':
            handleRemoteLineComplete(msg);
            break;

        case 'player_stunned':
            handlePlayerStunned(msg);
            break;

        case 'explosion':
            handleRemoteExplosion(msg);
            break;

        case 'attacker_reset':
            handleRemoteAttackerReset(msg);
            break;

        case 'score_update':
            updateScores(msg.scores);
            break;

        case 'game_over':
            handleGameOver(msg);
            break;

        case 'target_reached':
            handleTargetReachedVisual(msg);
            break;

        case 'timer_sync':
            gameState.timeRemaining = msg.time;
            updateTimerDisplay();
            break;

        case 'coin_collected':
            handleCoinCollected(msg);
            break;

        case 'powerup_purchased':
            handlePowerupPurchased(msg);
            break;
    }
}

function handleQueueUpdate(msg) {
    // Server tells us how many are in queue
    // We simulate other players joining
    const count = msg.count;

    // Keep our player, add placeholders for others
    lobbyPlayers = [{ username: myUsername, isMe: true }];

    // Add other players (we don't know their names until game starts)
    for (let i = 1; i < count; i++) {
        lobbyPlayers.push({ username: `Player ${i + 1}`, isMe: false });
    }

    updateLobbyUI();
}

// ============================================
// GAME START
// ============================================
function startGame(msg) {
    myId = msg.yourId;
    myTeam = msg.yourTeam;
    gameState.players = msg.players;
    gameState.scores = { red: 0, blue: 0 };

    // Store powerup definitions from server
    if (msg.powerupDefs) {
        POWERUPS = msg.powerupDefs;
    }

    // Set spawn point based on team and player index
    setSpawnPoint(msg.spawnIndex);

    // Update UI - transition from lobby to game
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    playerName.textContent = myUsername;
    playerTeam.textContent = myTeam.toUpperCase() + ' TEAM';
    playerTeam.className = 'player-team ' + myTeam;

    // Update teammate display
    updateTeammateDisplay();

    // Initialize coin UI
    updateCoinUI();

    // Initial render
    render();

    // Start game loop
    requestAnimationFrame(gameLoop);
}

// ============================================
// SHOP FUNCTIONS
// ============================================
function openShop() {
    renderShopContent();
    shopOverlay.classList.remove('hidden');
}

function closeShop() {
    shopOverlay.classList.add('hidden');
}

function renderShopContent() {
    const isAttacking = myTeam === gameState.attackingTeam;

    let html = `<div class="shop-header">
        <h2>⚡ POWER-UPS</h2>
        <div class="shop-coins">🪙 ${teamCoins} coins</div>
    </div>`;

    if (!isAttacking) {
        html += `<div class="shop-notice">Power-ups available when attacking!</div>`;
    }

    html += `<div class="powerup-grid">`;

    for (const [id, powerup] of Object.entries(POWERUPS)) {
        const owned = activePowerups.includes(id);
        const canAfford = teamCoins >= powerup.cost;
        const disabled = owned || !canAfford || !isAttacking;

        html += `
            <div class="powerup-card ${owned ? 'owned' : ''} ${disabled && !owned ? 'disabled' : ''}" 
                 ${!disabled ? `onclick="buyPowerup('${id}')"` : ''}>
                <div class="powerup-name">${powerup.name}</div>
                <div class="powerup-desc">${powerup.desc}</div>
                <div class="powerup-cost">
                    ${owned ? '✓ ACTIVE' : `🪙 ${powerup.cost}`}
                </div>
            </div>
        `;
    }

    html += `</div>`;

    if (activePowerups.length > 0) {
        html += `<div class="active-powerups-section">
            <h3>Active This Round:</h3>
            <div class="active-list">
                ${activePowerups.map(id => `<span class="active-tag">${POWERUPS[id].name}</span>`).join('')}
            </div>
        </div>`;
    }

    shopContent.innerHTML = html;
}

function buyPowerup(powerupId) {
    const powerup = POWERUPS[powerupId];
    if (!powerup) return;
    if (teamCoins < powerup.cost) return;
    if (activePowerups.includes(powerupId)) return;

    safeSend({
        type: 'buy_powerup',
        powerupId
    });
}

function updateCoinUI() {
    coinCount.textContent = teamCoins;

    // Show/hide coin counter based on if we're attacking or about to attack
    const isAttacking = myTeam === gameState.attackingTeam;
    coinCounter.classList.toggle('hidden', !isAttacking && gameState.phase !== 'defense');

    // Update active powerups display
    if (activePowerups.length > 0) {
        activePowerupsList.innerHTML = activePowerups
            .map(id => `<div class="active-powerup-tag">${POWERUPS[id]?.name || id}</div>`)
            .join('');
        activePowerupsList.classList.remove('hidden');
    } else {
        activePowerupsList.classList.add('hidden');
    }
}

function getEffectiveStunDuration() {
    return activePowerups.includes('quickRecovery') ? 1000 : STUN_DURATION;
}

function getEffectiveInkMax() {
    return activePowerups.includes('extraInk') ? INK_MAX * 1.5 : INK_MAX;
}

function getEffectiveExplosionRadius() {
    return activePowerups.includes('biggerBlast') ? EXPLOSION_RADIUS * 1.5 : EXPLOSION_RADIUS;
}

function getEffectiveInkDrainRate() {
    return activePowerups.includes('speedDraw') ? INK_DRAIN_RATE * 0.7 : INK_DRAIN_RATE;
}

function setSpawnPoint(index) {
    // Spawn points at corners/edges
    const spawnPoints = {
        red: [
            { x: 80, y: CANVAS_HEIGHT / 2 - 100 },
            { x: 80, y: CANVAS_HEIGHT / 2 + 100 }
        ],
        blue: [
            { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 - 100 },
            { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 + 100 }
        ]
    };

    mySpawnPoint = spawnPoints[myTeam][index];
}

function updateTeammateDisplay() {
    const teammateData = Object.values(gameState.players).find(p =>
        p.team === myTeam && p.id !== myId
    );

    if (teammateData) {
        teammate.querySelector('.teammate-name').textContent = teammateData.username;
        teammate.querySelector('.teammate-avatar').textContent = teammateData.username[0].toUpperCase();
    }
}

// ============================================
// PHASE HANDLING
// ============================================
function handlePhaseChange(msg) {
    gameState.phase = msg.phase;
    gameState.round = msg.round;
    gameState.attackingTeam = msg.attackingTeam;
    gameState.defendingTeam = msg.defendingTeam;
    gameState.timeRemaining = msg.duration;

    // Clear paths on new round
    if (msg.phase === 'defense') {
        attackerPaths = {};
        remoteDrawingPaths = {};
        permanentLines = [];
        fadingLines = [];
        coins = [];

        // Reset powerups and coins for new round if we're attacking
        if (myTeam === msg.attackingTeam) {
            activePowerups = msg.activePowerups || [];
            teamCoins = msg.teamCoins?.[myTeam] || 0;
        }
    }

    // Clear attack phase specific data and set up coins
    if (msg.phase === 'attack') {
        remoteDrawingPaths = {};
        coins = msg.coins || [];

        // Load active powerups for attacking team
        if (myTeam === msg.attackingTeam) {
            activePowerups = msg.activePowerups || [];
        }
    }

    updateCoinUI();

    // Show transition
    showTransition(msg);
}

function showTransition(msg) {
    const isAttacking = myTeam === msg.attackingTeam;

    transitionTitle.textContent = `ROUND ${msg.round}`;
    transitionSubtitle.textContent = isAttacking ? 'You are ATTACKING' : 'You are DEFENDING';
    transitionSubtitle.className = 'transition-subtitle ' + (isAttacking ? 'attacking' : 'defending');

    transitionOverlay.classList.remove('hidden');

    let countdown = 3;
    transitionCountdown.textContent = countdown;

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            transitionCountdown.textContent = countdown;
        } else {
            clearInterval(countdownInterval);
            transitionOverlay.classList.add('hidden');
            startPhase();
        }
    }, 1000);
}

function startPhase() {
    // Update role badge
    const isAttacking = myTeam === gameState.attackingTeam;
    roleBadge.className = 'role-badge ' + (isAttacking ? 'attacking' : 'defending');
    roleBadge.querySelector('.role-icon').textContent = isAttacking ? '⚔️' : '🛡️';
    roleBadge.querySelector('.role-text').textContent = isAttacking ? 'ATTACKING' : 'DEFENDING';

    phaseIndicator.textContent = gameState.phase.toUpperCase() + ' PHASE';

    // Reset ink
    ink = INK_MAX;
    updateInkDisplay();
}

// ============================================
// DRAWING
// ============================================
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function canDraw() {
    if (isStunned) return false;
    if (ink <= 0) return false;
    if (gameState.phase === 'waiting' || gameState.phase === 'transition' || gameState.phase === 'gameover') return false;

    const isAttacking = myTeam === gameState.attackingTeam;

    // During defense phase, only defenders can draw
    if (gameState.phase === 'defense' && isAttacking) return false;

    // During attack phase, only attackers can draw
    if (gameState.phase === 'attack' && !isAttacking) return false;

    return true;
}

function startDrawing(e) {
    if (!canDraw()) return;

    const pos = getCanvasPos(e);
    const isAttacking = myTeam === gameState.attackingTeam;

    // Attackers must start from their spawn zone
    if (isAttacking && gameState.phase === 'attack') {
        // Check if they have an existing path to continue
        if (attackerPaths[myId] && attackerPaths[myId].points.length > 0) {
            // Must continue from the end of their existing path
            const lastPoint = attackerPaths[myId].points[attackerPaths[myId].points.length - 1];
            const dist = distance(pos, lastPoint);
            if (dist > 30) return; // Too far from path end
        } else {
            // Must start in spawn zone
            const distToSpawn = distance(pos, mySpawnPoint);
            if (distToSpawn > SPAWN_ZONE_RADIUS) return;
        }
    }

    isDrawing = true;
    currentPath = [pos];
}

function draw(e) {
    if (!isDrawing || !canDraw()) {
        if (isDrawing) stopDrawing();
        return;
    }

    const pos = getCanvasPos(e);
    const lastPos = currentPath[currentPath.length - 1];

    // Check collision with enemy lines (for attackers)
    const isAttacking = myTeam === gameState.attackingTeam;
    if (isAttacking && gameState.phase === 'attack') {
        // Check for coin collection
        checkCoinCollection(pos);

        const collisionPoint = checkCollisionWithDefenderLines(pos, lastPos);
        if (collisionPoint) {
            triggerStun(collisionPoint);
            resetAttackerToSpawn(); // Teleport back to spawn
            stopDrawing();
            return;
        }

        // Check if reached target
        const distToTarget = distance(pos, targetPoint);
        if (distToTarget <= TARGET_RADIUS) {
            // Send target reached!
            safeSend({
                type: 'target_reached',
                playerId: myId
            });
            resetAttackerToSpawn(); // Reset after reaching target too
            stopDrawing();
            return;
        }
    }

    currentPath.push(pos);

    // Drain ink (with powerup modifier)
    const baseRate = getEffectiveInkDrainRate();
    const drainRate = inkType === 'fading' ? baseRate * FADING_INK_COST_MULTIPLIER : baseRate;
    ink -= drainRate * (1 / 60); // Assuming ~60fps
    ink = Math.max(0, ink);
    updateInkDisplay();

    if (ink <= 0) {
        stopDrawing();
        return;
    }

    // Send drawing update
    safeSend({
        type: 'draw',
        point: pos,
        inkType: inkType,
        team: myTeam
    });

    render();
}

function checkCoinCollection(pos) {
    for (const coin of coins) {
        if (coin.collected) continue;

        const dist = distance(pos, coin);
        if (dist <= COIN_COLLECT_DISTANCE) {
            // Collect the coin locally first for immediate feedback
            coin.collected = true;

            // Create collection effect
            coinCollectEffects.push({
                x: coin.x,
                y: coin.y,
                startTime: Date.now(),
                duration: 400
            });

            // Send to server
            safeSend({
                type: 'collect_coin',
                coinId: coin.id
            });
        }
    }
}

function stopDrawing() {
    if (!isDrawing) return;

    isDrawing = false;

    if (currentPath.length > 1) {
        const isAttacking = myTeam === gameState.attackingTeam;
        const lineData = {
            team: myTeam,
            points: [...currentPath],
            color: myTeam === 'red' ? '#ff4757' : '#3498db'
        };

        if (isAttacking && gameState.phase === 'attack') {
            // Add to attacker path
            if (!attackerPaths[myId]) {
                attackerPaths[myId] = { points: [], maxDistance: 0 };
            }
            attackerPaths[myId].points.push(...currentPath);

            // Calculate max distance reached
            const maxDist = Math.max(...currentPath.map(p =>
                CANVAS_WIDTH / 2 - distance(p, targetPoint)
            ));
            attackerPaths[myId].maxDistance = Math.max(attackerPaths[myId].maxDistance, maxDist);
        } else {
            // Defender line
            if (inkType === 'fading') {
                fadingLines.push({
                    ...lineData,
                    createdAt: Date.now()
                });
            } else {
                permanentLines.push(lineData);
            }
        }

        // Send line completed
        safeSend({
            type: 'line_complete',
            line: lineData,
            inkType: inkType
        });
    }

    currentPath = [];
}

function checkCollisionWithDefenderLines(pos, lastPos) {
    if (!pos || !lastPos) return null;

    const defenderTeam = gameState.defendingTeam;

    // Check permanent lines
    for (let i = 0; i < permanentLines.length; i++) {
        const line = permanentLines[i];
        if (line && line.team === defenderTeam && line.points && line.points.length >= 2) {
            const collision = findCollisionPoint(lastPos, pos, line.points);
            if (collision) {
                // Explode this part of the line!
                explodeLineAt(permanentLines, i, collision.point);
                return collision.point;
            }
        }
    }

    // Check fading lines (that haven't faded yet)
    const now = Date.now();
    for (let i = 0; i < fadingLines.length; i++) {
        const line = fadingLines[i];
        if (line && line.team === defenderTeam && line.points && line.points.length >= 2) {
            if ((now - line.createdAt) < FADING_INK_DURATION) {
                const collision = findCollisionPoint(lastPos, pos, line.points);
                if (collision) {
                    // Explode this part of the line!
                    explodeLineAt(fadingLines, i, collision.point);
                    return collision.point;
                }
            }
        }
    }

    return null;
}

function findCollisionPoint(p1, p2, pathPoints) {
    if (!pathPoints || pathPoints.length < 2) return null;

    for (let i = 0; i < pathPoints.length - 1; i++) {
        if (pathPoints[i] && pathPoints[i + 1]) {
            const intersection = getLineIntersection(p1, p2, pathPoints[i], pathPoints[i + 1]);
            if (intersection) {
                return { point: intersection, segmentIndex: i };
            }
        }
    }
    return null;
}

function getLineIntersection(p1, p2, p3, p4) {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 0.0001) return null;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return {
            x: p1.x + ua * (p2.x - p1.x),
            y: p1.y + ua * (p2.y - p1.y)
        };
    }
    return null;
}

function explodeLineAt(linesArray, lineIndex, collisionPoint) {
    if (!linesArray || lineIndex < 0 || lineIndex >= linesArray.length) return;

    const line = linesArray[lineIndex];
    if (!line || !line.points) return;

    const points = line.points;
    const explosionRadius = getEffectiveExplosionRadius();

    // Find all points within explosion radius and remove them
    const remainingSegments = [];
    let currentSegment = [];

    for (let i = 0; i < points.length; i++) {
        if (!points[i]) continue;

        const dist = distance(points[i], collisionPoint);

        if (dist > explosionRadius) {
            // This point survives
            currentSegment.push(points[i]);
        } else {
            // This point is destroyed - save current segment if it has enough points
            if (currentSegment.length >= 2) {
                remainingSegments.push([...currentSegment]);
            }
            currentSegment = [];
        }
    }

    // Don't forget the last segment
    if (currentSegment.length >= 2) {
        remainingSegments.push(currentSegment);
    }

    // Remove the original line
    linesArray.splice(lineIndex, 1);

    // Add back the surviving segments as separate lines
    for (const segment of remainingSegments) {
        const newLine = {
            ...line,
            points: segment
        };
        linesArray.push(newLine);
    }

    // Send explosion to server for sync
    safeSend({
        type: 'explosion',
        point: collisionPoint,
        radius: explosionRadius
    });

    // Create visual explosion effect
    createExplosionEffect(collisionPoint, explosionRadius);
}

function createExplosionEffect(point, radius = EXPLOSION_RADIUS) {
    // Add to explosion effects array for rendering
    explosionEffects.push({
        x: point.x,
        y: point.y,
        radius: 0,
        maxRadius: radius,
        startTime: Date.now(),
        duration: 300
    });
}

function lineIntersectsPath(p1, p2, pathPoints) {
    for (let i = 0; i < pathPoints.length - 1; i++) {
        if (linesIntersect(p1, p2, pathPoints[i], pathPoints[i + 1])) {
            return true;
        }
    }
    return false;
}

function linesIntersect(p1, p2, p3, p4) {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denom) < 0.0001) return false;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    // Add some tolerance for line width
    return ua >= -0.1 && ua <= 1.1 && ub >= -0.1 && ub <= 1.1;
}

function triggerStun(collisionPoint) {
    isStunned = true;
    stunOverlay.classList.remove('hidden');

    safeSend({
        type: 'stunned',
        playerId: myId,
        collisionPoint: collisionPoint
    });

    const stunDuration = getEffectiveStunDuration();

    if (stunTimeout) clearTimeout(stunTimeout);
    stunTimeout = setTimeout(() => {
        isStunned = false;
        stunOverlay.classList.add('hidden');
    }, stunDuration);
}

function resetAttackerToSpawn() {
    // Clear this attacker's path - they must start over from spawn
    if (attackerPaths[myId]) {
        attackerPaths[myId] = { points: [], maxDistance: 0 };
    }
    currentPath = [];

    // Notify server to sync with other players
    safeSend({
        type: 'attacker_reset',
        playerId: myId
    });
}

// ============================================
// REMOTE DRAW HANDLING
// ============================================

function handleRemoteDraw(msg) {
    if (msg.playerId === myId) return;

    const isAttacker = msg.team === gameState.attackingTeam;

    // Track the drawing in progress
    if (!remoteDrawingPaths[msg.playerId]) {
        remoteDrawingPaths[msg.playerId] = {
            points: [],
            team: msg.team,
            inkType: msg.inkType
        };
    }
    remoteDrawingPaths[msg.playerId].points.push(msg.point);

    // Also add to attacker paths for persistence
    if (isAttacker && gameState.phase === 'attack') {
        if (!attackerPaths[msg.playerId]) {
            attackerPaths[msg.playerId] = { points: [], maxDistance: 0 };
        }
        attackerPaths[msg.playerId].points.push(msg.point);
    }

    render();
}

function handleRemoteLineComplete(msg) {
    if (msg.playerId === myId) return;

    // Clear the in-progress path
    delete remoteDrawingPaths[msg.playerId];

    // Add completed line to appropriate storage
    const isAttacker = msg.line.team === gameState.attackingTeam;

    if (!isAttacker) {
        // Defender line
        if (msg.inkType === 'fading') {
            fadingLines.push({
                ...msg.line,
                createdAt: Date.now()
            });
        } else {
            permanentLines.push(msg.line);
        }
    }

    render();
}

function handlePlayerStunned(msg) {
    // Show visual feedback when another player gets stunned
    if (msg.playerId !== myId) {
        // Could add floating text or effect at their position
        console.log(`Player ${msg.playerId} was stunned!`);
    }
}

function handleRemoteExplosion(msg) {
    // Another player caused an explosion - update our local lines
    const point = msg.point;
    const radius = msg.radius;

    // Explode permanent lines
    const newPermanent = [];
    for (const line of permanentLines) {
        const segments = splitLineByExplosionLocal(line, point, radius);
        newPermanent.push(...segments);
    }
    permanentLines = newPermanent;

    // Explode fading lines
    const newFading = [];
    for (const line of fadingLines) {
        const segments = splitLineByExplosionLocal(line, point, radius);
        newFading.push(...segments);
    }
    fadingLines = newFading;

    // Show the explosion effect
    createExplosionEffect(point);

    render();
}

function splitLineByExplosionLocal(line, explosionPoint, radius) {
    const points = line.points;
    const remainingSegments = [];
    let currentSegment = [];

    for (let i = 0; i < points.length; i++) {
        const dist = distance(points[i], explosionPoint);

        if (dist > radius) {
            currentSegment.push(points[i]);
        } else {
            if (currentSegment.length >= 2) {
                remainingSegments.push({
                    ...line,
                    points: [...currentSegment]
                });
            }
            currentSegment = [];
        }
    }

    if (currentSegment.length >= 2) {
        remainingSegments.push({
            ...line,
            points: currentSegment
        });
    }

    return remainingSegments;
}

function handleRemoteAttackerReset(msg) {
    // Another attacker was reset to spawn - clear their path
    if (msg.playerId !== myId) {
        if (attackerPaths[msg.playerId]) {
            attackerPaths[msg.playerId] = { points: [], maxDistance: 0 };
        }
        // Also clear their in-progress drawing
        delete remoteDrawingPaths[msg.playerId];
        render();
    }
}

function handleCoinCollected(msg) {
    // Mark coin as collected
    const coin = coins.find(c => c.id === msg.coinId);
    if (coin) {
        coin.collected = true;

        // Add collection effect if not already added locally
        if (msg.playerId !== myId) {
            coinCollectEffects.push({
                x: coin.x,
                y: coin.y,
                startTime: Date.now(),
                duration: 400
            });
        }
    }

    // Update team coins if it's our team
    if (msg.team === myTeam) {
        teamCoins = msg.teamCoins;
        updateCoinUI();
    }

    render();
}

function handlePowerupPurchased(msg) {
    if (msg.team === myTeam) {
        teamCoins = msg.teamCoins;
        activePowerups = msg.activePowerups;
        updateCoinUI();

        // Re-render shop if open
        if (!shopOverlay.classList.contains('hidden')) {
            renderShopContent();
        }

        // Apply ink powerup immediately if just purchased
        if (msg.activePowerups.includes('extraInk')) {
            const maxInk = getEffectiveInkMax();
            ink = Math.min(ink, maxInk); // Cap current ink to new max
        }
    }
}

function handleTargetReachedVisual(msg) {
    // Show celebration effect
    const player = gameState.players[msg.playerId];
    if (player) {
        // Flash the target
        const flashOverlay = document.createElement('div');
        flashOverlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: ${player.team === 'red' ? 'rgba(255,71,87,0.3)' : 'rgba(52,152,219,0.3)'};
            pointer-events: none;
            z-index: 50;
            animation: flashFade 0.5s ease-out forwards;
        `;
        document.body.appendChild(flashOverlay);
        setTimeout(() => flashOverlay.remove(), 500);
    }
}

// ============================================
// SCORING
// ============================================
function updateScores(scores) {
    gameState.scores = scores;
    redScore.textContent = scores.red;
    blueScore.textContent = scores.blue;
}

// ============================================
// GAME OVER
// ============================================
function handleGameOver(msg) {
    gameState.phase = 'gameover';

    finalRedScore.textContent = msg.scores.red;
    finalBlueScore.textContent = msg.scores.blue;

    let result;
    if (msg.scores.red === msg.scores.blue) {
        result = 'draw';
        gameOverTitle.textContent = 'DRAW';
    } else {
        const winningTeam = msg.scores.red > msg.scores.blue ? 'red' : 'blue';
        result = winningTeam === myTeam ? 'victory' : 'defeat';
        gameOverTitle.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
    }

    gameOverTitle.className = 'game-over-title ' + result;
    gameOverOverlay.classList.remove('hidden');
}

// ============================================
// GAME LOOP
// ============================================
let lastTime = 0;

function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Regenerate ink when not drawing
    const maxInk = getEffectiveInkMax();
    if (!isDrawing && ink < maxInk) {
        ink += INK_REGEN_RATE * deltaTime;
        ink = Math.min(maxInk, ink);
        updateInkDisplay();
    }

    // Remove expired fading lines
    const now = Date.now();
    fadingLines = fadingLines.filter(line => (now - line.createdAt) < FADING_INK_DURATION);

    render();

    if (gameState.phase !== 'gameover') {
        requestAnimationFrame(gameLoop);
    }
}

// ============================================
// RENDERING
// ============================================
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    drawGrid();

    // Draw spawn zones (prominent!)
    drawSpawnZones();

    // Draw protected zone
    drawProtectedZone();

    // Draw target
    drawTarget();

    // Draw coins
    drawCoins();

    // Draw connecting lines from spawn to show attack direction
    drawAttackDirectionHints();

    // Draw permanent defender lines
    for (const line of permanentLines) {
        drawLine(line.points, line.color, 1);
    }

    // Draw fading defender lines
    const now = Date.now();
    for (const line of fadingLines) {
        const age = now - line.createdAt;
        const opacity = 1 - (age / FADING_INK_DURATION);
        if (opacity > 0) {
            drawLine(line.points, line.color, opacity);
        }
    }

    // Draw other players' in-progress drawings (REAL-TIME!)
    for (const [playerId, pathData] of Object.entries(remoteDrawingPaths)) {
        if (pathData.points.length > 1) {
            const color = pathData.team === 'red' ? '#ff4757' : '#3498db';
            const opacity = pathData.inkType === 'fading' ? 0.6 : 1;
            drawLine(pathData.points, color, opacity);

            // Draw active drawing indicator
            const lastPoint = pathData.points[pathData.points.length - 1];
            drawActiveDrawingCursor(lastPoint, color);
        }
    }

    // Draw attacker paths (completed)
    for (const [playerId, path] of Object.entries(attackerPaths)) {
        const player = gameState.players[playerId];
        if (player && path.points.length > 1) {
            const color = player.team === 'red' ? '#ff4757' : '#3498db';
            drawLine(path.points, color, 1);

            // Draw path head (current position indicator)
            const lastPoint = path.points[path.points.length - 1];
            if (playerId !== myId || !isDrawing) {
                drawPathHead(lastPoint, color, playerId === myId);
            }
        }
    }

    // Draw current drawing path (my own)
    if (currentPath.length > 1) {
        const color = myTeam === 'red' ? '#ff4757' : '#3498db';
        const opacity = inkType === 'fading' ? 0.6 : 1;
        drawLine(currentPath, color, opacity);

        // Draw my cursor
        const lastPoint = currentPath[currentPath.length - 1];
        drawActiveDrawingCursor(lastPoint, color);
    }

    // Draw "YOUR ZONE" label for attacker
    if (gameState.phase === 'attack' && myTeam === gameState.attackingTeam && mySpawnPoint) {
        drawYourZoneLabel();
    }

    // Draw explosion effects
    drawExplosionEffects();

    // Draw coin collection effects
    drawCoinCollectEffects();
}

function drawExplosionEffects() {
    const now = Date.now();

    // Filter out finished explosions and draw active ones
    explosionEffects = explosionEffects.filter(exp => {
        const elapsed = now - exp.startTime;
        if (elapsed >= exp.duration) return false;

        const progress = elapsed / exp.duration;
        const currentRadius = exp.maxRadius * progress;
        const opacity = 1 - progress;

        // Outer explosion ring
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 50, ${opacity})`;
        ctx.lineWidth = 4 * (1 - progress);
        ctx.stroke();

        // Inner flash
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, currentRadius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 200, ${opacity * 0.5})`;
        ctx.fill();

        // Particles (simple dots)
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const particleRadius = currentRadius * 1.2;
            const px = exp.x + Math.cos(angle) * particleRadius;
            const py = exp.y + Math.sin(angle) * particleRadius;

            ctx.beginPath();
            ctx.arc(px, py, 3 * (1 - progress), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 150, 50, ${opacity})`;
            ctx.fill();
        }

        return true; // Keep this explosion
    });
}

function drawCoins() {
    if (gameState.phase !== 'attack') return;

    const now = Date.now();

    for (const coin of coins) {
        if (coin.collected) continue;

        const pulse = Math.sin(now / 200 + coin.id) * 0.15 + 1;
        const rotation = now / 1000 + coin.id;

        // Outer glow
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15;

        // Coin body
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, COIN_RADIUS * pulse, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
            coin.x - 5, coin.y - 5, 0,
            coin.x, coin.y, COIN_RADIUS
        );
        gradient.addColorStop(0, '#fff7cc');
        gradient.addColorStop(0.5, '#ffd700');
        gradient.addColorStop(1, '#b8860b');
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.shadowBlur = 0;

        // Inner detail
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, COIN_RADIUS * 0.7 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(184, 134, 11, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dollar sign or star
        ctx.fillStyle = '#b8860b';
        ctx.font = `bold ${14 * pulse}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', coin.x, coin.y);
    }
}

function drawCoinCollectEffects() {
    const now = Date.now();

    coinCollectEffects = coinCollectEffects.filter(effect => {
        const elapsed = now - effect.startTime;
        if (elapsed >= effect.duration) return false;

        const progress = elapsed / effect.duration;
        const opacity = 1 - progress;
        const scale = 1 + progress * 2;
        const yOffset = -progress * 40;

        // Rising +1 text
        ctx.fillStyle = `rgba(255, 215, 0, ${opacity})`;
        ctx.font = `bold ${20 * scale}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+1', effect.x, effect.y + yOffset);

        // Sparkle particles
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + progress * Math.PI;
            const dist = 20 + progress * 30;
            const px = effect.x + Math.cos(angle) * dist;
            const py = effect.y + Math.sin(angle) * dist + yOffset;

            ctx.beginPath();
            ctx.arc(px, py, 3 * (1 - progress), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 215, 0, ${opacity * 0.7})`;
            ctx.fill();
        }

        return true;
    });
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;

    const gridSize = 40;
    for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawProtectedZone() {
    // Outer glow
    const gradient = ctx.createRadialGradient(
        targetPoint.x, targetPoint.y, TARGET_RADIUS,
        targetPoint.x, targetPoint.y, PROTECTED_ZONE_RADIUS
    );
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');

    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, PROTECTED_ZONE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Animated dashed circle
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, PROTECTED_ZONE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([15, 10]);
    ctx.lineDashOffset = -Date.now() / 50; // Animate!
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTarget() {
    // Pulsing outer glow
    const pulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;

    // Outer ring with glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20 * pulse;

    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, TARGET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Middle ring
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, TARGET_RADIUS * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, TARGET_RADIUS * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(targetPoint.x, targetPoint.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();

    // "TARGET" label
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TARGET', targetPoint.x, targetPoint.y + TARGET_RADIUS + 20);
}

function drawSpawnZones() {
    const spawnPoints = [
        { x: 80, y: CANVAS_HEIGHT / 2 - 100, team: 'red', index: 0 },
        { x: 80, y: CANVAS_HEIGHT / 2 + 100, team: 'red', index: 1 },
        { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 - 100, team: 'blue', index: 0 },
        { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 + 100, team: 'blue', index: 1 }
    ];

    const isAttackPhase = gameState.phase === 'attack';
    const attackingTeam = gameState.attackingTeam;

    for (const spawn of spawnPoints) {
        const isMySpawn = mySpawnPoint &&
            Math.abs(spawn.x - mySpawnPoint.x) < 10 &&
            Math.abs(spawn.y - mySpawnPoint.y) < 10;

        const isAttackerSpawn = spawn.team === attackingTeam;
        const baseColor = spawn.team === 'red' ? [255, 71, 87] : [52, 152, 219];

        // Make attacker spawns more prominent during attack phase
        let alpha = 0.15;
        let borderAlpha = 0.4;
        let radius = SPAWN_ZONE_RADIUS;

        if (isAttackPhase && isAttackerSpawn) {
            alpha = 0.3;
            borderAlpha = 0.8;
            radius = SPAWN_ZONE_RADIUS + 5;
        }

        if (isMySpawn) {
            alpha = 0.4;
            borderAlpha = 1;
            radius = SPAWN_ZONE_RADIUS + 8;
        }

        // Glow effect for active spawn
        if (isMySpawn && isAttackPhase && isAttackerSpawn) {
            ctx.shadowColor = spawn.team === 'red' ? '#ff4757' : '#3498db';
            ctx.shadowBlur = 25;
        }

        // Fill
        ctx.beginPath();
        ctx.arc(spawn.x, spawn.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseColor.join(',')}, ${alpha})`;
        ctx.fill();

        // Border
        ctx.strokeStyle = `rgba(${baseColor.join(',')}, ${borderAlpha})`;
        ctx.lineWidth = isMySpawn ? 4 : 2;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Team label
        ctx.fillStyle = `rgba(${baseColor.join(',')}, ${borderAlpha})`;
        ctx.font = `bold ${isMySpawn ? '14px' : '11px'} Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isMySpawn && isAttackPhase && isAttackerSpawn) {
            ctx.fillText('START', spawn.x, spawn.y - 8);
            ctx.fillText('HERE', spawn.x, spawn.y + 8);
        } else {
            ctx.fillText(spawn.team.toUpperCase(), spawn.x, spawn.y);
        }

        // "YOU" indicator
        if (isMySpawn) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Rajdhani';
            ctx.fillText('▼ YOU ▼', spawn.x, spawn.y - radius - 12);
        }
    }
}

function drawAttackDirectionHints() {
    if (gameState.phase !== 'attack') return;

    const attackingTeam = gameState.attackingTeam;
    const spawnX = attackingTeam === 'red' ? 80 : CANVAS_WIDTH - 80;

    // Draw subtle arrow hints pointing toward target
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 15]);

    for (const yOffset of [-100, 100]) {
        ctx.beginPath();
        ctx.moveTo(spawnX + (attackingTeam === 'red' ? SPAWN_ZONE_RADIUS : -SPAWN_ZONE_RADIUS), CANVAS_HEIGHT / 2 + yOffset);
        ctx.lineTo(targetPoint.x + (attackingTeam === 'red' ? -PROTECTED_ZONE_RADIUS : PROTECTED_ZONE_RADIUS), targetPoint.y);
        ctx.stroke();
    }

    ctx.setLineDash([]);
}

function drawYourZoneLabel() {
    if (!mySpawnPoint) return;

    const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;

    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
    ctx.font = 'bold 16px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('↓ DRAW FROM HERE ↓', mySpawnPoint.x, mySpawnPoint.y - SPAWN_ZONE_RADIUS - 35);
}

function drawActiveDrawingCursor(point, color) {
    const pulse = Math.sin(Date.now() / 100) * 3 + 10;

    // Outer ring
    ctx.beginPath();
    ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawPathHead(point, color, isMe) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, isMe ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (isMe) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawLine(points, color, opacity) {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// ============================================
// UTILITIES
// ============================================
function distance(p1, p2) {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

function updateInkDisplay() {
    const maxInk = getEffectiveInkMax();
    inkFill.style.width = (ink / maxInk * 100) + '%';
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameState.timeRemaining / 60);
    const seconds = gameState.timeRemaining % 60;
    timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}