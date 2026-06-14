# Backend / Infra Audit

Date: 2026-06-15

## Current backend/infra shape

- Static frontend: `index.html`, `js/*.js`, `css/style.css`
- Vercel Serverless API:
  - `GET/POST /api/scores`: stores and reads rankings in Upstash Redis / Vercel KV.
  - `GET /api/ban`: reads temporary ban state in Upstash Redis / Vercel KV. Admin-only `POST/DELETE` writes require `BAN_ADMIN_TOKEN` or `ADMIN_API_TOKEN`.
  - `GET /api/config`: exposes browser-public Supabase Auth config only.
- Supabase:
  - Current app uses browser Supabase Auth.
  - No server-side Supabase client, database query, applied RLS migration, or Storage upload code is present yet.
- Vercel:
  - `vercel.json` currently applies `Cache-Control: no-cache, no-store, must-revalidate` to all routes.

## Environment variables

Store real values only in `.env.local` or Vercel Project Environment Variables. Do not commit secrets.

| Name | Required | Purpose |
| --- | --- | --- |
| `KV_REST_API_URL` | required | Upstash Redis REST URL for API routes |
| `KV_REST_API_TOKEN` | required | Upstash Redis REST write token for API routes |
| `BAN_ADMIN_TOKEN` | recommended | Protects `GET /api/ban?list=all` and `DELETE /api/ban?action=unban-all` |
| `ADMIN_API_TOKEN` | optional alias | Alternative admin token name supported by `api/ban.js` |
| `SUPABASE_URL` | required for Auth | Browser-public Supabase project URL exposed by `/api/config` |
| `SUPABASE_ANON_KEY` | required for Auth | Browser-public Supabase anon key exposed by `/api/config` |
| `NEXT_PUBLIC_SUPABASE_URL` | optional alias | Alternative public URL name supported by `/api/config` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional alias | Alternative public anon key name supported by `/api/config` |

Never expose Supabase service-role keys through `/api/config` or frontend code.

## Safe changes made

- Added a shared Redis helper so missing `KV_REST_API_URL` / `KV_REST_API_TOKEN` returns a controlled server storage configuration error instead of failing at module load.
- Protected ban admin endpoints with `BAN_ADMIN_TOKEN` / `ADMIN_API_TOKEN`:
  - `GET /api/ban?list=all`
  - `POST /api/ban`
  - `DELETE /api/ban?userId=<id>`
  - `DELETE /api/ban?action=unban-all`
- Client devtools-ban UX now falls back to a local 30-minute ban screen when remote admin ban writes are rejected.
- Added a commit-safe `.env.example` and allowed it through `.gitignore` while keeping `.env*` ignored.
- Added a draft Supabase migration for future profiles and private face-image Storage RLS. This draft was not applied to any remote DB.
- Added package-level verification scripts for syntax/static reference checks.

## Remaining risks / follow-up

- Remote `POST /api/ban` no longer accepts unauthenticated client writes. If remote self-ban persistence is required later, add server-side Supabase access-token verification and bind the ban target to the authenticated user.
- `/api/scores` recalculates score fields but still accepts client-supplied gameplay telemetry. Authenticated score submission and stronger server-side validation remain future work.
- Supabase Auth redirect URLs and Google OAuth provider settings must be checked in the Supabase dashboard for the actual Vercel domain.
- PRD items for Supabase profiles and Storage are not wired into app code yet. Review `supabase/drafts/profiles_and_face_storage_draft.sql` and apply only after explicit approval.

