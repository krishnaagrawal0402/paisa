-- Foundation: private config schema, sign-up allowlist, profiles.
--
-- Conventions for every migration in this repo:
--   * money is bigint paise, never numeric/float
--   * every user-owned table has user_id + RLS "user_id = auth.uid()"
--   * nothing here may depend on dashboard clicks; a fresh database + these files = working app

-- ─── private schema (not exposed through the Supabase API) ───────────────────
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Emails allowed to sign up. Synced from the ALLOWED_EMAILS env var on every
-- deploy (scripts/db-deploy.mjs). Empty table = open sign-ups.
create table private.allowed_emails (
  email text primary key check (email = lower(email))
);

create or replace function private.guard_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.allowed_emails)
     and not exists (
       select 1 from private.allowed_emails where email = lower(new.email)
     ) then
    raise exception 'Sign-ups are restricted on this instance'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_signup
  before insert on auth.users
  for each row execute function private.guard_signup();

-- ─── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id                       uuid primary key references auth.users on delete cascade,
  display_name             text,
  -- Financial month starts on payday. 1 = calendar month.
  month_start_day          smallint not null default 1 check (month_start_day between 1 and 28),
  savings_target_pct       smallint not null default 20 check (savings_target_pct between 0 and 100),
  emergency_months_target  smallint not null default 6 check (emergency_months_target between 1 and 24),
  onboarded_at             timestamptz,
  created_at               timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
