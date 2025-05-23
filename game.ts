// Game constants
const PLAYER_SIZE = 20;
const ENEMY_SIZE = 20;
const COIN_SIZE = 10;
const PLAYER_SPEED = 5;
const ENEMY_SPEED = {
    RED: 4,
    ORANGE: 2.5,
    PURPLE: 3
};
const SHAKE_INTENSITY = 3;
const COIN_LIFETIME = 3000; // 3 seconds
const ENEMY_ACTIVATION_TIME = 2000; // 2 seconds

// Game state
type GameState = 'menu' | 'playing' | 'gameOver';

// Entity types
type Entity = {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
};

type Player = Entity & {
    speed: number;
};

type Enemy = Entity & {
    type: 'RED' | 'ORANGE' | 'PURPLE';
    speed: number;
    dx: number;
    dy: number;
    activationTime: number;
    isActive: boolean;
};

type Coin = Entity & {
    spawnTime: number;
    isActive: boolean;
};

// Game class
class ColorChaseGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private startButton: HTMLButtonElement;
    private scoreDisplay: HTMLSpanElement;
    private highScoreDisplay: HTMLSpanElement;
    
    private state: GameState = 'menu';
    private player: Player;
    private enemies: Enemy[] = [];
    private coin: Coin;
    private score: number = 0;
    private highScore: number = 0;
    private keys: { [key: string]: boolean } = {};
    private animationFrameId: number | null = null;
    private lastTimestamp: number = 0;
    private enemySpawnInterval: number = 0;
    private gameOverTextVisible: boolean = false;
    
    private isMobile: boolean = false;
    private beta: number = 0; // left/right tilt
    private gamma: number = 0; // front/back tilt
    private tiltDot: HTMLElement | null = null;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.startButton = document.getElementById('startButton') as HTMLButtonElement;
        this.scoreDisplay = document.getElementById('score') as HTMLSpanElement;
        this.highScoreDisplay = document.getElementById('high-score') as HTMLSpanElement;
        
        // Initialize game elements
        this.initEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        // Load high score from localStorage
        this.highScore = parseInt(localStorage.getItem('highScore') || '0');
        this.highScoreDisplay.textContent = this.highScore.toString();
        
        this.detectMobile();
        this.setupGyroControls();
        this.tiltDot = document.querySelector('.tilt-dot');
        // Start game loop
        this.gameLoop(0);
    }
    
    private detectMobile(): void {
        this.isMobile = (('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0));
    }

    private setupGyroControls(): void {
        if (!this.isMobile) return;
    
        // Request permission for iOS 13+ devices
        if (window.DeviceOrientationEvent && 
            typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            const requestPermissionButton = document.createElement('button');
            requestPermissionButton.textContent = 'Enable Tilt Controls';
            requestPermissionButton.classList.add('gyro-permission-btn');
            document.querySelector('.controls')?.appendChild(requestPermissionButton);
            
            requestPermissionButton.addEventListener('click', () => {
                (DeviceOrientationEvent as any).requestPermission()
                    .then((response: string) => {
                        if (response === 'granted') {
                            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                            requestPermissionButton.remove();
                        }
                    });
            });
        } else {
            // For non-iOS devices
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
        }
    }

    private handleOrientation(event: DeviceOrientationEvent): void {
        this.beta = event.beta || 0;  // -180 to 180 (left/right tilt)
        this.gamma = event.gamma || 0; // -90 to 90 (front/back tilt)
        
        // Update the visual indicator
        if (this.tiltDot) {
            const maxMovement = 50;
            const x = Math.max(-maxMovement, Math.min(maxMovement, this.gamma * 2));
            const y = Math.max(-maxMovement, Math.min(maxMovement, (this.beta - 20) * 2));
            
            this.tiltDot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        }
    }

    private initEventListeners(): void {
        window.addEventListener('resize', this.resizeCanvas.bind(this));
        this.startButton.addEventListener('click', this.handleStartButton.bind(this));
        
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }
    
    private resizeCanvas(): void {
        const container = document.querySelector('.canvas-container') as HTMLElement;
        if (!container) return;
    
        // Get display size (CSS pixels)
        const displayWidth = container.clientWidth;
        const displayHeight = container.clientHeight;
    
        // Set CSS display size
        this.canvas.style.width = `${displayWidth}px`;
        this.canvas.style.height = `${displayHeight}px`;
    
        // Set internal size (scaled for sharpness)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(displayWidth * dpr);
        this.canvas.height = Math.floor(displayHeight * dpr);
    
        // Scale the drawing context
        this.ctx.scale(dpr, dpr);
    
        // Redraw if game is running
        if (this.state === 'playing') this.render();
    }
    
    private handleStartButton(): void {
        this.resetGame(); // clean up first
        this.startGame();
        this.startButton.textContent = 'RESTART';
        this.gameOverTextVisible = false;
    }
    
    private startGame(): void {
        // Only start if we're not already playing
        if (this.state === 'playing') return;
        
        this.state = 'playing';
        this.score = 0;
        this.scoreDisplay.textContent = '0';
        
        // Create player
        this.player = {
            x: this.canvas.width / 2 - PLAYER_SIZE / 2,
            y: this.canvas.height / 2 - PLAYER_SIZE / 2,
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
            color: '#00a2ff',
            speed: PLAYER_SPEED
        };
        
        // Create initial enemies
        this.spawnEnemies(2);
        
        // Spawn first coin
        this.spawnCoin();
    }
    
    private resetGame(): void {
        // Clear any existing game state
        this.enemies = [];
        this.score = 0;
        this.scoreDisplay.textContent = '0';
        this.state = 'menu';
        this.gameOverTextVisible = false;
        
        // Clear any pending animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Restart the game loop
        this.lastTimestamp = 0;
        this.gameLoop(0);
    }
    
    private spawnEnemies(count: number): void {
        const enemyTypes: ('RED' | 'ORANGE' | 'PURPLE')[] = ['RED', 'ORANGE', 'PURPLE'];
        
        for (let i = 0; i < count; i++) {
            // Choose random enemy type
            const type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
            
            // Spawn in corners
            let x, y;
            if (i % 2 === 0) {
                x = 20;
                y = 20;
            } else {
                x = this.canvas.width - ENEMY_SIZE - 20;
                y = this.canvas.height - ENEMY_SIZE - 20;
            }
            
            // Random direction
            const angle = Math.random() * Math.PI * 2;
            
            this.enemies.push({
                x,
                y,
                width: ENEMY_SIZE,
                height: ENEMY_SIZE,
                color: this.getEnemyColor(type),
                type,
                speed: ENEMY_SPEED[type],
                dx: Math.cos(angle),
                dy: Math.sin(angle),
                activationTime: Date.now() + ENEMY_ACTIVATION_TIME,
                isActive: false
            });
        }
    }
    
    private getEnemyColor(type: 'RED' | 'ORANGE' | 'PURPLE'): string {
        switch (type) {
            case 'RED': return '#e74c3c';
            case 'ORANGE': return '#e67e22';
            case 'PURPLE': return '#9b59b6';
            default: return '#000000';
        }
    }
    
    private spawnCoin(): void {
        this.coin = {
            x: Math.random() * (this.canvas.width - COIN_SIZE),
            y: Math.random() * (this.canvas.height - COIN_SIZE),
            width: COIN_SIZE,
            height: COIN_SIZE,
            color: '#f1c40f',
            spawnTime: Date.now(),
            isActive: true
        };
    }
    
    private update(deltaTime: number): void {
        if (this.state !== 'playing') return; // freeze the game when not in playing
        
        // Rest of the update logic remains the same
        this.updatePlayer(deltaTime);
        this.updateEnemies(deltaTime);
        this.updateCoin();
        this.checkCollisions();
        
        if (this.score > 0 && this.score % 5 === 0 && this.enemies.length < this.score / 5 + 2) {
            this.spawnEnemies(1);
        }
    }
    
    private updatePlayer(deltaTime: number): void {
        const speed = this.player.speed * (deltaTime / 16);
        const dpr = window.devicePixelRatio || 1;
        const canvasWidth = this.canvas.width / dpr;
        const canvasHeight = this.canvas.height / dpr;
        
        if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) {
            this.player.y = Math.max(0, this.player.y - speed);
        }
        if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) {
            this.player.y = Math.min(this.canvas.height - this.player.height, this.player.y + speed);
        }
        if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
            this.player.x = Math.max(0, this.player.x - speed);
        }
        if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
            this.player.x = Math.min(this.canvas.width - this.player.width, this.player.x + speed);
        }

        // Gyroscope controls (mobile)
        if (this.isMobile && (this.beta !== 0 || this.gamma !== 0)) {
            const sensitivity = 0.5;
            const maxTilt = 30; // degrees
            
            // Vertical movement (beta)
            if (Math.abs(this.beta) > 10) { // dead zone
                const verticalRatio = Math.min(1, Math.abs(this.beta - 20) / maxTilt);
                const verticalDirection = this.beta > 20 ? 1 : -1;
                this.player.y = Math.max(0, 
                    Math.min(this.canvas.height - this.player.height, 
                    this.player.y + (speed * verticalRatio * verticalDirection * sensitivity)));
            }
            
            // Horizontal movement (gamma)
            if (Math.abs(this.gamma) > 10) { // dead zone
                const horizontalRatio = Math.min(1, Math.abs(this.gamma) / maxTilt);
                const horizontalDirection = this.gamma > 0 ? 1 : -1;
                this.player.x = Math.max(0, 
                    Math.min(this.canvas.width - this.player.width, 
                    this.player.x + (speed * horizontalRatio * horizontalDirection * sensitivity)));
            }
        }
    }
    
    private updateEnemies(deltaTime: number): void {
        const now = Date.now();
        
        for (const enemy of this.enemies) {
            // Activate enemy if time has come
            if (!enemy.isActive && now >= enemy.activationTime) {
                enemy.isActive = true;
            }
            
            if (!enemy.isActive) continue;
            
            const speed = enemy.speed * (deltaTime / 16);
            
            // Different behavior based on enemy type
            switch (enemy.type) {
                case 'RED':
                    // Random movement
                    if (Math.random() < 0.02) {
                        const angle = Math.random() * Math.PI * 2;
                        enemy.dx = Math.cos(angle);
                        enemy.dy = Math.sin(angle);
                    }
                    break;
                    
                case 'ORANGE':
                    // Follow player
                    const dx = this.player.x - enemy.x;
                    const dy = this.player.y - enemy.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                        enemy.dx = dx / dist;
                        enemy.dy = dy / dist;
                    }
                    break;
                    
                case 'PURPLE':
                    // Shake movement
                    enemy.dx += (Math.random() - 0.5) * 0.2;
                    enemy.dy += (Math.random() - 0.5) * 0.2;
                    
                    // Normalize direction
                    const len = Math.sqrt(enemy.dx * enemy.dx + enemy.dy * enemy.dy);
                    if (len > 0) {
                        enemy.dx /= len;
                        enemy.dy /= len;
                    }
                    break;
            }
            
            // Move enemy
            enemy.x += enemy.dx * speed;
            enemy.y += enemy.dy * speed;
            
            // Bounce off walls
            if (enemy.x <= 0 || enemy.x >= this.canvas.width - enemy.width) {
                enemy.dx *= -1;
                enemy.x = Math.max(0, Math.min(this.canvas.width - enemy.width, enemy.x));
            }
            
            if (enemy.y <= 0 || enemy.y >= this.canvas.height - enemy.height) {
                enemy.dy *= -1;
                enemy.y = Math.max(0, Math.min(this.canvas.height - enemy.height, enemy.y));
            }
        }
    }
    
    private updateCoin(): void {
        const now = Date.now();
        
        // Check if coin expired
        if (this.coin.isActive && now - this.coin.spawnTime > COIN_LIFETIME) {
            this.coin.isActive = false;
            this.spawnCoin();
        }
    }
    
    private checkCollisions(): void {
        // Check coin collection
        if (this.coin.isActive && this.checkCollision(this.player, this.coin)) {
            this.score++;
            this.scoreDisplay.textContent = this.score.toString();
            
            if (this.score > this.highScore) {
                this.highScore = this.score;
                this.highScoreDisplay.textContent = this.highScore.toString();
                localStorage.setItem('highScore', this.highScore.toString());
            }
            
            this.coin.isActive = false;
            this.spawnCoin();
        }
        
        // Check enemy collisions
        for (const enemy of this.enemies) {
            if (enemy.isActive && this.checkCollision(this.player, enemy)) {
                this.state = 'gameOver';
                this.gameOverTextVisible = true;
                this.startButton.textContent = 'RESTART';
                break;
            }
        }
    }
    
    private checkCollision(a: Entity, b: Entity): boolean {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    }
    
    private render(): void {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.state === 'playing') {
            // Draw game elements normally
            this.drawEntity(this.player);
            
            for (const enemy of this.enemies) {
                if (!enemy.isActive) {
                    const timeLeft = enemy.activationTime - Date.now();
                    if (Math.floor(timeLeft / 100) % 2 === 0) {
                        continue;
                    }
                }
                this.drawEntity(enemy);
            }
            
            if (this.coin.isActive) {
                this.drawEntity(this.coin);
                const timeLeft = COIN_LIFETIME - (Date.now() - this.coin.spawnTime);
                const radius = COIN_SIZE / 2;
                const centerX = this.coin.x + radius;
                const centerY = this.coin.y + radius;
                
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2 * (timeLeft / COIN_LIFETIME));
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
        }
        
        // Draw game over text if needed
        if (this.gameOverTextVisible) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.font = '48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 40);
            
            this.ctx.fillStyle = '#ecf0f1';
            this.ctx.font = '24px Arial';
            this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
        }
    }
    
    
    private drawEntity(entity: Entity): void {
        this.ctx.fillStyle = entity.color;
        this.ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
    }
    
    private gameLoop(timestamp: number): void {
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        
        this.update(deltaTime);
        this.render();
        
        this.animationFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new ColorChaseGame();
});
