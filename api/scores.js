import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const SCORES_KEY = 'guillotine_scores';
const BAN_DURATION_SEC = 30 * 60;

async function banUser(userId) {
  if (!userId) return;
  const banKey = `ban:${userId}`;
  await redis.set(banKey, Date.now() + BAN_DURATION_SEC * 1000, { ex: BAN_DURATION_SEC });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const scores = (await redis.get(SCORES_KEY)) || [];
      const modeFilter = req.query.mode || null;
      // Filter by mode if specified
      const filtered = modeFilter
        ? (modeFilter === 'grid'
          ? scores.filter(s => !s.mode || s.mode === 'grid') // grid includes legacy scores
          : scores.filter(s => s.mode === modeFilter))
        : scores.filter(s => !s.mode || s.mode === 'grid'); // default: grid (legacy)
      // Best score per player only
      const bestMap = {};
      for (const s of filtered) {
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
      const userId = entry.userId || null;

      // Server-side validation: sanitize and clamp values
      const nickname = String(entry.nickname).slice(0, 16);
      const allowedModes = ['grid', 'triple', 'tracking', 'fps-grid'];
      const mode = allowedModes.includes(entry.mode) ? entry.mode : 'grid';
      const maxKills = mode === 'tracking' ? 240 : 120;
      const kills = Math.max(0, Math.min(Math.floor(Number(entry.kills) || 0), maxKills));
      const durationSec = Number(entry.durationSec) || (mode === 'tracking' ? 60 : 30);
      const accuracy = Math.max(0, Math.min(Math.floor(Number(entry.accuracy) || 0), 100));
      const maxCombo = Math.max(0, Math.min(Math.floor(Number(entry.maxCombo) || 0), kills));
      const reactionMs = Math.max(0, Math.min(Math.floor(Number(entry.reactionMs) || 0), 9999));
      const bonusPoints = Math.max(0, Math.min(Math.floor(Number(entry.bonusPoints) || 0), kills * 3));
      const kpm = Math.max(0, Math.min(Math.floor(Number(entry.kpm) || 0), 240));
      const allowedGrades = ['C', 'B', 'A', 'S', 'S+'];
      const grade = allowedGrades.includes(entry.grade) ? entry.grade : 'C';

      // Anti-cheat: validate click log (skip for tracking mode — different input pattern)
      const clickLog = Array.isArray(entry.clickLog) ? entry.clickLog : [];
      const mousePath = Array.isArray(entry.mousePath) ? entry.mousePath : [];
      let suspicionScore = 0; // accumulate suspicion, reject at threshold

      if (kills > 0 && mode !== 'tracking' && !mode.startsWith('fps-')) {
        const hits = clickLog.filter(c => c.h === 1);

        // 1) Click log must have enough hits matching reported kills
        if (hits.length < kills * 0.7) {
          await banUser(userId);
          return res.status(403).json({ error: 'Invalid click data', banned: true });
        }

        const reactions = hits.map(c => c.r).filter(r => typeof r === 'number' && r > 0);

        if (reactions.length > 8) {
          const avgReaction = reactions.reduce((a, b) => a + b, 0) / reactions.length;

          // 2) Inhuman average reaction time (< 60ms is physically impossible)
          if (avgReaction < 60) {
            await banUser(userId);
            return res.status(403).json({ error: 'Suspicious reaction times', banned: true });
          }
          if (avgReaction < 100) suspicionScore += 3;

          // 3) Too-uniform timing (bot pattern) — only flag extreme cases
          const variance = reactions.reduce((sum, r) => sum + (r - avgReaction) ** 2, 0) / reactions.length;
          const stdDev = Math.sqrt(variance);
          if (stdDev < 5 && reactions.length > 15) {
            await banUser(userId);
            return res.status(403).json({ error: 'Suspicious click pattern', banned: true });
          }
          if (stdDev < 12 && reactions.length > 15) suspicionScore += 2;

          // 4) Fitts's Law check: only flag strong negative correlation (anti-human)
          if (hits.length > 15) {
            const hitsWithPos = hits.filter(c => typeof c.tx === 'number' && typeof c.ty === 'number');
            if (hitsWithPos.length > 15) {
              const distances = [];
              const rTimes = [];
              for (let i = 1; i < hitsWithPos.length; i++) {
                const dx = hitsWithPos[i].tx - hitsWithPos[i - 1].tx;
                const dy = hitsWithPos[i].ty - hitsWithPos[i - 1].ty;
                distances.push(Math.sqrt(dx * dx + dy * dy));
                rTimes.push(hitsWithPos[i].r);
              }
              if (distances.length > 10) {
                const n = distances.length;
                const avgD = distances.reduce((a, b) => a + b, 0) / n;
                const avgR = rTimes.reduce((a, b) => a + b, 0) / n;
                let num = 0, denD = 0, denR = 0;
                for (let i = 0; i < n; i++) {
                  const dd = distances[i] - avgD;
                  const dr = rTimes[i] - avgR;
                  num += dd * dr;
                  denD += dd * dd;
                  denR += dr * dr;
                }
                const den = Math.sqrt(denD * denR);
                const corr = den > 0 ? num / den : 0;
                // Only flag strongly negative correlation (farther = faster = inhuman)
                if (corr < -0.2 && kills > 30) suspicionScore += 2;
              }
            }
          }

          // 5) Hit offset analysis: only flag extreme precision (avg < 2px)
          const offsets = hits.map(c => c.d).filter(d => typeof d === 'number');
          if (offsets.length > 15) {
            const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
            if (avgOffset < 2) suspicionScore += 3;
            const offVar = offsets.reduce((s, o) => s + (o - avgOffset) ** 2, 0) / offsets.length;
            if (Math.sqrt(offVar) < 2 && avgOffset < 4) suspicionScore += 2;
          }
        }

        // 6) Click rate check (> 10 clicks/sec is inhuman)
        if (clickLog.length > 0) {
          const totalTime = clickLog[clickLog.length - 1].t - clickLog[0].t;
          if (totalTime > 0 && (clickLog.length / (totalTime / 1000)) > 10) {
            await banUser(userId);
            return res.status(403).json({ error: 'Click rate too high', banned: true });
          }
        }

        // 7) Mouse path analysis: no mouse movement = external program
        if (mousePath.length < 3 && kills > 15) {
          suspicionScore += 5;
        } else if (mousePath.length < 8 && kills > 30) {
          suspicionScore += 3;
        }

        // 8) Mouse path straightness check — only flag extreme bot-like patterns
        if (mousePath.length > 30) {
          let straightSegments = 0;
          let totalSegments = 0;
          for (let i = 2; i < mousePath.length; i += 3) {
            const p0 = mousePath[i - 2];
            const p1 = mousePath[i - 1];
            const p2 = mousePath[i];
            const lineLen = Math.hypot(p2.x - p0.x, p2.y - p0.y);
            if (lineLen < 30) continue;
            const cross = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x));
            const deviation = cross / lineLen;
            totalSegments++;
            if (deviation < 1.5) straightSegments++;
          }
          if (totalSegments > 8 && (straightSegments / totalSegments) > 0.92) {
            suspicionScore += 3;
          }
        }

        // 9) Combined suspicion threshold (raised to prevent false positives)
        if (suspicionScore >= 7) {
          await banUser(userId);
          return res.status(403).json({ error: 'Abnormal play pattern detected', banned: true });
        }
      }

      // Recalculate score server-side (don't trust client score)
      const killPts = kills * 10;
      const accPts = mode === 'tracking' ? Math.round(accuracy * 2) : Math.round(accuracy * 0.5);
      const comboPts = maxCombo * 2;
      const score = killPts + accPts + comboPts;

      const scores = (await redis.get(SCORES_KEY)) || [];
      scores.push({
        nickname,
        userId: userId || undefined,
        kills,
        durationSec,
        reactionMs,
        accuracy,
        maxCombo,
        grade,
        kpm,
        score,
        mode,
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
