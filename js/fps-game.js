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
    this._scene.fog = new THREE.FogExp2(0x1a3845, 0.025);

    this._camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 100);
    this._camera.position.set(0, 0, 0);

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setClearColor(0x1a3845);
    container.appendChild(this._renderer.domElement);

    this._raycaster = new THREE.Raycaster();
    this._screenCenter = new THREE.Vector2(0, 0);

    this._targets = [];
    this._targetGeo = new THREE.SphereGeometry(0.5, 24, 24);
    this._particleGeo = new THREE.SphereGeometry(0.04, 4, 4);
    this._ringGeo = new THREE.RingGeometry(0.55, 0.65, 32);
    this._hitEffects = [];
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._statsObj = {
      kills: 0, misses: 0, combo: 0, maxCombo: 0, bonusPoints: 0,
      avgReaction: 0, accuracy: 0, timeLeft: 0, duration: 0, kpm: 0,
      clickLog: null, mousePath: [], trackTime: 0, trackAccuracy: 0, mode: '',
    };
    this._isTriple = this.mode.includes('triple');
    this._isTracking = this.mode.includes('tracking');
    this._targetCount = this._isTriple ? 3 : 1;

    this._faceTextures = this.faceImages.map(img => this._createCircleFaceTexture(img));

    this._createRoom();

    this._scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(3, 8, 5);
    this._scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-3, -2, -5);
    this._scene.add(dir2);
    const pLight = new THREE.PointLight(0x49d9b2, 0.4, 25);
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
    this._W = 20; this._H = 12; this._D = 20;
    const W = this._W, H = this._H, D = this._D;
    const hW = W / 2, hH = H / 2, hD = D / 2;
    const R = 0.5; // target sphere radius

    // Walls — brighter, slightly reflective
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e4855,
      side: THREE.BackSide,
      roughness: 0.75,
      metalness: 0.1,
    });
    const roomGeo = new THREE.BoxGeometry(W, H, D);
    this._scene.add(new THREE.Mesh(roomGeo, wallMat));

    // Floor grid
    const floorGrid = new THREE.GridHelper(W, 20, 0x2a7080, 0x1a5060);
    floorGrid.position.y = -hH;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.35;
    this._scene.add(floorGrid);

    // Wall grid lines for depth perception
    const gridMat = new THREE.LineBasicMaterial({ color: 0x2a6070, transparent: true, opacity: 0.15 });
    const step = 2;
    // Floor lines
    for (let z = -hD; z <= hD; z += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hW, -hH, z), new THREE.Vector3(hW, -hH, z)
      ]);
      this._scene.add(new THREE.Line(g, gridMat));
    }
    for (let x = -hW; x <= hW; x += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -hH, -hD), new THREE.Vector3(x, -hH, hD)
      ]);
      this._scene.add(new THREE.Line(g, gridMat));
    }
    // Back wall grid
    for (let x = -hW; x <= hW; x += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -hH, -hD), new THREE.Vector3(x, hH, -hD)
      ]);
      this._scene.add(new THREE.Line(g, gridMat));
    }
    for (let y = -hH; y <= hH; y += step) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hW, y, -hD), new THREE.Vector3(hW, y, -hD)
      ]);
      this._scene.add(new THREE.Line(g, gridMat));
    }

    // Room edge lines (visible borders)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x49d9b2, transparent: true, opacity: 0.5 });
    const corners = [
      [-hW,-hH,-hD], [hW,-hH,-hD], [hW,-hH,hD], [-hW,-hH,hD],
      [-hW, hH,-hD], [hW, hH,-hD], [hW, hH,hD], [-hW, hH,hD],
    ];
    const edges = [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7],
    ];
    for (const [a, b] of edges) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...corners[a]), new THREE.Vector3(...corners[b])
      ]);
      this._scene.add(new THREE.Line(g, edgeMat));
    }

    // Targets spawn ON the back wall only (the wall player faces)
    // Generous margin from edges to prevent corner spawns
    const m = 3; // margin from wall edges (no corners)
    this._backWall = {
      z: -hD + R,
      xMin: -hW + m, xMax: hW - m,
      yMin: -hH + m, yMax: hH - m,
    };

    // Room bounds for tracking mode bouncing
    this._roomBounds = {
      minX: -hW + R + 0.5, maxX: hW - R - 0.5,
      minY: -hH + R + 0.5, maxY: hH - R - 0.5,
      minZ: -hD + R + 0.5, maxZ: -2,
    };
  }

  _spawnTarget() {
    let x, y, z;
    const minDist = 2.5; // minimum distance between targets
    const bw = this._backWall;

    if (this._isTracking) {
      // Tracking: spawn on back wall, then moves around
      for (let att = 0; att < 40; att++) {
        x = bw.xMin + Math.random() * (bw.xMax - bw.xMin);
        y = bw.yMin + Math.random() * (bw.yMax - bw.yMin);
        z = bw.z;
        if (this._checkNoOverlap(x, y, z, minDist)) break;
      }
    } else {
      // Grid/Triple: spawn ON the back wall only
      for (let att = 0; att < 40; att++) {
        x = bw.xMin + Math.random() * (bw.xMax - bw.xMin);
        y = bw.yMin + Math.random() * (bw.yMax - bw.yMin);
        z = bw.z;
        if (this._checkNoOverlap(x, y, z, minDist)) break;
      }
    }

    let mat;
    if (this._faceTextures.length > 0) {
      const tex = this._faceTextures[Math.floor(Math.random() * this._faceTextures.length)];
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.4,
        metalness: 0.1,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0xe84057, roughness: 0.25, metalness: 0.3,
        emissive: 0x991020, emissiveIntensity: 0.3,
      });
    }
    const sphere = new THREE.Mesh(this._targetGeo, mat);
    sphere.position.set(x, y, z);
    this._scene.add(sphere);

    // Glow ring (shared geometry)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3333, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
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

  _checkNoOverlap(x, y, z, minDist) {
    for (const t of this._targets) {
      const p = t.mesh.position;
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      if (dx * dx + dy * dy + dz * dz < minDist * minDist) return false;
    }
    return true;
  }

  _removeTarget(target) {
    const ring = target.mesh.userData.ring;
    if (ring) { ring.material.dispose(); }
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
    this._euler.set(this._pitch, this._yaw, 0);
    this._camera.quaternion.setFromEuler(this._euler);
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
      const mat = new THREE.MeshBasicMaterial({ color: 0xe84057, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(this._particleGeo, mat);
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
    const s = this._statsObj;
    const total = this.kills + this.misses;
    s.kills = this.kills;
    s.misses = this.misses;
    s.combo = this.combo;
    s.maxCombo = this.maxCombo;
    s.bonusPoints = this.bonusPoints;
    s.avgReaction = this.reactionTimes.length
      ? Math.round(this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length) : 0;
    s.accuracy = total > 0 ? Math.round((this.kills / total) * 100) : 0;
    s.timeLeft = this.timeLeft;
    s.duration = this.duration;
    const elapsed = this.duration - this.timeLeft;
    s.kpm = elapsed > 0 ? Math.round((this.kills / elapsed) * 60) : 0;
    s.clickLog = this._clickLog;
    s.mode = this.mode;
    return s;
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
    for (const p of this._hitEffects) { this._scene.remove(p); p.material.dispose(); }
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
    for (const p of this._hitEffects) { this._scene.remove(p); p.material.dispose(); }
    this._targetGeo.dispose();
    this._particleGeo.dispose();
    this._ringGeo.dispose();
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
        this._scene.remove(p); p.material.dispose();
        return false;
      }
      return true;
    });

    this._renderer.render(this._scene, this._camera);
  }
}
