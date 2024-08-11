const COLUMN_COUNT = 4;
const TILE_HEIGHT = 120;
const COLORS = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00'];
const melody = ['C4', 'E4', 'G4', 'C5', 'A4', 'F4', 'D4', 'B3', 'G4', 'B4', 'D5', 'G5', 'E5', 'C5', 'A4', 'F4'];
const DIFFICULTY_SETTINGS = {
    beginner: { speed: 2, name: 'Beginner' },
    easy: { speed: 4, name: 'Easy' },
    medium: { speed: 6, name: 'Medium' },
    hard: { speed: 8, name: 'Hard' },
    extreme: { speed: 16, name: 'Extreme' }
};

const elements = {
    gameBoard: document.getElementById('game-board'),
    background: document.getElementById('background'),
    scoreBar: document.getElementById('score-bar'),
    startBtn: document.getElementById('start-btn'),
    restartBtn: document.getElementById('restart-btn'),
    difficulty: document.getElementById('difficulty'),
    difficultySelect: document.getElementById('difficulty-select'),
    helpText: document.getElementById('help-text'),
    gameOverScreen: document.getElementById('game-over'),
    finalScoreSpan: document.getElementById('final-score'),
    bestScoreSpan: document.getElementById('best-score-value')
};

const ctx = elements.gameBoard.getContext('2d');
const ctxBackground = elements.background.getContext('2d');
const ctxScore = elements.scoreBar.getContext('2d');

let tiles = [];
let score = 0;
let gameSpeed;
let gameLoop;
let animationFrameId;
let countdownInProgress = false;
let isGameRunning = false;
let isMuted = false;
let soundEffects;
let synth;
let melodyIndex = 0;

const TILE_WIDTH = elements.gameBoard.width / COLUMN_COUNT;

const savedDifficulty = localStorage.getItem('difficulty') || 'easy';
elements.difficultySelect.value = savedDifficulty;

const bestScores = Object.fromEntries(
    Object.keys(DIFFICULTY_SETTINGS).map(difficulty => 
        [difficulty, localStorage.getItem(`highScore_${difficulty}`) || 0]
    )
);
elements.bestScoreSpan.textContent = bestScores[savedDifficulty];

function setupAudio() {
    synth = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 }
    }).toDestination();

    synth.volume.value = -6;

    soundEffects = {
        gameOver: new Tone.Synth({
            oscillator: { type: "square" },
            envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }
        }).toDestination(),
        newBestScore: new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }
        }).toDestination(),
    };

    soundEffects.gameOver.volume.value = -10;
    soundEffects.newBestScore.volume.value = -8;
}

function playNote(note) {
    if (Tone.context.state !== 'running') {
        Tone.start();
    }
    if (!isMuted) {
        synth.triggerAttackRelease(note, '8n');
    }
}

class Tile {
    constructor(column, order) {
        this.x = column * TILE_WIDTH;
        this.y = -TILE_HEIGHT;
        this.width = TILE_WIDTH;
        this.height = TILE_HEIGHT;
        this.order = order;
        this.column = column;
        this.clicked = false;
        this.clickAnimation = 0;
        this.clickStartTime = 0;
        this.hitZone = 10 * gameSpeed;
        this.note = melody[order % melody.length];
    }

    playSound() {
        playNote(this.note);
        melodyIndex = (melodyIndex + 1) % melody.length;
    }

    draw() {
        let fillColor;
        if (this.clicked) {
            const t = Math.min((Date.now() - this.clickStartTime) / (1200 / gameSpeed), 1);
            const opacity = 1 - 0.9 * t;
            fillColor = `rgba(255, 255, 255, ${opacity})`;
            this.clickAnimation = t;
        } else {
            fillColor = chroma(COLORS[this.column]).darken(4.5).alpha(0.8).hex();
        }
        
        const gradient = ctx.createRadialGradient(
            this.x + this.width / 2, this.y + this.height / 2, 0,
            this.x + this.width / 2, this.y + this.height / 2, this.width / 2
        );
        gradient.addColorStop(1, fillColor);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        ctx.strokeStyle = COLORS[this.column];
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }

    isClicked(x, y) {
        return x >= this.x && x < this.x + this.width &&
               y >= this.y - this.hitZone && y < this.y + this.height + this.hitZone;
    }
}

function updateScore() {
    ctxScore.clearRect(0, 0, elements.scoreBar.width, elements.scoreBar.height);
    ctxScore.fillStyle = 'white';
    ctxScore.font = 'bold 24px Orbitron, sans-serif';
    ctxScore.textAlign = 'center';
    ctxScore.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctxScore.shadowBlur = 10;
    ctxScore.fillText(`Score: ${score}`, elements.scoreBar.width / 2, elements.scoreBar.height / 2 + 10);
    ctxScore.shadowBlur = 0;
}

function generateTile() {
    const lastTile = tiles[tiles.length - 1];
    const lastOrder = lastTile ? lastTile.order : -1;
    let column;
    do {
        column = Math.floor(Math.random() * COLUMN_COUNT);
    } while (lastTile && lastTile.x === column * TILE_WIDTH);
    
    tiles.push(new Tile(column, lastOrder + 1));
}

function drawBackground() {
    const { width, height } = elements.background;
    const ctx = ctxBackground;
    
    ctx.fillStyle = ctx.createLinearGradient(0, 0, 0, height);
    ['#000033', '#330033', '#003333'].forEach((c, i) => ctx.fillStyle.addColorStop(i/2, c));
    ctx.fillRect(0, 0, width, height);
    
    const drawLines = (spacing, style, lineWidth, verticalOnly = false) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = lineWidth;
        for (let i = spacing; i < (verticalOnly ? width : Math.max(width, height)); i += spacing) {
            ctx.beginPath();
            if (!verticalOnly) {
                ctx.moveTo(0, i);
                ctx.lineTo(width, i);
            }
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
        }
    };

    drawLines(20, 'rgba(0, 255, 255, 0.2)', 1);
    drawLines(TILE_WIDTH, 'rgba(0, 255, 255, 0.5)', 2, true);
}

function startGame() {
    window.scrollTo({top: 0, behavior: 'smooth'})
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
    score = 0;
    tiles = [];
    
    const difficulty = elements.difficultySelect.value;
    localStorage.setItem('difficulty', difficulty);
    gameSpeed = DIFFICULTY_SETTINGS[difficulty].speed;
    
    elements.startBtn.classList.add('hidden');
    elements.gameOverScreen.classList.add('hidden');
    elements.difficulty.classList.add('hidden');
    elements.helpText.classList.add('hidden');
    cancelAnimationFrame(animationFrameId);
    setupAudio();
    showCountdown()
    melodyIndex = 0;
}

function endGame() {
    isGameRunning = false;
    clearInterval(gameLoop);
    
    const difficulty = elements.difficultySelect.value;
    const newBestScore = score > bestScores[difficulty];
    
    if (newBestScore) {
        bestScores[difficulty] = score;
        localStorage.setItem(`highScore_${difficulty}`, bestScores[difficulty]);
        elements.bestScoreSpan.textContent = bestScores[difficulty];
        soundEffects.newBestScore.triggerAttackRelease(['C5', 'E5', 'G5'], '8n');
        showNewBestScoreAlert();
    } else {
        soundEffects.gameOver.triggerAttackRelease('C2', '0.5n');
    }
    
    elements.finalScoreSpan.innerHTML = `<strong>${score}</strong>`;
    elements.gameOverScreen.classList.remove('hidden');
    setTimeout(startHelpIndicators, 30);
    setTimeout(() => {
        elements.difficulty.classList.remove('hidden');
        elements.helpText.classList.remove('hidden');
    }, 100);
}

function showNewBestScoreAlert() {
    const alertElement = document.createElement('div');
    alertElement.textContent = 'New Best Score!';
    alertElement.classList.add('new-best-score-alert');
    document.body.appendChild(alertElement);

    setTimeout(() => {
        document.body.removeChild(alertElement);
    }, 3000);
}

function updateGame() {
    ctx.clearRect(0, 0, elements.gameBoard.width, elements.gameBoard.height);
    
    tiles = tiles.filter(tile => !tile.clicked || tile.clickAnimation < 1);
    
    tiles.forEach((tile, index) => {
        tile.y += gameSpeed;
        tile.draw();
        
        if (tile.y > elements.gameBoard.height && !tile.clicked) {
            Tone.Transport.clear();
            endGame();
        }
    });
    
    if (tiles.length === 0 || tiles[tiles.length - 1].y > 0) {
        generateTile();
    }
    updateScore();
}

function handleTileClick(clickedTile) {
    if (!clickedTile) {
        endGame();
        return;
    }
    
    if (clickedTile.order === score && !clickedTile.clicked) {
        clickedTile.clicked = true;
        clickedTile.clickStartTime = Date.now();
        clickedTile.playSound();
        score++;
        gameSpeed += 0.05;
    } else if (!clickedTile.clicked) {
        endGame();
    }
}

function handleDifficultyChange() {
    const difficulty = elements.difficultySelect.value;
    localStorage.setItem('difficulty', difficulty);
    elements.bestScoreSpan.textContent = localStorage.getItem(`highScore_${difficulty}`) || 0;
    startGame();
}

function drawHelpIndicators() {
    if (isGameRunning) {
        cancelAnimationFrame(animationFrameId);
        return;
    }
    
    const helpText = ['A', 'S', 'D', 'F'];
    const y = elements.gameBoard.height - TILE_WIDTH;
    const currentTime = Date.now() / 500;
    
    ctx.save();
    ctx.clearRect(0, 0, elements.gameBoard.width, elements.gameBoard.height);
    tiles.forEach(tile => tile.draw());
    
    ctx.font = 'bold 24px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    helpText.forEach((text, i) => {
        const x = (i + 0.5) * TILE_WIDTH;
        const color = COLORS[i];
        
        ctx.fillStyle = chroma(color).darken(4).alpha(0.6).hex();
        ctx.beginPath();
        ctx.arc(x, y, TILE_WIDTH / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.fillText(text, x, y);
        
        ctx.globalAlpha = 0.5 + Math.sin(currentTime + i) * 0.5;
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, TILE_WIDTH / 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });
    ctx.restore();
    animationFrameId = requestAnimationFrame(drawHelpIndicators);
}

function startHelpIndicators() {
    if (!isGameRunning) {
        drawHelpIndicators();
        setTimeout(() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'}), 180);
    }
}

function showCountdown() {
    if (countdownInProgress) return;
    countdownInProgress = true;
    let count = 3;
    const countdownElement = document.createElement('div');
    countdownElement.classList.add('countdown');
    document.body.appendChild(countdownElement);
    ctx.clearRect(0, 0, elements.gameBoard.width, elements.gameBoard.height);
    const countdownInterval = setInterval(() => {
        if (count > 0) {
            countdownElement.textContent = count;
            playNote(`C${count+3}`);
            count--;
        } else {
            clearInterval(countdownInterval);
            document.body.removeChild(countdownElement);
            isGameRunning = true;
            gameLoop = setInterval(updateGame, 1000 / 60);
            countdownInProgress = false;
        }
    }, 350);
}

const muteBtn = document.getElementById('mute-btn');

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    Tone.Master.mute = isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
});

elements.gameBoard.addEventListener('click', (e) => {
    if (!isGameRunning) return;
    
    const rect = elements.gameBoard.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const sortedTiles = tiles.slice().sort((a, b) => b.y - a.y);
    
    const clickedTile = sortedTiles.find(tile => tile.isClicked(clickX, clickY) && !tile.clicked);
    
    handleTileClick(clickedTile);
});

document.addEventListener('keydown', (e) => {
    if (!isGameRunning) {
        if (e.key === 'Enter' || e.key === 'Tab' || e.key === ' ') {
            e.preventDefault();
            startGame();
        }
        return;
    }

    const columnMap = { 'a': 0, 's': 1, 'd': 2, 'f': 3 };
    const column = columnMap[e.key.toLowerCase()];
    
    if (column !== undefined) {
        const clickedTile = tiles.find(tile => tile.x === column * TILE_WIDTH && tile.y + tile.height > 0 && !tile.clicked);
        handleTileClick(clickedTile);
    }
});

elements.startBtn.addEventListener('click', startGame);
elements.restartBtn.addEventListener('click', () => !isGameRunning && startGame());
elements.difficultySelect.addEventListener('change', handleDifficultyChange);

updateScore();
drawBackground();
startHelpIndicators();