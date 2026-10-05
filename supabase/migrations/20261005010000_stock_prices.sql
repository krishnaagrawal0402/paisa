-- Individual stocks with live prices. A stock holding with an ISIN is priced
-- automatically (units × price, like a mutual fund's NAV); without one it stays
-- a manually-valued portfolio total, as before.
alter table public.holdings
  add column isin text check (isin ~ '^IN[A-Z0-9]{9}[0-9]$'),
  -- Exchange symbol (NSE), for display and as a fallback price lookup.
  add column ticker text check (char_length(ticker) between 1 and 30),
  add constraint holdings_isin_only_for_stocks check (isin is null or asset_class = 'stock');
