-- Smart entry: bank statement import + learned categorisation rules.

-- ─── import batches (so an import can be undone in one go) ───────────────────
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  account_id  uuid not null,
  filename    text not null check (char_length(filename) <= 200),
  row_count   integer not null default 0,
  -- Opening-balance shift applied so the account's current balance didn't change (undo reverses it).
  opening_adjustment bigint not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

alter table public.import_batches enable row level security;
create policy "import_batches: own rows" on public.import_batches for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── transactions: where an imported row came from ───────────────────────────
alter table public.transactions
  add column import_batch_id uuid,
  -- Fingerprint of the statement line; re-importing the same file adds nothing.
  add column import_hash text check (char_length(import_hash) <= 64),
  add foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete set null (import_batch_id),
  add unique (account_id, import_hash);

create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;

-- ─── column mapping remembered per account ───────────────────────────────────
create table public.import_profiles (
  account_id  uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  mapping     jsonb not null,
  updated_at  timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

alter table public.import_profiles enable row level security;
create policy "import_profiles: own rows" on public.import_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── learned rules: "swiggy" → Food & Dining ─────────────────────────────────
create table public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  -- Lower-case merchant keyword matched against cleaned descriptions and typed notes.
  pattern      text not null check (char_length(pattern) between 2 and 60 and pattern = lower(pattern)),
  category_id  uuid not null,
  created_at   timestamptz not null default now(),
  unique (user_id, pattern),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

alter table public.category_rules enable row level security;
create policy "category_rules: own rows" on public.category_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── import / undo, atomically ───────────────────────────────────────────────
-- SECURITY INVOKER: every insert/update is checked by RLS as the calling user.
-- p_rows: [{type, amount, occurred_on, account_id, to_account_id, category_id, note, import_hash}]
-- p_keep_balance: the account's current balance already includes these lines
-- (the usual case: you added the account with today's balance, then import
-- history), so shift the opening balance by the imported net to keep it.
create or replace function public.import_statement(
  p_account uuid,
  p_filename text,
  p_rows jsonb,
  p_keep_balance boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_inserted integer;
  v_net bigint;
begin
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import at most 5,000 rows at a time';
  end if;

  insert into public.import_batches (account_id, filename)
  values (p_account, left(p_filename, 200))
  returning id into v_batch;

  with incoming as (
    select *
    from jsonb_to_recordset(p_rows) as r(
      type text, amount bigint, occurred_on date, account_id uuid, to_account_id uuid,
      category_id uuid, note text, import_hash text
    )
  ),
  inserted as (
    insert into public.transactions
      (type, amount, occurred_on, account_id, to_account_id, category_id, note, source, import_batch_id, import_hash)
    select type, amount, occurred_on, account_id, to_account_id, category_id, left(note, 200), 'import', v_batch, import_hash
    from incoming
    where p_account in (account_id, to_account_id)
    on conflict (account_id, import_hash) do nothing
    returning type, amount, account_id
  )
  select
    count(*),
    coalesce(sum(case
      when type = 'income' then amount
      when type = 'expense' then -amount
      when account_id = p_account then -amount -- transfer out of this account
      else amount                               -- transfer into it
    end), 0)
  into v_inserted, v_net
  from inserted;

  -- Everything was already imported: don't leave an empty batch behind.
  if v_inserted = 0 then
    delete from public.import_batches where id = v_batch;
    return jsonb_build_object('batch_id', null, 'inserted', 0, 'net', 0);
  end if;

  if p_keep_balance and v_net <> 0 then
    update public.accounts set opening_balance = opening_balance - v_net where id = p_account;
  end if;

  update public.import_batches
  set row_count = v_inserted, opening_adjustment = case when p_keep_balance then -v_net else 0 end
  where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'inserted', v_inserted, 'net', v_net);
end;
$$;

-- Removes everything an import added and reverses its opening-balance shift.
create or replace function public.undo_import(p_batch uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_deleted integer;
begin
  select * into v_batch from public.import_batches where id = p_batch;
  if not found then
    raise exception 'Import not found';
  end if;
  delete from public.transactions where import_batch_id = p_batch;
  get diagnostics v_deleted = row_count;
  update public.accounts set opening_balance = opening_balance - v_batch.opening_adjustment where id = v_batch.account_id;
  delete from public.import_batches where id = p_batch;
  return v_deleted;
end;
$$;

revoke execute on function public.import_statement(uuid, text, jsonb, boolean) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.import_statement(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.undo_import(uuid) to authenticated;
