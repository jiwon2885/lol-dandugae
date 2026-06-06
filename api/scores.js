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
      const entry = req.body;
      if (!entry.nickname || entry.score == null) {
        return res.status(400).json({ error: 'Invalid data' });
      }
      const scores = (await redis.get(SCORES_KEY)) || [];
      scores.push({
        nickname: entry.nickname,
        kills: entry.kills,
        durationSec: entry.durationSec,
        reactionMs: entry.reactionMs,
        accuracy: entry.accuracy,
        maxCombo: entry.maxCombo,
        grade: entry.grade,
        kpm: entry.kpm,
        score: entry.score,
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
