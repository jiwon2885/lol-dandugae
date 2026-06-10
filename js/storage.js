/* ===== LocalStorage (프로필) + 서버 API (랭킹) ===== */
const Storage = (() => {
  const PROFILES_KEY = 'guillotine_profiles';
  const API_URL = '/api/scores';

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  }
  function _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // --- Profiles (localStorage) ---
  function getProfiles() { return _get(PROFILES_KEY) || {}; }
  function saveProfiles(p) { _set(PROFILES_KEY, p); }

  function getProfile(nick) {
    return getProfiles()[nick] || null;
  }

  function createProfile(nick, pinHash) {
    const profiles = getProfiles();
    profiles[nick] = {
      nickname: nick,
      pinHash: pinHash || null,
      sensitivity: 1.0,
      totalPlays: 0,
      bestScore: 0,
      bestReactionMs: 9999,
      totalKills: 0,
      bestGrade: 'C',
      createdAt: Date.now(),
    };
    saveProfiles(profiles);
    return profiles[nick];
  }

  function updateProfile(nick, updates) {
    const profiles = getProfiles();
    if (!profiles[nick]) return;
    Object.assign(profiles[nick], updates);
    saveProfiles(profiles);
  }

  function deleteProfile(nick) {
    const profiles = getProfiles();
    delete profiles[nick];
    saveProfiles(profiles);
  }

  // --- Score calculation ---
  // grid/triple: kills×10 + accuracy×0.5 + maxCombo×2
  // tracking: kills×10 + trackAccuracy×2 + maxCombo×2
  function calcScore(entry) {
    const killPts = (entry.kills || 0) * 10;
    if (entry.mode === 'tracking' || entry.mode === 'fps-tracking') {
      const accPts = Math.round((entry.accuracy || 0) * 2);
      const comboPts = (entry.maxCombo || 0) * 2;
      return killPts + accPts + comboPts;
    }
    const accPts = Math.round((entry.accuracy || 0) * 0.5);
    const comboPts = (entry.maxCombo || 0) * 2;
    return killPts + accPts + comboPts;
  }

  // --- Scores (서버 API) ---
  async function addScore(entry) {
    const score = calcScore(entry);
    const data = { ...entry, score };
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (resp.status === 403) {
        const body = await resp.json().catch(() => ({}));
        if (body.banned) return { banned: true };
      }
      return { banned: false };
    } catch (err) {
      console.error('Score submit failed:', err);
      return { banned: false };
    }
  }

  async function getRankings(mode) {
    try {
      const url = mode ? API_URL + '?mode=' + encodeURIComponent(mode) : API_URL;
      const res = await fetch(url);
      if (!res.ok) throw new Error('API error');
      return await res.json();
    } catch (err) {
      console.error('Rankings fetch failed:', err);
      return [];
    }
  }

  return { getProfile, createProfile, updateProfile, deleteProfile, calcScore, addScore, getRankings };
})();
