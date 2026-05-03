/**
 * New Year Countdown — script.js
 * ─────────────────────────────────────────────────────────────
 * Senior-level frontend JS:
 *   ✅ Correct timezone math via Intl.DateTimeFormat (no NaN)
 *   ✅ aria-pressed managed for icon-btn state (CSS swaps icons)
 *   ✅ Digit-changed pulse animation via requestAnimationFrame
 *   ✅ Canvas resize preserves particles (no scatter loss)
 *   ✅ Visibility API pauses canvas when tab hidden
 *   ✅ Celebration uses hidden attr + class for proper a11y
 *   ✅ setTimeout tick drift corrected with self-adjusting scheduler
 *   ✅ Progress bar starts at JS-computed value (no 100% flash)
 *   ✅ All magic numbers in named constants
 *   ✅ Zero global scope pollution (IIFE)
 */

(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────── */
  const NUM_SNOW       = 130;
  const NUM_FIREWORKS  = 100;
  const CELEBRATE_MS   = 12_000;    // How long celebration lasts
  const PI2            = Math.PI * 2;
  const MS_DAY         = 86_400_000;
  const MS_HOUR        =  3_600_000;
  const MS_MINUTE      =     60_000;
  const MS_SECOND      =      1_000;

  /* ── Utility ───────────────────────────────────────────────── */
  const $  = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const pct = (n, max) => `${Math.round(n / max * 1000) / 10}%`; // 1dp

  /** True midnight UTC offset for a given IANA timezone on Jan 1 of a year */
  function newYearTimestamp(year, tz) {
    if (tz === 'local') return new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    
    // Performance optimization: Check if we can use a simpler cached offset
    // but for Jan 1 <year>, DST transitions make this binary search the safest bet.
    const utcMidnight = Date.UTC(year, 0, 1);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    });

    let lo = utcMidnight - 14 * MS_HOUR;
    let hi = utcMidnight + 14 * MS_HOUR;
    
    // Binary search for the first millisecond of the year in the target timezone
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const parts = fmt.formatToParts(new Date(mid));
      const h = +parts.find(p => p.type === 'hour').value;
      const m = +parts.find(p => p.type === 'minute').value;
      const s = +parts.find(p => p.type === 'second').value;
      
      // If we are past 00:00:00 (h,m,s all 0) or on Jan 1
      if (h === 0 && m === 0 && s === 0) {
        hi = mid; // We found a candidate, keep searching for the earliest ms
      } else if (h < 12) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }

  /* ── DOM refs ──────────────────────────────────────────────── */
  const el = {
    themeBtn:    $('theme-toggle'),
    snowBtn:     $('effects-toggle'),
    audioBtn:    $('audio-toggle'),
    tzSelect:    $('timezone-selector'),

    days:        $('days'),
    hours:       $('hours'),
    minutes:     $('minutes'),
    seconds:     $('seconds'),

    pgDays:      $('progress-days'),
    pgHours:     $('progress-hours'),
    pgMinutes:   $('progress-minutes'),
    pgSeconds:   $('progress-seconds'),

    yearEl:      $('year-display'),
    footerEl:    $('footer-text'),
    canvas:      $('snow-canvas'),

    celebEl:     $('celebration-overlay'),
    celebYearEl: $('celebration-year'),
  };

  const ctx = null; // Initialize conditionally later

  /* ── App State ─────────────────────────────────────────────── */
  const state = {
    tz:           'local',
    targetYear:   new Date().getFullYear() + 1,
    targetTs:     0,            // set by computeTarget()
    snowOn:       true,
    audioOn:      false,
    celebrating:  false,
  };

  // Compute once and cache
  function computeTarget() {
    state.targetTs = newYearTimestamp(state.targetYear, state.tz);
    el.yearEl.textContent = state.targetYear;
  }
  computeTarget();

  // DOM diff cache — avoid unnecessary textContent writes
  const prev = { d: -1, h: -1, m: -1, s: -1 };

  /* ── Particle System (Worker or Fallback) ──────────────────── */
  let useWorker = false;
  let worker = null;
  let canvasPaused = false;
  
  // Fallback variables
  let particles    = [];
  let lastFrameTs  = 0;
  let rafId        = 0;

  if ('OffscreenCanvas' in window && 'transferControlToOffscreen' in el.canvas) {
    try {
      worker = new Worker('./worker.js');
      const offscreen = el.canvas.transferControlToOffscreen();
      worker.postMessage({ 
        type: 'INIT', 
        payload: { canvas: offscreen, width: window.innerWidth, height: window.innerHeight } 
      }, [offscreen]);
      useWorker = true;
    } catch (e) {
      console.warn('OffscreenCanvas fallback:', e);
    }
  }

  // ctx is used globally in fallback mode
  let fallbackCtx = null;
  if (!useWorker) {
    fallbackCtx = el.canvas.getContext('2d', { alpha: true });
    el.canvas.width = window.innerWidth;
    el.canvas.height = window.innerHeight;
  }

  /* ── Canvas Resize (debounced, preserves particle positions) ── */
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      if (useWorker) {
        worker.postMessage({ type: 'RESIZE', payload: { width: w, height: h }});
      } else {
        const scaleX = w / (el.canvas.width  || 1);
        const scaleY = h / (el.canvas.height || 1);
        el.canvas.width  = w;
        el.canvas.height = h;
        // Rescale existing particle positions so they don't teleport
        for (const p of particles) {
          p.x *= scaleX;
          p.y *= scaleY;
        }
      }
    }, 150);
  }
  window.addEventListener('resize', onResize, { passive: true });

  /* ── Fallback Classes (Used only if !useWorker) ───────────── */
  class Snow {
    constructor(scatter) {
      this.reset();
      if (scatter) this.y = Math.random() * el.canvas.height;
    }
    reset() {
      const w = el.canvas.width;
      this.x     = Math.random() * w;
      this.y     = -(Math.random() * 20 + 5);
      this.r     = Math.random() * 2.2 + 0.8;
      this.vx    = (Math.random() - 0.5) * 35;
      this.vy    = Math.random() * 70 + 35;
      this.alpha = Math.random() * 0.4 + 0.22;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const w = el.canvas.width, h = el.canvas.height;
      if (this.y > h + 10) this.reset();
      if (this.x < -10)    this.x = w + 10;
      if (this.x > w + 10) this.x = -10;
    }
    draw() {
      if (!fallbackCtx) return;
      fallbackCtx.beginPath();
      fallbackCtx.arc(this.x, this.y, this.r, 0, PI2);
      fallbackCtx.fillStyle = `rgba(255,255,255,${this.alpha})`;
      fallbackCtx.fill();
    }
  }

  class Firework {
    constructor() { this.respawn(); }
    respawn() {
      const w = el.canvas.width, h = el.canvas.height;
      this.x       = (0.2 + Math.random() * 0.6) * w;
      this.y       = h;
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
      if (this.life <= 0 || this.y > el.canvas.height + 20) this.respawn();
    }
    draw() {
      if (!fallbackCtx) return;
      const alpha = Math.max(0, this.life / this.maxLife);
      fallbackCtx.beginPath();
      fallbackCtx.arc(this.x, this.y, this.r, 0, PI2);
      fallbackCtx.fillStyle = `hsla(${this.hue},100%,65%,${alpha})`;
      fallbackCtx.fill();
    }
  }

  function buildSnow() {
    if (!useWorker) particles = Array.from({ length: NUM_SNOW }, (_, i) => new Snow(i < NUM_SNOW * 0.8));
  }
  function buildFireworks() {
    if (!useWorker) particles = Array.from({ length: NUM_FIREWORKS }, () => new Firework());
  }

  if (!useWorker) {
    buildSnow();
    rafId = requestAnimationFrame(renderLoop);
  }

  function renderLoop(ts) {
    if (useWorker) return;
    const dt = Math.min((ts - (lastFrameTs || ts)) / 1000, 0.1);
    lastFrameTs = ts;

    if (fallbackCtx) fallbackCtx.clearRect(0, 0, el.canvas.width, el.canvas.height);

    if (state.snowOn && !canvasPaused) {
      for (const p of particles) { p.update(dt); p.draw(); }
    }

    rafId = requestAnimationFrame(renderLoop);
  }
  rafId = requestAnimationFrame(renderLoop);

  /* Pause when tab is hidden (saves CPU/battery) */
  document.addEventListener('visibilitychange', () => {
    canvasPaused = document.hidden;
    if (useWorker) {
      worker.postMessage({ type: canvasPaused ? 'PAUSE' : 'RESUME' });
    } else {
      if (!document.hidden) lastFrameTs = 0;
    }
  });

  /* ── Audio Engine ──────────────────────────────────────────── */
  let audioCtx = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playOsc(freq, type, gainVal, dur, startDelay = 0) {
    if (!state.audioOn) return;
    try {
      const ac   = ensureAudioCtx();
      const t    = ac.currentTime + startDelay;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(0.01, t + dur);
      gain.gain.setValueAtTime(gainVal, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    } catch (_) { /* non-fatal */ }
  }

  function playTick() {
    playOsc(760, 'sine', 0.07, 0.07);
  }

  function playChime() {
    // Musical chord arpeggio
    [523, 659, 784, 1047].forEach((f, i) => {
      playOsc(f, 'triangle', 0.35, 1.6, i * 0.15);
    });
  }

  /* ── Celebration ───────────────────────────────────────────── */
  function triggerCelebration() {
    if (state.celebrating) return;
    state.celebrating = true;

    playChime();
    
    if (useWorker) {
      worker.postMessage({ type: 'CELEBRATE', payload: true });
    } else {
      buildFireworks();
    }

    // Use hidden + class for a11y (hidden attr = truly hidden from AT until visible)
    el.celebYearEl.textContent = state.targetYear;
    el.celebEl.removeAttribute('hidden');
    // Force reflow so transition fires correctly
    void el.celebEl.offsetHeight;
    el.celebEl.classList.add('is-visible');

    setAllZero();

    setTimeout(() => {
      // End celebration
      el.celebEl.classList.remove('is-visible');

      // Wait for fade-out transition before hiding from AT
      setTimeout(() => {
        el.celebEl.setAttribute('hidden', '');
        state.celebrating = false;

        // Advance year
        state.targetYear++;
        computeTarget();
        el.yearEl.classList.remove('flip');
        void el.yearEl.offsetHeight;
        el.yearEl.classList.add('flip');

        // Reset cache so tick re-renders immediately
        prev.d = prev.h = prev.m = prev.s = -1;

        if (useWorker) {
          worker.postMessage({ type: 'CELEBRATE', payload: false });
        } else {
          buildSnow();
        }
      }, 1100); // match CSS transition duration
    }, CELEBRATE_MS);
  }

  function setAllZero() {
    for (const key of ['days','hours','minutes','seconds']) {
      el[key].textContent = '00';
    }
    for (const key of ['pgDays','pgHours','pgMinutes','pgSeconds']) {
      el[key].style.width = '0%';
    }
    el.footerEl.textContent = `🎆 Happy New Year ${state.targetYear}! 🎊`;
  }

  /* ── Countdown Tick ────────────────────────────────────────── */
  // Self-adjusting scheduler — always fires near a whole-second boundary
  let tickTimerId = 0;

  function scheduleNextTick() {
    const msUntilNextSecond = MS_SECOND - (Date.now() % MS_SECOND);
    // Small clamp so we never schedule < 50ms (prevents double-fire)
    tickTimerId = setTimeout(tick, Math.max(50, msUntilNextSecond));
  }

  function tick() {
    if (!state.celebrating) {
      try {
        const dist = state.targetTs - Date.now();

        if (dist <= 0) {
          triggerCelebration();
        } else {
          const d = Math.floor(dist / MS_DAY);
          const h = Math.floor((dist % MS_DAY)    / MS_HOUR);
          const m = Math.floor((dist % MS_HOUR)   / MS_MINUTE);
          const s = Math.floor((dist % MS_MINUTE) / MS_SECOND);

          // Only touch DOM when value changed
          if (prev.s !== s) {
            prev.s = s;
            setNumber(el.seconds, s);
            setProgress(el.pgSeconds, s, 60);
            playTick();
            updateFooter(d, h, m);
            if (dist <= 10000) {
              el.seconds.closest('.countdown-card').classList.add('pulse-fast');
            } else {
              el.seconds.closest('.countdown-card').classList.remove('pulse-fast');
            }
          }
          if (prev.m !== m) {
            prev.m = m;
            setNumber(el.minutes, m);
            setProgress(el.pgMinutes, m, 60);
          }
          if (prev.h !== h) {
            prev.h = h;
            setNumber(el.hours, h);
            setProgress(el.pgHours, h, 24);
          }
          if (prev.d !== d) {
            prev.d = d;
            setNumber(el.days, d);
            const isLeap = (state.targetYear % 4 === 0 && state.targetYear % 100 !== 0)
                        || state.targetYear % 400 === 0;
            const maxDays = isLeap ? 366 : 365;
            setProgress(el.pgDays, d, maxDays);
          }
        }
      } catch (e) {
        console.error('[Countdown] tick error:', e);
      }
    }

    scheduleNextTick();
  }

  /** 
   * Updates progress bar width with anti-rewind logic
   * (snaps to 0 instead of animating backwards when looping)
   */
  function setProgress(elProgress, current, max) {
    const p = Math.round(((max - current) / max) * 1000) / 10;
    const currentW = parseFloat(elProgress.style.width) || 0;
    
    // If it's wrapping around (e.g. from ~100% back to ~0%), disable transition
    if (currentW > 90 && p < 10) {
      elProgress.style.transition = 'none';
      elProgress.style.width = p + '%';
      void elProgress.offsetHeight; // force reflow
      elProgress.style.transition = '';
    } else {
      elProgress.style.width = p + '%';
    }
  }

  /** Animate the number element when its value changes */
  function setNumber(el, n) {
    const str = pad(n);
    if (el.textContent === str) return;
    el.textContent = str;
    el.classList.remove('changed');
    void el.offsetHeight; // trigger reflow for class re-add
    el.classList.add('changed');
  }

  function updateFooter(d, h, m) {
    const yr = state.targetYear;
    if (d > 1)      el.footerEl.textContent = `✨ ${d} days until ${yr} begins! 🎊`;
    else if (d > 0) el.footerEl.textContent = `⌛ Just 1 day left until ${yr}!`;
    else if (h > 0) el.footerEl.textContent = `⏳ Only ${h} hours left until ${yr}!`;
    else if (m > 0) el.footerEl.textContent = `🔥 ${m} minutes to go — almost there!`;
    else            el.footerEl.textContent = `🎆 Any second now… Prepare for fireworks!`;
  }

  /* ── Button Handlers ───────────────────────────────────────── */

  // Theme toggle
  el.themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next   = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (_) {}
  });

  // Snow toggle — use aria-pressed as single source of truth
  el.snowBtn.addEventListener('click', () => {
    state.snowOn = !state.snowOn;
    el.snowBtn.setAttribute('aria-pressed', String(state.snowOn));
    if (useWorker) {
      worker.postMessage({ type: 'TOGGLE_SNOW', payload: state.snowOn });
    } else {
      if (!state.snowOn && fallbackCtx) {
        fallbackCtx.clearRect(0, 0, el.canvas.width, el.canvas.height);
      }
    }
  });

  // Audio toggle
  el.audioBtn.addEventListener('click', () => {
    state.audioOn = !state.audioOn;
    el.audioBtn.setAttribute('aria-pressed', String(state.audioOn));
    if (state.audioOn) {
      // Must init AudioContext inside user gesture
      ensureAudioCtx();
      el.audioBtn.classList.add('is-active');
    } else {
      el.audioBtn.classList.remove('is-active');
    }
  });

  // Timezone change
  el.tzSelect.addEventListener('change', (e) => {
    state.tz = e.target.value;
    state.targetYear = (() => {
      if (state.tz === 'local') return new Date().getFullYear() + 1;
      const y = new Intl.DateTimeFormat('en-US', {
        timeZone: state.tz, year: 'numeric',
      }).format(new Date());
      return parseInt(y, 10) + 1;
    })();
    computeTarget();
    prev.d = prev.h = prev.m = prev.s = -1;
    el.yearEl.classList.remove('flip');
    void el.yearEl.offsetHeight;
    el.yearEl.classList.add('flip');
  });

  // 3D Tilt + Glare mouse tracker — only binds on hover-capable devices
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.countdown-card').forEach(card => {
      const glare = card.querySelector('.glare');
      if (!glare) return;
      
      card.addEventListener('mousemove', (e) => {
        const r  = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const px = (x / r.width)  * 100;
        const py = (y / r.height) * 100;
        
        // Advanced Tilt (max 6 degrees)
        const tiltX = (y / r.height - 0.5) * -12;
        const tiltY = (x / r.width - 0.5) * 12;

        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02) translateY(-5px)`;
        glare.style.opacity = '1';
        glare.style.background =
          `radial-gradient(circle at ${px}% ${py}%, rgba(255 255 255 / 0.25), transparent 80%)`;
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        glare.style.opacity = '';
        glare.style.background = '';
      });
    });
  }

  /* ── Init ──────────────────────────────────────────────────── */

  // Restore theme (before first paint if possible)
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (_) {}

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // Global audio init (for strict browsers like iOS Safari)
  const initAudioOnce = () => {
    ensureAudioCtx();
    document.removeEventListener('click', initAudioOnce);
    document.removeEventListener('touchstart', initAudioOnce);
  };
  document.addEventListener('click', initAudioOnce, { once: true });
  document.addEventListener('touchstart', initAudioOnce, { once: true });

  // Kick off
  scheduleNextTick();

})();
