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
      const kills = Math.max(0, Math.min(Math.floor(Number(entry.kills) || 0), 120));
      const durationSec = Number(entry.durationSec) || 30;
      const accuracy = Math.max(0, Math.min(Math.floor(Number(entry.accuracy) || 0), 100));
      const maxCombo = Math.max(0, Math.min(Math.floor(Number(entry.maxCombo) || 0), kills));
      const reactionMs = Math.max(0, Math.min(Math.floor(Number(entry.reactionMs) || 0), 9999));
      const bonusPoints = Math.max(0, Math.min(Math.floor(Number(entry.bonusPoints) || 0), kills * 3));
      const kpm = Math.max(0, Math.min(Math.floor(Number(entry.kpm) || 0), 240));
      const allowedGrades = ['C', 'B', 'A', 'S', 'S+'];
      const grade = allowedGrades.includes(entry.grade) ? entry.grade : 'C';

      // Anti-cheat: validate click log
      const clickLog = Array.isArray(entry.clickLog) ? entry.clickLog : [];
      if (kills > 0) {
        const hits = clickLog.filter(c => c.h === 1);
        // Click log must have enough hits matching reported kills (allow small margin)
        if (hits.length < kills * 0.8) {
          return res.status(403).json({ error: 'Invalid click data' });
        }
        // Check for inhuman reaction times (avg < 80ms = bot)
        const reactions = hits.map(c => c.r).filter(r => typeof r === 'number' && r > 0);
        if (reactions.length > 5) {
          const avgReaction = reactions.reduce((a, b) => a + b, 0) / reactions.length;
          if (avgReaction < 80) {
            return res.status(403).json({ error: 'Suspicious reaction times' });
          }
          // Check for too-uniform timing (bot pattern: std dev < 15ms)
          const mean = avgReaction;
          const variance = reactions.reduce((sum, r) => sum + (r - mean) ** 2, 0) / reactions.length;
          const stdDev = Math.sqrt(variance);
          if (stdDev < 15 && reactions.length > 10) {
            return res.status(403).json({ error: 'Suspicious click pattern' });
          }
        }
        // Check click rate: max ~4 clicks/sec sustained is humanly possible
        if (clickLog.length > 0) {
          const totalTime = clickLog[clickLog.length - 1].t - clickLog[0].t;
          if (totalTime > 0 && (clickLog.length / (totalTime / 1000)) > 8) {
            return res.status(403).json({ error: 'Click rate too high' });
          }
        }
      }

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
