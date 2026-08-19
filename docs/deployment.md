# Deployment

This app runs as a normal always-on Node/Express server (not a serverless
function), so it needs a host built for that — Railway, Render, Fly.io, a VPS,
etc. It does **not** run on Vercel without significant rework.

## Requirements

- Node 20+
- A MySQL 8-compatible database (Railway's MySQL service works out of the box)
- The environment variables listed in `.env.example`

## Startup behavior

`pnpm start` runs `drizzle-kit migrate` before starting the server, so a fresh
deploy against an empty database creates the schema automatically. This means
`DATABASE_URL` must be set and reachable before the service starts, or the
deploy will fail at the migration step — check the deploy logs for the exact
migration error if that happens.

## Minimum environment variables to boot

The app will start (and login/database features will work) with just:

- `DATABASE_URL`
- `JWT_SECRET`
- `OWNER_EMAIL`
- `NODE_ENV=production`

Everything else in `.env.example` (S3 photo storage, eBay credentials, the
Claude API key for the AI description writer) can be added later — the
features that need them fail gracefully with a clear error until configured,
rather than crashing the app.

## Railway specifics

- Add the repo as a GitHub-connected service, and add a MySQL service in the
  same project — reference its connection string from the app service as
  `DATABASE_URL = ${{MySQL.MYSQL_URL}}`.
- Generate a public domain for the app service under its Networking settings.
- For the eBay OAuth redirect (once eBay credentials are configured), the
  Accept URL registered in the eBay developer console must point at
  `https://<railway-domain>/connection`.
