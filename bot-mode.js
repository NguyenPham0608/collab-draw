// ============================================
// BOT MODE - Local 2v2 Practice Mode
// ============================================

// ============================================
// LOCAL GAME CONTROLLER
// ============================================
const LocalGame = {
    active: false,
    state: {
        phase: 'waiting',
        round: 1,
        attackingTeam: 'red',
        defendingTeam: 'blue',
        timeRemaining: 0,
        scores: { red: 0, blue: 0 }
    },
    timerInterval: null,
    coins: [],
    teamCoins: { red: 0, blue: 0 },
    activePowerups: { red: [], blue: [] },
    roundTargetReached: false,
    bots: [],

    start() {
        this.active = true;
        this.state = {
            phase: 'waiting',
            round: 1,
            attackingTeam: 'red',
            defendingTeam: 'blue',
            timeRemaining: 0,
            scores: { red: 0, blue: 0 }
        };
        this.teamCoins = { red: 0, blue: 0 };
        this.activePowerups = { red: [], blue: [] };

        // Initialize bots (3 bots: 1 teammate, 2 opponents)
        this.initializeBots();

        // Start first round after brief delay
        setTimeout(() => this.startRound(), 1000);
    },

    initializeBots() {
        // Clear existing bots
        this.bots = [];

        // Determine which spawn index the player has
        // Player is always spawnIndex 0 of their team
        const playerSpawnIndex = 0;

        // Create teammate bot (same team as player, different spawn)
        this.bots.push(new Bot({
            id: 'bot-teammate',
            username: 'AllyBot',
            team: myTeam,
            spawnIndex: 1, // Player is 0, teammate is 1
            personality: 'balanced'
        }));

        // Create opponent bots
        const enemyTeam = myTeam === 'red' ? 'blue' : 'red';
        this.bots.push(new Bot({
            id: 'bot-enemy-1',
            username: 'EnemyBot1',
            team: enemyTeam,
            spawnIndex: 0,
            personality: 'aggressive'
        }));

        this.bots.push(new Bot({
            id: 'bot-enemy-2',
            username: 'EnemyBot2',
            team: enemyTeam,
            spawnIndex: 1,
            personality: 'cautious'
        }));

        // Add bots to gameState.players
        this.bots.forEach(bot => {
            gameState.players[bot.id] = {
                id: bot.id,
                username: bot.username,
                team: bot.team
            };
        });
    },

    startRound() {
        this.state.phase = 'defense';
        this.state.timeRemaining = DEFENSE_PHASE_DURATION;
        this.roundTargetReached = false;

        // Clear lines from previous round
        permanentLines = [];
        fadingLines = [];
        attackerPaths = {};
        remoteDrawingPaths = {};

        // Clear coins
        this.coins = [];

        // Clear powerups for attacking team
        const attackingTeam = this.state.attackingTeam;
        this.activePowerups[attackingTeam] = [];
        this.teamCoins[attackingTeam] = 0;

        // Update game state
        gameState.phase = 'defense';
        gameState.round = this.state.round;
        gameState.attackingTeam = this.state.attackingTeam;
        gameState.defendingTeam = this.state.defendingTeam;

        // Reset bot states
        this.bots.forEach(bot => bot.reset());

        // Update local coin/powerup state if player is attacking
        if (myTeam === attackingTeam) {
            activePowerups = [];
            teamCoins = 0;
            updateCoinUI();
        }

        // Show transition
        this.showTransition('defense');
    },

    startAttackPhase() {
        this.state.phase = 'attack';
        this.state.timeRemaining = ATTACK_PHASE_DURATION;

        // Spawn coins
        this.coins = this.spawnCoins();
        coins = this.coins; // Update global

        // Update game state
        gameState.phase = 'attack';

        // Update local powerups if player is attacking
        const attackingTeam = this.state.attackingTeam;
        if (myTeam === attackingTeam) {
            activePowerups = this.activePowerups[attackingTeam];
            teamCoins = this.teamCoins[attackingTeam];
            updateCoinUI();
        }

        // Reset bot attack paths
        this.bots.forEach(bot => {
            if (bot.team === attackingTeam) {
                bot.resetPath();
                attackerPaths[bot.id] = { points: [], maxDistance: 0 };
            }
        });

        // Show transition
        this.showTransition('attack');
    },

    spawnCoins() {
        const spawnedCoins = [];
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;

        for (let i = 0; i < 6; i++) {
            let x, y, valid;
            let attempts = 0;

            do {
                valid = true;
                x = 150 + Math.random() * (CANVAS_WIDTH - 300);
                y = 80 + Math.random() * (CANVAS_HEIGHT - 160);

                // Check not in protected zone
                const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                if (distToCenter < PROTECTED_ZONE_RADIUS + 30) {
                    valid = false;
                }

                // Check not in spawn zones
                const spawnPoints = [
                    { x: 80, y: CANVAS_HEIGHT / 2 - 100 },
                    { x: 80, y: CANVAS_HEIGHT / 2 + 100 },
                    { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 - 100 },
                    { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT / 2 + 100 }
                ];
                for (const spawn of spawnPoints) {
                    const distToSpawn = Math.sqrt(Math.pow(x - spawn.x, 2) + Math.pow(y - spawn.y, 2));
                    if (distToSpawn < SPAWN_ZONE_RADIUS + 30) {
                        valid = false;
                        break;
                    }
                }

                // Check not too close to other coins
                for (const coin of spawnedCoins) {
                    const distToCoin = Math.sqrt(Math.pow(x - coin.x, 2) + Math.pow(y - coin.y, 2));
                    if (distToCoin < 60) {
                        valid = false;
                        break;
                    }
                }

                attempts++;
            } while (!valid && attempts < 50);

            if (valid) {
                spawnedCoins.push({ id: i, x, y, collected: false });
            }
        }

        return spawnedCoins;
    },

    showTransition(phase) {
        const isAttacking = myTeam === this.state.attackingTeam;

        transitionTitle.textContent = `ROUND ${this.state.round}`;
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
                this.beginPhase(phase);
            }
        }, 1000);
    },

    beginPhase(phase) {
        // Update role badge
        const isAttacking = myTeam === this.state.attackingTeam;
        roleBadge.className = 'role-badge ' + (isAttacking ? 'attacking' : 'defending');
        roleBadge.querySelector('.role-icon').textContent = isAttacking ? '⚔️' : '🛡️';
        roleBadge.querySelector('.role-text').textContent = isAttacking ? 'ATTACKING' : 'DEFENDING';

        phaseIndicator.textContent = phase.toUpperCase() + ' PHASE';

        // Reset player ink
        ink = INK_MAX;
        updateInkDisplay();

        // Show/hide coin UI
        coinCounter.classList.toggle('hidden', !isAttacking);

        // Start timer
        const duration = phase === 'defense' ? DEFENSE_PHASE_DURATION : ATTACK_PHASE_DURATION;
        this.startTimer(duration, () => {
            if (phase === 'defense') {
                this.startAttackPhase();
            } else {
                this.endRound();
            }
        });

        // Start bot behavior
        this.bots.forEach(bot => bot.startPhase(phase, this.state.attackingTeam, this.state.defendingTeam));
    },

    startTimer(duration, callback) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.state.timeRemaining = duration;
        this.updateTimerDisplay();

        this.timerInterval = setInterval(() => {
            this.state.timeRemaining--;
            this.updateTimerDisplay();

            if (this.state.timeRemaining <= 0) {
                clearInterval(this.timerInterval);
                callback();
            }
        }, 1000);
    },

    updateTimerDisplay() {
        const minutes = Math.floor(this.state.timeRemaining / 60);
        const seconds = this.state.timeRemaining % 60;
        timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    handleTargetReached(playerId) {
        if (!this.roundTargetReached) {
            this.roundTargetReached = true;

            clearInterval(this.timerInterval);

            // Visual feedback
            const player = gameState.players[playerId];
            if (player) {
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

            // End round after brief delay
            setTimeout(() => this.endRound(), 2000);
        }
    },

    endRound() {
        clearInterval(this.timerInterval);

        // Stop all bots
        this.bots.forEach(bot => bot.stop());

        // Calculate round score
        const attackingTeam = this.state.attackingTeam;

        if (this.roundTargetReached) {
            this.state.scores[attackingTeam] += POINTS_TARGET_REACHED;
        } else {
            // Score based on max distance reached
            let maxDistance = 0;
            for (const path of Object.values(attackerPaths)) {
                if (path.maxDistance > maxDistance) {
                    maxDistance = path.maxDistance;
                }
            }
            this.state.scores[attackingTeam] += Math.floor(maxDistance * POINTS_PER_DISTANCE);
        }

        // Update score display
        gameState.scores = this.state.scores;
        redScore.textContent = this.state.scores.red;
        blueScore.textContent = this.state.scores.blue;

        // Check if game is over
        if (this.state.round >= 4) {
            this.endGame();
            return;
        }

        // Swap teams and start next round
        this.state.round++;
        const temp = this.state.attackingTeam;
        this.state.attackingTeam = this.state.defendingTeam;
        this.state.defendingTeam = temp;

        setTimeout(() => this.startRound(), 2000);
    },

    endGame() {
        this.state.phase = 'gameover';
        gameState.phase = 'gameover';

        // Stop all bots
        this.bots.forEach(bot => bot.stop());

        finalRedScore.textContent = this.state.scores.red;
        finalBlueScore.textContent = this.state.scores.blue;

        let result;
        if (this.state.scores.red === this.state.scores.blue) {
            result = 'draw';
            gameOverTitle.textContent = 'DRAW';
        } else {
            const winningTeam = this.state.scores.red > this.state.scores.blue ? 'red' : 'blue';
            result = winningTeam === myTeam ? 'victory' : 'defeat';
            gameOverTitle.textContent = result === 'victory' ? 'VICTORY' : 'DEFEAT';
        }

        gameOverTitle.className = 'game-over-title ' + result;
        gameOverOverlay.classList.remove('hidden');
    },

    collectCoin(coinId, botId) {
        const coin = this.coins.find(c => c.id === coinId && !c.collected);
        if (!coin) return;

        const bot = this.bots.find(b => b.id === botId);
        if (!bot) return;

        coin.collected = true;
        this.teamCoins[bot.team]++;

        // Update global coins array
        const globalCoin = coins.find(c => c.id === coinId);
        if (globalCoin) globalCoin.collected = true;

        // Visual effect
        coinCollectEffects.push({
            x: coin.x,
            y: coin.y,
            startTime: Date.now(),
            duration: 400
        });

        // Update UI if it's player's team
        if (bot.team === myTeam) {
            teamCoins = this.teamCoins[myTeam];
            updateCoinUI();
        }
    },

    buyPowerup(powerupId, team) {
        const powerup = POWERUPS[powerupId];
        if (!powerup) return false;
        if (this.teamCoins[team] < powerup.cost) return false;
        if (this.activePowerups[team].includes(powerupId)) return false;

        this.teamCoins[team] -= powerup.cost;
        this.activePowerups[team].push(powerupId);

        // Update UI if player's team
        if (team === myTeam) {
            teamCoins = this.teamCoins[myTeam];
            activePowerups = this.activePowerups[myTeam];
            updateCoinUI();
        }

        return true;
    }
};

// ============================================
// BOT AI CLASS
// ============================================
class Bot {
    constructor(config) {
        this.id = config.id;
        this.username = config.username;
        this.team = config.team;
        this.spawnIndex = config.spawnIndex;
        this.personality = config.personality || 'balanced';

        // Set spawn point
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
        this.spawnPoint = spawnPoints[this.team][this.spawnIndex];

        // Drawing state
        this.ink = INK_MAX;
        this.isDrawing = false;
        this.currentPath = [];
        this.targetWaypoints = [];
        this.currentWaypointIndex = 0;
        this.isStunned = false;
        this.stunEndTime = 0;

        // Behavior timers
        this.updateInterval = null;
        this.drawInterval = null;

        // Personality settings
        this.setPersonalityTraits();
    }

    setPersonalityTraits() {
        switch (this.personality) {
            case 'aggressive':
                this.drawSpeed = 4.5; // pixels per frame
                this.reactionTime = 100; // ms
                this.wobbleAmount = 1.5;
                this.riskTolerance = 0.8;
                break;
            case 'cautious':
                this.drawSpeed = 2.5;
                this.reactionTime = 200;
                this.wobbleAmount = 1;
                this.riskTolerance = 0.3;
                break;
            case 'balanced':
            default:
                this.drawSpeed = 3.5;
                this.reactionTime = 150;
                this.wobbleAmount = 1.2;
                this.riskTolerance = 0.5;
                break;
        }
    }

    reset() {
        this.ink = INK_MAX;
        this.isDrawing = false;
        this.currentPath = [];
        this.targetWaypoints = [];
        this.currentWaypointIndex = 0;
        this.isStunned = false;
        this.stop();
    }

    resetPath() {
        this.currentPath = [];
        this.targetWaypoints = [];
        this.currentWaypointIndex = 0;
        this.isDrawing = false;

        // Clear from attacker paths
        if (attackerPaths[this.id]) {
            attackerPaths[this.id] = { points: [], maxDistance: 0 };
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.drawInterval) {
            clearInterval(this.drawInterval);
            this.drawInterval = null;
        }
        this.isDrawing = false;
    }

    startPhase(phase, attackingTeam, defendingTeam) {
        this.stop();

        const isAttacking = this.team === attackingTeam;

        if (phase === 'defense' && !isAttacking) {
            // Bot is defending - draw walls
            setTimeout(() => this.startDefending(), this.reactionTime + Math.random() * 500);
        } else if (phase === 'attack' && isAttacking) {
            // Bot is attacking - rush the target
            setTimeout(() => this.startAttacking(), this.reactionTime + Math.random() * 800);
        }
    }

    // ============================================
    // DEFENDING BEHAVIOR
    // ============================================
    startDefending() {
        // Plan circular walls around target
        this.planDefenseWalls();

        let wallIndex = 0;

        this.updateInterval = setInterval(() => {
            if (LocalGame.state.phase !== 'defense') {
                this.stop();
                return;
            }

            // Regenerate ink when not drawing
            if (!this.isDrawing && this.ink < INK_MAX) {
                this.ink = Math.min(INK_MAX, this.ink + INK_REGEN_RATE / 60);
            }

            // Start drawing next wall if ready
            if (!this.isDrawing && this.ink > 40 && wallIndex < this.targetWaypoints.length) {
                this.drawDefenseWall(this.targetWaypoints[wallIndex]);
                wallIndex++;
            }
        }, 100);
    }

    planDefenseWalls() {
        this.targetWaypoints = [];

        const targetX = CANVAS_WIDTH / 2;
        const targetY = CANVAS_HEIGHT / 2;

        // Each bot draws 1-2 full circles at different radii
        const numCircles = 1 + Math.floor(Math.random() * 2);

        for (let i = 0; i < numCircles; i++) {
            // Different radius based on spawn index and circle number
            // spawnIndex 0 = inner circles, spawnIndex 1 = outer circles
            const baseRadius = PROTECTED_ZONE_RADIUS + 50 + (this.spawnIndex * 70) + (i * 60);

            // Random starting angle so circles don't all start at same point
            const startAngle = Math.random() * Math.PI * 2;

            // Full circle (2 * PI) plus a tiny bit of overlap
            const endAngle = startAngle + Math.PI * 2.05;

            this.targetWaypoints.push({
                centerX: targetX,
                centerY: targetY,
                radius: baseRadius,
                startAngle: startAngle,
                endAngle: endAngle,
                inkType: Math.random() > 0.75 ? 'fading' : 'permanent'
            });
        }
    }

    drawDefenseWall(wallPlan) {
        this.isDrawing = true;
        this.currentPath = [];

        const inkType = wallPlan.inkType;
        const drainMultiplier = inkType === 'fading' ? FADING_INK_COST_MULTIPLIER : 1;

        const { centerX, centerY, radius, startAngle, endAngle } = wallPlan;
        const totalAngle = endAngle - startAngle;

        let currentAngle = startAngle;

        // Speed variation parameters
        let speedPhase = Math.random() * Math.PI * 2; // Random starting phase
        const baseAngularSpeed = 0.025; // Base speed in radians per frame

        this.drawInterval = setInterval(() => {
            if (LocalGame.state.phase !== 'defense' || this.ink <= 0) {
                this.finishDefenseWall(inkType);
                return;
            }

            if (currentAngle >= endAngle) {
                this.finishDefenseWall(inkType);
                return;
            }

            // Variable speed - oscillates between 0.5x and 1.5x base speed
            speedPhase += 0.08;
            const speedMultiplier = 1 + Math.sin(speedPhase) * 0.5;
            const angularSpeed = baseAngularSpeed * speedMultiplier;

            // Calculate position on circle
            const x = centerX + Math.cos(currentAngle) * radius;
            const y = centerY + Math.sin(currentAngle) * radius;

            this.currentPath.push({ x, y });
            currentAngle += angularSpeed;

            // Drain ink based on actual speed (faster = more drain)
            this.ink -= (INK_DRAIN_RATE / 60) * drainMultiplier * speedMultiplier;

            // Update remote drawing paths for visualization
            if (!remoteDrawingPaths[this.id]) {
                remoteDrawingPaths[this.id] = { points: [], team: this.team, inkType: inkType };
            }
            remoteDrawingPaths[this.id].points = [...this.currentPath];

        }, 1000 / 60);
    }

    finishDefenseWall(inkType) {
        clearInterval(this.drawInterval);
        this.drawInterval = null;
        this.isDrawing = false;

        // Clear remote drawing path
        delete remoteDrawingPaths[this.id];

        if (this.currentPath.length >= 2) {
            const lineData = {
                team: this.team,
                points: [...this.currentPath],
                color: this.team === 'red' ? '#ff4757' : '#3498db'
            };

            if (inkType === 'fading') {
                fadingLines.push({ ...lineData, createdAt: Date.now() });
            } else {
                permanentLines.push(lineData);
            }
        }

        this.currentPath = [];
    }

    // ============================================
    // ATTACKING BEHAVIOR
    // ============================================
    // ============================================
    // ATTACKING BEHAVIOR (with pathfinding)
    // ============================================

    // Grid constants for pathfinding
    static GRID_COLS = 40;
    static GRID_ROWS = 26;

    // ============================================
    // ATTACKING BEHAVIOR (with pathfinding)
    // ============================================

    startAttacking() {
        // Analyze walls and find path
        this.planAttackPath();

        this.updateInterval = setInterval(() => {
            if (LocalGame.state.phase !== 'attack' || LocalGame.roundTargetReached) {
                this.stop();
                return;
            }

            // Check if stunned
            if (this.isStunned) {
                if (Date.now() > this.stunEndTime) {
                    this.isStunned = false;
                    // Re-plan path after stun (walls may have holes now!)
                    setTimeout(() => {
                        if (LocalGame.state.phase === 'attack') {
                            this.planAttackPath();
                            this.startDrawingAttack();
                        }
                    }, 300);
                }
                return;
            }

            // Regenerate ink when not drawing
            if (!this.isDrawing && this.ink < INK_MAX) {
                this.ink = Math.min(INK_MAX, this.ink + INK_REGEN_RATE / 60);

                // Resume drawing when ink is sufficient
                if (this.ink > 40) {
                    this.startDrawingAttack();
                }
            }
        }, 100);

        // Start drawing immediately
        this.startDrawingAttack();
    }

    buildObstacleGrid() {
        // Finer grid for better gap detection
        const GRID_COLS = 100;
        const GRID_ROWS = 65;
        const CELL_WIDTH = CANVAS_WIDTH / GRID_COLS;
        const CELL_HEIGHT = CANVAS_HEIGHT / GRID_ROWS;

        // Create grid with movement costs (0 = open, higher = more costly, 999 = wall)
        const grid = [];
        for (let row = 0; row < GRID_ROWS; row++) {
            grid[row] = [];
            for (let col = 0; col < GRID_COLS; col++) {
                grid[row][col] = 0;
            }
        }

        const defenderTeam = LocalGame.state.defendingTeam;
        const now = Date.now();

        // First pass: mark walls
        const wallCells = new Set();

        for (const line of permanentLines) {
            if (line && line.team === defenderTeam && line.points) {
                this.markWallCells(wallCells, line.points, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS);
            }
        }

        for (const line of fadingLines) {
            if (line && line.team === defenderTeam && line.points) {
                if ((now - line.createdAt) < FADING_INK_DURATION) {
                    this.markWallCells(wallCells, line.points, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS);
                }
            }
        }

        // Apply walls to grid
        for (const key of wallCells) {
            const [row, col] = key.split(',').map(Number);
            grid[row][col] = 999; // Impassable
        }

        // Second pass: add smaller danger zones (just avoid clipping walls)
        const dangerRadius = 2;
        for (const key of wallCells) {
            const [wallRow, wallCol] = key.split(',').map(Number);

            for (let dr = -dangerRadius; dr <= dangerRadius; dr++) {
                for (let dc = -dangerRadius; dc <= dangerRadius; dc++) {
                    const r = wallRow + dr;
                    const c = wallCol + dc;

                    if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                        if (grid[r][c] !== 999) {
                            const dist = Math.sqrt(dr * dr + dc * dc);
                            if (dist <= dangerRadius) {
                                const cost = Math.floor((dangerRadius - dist + 1) * 8);
                                grid[r][c] = Math.max(grid[r][c], cost);
                            }
                        }
                    }
                }
            }
        }

        return { grid, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS };
    }

    markWallCells(wallCells, points, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS) {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const steps = Math.ceil(dist / 3); // Check every 3 pixels for finer detection

            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const x = p1.x + (p2.x - p1.x) * t;
                const y = p1.y + (p2.y - p1.y) * t;

                const col = Math.floor(x / CELL_WIDTH);
                const row = Math.floor(y / CELL_HEIGHT);

                // Mark cell and small buffer for line thickness
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const r = row + dr;
                        const c = col + dc;
                        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                            wallCells.add(`${r},${c}`);
                        }
                    }
                }
            }
        }
    }

    findPathToPoint(gridData, startX, startY, endX, endY) {
        const { grid, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS } = gridData;

        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
        const sCol = clamp(Math.floor(startX / CELL_WIDTH), 0, GRID_COLS - 1);
        const sRow = clamp(Math.floor(startY / CELL_HEIGHT), 0, GRID_ROWS - 1);
        const eCol = clamp(Math.floor(endX / CELL_WIDTH), 0, GRID_COLS - 1);
        const eRow = clamp(Math.floor(endY / CELL_HEIGHT), 0, GRID_ROWS - 1);

        // If start is in a wall, find nearest open cell
        let actualStartRow = sRow;
        let actualStartCol = sCol;
        if (grid[sRow][sCol] === 999) {
            const open = this.findNearestOpen(grid, sRow, sCol, GRID_ROWS, GRID_COLS);
            if (open) {
                actualStartRow = open.row;
                actualStartCol = open.col;
            }
        }

        // Dijkstra with preference for meandering
        const dist = {};
        const prev = {};
        const visited = new Set();
        const pq = [];

        const key = (r, c) => `${r},${c}`;

        dist[key(actualStartRow, actualStartCol)] = 0;
        pq.push({ row: actualStartRow, col: actualStartCol, d: 0 });

        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];

        let iterations = 0;
        const maxIterations = 15000;

        while (pq.length > 0 && iterations < maxIterations) {
            iterations++;

            pq.sort((a, b) => a.d - b.d);
            const current = pq.shift();
            const { row, col } = current;
            const currentKey = key(row, col);

            if (visited.has(currentKey)) continue;
            visited.add(currentKey);

            if (row === eRow && col === eCol) {
                return this.reconstructPath(prev, currentKey, CELL_WIDTH, CELL_HEIGHT);
            }

            for (const [dr, dc] of directions) {
                const newRow = row + dr;
                const newCol = col + dc;
                const newKey = key(newRow, newCol);

                if (newRow < 0 || newRow >= GRID_ROWS || newCol < 0 || newCol >= GRID_COLS) continue;
                if (visited.has(newKey)) continue;
                if (grid[newRow][newCol] === 999) continue;

                if (dr !== 0 && dc !== 0) {
                    if (grid[row + dr][col] === 999 && grid[row][col + dc] === 999) continue;
                }

                const moveCost = (dr !== 0 && dc !== 0) ? 1.414 : 1;
                const cellCost = grid[newRow][newCol];

                // Bias: prefer moving perpendicular to direct path (creates meandering)
                const directAngle = Math.atan2(eRow - sRow, eCol - sCol);
                const moveAngle = Math.atan2(dr, dc);
                let angleDiff = Math.abs(directAngle - moveAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                // Reward perpendicular movement slightly (makes path curve)
                const perpendicularBonus = Math.abs(Math.sin(angleDiff)) * 0.3;

                const totalCost = moveCost + cellCost - perpendicularBonus;

                const newDist = dist[currentKey] + totalCost;

                if (dist[newKey] === undefined || newDist < dist[newKey]) {
                    dist[newKey] = newDist;
                    prev[newKey] = currentKey;
                    pq.push({ row: newRow, col: newCol, d: newDist });
                }
            }
        }

        return [{ x: startX, y: startY }, { x: endX, y: endY }];
    }

    findNearestOpen(grid, startRow, startCol, GRID_ROWS, GRID_COLS) {
        for (let radius = 1; radius < 20; radius++) {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const r = startRow + dr;
                    const c = startCol + dc;
                    if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                        if (grid[r][c] < 999) {
                            return { row: r, col: c };
                        }
                    }
                }
            }
        }
        return null;
    }

    reconstructPath(prev, endKey, CELL_WIDTH, CELL_HEIGHT) {
        const path = [];
        let curr = endKey;
        while (curr) {
            const [r, c] = curr.split(',').map(Number);
            path.unshift({
                x: (c + 0.5) * CELL_WIDTH,
                y: (r + 0.5) * CELL_HEIGHT
            });
            curr = prev[curr];
        }
        return path;
    }

    planAttackPath() {
        const gridData = this.buildObstacleGrid();

        let startPos = this.currentPath.length > 0
            ? this.currentPath[this.currentPath.length - 1]
            : { ...this.spawnPoint };

        const targetX = CANVAS_WIDTH / 2;
        const targetY = CANVAS_HEIGHT / 2;

        // Create intermediate waypoints to force a longer, curving path
        const intermediatePoints = this.generateIntermediateWaypoints(startPos, targetX, targetY, gridData);

        // Build full path through all waypoints
        let fullPath = [];
        let currentStart = startPos;

        for (const waypoint of intermediatePoints) {
            const segment = this.findPathToPoint(gridData, currentStart.x, currentStart.y, waypoint.x, waypoint.y);
            if (segment.length > 0) {
                // Skip first point of segment (it's same as end of previous) except for first segment
                const startIndex = fullPath.length === 0 ? 0 : 1;
                fullPath = fullPath.concat(segment.slice(startIndex));
                currentStart = segment[segment.length - 1];
            }
        }

        // Final segment to target
        const finalSegment = this.findPathToPoint(gridData, currentStart.x, currentStart.y, targetX, targetY);
        if (finalSegment.length > 1) {
            fullPath = fullPath.concat(finalSegment.slice(1));
        }

        // Light smoothing
        this.targetWaypoints = this.lightSmooth(fullPath);
        this.currentWaypointIndex = 0;
    }

    generateIntermediateWaypoints(start, targetX, targetY, gridData) {
        const waypoints = [];
        const { grid, CELL_WIDTH, CELL_HEIGHT, GRID_COLS, GRID_ROWS } = gridData;

        // Distance from start to target
        const dx = targetX - start.x;
        const dy = targetY - start.y;
        const totalDist = Math.sqrt(dx * dx + dy * dy);

        // Generate 1-3 intermediate waypoints that curve the path
        const numWaypoints = 1 + Math.floor(Math.random() * 2);

        for (let i = 0; i < numWaypoints; i++) {
            // Progress along direct path (spread waypoints out)
            const t = (i + 1) / (numWaypoints + 1);

            // Base position along direct line
            let wpX = start.x + dx * t;
            let wpY = start.y + dy * t;

            // Offset perpendicular to the direct path (creates curve)
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;

            // Alternate sides and vary offset amount based on bot personality
            const side = (i + this.spawnIndex) % 2 === 0 ? 1 : -1;
            const offsetAmount = (80 + Math.random() * 120) * side;

            wpX += Math.cos(perpAngle) * offsetAmount;
            wpY += Math.sin(perpAngle) * offsetAmount;

            // Clamp to canvas with padding
            wpX = Math.max(100, Math.min(CANVAS_WIDTH - 100, wpX));
            wpY = Math.max(80, Math.min(CANVAS_HEIGHT - 80, wpY));

            // Check if waypoint is in a wall, if so try to nudge it
            const col = Math.floor(wpX / CELL_WIDTH);
            const row = Math.floor(wpY / CELL_HEIGHT);

            if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
                if (grid[row][col] === 999) {
                    // Find nearby open cell
                    const open = this.findNearestOpen(grid, row, col, GRID_ROWS, GRID_COLS);
                    if (open) {
                        wpX = (open.col + 0.5) * CELL_WIDTH;
                        wpY = (open.row + 0.5) * CELL_HEIGHT;
                    }
                }
            }

            waypoints.push({ x: wpX, y: wpY });
        }

        return waypoints;
    }

    lightSmooth(path) {
        if (path.length <= 3) return path;

        // Only remove points that are almost exactly in line
        const result = [path[0]];

        for (let i = 1; i < path.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = path[i];
            const next = path[i + 1];

            const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
            const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
            let angleDiff = Math.abs(angle1 - angle2);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

            // Keep if direction changes even slightly
            if (angleDiff > 0.1) {
                result.push(curr);
            }
        }

        result.push(path[path.length - 1]);
        return result;
    }

    startDrawingAttack() {
        if (this.isDrawing || this.isStunned) return;

        this.isDrawing = true;

        if (this.currentPath.length === 0) {
            this.currentPath = [{ ...this.spawnPoint }];
            attackerPaths[this.id] = { points: [{ ...this.spawnPoint }], maxDistance: 0 };
        }

        let currentPos = { ...this.currentPath[this.currentPath.length - 1] };

        // Store current velocity for smooth transitions
        let currentVelocity = { x: 0, y: 0 };
        const smoothingFactor = 0.15; // Lower = smoother but slower turns

        this.drawInterval = setInterval(() => {
            if (LocalGame.state.phase !== 'attack' || this.ink <= 0 || this.isStunned || LocalGame.roundTargetReached) {
                this.pauseDrawing();
                return;
            }

            if (this.currentWaypointIndex >= this.targetWaypoints.length) {
                this.pauseDrawing();
                return;
            }

            const waypoint = this.targetWaypoints[this.currentWaypointIndex];
            const dx = waypoint.x - currentPos.x;
            const dy = waypoint.y - currentPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.drawSpeed * 3) {
                this.currentWaypointIndex++;

                const distToTarget = distance(currentPos, { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
                if (distToTarget <= TARGET_RADIUS) {
                    LocalGame.handleTargetReached(this.id);
                    this.pauseDrawing();
                    return;
                }
                return;
            }

            // Calculate desired velocity (normalized direction * speed)
            const desiredVelocity = {
                x: (dx / dist) * this.drawSpeed,
                y: (dy / dist) * this.drawSpeed
            };

            // Smoothly interpolate current velocity towards desired velocity
            // This creates eased turns instead of sharp corners
            currentVelocity.x += (desiredVelocity.x - currentVelocity.x) * smoothingFactor;
            currentVelocity.y += (desiredVelocity.y - currentVelocity.y) * smoothingFactor;

            // Apply velocity to position
            const newPos = {
                x: currentPos.x + currentVelocity.x,
                y: currentPos.y + currentVelocity.y
            };

            // Check collision
            const collision = this.checkCollision(currentPos, newPos);
            if (collision) {
                this.handleCollision(collision);
                return;
            }

            // Check coins
            this.checkCoinCollection(newPos);

            currentPos = newPos;
            this.currentPath.push({ ...currentPos });

            if (!attackerPaths[this.id]) {
                attackerPaths[this.id] = { points: [], maxDistance: 0 };
            }
            attackerPaths[this.id].points.push({ ...currentPos });

            const distToTarget = distance(currentPos, { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
            const progress = CANVAS_WIDTH / 2 - distToTarget;
            attackerPaths[this.id].maxDistance = Math.max(attackerPaths[this.id].maxDistance, progress);

            if (distToTarget <= TARGET_RADIUS) {
                LocalGame.handleTargetReached(this.id);
                this.pauseDrawing();
                return;
            }

            this.ink -= INK_DRAIN_RATE / 60;

            if (!remoteDrawingPaths[this.id]) {
                remoteDrawingPaths[this.id] = { points: [], team: this.team, inkType: 'permanent' };
            }
            remoteDrawingPaths[this.id].points = [...this.currentPath];

        }, 1000 / 60);
    }

    pauseDrawing() {
        if (this.drawInterval) {
            clearInterval(this.drawInterval);
            this.drawInterval = null;
        }
        this.isDrawing = false;
        delete remoteDrawingPaths[this.id];
    }

    checkCollision(fromPos, toPos) {
        const defenderTeam = LocalGame.state.defendingTeam;

        for (let i = 0; i < permanentLines.length; i++) {
            const line = permanentLines[i];
            if (line && line.team === defenderTeam && line.points && line.points.length >= 2) {
                const collision = findCollisionPoint(fromPos, toPos, line.points);
                if (collision) {
                    return { point: collision.point, lineIndex: i, lineType: 'permanent' };
                }
            }
        }

        const now = Date.now();
        for (let i = 0; i < fadingLines.length; i++) {
            const line = fadingLines[i];
            if (line && line.team === defenderTeam && line.points && line.points.length >= 2) {
                if ((now - line.createdAt) < FADING_INK_DURATION) {
                    const collision = findCollisionPoint(fromPos, toPos, line.points);
                    if (collision) {
                        return { point: collision.point, lineIndex: i, lineType: 'fading' };
                    }
                }
            }
        }

        return null;
    }

    handleCollision(collision) {
        this.pauseDrawing();

        const explosionRadius = EXPLOSION_RADIUS;
        createExplosionEffect(collision.point, explosionRadius);
        createBrickDebris(collision.point, LocalGame.state.defendingTeam);

        if (collision.lineType === 'permanent') {
            const newPermanent = [];
            for (let i = 0; i < permanentLines.length; i++) {
                if (i === collision.lineIndex) {
                    const segments = splitLineByExplosionLocal(permanentLines[i], collision.point, explosionRadius);
                    newPermanent.push(...segments);
                } else {
                    newPermanent.push(permanentLines[i]);
                }
            }
            permanentLines = newPermanent;
        } else {
            const newFading = [];
            for (let i = 0; i < fadingLines.length; i++) {
                if (i === collision.lineIndex) {
                    const segments = splitLineByExplosionLocal(fadingLines[i], collision.point, explosionRadius);
                    newFading.push(...segments);
                } else {
                    newFading.push(fadingLines[i]);
                }
            }
            fadingLines = newFading;
        }

        this.isStunned = true;
        this.stunEndTime = Date.now() + STUN_DURATION;
        this.resetPath();
    }

    checkCoinCollection(pos) {
        for (const coin of LocalGame.coins) {
            if (coin.collected) continue;

            const dist = distance(pos, coin);
            if (dist <= COIN_COLLECT_DISTANCE) {
                LocalGame.collectCoin(coin.id, this.id);
            }
        }
    }
}

// ============================================
// PRACTICE MODE ENTRY POINT
// ============================================
function startPracticeMode() {
    const name = usernameInput.value.trim() || 'Player';
    myUsername = name;

    // Set up player
    myId = 'player-local';
    myTeam = 'red'; // Player is always red team for now

    gameState.players = {
        [myId]: {
            id: myId,
            username: myUsername,
            team: myTeam
        }
    };
    gameState.scores = { red: 0, blue: 0 };

    // Set spawn point (player is always index 0)
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
    mySpawnPoint = spawnPoints[myTeam][0];

    // Update UI
    menuScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    playerName.textContent = myUsername;
    playerTeam.textContent = myTeam.toUpperCase() + ' TEAM';
    playerTeam.className = 'player-team ' + myTeam;

    // Set teammate display
    teammate.querySelector('.teammate-name').textContent = 'AllyBot';
    teammate.querySelector('.teammate-avatar').textContent = 'A';

    // Initialize coin UI
    updateCoinUI();

    // Initial render
    render();

    // Start game loop
    requestAnimationFrame(gameLoop);

    // Start local game
    LocalGame.start();
}