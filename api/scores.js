import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const SCORES_KEY = 'guillotine_scores';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const scores = (await redis.get(SCORES_KEY)) || [];
      // Best score per player only
      const bestMap = {};
      for (const s of scores) {
        if (!bestMap[s.nickname] || s.score > bestMap[s.nickname].score) {
          bestMap[s.nickname] = s;
        }
      }
      const rankings = Object.values(bestMap).sort((a, b) => b.score - a.score);
      return res.json(rankings);
    }

    if (req.method === 'POST') {
      // Block mobile submissions server-side
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      if (/android|iphone|ipad|ipod|mobile|tablet/.test(ua)) {
        return res.status(403).json({ error: 'PC only' });
      }
      const entry = req.body;
      if (!entry.nickname || entry.score == null) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      // Server-side validation: sanitize and clamp values
      const nickname = String(entry.nickname).slice(0, 16);
      const kills = Math.max(0, Math.min(Math.floor(Number(entry.kills) || 0), 300));
      const durationSec = Number(entry.durationSec) || 30;
      const accuracy = Math.max(0, Math.min(Math.floor(Number(entry.accuracy) || 0), 100));
      const maxCombo = Math.max(0, Math.min(Math.floor(Number(entry.maxCombo) || 0), kills));
      const reactionMs = Math.max(0, Math.min(Math.floor(Number(entry.reactionMs) || 0), 9999));
      const bonusPoints = Math.max(0, Math.min(Math.floor(Number(entry.bonusPoints) || 0), kills * 3));
      const kpm = Math.max(0, Math.min(Math.floor(Number(entry.kpm) || 0), 600));
      const allowedGrades = ['C', 'B', 'A', 'S', 'S+'];
      const grade = allowedGrades.includes(entry.grade) ? entry.grade : 'C';

      // Recalculate score server-side (don't trust client score)
      const killPts = kills * 10;
      const accPts = Math.round(accuracy * 0.5);
      const comboPts = maxCombo * 2;
      const score = killPts + accPts + comboPts;

      const scores = (await redis.get(SCORES_KEY)) || [];
      scores.push({
        nickname,
        kills,
        durationSec,
        reactionMs,
        accuracy,
        maxCombo,
        grade,
        kpm,
        score,
        id: Date.now(),
        createdAt: Date.now(),
      });
      scores.sort((a, b) => b.score - a.score);
      if (scores.length > 500) scores.length = 500;
      await redis.set(SCORES_KEY, scores);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
