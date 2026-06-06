/* ===== App Controller ===== */
(() => {
  // --- DOM refs ---
  const screens = {
    login: document.getElementById('screen-login'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
    ranking: document.getElementById('screen-ranking'),
  };

  const el = {
    nicknameInput: document.getElementById('nickname-input'),
    pinInput: document.getElementById('pin-input'),
    pinLabel: document.getElementById('pin-label'),
    pinConfirmSection: document.getElementById('pin-confirm-section'),
    pinConfirmInput: document.getElementById('pin-confirm-input'),
    btnLogin: document.getElementById('btn-login'),
    loginError: document.getElementById('login-error'),

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
    resultBestBadge: document.getElementById('result-best-badge'),
    resKills: document.getElementById('res-kills'),
    resAccuracy: document.getElementById('res-accuracy'),
    resReaction: document.getElementById('res-reaction'),
    resCombo: document.getElementById('res-combo'),
    resKpm: document.getElementById('res-kpm'),
    btnRetry: document.getElementById('btn-retry'),
    btnToLobby: document.getElementById('btn-to-lobby'),

    rankingBody: document.getElementById('ranking-body'),
    rankingEmpty: document.getElementById('ranking-empty'),
    btnRankingBack: document.getElementById('btn-ranking-back'),
  };

  // --- State ---
  let currentNickname = '';
  let currentProfile = null;
  let gameEngine = null;
  let bgImage = null;

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

  // ========== LOGIN ==========
  function updateLoginBtn() {
    const nick = el.nicknameInput.value.trim();
    const pin = el.pinInput.value;
    el.btnLogin.disabled = !nick || pin.length !== 4;
  }

  el.nicknameInput.addEventListener('input', () => {
    el.loginError.textContent = '';
    const nick = el.nicknameInput.value.trim();
    const profile = Storage.getProfile(nick);

    if (profile) {
      // Existing user — show PIN input only
      el.pinLabel.textContent = 'PIN 입력';
      el.pinConfirmSection.style.display = 'none';
    } else if (nick) {
      // New user — show PIN + confirm
      el.pinLabel.textContent = 'PIN 설정 (4자리)';
      el.pinConfirmSection.style.display = 'block';
    }
    updateLoginBtn();
  });

  el.pinInput.addEventListener('input', updateLoginBtn);

  el.btnLogin.addEventListener('click', async () => {
    const nick = el.nicknameInput.value.trim();
    const pin = el.pinInput.value;
    if (!nick || pin.length !== 4) return;
    el.loginError.textContent = '';

    const profile = Storage.getProfile(nick);

    if (profile) {
      // Existing: verify PIN
      const hash = await Storage.hashPin(pin);
      if (hash !== profile.pinHash) {
        el.loginError.textContent = 'PIN이 일치하지 않습니다.';
        return;
      }
      currentProfile = profile;
    } else {
      // New: confirm PIN
      const pinConfirm = el.pinConfirmInput.value;
      if (pin !== pinConfirm) {
        el.loginError.textContent = 'PIN이 일치하지 않습니다.';
        return;
      }
      const pinHash = await Storage.hashPin(pin);
      currentProfile = Storage.createProfile(nick, pinHash);
    }

    currentNickname = nick;
    el.pinInput.value = '';
    el.pinConfirmInput.value = '';
    enterLobby();
  });

  // Enter on input
  el.nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnLogin.click();
  });
  el.pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnLogin.click();
  });

  // ========== LOBBY ==========
  function enterLobby() {
    showScreen('lobby');
    el.lobbyNickname.textContent = currentNickname;
    renderFacePreviews();
  }

  // Settings are fixed: 30s, 100px

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
    showScreen('game');

    // Draw background on canvas before countdown
    const cvs = el.canvas;
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
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

    const countInterval = setInterval(() => {
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
        clearInterval(countInterval);
        el.countdownOverlay.classList.remove('active');
        launchEngine();
      }
    }, 800);
  }

  function launchEngine() {
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
    el.hudTime.textContent = stats.timeLeft;
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
      grade,
      kpm: stats.kpm,
    });

    // Render result
    el.resultGrade.textContent = grade;
    el.resultGrade.className = 'grade grade-' + grade.toLowerCase().replace('+', 'plus');

    el.resultBestBadge.style.display = isBest && stats.kills > 0 ? 'inline-block' : 'none';

    el.resKills.textContent = stats.kills;
    el.resAccuracy.textContent = stats.accuracy + '%';
    el.resReaction.textContent = stats.avgReaction ? stats.avgReaction + 'ms' : '-';
    el.resCombo.textContent = stats.maxCombo;
    el.resKpm.textContent = stats.kpm;
  }

  function calcGrade(stats) {
    // Strict grading: need high kills + high accuracy + fast reaction
    // 30s game: ~60 kills = godlike, ~40 = great, ~25 = decent
    const speedBonus = stats.avgReaction > 0 ? Math.max(0, (400 - stats.avgReaction) / 10) : 0;
    const score = stats.kills * 8 + stats.accuracy * 0.3 + speedBonus + stats.maxCombo * 2;
    if (score >= 500) return 'S+';  // ~55+ kills, 90%+ acc, <300ms
    if (score >= 400) return 'S';   // ~45+ kills, 85%+ acc
    if (score >= 300) return 'A';   // ~35+ kills, 80%+ acc
    if (score >= 180) return 'B';   // ~20+ kills
    return 'C';
  }

  const gradeOrder = ['C', 'B', 'A', 'S', 'S+'];
  function betterGrade(a, b) {
    return gradeOrder.indexOf(a) >= gradeOrder.indexOf(b) ? a : b;
  }

  el.btnRetry.addEventListener('click', () => startGame());
  el.btnToLobby.addEventListener('click', () => enterLobby());

  // ========== RANKING ==========
  function showRanking() {
    showScreen('ranking');
    const rankings = Storage.getRankings();

    if (rankings.length === 0) {
      el.rankingBody.innerHTML = '';
      el.rankingEmpty.style.display = 'block';
      return;
    }

    el.rankingEmpty.style.display = 'none';
    el.rankingBody.innerHTML = rankings.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.nickname)}</td>
        <td>${r.kills}</td>
        <td>${r.durationSec}s</td>
        <td>${r.reactionMs}ms</td>
        <td>${r.accuracy}%</td>
        <td>${r.grade}</td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  el.btnRankingBack.addEventListener('click', () => enterLobby());

  // --- Init ---
  showScreen('login');
  el.nicknameInput.focus();
})();
