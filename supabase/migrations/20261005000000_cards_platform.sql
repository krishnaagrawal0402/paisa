-- Credit card billing cycle, and where an investment is held.

-- Card bills: "₹18,400 due on the 18th" needs the statement day and due day.
-- Days 29–31 mean "the last day" in shorter months. All optional.
alter table public.accounts
  add column statement_day smallint check (statement_day between 1 and 31),
  add column due_day smallint check (due_day between 1 and 31),
  add column credit_limit bigint check (credit_limit > 0),
  add constraint accounts_card_fields_check check (
    type = 'credit_card' or (statement_day is null and due_day is null and credit_limit is null)
  );

-- Free-text label for the app or broker an investment lives in ("Kotak Neo", "ICICI iMobile").
alter table public.holdings
  add column platform text check (char_length(platform) between 1 and 40);
