# Self-hosting Paisa

Your instance = this code + your own Supabase project (free tier is plenty for personal use) + a host for the Next.js app (Vercel's free tier works). Nobody else can see your data.

## 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com/dashboard) and create a project. In India, pick the **Mumbai (ap-south-1)** region.
2. Save the database password somewhere safe.
3. Collect three values:

| Env var                                | Where to find it                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project Settings → API → Project URL                                                                                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_…`). The legacy `anon` key also works as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.                                                              |
| `SUPABASE_DB_URL`                      | **Connect** button → **Session pooler** connection string. Replace `[YOUR-PASSWORD]`; if the password contains special characters like `@ # / ?`, [URL-encode](https://www.urlencoder.org/) it first. |

> **Why the Session pooler?** The direct connection is IPv6-only, and Vercel's build machines can't reach IPv6. The session pooler works everywhere.

## 2. Run the app

### On Vercel

1. Fork the repo, then **Add New → Project** in Vercel and import your fork.
2. Add the env vars: the three above, plus `ALLOWED_EMAILS` (your email; comma-separate several).
3. Deploy. The build runs `scripts/db-deploy.mjs` first, which applies every migration and syncs `ALLOWED_EMAILS` into the database. **If the database step fails, the deploy fails**, so code never runs against an old schema.
4. Optional: set `SITE_URL` to your production URL (for example `https://paisa-you.vercel.app`).

### Locally

```bash
npm install
npm run setup   # prompts for the values above, writes .env.local, migrates
npm run dev
```

## 3. One-time auth settings

These two settings live in Supabase Auth config rather than the database, so set them in the dashboard once:

1. **Authentication → URL Configuration**
   - **Site URL:** your app's URL (`https://paisa-you.vercel.app`, or `http://localhost:3000` for local-only)
   - **Redirect URLs:** add `https://paisa-you.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
2. **Authentication → Emails → Magic Link:** replace the template body with the contents of [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html).
   This adds a **6-digit code** to the email. You need the code when Paisa is installed as an app on your phone, because tapping a link there opens the browser instead of the app.

> Supabase's built-in email sender is rate-limited (a few emails per hour), which is fine for one or two people. For more, add custom SMTP (for example Resend) under Authentication → Emails → SMTP Settings.

## 4. Optional: Google sign-in

1. Create OAuth credentials in Google Cloud Console (type: Web application). Set the authorised redirect URI to `https://<your-project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: paste the client ID and secret, then enable it.
3. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and redeploy.

The allowlist applies to Google too: the database refuses to create accounts for emails that aren't listed.

## Who can sign in?

- `ALLOWED_EMAILS` is checked in the app **and** enforced by a Postgres trigger, `private.guard_signup`. Strangers can't create accounts even by calling Supabase directly.
- Removing an email later blocks that person at their next sign-in.
- Leaving it empty means open sign-ups. Do that only if you really intend to run a public instance.

## Troubleshooting

| Symptom                                             | Fix                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid public environment configuration` on start | A `NEXT_PUBLIC_SUPABASE_*` var is missing. Check `.env.local` or the Vercel env settings, then **redeploy** (public vars are baked in at build time). |
| Build fails at "Applying migrations"                | Check `SUPABASE_DB_URL`: it must be the **Session pooler** string with a URL-encoded password.                                                        |
| Sign-in link says "invalid or expired"              | The Redirect URLs in step 3 don't include your `/auth/callback`, or the link was already used. Use the 6-digit code instead.                          |
| "This is a private instance"                        | Your email isn't in `ALLOWED_EMAILS`. Add it and redeploy (or run `npm run db:deploy` locally).                                                       |
