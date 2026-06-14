# Deployment Readiness Checklist

## Before Vercel deployment

- [ ] Set Vercel environment variables from `.env.example`.
- [ ] Do not paste service role keys into browser-visible variables.
- [ ] Confirm Supabase Google OAuth redirect URLs include the production Vercel domain.
- [ ] Confirm Upstash Redis database is available and `KV_REST_API_URL` / `KV_REST_API_TOKEN` are set.
- [ ] Set `BAN_ADMIN_TOKEN` only if admin ban management is needed.
- [ ] Run `npm test` and `npm run build` locally.
- [ ] Confirm `.env.local` is not committed.
- [ ] Confirm no production deploy is run until the user explicitly approves.

## GitHub handoff

- [ ] Review `git diff`.
- [ ] Create a local commit if desired.
- [ ] Push only after explicit user approval.

Suggested commit message:

```text
chore: prepare web app for deployment readiness
```

## Supabase handoff

- [ ] Review SQL draft in `supabase/migrations/0001_profiles_scores_rls.sql`.
- [ ] Apply to a non-production project first.
- [ ] Verify RLS policies with real auth users.
- [ ] Apply to production only after explicit user approval.
