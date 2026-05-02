let canvas, ctx;
let particles = [];
let numParticles = 150;
const PI2 = Math.PI * 2;
let width = 0;
let height = 0;
let isCelebrating = false;
let isRunning = false;
let lastTime = 0;
let animationFrameId = null;

class Particle {
    constructor() {
        this.reset();
        this.y = Math.random() * height; // initial scatter
    }

    reset() {
        this.x = Math.random() * width;
        this.y = 0 - (Math.random() * 20);
        this.size = Math.random() * 3 + 1;
        
        // Base speeds
        this.baseSpeedY = Math.random() * 100 + 50; // pixels per second
        this.baseSpeedX = Math.random() * 50 - 25;  // pixels per second
        
        this.opacity = Math.random() * 0.5 + 0.3;
        this.color = '255, 255, 255';
        
        // Fireworks specific
        this.vx = 0;
        this.vy = 0;
        this.life = 1;
    }

    update(dt) {
        if (isCelebrating) {
            // Fireworks physics
            this.vy += 150 * dt; // gravity
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.life -= 0.5 * dt; // fade out
            this.opacity = Math.max(0, this.life);

            if (this.life <= 0 || this.y > height) {
                // Respawn as new explosion particle
                this.x = Math.random() * width;
                this.y = height;
                this.vx = (Math.random() - 0.5) * 800;
                this.vy = -(Math.random() * 600 + 400); // shoot up
                this.life = 1.5 + Math.random();
                this.color = `${Math.floor(Math.random()*255)}, ${Math.floor(Math.random()*255)}, 255`;
            }
        } else {
            // Snow physics (delta time applied)
            this.y += this.baseSpeedY * dt;
            this.x += this.baseSpeedX * dt;

            if (this.y > height) this.reset();
            if (this.x > width) this.x = 0;
            else if (this.x < 0) this.x = width;
        }
    }

    draw() {
        ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, PI2);
        ctx.fill();
    }
}

function initParticles() {
    particles = [];
    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
    }
}

function loop(timestamp) {
    if (!isRunning) return;
    
    // Calculate Delta Time in seconds
    const dt = (timestamp - lastTime) / 1000 || 0.016; 
    lastTime = timestamp;

    ctx.clearRect(0, 0, width, height);

    // Limit dt to prevent huge jumps if tab was suspended
    const cappedDt = Math.min(dt, 0.1);

    for (let i = 0; i < particles.length; i++) {
        particles[i].update(cappedDt);
        particles[i].draw();
    }

    animationFrameId = requestAnimationFrame(loop);
}

self.onmessage = function(e) {
    const { type, payload } = e.data;

    switch(type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d');
            width = payload.width;
            height = payload.height;
            initParticles();
            break;
        case 'RESIZE':
            width = payload.width;
            height = payload.height;
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
            }
            break;
        case 'START':
            if (!isRunning) {
                isRunning = true;
                lastTime = performance.now();
                animationFrameId = requestAnimationFrame(loop);
            }
            break;
        case 'STOP':
            isRunning = false;
            cancelAnimationFrame(animationFrameId);
            if (ctx) ctx.clearRect(0, 0, width, height);
            break;
        case 'CELEBRATE':
            isCelebrating = payload.isCelebrating;
            if (isCelebrating) {
                // Initialize fireworks instantly
                for(let p of particles) {
                    p.life = 0; // force respawn
                }
            } else {
                // Reset to snow
                for(let p of particles) p.reset();
            }
            break;
    }
};
