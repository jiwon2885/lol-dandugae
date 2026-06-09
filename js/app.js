/* ===== App Controller ===== */
(() => {
  // --- Supabase Auth ---
  const SUPABASE_URL = 'https://kksnddwgfnxaztboegax.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrc25kZHdnZm54YXp0Ym9lZ2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDA1MDcsImV4cCI6MjA5NjU3NjUwN30.Ba-t8iFrjJXpwV_vxUaEzdDzHtmIkv0WaMs5ZJWoTXA';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- DOM refs ---
  const screens = {
    login: document.getElementById('screen-login'),
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
  ];
  const faceImages = [];
  let facesLoaded = 0;
  FACE_FILES.forEach(src => {
    const img = new Image();
    img.onload = () => {
      facesLoaded++;
      faceImages.push(img);
      renderFacePreviews();
    };
    img.src = src;
  });

  // --- Screen management ---
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ========== GOOGLE LOGIN ==========
  el.btnGoogleLogin.addEventListener('click', async () => {
    el.loginError.textContent = '';
    el.btnGoogleLogin.disabled = true;
    el.btnGoogleLogin.textContent = '로그인 중...';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });

    if (error) {
      el.loginError.textContent = 'Google 로그인 실패: ' + error.message;
      el.btnGoogleLogin.disabled = false;
      el.btnGoogleLogin.innerHTML = '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.003 24.003 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Google로 로그인';
    }
    // If no error, the page will redirect to Google
  });

  // Handle auth state (initial session check + OAuth redirect callback)
  function handleUser(user) {
    if (!user) return;
    const meta = user.user_metadata || {};
    const nick = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Player');
    currentNickname = nick;

    if (!Storage.getProfile(nick)) {
      Storage.createProfile(nick, null);
    }
    currentProfile = Storage.getProfile(nick);
    enterLobby();
  }

  // Listen for auth state changes (catches OAuth redirect)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && session.user) {
      handleUser(session.user);
    }
  });

  // Also check existing session on page load
  (async () => {
    el.loginLoading.style.display = 'block';
    el.btnGoogleLogin.style.display = 'none';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        handleUser(session.user);
        return;
      }
    } catch (err) {
      console.error('Session check failed:', err);
    }
    // No session — show login button
    el.loginLoading.style.display = 'none';
    el.btnGoogleLogin.style.display = '';
  })();

  // ========== LOBBY ==========
  function enterLobby() {
    showScreen('lobby');
    el.lobbyNickname.textContent = currentNickname;
    renderFacePreviews();
  }

  function renderFacePreviews() {
    el.facePreview.innerHTML = '';
    faceImages.forEach((faceImg) => {
      const wrap = document.createElement('div');
      wrap.className = 'face-thumb-wrap';
      const img = document.createElement('img');
      img.className = 'face-thumb';
      img.src = faceImg.src;
      wrap.appendChild(img);
      el.facePreview.appendChild(wrap);
    });
  }

  // Start game
  el.btnStart.addEventListener('click', () => {
    startGame();
  });

  // Ranking
  el.btnRanking.addEventListener('click', () => showRanking());

  // ========== GAME ==========
  function startGame() {
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
    gameEngine = new GameEngine(el.canvas, {
      faceImages,
      duration: 30,
      targetSize: 100,
      bgImage,
      onTick: (stats) => updateHUD(stats),
      onEnd: (stats) => showResult(stats),
    });
    gameEngine.start();
    updateHUD({ timeLeft: 30, kills: 0, combo: 0, avgReaction: 0 });
  }

  function updateHUD(stats) {
    el.hudTime.textContent = typeof stats.timeLeft === 'number' ? stats.timeLeft.toFixed(1) : stats.timeLeft;
    el.hudKills.textContent = stats.kills;
    el.hudCombo.textContent = stats.combo;
    el.hudReaction.textContent = stats.avgReaction ? stats.avgReaction + 'ms' : '-';

    // Time warning
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

    // Save score
    Storage.addScore({
      nickname: currentNickname,
      kills: stats.kills,
      durationSec: stats.duration,
      reactionMs: stats.avgReaction,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      bonusPoints: stats.bonusPoints,
      grade,
      kpm: stats.kpm,
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

  function calcGrade(stats) {
    const score = Storage.calcScore({
      kills: stats.kills,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      reactionMs: stats.avgReaction,
    });
    if (score >= 850) return 'S+';
    if (score >= 700) return 'S';
    if (score >= 500) return 'A';
    if (score >= 300) return 'B';
    return 'C';
  }

  const gradeOrder = ['C', 'B', 'A', 'S', 'S+'];
  function betterGrade(a, b) {
    return gradeOrder.indexOf(a) >= gradeOrder.indexOf(b) ? a : b;
  }

  el.btnRetry.addEventListener('click', () => startGame());
  el.btnToLobby.addEventListener('click', () => enterLobby());

  // ========== RANKING ==========
  async function showRanking() {
    showScreen('ranking');
    el.rankingBody.innerHTML = '';
    el.rankingEmpty.style.display = 'none';
    el.rankingEmpty.textContent = '로딩 중...';
    el.rankingEmpty.style.display = 'block';

    const rankings = await Storage.getRankings();

    if (rankings.length === 0) {
      el.rankingBody.innerHTML = '';
      el.rankingEmpty.textContent = '아직 기록이 없습니다.';
      el.rankingEmpty.style.display = 'block';
      return;
    }

    el.rankingEmpty.style.display = 'none';
    el.rankingBody.innerHTML = rankings.map((r, i) => `
      <tr class="${r.nickname === currentNickname ? 'rank-me' : ''}">
        <td>${i + 1}</td>
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
    gamePaused = true;
    gameEngine.pause();
    el.pauseDesc.textContent = reason || '';
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
        if (gameEngine) gameEngine.resume();
      }
    }, 800);
  }

  // ========== BLOCK BROWSER ZOOM ==========
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
    }
  });
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  // --- Init ---
  showScreen('login');
})();
