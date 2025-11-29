// ============================================
// CONFIGURATION
// ============================================
const WS_URL = 'wss://collab-draw-backend-86k5.onrender.com';

// ============================================
// ELEMENTS
// ============================================
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const enterLobbyBtn = document.getElementById('enterLobbyBtn');
const roomModal = document.getElementById('roomModal');
const roomsGrid = document.getElementById('roomsGrid');
const gameContainer = document.getElementById('gameContainer');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const teamIndicator = document.getElementById('teamIndicator');
const teamName = document.getElementById('teamName');
const roleIndicator = document.getElementById('roleIndicator');
const roleName = document.getElementById('roleName');
const roleIcon = roleIndicator.querySelector('.role-icon');
const redScore = document.getElementById('redScore');
const blueScore = document.getElementById('blueScore');
const phaseLabel = document.getElementById('phaseLabel');
const timer = document.getElementById('timer');
const roundNum = document.getElementById('roundNum');
const inkFill = document.getElementById('inkFill');
const inkValue = document.getElementById('inkValue');
const redAttackBadge = document.getElementById('redAttackBadge');
const blueAttackBadge = document.getElementById('blueAttackBadge');
const redTeamPlayers = document.getElementById('redTeamPlayers');
const blueTeamPlayers = document.getElementById('blueTeamPlayers');
const crystalContainer = document.getElementById('crystalContainer');
const crystal = document.getElementById('crystal');
const brushSizeInput = document.getElementById('brushSize');
const brushPreview = document.getElementById('brushPreview');
const announcement = document.getElementById('announcement');
const announcementIcon = document.getElementById('announcementIcon');
const announcementText = document.getElementById('announcementText');
const announcementSub = document.getElementById('announcementSub');

// ============================================
// STATE
// ============================================
let ws = null;
let myId = null;
let myUsername = '';
let myTeam = null;
let myRoomId = null;
let players = {};
let gameState = 'waiting';
let attackingTeam = 'red';
let scores = { red: 0, blue: 0 };
let currentRound = 0;
let ink = 100;
let brushSize = 8;
let crystalPos = { x: 80, y: 350, radius: 40 };

// Store all strokes for redrawing
let strokes = [];

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;

const TEAM_COLORS = {
    red: '#ff2d55',
    blue: '#00d4ff'
};

// ============================================
// INITIALIZATION
// ============================================
usernameInput.focus();
updateBrushPreview();

// ============================================
// EVENT LISTENERS
// ============================================

enterLobbyBtn.addEventListener('click', enterLobby);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enterLobby();
});

function enterLobby() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameInput.focus();
        return;
    }
    myUsername = name;
    usernameModal.classList.add('hidden');
    roomModal.classList.remove('hidden');
    connectWebSocket();
}

brushSizeInput.addEventListener('input', () => {
    brushSize = parseInt(brushSizeInput.value);
    updateBrushPreview();
});

function updateBrushPreview() {
    const size = Math.max(4, brushSize);
    const color = myTeam ? TEAM_COLORS[myTeam] : '#666';
    brushPreview.innerHTML = `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;"></div>`;
}

// ============================================
// WEBSOCKET
// ============================================

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('Connected to server');
        ws.send(JSON.stringify({ type: 'getRooms' }));
    };

    ws.onclose = () => {
        console.log('Disconnected, reconnecting...');
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'roomList':
            renderRoomList(msg.rooms);
            break;

        case 'joinedRoom':
            handleJoinedRoom(msg);
            break;

        case 'playerJoined':
            players[msg.id] = {
                username: msg.username,
                team: msg.team,
                ink: msg.ink
            };
            updatePlayersList();
            break;

        case 'playerLeft':
            delete players[msg.id];
            updatePlayersList();
            break;

        case 'phaseChange':
            handlePhaseChange(msg);
            break;

        case 'countdown':
            handleCountdown(msg);
            break;

        case 'countdownCancelled':
            handleCountdownCancelled(msg);
            break;

        case 'timerUpdate':
            updateTimer(msg.timeRemaining);
            break;

        case 'draw':
            // Server confirmed stroke - add to local store and draw
            strokes.push(msg.stroke);
            drawStroke(msg.stroke);
            break;

        case 'collision':
            handleCollision(msg);
            break;

        case 'inkUpdate':
            if (msg.ink !== undefined) {
                ink = msg.ink;
                updateInkDisplay();
            }
            if (msg.players) {
                players = msg.players;
                if (myId && players[myId]) {
                    ink = players[myId].ink;
                    updateInkDisplay();
                }
                updatePlayersList();
            }
            break;

        case 'noInk':
            flashInkWarning();
            break;

        case 'roundEnd':
            handleRoundEnd(msg);
            break;

        case 'gameOver':
            handleGameOver(msg);
            break;

        case 'roomReset':
            handleRoomReset(msg);
            break;

        case 'error':
            alert(msg.message);
            break;
    }
}

// ============================================
// ROOM SELECTION
// ============================================

function renderRoomList(rooms) {
    roomsGrid.innerHTML = Object.values(rooms).map(room => {
        const isFull = room.playerCount >= 4;
        const statusText = room.gameState === 'waiting' ? 'WAITING FOR PLAYERS' :
                          room.gameState === 'countdown' ? 'STARTING SOON' :
                          room.gameState === 'fortress' ? 'PREPARING' :
                          room.gameState === 'playing' ? 'IN BATTLE' :
                          room.gameState === 'roundEnd' ? 'ROUND END' :
                          room.gameState === 'gameOver' ? 'GAME OVER' : 'WAITING';
        const statusClass = room.gameState === 'waiting' ? 'waiting' : 'playing';

        return `
            <div class="room-card ${isFull ? 'full' : ''} ${room.gameState !== 'waiting' ? 'in-game' : ''}"
                 data-room="${room.id}" ${isFull ? '' : 'onclick="joinRoom(' + room.id + ')"'}>
                <div class="room-number">ARENA ${room.id}</div>
                <div class="room-status ${statusClass}">${statusText}</div>
                <div class="room-players">
                    <span class="room-team-count red">⚔️ ${room.redCount}/2</span>
                    <span class="room-team-count blue">🛡️ ${room.blueCount}/2</span>
                </div>
            </div>
        `;
    }).join('');
}

function joinRoom(roomId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'joinRoom',
            roomId: roomId,
            username: myUsername
        }));
    }
}

function handleJoinedRoom(msg) {
    myId = msg.id;
    myRoomId = msg.roomId;
    myTeam = msg.team;
    players = msg.players;
    gameState = msg.gameState;
    scores = msg.scores;
    attackingTeam = msg.attackingTeam;
    currentRound = msg.round;
    crystalPos = msg.crystal;
    strokes = msg.strokes || [];
    ink = 100;

    teamName.textContent = myTeam.toUpperCase();
    teamName.className = 'team-name ' + myTeam;

    roomModal.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    // Redraw entire canvas from server state
    redrawCanvas();

    updateRoleDisplay();
    updateScoreboard();
    updatePlayersList();
    updateTimer(msg.timeRemaining);
    updateBrushPreview();
    updateAttackBadges();
    updateInkDisplay();

    if (gameState === 'waiting') {
        phaseLabel.textContent = 'WAITING (2v2)';
    } else if (gameState === 'countdown') {
        phaseLabel.textContent = 'STARTING';
    }

    setupCanvasEvents();
}

// ============================================
// CANVAS DRAWING
// ============================================

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCrystalZone();
    
    // Redraw all strokes from server state
    strokes.forEach(stroke => {
        drawStroke(stroke);
    });
}

function drawStroke(stroke) {
    ctx.beginPath();
    ctx.moveTo(stroke.x1, stroke.y1);
    ctx.lineTo(stroke.x2, stroke.y2);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function drawCrystalZone() {
    ctx.beginPath();
    ctx.arc(crystalPos.x, crystalPos.y, crystalPos.radius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function handleCollision(msg) {
    // Remove collided strokes from local store
    const removedIds = msg.removedIds || [];
    strokes = strokes.filter(s => !removedIds.includes(s.id));
    
    // Flash effect
    canvas.style.boxShadow = '0 0 40px rgba(255, 100, 100, 0.8)';
    setTimeout(() => {
        canvas.style.boxShadow = '';
    }, 200);
    
    // Redraw entire canvas to reflect removed strokes
    redrawCanvas();
}

// ============================================
// GAME PHASES
// ============================================

function handleCountdown(msg) {
    gameState = 'countdown';
    phaseLabel.textContent = 'STARTING IN';
    
    const count = msg.timeRemaining;
    timer.textContent = count;
    timer.classList.add('urgent');
    
    if (count >= 1 && count <= 5) {
        showAnnouncement('⏱️', String(count), 'Get ready!', 900);
    }
}

function handleCountdownCancelled(msg) {
    gameState = 'waiting';
    phaseLabel.textContent = 'WAITING (2v2)';
    timer.textContent = '--';
    timer.classList.remove('urgent');
    showAnnouncement('⚠️', 'CANCELLED', msg.reason || 'Waiting for players...', 2000);
}

function handlePhaseChange(msg) {
    gameState = msg.phase;
    
    if (msg.attackingTeam) {
        attackingTeam = msg.attackingTeam;
    }
    if (msg.round) {
        currentRound = msg.round;
        roundNum.textContent = currentRound;
    }
    if (msg.players) {
        players = msg.players;
        if (myId && players[myId]) {
            ink = players[myId].ink;
            updateInkDisplay();
        }
        updatePlayersList();
    }

    updateRoleDisplay();
    updateAttackBadges();
    timer.classList.remove('urgent');

    if (msg.phase === 'countdown') {
        phaseLabel.textContent = 'STARTING';
        showAnnouncement('👥', 'ALL PLAYERS JOINED', 'Game starting soon!', 2000);
    } else if (msg.phase === 'fortress') {
        phaseLabel.textContent = 'FORTRESS';
        const isDefender = (attackingTeam === 'red' && myTeam === 'blue') ||
                          (attackingTeam === 'blue' && myTeam === 'red');
        if (isDefender) {
            showAnnouncement('🏰', 'FORTRESS PHASE', 'Build your defenses!', 2000);
        } else {
            showAnnouncement('⏳', 'FORTRESS PHASE', 'Wait for battle...', 2000);
        }
    } else if (msg.phase === 'playing') {
        phaseLabel.textContent = 'BATTLE';
        showAnnouncement('⚔️', 'BATTLE!', 'Attack or defend the crystal!', 2000);
    }
}

function handleRoundEnd(msg) {
    scores = msg.scores;
    gameState = 'roundEnd';
    updateScoreboard();

    const winnerText = msg.winner.toUpperCase() + ' WINS';
    const icon = msg.winner === 'red' ? '⚔️' : '🛡️';
    showAnnouncement(icon, winnerText, `Score: ${scores.red} - ${scores.blue}`, 2500, msg.winner);

    // Clear local strokes and canvas for next round
    setTimeout(() => {
        strokes = [];
        redrawCanvas();
    }, 2500);
}

function handleGameOver(msg) {
    gameState = 'gameOver';
    const winnerText = msg.winner.toUpperCase() + ' VICTORY!';
    const icon = '👑';
    const isMyTeam = msg.winner === myTeam;
    const subText = isMyTeam ? 'Your team wins!' : 'Better luck next time!';

    showAnnouncement(icon, winnerText, subText, 4000, msg.winner);
}

function handleRoomReset(msg) {
    players = msg.players;
    scores = { red: 0, blue: 0 };
    currentRound = 0;
    gameState = 'waiting';
    ink = 100;
    strokes = [];

    redrawCanvas();

    updateScoreboard();
    updatePlayersList();
    updateInkDisplay();
    updateTimer(120);
    phaseLabel.textContent = 'WAITING (2v2)';
    roundNum.textContent = '0';
    timer.classList.remove('urgent');
}

// ============================================
// DRAWING INPUT
// ============================================

function setupCanvasEvents() {
    canvas.onmousedown = startDrawing;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDrawing;
    canvas.onmouseout = stopDrawing;

    canvas.ontouchstart = (e) => {
        e.preventDefault();
        startDrawing(e);
    };
    canvas.ontouchmove = (e) => {
        e.preventDefault();
        draw(e);
    };
    canvas.ontouchend = stopDrawing;
}

function startDrawing(e) {
    if (!canDraw()) return;
    isDrawing = true;
    [lastX, lastY] = getPos(e);
}

function draw(e) {
    if (!isDrawing || !canDraw()) return;

    const [x, y] = getPos(e);

    // Send stroke to server - DON'T draw locally, wait for server confirmation
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'draw',
            stroke: {
                x1: lastX,
                y1: lastY,
                x2: x,
                y2: y,
                size: brushSize
            }
        }));
    }

    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function canDraw() {
    if (gameState === 'waiting' || gameState === 'countdown' || gameState === 'roundEnd' || gameState === 'gameOver') {
        return false;
    }

    const isDefender = (attackingTeam === 'red' && myTeam === 'blue') ||
                       (attackingTeam === 'blue' && myTeam === 'red');

    if (gameState === 'fortress' && !isDefender) {
        return false;
    }

    return true;
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return [x, y];
}

// ============================================
// UI UPDATES
// ============================================

function updateRoleDisplay() {
    const isDefender = (attackingTeam === 'red' && myTeam === 'blue') ||
                       (attackingTeam === 'blue' && myTeam === 'red');

    if (isDefender) {
        roleIndicator.className = 'role-indicator defending';
        roleIcon.textContent = '🛡️';
        roleName.textContent = 'DEFENDING';
    } else {
        roleIndicator.className = 'role-indicator attacking';
        roleIcon.textContent = '⚔️';
        roleName.textContent = 'ATTACKING';
    }
}

function updateAttackBadges() {
    if (attackingTeam === 'red') {
        redAttackBadge.style.display = 'inline';
        blueAttackBadge.style.display = 'none';
    } else {
        redAttackBadge.style.display = 'none';
        blueAttackBadge.style.display = 'inline';
    }
}

function updateScoreboard() {
    redScore.textContent = scores.red;
    blueScore.textContent = scores.blue;
}

function updateTimer(seconds) {
    if (seconds === undefined || seconds === null) return;
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    if (seconds <= 10 && gameState === 'playing') {
        timer.classList.add('urgent');
    } else if (gameState !== 'countdown') {
        timer.classList.remove('urgent');
    }
}

function updateInkDisplay() {
    const inkPercent = Math.max(0, Math.min(100, ink));
    inkFill.style.width = inkPercent + '%';
    inkValue.textContent = Math.round(inkPercent) + '%';

    if (inkPercent < 20) {
        inkFill.classList.add('low');
    } else {
        inkFill.classList.remove('low');
    }
}

function flashInkWarning() {
    inkFill.classList.add('low');
    inkValue.style.color = '#ff6b6b';
    setTimeout(() => {
        inkValue.style.color = '';
    }, 300);
}

function updatePlayersList() {
    const redPlayers = [];
    const bluePlayers = [];

    Object.entries(players).forEach(([id, player]) => {
        const isMe = id === myId;
        const playerInk = player.ink !== undefined ? player.ink : 100;
        const html = `
            <div class="player-card ${isMe ? 'me' : ''}">
                <div class="player-avatar">${getInitials(player.username)}</div>
                <div class="player-name">${player.username}${isMe ? ' (you)' : ''}</div>
                <div class="player-ink">
                    <div class="player-ink-fill" style="width: ${playerInk}%"></div>
                </div>
            </div>
        `;

        if (player.team === 'red') {
            redPlayers.push(html);
        } else {
            bluePlayers.push(html);
        }
    });

    while (redPlayers.length < 2) {
        redPlayers.push('<div class="empty-slot">Waiting...</div>');
    }
    while (bluePlayers.length < 2) {
        bluePlayers.push('<div class="empty-slot">Waiting...</div>');
    }

    redTeamPlayers.innerHTML = redPlayers.join('');
    blueTeamPlayers.innerHTML = bluePlayers.join('');
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ============================================
// ANNOUNCEMENTS
// ============================================

function showAnnouncement(icon, text, subText, duration = 2000, colorClass = '') {
    announcementIcon.textContent = icon;
    announcementText.textContent = text;
    announcementText.className = 'announcement-text ' + colorClass;
    announcementSub.textContent = subText;

    announcement.classList.remove('hidden');

    setTimeout(() => {
        announcement.classList.add('hidden');
    }, duration);
}
