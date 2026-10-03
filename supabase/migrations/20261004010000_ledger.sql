-- Ledger: accounts, categories, transactions, live balances.
-- Money is bigint paise. Ownership is enforced twice: RLS on every table, and
-- composite foreign keys (id, user_id) so a row can only reference the same
-- user's accounts and categories.

-- ─── accounts ────────────────────────────────────────────────────────────────
create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  name             text not null check (char_length(name) between 1 and 40),
  type             text not null check (type in ('bank', 'cash', 'wallet', 'credit_card')),
  -- Balance when the account was added. Negative for money owed (credit cards).
  opening_balance  bigint not null default 0,
  archived         boolean not null default false,
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (id, user_id)
);

create index accounts_user_idx on public.accounts (user_id);

-- ─── categories ──────────────────────────────────────────────────────────────
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null check (char_length(name) between 1 and 30),
  kind          text not null check (kind in ('income', 'expense')),
  emoji         text not null default '📦',
  -- Essential spend (rent, groceries…) sizes the emergency fund later.
  is_essential  boolean not null default false,
  archived      boolean not null default false,
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_unique_name on public.categories (user_id, kind, lower(name));

-- ─── transactions ────────────────────────────────────────────────────────────
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  type           text not null check (type in ('income', 'expense', 'transfer')),
  amount         bigint not null check (amount > 0),
  occurred_on    date not null,
  account_id     uuid not null,
  to_account_id  uuid,
  category_id    uuid,
  note           text check (char_length(note) <= 200),
  source         text not null default 'manual' check (source in ('manual', 'nl', 'recurring', 'import')),
  created_at     timestamptz not null default now(),

  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),

  -- Transfers move money between two different accounts and have no category.
  check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id and category_id is null)
    or (type <> 'transfer' and to_account_id is null)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id) where to_account_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "accounts: own rows" on public.accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "categories: own rows" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transactions: own rows" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── balances (computed, never stored) ───────────────────────────────────────
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.opening_balance + coalesce(sum(
    case
      when t.type = 'income' and t.account_id = a.id then t.amount
      when t.type = 'expense' and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.account_id = a.id then -t.amount
      when t.type = 'transfer' and t.to_account_id = a.id then t.amount
    end
  ), 0)::bigint as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

-- ─── default categories for every new user ───────────────────────────────────
create or replace function private.seed_default_categories(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (user_id, kind, name, emoji, is_essential, sort)
  values
    (uid, 'income', 'Salary', '💼', false, 1),
    (uid, 'income', 'Freelance', '🧑‍💻', false, 2),
    (uid, 'income', 'Interest', '💹', false, 3),
    (uid, 'income', 'Refund', '↩️', false, 4),
    (uid, 'income', 'Gift received', '🎁', false, 5),
    (uid, 'income', 'Other income', '➕', false, 6),
    (uid, 'expense', 'Food & Dining', '🍔', false, 1),
    (uid, 'expense', 'Groceries', '🛒', true, 2),
    (uid, 'expense', 'Transport', '🚕', true, 3),
    (uid, 'expense', 'Rent', '🏠', true, 4),
    (uid, 'expense', 'Bills & Utilities', '💡', true, 5),
    (uid, 'expense', 'Shopping', '🛍️', false, 6),
    (uid, 'expense', 'Subscriptions', '📺', false, 7),
    (uid, 'expense', 'Health', '💊', true, 8),
    (uid, 'expense', 'Entertainment', '🎬', false, 9),
    (uid, 'expense', 'Travel', '✈️', false, 10),
    (uid, 'expense', 'Education', '📚', true, 11),
    (uid, 'expense', 'Family', '👨‍👩‍👧', true, 12),
    (uid, 'expense', 'Insurance', '🛡️', true, 13),
    (uid, 'expense', 'Personal care', '💇', false, 14),
    (uid, 'expense', 'Gifts & Donations', '🎁', false, 15),
    (uid, 'expense', 'Fees & Charges', '🧾', false, 16),
    (uid, 'expense', 'Other', '📦', false, 17)
  on conflict do nothing;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  perform private.seed_default_categories(new.id);
  return new;
end;
$$;

-- Users who signed up before this migration get the defaults too.
select private.seed_default_categories(id)
from auth.users u
where not exists (select 1 from public.categories c where c.user_id = u.id);
