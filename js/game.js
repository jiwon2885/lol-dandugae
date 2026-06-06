/* ===== Game Engine (Canvas) ===== */
class GameEngine {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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
    this.target = null;
    this.targetSpawnTime = 0;
    this.animations = [];
    this.rafId = null;
    this.lastTime = 0;
    this.timerInterval = null;

    // Fix canvas to screen resolution — CSS size matches pixel size 1:1
    // No CSS scaling = zoom/resize cannot shrink the game area
    this.W = window.screen.width;
    this.H = window.screen.height;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';

    this._boundClick = (e) => this._handleClick(e);
    this.canvas.addEventListener('click', this._boundClick);
    this._boundContextMenu = (e) => { e.preventDefault(); this._handleClick(e); };
    this.canvas.addEventListener('contextmenu', this._boundContextMenu);
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this._handleClick(touch);
    }, { passive: false });
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
    this.animations = [];
    this._spawnTarget();
    this.lastTime = performance.now();
    this._loop(this.lastTime);

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.stop();
      }
      this.onTick(this._getStats());
    }, 1000);
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.running = false;
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
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
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.stop();
      }
      this.onTick(this._getStats());
    }, 1000);
  }

  stop() {
    if (!this.running && !this.paused) return;
    this.running = false;
    this.paused = false;
    this.target = null;
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.animations = [];
    this.onEnd(this._getStats());
  }

  destroy() {
    this.running = false;
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    // No resize listener to remove
    this.canvas.removeEventListener('click', this._boundClick);
    this.canvas.removeEventListener('contextmenu', this._boundContextMenu);
  }

  _getStats() {
    const avgReaction = this.reactionTimes.length
      ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length)
      : 0;
    const totalAttempts = this.kills + this.misses;
    const accuracy = totalAttempts > 0 ? Math.round((this.kills / totalAttempts) * 100) : 0;
    const elapsed = this.duration - this.timeLeft;
    const kpm = elapsed > 0 ? Math.round((this.kills / elapsed) * 60) : 0;
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

  _handleClick(e) {
    if (!this.running) return;

    // Canvas CSS size = pixel size (1:1), so no scale needed
    // Just offset by canvas position
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this.target) {
      const t = this.target;
      const dist = Math.hypot(mx - t.x, my - t.y);
      if (dist <= t.size / 2) {
        // HIT
        const reaction = performance.now() - this.targetSpawnTime;
        this.reactionTimes.push(Math.round(reaction));
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

    const dt = now - this.lastTime;
    this.lastTime = now;

    this.ctx.clearRect(0, 0, this.W, this.H);
    this._drawBg();
    this._drawTarget();
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
