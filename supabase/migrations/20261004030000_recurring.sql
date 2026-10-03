-- Recurring rules: salary, rent, SIPs, EMIs, subscriptions.
--
-- Posting happens in the database, two ways, both idempotent thanks to
-- unique (recurring_id, occurrence_date) on transactions:
--   * pg_cron runs private.post_recurring_for() for every user each morning
--   * the app calls public.post_due_recurring() on load, as a catch-up
-- 'confirm' rules (e.g. salary, whose amount varies) never auto-post; the app
-- asks the user and calls public.confirm_recurring().

-- ─── rules ───────────────────────────────────────────────────────────────────
create table public.recurring_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  name           text not null check (char_length(name) between 1 and 40),
  type           text not null check (type in ('income', 'expense', 'transfer')),
  amount         bigint not null check (amount > 0),
  account_id     uuid not null,
  to_account_id  uuid,
  category_id    uuid,
  frequency      text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  -- First occurrence. Later ones keep its day of month (31st → 30th/28th in short months, back to 31st after).
  anchor_date    date not null,
  next_due       date not null,
  end_date       date,
  mode           text not null default 'auto' check (mode in ('auto', 'confirm')),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (id, user_id),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),

  check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null)
  ),
  check (end_date is null or end_date >= anchor_date)
);

create index recurring_rules_due_idx on public.recurring_rules (user_id, next_due) where active;

alter table public.recurring_rules enable row level security;
create policy "recurring_rules: own rows" on public.recurring_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── link posted transactions back to their rule ─────────────────────────────
alter table public.transactions
  add column recurring_id uuid,
  add column occurrence_date date,
  add foreign key (recurring_id, user_id) references public.recurring_rules (id, user_id) on delete set null (recurring_id),
  add unique (recurring_id, occurrence_date);

-- ─── scheduling ──────────────────────────────────────────────────────────────
-- First occurrence strictly after p_after. Steps are counted from the anchor
-- (not chained), so a 31st rule returns to the 31st after February.
create or replace function private.next_occurrence(p_frequency text, p_anchor date, p_after date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  step interval := case p_frequency
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
    else interval '1 year'
  end;
  k integer;
  d date;
begin
  if p_anchor > p_after then
    return p_anchor;
  end if;
  -- Jump close to the answer, then walk forward.
  k := case p_frequency
    when 'weekly' then (p_after - p_anchor) / 7
    when 'monthly' then (extract(year from age(p_after, p_anchor)) * 12 + extract(month from age(p_after, p_anchor)))::integer
    else extract(year from age(p_after, p_anchor))::integer
  end;
  loop
    d := (p_anchor + k * step)::date;
    exit when d > p_after;
    k := k + 1;
  end loop;
  return d;
end;
$$;

-- Posts every due occurrence of a user's auto rules up to p_today (caps catch-up at 60 per rule).
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
        (user_id, type, amount, occurred_on, account_id, to_account_id, category_id, note, source, recurring_id, occurrence_date)
      values
        (r.user_id, r.type, r.amount, due, r.account_id, r.to_account_id, r.category_id, r.name, 'recurring', r.id, due)
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

-- Catch-up for the signed-in user, called by the app on load.
create or replace function public.post_due_recurring(p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return 0;
  end if;
  -- The app passes its local date; don't let a bogus value post the future.
  if p_today > current_date + 1 then
    raise exception 'p_today is in the future';
  end if;
  return private.post_recurring_for(auth.uid(), p_today);
end;
$$;

-- Confirm (or skip) the pending occurrence of a 'confirm' rule.
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
      (user_id, type, amount, occurred_on, account_id, to_account_id, category_id, note, source, recurring_id, occurrence_date)
    values
      (r.user_id, r.type, coalesce(p_amount, r.amount), coalesce(p_occurred_on, r.next_due), r.account_id,
       r.to_account_id, r.category_id, r.name, 'recurring', r.id, r.next_due)
    on conflict (recurring_id, occurrence_date) do nothing;
  end if;
  update public.recurring_rules
  set next_due = private.next_occurrence(r.frequency, r.anchor_date, r.next_due)
  where id = r.id;
end;
$$;

revoke execute on function public.post_due_recurring(date) from public, anon;
revoke execute on function public.confirm_recurring(uuid, bigint, date, boolean) from public, anon;
grant execute on function public.post_due_recurring(date) to authenticated;
grant execute on function public.confirm_recurring(uuid, bigint, date, boolean) to authenticated;

-- ─── daily job ───────────────────────────────────────────────────────────────
-- 00:30 UTC = 06:00 IST. The app's on-load catch-up covers anyone the job misses.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'paisa-post-recurring',
  '30 0 * * *',
  $$select private.post_recurring_for(id, (now() at time zone 'Asia/Kolkata')::date) from auth.users$$
);
