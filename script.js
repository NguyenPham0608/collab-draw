// ============================================
// CONFIGURATION
// ============================================
const WS_URL = 'wss://collab-draw-backend-86k5.onrender.com';
// ============================================

// Elements
const modalOverlay = document.getElementById('modalOverlay');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const brushPreview = document.getElementById('brushPreview');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const colorBtns = document.querySelectorAll('.color-btn');
const usersList = document.getElementById('usersList');
const userCount = document.getElementById('userCount');

// State
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#1a1a2e';
let currentSize = 5;
let ws;
let myId = null;
let myUsername = '';
let users = {};

// Color palette for user avatars
const avatarColors = [
    '#667eea', '#764ba2', '#ff6b6b', '#4ecdc4', '#45b7d1',
    '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#00b894'
];

function getAvatarColor(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Initialize
updateBrushPreview();
usernameInput.focus();

// Join button
joinBtn.addEventListener('click', joinRoom);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameInput.focus();
        return;
    }
    myUsername = name;
    modalOverlay.classList.add('hidden');
    app.classList.add('visible');
    connectWebSocket();
}

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';

        // Send join message with username
        ws.send(JSON.stringify({
            type: 'join',
            username: myUsername,
            color: currentColor
        }));
    };

    ws.onclose = () => {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Reconnecting...';
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
        statusText.textContent = 'Connection error';
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'init') {
            myId = msg.id;
            users = msg.users;
            updateUsersList();
        }

        if (msg.type === 'history') {
            msg.strokes.forEach(stroke => drawStroke(stroke));
        }

        if (msg.type === 'userJoined') {
            users[msg.id] = { username: msg.username, color: msg.color };
            updateUsersList();
        }

        if (msg.type === 'userLeft') {
            delete users[msg.id];
            updateUsersList();
        }

        if (msg.type === 'userColorChanged') {
            if (users[msg.id]) {
                users[msg.id].color = msg.color;
                updateUsersList();
            }
        }

        if (msg.type === 'draw') {
            drawStroke(msg.stroke);
        }

        if (msg.type === 'clear') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
}

function updateUsersList() {
    const ids = Object.keys(users);
    userCount.textContent = ids.length;

    usersList.innerHTML = ids.map(id => {
        const user = users[id];
        const isMe = id === myId;
        const avatarColor = getAvatarColor(id);

        return `
                    <div class="user-item ${isMe ? 'me' : ''}">
                        <div class="user-avatar shine" style="background: ${avatarColor}">
                            ${getInitials(user.username)}
                        </div>
                        <div class="user-info">
                            <div class="user-name">${user.username}${isMe ? ' (you)' : ''}</div>
                            <div class="user-status">Drawing</div>
                        </div>
                        <div class="user-color-dot" style="background: ${user.color}"></div>
                    </div>
                `;
    }).join('');
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

function sendStroke(x1, y1, x2, y2) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'draw',
            stroke: {
                x1, y1, x2, y2,
                color: currentColor,
                size: currentSize
            }
        }));
    }
}

// Drawing events
function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = getPos(e);
}

function draw(e) {
    if (!isDrawing) return;

    const [x, y] = getPos(e);

    drawStroke({
        x1: lastX, y1: lastY,
        x2: x, y2: y,
        color: currentColor,
        size: currentSize
    });

    sendStroke(lastX, lastY, x, y);
    [lastX, lastY] = [x, y];
}

function stopDrawing() {
    isDrawing = false;
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * scaleX;
    const y = ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top) * scaleY;
    return [x, y];
}

// Mouse events
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Touch events
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e);
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
});
canvas.addEventListener('touchend', stopDrawing);

// Color buttons
colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
        colorPicker.value = currentColor;
        updateBrushPreview();
        sendColorChange();
    });
});

// Color picker
colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    colorBtns.forEach(b => b.classList.remove('active'));
    updateBrushPreview();
    sendColorChange();
});

function sendColorChange() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'colorChange',
            color: currentColor
        }));
    }
}

// Brush size
brushSize.addEventListener('input', (e) => {
    currentSize = parseInt(e.target.value);
    updateBrushPreview();
});

function updateBrushPreview() {
    const size = Math.max(4, currentSize);
    brushPreview.style.width = size + 'px';
    brushPreview.style.height = size + 'px';
    brushPreview.style.background = currentColor;
}

// Clear button
clearBtn.addEventListener('click', () => {
    if (confirm('Clear the entire canvas for everyone?')) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'clear' }));
        }
    }
});

// Download button
downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'collab-draw.png';
    link.href = canvas.toDataURL();
    link.click();
});