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

  // --- PIN hash (simple hash for local-only use) ---
  async function hashPin(pin) {
    const data = new TextEncoder().encode(pin + '_guillotine_salt');
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  function calcScore(entry) {
    const speedBonus = entry.reactionMs > 0 ? Math.max(0, (400 - entry.reactionMs) / 10) : 0;
    const raw = entry.kills * 8 + (entry.accuracy || 0) * 0.3 + speedBonus + (entry.maxCombo || 0) * 2 + (entry.bonusPoints || 0) * 5;
    return Math.round(raw / 5);
  }

  // --- Scores (서버 API) ---
  async function addScore(entry) {
    const score = calcScore(entry);
    const data = { ...entry, score };
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Score submit failed:', err);
    }
  }

  async function getRankings() {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('API error');
      return await res.json();
    } catch (err) {
      console.error('Rankings fetch failed:', err);
      return [];
    }
  }

  return { hashPin, getProfile, createProfile, updateProfile, deleteProfile, calcScore, addScore, getRankings };
})();
