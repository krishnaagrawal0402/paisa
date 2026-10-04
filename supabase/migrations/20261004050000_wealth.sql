-- Wealth: investments (holdings), loans, and invest/redeem transactions.
--
-- Values are computed, not stored: mutual funds are priced from public NAVs,
-- FDs from their rate, loans from their amortisation schedule. That keeps
-- history accurate (the net-worth trend is rebuilt from these) and means no
-- cron jobs or price-feed secrets for self-hosters.

-- ─── holdings ────────────────────────────────────────────────────────────────
create table public.holdings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  asset_class     text not null check (asset_class in ('mutual_fund', 'stock', 'fd', 'ppf', 'epf', 'nps', 'gold', 'crypto', 'other')),
  -- AMFI scheme code (mfapi.in) for mutual funds.
  scheme_code     integer,
  -- What was already held before tracking it here.
  opening_units   numeric(20, 6) not null default 0 check (opening_units >= 0),
  opening_cost    bigint not null default 0 check (opening_cost >= 0),
  opening_date    date,
  -- Manually updated value (stocks, PPF, EPF, NPS, gold, crypto, other).
  manual_value    bigint check (manual_value >= 0),
  manual_value_at date,
  -- Fixed deposits: principal is opening_cost (+ any top-ups).
  fd_rate         numeric(6, 3) check (fd_rate between 0 and 100),
  fd_start        date,
  fd_maturity     date,
  fd_compounding  text check (fd_compounding in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'simple')),
  archived        boolean not null default false,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, user_id),
  check (asset_class <> 'mutual_fund' or scheme_code is not null),
  check (asset_class <> 'fd' or (fd_rate is not null and fd_start is not null)),
  check (fd_maturity is null or fd_start is null or fd_maturity >= fd_start)
);

alter table public.holdings enable row level security;
create policy "holdings: own rows" on public.holdings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── loans ───────────────────────────────────────────────────────────────────
create table public.loans (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users on delete cascade,
  name                  text not null check (char_length(name) between 1 and 60),
  lender                text check (char_length(lender) <= 60),
  principal             bigint not null check (principal > 0),
  annual_rate           numeric(6, 3) not null check (annual_rate between 0 and 100),
  tenure_months         integer not null check (tenure_months between 1 and 600),
  first_emi_date        date not null,
  emi                   bigint not null check (emi > 0),
  -- After a prepayment: the outstanding as of a date; the schedule continues from there.
  outstanding_override  bigint check (outstanding_override >= 0),
  override_at           date,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (id, user_id),
  check ((outstanding_override is null) = (override_at is null))
);

alter table public.loans enable row level security;
create policy "loans: own rows" on public.loans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── invest / redeem transactions ────────────────────────────────────────────
-- invest: money leaves account_id into a holding. redeem: money comes back.
-- Neither is income or spending. units are optional: for mutual funds they're
-- worked out from that day's NAV when missing.
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'transfer', 'invest', 'redeem')),
  add column holding_id uuid,
  add column units numeric(20, 6) check (units > 0),
  add foreign key (holding_id, user_id) references public.holdings (id, user_id) on delete restrict,
  add constraint transactions_holding_check check (
    (type in ('invest', 'redeem')) = (holding_id is not null)
    and (type not in ('invest', 'redeem') or category_id is null)
  );

create index transactions_holding_idx on public.transactions (holding_id) where holding_id is not null;

alter table public.recurring_rules drop constraint recurring_rules_type_check;
alter table public.recurring_rules
  add constraint recurring_rules_type_check check (type in ('income', 'expense', 'transfer', 'invest')),
  add column holding_id uuid,
  add foreign key (holding_id, user_id) references public.holdings (id, user_id) on delete cascade,
  add constraint recurring_rules_holding_check check (
    (type = 'invest') = (holding_id is not null) and (type <> 'invest' or category_id is null)
  );

-- Balances: invest takes money out of the account, redeem puts it back.
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.opening_balance + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount
      when t.type = 'expense' and t.account_id = a.id then -t.amount
      when t.type = 'invest' and t.account_id = a.id then -t.amount
      when t.type = 'redeem' and t.account_id = a.id then t.amount
      when t.type = 'transfer' and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.to_account_id = a.id then t.amount
    end
  ), 0)::bigint as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

-- Account balances at several past dates, for the net-worth trend.
create or replace function public.account_balances_at(p_dates date[])
returns table (on_date date, account_id uuid, balance bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.on_date, a.id, (a.opening_balance + coalesce(sum(
    case
      when t.type in ('income', 'redeem') and t.account_id = a.id then t.amount
      when t.type in ('expense', 'invest') and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.to_account_id = a.id then t.amount
    end
  ), 0))::bigint
  from unnest(p_dates) as d(on_date)
  cross join public.accounts a
  left join public.transactions t
    on (t.account_id = a.id or t.to_account_id = a.id) and t.occurred_on <= d.on_date
  group by d.on_date, a.id, a.opening_balance;
$$;

revoke execute on function public.account_balances_at(date[]) from public, anon;
grant execute on function public.account_balances_at(date[]) to authenticated;

-- ─── recurring: carry holding_id when posting (SIPs) ─────────────────────────
create or replace function private.post_recurring_for(p_user uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurring_rules;
  due date;
  posted integer := 0;
  steps integer;
begin
  for r in
    select * from public.recurring_rules
    where user_id = p_user and active and mode = 'auto' and next_due <= p_today
    for update
  loop
    due := r.next_due;
    steps := 0;
    while due <= p_today and (r.end_date is null or due <= r.end_date) and steps < 60 loop
      insert into public.transactions
        (user_id, type, amount, occurred_on, account_id, to_account_id, category_id, holding_id, note, source, recurring_id, occurrence_date)
      values
        (r.user_id, r.type, r.amount, due, r.account_id, r.to_account_id, r.category_id, r.holding_id, r.name, 'recurring', r.id, due)
      on conflict (recurring_id, occurrence_date) do nothing;
      if found then
        posted := posted + 1;
      end if;
      due := private.next_occurrence(r.frequency, r.anchor_date, due);
      steps := steps + 1;
    end loop;
    update public.recurring_rules
    set next_due = due, active = (r.end_date is null or due <= r.end_date)
    where id = r.id;
  end loop;
  return posted;
end;
$$;

create or replace function public.confirm_recurring(
  p_rule uuid,
  p_amount bigint default null,
  p_occurred_on date default null,
  p_skip boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurring_rules;
begin
  select * into r from public.recurring_rules where id = p_rule and user_id = auth.uid() for update;
  if not found then
    raise exception 'Recurring rule not found';
  end if;
  if not p_skip then
    if coalesce(p_amount, r.amount) <= 0 then
      raise exception 'Amount must be above zero';
    end if;
    insert into public.transactions
      (user_id, type, amount, occurred_on, account_id, to_account_id, category_id, holding_id, note, source, recurring_id, occurrence_date)
    values
      (r.user_id, r.type, coalesce(p_amount, r.amount), coalesce(p_occurred_on, r.next_due), r.account_id,
       r.to_account_id, r.category_id, r.holding_id, r.name, 'recurring', r.id, r.next_due)
    on conflict (recurring_id, occurrence_date) do nothing;
  end if;
  update public.recurring_rules
  set next_due = private.next_occurrence(r.frequency, r.anchor_date, r.next_due)
  where id = r.id;
end;
$$;
