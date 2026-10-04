import "server-only";
import { cache } from "react";
import { getAccounts, getToday } from "@/lib/data";
import { cardBill, lastStatementDate, type CardBill } from "@/lib/finance/card";
import { createClient } from "@/lib/supabase/server";

export type CardBillWithName = CardBill & { accountId: string; name: string };

/** The current bill for every active card that has its statement and due days set. */
export const getCardBills = cache(async (): Promise<CardBillWithName[]> => {
  const today = getToday();
  const cards = (await getAccounts()).filter(
    (a) => a.type === "credit_card" && a.statement_day !== null && a.due_day !== null,
  );
  if (cards.length === 0) return [];

  const statementOf = new Map(cards.map((c) => [c.id, lastStatementDate(today, c.statement_day!)]));
  const dates = [...new Set(statementOf.values())];
  const since = dates.reduce((a, b) => (a < b ? a : b));
  const ids = cards.map((c) => c.id);

  const supabase = await createClient();
  const [{ data: balances, error: balanceError }, { data: credits, error: creditError }] = await Promise.all([
    supabase.rpc("account_balances_at", { p_dates: dates }),
    // Money into a card after a statement: payments (transfers in) and refunds.
    supabase
      .from("transactions")
      .select("type, amount, occurred_on, account_id, to_account_id")
      .gt("occurred_on", since)
      .or(`to_account_id.in.(${ids.join(",")}),and(account_id.in.(${ids.join(",")}),type.in.(income,redeem))`),
  ]);
  if (balanceError) throw balanceError;
  if (creditError) throw creditError;

  return cards.map((card) => {
    const statementDate = statementOf.get(card.id)!;
    const balance = (balances as { on_date: string; account_id: string; balance: number }[]).find(
      (b) => b.account_id === card.id && b.on_date === statementDate,
    );
    const paidSince = (credits ?? [])
      .filter((t) => t.occurred_on > statementDate)
      .filter((t) => (t.type === "transfer" ? t.to_account_id === card.id : t.account_id === card.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      accountId: card.id,
      name: card.name,
      ...cardBill({
        today,
        statementDay: card.statement_day!,
        dueDay: card.due_day!,
        // A card's balance is negative while you owe on it.
        owedAtStatement: -Number(balance?.balance ?? card.opening_balance),
        paidSince,
      }),
    };
  });
});
