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

1. Use the **Deploy with Vercel** button in the [README](../README.md#option-a-deploy-about-5-minutes-no-terminal). It copies the repo to your GitHub and asks for the env vars. Or fork the repo yourself, then **Add New → Project** in Vercel and import your fork.
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
2. **Optional (needs custom SMTP): Authentication → Emails → Magic link or OTP.** Replace the template body with the contents of [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html).
   This adds a **6-digit code** to the email. You need the code when Paisa is installed as an app on your phone, because tapping a link there opens the browser instead of the app.
   Hosted Supabase only lets you edit templates once custom SMTP is set up (Authentication → Emails → SMTP Settings; [Resend](https://resend.com)'s free tier works). Without it, the default email contains just the link, which works fine when opened **in the same browser** you requested it from.

> Supabase's built-in email sender is rate-limited (a few emails per hour), which is fine for one or two people. Custom SMTP lifts that limit too.

## 4. Optional: Google sign-in

1. Create OAuth credentials in Google Cloud Console (type: Web application). Set the authorised redirect URI to `https://<your-project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: paste the client ID and secret, then enable it.
3. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and redeploy.

The allowlist applies to Google too: the database refuses to create accounts for emails that aren't listed.

## Recurring entries (no setup needed)

Recurring rules (salary, rent, SIPs, subscriptions) are posted by the database itself:

- A **pg_cron** job (`paisa-post-recurring`, created by the migrations) runs every day at 00:30 UTC (06:00 IST).
- The app also catches up whenever it loads, so nothing is missed if the job is skipped.
- Both are idempotent: an occurrence can only ever be logged once.

Outside India? Change `timeZone` in `config/app.ts`, and the time zone in the `cron.schedule(...)` call at the end of
`supabase/migrations/20261004030000_recurring.sql` (add a new migration that re-runs `cron.schedule` with the same job name).

## Keeping your copy up to date

Click **Sync fork** on your fork's GitHub page. Vercel redeploys, and the build applies any new migrations before the new code goes live. If you cloned with the Deploy button instead of forking, pull from this repo: `git pull https://github.com/krishnaagrawal0402/paisa main`.

## Your data

- **Export:** Settings → Your data downloads everything as JSON (amounts in paise), or every transaction as a CSV for spreadsheets.
- **Delete:** Settings → Delete my account erases all your rows and your login.
- **Backups:** Supabase's free tier has no automatic backups you can restore yourself, so download an export now and then.
- **Free-tier pausing:** Supabase pauses free projects after about a week with no activity. Using the app keeps it awake. If it does pause, press **Restore** in the Supabase dashboard; nothing is lost.

## Trying it out

`npm run db:seed-demo -- you@example.com` fills an empty account with six months of sample data (sign in once first). `--wipe` removes it again and brings back the first-run setup.

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
