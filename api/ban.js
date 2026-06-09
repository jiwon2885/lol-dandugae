import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const BAN_DURATION_SEC = 30 * 60; // 30 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const userId = req.body?.userId || req.query?.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const banKey = `ban:${userId}`;

    if (req.method === 'POST') {
      // Set ban with TTL (auto-expires)
      await redis.set(banKey, Date.now() + BAN_DURATION_SEC * 1000, { ex: BAN_DURATION_SEC });
      return res.json({ banned: true, banUntil: Date.now() + BAN_DURATION_SEC * 1000 });
    }

    if (req.method === 'GET') {
      const banUntil = await redis.get(banKey);
      if (banUntil && Date.now() < Number(banUntil)) {
        return res.json({ banned: true, banUntil: Number(banUntil) });
      }
      return res.json({ banned: false });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
