# skipped-risk-log

| Risky action | Reason skipped | Safe substitute completed |
| --- | --- | --- |
| Vercel production/preview deploy | External production/preview deployment requires explicit approval. | Added deployment checklist and local build/test scripts. |
| GitHub push / repo setting changes | Remote repository changes are irreversible without explicit approval. | Prepared local files and suggested commit message. |
| Supabase remote migration apply | Remote DB schema changes require explicit approval. | Added SQL migration draft under `supabase/migrations/`. |
| Remote DB data delete/truncate/drop | Destructive data operation. | No destructive SQL included. |
| Production environment variable changes | External configuration changes require explicit approval and secrets. | Added `.env.example` with variable names only. |
| Token/API key/service role key storage | Sensitive values must not be stored in repo. | Removed hardcoded Supabase public config from `js/app.js`; config now loads from env-backed API. |
| Paid resource creation or plan changes | Billing-impacting external action. | Documented required services only. |
| Destructive git cleanup/reset | Could lose user work. | Used non-destructive edits only. |
| Disabling RLS/auth or allowing global writes | Lowers security posture. | SQL draft enables RLS with owner-scoped policies. |
| In-app browser visual QA | The Browser plugin reported `iab` as unavailable in this Codex App session. | Started a local static server and verified HTTP 200 plus JS/API syntax and deployment readiness scripts. |
