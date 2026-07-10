# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue.

Use GitHub's private reporting: go to the **Security** tab of this repository and
click **Report a vulnerability**. Include what you found, how to reproduce it,
and the impact you expect. We'll acknowledge the report and keep you posted on
the fix.

Please give us reasonable time to release a fix before disclosing publicly.

## Supported versions

Keepou is developed on `main`. Fixes land there; there is no separate LTS branch.
If you self-host, track `main` (or the published images) to stay current.

## Notes for self-hosters

You run your own instance, so a few things are on you:

- Set a strong, unique `SESSION_SECRET`. It signs the auth tokens; anyone who
  knows it can forge sessions. The API refuses to start against a non-SQLite
  database while `SESSION_SECRET` is still the default.
- Serve the app over HTTPS in production (terminate TLS at your reverse proxy).
- Keep the containers updated.
- Registration is gated by the server-side allowlist, and the first account
  created becomes the admin — create it yourself right after deploying.
