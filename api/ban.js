import { getRedis } from './_redis.js';

const BAN_DURATION_SEC = 30 * 60; // 30 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // List all active bans (no userId required)
    if (req.method === 'GET' && req.query?.list === 'all') {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const redis = getRedis();
      const keys = [];
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, { match: 'ban:*', count: 100 });
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== 0 && cursor !== '0');
      const bans = [];
      for (const key of keys) {
        const val = await redis.get(key);
        if (val && Date.now() < Number(val)) {
          bans.push({ key, userId: key.replace('ban:', ''), banUntil: Number(val) });
        }
      }
      return res.json(bans);
    }

    // Unban all active bans
    if (req.method === 'DELETE' && req.query?.action === 'unban-all') {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const redis = getRedis();
      const keys = [];
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, { match: 'ban:*', count: 100 });
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== 0 && cursor !== '0');
      for (const key of keys) await redis.del(key);
      return res.json({ unbanned: keys.length });
    }

    const userId = req.body?.userId || req.query?.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const banKey = `ban:${userId}`;

    if (req.method === 'POST') {
      const redis = getRedis();
      await redis.set(banKey, Date.now() + BAN_DURATION_SEC * 1000, { ex: BAN_DURATION_SEC });
      return res.json({ banned: true, banUntil: Date.now() + BAN_DURATION_SEC * 1000 });
    }

    if (req.method === 'GET') {
      const redis = getRedis();
      const banUntil = await redis.get(banKey);
      if (banUntil && Date.now() < Number(banUntil)) {
        return res.json({ banned: true, banUntil: Number(banUntil) });
      }
      return res.json({ banned: false });
    }

    if (req.method === 'DELETE') {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const redis = getRedis();
      await redis.del(banKey);
      return res.json({ unbanned: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(err.statusCode || 500).json({ error: err.publicMessage || 'Server error' });
  }
}

function isAdminRequest(req) {
  const adminToken = process.env.BAN_ADMIN_TOKEN || process.env.ADMIN_API_TOKEN;
  if (!adminToken) return false;

  const auth = req.headers.authorization || '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const headerToken = req.headers['x-admin-token'];

  return bearerToken === adminToken || headerToken === adminToken;
}
