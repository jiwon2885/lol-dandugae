# Data Contract

## Runtime config

`GET /api/config`

Response:

```json
{
  "supabaseUrl": "https://<project>.supabase.co",
  "supabaseAnonKey": "<public anon key>"
}
```

The endpoint only returns public browser config. Never return service role keys, GitHub tokens, Vercel tokens, or private keys.

## Scores API

`GET /api/scores?mode=grid|triple|tracking|fps-grid|fps-triple|fps-tracking`

Returns best score per nickname for the requested mode. Default mode is `grid` for legacy compatibility.

`POST /api/scores`

Request body fields:

| Field | Type | Notes |
| --- | --- | --- |
| nickname | string | Required, server truncates to 16 chars |
| userId | string | Optional Supabase user id/email fallback |
| mode | enum | `grid`, `triple`, `tracking`, `fps-grid`, `fps-triple`, `fps-tracking` |
| kills | number | Clamped server-side |
| durationSec | number | 30 or 60 expected |
| reactionMs | number | Clamped 0..9999 |
| accuracy | number | Clamped 0..100 |
| maxCombo | number | Clamped to kills |
| grade | enum | `C`, `B`, `A`, `S`, `S+` |
| kpm | number | Clamped |
| clickLog | array | Anti-cheat evidence for non-tracking 2D modes |
| mousePath | array | Anti-cheat evidence |

The server recalculates score and does not trust client score.

## Ban API

`GET /api/ban?userId=<id>` is public and read-only for the current ban state.

Admin-only operations require `BAN_ADMIN_TOKEN` or `ADMIN_API_TOKEN` and must send `Authorization: Bearer <token>` or `X-Admin-Token: <token>`:

- `GET /api/ban?list=all`
- `POST /api/ban` with `{ "userId": "..." }`
- `DELETE /api/ban?userId=<id>`
- `DELETE /api/ban?action=unban-all`
