/* ===== Game Engine (Canvas) ===== */
class GameEngine {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = options.mode || 'grid'; // 'grid' | 'triple' | 'tracking'
    this.faceImages = options.faceImages || [];
    this.duration = options.duration || 30;
    this.targetSize = options.targetSize || 100;
    this.bgImage = options.bgImage || null;
    this.onTick = options.onTick || (() => {});
    this.onEnd = options.onEnd || (() => {});

    this.kills = 0;
    this.misses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.reactionTimes = [];
    this.timeLeft = this.duration;
    this.running = false;
    this.target = null;  // grid mode single target
    this.targets = [];   // triple mode: array of 3 targets
    this.targetSpawnTime = 0;

    // Tracking mode state
    this._trackTimeMs = 0;       // total ms cursor was inside target
    this._trackingInside = false; // is cursor currently inside?
    this._trackHpFlash = 0;      // HP bar damage flash timer
    this.animations = [];
    this.rafId = null;
    this.lastTime = 0;
    this._elapsedMs = 0; // precise elapsed time tracking
    this._clickLog = []; // anti-cheat: record every click timestamp + reaction
    this._perfNow = performance.now.bind(performance); // protect from override
    this._mousePath = []; // anti-cheat: mouse movement samples
    this._lastMousePos = null;
    this._mouseSampleTimer = 0;

    // Fix canvas to screen resolution — CSS size matches pixel size 1:1
    // No CSS scaling = zoom/resize cannot shrink the game area
    this.W = window.screen.width;
    this.H = window.screen.height;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';

    // Tracking mode: hold-to-fire state
    this._mouseDown = false;
    this._trackFireTimer = 0; // accumulates dt, fires every interval
    this._trackFireInterval = 100; // ms between each damage tick

    // Shared debounce for all input types (mouse + touch)
    this._lastClickTime = 0;
    this._boundClick = (e) => {
      e.preventDefault();
      // Tracking mode: mousedown starts hold-fire, not single click
      if (this.mode === 'tracking') {
        this._mouseDown = true;
        this._trackFireTimer = this._trackFireInterval; // fire immediately on press
        return;
      }
      const now = performance.now();
      if (now - this._lastClickTime < 50) return;
      this._lastClickTime = now;
      this._handleClick(e);
    };
    this._boundMouseUp = () => {
      this._mouseDown = false;
      this._trackFireTimer = 0;
    };
    this._boundTouch = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - this._lastClickTime < 50) return;
      this._lastClickTime = now;
      const touch = e.touches[0];
      this._handleClick(touch);
    };
    this._boundContextMenu = (e) => e.preventDefault();
    // Anti-cheat: sample mouse movement path (~every 30ms)
    this._boundMouseMove = (e) => {
      if (!this.running) return;
      const now = this._perfNow();
      if (now - this._mouseSampleTimer < 30) return;
      this._mouseSampleTimer = now;
      const rect = this.canvas.getBoundingClientRect();
      this._lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Keep last 200 samples max (rolling window)
      if (this._mousePath.length < 200) {
        this._mousePath.push({ x: this._lastMousePos.x, y: this._lastMousePos.y, t: Math.round(now - (this._gameStartTime || now)) });
      }
    };
    this.canvas.addEventListener('mousedown', this._boundClick);
    this.canvas.addEventListener('mouseup', this._boundMouseUp);
    window.addEventListener('mouseup', this._boundMouseUp); // catch release outside canvas
    this.canvas.addEventListener('mousemove', this._boundMouseMove);
    this.canvas.addEventListener('contextmenu', this._boundContextMenu);
    this.canvas.addEventListener('touchstart', this._boundTouch, { passive: false });
  }

  _resizeCanvas() {
    // No-op: canvas size is fixed to screen resolution
  }

  start() {
    this.running = true;
    this.kills = 0;
    this.misses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bonusPoints = 0;
    this.reactionTimes = [];
    this.timeLeft = this.duration;
    this._elapsedMs = 0;
    this._clickLog = [];
    this._mousePath = [];
    this._lastMousePos = null;
    this._mouseSampleTimer = 0;
    this._gameStartTime = this._perfNow();
    this._trackTimeMs = 0;
    this._trackingInside = false;
    this._trackHpFlash = 0;
    this.animations = [];

    if (this.mode === 'triple') {
      this.targets = [];
      for (let i = 0; i < 3; i++) this._spawnTripleTarget(i);
    } else if (this.mode === 'tracking') {
      this._spawnTrackingTarget();
    } else {
      this._spawnTarget();
    }

    this.lastTime = this._perfNow();
    this._loop(this.lastTime);
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.running = true;
    this.lastTime = performance.now();
    // Reset spawn time so reaction isn't penalized for pause
    this.targetSpawnTime = performance.now();
    this._loop(this.lastTime);
  }

  stop() {
    if (!this.running && !this.paused) return;
    this.running = false;
    this.paused = false;
    this.target = null;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.animations = [];
    this.onEnd(this._getStats());
  }

  destroy() {
    this.running = false;
    this.paused = false;
    this._mouseDown = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this._boundClick) {
      this.canvas.removeEventListener('mousedown', this._boundClick);
      this._boundClick = null;
    }
    if (this._boundMouseUp) {
      this.canvas.removeEventListener('mouseup', this._boundMouseUp);
      window.removeEventListener('mouseup', this._boundMouseUp);
      this._boundMouseUp = null;
    }
    if (this._boundMouseMove) {
      this.canvas.removeEventListener('mousemove', this._boundMouseMove);
      this._boundMouseMove = null;
    }
    if (this._boundTouch) {
      this.canvas.removeEventListener('touchstart', this._boundTouch);
      this._boundTouch = null;
    }
    if (this._boundContextMenu) {
      this.canvas.removeEventListener('contextmenu', this._boundContextMenu);
      this._boundContextMenu = null;
    }
  }

  _getStats() {
    const avgReaction = this.reactionTimes.length
      ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length)
      : 0;
    const totalAttempts = this.kills + this.misses;
    const accuracy = totalAttempts > 0 ? Math.round((this.kills / totalAttempts) * 100) : 0;
    const elapsed = this.duration - this.timeLeft;
    const kpm = elapsed > 0 ? Math.round((this.kills / elapsed) * 60) : 0;
    const trackAccuracy = this._elapsedMs > 0 ? Math.round((this._trackTimeMs / this._elapsedMs) * 100) : 0;
    return {
      kills: this.kills,
      misses: this.misses,
      combo: this.combo,
      maxCombo: this.maxCombo,
      bonusPoints: this.bonusPoints,
      avgReaction,
      accuracy,
      timeLeft: this.timeLeft,
      duration: this.duration,
      kpm,
      clickLog: this._clickLog,
      mousePath: this._mousePath,
      trackTime: this._trackTimeMs,
      trackAccuracy,
      mode: this.mode,
    };
  }

  _spawnTarget() {
    const padding = this.targetSize;
    const hudHeight = 70;
    const x = padding + Math.random() * (this.W - padding * 2);
    const y = hudHeight + padding + Math.random() * (this.H - hudHeight - padding * 2);
    const faceImg = this.faceImages.length
      ? this.faceImages[Math.floor(Math.random() * this.faceImages.length)]
      : null;

    this.target = { x, y, size: this.targetSize, faceImg, opacity: 1 };
    this.targetSpawnTime = performance.now();
  }

  // === Triple mode: spawn one of 3 target slots ===
  _spawnTripleTarget(slot) {
    const padding = this.targetSize;
    const hudHeight = 70;
    let x, y, tooClose;
    // Avoid overlapping targets
    do {
      tooClose = false;
      x = padding + Math.random() * (this.W - padding * 2);
      y = hudHeight + padding + Math.random() * (this.H - hudHeight - padding * 2);
      for (let i = 0; i < this.targets.length; i++) {
        if (i === slot || !this.targets[i]) continue;
        const dist = Math.hypot(x - this.targets[i].x, y - this.targets[i].y);
        if (dist < this.targetSize * 2) { tooClose = true; break; }
      }
    } while (tooClose);
    const faceImg = this.faceImages.length
      ? this.faceImages[Math.floor(Math.random() * this.faceImages.length)]
      : null;
    this.targets[slot] = { x, y, size: this.targetSize, faceImg, opacity: 1, spawnTime: performance.now() };
  }

  // === Tracking mode: spawn a moving target with HP ===
  _spawnTrackingTarget() {
    const padding = this.targetSize * 1.5;
    const hudHeight = 70;
    const faceImg = this.faceImages.length
      ? this.faceImages[Math.floor(Math.random() * this.faceImages.length)]
      : null;
    const speed = 2.5;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = padding + Math.random() * (this.W - padding * 2);
    const y = hudHeight + padding + Math.random() * (this.H - hudHeight - padding * 2);
    this.target = {
      x, y,
      size: this.targetSize,
      faceImg,
      opacity: 1,
      vx: speed * dir,  // horizontal movement only
      vy: 0,
      hp: 100,
      maxHp: 100,
    };
  }

  _updateTrackingTarget(dt) {
    if (!this.target || !this.running) return;
    const t = this.target;
    const r = t.size / 2;

    // Horizontal movement
    const speedMult = 1 + (this._elapsedMs / (this.duration * 1000)) * 1.2;
    const baseSpeed = 2.5 * speedMult;
    const dir = t.vx > 0 ? 1 : -1;
    t.vx = baseSpeed * dir;

    t.x += t.vx * (dt / 16.67);

    // Bounce off horizontal walls
    if (t.x - r < 0) { t.x = r; t.vx = Math.abs(t.vx); }
    if (t.x + r > this.W) { t.x = this.W - r; t.vx = -Math.abs(t.vx); }

    // Random direction flip occasionally
    if (Math.random() < 0.005) t.vx = -t.vx;

    // Check if cursor is inside
    if (this._lastMousePos) {
      const dist = Math.hypot(this._lastMousePos.x - t.x, this._lastMousePos.y - t.y);
      this._trackingInside = dist <= r;
      if (this._trackingInside) {
        this._trackTimeMs += dt;
      }
    }

    // Decay HP flash timer
    if (this._trackHpFlash > 0) this._trackHpFlash = Math.max(0, this._trackHpFlash - dt);

    // Hold-to-fire: deal damage while mouse held inside target
    if (this._mouseDown && this._trackingInside && this.target) {
      this._trackFireTimer += dt;
      while (this._trackFireTimer >= this._trackFireInterval) {
        this._trackFireTimer -= this._trackFireInterval;
        t.hp -= 5; // 5 damage per tick (10 ticks/sec = 50 dps)
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        // Damage visual feedback
        this._trackHpFlash = 120;

        AudioManager.playHitSound();
        if (t.hp <= 0) {
          this.kills++;
          this._spawnBladeAnimation(t.x, t.y, t.size, t.faceImg);
          this._spawnTrackingTarget();
          this._trackFireTimer = 0;
          this._trackHpFlash = 0;
          break;
        }
      }
      this.onTick(this._getStats());
    } else if (this._mouseDown && !this._trackingInside) {
      // Holding outside target = miss + reset combo
      if (this._trackFireTimer >= this._trackFireInterval) {
        this.misses++;
        this.combo = 0;
        this._trackFireTimer = 0;
        if (this._lastMousePos) {
          this._spawnMissAnimation(this._lastMousePos.x, this._lastMousePos.y);
        }
        AudioManager.playMissSound();
        this.onTick(this._getStats());
      }
      this._trackFireTimer += dt;
    } else {
      this._trackFireTimer = 0;
    }
  }

  _handleClick(e) {
    if (!this.running) return;

    // Tracking mode: handled by hold-fire in _updateTrackingTarget
    if (this.mode === 'tracking') return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const clickTime = this._perfNow() - this._gameStartTime;

    // Triple mode: check all 3 targets
    if (this.mode === 'triple') {
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (!t) continue;
        const dist = Math.hypot(mx - t.x, my - t.y);
        if (dist <= t.size / 2) {
          const reaction = this._perfNow() - t.spawnTime;
          this.reactionTimes.push(Math.round(reaction));
          this._clickLog.push({ t: Math.round(clickTime), r: Math.round(reaction), h: 1, d: Math.round(dist), tx: Math.round(t.x), ty: Math.round(t.y) });
          this.combo++;
          let bonus = 0;
          if (this.combo >= 30) bonus = 3;
          else if (this.combo >= 15) bonus = 2;
          else if (this.combo >= 5) bonus = 1;
          this.kills += 1;
          this.bonusPoints += bonus;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          this._spawnBladeAnimation(t.x, t.y, t.size, t.faceImg);
          AudioManager.playHitSound();
          this._spawnTripleTarget(i);
          this.onTick(this._getStats());
          return;
        }
      }
      // MISS
      this.misses++;
      this.combo = 0;
      this._clickLog.push({ t: Math.round(clickTime), h: 0 });
      this._spawnMissAnimation(mx, my);
      AudioManager.playMissSound();
      this.onTick(this._getStats());
      return;
    }

    // Grid mode (default)
    if (this.target) {
      const t = this.target;
      const dist = Math.hypot(mx - t.x, my - t.y);
      if (dist <= t.size / 2) {
        const reaction = this._perfNow() - this.targetSpawnTime;
        this.reactionTimes.push(Math.round(reaction));
        this._clickLog.push({ t: Math.round(clickTime), r: Math.round(reaction), h: 1, d: Math.round(dist), tx: Math.round(t.x), ty: Math.round(t.y) });
        this.combo++;
        let bonus = 0;
        if (this.combo >= 30) bonus = 3;
        else if (this.combo >= 15) bonus = 2;
        else if (this.combo >= 5) bonus = 1;
        this.kills += 1;
        this.bonusPoints += bonus;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this._spawnBladeAnimation(t.x, t.y, t.size, t.faceImg);
        AudioManager.playHitSound();
        this._spawnTarget();
        this.onTick(this._getStats());
        return;
      }
    }

    // MISS
    this.misses++;
    this.combo = 0;
    this._clickLog.push({ t: Math.round(clickTime), h: 0 });
    this._spawnMissAnimation(mx, my);
    AudioManager.playMissSound();
    this.onTick(this._getStats());
  }

  // ===== Blade slash animation =====
  _spawnBladeAnimation(x, y, size, faceImg) {
    // Spawn blood particles
    const particles = [];
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 2 + Math.random() * 4,
        life: 1,
      });
    }
    this.animations.push({
      type: 'blade',
      x, y, size, faceImg,
      combo: this.combo,
      points: 1 + (this.combo >= 30 ? 3 : this.combo >= 15 ? 2 : this.combo >= 5 ? 1 : 0),
      startTime: performance.now(),
      duration: 600,
      particles,
    });
  }

  _spawnMissAnimation(x, y) {
    this.animations.push({
      type: 'miss',
      x, y,
      startTime: performance.now(),
      duration: 300,
    });
  }

  // ===== Render loop =====
  _loop(now) {
    if (!this.running && this.animations.length === 0) return;
    this.rafId = requestAnimationFrame((t) => this._loop(t));

    const rawDt = now - this.lastTime;
    this.lastTime = now;
    // Clamp dt to prevent huge jumps (e.g., tab regaining focus)
    const dt = Math.min(rawDt, 500);

    // Precise timer: accumulate elapsed ms and derive timeLeft (decimal)
    if (this.running) {
      this._elapsedMs += dt;
      this.timeLeft = Math.max(0, this.duration - this._elapsedMs / 1000);
      this.onTick(this._getStats());
      if (this._elapsedMs >= this.duration * 1000) {
        this.timeLeft = 0;
        this.stop();
        return;
      }
    }

    // Tracking mode: update target movement
    if (this.mode === 'tracking' && this.running) {
      this._updateTrackingTarget(dt);
    }

    this.ctx.clearRect(0, 0, this.W, this.H);
    this._drawBg();

    if (this.mode === 'triple') {
      this._drawTripleTargets();
    } else if (this.mode === 'tracking') {
      this._drawTrackingTarget();
    } else {
      this._drawTarget();
    }

    this._updateAnimations(now);
  }

  _drawBg() {
    if (this.bgImage) {
      const img = this.bgImage;
      const scale = Math.max(this.W / img.width, this.H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      this.ctx.drawImage(img, (this.W - w) / 2, (this.H - h) / 2, w, h);
      this.ctx.fillStyle = 'rgba(10, 14, 20, 0.35)';
      this.ctx.fillRect(0, 0, this.W, this.H);
    } else {
      this.ctx.fillStyle = '#0a0e14';
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  _drawTarget() {
    if (!this.target || !this.running) return;
    const t = this.target;
    const ctx = this.ctx;
    const r = t.size / 2;

    ctx.save();
    ctx.globalAlpha = t.opacity;

    // Noxian dark energy outer ring
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.1;
    ctx.beginPath();
    ctx.arc(t.x, t.y, (r + 8) * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 20, 30, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(200, 30, 30, 0.5)';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner glow ring
    ctx.beginPath();
    ctx.arc(t.x, t.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 50, 30, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (t.faceImg) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(t.faceImg, t.x - r, t.y - r, t.size, t.size);
    } else {
      // Fallback: red circle with crosshair
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 64, 87, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#e84057';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crosshair
      ctx.beginPath();
      ctx.moveTo(t.x - r * 0.6, t.y);
      ctx.lineTo(t.x + r * 0.6, t.y);
      ctx.moveTo(t.x, t.y - r * 0.6);
      ctx.lineTo(t.x, t.y + r * 0.6);
      ctx.strokeStyle = 'rgba(232, 64, 87, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawTripleTargets() {
    if (!this.running) return;
    for (const t of this.targets) {
      if (!t) continue;
      this._drawSingleTarget(t);
    }
  }

  _drawTrackingTarget() {
    if (!this.target || !this.running) return;
    const t = this.target;
    const ctx = this.ctx;
    const r = t.size / 2;

    // Draw the face target
    this._drawSingleTarget(t);

    // Tracking indicator: animated ring when cursor is inside
    if (this._trackingInside && this._mouseDown) {
      // Active damage ring (pulsing red-orange)
      ctx.save();
      const pulse = 1 + Math.sin(performance.now() * 0.015) * 0.08;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (r + 10) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232, 80, 60, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(255, 60, 30, 0.6)';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.restore();

      // Inner hit glow
      ctx.save();
      const grad = ctx.createRadialGradient(t.x, t.y, r * 0.5, t.x, t.y, r * 1.3);
      grad.addColorStop(0, 'rgba(255, 80, 40, 0.12)');
      grad.addColorStop(1, 'rgba(255, 80, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (this._trackingInside) {
      // Cursor inside but not firing - green tracking ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(t.x, t.y, r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(73, 217, 178, 0.5)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(73, 217, 178, 0.4)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();
    }

    // === HP Bar (clean green) ===
    if (t.hp != null && t.maxHp) {
      const hpRatio = t.hp / t.maxHp;
      const barW = t.size * 1.4;
      const barH = 8;
      const barRad = barH / 2;
      const barX = t.x - barW / 2;
      const barY = t.y - r - 20;

      ctx.save();

      // Background
      ctx.beginPath();
      this._roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, barRad + 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fill();

      // Border
      ctx.beginPath();
      this._roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, barRad + 1);
      ctx.strokeStyle = 'rgba(73, 217, 178, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Track
      ctx.beginPath();
      this._roundRect(ctx, barX, barY, barW, barH, barRad);
      ctx.fillStyle = 'rgba(30, 35, 45, 0.8)';
      ctx.fill();

      // Green fill
      if (hpRatio > 0) {
        const fillW = barW * hpRatio;
        ctx.save();
        ctx.beginPath();
        this._roundRect(ctx, barX, barY, fillW, barH, barRad);
        ctx.clip();

        const hpGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        hpGrad.addColorStop(0, '#5eeaaa');
        hpGrad.addColorStop(0.5, '#3cc88a');
        hpGrad.addColorStop(1, '#2aa070');
        ctx.fillStyle = hpGrad;
        ctx.fillRect(barX, barY, fillW, barH);

        // Glossy highlight
        const glossGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH * 0.5);
        glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glossGrad;
        ctx.fillRect(barX, barY, fillW, barH * 0.5);

        ctx.restore();
      }

      // Damage flash
      if (this._trackHpFlash > 0) {
        const flashAlpha = (this._trackHpFlash / 120) * 0.35;
        ctx.beginPath();
        this._roundRect(ctx, barX, barY, barW * hpRatio, barH, barRad);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Helper: draw rounded rectangle path
  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Shared single target draw (used by all modes)
  _drawSingleTarget(t) {
    if (!t) return;
    const ctx = this.ctx;
    const r = t.size / 2;

    ctx.save();
    ctx.globalAlpha = t.opacity;

    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.1;
    ctx.beginPath();
    ctx.arc(t.x, t.y, (r + 8) * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 20, 30, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(200, 30, 30, 0.5)';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(t.x, t.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 50, 30, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (t.faceImg) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(t.faceImg, t.x - r, t.y - r, t.size, t.size);
    } else {
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 64, 87, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#e84057';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  _updateAnimations(now) {
    const ctx = this.ctx;
    this.animations = this.animations.filter(anim => {
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);

      if (anim.type === 'blade') {
        this._drawBladeAnim(ctx, anim, elapsed, progress);
      } else if (anim.type === 'miss') {
        this._drawMissAnim(ctx, anim, progress);
      }

      return progress < 1;
    });
  }

  _drawBladeAnim(ctx, anim, elapsed, progress) {
    const { x, y, size, faceImg, particles } = anim;
    const r = size / 2;

    // Phase timings — Noxian Guillotine style
    const windUp = 60;      // dark energy gathers
    const strikeEnd = 130;   // massive axe slams down
    const impactEnd = 250;   // impact shockwave + split
    const fadeEnd = 600;     // pieces fly + blood

    // Screen shake (applied to canvas transform)
    if (elapsed > strikeEnd && elapsed < impactEnd) {
      const intensity = 4 * (1 - (elapsed - strikeEnd) / (impactEnd - strikeEnd));
      const sx = (Math.random() - 0.5) * intensity;
      const sy = (Math.random() - 0.5) * intensity;
      ctx.save();
      ctx.translate(sx, sy);
    }

    if (elapsed < windUp) {
      // PHASE 1: Dark energy wind-up — face pulses red
      const t = elapsed / windUp;
      ctx.save();
      // Draw face
      if (faceImg) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(faceImg, x - r, y - r, size, size);
        // Red overlay pulse
        ctx.fillStyle = `rgba(180, 20, 30, ${0.3 * t})`;
        ctx.fillRect(x - r, y - r, size, size);
      }
      ctx.restore();

      // Dark energy ring expanding
      ctx.save();
      const ringR = r * (0.8 + t * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 20, 30, ${0.6 * t})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(180, 20, 30, 0.8)';
      ctx.shadowBlur = 20 * t;
      ctx.stroke();
      ctx.restore();

    } else if (elapsed < strikeEnd) {
      // PHASE 2: AXE STRIKE — huge blade slams down
      const t = (elapsed - windUp) / (strikeEnd - windUp);
      const eased = t * t * t; // cubic ease in = heavy acceleration

      // Axe blade coming from top
      const axeTopY = y - size * 2.5;
      const axeY = axeTopY + (y - axeTopY + r * 0.3) * eased;
      const axeW = size * 0.7;
      const axeH = size * 1.8;

      // Face still visible
      ctx.save();
      if (faceImg) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(faceImg, x - r, y - r, size, size);
      }
      ctx.restore();

      // Draw axe blade (Darius style — wide, dark steel with red edge)
      ctx.save();
      ctx.translate(x, axeY);

      // Blade body — dark steel trapezoid
      const grad = ctx.createLinearGradient(-axeW / 2, 0, axeW / 2, 0);
      grad.addColorStop(0, 'rgba(40,35,40,0.6)');
      grad.addColorStop(0.3, 'rgba(100,95,105,0.95)');
      grad.addColorStop(0.5, 'rgba(160,155,170,1)');
      grad.addColorStop(0.7, 'rgba(100,95,105,0.95)');
      grad.addColorStop(1, 'rgba(40,35,40,0.6)');

      ctx.beginPath();
      ctx.moveTo(-axeW * 0.15, -axeH);
      ctx.lineTo(axeW * 0.15, -axeH);
      ctx.lineTo(axeW * 0.5, 0);
      ctx.lineTo(-axeW * 0.5, 0);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Red cutting edge glow
      ctx.beginPath();
      ctx.moveTo(-axeW * 0.5, 0);
      ctx.lineTo(axeW * 0.5, 0);
      ctx.strokeStyle = 'rgba(200, 30, 40, 0.9)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 30, 30, 1)';
      ctx.shadowBlur = 25;
      ctx.stroke();

      ctx.restore();

    } else if (elapsed < impactEnd) {
      // PHASE 3: IMPACT — shockwave + face splits
      const t = (elapsed - strikeEnd) / (impactEnd - strikeEnd);
      const eased = 1 - Math.pow(1 - t, 3);
      const splitDist = size * 0.5 * eased;
      const dropDist = size * 0.2 * eased;
      const rot = 0.18 * eased;

      // Impact shockwave ring
      const shockR = r + size * 1.2 * eased;
      const shockAlpha = 0.7 * (1 - eased);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, shockR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 30, 30, ${shockAlpha})`;
      ctx.lineWidth = 3 * (1 - eased);
      ctx.shadowColor = `rgba(255, 50, 30, ${shockAlpha})`;
      ctx.shadowBlur = 30;
      ctx.stroke();
      ctx.restore();

      // Inner red flash
      if (t < 0.3) {
        const flashAlpha = 0.4 * (1 - t / 0.3);
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 20, 20, 0.6)';
        ctx.fill();
        ctx.restore();
      }

      // Left half splitting
      ctx.save();
      ctx.translate(x - splitDist, y + dropDist);
      ctx.rotate(-rot);
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.clip();
      if (faceImg) {
        ctx.drawImage(faceImg, -r, -r, size, size);
        // Blood tint on cut edge
        ctx.fillStyle = `rgba(120, 10, 10, ${0.3 * eased})`;
        ctx.fillRect(-2, -r, r + 2, size);
      }
      ctx.restore();

      // Right half splitting
      ctx.save();
      ctx.translate(x + splitDist, y + dropDist);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.clip();
      if (faceImg) {
        ctx.drawImage(faceImg, -r, -r, size, size);
        ctx.fillStyle = `rgba(120, 10, 10, ${0.3 * eased})`;
        ctx.fillRect(-r, -r, r + 2, size);
      }
      ctx.restore();

      // Vertical slash energy line
      const slashAlpha = 1 - t;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.8);
      ctx.lineTo(x, y + r * 1.8);
      ctx.strokeStyle = `rgba(255, 60, 40, ${slashAlpha})`;
      ctx.lineWidth = 4 * (1 - t * 0.5);
      ctx.shadowColor = `rgba(255, 30, 20, ${slashAlpha})`;
      ctx.shadowBlur = 25;
      ctx.stroke();
      ctx.restore();

    } else {
      // PHASE 4: Pieces fly away + blood particles
      const t = (elapsed - impactEnd) / (fadeEnd - impactEnd);
      const alpha = Math.max(0, 1 - t * 1.2);
      const splitDist = size * 0.5 + size * 0.6 * t;
      const dropDist = size * 0.2 + size * 1.0 * t * t; // gravity
      const rot = 0.18 + 0.4 * t;

      // Left half falling
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x - splitDist, y + dropDist);
        ctx.rotate(-rot);
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 1.5);
        ctx.closePath();
        ctx.clip();
        if (faceImg) ctx.drawImage(faceImg, -r, -r, size, size);
        ctx.restore();

        // Right half falling
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + splitDist, y + dropDist);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.closePath();
        ctx.clip();
        if (faceImg) ctx.drawImage(faceImg, -r, -r, size, size);
        ctx.restore();
      }

      // Blood particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.life -= 0.02;
        if (p.life > 0) {
          ctx.save();
          ctx.globalAlpha = p.life * 0.8;
          ctx.beginPath();
          ctx.arc(x + p.x, y + p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${140 + Math.random() * 40}, ${10 + Math.random() * 20}, ${10 + Math.random() * 15})`;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // End screen shake
    if (elapsed > strikeEnd && elapsed < impactEnd) {
      ctx.restore();
    }

    // Combo popup
    if (elapsed < 400) {
      const comboNum = anim.combo;
      if (comboNum > 1) {
        const t = elapsed / 400;
        const popY = y - r - 20 - 30 * t;
        const alpha = 1 - t;
        const fontSize = Math.min(24 + comboNum * 2, 60);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${fontSize}px 'Black Han Sans', sans-serif`;
        ctx.textAlign = 'center';
        const bonusLabel = comboNum >= 30 ? ' +3' : comboNum >= 15 ? ' +2' : comboNum >= 5 ? ' +1' : '';
        ctx.fillStyle = comboNum >= 30 ? '#ff4466' : comboNum >= 15 ? '#ff8844' : '#f0d48a';
        ctx.shadowColor = comboNum >= 30 ? 'rgba(255,68,102,0.8)' : comboNum >= 15 ? 'rgba(255,136,68,0.6)' : 'rgba(200,169,110,0.6)';
        ctx.shadowBlur = comboNum >= 30 ? 20 : comboNum >= 15 ? 15 : 10;
        ctx.fillText(`${comboNum} COMBO${bonusLabel}`, x, popY);
        ctx.restore();
      }
    }

    // Kill score popup
    if (elapsed < 350) {
      const pts = anim.points;
      const t = elapsed / 350;
      const popY = y - r - 5 - 20 * t;
      const alpha = 1 - t * t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${pts >= 2 ? 22 : 18}px 'Black Han Sans', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = pts >= 2 ? '#ff4466' : '#e84057';
      ctx.fillText(`+${pts}`, x, popY);
      ctx.restore();
    }
  }

  _drawMissAnim(ctx, anim, progress) {
    const { x, y } = anim;
    const alpha = 1 - progress;
    const radius = 15 + 20 * progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e84057';
    ctx.lineWidth = 2;
    ctx.stroke();

    // X mark
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.strokeStyle = `rgba(232,64,87,${alpha})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}

const var_red = '#e84057';
