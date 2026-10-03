import type { Paise } from "@/lib/money";

const UNITS: Record<string, number> = {
  k: 1_000,
  l: 1_00_000,
  lac: 1_00_000,
  lakh: 1_00_000,
  lakhs: 1_00_000,
  cr: 1_00_00_000,
  crore: 1_00_00_000,
  crores: 1_00_00_000,
};

/**
 * Parse what people type for an amount into paise:
 * "450", "₹1,250.50", "12k", "1.2L", "1.2 lakh", "2cr". Returns null if it isn't one.
 */
export function parseAmount(input: string): Paise | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/[₹,\s]|rs\.?|inr/g, "");
  const match = text.match(/^(\d+(?:\.\d{1,2})?|\.\d{1,2})([a-z]*)$/);
  if (!match) return null;
  const [, number, unit] = match;
  const multiplier = unit ? UNITS[unit] : 1;
  if (!multiplier) return null;
  const paise = Math.round(Number(number) * multiplier * 100);
  return paise > 0 ? paise : null;
}
