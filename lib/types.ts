import type { Paise } from "@/lib/money";

/** Row shapes, mirroring supabase/migrations. Amounts are paise. */

export type AccountType = "bank" | "cash" | "wallet" | "credit_card";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  opening_balance: Paise;
  archived: boolean;
  sort: number;
};

export type AccountWithBalance = Account & { balance: Paise };

export type CategoryKind = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  emoji: string;
  is_essential: boolean;
  archived: boolean;
  sort: number;
};

export type TransactionType = "income" | "expense" | "transfer";

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: Paise;
  occurred_on: string; // YYYY-MM-DD
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string | null;
  created_at: string;
};

export const ACCOUNT_TYPES: Record<AccountType, { label: string; emoji: string }> = {
  bank: { label: "Bank account", emoji: "🏦" },
  cash: { label: "Cash", emoji: "💵" },
  wallet: { label: "Wallet / UPI", emoji: "📱" },
  credit_card: { label: "Credit card", emoji: "💳" },
};
