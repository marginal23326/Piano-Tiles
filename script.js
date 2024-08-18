const COLUMN_COUNT = 4, TILE_HEIGHT = 120;
const COLORS = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00'];
const DIFFICULTY_SETTINGS = {
    beginner: { speed: 2 }, easy: { speed: 4 }, medium: { speed: 6 },
    hard: { speed: 8 }, extreme: { speed: 16 }
};

const elements = Object.fromEntries(['gameBoard', 'background', 'scoreBar', 'startBtn', 'restartBtn', 'difficulty', 'difficultySelect', 'helpText', 'gameOverScreen', 'finalScoreSpan', 'bestScoreSpan', 'muteBtn'].map(id => [id, document.getElementById(id)]));
const [ctx, ctxBackground, ctxScore] = [elements.gameBoard, elements.background, elements.scoreBar].map(el => el.getContext('2d'));
const TILE_WIDTH = elements.gameBoard.width / COLUMN_COUNT;

let tiles = [], melodyIndex = score = 0, gameSpeed, gameLoop, animationFrameId, isGameRunning = isGameOver = isMuted = false, soundEffects, synth;

const savedDifficulty = localStorage.getItem('difficulty') || 'easy';
elements.difficultySelect.value = savedDifficulty;

const bestScores = Object.fromEntries(Object.keys(DIFFICULTY_SETTINGS).map(d => [d, localStorage.getItem(`highScore_${d}`) || 0]));
elements.bestScoreSpan.textContent = bestScores[savedDifficulty];

function setupAudio() {
    if (synth) synth.dispose();
    if (soundEffects) Object.values(soundEffects).forEach(effect => effect.dispose());

    synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 }}).toDestination();
    synth.volume.value = -10;

    soundEffects = {
        gameOver: new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 }}).toDestination(),
        newBestScore: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 }}).toDestination(),
    };

    soundEffects.gameOver.volume.value = -10;
    soundEffects.newBestScore.volume.value = -8;
}

const playNote = note => {
    if (Tone.context.state !== 'running') Tone.start();
    if (!isMuted) synth.triggerAttackRelease(note, '8n');
    melodyIndex = (melodyIndex + 1) % melody.length;
};

class Tile {
    constructor(column, order) {
        Object.assign(this, { x: column * TILE_WIDTH, y: -TILE_HEIGHT, width: TILE_WIDTH, height: TILE_HEIGHT, order, column, clicked: false, clickAnimation: 0, clickStartTime: 0, hitZone: 10 * gameSpeed, note: melody[order % melody.length] });
    }

    playSound() { playNote(this.note); melodyIndex = (melodyIndex + 1) % melody.length; }

    draw() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.width / 2);
        gradient.addColorStop(0, COLORS[this.column]);
        gradient.addColorStop(1, chroma(COLORS[this.column]).darken(2).hex());
        
        ctx.fillStyle = this.clicked 
            ? `rgba(255, 255, 255, ${1 - (this.clickAnimation = Math.min((Date.now() - this.clickStartTime) / (1200 / gameSpeed), 1))})`
            : gradient;
        
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, 10);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    isClicked(x, y) { return x >= this.x && x < this.x + this.width && y >= this.y - this.hitZone && y < this.y + this.height + this.hitZone; }
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

function generateTile(isInitial = false, i = 0) {
    const lastTile = tiles[tiles.length - 1];
    let column;
    do { column = Math.floor(Math.random() * COLUMN_COUNT); } while (lastTile && lastTile.column === column);
    const tile = new Tile(column, lastTile ? lastTile.order + 1 : i);
    tile.y = isInitial ? elements.gameBoard.height - TILE_HEIGHT * (i + 2) : -TILE_HEIGHT;
    tiles.push(tile);
}

function drawBackground() {
    const { width, height } = elements.background;
    const gradient = ctxBackground.createLinearGradient(0, 0, width, height);
    [['#1a1a2e', 0], ['#16213e', 0.5], ['#0f3460', 1]].forEach(([color, stop]) => gradient.addColorStop(stop, color));
    ctxBackground.fillStyle = gradient;
    ctxBackground.fillRect(0, 0, width, height);
    
    for (let i = 0; i < 100; i++) {
        ctxBackground.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5})`;
        ctxBackground.beginPath();
        ctxBackground.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI * 2);
        ctxBackground.fill();
    }

    ctxBackground.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctxBackground.lineWidth = 2;
    for (let i = TILE_WIDTH; i < width; i += TILE_WIDTH) {
        ctxBackground.stroke(new Path2D(`M${i} 0 V${height}`));
    }
}

function startGame() {
    window.scrollTo({top: 0, behavior: 'smooth'});
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    [score, tiles, isGameOver, isGameRunning] = [0, [], false, false];
    const difficulty = elements.difficultySelect.value;
    localStorage.setItem('difficulty', difficulty);
    gameSpeed = DIFFICULTY_SETTINGS[difficulty].speed;
    ['startBtn', 'gameOverScreen', 'difficulty', 'helpText'].forEach(el => elements[el].classList.add('hidden'));
    cancelAnimationFrame(animationFrameId);
    setupAudio();
    for (let i = 0; i < 5; i++) generateTile(true, i);
    melodyIndex = 0;
    updateGame();
}

function endGame() {
    isGameRunning = false;
    isGameOver = true;
    cancelAnimationFrame(animationFrameId);
    const difficulty = elements.difficultySelect.value;
    const newBestScore = score > bestScores[difficulty];
    if (newBestScore) {
        bestScores[difficulty] = score;
        localStorage.setItem(`highScore_${difficulty}`, bestScores[difficulty]);
        elements.bestScoreSpan.textContent = bestScores[difficulty];
        soundEffects.newBestScore.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], '4n');
        showNewBestScoreAlert();
    } else {
        soundEffects.gameOver.triggerAttackRelease('C3', '4n');
    }
    elements.finalScoreSpan.innerHTML = `<strong>${score}</strong>`;
    elements.gameOverScreen.classList.remove('hidden');
    setTimeout(startHelpIndicators, 30);
    setTimeout(() => ['difficulty', 'helpText'].forEach(el => elements[el].classList.remove('hidden')), 100);
}

function showNewBestScoreAlert() {
    const alertElement = document.createElement('div');
    alertElement.textContent = 'New Best Score!';
    alertElement.classList.add('new-best-score-alert');
    document.body.appendChild(alertElement);
    setTimeout(() => document.body.removeChild(alertElement), 3000);
}

function updateGame() {
    if (isGameOver) return;
    ctx.clearRect(0, 0, elements.gameBoard.width, elements.gameBoard.height);
    tiles = tiles.filter(tile => !tile.clicked || tile.clickAnimation < 1);
    tiles.forEach((tile, index) => {
        if (isGameRunning) tile.y += gameSpeed;
        tile.draw();
        if (tile.y > elements.gameBoard.height && !tile.clicked) { endGame(); return; }
    });
    if (tiles.length === 0 || tiles[tiles.length - 1].y > 0) generateTile();
    updateScore();
    animationFrameId = requestAnimationFrame(updateGame);
}

function handleTileClick(tile) {
    if (isGameOver || !tile || tile.order !== score) return isGameRunning && endGame();
    isGameRunning = tile.clicked = true;
    tile.clickStartTime = Date.now();
    tile.playSound();
    score++, gameSpeed += 0.05;
}

function handleDifficultyChange() {
    const difficulty = elements.difficultySelect.value;
    localStorage.setItem('difficulty', difficulty);
    elements.bestScoreSpan.textContent = localStorage.getItem(`highScore_${difficulty}`) || 0;
    startGame();
}

function drawHelpIndicators() {
    if (isGameRunning) { cancelAnimationFrame(animationFrameId); return; }
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

elements.muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    Tone.Master.mute = isMuted;
    elements.muteBtn.textContent = isMuted ? '🔇' : '🔊';
});

elements.gameBoard.addEventListener('click', (e) => {
    const rect = elements.gameBoard.getBoundingClientRect();
    const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
    const clickedTile = tiles.slice().sort((a, b) => b.y - a.y).find(tile => tile.isClicked(clickX, clickY) && !tile.clicked);
    handleTileClick(clickedTile);
});

document.addEventListener('keydown', (e) => {
    const columnMap = { 'a': 0, 's': 1, 'd': 2, 'f': 3 };
    const column = columnMap[e.key.toLowerCase()];
    if (column !== undefined) {
        const clickedTile = tiles.find(tile => tile.x === column * TILE_WIDTH && tile.y + tile.height > 0 && !tile.clicked);
        handleTileClick(clickedTile);
    } else if (['Enter', 'Tab', ' '].includes(e.key)) {
        e.preventDefault();
        if (!isGameRunning) startGame();
    }
});

elements.startBtn.addEventListener('click', startGame);
elements.restartBtn.addEventListener('click', () => !isGameRunning && startGame());
elements.difficultySelect.addEventListener('change', handleDifficultyChange);

updateScore();
drawBackground();
startHelpIndicators();