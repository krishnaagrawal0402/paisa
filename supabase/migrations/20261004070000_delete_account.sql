-- "Delete my account": removes everything the signed-in user owns, then their login.
-- Explicit order, because some foreign keys are ON DELETE RESTRICT on purpose
-- (an account with transactions can't be deleted by accident).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.goal_sources where user_id = uid;
  delete from public.goals where user_id = uid;
  delete from public.budgets where user_id = uid;
  delete from public.category_rules where user_id = uid;
  delete from public.transactions where user_id = uid;
  delete from public.recurring_rules where user_id = uid;
  delete from public.import_profiles where user_id = uid;
  delete from public.import_batches where user_id = uid;
  delete from public.holdings where user_id = uid;
  delete from public.loans where user_id = uid;
  delete from public.accounts where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
