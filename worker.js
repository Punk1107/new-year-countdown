/**
 * New Year Countdown — worker.js
 * ─────────────────────────────────────────────────────────────
 * Off-main-thread particle system (Snow & Fireworks).
 */

const NUM_SNOW       = 130;
const NUM_FIREWORKS  = 100;
const PI2            = Math.PI * 2;

let canvas, ctx;
let width = 0, height = 0;
let particles = [];
let lastFrameTs = 0;
let rafId = 0;
let isRunning = false;
let snowOn = true;
let isCelebrating = false;

class Snow {
  constructor(scatter) {
    this.reset();
    if (scatter) this.y = Math.random() * height;
  }
  reset() {
    this.x     = Math.random() * width;
    this.y     = -(Math.random() * 20 + 5);
    this.r     = Math.random() * 2.2 + 0.8;
    this.vx    = (Math.random() - 0.5) * 35;   // px/s
    this.vy    = Math.random() * 70 + 35;       // px/s
    this.alpha = Math.random() * 0.4 + 0.22;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > height + 10) this.reset();
    if (this.x < -10)    this.x = width + 10;
    if (this.x > width + 10) this.x = -10;
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, PI2);
    ctx.fillStyle = `rgba(255,255,255,${this.alpha})`;
    ctx.fill();
  }
}

class Firework {
  constructor() { this.respawn(); }
  respawn() {
    this.x       = (0.2 + Math.random() * 0.6) * width;
    this.y       = height;
    this.vx      = (Math.random() - 0.5) * 500;
    this.vy      = -(Math.random() * 480 + 320);
    this.life    = 1.0 + Math.random() * 1.0;
    this.maxLife = this.life;
    this.r       = Math.random() * 2.5 + 1;
    this.hue     = Math.random() * 360;
  }
  update(dt) {
    this.vy += 260 * dt;
    this.vx *= Math.pow(0.98, dt * 60);
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.y > height + 20) this.respawn();
  }
  draw() {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, PI2);
    ctx.fillStyle = `hsla(${this.hue},100%,65%,${alpha})`;
    ctx.fill();
  }
}

function buildSnow() {
  particles = Array.from({ length: NUM_SNOW }, (_, i) => new Snow(i < NUM_SNOW * 0.8));
}

function buildFireworks() {
  particles = Array.from({ length: NUM_FIREWORKS }, () => new Firework());
}

function renderLoop(ts) {
  if (!isRunning) return;

  const dt = Math.min((ts - (lastFrameTs || ts)) / 1000, 0.1);
  lastFrameTs = ts;

  ctx.clearRect(0, 0, width, height);

  if (snowOn || isCelebrating) {
    for (const p of particles) {
      p.update(dt);
      p.draw();
    }
  }

  rafId = requestAnimationFrame(renderLoop);
}

self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch(type) {
    case 'INIT':
      canvas = payload.canvas;
      ctx = canvas.getContext('2d', { alpha: true });
      width = payload.width;
      height = payload.height;
      buildSnow();
      isRunning = true;
      rafId = requestAnimationFrame(renderLoop);
      break;

    case 'RESIZE':
      const scaleX = payload.width  / (width  || 1);
      const scaleY = payload.height / (height || 1);
      width = payload.width;
      height = payload.height;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      for (const p of particles) {
        p.x *= scaleX;
        p.y *= scaleY;
      }
      break;

    case 'TOGGLE_SNOW':
      snowOn = payload;
      if (!snowOn && !isCelebrating && ctx) {
        ctx.clearRect(0, 0, width, height);
      }
      break;

    case 'CELEBRATE':
      isCelebrating = payload;
      if (isCelebrating) {
        buildFireworks();
      } else {
        buildSnow();
      }
      break;

    case 'PAUSE':
      isRunning = false;
      cancelAnimationFrame(rafId);
      break;

    case 'RESUME':
      if (!isRunning) {
        isRunning = true;
        lastFrameTs = 0; // Reset to avoid dt spike
        rafId = requestAnimationFrame(renderLoop);
      }
      break;
  }
};
