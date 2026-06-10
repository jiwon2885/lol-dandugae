/* ===== FPS Game Engine (Three.js WebGL) ===== */
class FPSGameEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.mode = options.mode || 'fps-grid';
    this.faceImages = options.faceImages || [];
    this.duration = options.duration || 30;
    this.sensitivity = options.sensitivity || 0.30;
    this.onTick = options.onTick || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onPause = options.onPause || null;

    this.kills = 0;
    this.misses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bonusPoints = 0;
    this.reactionTimes = [];
    this.timeLeft = this.duration;
    this.running = false;
    this.paused = false;
    this._elapsedMs = 0;
    this._clickLog = [];
    this._perfNow = performance.now.bind(performance);
    this._gameStartTime = 0;
    this._yaw = 0;
    this._pitch = 0;

    const w = window.innerWidth;
    const h = window.innerHeight;

    this._scene = new THREE.Scene();
    this._scene.fog = new THREE.FogExp2(0x0a1e25, 0.04);

    this._camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 100);
    this._camera.position.set(0, 0, 0);

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setClearColor(0x0a1e25);
    container.appendChild(this._renderer.domElement);

    this._raycaster = new THREE.Raycaster();
    this._screenCenter = new THREE.Vector2(0, 0);

    this._targets = [];
    this._targetGeo = new THREE.SphereGeometry(0.5, 24, 24);
    this._hitEffects = [];
    this._isTriple = this.mode.includes('triple');
    this._isTracking = this.mode.includes('tracking');
    this._targetCount = this._isTriple ? 3 : 1;

    this._faceTextures = this.faceImages.map(img => this._createCircleFaceTexture(img));

    this._createRoom();

    this._scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(3, 8, 5);
    this._scene.add(dir);
    const pLight = new THREE.PointLight(0x49d9b2, 0.3, 20);
    pLight.position.set(0, 2, 0);
    this._scene.add(pLight);

    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundClick = (e) => { if (e.button === 0) this._onShoot(); };
    this._boundContextMenu = (e) => e.preventDefault();
    this._boundPointerLockChange = () => {
      if (!document.pointerLockElement && this.running && !this.paused && this.onPause) {
        this.onPause();
      }
    };
    this._boundResize = () => {
      const w2 = window.innerWidth, h2 = window.innerHeight;
      this._camera.aspect = w2 / h2;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(w2, h2);
    };
    this._boundLoop = (t) => this._loop(t);
    this._lastTime = 0;
    this._rafId = null;

    document.addEventListener('mousemove', this._boundMouseMove);
    this._renderer.domElement.addEventListener('mousedown', this._boundClick);
    this._renderer.domElement.addEventListener('contextmenu', this._boundContextMenu);
    document.addEventListener('pointerlockchange', this._boundPointerLockChange);
    window.addEventListener('resize', this._boundResize);
  }

  _createCircleFaceTexture(img) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  _createRoom() {
    const W = 20, H = 12, D = 20;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0d2830,
      side: THREE.BackSide,
      roughness: 0.9,
      metalness: 0.05,
    });
    const roomGeo = new THREE.BoxGeometry(W, H, D);
    this._scene.add(new THREE.Mesh(roomGeo, wallMat));

    const floorGrid = new THREE.GridHelper(W, 20, 0x1a5560, 0x0f3540);
    floorGrid.position.y = -H / 2;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.3;
    this._scene.add(floorGrid);

    // Wall grid lines for depth
    const mat = new THREE.LineBasicMaterial({ color: 0x1a5560, transparent: true, opacity: 0.12 });
    const step = 2;
    for (let z = -D / 2; z <= D / 2; z += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-W / 2, -H / 2, z), new THREE.Vector3(W / 2, -H / 2, z)
      ]);
      this._scene.add(new THREE.Line(g, mat));
    }
    for (let x = -W / 2; x <= W / 2; x += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -H / 2, -D / 2), new THREE.Vector3(x, -H / 2, D / 2)
      ]);
      this._scene.add(new THREE.Line(g, mat));
    }

    // Room edge lines (visible borders)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x49d9b2, transparent: true, opacity: 0.35 });
    const hW = W / 2, hH = H / 2, hD = D / 2;
    const corners = [
      [-hW,-hH,-hD], [hW,-hH,-hD], [hW,-hH,hD], [-hW,-hH,hD],
      [-hW, hH,-hD], [hW, hH,-hD], [hW, hH,hD], [-hW, hH,hD],
    ];
    const edges = [
      [0,1],[1,2],[2,3],[3,0], // bottom
      [4,5],[5,6],[6,7],[7,4], // top
      [0,4],[1,5],[2,6],[3,7], // vertical
    ];
    for (const [a, b] of edges) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...corners[a]), new THREE.Vector3(...corners[b])
      ]);
      this._scene.add(new THREE.Line(g, edgeMat));
    }

    this._roomBounds = {
      minX: -W / 2 + 3, maxX: W / 2 - 3,
      minY: -H / 2 + 2, maxY: H / 2 - 2,
      minZ: -D / 2 + 3, maxZ: -3,
    };
  }

  _spawnTarget() {
    const b = this._roomBounds;
    let x, y, z, attempts = 0;
    do {
      x = b.minX + Math.random() * (b.maxX - b.minX);
      y = b.minY + Math.random() * (b.maxY - b.minY);
      z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      attempts++;
    } while (Math.sqrt(x * x + y * y + z * z) < 3 && attempts < 20);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xe84057, roughness: 0.25, metalness: 0.3,
      emissive: 0x991020, emissiveIntensity: 0.2,
    });
    const sphere = new THREE.Mesh(this._targetGeo, mat);
    sphere.position.set(x, y, z);
    this._scene.add(sphere);

    if (this._faceTextures.length > 0) {
      const tex = this._faceTextures[Math.floor(Math.random() * this._faceTextures.length)];
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const faceSprite = new THREE.Sprite(spriteMat);
      faceSprite.scale.set(0.9, 0.9, 1);
      faceSprite.renderOrder = 1;
      sphere.add(faceSprite);
      sphere.userData.faceSprite = faceSprite;
    }

    const ringGeo = new THREE.RingGeometry(0.55, 0.62, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3333, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    sphere.add(ring);
    sphere.userData.ring = ring;

    const target = { mesh: sphere, spawnTime: this._perfNow(), mat, vel: null };
    if (this._isTracking) {
      const speed = 2.5 + Math.min(this.kills * 0.05, 3);
      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.5) * 0.6;
      target.vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(elev) * speed * 0.5,
        Math.sin(angle) * speed,
      );
    }
    this._targets.push(target);
    return target;
  }

  _removeTarget(target) {
    const sprite = target.mesh.userData.faceSprite;
    if (sprite) sprite.material.dispose();
    const ring = target.mesh.userData.ring;
    if (ring) { ring.material.dispose(); ring.geometry.dispose(); }
    this._scene.remove(target.mesh);
    target.mat.dispose();
    const idx = this._targets.indexOf(target);
    if (idx !== -1) this._targets.splice(idx, 1);
  }

  respawnTargets() {
    while (this._targets.length > 0) this._removeTarget(this._targets[0]);
    for (let i = 0; i < this._targetCount; i++) this._spawnTarget();
  }

  _onMouseMove(e) {
    if (!this.running || !document.pointerLockElement) return;
    const mult = this.sensitivity * 0.003;
    this._yaw -= e.movementX * mult;
    this._pitch -= e.movementY * mult;
    this._pitch = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, this._pitch));
    const euler = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
    this._camera.quaternion.setFromEuler(euler);
  }

  _onShoot() {
    if (!this.running) return;
    if (!document.pointerLockElement) {
      this.requestPointerLock();
      return;
    }
    const clickTime = this._perfNow() - this._gameStartTime;

    this._raycaster.setFromCamera(this._screenCenter, this._camera);
    const meshes = this._targets.map(t => t.mesh);
    const intersects = this._raycaster.intersectObjects(meshes, true);

    let hitTarget = null;
    for (const inter of intersects) {
      let obj = inter.object;
      while (obj.parent && obj.parent !== this._scene) obj = obj.parent;
      hitTarget = this._targets.find(t => t.mesh === obj);
      if (hitTarget) break;
    }

    if (hitTarget) {
      const reaction = this._perfNow() - hitTarget.spawnTime;
      this.reactionTimes.push(Math.round(reaction));
      this._clickLog.push({ t: Math.round(clickTime), r: Math.round(reaction), h: 1 });
      this.combo++;
      let bonus = 0;
      if (this.combo >= 30) bonus = 3;
      else if (this.combo >= 15) bonus = 2;
      else if (this.combo >= 5) bonus = 1;
      this.kills++;
      this.bonusPoints += bonus;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this._spawnHitEffect(hitTarget.mesh.position.clone());
      AudioManager.playHitSound();
      this._removeTarget(hitTarget);
      this._spawnTarget();
      this.onTick(this._getStats());
      return;
    }

    this.misses++;
    this.combo = 0;
    this._clickLog.push({ t: Math.round(clickTime), h: 0 });
    AudioManager.playMissSound();
    this.onTick(this._getStats());
  }

  _spawnHitEffect(pos) {
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.SphereGeometry(0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe84057, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.5) * Math.PI;
      const speed = 3 + Math.random() * 4;
      p.userData.vel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elev) * speed,
        Math.sin(elev) * speed + 2,
        Math.sin(angle) * Math.cos(elev) * speed,
      );
      p.userData.life = 1;
      this._scene.add(p);
      this._hitEffects.push(p);
    }
  }

  _getStats() {
    const total = this.kills + this.misses;
    const accuracy = total > 0 ? Math.round((this.kills / total) * 100) : 0;
    const elapsed = this.duration - this.timeLeft;
    return {
      kills: this.kills, misses: this.misses, combo: this.combo,
      maxCombo: this.maxCombo, bonusPoints: this.bonusPoints,
      avgReaction: this.reactionTimes.length
        ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length) : 0,
      accuracy, timeLeft: this.timeLeft, duration: this.duration,
      kpm: elapsed > 0 ? Math.round((this.kills / elapsed) * 60) : 0,
      clickLog: this._clickLog, mousePath: [],
      trackTime: 0, trackAccuracy: 0, mode: this.mode,
    };
  }

  requestPointerLock() {
    this._renderer.domElement.requestPointerLock();
  }

  start() {
    this.running = true;
    this.kills = 0; this.misses = 0; this.combo = 0; this.maxCombo = 0;
    this.bonusPoints = 0; this.reactionTimes = [];
    this.timeLeft = this.duration; this._elapsedMs = 0;
    this._clickLog = [];
    this._gameStartTime = this._perfNow();
    this._yaw = 0; this._pitch = 0;
    this._camera.quaternion.identity();

    while (this._targets.length > 0) this._removeTarget(this._targets[0]);
    for (const p of this._hitEffects) { this._scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
    this._hitEffects = [];

    for (let i = 0; i < this._targetCount; i++) this._spawnTarget();
    this._lastTime = this._perfNow();
    this._loop(this._lastTime);
    this.requestPointerLock();
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true; this.running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false; this.running = true;
    this._lastTime = this._perfNow();
    this._loop(this._lastTime);
    this.requestPointerLock();
  }

  stop() {
    if (!this.running && !this.paused) return;
    this.running = false; this.paused = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd(this._getStats());
  }

  destroy() {
    this.running = false; this.paused = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (document.pointerLockElement) document.exitPointerLock();
    document.removeEventListener('mousemove', this._boundMouseMove);
    this._renderer.domElement.removeEventListener('mousedown', this._boundClick);
    this._renderer.domElement.removeEventListener('contextmenu', this._boundContextMenu);
    document.removeEventListener('pointerlockchange', this._boundPointerLockChange);
    window.removeEventListener('resize', this._boundResize);
    while (this._targets.length > 0) this._removeTarget(this._targets[0]);
    for (const p of this._hitEffects) { this._scene.remove(p); p.geometry.dispose(); p.material.dispose(); }
    this._targetGeo.dispose();
    this._faceTextures.forEach(t => t.dispose());
    this._renderer.dispose();
    if (this._renderer.domElement.parentNode) {
      this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
    }
  }

  _loop(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._boundLoop);
    const dt = Math.min(now - this._lastTime, 500);
    this._lastTime = now;

    this._elapsedMs += dt;
    this.timeLeft = Math.max(0, this.duration - this._elapsedMs / 1000);
    this.onTick(this._getStats());

    if (this._elapsedMs >= this.duration * 1000) {
      this.timeLeft = 0; this.stop(); return;
    }

    const time = this._perfNow();
    const dtSec = dt / 1000;

    for (const target of this._targets) {
      // Tracking mode: move targets
      if (target.vel) {
        const pos = target.mesh.position;
        pos.addScaledVector(target.vel, dtSec);
        const b = this._roomBounds;
        if (pos.x < b.minX) { pos.x = b.minX; target.vel.x *= -1; }
        if (pos.x > b.maxX) { pos.x = b.maxX; target.vel.x *= -1; }
        if (pos.y < b.minY) { pos.y = b.minY; target.vel.y *= -1; }
        if (pos.y > b.maxY) { pos.y = b.maxY; target.vel.y *= -1; }
        if (pos.z < b.minZ) { pos.z = b.minZ; target.vel.z *= -1; }
        if (pos.z > b.maxZ) { pos.z = b.maxZ; target.vel.z *= -1; }
      }
      const ring = target.mesh.userData.ring;
      if (ring) {
        ring.lookAt(this._camera.position);
        const pulse = 1 + Math.sin(time * 0.005) * 0.06;
        ring.scale.set(pulse, pulse, pulse);
        ring.material.opacity = 0.35 + Math.sin(time * 0.008) * 0.12;
      }
    }

    this._hitEffects = this._hitEffects.filter(p => {
      p.userData.vel.y -= 9.8 * dtSec;
      p.position.addScaledVector(p.userData.vel, dtSec);
      p.userData.life -= dtSec * 2.5;
      p.material.opacity = Math.max(0, p.userData.life);
      if (p.userData.life <= 0) {
        this._scene.remove(p); p.geometry.dispose(); p.material.dispose();
        return false;
      }
      return true;
    });

    this._renderer.render(this._scene, this._camera);
  }
}
