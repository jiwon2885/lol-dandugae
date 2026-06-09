/* ===== App Controller ===== */
window.onerror = function(msg, src, line, col, err) {
  document.title = 'ERR: ' + msg;
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:12px;font-size:14px;word-break:break-all;';
  d.textContent = '[JS Error] ' + msg + ' at ' + src + ':' + line + ':' + col;
  document.body.appendChild(d);
};
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
    hudReaction: document.getElementById('hud-reaction'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownNum: document.getElementById('countdown-num'),

    resultGrade: document.getElementById('result-grade'),
    resultScore: document.getElementById('result-score'),
    resultBestBadge: document.getElementById('result-best-badge'),
    resKills: document.getElementById('res-kills'),
    resAccuracy: document.getElementById('res-accuracy'),
    resReaction: document.getElementById('res-reaction'),
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

  // --- Screen management ---
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
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

    // Update game time display
    const dur = MODE_DURATION[currentMode] || 30;
    const timeValEl = document.querySelector('.lobby-info-value');
    if (timeValEl) timeValEl.textContent = dur + '초';

    renderFacePreviews();
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

    // Set in-game mode badge
    const hudModeBadge = document.getElementById('hud-mode-badge');
    if (hudModeBadge) hudModeBadge.textContent = MODE_LABELS[currentMode] || '';

    // Force fullscreen to prevent window shrinking exploit
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showScreen('game');

    // Draw background on canvas before countdown — fixed pixel size
    const cvs = el.canvas;
    cvs.width = window.screen.width;
    cvs.height = window.screen.height;
    cvs.style.width = cvs.width + 'px';
    cvs.style.height = cvs.height + 'px';
    if (bgImage) {
      const cx = cvs.getContext('2d');
      const scale = Math.max(cvs.width / bgImage.width, cvs.height / bgImage.height);
      const w = bgImage.width * scale;
      const h = bgImage.height * scale;
      cx.drawImage(bgImage, (cvs.width - w) / 2, (cvs.height - h) / 2, w, h);
      cx.fillStyle = 'rgba(10, 14, 20, 0.35)';
      cx.fillRect(0, 0, cvs.width, cvs.height);
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
      targetSize: 100,
      bgImage,
      onTick: (stats) => updateHUD(stats),
      onEnd: (stats) => showResult(stats),
    });
    gameEngine.start();
    pauseCount = 0;
    updateHUD({ timeLeft: gameDuration, kills: 0, combo: 0, avgReaction: 0, trackTime: 0, trackAccuracy: 0 });
  }

  function updateHUD(stats) {
    el.hudTime.textContent = typeof stats.timeLeft === 'number' ? stats.timeLeft.toFixed(1) : stats.timeLeft;

    el.hudKills.textContent = stats.kills;
    el.hudCombo.textContent = stats.combo;
    el.hudReaction.textContent = stats.avgReaction ? stats.avgReaction + 'ms' : '-';

    if (currentMode === 'tracking') {
      const trackEl = document.getElementById('hud-track-time');
      const accEl = document.getElementById('hud-track-acc');
      if (trackEl) trackEl.textContent = ((stats.trackTime || 0) / 1000).toFixed(1) + 's';
      if (accEl) accEl.textContent = (stats.trackAccuracy || 0) + '%';
    }

    if (stats.timeLeft <= 5) {
      el.hudTime.style.color = '#e84057';
    } else {
      el.hudTime.style.color = '';
    }
  }

  // ========== RESULT ==========
  function showResult(stats) {
    AudioManager.stopBGM();
    // destroy cleans up without calling onEnd again
    if (gameEngine) {
      gameEngine.destroy();
      gameEngine = null;
    }

    // Small delay to ensure screen transition is clean
    setTimeout(() => showScreen('result'), 50);

    const grade = calcGrade(stats);

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
    Storage.addScore({
      nickname: currentNickname,
      userId: currentUserId,
      kills: stats.kills,
      durationSec: stats.duration,
      reactionMs: stats.avgReaction,
      accuracy: stats.accuracy,
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
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      reactionMs: stats.avgReaction,
    });

    // Render result
    el.resultGrade.textContent = grade;
    el.resultGrade.className = 'grade grade-' + grade.toLowerCase().replace('+', 'plus');
    el.resultScore.textContent = totalScore + 'pt';

    el.resultBestBadge.style.display = isBest && stats.kills > 0 ? 'inline-block' : 'none';

    el.resKills.textContent = stats.kills;
    el.resAccuracy.textContent = stats.accuracy + '%';
    el.resReaction.textContent = stats.avgReaction ? stats.avgReaction + 'ms' : '-';
    el.resCombo.textContent = stats.maxCombo;
    el.resKpm.textContent = stats.kpm;
  }

  // Mode-specific grade thresholds (balanced to similar difficulty)
  const GRADE_THRESHOLDS = {
    grid:     { 'S+': 700, S: 680, A: 500, B: 300 },
    triple:   { 'S+': 900, S: 850, A: 650, B: 400 },
    tracking: { 'S+': 600, S: 550, A: 400, B: 250 },
  };

  function calcGrade(stats) {
    const score = Storage.calcScore({
      kills: stats.kills,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      reactionMs: stats.avgReaction,
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
        <td>${escapeHtml(String(r.reactionMs))}ms</td>
        <td>${escapeHtml(String(r.grade))}</td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // Detect devtools via debugger timing
  setInterval(() => {
    const start = performance.now();
    debugger;
    if (performance.now() - start > 100) {
      activateBan();
    }
  }, 3000);

  // --- Init ---
  showScreen('login');
})();
