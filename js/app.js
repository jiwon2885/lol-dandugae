/* ===== App Controller ===== */
(() => {
  // --- Supabase Auth ---
  const SUPABASE_URL = 'https://kksnddwgfnxaztboegax.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrc25kZHdnZm54YXp0Ym9lZ2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDA1MDcsImV4cCI6MjA5NjU3NjUwN30.Ba-t8iFrjJXpwV_vxUaEzdDzHtmIkv0WaMs5ZJWoTXA';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- DOM refs ---
  const screens = {
    login: document.getElementById('screen-login'),
    mode: document.getElementById('screen-mode'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
    ranking: document.getElementById('screen-ranking'),
  };

  const el = {
    btnGoogleLogin: document.getElementById('btn-google-login'),
    loginError: document.getElementById('login-error'),
    loginLoading: document.getElementById('login-loading'),

    lobbyNickname: document.getElementById('lobby-nickname'),
    facePreview: document.getElementById('face-preview'),
    btnStart: document.getElementById('btn-start'),
    btnRanking: document.getElementById('btn-ranking'),

    canvas: document.getElementById('game-canvas'),
    hudTime: document.getElementById('hud-time'),
    hudKills: document.getElementById('hud-kills'),
    hudCombo: document.getElementById('hud-combo'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNum: document.getElementById('countdown-num'),

    resultGrade: document.getElementById('result-grade'),
    resultScore: document.getElementById('result-score'),
    resultBestBadge: document.getElementById('result-best-badge'),
    resKills: document.getElementById('res-kills'),
    resAccuracy: document.getElementById('res-accuracy'),
    resCombo: document.getElementById('res-combo'),
    resKpm: document.getElementById('res-kpm'),
    btnRetry: document.getElementById('btn-retry'),
    btnToLobby: document.getElementById('btn-to-lobby'),

    pauseOverlay: document.getElementById('pause-overlay'),
    pauseDesc: document.getElementById('pause-desc'),
    btnResume: document.getElementById('btn-resume'),
    btnPauseLobby: document.getElementById('btn-pause-lobby'),
    btnPause: document.getElementById('btn-pause'),

    rankingBody: document.getElementById('ranking-body'),
    rankingEmpty: document.getElementById('ranking-empty'),
    btnRankingBack: document.getElementById('btn-ranking-back'),
  };

  // --- State ---
  let currentNickname = '';
  let currentProfile = null;
  let gameEngine = null;
  let bgImage = null;
  let activeCountdownInterval = null;
  let currentMode = 'grid'; // 'grid' | 'triple' | 'tracking'

  // Load background image
  const bgImg = new Image();
  bgImg.onload = () => { bgImage = bgImg; };
  bgImg.src = 'assets/bg.png';

  // Preload fixed face images
  const FACE_FILES = [
    'assets/IMG_8449.png',
    'assets/IMG_8450.png',
    'assets/IMG_8451.png',
    'assets/IMG_8452.png',
    'assets/IMG_8453.png',
    'assets/IMG_8454.png',
    'assets/IMG_8455.png',
    'assets/face_01.png',
    'assets/face_02.png',
    'assets/face_03.png',
    'assets/face_04.png',
    'assets/face_05.png',
    'assets/face_06.png',
    'assets/face_07.png',
    'assets/face_08.png',
    'assets/face_09.png',
    'assets/face_10.png',
    'assets/face_11.png',
  ];
  const faceImages = [];
  const selectedFaces = new Set(); // indices of selected faces
  let facesLoaded = 0;
  FACE_FILES.forEach((src, idx) => {
    const img = new Image();
    img.onload = () => {
      facesLoaded++;
      faceImages[idx] = img;
      renderFacePreviews();
    };
    img.src = src;
  });

  // Particle system references (initialized at bottom)
  let loginParticles = null;
  let resultParticlesCtrl = null;

  // --- Screen management ---
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    // Manage ambient particles
    if (loginParticles) {
      if (name === 'login') loginParticles.start(); else loginParticles.stop();
    }
    if (name !== 'result' && resultParticlesCtrl) {
      resultParticlesCtrl.stop();
    }
  }

  // ========== AUTH STATE ==========
  let currentUserId = null;
  let authResolved = false; // true once we know if user is logged in or not

  const GOOGLE_BTN_HTML = '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.003 24.003 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Google로 로그인';

  function showLoginButton() {
    el.loginLoading.style.display = 'none';
    el.btnGoogleLogin.style.display = '';
    el.btnGoogleLogin.disabled = false;
    el.btnGoogleLogin.innerHTML = GOOGLE_BTN_HTML;
  }

  function onAuthSuccess(user) {
    if (authResolved) return;
    authResolved = true;
    currentUserId = user.id || user.email;

    // Hide login UI completely
    el.loginLoading.style.display = 'none';
    el.btnGoogleLogin.style.display = 'none';
    el.loginError.textContent = '';

    const meta = user.user_metadata || {};
    const nick = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Player');
    currentNickname = nick;

    if (!Storage.getProfile(nick)) {
      Storage.createProfile(nick, null);
    }
    currentProfile = Storage.getProfile(nick);
    enterModeSelect();

    // Ban check — non-blocking, runs after entering mode select
    checkBanForUser(currentUserId).catch(() => {});
  }

  // ========== AUTH INIT: try getSession first, fallback to onAuthStateChange ==========
  // Step 1: Show loading
  el.loginLoading.style.display = 'block';
  el.btnGoogleLogin.style.display = 'none';

  // Step 2: Try getSession (works for existing sessions + OAuth redirects with hash)
  supabase.auth.getSession()
    .then(({ data }) => {
      if (authResolved) return;
      if (data && data.session && data.session.user) {
        onAuthSuccess(data.session.user);
      } else {
        showLoginButton();
      }
    })
    .catch((err) => {
      console.error('[Auth] getSession failed:', err);
      if (!authResolved) showLoginButton();
    });

  // Step 3: Also listen for auth changes (catches OAuth popup, token refresh, etc.)
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      onAuthSuccess(session.user);
    }
  });

  // Step 4: Hard failsafe — if nothing resolves in 3 seconds, show login button
  setTimeout(() => {
    if (!authResolved) showLoginButton();
  }, 3000);

  // ========== GOOGLE LOGIN BUTTON ==========
  el.btnGoogleLogin.addEventListener('click', async () => {
    el.loginError.textContent = '';
    el.btnGoogleLogin.disabled = true;
    el.btnGoogleLogin.textContent = '로그인 중...';

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      });

      if (error) {
        el.loginError.textContent = 'Google 로그인 실패: ' + error.message;
        showLoginButton();
      }
      // If no error, the page will redirect to Google
    } catch (err) {
      el.loginError.textContent = '로그인 오류: ' + err.message;
      showLoginButton();
    }
  });

  // ========== MODE SELECT ==========
  function enterModeSelect() {
    showScreen('mode');
  }

  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      currentMode = card.dataset.mode;
      selectedFaces.clear();
      domBuilt = false;
      enterLobby();
    });
  });

  // ========== LOBBY ==========
  const MODE_MAX_FACES = { grid: Infinity, triple: Infinity, tracking: Infinity };
  const MODE_LABELS = { grid: 'Grid Shot', triple: 'Triple Shot', tracking: 'Tracking' };
  const MODE_DURATION = { grid: 30, triple: 30, tracking: 60 };

  function enterLobby() {
    showScreen('lobby');
    el.lobbyNickname.textContent = currentNickname;

    // Show mode name at top
    const modeName = document.getElementById('lobby-mode-name');
    if (modeName) modeName.textContent = MODE_LABELS[currentMode] || '';

    // Update game time & target size display
    const dur = MODE_DURATION[currentMode] || 30;
    const tSize = currentMode === 'tracking' ? 100 : 120;
    const infoVals = document.querySelectorAll('.lobby-info-value');
    if (infoVals[0]) infoVals[0].textContent = dur + '초';
    if (infoVals[1]) infoVals[1].textContent = tSize + 'px';

    renderFacePreviews();
    renderLobbyHistory(currentMode);
  }

  let faceWraps = {}; // persistent DOM references by index
  let domBuilt = false;

  function buildFaceDom() {
    el.facePreview.innerHTML = '';
    faceWraps = {};
    FACE_FILES.forEach((src, idx) => {
      if (!faceImages[idx]) return;
      const wrap = document.createElement('div');
      wrap.className = 'face-thumb-wrap';
      wrap.addEventListener('click', () => toggleFace(idx));
      const img = document.createElement('img');
      img.className = 'face-thumb';
      img.src = faceImages[idx].src;
      wrap.appendChild(img);
      el.facePreview.appendChild(wrap);
      faceWraps[idx] = wrap;
    });
    domBuilt = true;
  }

  function renderFacePreviews(animateIdx) {
    // Rebuild DOM if new images loaded since last build
    const loadedCount = faceImages.filter(Boolean).length;
    if (!domBuilt || Object.keys(faceWraps).length !== loadedCount) {
      buildFaceDom();
    }
    // Update classes
    for (const idx in faceWraps) {
      const wrap = faceWraps[idx];
      if (selectedFaces.has(Number(idx))) {
        wrap.classList.add('selected');
        if (Number(idx) === animateIdx) {
          wrap.classList.remove('face-pop');
          void wrap.offsetWidth;
          wrap.classList.add('face-pop');
        }
      } else {
        wrap.classList.remove('selected', 'face-pop');
      }
    }
    updateFaceCount();
  }

  function toggleFace(idx) {
    if (selectedFaces.has(idx)) {
      selectedFaces.delete(idx);
      renderFacePreviews(-1);
    } else {
      const maxFaces = MODE_MAX_FACES[currentMode] || Infinity;
      if (selectedFaces.size >= maxFaces) {
        // Replace: deselect the first selected, then select new
        if (maxFaces === 1) {
          selectedFaces.clear();
        } else {
          const first = selectedFaces.values().next().value;
          selectedFaces.delete(first);
        }
      }
      selectedFaces.add(idx);
      renderFacePreviews(idx);
    }
  }

  function updateFaceCount() {
    const count = selectedFaces.size;
    const maxFaces = MODE_MAX_FACES[currentMode] || Infinity;
    const maxLabel = maxFaces === Infinity ? '' : ' / 최대 ' + maxFaces + '명';
    document.getElementById('face-count-desc').textContent = count + '명 선택됨' + maxLabel;
    const warn = document.getElementById('face-warn');
    if (count < 1) {
      warn.style.display = 'block';
      warn.textContent = '처형 대상을 1명 이상 선택해주세요!';
      el.btnStart.disabled = true;
    } else {
      warn.style.display = 'none';
      el.btnStart.disabled = false;
    }
  }

  function getSelectedFaceImages() {
    return faceImages.filter((_, idx) => selectedFaces.has(idx));
  }

  // Mode change button
  document.getElementById('btn-change-mode').addEventListener('click', () => enterModeSelect());

  // Face selection buttons
  document.getElementById('btn-select-all').addEventListener('click', () => {
    faceImages.forEach((img, idx) => { if (img) selectedFaces.add(idx); });
    renderFacePreviews(-1);
  });
  document.getElementById('btn-deselect-all').addEventListener('click', () => {
    selectedFaces.clear();
    renderFacePreviews(-1);
  });

  // ========== SETTINGS MODAL ==========
  const settingsOverlay = document.getElementById('settings-overlay');
  document.getElementById('btn-settings').addEventListener('click', () => {
    settingsOverlay.classList.add('active');
  });
  document.getElementById('btn-settings-close').addEventListener('click', () => {
    settingsOverlay.classList.remove('active');
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('active');
  });

  // ========== SETTINGS ==========
  const volBgm = document.getElementById('vol-bgm');
  const volBgmVal = document.getElementById('vol-bgm-val');
  const volSfx = document.getElementById('vol-sfx');
  const volSfxVal = document.getElementById('vol-sfx-val');
  const pauseVolBgm = document.getElementById('pause-vol-bgm');
  const pauseVolBgmVal = document.getElementById('pause-vol-bgm-val');
  const pauseVolSfx = document.getElementById('pause-vol-sfx');
  const pauseVolSfxVal = document.getElementById('pause-vol-sfx-val');

  // Load saved settings
  const saved = JSON.parse(localStorage.getItem('loldandugae_settings') || '{}');
  if (saved.bgm != null) {
    volBgm.value = saved.bgm; volBgmVal.textContent = saved.bgm;
    pauseVolBgm.value = saved.bgm; pauseVolBgmVal.textContent = saved.bgm;
    AudioManager.setBgmVolume(saved.bgm / 100);
  }
  if (saved.sfx != null) {
    volSfx.value = saved.sfx; volSfxVal.textContent = saved.sfx;
    pauseVolSfx.value = saved.sfx; pauseVolSfxVal.textContent = saved.sfx;
    AudioManager.setSfxVolume(saved.sfx / 100);
  }

  function saveSettings() {
    localStorage.setItem('loldandugae_settings', JSON.stringify({
      bgm: Number(volBgm.value),
      sfx: Number(volSfx.value),
      cursor: currentCursor,
    }));
  }

  // Sync both settings panels (lobby + pause)
  function syncBgmVolume(val) {
    volBgm.value = val; volBgmVal.textContent = val;
    pauseVolBgm.value = val; pauseVolBgmVal.textContent = val;
    AudioManager.setBgmVolume(Number(val) / 100);
    saveSettings();
  }
  function syncSfxVolume(val) {
    volSfx.value = val; volSfxVal.textContent = val;
    pauseVolSfx.value = val; pauseVolSfxVal.textContent = val;
    AudioManager.setSfxVolume(Number(val) / 100);
    saveSettings();
  }

  volBgm.addEventListener('input', () => syncBgmVolume(volBgm.value));
  volSfx.addEventListener('input', () => syncSfxVolume(volSfx.value));
  pauseVolBgm.addEventListener('input', () => syncBgmVolume(pauseVolBgm.value));
  pauseVolSfx.addEventListener('input', () => syncSfxVolume(pauseVolSfx.value));

  // Cursor style
  let currentCursor = saved.cursor || 'crosshair';
  const cursorBtns = document.querySelectorAll('.btn-cursor');

  const CURSOR_MAP = {
    crosshair: 'crosshair',
    default: 'default',
    dot: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='6' fill='%2349d9b2'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%2349d9b2' opacity='0.4' stroke='%2349d9b2' stroke-width='2'/%3E%3C/svg%3E\") 16 16, crosshair",
    shield: "url('assets/cursor_shield.png') 4 4, crosshair",
    gauntlet: "url('assets/cursor_gauntlet.png') 16 16, crosshair",
  };

  function applyCursor(type) {
    currentCursor = type;
    cursorBtns.forEach(b => b.classList.toggle('active', b.dataset.cursor === type));
    document.getElementById('screen-game').style.cursor = CURSOR_MAP[type] || 'crosshair';
  }
  applyCursor(currentCursor);

  cursorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyCursor(btn.dataset.cursor);
      saveSettings();
    });
  });

  // Start game
  el.btnStart.addEventListener('click', () => {
    if (selectedFaces.size < 1) return;
    startGame();
  });

  // Ranking
  el.btnRanking.addEventListener('click', () => showRanking());

  // ========== GAME ==========
  function startGame() {
    // Toggle HUD items based on mode
    const isTracking = currentMode === 'tracking';
    document.querySelectorAll('.hud-tracking').forEach(el => el.style.display = isTracking ? '' : 'none');
    document.querySelectorAll('.hud-grid').forEach(el => el.style.display = isTracking ? 'none' : '');

    // Set in-game mode badge
    const hudModeBadge = document.getElementById('hud-mode-badge');
    if (hudModeBadge) hudModeBadge.textContent = MODE_LABELS[currentMode] || '';

    // Reset urgency state
    hudUrgent = false;
    el.hudTime.classList.remove('urgent');
    if (vignetteEl) vignetteEl.classList.remove('active');

    // Force fullscreen to prevent window shrinking exploit
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showScreen('game');

    // Set canvas size before countdown (engine will draw bg on start)
    const cvs = el.canvas;
    const sw = window.screen.width;
    const sh = window.screen.height;
    cvs.width = sw;
    cvs.height = sh;
    cvs.style.width = sw + 'px';
    cvs.style.height = sh + 'px';
    if (bgImage) {
      const cx = cvs.getContext('2d');
      const scale = Math.max(sw / bgImage.width, sh / bgImage.height);
      const w = bgImage.width * scale;
      const h = bgImage.height * scale;
      cx.drawImage(bgImage, (sw - w) / 2, (sh - h) / 2, w, h);
      cx.fillStyle = 'rgba(10, 14, 20, 0.35)';
      cx.fillRect(0, 0, sw, sh);
    }

    // Start BGM + Audio context
    AudioManager.init();
    AudioManager.startBGM();

    // Countdown
    el.countdownOverlay.classList.add('active');
    let count = 3;
    el.countdownNum.textContent = count;
    AudioManager.playCountdownBeep(false);

    if (activeCountdownInterval) clearInterval(activeCountdownInterval);
    activeCountdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        el.countdownNum.textContent = count;
        el.countdownNum.style.animation = 'none';
        void el.countdownNum.offsetWidth;
        el.countdownNum.style.animation = 'countPulse 0.6s ease-out';
        AudioManager.playCountdownBeep(false);
      } else if (count === 0) {
        el.countdownNum.textContent = 'GO!';
        el.countdownNum.style.animation = 'none';
        void el.countdownNum.offsetWidth;
        el.countdownNum.style.animation = 'countPulse 0.6s ease-out';
        AudioManager.playCountdownBeep(true);
      } else {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
        el.countdownOverlay.classList.remove('active');
        launchEngine();
      }
    }, 800);
  }

  function launchEngine() {
    // Destroy previous engine to prevent duplicate event listeners
    if (gameEngine) {
      gameEngine.destroy();
      gameEngine = null;
    }
    const gameDuration = MODE_DURATION[currentMode] || 30;
    gameEngine = new GameEngine(el.canvas, {
      mode: currentMode,
      faceImages: getSelectedFaceImages(),
      duration: gameDuration,
      targetSize: currentMode === 'tracking' ? 100 : 120,
      bgImage,
      onTick: (stats) => updateHUD(stats),
      onEnd: (stats) => showResult(stats),
    });
    gameEngine.start();
    pauseCount = 0;
    updateHUD({ timeLeft: gameDuration, kills: 0, combo: 0, avgReaction: 0, trackTime: 0, trackAccuracy: 0 });
  }

  // Cache HUD DOM elements looked up every frame
  const hudTrackTime = document.getElementById('hud-track-time');
  const hudTrackAcc = document.getElementById('hud-track-acc');
  const vignetteEl = document.getElementById('urgency-vignette');
  let hudUrgent = false; // track urgency state to avoid redundant DOM ops

  function updateHUD(stats) {
    el.hudTime.textContent = typeof stats.timeLeft === 'number' ? stats.timeLeft.toFixed(1) : stats.timeLeft;

    el.hudKills.textContent = stats.kills;
    el.hudCombo.textContent = stats.combo;

    if (currentMode === 'tracking') {
      if (hudTrackTime) hudTrackTime.textContent = ((stats.trackTime || 0) / 1000).toFixed(1) + 's';
      if (hudTrackAcc) hudTrackAcc.textContent = (stats.trackAccuracy || 0) + '%';
    }

    const shouldUrgent = stats.timeLeft <= 5;
    if (shouldUrgent !== hudUrgent) {
      hudUrgent = shouldUrgent;
      if (shouldUrgent) {
        el.hudTime.style.color = '#e84057';
        el.hudTime.classList.add('urgent');
        if (vignetteEl) vignetteEl.classList.add('active');
      } else {
        el.hudTime.style.color = '';
        el.hudTime.classList.remove('urgent');
        if (vignetteEl) vignetteEl.classList.remove('active');
      }
    }
  }

  // Count-up animation helper
  function animateCountUp(el, target, suffix, duration) {
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const val = Math.round(from + (target - from) * eased);
      el.textContent = val + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ========== RESULT ==========
  const endOverlay = document.getElementById('game-end-overlay');
  const resultPersonalBest = document.getElementById('result-personal-best');

  function showResult(stats) {
    AudioManager.stopBGM();

    // Game end overlay animation
    endOverlay.classList.add('active');

    // Wait for end animation, then transition to result
    setTimeout(() => {
      endOverlay.classList.remove('active');
      if (gameEngine) {
        gameEngine.destroy();
        gameEngine = null;
      }
      showScreen('result');
    }, 1400);

    const grade = calcGrade(stats);
    const effectiveAccuracy = (currentMode === 'tracking' && stats.trackAccuracy != null)
      ? stats.trackAccuracy : stats.accuracy;

    // Update profile
    const isBest = stats.kills > (currentProfile.bestScore || 0);
    Storage.updateProfile(currentNickname, {
      totalPlays: (currentProfile.totalPlays || 0) + 1,
      bestScore: Math.max(currentProfile.bestScore || 0, stats.kills),
      bestReactionMs: Math.min(currentProfile.bestReactionMs || 9999, stats.avgReaction || 9999),
      totalKills: (currentProfile.totalKills || 0) + stats.kills,
      bestGrade: betterGrade(currentProfile.bestGrade || 'C', grade),
    });
    currentProfile = Storage.getProfile(currentNickname);

    // Save score (check if banned by anti-cheat)
    const submitAccuracy = (currentMode === 'tracking' && stats.trackAccuracy != null)
      ? stats.trackAccuracy : stats.accuracy;
    Storage.addScore({
      nickname: currentNickname,
      userId: currentUserId,
      kills: stats.kills,
      durationSec: stats.duration,
      reactionMs: stats.avgReaction,
      accuracy: submitAccuracy,
      maxCombo: stats.maxCombo,
      bonusPoints: stats.bonusPoints,
      grade,
      kpm: stats.kpm,
      mode: currentMode,
      clickLog: stats.clickLog || [],
      mousePath: stats.mousePath || [],
    }).then(result => {
      if (result && result.banned) {
        // Server detected cheating — show ban screen
        checkBanForUser(currentUserId);
      }
    });

    // Use the same calcScore as storage (single source of truth)
    const totalScore = Storage.calcScore({
      kills: stats.kills,
      accuracy: effectiveAccuracy,
      maxCombo: stats.maxCombo,
      reactionMs: stats.avgReaction,
      mode: currentMode,
    });

    // Tracking mode: show tracking accuracy instead of click accuracy
    const displayAccuracy = (currentMode === 'tracking' && stats.trackAccuracy != null)
      ? stats.trackAccuracy : stats.accuracy;

    // Render result with count-up animation
    const resultCard = document.querySelector('.result-card');
    resultCard.classList.remove('reveal');

    el.resultGrade.textContent = grade;
    el.resultGrade.className = 'grade grade-' + grade.toLowerCase().replace('+', 'plus');
    el.resultScore.textContent = '0pt';
    el.resultBestBadge.style.display = 'none';
    el.resKills.textContent = '0';
    el.resAccuracy.textContent = '0%';
    el.resCombo.textContent = '0';
    el.resKpm.textContent = '0';

    // Tracking mode: compute trackTime in seconds
    const trackTimeSec = currentMode === 'tracking' ? Math.round((stats.trackTime || 0) / 1000) : 0;

    // Trigger reveal animation + grade particles
    requestAnimationFrame(() => {
      resultCard.classList.add('reveal');
      startResultParticles(grade);
      // Count-up score
      animateCountUp(el.resultScore, totalScore, 'pt', 600);
      // Count-up stats (staggered)
      setTimeout(() => {
        animateCountUp(el.resKills, stats.kills, '', 400);
        animateCountUp(el.resAccuracy, displayAccuracy, '%', 400);
        if (currentMode === 'tracking') {
          animateCountUp(el.resCombo, trackTimeSec, '초', 400);
        } else {
          animateCountUp(el.resCombo, stats.maxCombo, '', 400);
        }
        animateCountUp(el.resKpm, stats.kpm, '', 400);
      }, 500);
      // Show best badge after count-up
      setTimeout(() => {
        el.resultBestBadge.style.display = isBest && stats.kills > 0 ? 'inline-block' : 'none';
      }, 800);
    });

    // Update stat labels for tracking mode
    const statLabels = document.querySelectorAll('.stat-label');
    if (currentMode === 'tracking') {
      if (statLabels[0]) statLabels[0].textContent = '\ucc98\uce58 \uc218';
      if (statLabels[1]) statLabels[1].textContent = '\ud2b8\ub798\ud0b9 \uc815\ud655\ub3c4';
      if (statLabels[2]) statLabels[2].textContent = '\ud2b8\ub798\ud0b9 \uc2dc\uac04';
      if (statLabels[3]) statLabels[3].textContent = '\ubd84\ub2f9 \ucc98\uce58';
    } else {
      if (statLabels[0]) statLabels[0].textContent = '\uaca9\ud30c \uc218';
      if (statLabels[1]) statLabels[1].textContent = '\uc815\ud655\ub3c4';
      if (statLabels[2]) statLabels[2].textContent = '\ucd5c\ub300 \ucf64\ubcf4';
      if (statLabels[3]) statLabels[3].textContent = '\ubd84\ub2f9 \uaca9\ud30c';
    }

    // Save to history & render chart
    saveToHistory(currentMode, {
      score: totalScore,
      kills: stats.kills,
      accuracy: displayAccuracy,
      maxCombo: stats.maxCombo,
      kpm: stats.kpm,
      trackTimeSec: currentMode === 'tracking' ? trackTimeSec : undefined,
      grade,
      ts: Date.now(),
    });

    // Show personal best
    const history = getHistory(currentMode);
    const allScores = history.map(h => h.score);
    const personalBest = Math.max(...allScores);
    if (resultPersonalBest) {
      resultPersonalBest.textContent = '\uc790\uae30 \ucd5c\uace0: ' + personalBest + 'pt';
      resultPersonalBest.style.color = totalScore >= personalBest ? '#f0d48a' : '';
    }

    // Render history chart (delay for end overlay + screen transition + reveal anim)
    setTimeout(() => renderResultHistory(currentMode, totalScore), 1600);
  }

  // Mode-specific grade thresholds (balanced to similar difficulty)
  const GRADE_THRESHOLDS = {
    grid:     { 'S+': 700, S: 680, A: 500, B: 300 },
    triple:   { 'S+': 900, S: 850, A: 650, B: 400 },
    tracking: { 'S+': 600, S: 550, A: 400, B: 250 },
  };

  function calcGrade(stats) {
    const acc = (currentMode === 'tracking' && stats.trackAccuracy != null)
      ? stats.trackAccuracy : stats.accuracy;
    const score = Storage.calcScore({
      kills: stats.kills,
      accuracy: acc,
      maxCombo: stats.maxCombo,
      reactionMs: stats.avgReaction,
      mode: currentMode,
    });
    const t = GRADE_THRESHOLDS[currentMode] || GRADE_THRESHOLDS.grid;
    if (score >= t['S+']) return 'S+';
    if (score >= t.S) return 'S';
    if (score >= t.A) return 'A';
    if (score >= t.B) return 'B';
    return 'C';
  }

  const gradeOrder = ['C', 'B', 'A', 'S', 'S+'];
  function betterGrade(a, b) {
    return gradeOrder.indexOf(a) >= gradeOrder.indexOf(b) ? a : b;
  }

  // ========== GAME HISTORY (localStorage) ==========
  const HISTORY_KEY = 'guillotine_history';
  const MAX_HISTORY = 5;

  function getHistory(mode) {
    try {
      const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return all[mode] || [];
    } catch { return []; }
  }

  function saveToHistory(mode, entry) {
    try {
      const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      if (!all[mode]) all[mode] = [];
      all[mode].push(entry);
      if (all[mode].length > MAX_HISTORY) all[mode] = all[mode].slice(-MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch {}
  }

  function drawHistoryChart(canvasId, data, highlightLast) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const scores = data.map(d => d.score);
    const maxS = Math.max(...scores);
    const minS = Math.min(...scores);
    const range = maxS - minS || 1;
    const padT = 12, padB = 22, padL = 4, padR = 4;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    function getX(i) { return padL + (i / (scores.length - 1)) * plotW; }
    function getY(v) { return padT + plotH - ((v - minS) / range) * plotH; }

    // Average line
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgY = getY(avg);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(w - padR, avgY);
    ctx.strokeStyle = 'rgba(200,169,110,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Area fill
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(scores[0]));
    for (let i = 1; i < scores.length; i++) {
      const cx = (getX(i - 1) + getX(i)) / 2;
      ctx.bezierCurveTo(cx, getY(scores[i - 1]), cx, getY(scores[i]), getX(i), getY(scores[i]));
    }
    ctx.lineTo(getX(scores.length - 1), h);
    ctx.lineTo(getX(0), h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(200,169,110,0.15)');
    grad.addColorStop(1, 'rgba(200,169,110,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(scores[0]));
    for (let i = 1; i < scores.length; i++) {
      const cx = (getX(i - 1) + getX(i)) / 2;
      ctx.bezierCurveTo(cx, getY(scores[i - 1]), cx, getY(scores[i]), getX(i), getY(scores[i]));
    }
    ctx.strokeStyle = 'rgba(200,169,110,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points
    for (let i = 0; i < scores.length; i++) {
      const x = getX(i);
      const y = getY(scores[i]);
      const isLast = highlightLast && i === scores.length - 1;
      const isBest = scores[i] === maxS;

      ctx.beginPath();
      ctx.arc(x, y, isLast ? 5 : isBest ? 4 : 2.5, 0, Math.PI * 2);
      if (isLast) {
        ctx.fillStyle = '#f0d48a';
        ctx.shadowColor = 'rgba(240,212,138,0.6)';
        ctx.shadowBlur = 10;
      } else if (isBest) {
        ctx.fillStyle = '#c8a96e';
        ctx.shadowColor = 'rgba(200,169,110,0.4)';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = 'rgba(200,169,110,0.5)';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // Score label below every point
      ctx.font = isLast ? '700 11px Inter, sans-serif' : '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isLast ? '#f0d48a' : isBest ? '#c8a96e' : 'rgba(200,169,110,0.6)';
      ctx.fillText(scores[i], x, y + (isLast ? 16 : isBest ? 15 : 14));
    }
  }

  function renderResultHistory(mode, currentScore) {
    const history = getHistory(mode);
    const section = document.getElementById('history-section');
    if (history.length < 2) {
      // Show hint that chart needs more games
      section.style.display = '';
      const chartCanvas = document.getElementById('history-chart');
      if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = chartCanvas.clientWidth;
        const h = chartCanvas.clientHeight;
        chartCanvas.width = w * dpr;
        chartCanvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(200,169,110,0.4)';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('2\uD310 \uC774\uC0C1 \uD50C\uB808\uC774\uD558\uBA74 \uADF8\uB798\uD504\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4', w / 2, h / 2);
      }
      // Hide stats until we have data
      const histBest = document.getElementById('history-best');
      const histAvg = document.getElementById('history-avg');
      const histTrend = document.getElementById('history-trend');
      if (histBest) histBest.textContent = '';
      if (histAvg) histAvg.textContent = '';
      if (histTrend) histTrend.textContent = '';
      return;
    }
    section.style.display = '';

    // Draw chart
    drawHistoryChart('history-chart', history, true);

    // Stats
    const scores = history.map(d => d.score);
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    document.getElementById('history-best').textContent = '\ucd5c\uace0 ' + best + 'pt';
    document.getElementById('history-avg').textContent = '\ud3c9\uade0 ' + avg + 'pt';

    // Trend (compare last 3 vs previous 3)
    const trendEl = document.getElementById('history-trend');
    if (scores.length >= 4) {
      const recent = scores.slice(-3);
      const older = scores.slice(-6, -3);
      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = Math.round(recentAvg - olderAvg);
        if (diff > 0) {
          trendEl.textContent = '\u25b2 ' + diff + 'pt \uc0c1\uc2b9\uc138';
          trendEl.className = 'history-trend up';
        } else if (diff < 0) {
          trendEl.textContent = '\u25bc ' + Math.abs(diff) + 'pt \ud558\ub77d\uc138';
          trendEl.className = 'history-trend down';
        } else {
          trendEl.textContent = '- \uc720\uc9c0';
          trendEl.className = 'history-trend flat';
        }
      } else {
        trendEl.textContent = '';
      }
    } else {
      trendEl.textContent = '';
    }
  }

  function renderLobbyHistory(mode) {
    const history = getHistory(mode);
    const card = document.getElementById('lobby-history');
    if (history.length < 2) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    document.getElementById('lobby-history-count').textContent = '\ucd5c\uadfc ' + history.length + '\ud310';

    drawHistoryChart('lobby-history-chart', history, false);

    const scores = history.map(d => d.score);
    const best = Math.max(...scores);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    document.getElementById('lobby-hist-best').textContent = '\ucd5c\uace0 ' + best + 'pt';
    document.getElementById('lobby-hist-avg').textContent = '\ud3c9\uade0 ' + avg + 'pt';

    const trendEl = document.getElementById('lobby-hist-trend');
    if (scores.length >= 4) {
      const recent = scores.slice(-3);
      const older = scores.slice(-6, -3);
      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = Math.round(recentAvg - olderAvg);
        if (diff > 0) {
          trendEl.textContent = '\u25b2 \uc0c1\uc2b9\uc138';
          trendEl.style.color = '#49d9b2';
        } else if (diff < 0) {
          trendEl.textContent = '\u25bc \ud558\ub77d\uc138';
          trendEl.style.color = '#e84057';
        } else {
          trendEl.textContent = '- \uc720\uc9c0';
          trendEl.style.color = '';
        }
      } else {
        trendEl.textContent = '';
      }
    } else {
      trendEl.textContent = '';
    }
  }

  el.btnRetry.addEventListener('click', () => startGame());
  el.btnToLobby.addEventListener('click', () => enterLobby());

  // ========== RANKING ==========
  const podiumEl = document.getElementById('podium');
  let rankingMode = 'grid';

  // Ranking tab switching
  document.querySelectorAll('.ranking-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      rankingMode = tab.dataset.mode;
      document.querySelectorAll('.ranking-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === rankingMode));
      loadRankingData(rankingMode);
    });
  });

  async function showRanking() {
    showScreen('ranking');
    rankingMode = currentMode;
    // Set active tab
    document.querySelectorAll('.ranking-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === rankingMode));
    // Show mode label
    const modeLabel = document.getElementById('ranking-mode-label');
    if (modeLabel) modeLabel.textContent = MODE_LABELS[rankingMode] || '';
    loadRankingData(rankingMode);
  }

  async function loadRankingData(mode) {
    el.rankingBody.innerHTML = '';
    podiumEl.innerHTML = '';
    el.rankingEmpty.style.display = 'none';
    el.rankingEmpty.textContent = '로딩 중...';
    el.rankingEmpty.style.display = 'block';

    // Update mode label
    const modeLabel = document.getElementById('ranking-mode-label');
    if (modeLabel) modeLabel.textContent = MODE_LABELS[mode] || '';

    const rankings = await Storage.getRankings(mode);

    if (rankings.length === 0) {
      el.rankingBody.innerHTML = '';
      podiumEl.innerHTML = '';
      el.rankingEmpty.textContent = '아직 기록이 없습니다.';
      el.rankingEmpty.style.display = 'block';
      return;
    }

    el.rankingEmpty.style.display = 'none';

    // Top 3 podium
    const top3 = rankings.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd visual order
    podiumEl.innerHTML = podiumOrder.map(i => {
      const r = top3[i];
      if (!r) return '';
      const isMe = r.nickname === currentNickname;
      return `
        <div class="podium-card podium-${i + 1}${isMe ? ' podium-me' : ''}">
          <div class="podium-medal">${medals[i]}</div>
          <div class="podium-rank">${i + 1}</div>
          <div class="podium-name">${escapeHtml(r.nickname)}</div>
          <div class="podium-score">${escapeHtml(String(r.score || 0))}pt</div>
          <div class="podium-details">
            <span>${escapeHtml(String(r.kills))}격파</span>
            <span>${escapeHtml(String(r.accuracy))}%</span>
            <span>${escapeHtml(String(r.grade))}</span>
          </div>
          <div class="podium-pillar podium-pillar-${i + 1}"></div>
        </div>`;
    }).join('');

    // Rest of rankings (4th+)
    const rest = rankings.slice(3);
    el.rankingBody.innerHTML = rest.map((r, i) => `
      <tr class="${r.nickname === currentNickname ? 'rank-me' : ''}">
        <td>${i + 4}</td>
        <td>${escapeHtml(r.nickname)}</td>
        <td class="score-cell">${escapeHtml(String(r.score || 0))}</td>
        <td>${escapeHtml(String(r.kills))}</td>
        <td>${escapeHtml(String(r.accuracy))}%</td>
        <td>${escapeHtml(String(r.maxCombo || 0))}</td>
        <td>${escapeHtml(String(r.grade))}</td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  el.btnRankingBack.addEventListener('click', () => enterLobby());

  // ========== PAUSE / RESUME (fullscreen exit detection) ==========
  let gamePaused = false;
  let pauseCount = 0;
  const MAX_PAUSES = 2;

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && gameEngine && gameEngine.running) {
      pauseGame('전체화면이 해제되었습니다');
    }
  });

  // Auto-pause when tab loses visibility (Alt+Tab, minimize, etc.)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    // Stop any active countdown
    if (activeCountdownInterval) {
      clearInterval(activeCountdownInterval);
      activeCountdownInterval = null;
      el.countdownOverlay.classList.remove('active');
    }
    if (gameEngine && gameEngine.running) {
      pauseGame('탭이 비활성화되었습니다');
    }
  });

  el.btnPause.addEventListener('click', () => {
    if (gameEngine && gameEngine.running) {
      pauseGame('');
    }
  });

  function pauseGame(reason) {
    if (!gameEngine || gamePaused) return;
    pauseCount++;
    gamePaused = true;
    gameEngine.pause();

    el.pauseDesc.textContent = reason || '';

    if (pauseCount >= MAX_PAUSES) {
      el.btnResume.style.display = 'none';
    } else {
      el.btnResume.style.display = '';
    }

    el.pauseOverlay.classList.add('active');
  }

  el.btnPauseLobby.addEventListener('click', () => {
    if (!gamePaused) return;
    gamePaused = false;
    if (activeCountdownInterval) { clearInterval(activeCountdownInterval); activeCountdownInterval = null; }
    el.countdownOverlay.classList.remove('active');
    endOverlay.classList.remove('active');
    if (gameEngine) {
      gameEngine.destroy();
      gameEngine = null;
    }
    AudioManager.stopBGM();
    el.pauseOverlay.classList.remove('active');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    enterLobby();
  });

  el.btnResume.addEventListener('click', () => {
    if (!gamePaused) return;
    // Re-enter fullscreen first
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => {
        startResumeCountdown();
      }).catch(() => {
        startResumeCountdown();
      });
    } else {
      startResumeCountdown();
    }
  });

  function startResumeCountdown() {
    el.pauseOverlay.classList.remove('active');
    el.countdownOverlay.classList.add('active');
    let count = 3;
    el.countdownNum.textContent = count;
    AudioManager.playCountdownBeep(false);

    if (activeCountdownInterval) clearInterval(activeCountdownInterval);
    activeCountdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        el.countdownNum.textContent = count;
        el.countdownNum.style.animation = 'none';
        void el.countdownNum.offsetWidth;
        el.countdownNum.style.animation = 'countPulse 0.6s ease-out';
        AudioManager.playCountdownBeep(false);
      } else if (count === 0) {
        el.countdownNum.textContent = 'GO!';
        el.countdownNum.style.animation = 'none';
        void el.countdownNum.offsetWidth;
        el.countdownNum.style.animation = 'countPulse 0.6s ease-out';
        AudioManager.playCountdownBeep(true);
      } else {
        clearInterval(activeCountdownInterval);
        activeCountdownInterval = null;
        el.countdownOverlay.classList.remove('active');
        gamePaused = false;
        if (gameEngine) {
          // Respawn target at new position to prevent pre-aiming
          if (gameEngine.mode === 'triple') {
            for (let i = 0; i < 3; i++) gameEngine._spawnTripleTarget(i);
          } else if (gameEngine.mode === 'tracking') {
            gameEngine._spawnTrackingTarget();
          } else {
            gameEngine._spawnTarget();
          }
          gameEngine.resume();
        }
      }
    }, 800);
  }

  // ========== BLOCK DEVTOOLS & ZOOM + ESC SETTINGS ==========
  document.addEventListener('keydown', (e) => {
    // ESC: open settings in lobby/mode, or do nothing in game (pause handled separately)
    if (e.key === 'Escape') {
      // Close settings if open
      if (settingsOverlay.classList.contains('active')) {
        settingsOverlay.classList.remove('active');
        return;
      }
      // Open settings from lobby or mode select
      const lobbyActive = screens.lobby.classList.contains('active');
      const modeActive = screens.mode.classList.contains('active');
      if (lobbyActive || modeActive) {
        settingsOverlay.classList.add('active');
        return;
      }
    }

    // Block F12, Ctrl+Shift+I/J/C (DevTools shortcuts)
    if (e.key === 'F12') { e.preventDefault(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) { e.preventDefault(); return; }
    // Block Ctrl+U (view source)
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); return; }
    // Block zoom
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
  // Block right-click context menu
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  // ========== DEVTOOLS BAN SYSTEM (server-side) ==========
  const BAN_API = '/api/ban';

  const banOverlay = document.getElementById('ban-overlay');
  const banMinutes = document.getElementById('ban-minutes');
  const banSeconds = document.getElementById('ban-seconds');
  let banTimerInterval = null;

  async function activateBan() {
    // Stop game if running
    if (gameEngine && gameEngine.running) {
      gameEngine.pause();
      gamePaused = true;
    }
    if (activeCountdownInterval) {
      clearInterval(activeCountdownInterval);
      activeCountdownInterval = null;
    }
    AudioManager.stopBGM();

    if (!currentUserId) return;
    try {
      const resp = await fetch(BAN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      const data = await resp.json();
      if (data.banUntil) showBanScreen(data.banUntil);
    } catch (err) {
      console.error('Ban API failed:', err);
      // Fallback: show ban with estimated time
      showBanScreen(Date.now() + 30 * 60 * 1000);
    }
  }

  function showBanScreen(banUntil) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    banOverlay.style.display = 'flex';

    if (banTimerInterval) clearInterval(banTimerInterval);
    function updateBanTimer() {
      const remaining = banUntil - Date.now();
      if (remaining <= 0) {
        clearInterval(banTimerInterval);
        banTimerInterval = null;
        banOverlay.style.display = 'none';
        showScreen('login');
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && session.user) { authResolved = false; onAuthSuccess(session.user); }
          else showLoginButton();
        }).catch(() => showLoginButton());
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      banMinutes.textContent = String(mins).padStart(2, '0');
      banSeconds.textContent = String(secs).padStart(2, '0');
    }
    updateBanTimer();
    banTimerInterval = setInterval(updateBanTimer, 1000);
  }

  async function checkBanForUser(userId) {
    if (!userId) return false;
    try {
      const resp = await fetch(BAN_API + '?userId=' + encodeURIComponent(userId));
      const data = await resp.json();
      if (data.banned && data.banUntil > Date.now()) {
        showBanScreen(data.banUntil);
        return true;
      }
    } catch (err) {
      console.error('Ban check failed:', err);
    }
    return false;
  }

  // Detect devtools via debugger timing (skip during active gameplay for performance)
  setInterval(() => {
    if (gameEngine && gameEngine.running) return;
    const start = performance.now();
    debugger;
    if (performance.now() - start > 100) {
      activateBan();
    }
  }, 4000);

  // ========== AMBIENT PARTICLES ==========
  function initParticleCanvas(canvasId, color, count, speed) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const particles = [];
    let w, h, rafId = null;
    // Pre-split color for fast alpha insertion: "rgba(r,g,b,ALPHA)" → ["rgba(r,g,b,", ")"]
    let colorParts = color.split('ALPHA');

    function resize() {
      w = canvas.parentElement.clientWidth;
      h = canvas.parentElement.clientHeight;
      canvas.width = w;
      canvas.height = h;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * (w || 800),
        y: Math.random() * (h || 600),
        r: 1 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * speed,
        vy: -Math.random() * speed * 0.8 - 0.1,
        alpha: 0.1 + Math.random() * 0.4,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    function draw() {
      rafId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += 0.015;
        const a = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colorParts[0] + a.toFixed(2) + colorParts[1];
        ctx.fill();
      }
    }

    return {
      start() { if (!rafId) draw(); },
      stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
      setColor(c) { colorParts = c.split('ALPHA'); },
    };
  }

  // Login ambient particles (gold mist)
  loginParticles = initParticleCanvas(
    'login-particles',
    'rgba(200,169,110,ALPHA)', 35, 0.4
  );
  if (loginParticles) loginParticles.start();

  // Result particles (grade-dependent)
  function startResultParticles(grade) {
    if (!resultParticlesCtrl) {
      resultParticlesCtrl = initParticleCanvas(
        'result-particles',
        'rgba(200,169,110,ALPHA)', 30, 0.3
      );
    }
    if (!resultParticlesCtrl) return;
    if (grade === 'S+' || grade === 'S') {
      resultParticlesCtrl.setColor('rgba(240,212,138,ALPHA)');
    } else if (grade === 'A') {
      resultParticlesCtrl.setColor('rgba(200,169,110,ALPHA)');
    } else {
      resultParticlesCtrl.setColor('rgba(120,115,110,ALPHA)');
    }
    resultParticlesCtrl.start();
  }

  // --- Init ---
  showScreen('login');
})();
