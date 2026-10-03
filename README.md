# Paisa

**Know where your money goes.** A simple, open-source money manager for salary, spends, investments and savings, with a clear monthly picture of how you're doing. Works on web and installs on your phone (PWA). INR-first.

> 🚧 Early days. Phase 1 (personal money management) is being built milestone by milestone; see [docs/PLAN.md](docs/PLAN.md). Phase 2 adds Splitwise-style shared expenses.

## Run your own copy

Paisa is self-hosted: **your data lives in your own Supabase project**, and sign-ups are locked to the emails you list.

### Option A: deploy (about 5 minutes, no terminal)

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. Fork this repo and import it in [Vercel](https://vercel.com/new).
3. Add the env vars from [`.env.example`](.env.example). Migrations run automatically during the build.
4. Do the two one-time auth settings in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md#3-one-time-auth-settings).

### Option B: run locally

Needs Node.js 20.9+.

```bash
git clone <your-fork> paisa && cd paisa
npm install
npm run setup            # asks for your Supabase details, writes .env.local, migrates the DB
npm run dev              # → http://localhost:3000
```

Prefer everything on your machine? `npm run setup -- --local` runs Supabase in Docker instead.

## Development

| Command                              | What it does                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `npm run dev`                        | Start the app                                                            |
| `npm test`                           | Unit tests (Vitest)                                                      |
| `npm run lint` · `npm run typecheck` | Static checks                                                            |
| `npm run db:new <name>`              | Create a new migration in `supabase/migrations/`                         |
| `npm run db:deploy`                  | Apply migrations + sync `ALLOWED_EMAILS` to the database in `.env.local` |

House rules: money is always integer **paise**; the schema changes only through migrations; every table has row-level security; nothing personal goes in code. More in [docs/PLAN.md](docs/PLAN.md#7b-self-hosting-by-design).

**Stack:** Next.js 16 · TypeScript · Tailwind CSS 4 · Motion · Supabase (Postgres, Auth, RLS) · Vercel

## License

[MIT](LICENSE)
