# QA Preflight Checklist

This project is a static browser game with Vercel serverless API routes and Upstash Redis persistence.

## Safe local checks

Run before handing work to deploy/release:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Current script intent:

- `npm run lint`: dependency-free QA preflight for JavaScript syntax and local static asset references.
- `npm run typecheck`: Node syntax checks for API/client JavaScript files.
- `npm test`: runs lint and typecheck.
- `npm run build`: aliases the test preflight because this project has no bundler build step yet.

The QA scripts avoid printing environment secret values.

## Manual QA focus

- Desktop-first game flow: landing -> mode selection -> face selection -> gameplay -> result -> ranking.
- Mobile/coarse pointer state: `css/style.css` intentionally hides the app and shows a PC-only overlay at `max-width: 768px` or coarse pointer.
- Fonts: Google Fonts import is required for `Black Han Sans`, `Noto Sans KR`, and `Inter`; verify Korean text does not wrap or clip on Windows Chrome/Edge.
- Layout: check 1366x768, 1920x1080, and a narrow mobile viewport for the PC-only overlay.
- Ranking/API: Vercel must provide `KV_REST_API_URL` and `KV_REST_API_TOKEN`; do not print or commit their values.
- Auth: the client Supabase anon/public config must be backed by correct RLS and OAuth redirect settings.

## Known QA risks

- `js/app.js` uses a `debugger` timing check for devtools detection. Confirm it does not interrupt normal play in target browsers.
- CDN scripts for Supabase and Three.js are runtime dependencies; offline/local file testing will not cover CDN outages.
- The serverless API cannot be fully smoke-tested without Vercel/Upstash environment variables.
