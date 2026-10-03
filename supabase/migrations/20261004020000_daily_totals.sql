-- Per-day income/expense totals, so charts never pull raw rows (the API caps
-- responses at 1,000). SECURITY INVOKER: RLS on transactions still applies.
create or replace function public.daily_totals(p_from date, p_to date)
returns table (occurred_on date, type text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.occurred_on, t.type, sum(t.amount)::bigint
  from public.transactions t
  where t.occurred_on between p_from and p_to
    and t.type in ('income', 'expense')
  group by t.occurred_on, t.type
  order by t.occurred_on;
$$;

revoke execute on function public.daily_totals(date, date) from public, anon;
grant execute on function public.daily_totals(date, date) to authenticated;
