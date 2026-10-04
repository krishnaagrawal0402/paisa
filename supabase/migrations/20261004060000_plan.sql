-- Plan: monthly category budgets, savings goals, and the emergency fund.

-- ─── budgets ─────────────────────────────────────────────────────────────────
create table public.budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  category_id    uuid not null,
  monthly_limit  bigint not null check (monthly_limit > 0),
  created_at     timestamptz not null default now(),
  unique (user_id, category_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

alter table public.budgets enable row level security;
create policy "budgets: own rows" on public.budgets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── goals ───────────────────────────────────────────────────────────────────
create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null check (char_length(name) between 1 and 40),
  emoji          text not null default '🎯' check (char_length(emoji) <= 16),
  kind           text not null default 'custom' check (kind in ('custom', 'emergency')),
  target_amount  bigint not null check (target_amount > 0),
  target_date    date,
  -- Saved somewhere not tracked here (cash at home, a friend's chit fund…).
  manual_saved   bigint not null default 0 check (manual_saved >= 0),
  achieved_at    timestamptz,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (id, user_id)
);

create unique index goals_one_emergency_fund on public.goals (user_id) where kind = 'emergency';

alter table public.goals enable row level security;
create policy "goals: own rows" on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Accounts and investments whose current value counts towards a goal.
create table public.goal_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id     uuid not null,
  account_id  uuid,
  holding_id  uuid,
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (holding_id, user_id) references public.holdings (id, user_id) on delete cascade,
  check ((account_id is null) <> (holding_id is null)),
  unique (goal_id, account_id),
  unique (goal_id, holding_id)
);

alter table public.goal_sources enable row level security;
create policy "goal_sources: own rows" on public.goal_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── spend per category over a range (aggregated in Postgres, no row cap) ─────
create or replace function public.category_spend(p_from date, p_to date)
returns table (category_id uuid, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category_id, sum(t.amount)::bigint
  from public.transactions t
  where t.type = 'expense' and t.occurred_on between p_from and p_to
  group by t.category_id;
$$;

revoke execute on function public.category_spend(date, date) from public, anon;
grant execute on function public.category_spend(date, date) to authenticated;
