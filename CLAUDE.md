@AGENTS.md

# Paisa: project notes for coding agents

- Plan and scope: `docs/PLAN.md` (milestones in §8, self-hosting rules in §7b). Check new work against §7b.
- Next.js 16: `proxy.ts` (not middleware), async `cookies()`/`params`/`searchParams`. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- Money is integer paise everywhere (`lib/money.ts`). Never floats, never rupees in the DB.
- Schema changes go only through `supabase/migrations/` (`npm run db:new <name>`). Every user table gets RLS `user_id = (select auth.uid())`.
- Config comes only from env vars, validated in `lib/env.ts` and documented in `.env.example`. No personal data in code.
- Finance math is pure functions in `lib/` with Vitest tests next to them.
- Checks: `npm run lint && npm run typecheck && npm test`.
