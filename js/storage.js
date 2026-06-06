/* ===== LocalStorage 기반 저장 ===== */
const Storage = (() => {
  const PROFILES_KEY = 'guillotine_profiles';
  const SCORES_KEY = 'guillotine_scores';

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  }
  function _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // --- PIN hash (simple hash for local-only use) ---
  async function hashPin(pin) {
    const data = new TextEncoder().encode(pin + '_guillotine_salt');
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Profiles ---
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

  // --- Scores ---
  function getScores() { return _get(SCORES_KEY) || []; }

  function addScore(entry) {
    const scores = getScores();
    scores.push({ ...entry, id: Date.now(), createdAt: Date.now() });
    scores.sort((a, b) => b.kills - a.kills || a.reactionMs - b.reactionMs);
    if (scores.length > 100) scores.length = 100;
    _set(SCORES_KEY, scores);
  }

  function getRankings() {
    const scores = getScores();
    const bestMap = {};
    for (const s of scores) {
      if (!bestMap[s.nickname] || s.kills > bestMap[s.nickname].kills ||
          (s.kills === bestMap[s.nickname].kills && s.reactionMs < bestMap[s.nickname].reactionMs)) {
        bestMap[s.nickname] = s;
      }
    }
    return Object.values(bestMap).sort((a, b) => b.kills - a.kills || a.reactionMs - b.reactionMs);
  }

  function deleteProfile(nick) {
    const profiles = getProfiles();
    delete profiles[nick];
    saveProfiles(profiles);
    const scores = getScores().filter(s => s.nickname !== nick);
    _set(SCORES_KEY, scores);
  }

  return { hashPin, getProfile, createProfile, updateProfile, addScore, getRankings, deleteProfile };
})();
