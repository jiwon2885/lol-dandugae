import { Redis } from '@upstash/redis';

let redisClient = null;

export function getRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    const err = new Error('Missing Upstash Redis environment variables');
    err.statusCode = 503;
    err.publicMessage = 'Server storage is not configured';
    throw err;
  }

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

export function handleApiError(res, err) {
  const status = err?.statusCode || 500;
  const message = err?.publicMessage || 'Server error';
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: message });
}

export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    res.status(403).json({ error: 'Admin actions are not configured' });
    return false;
  }

  const header = req.headers['x-admin-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (token !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
