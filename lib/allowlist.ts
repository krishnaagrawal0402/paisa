/**
 * Sign-up allowlist. The same list is enforced in two places:
 *   1. the app (login action + auth callback), for friendly errors
 *   2. Postgres (private.guard_signup trigger), so it holds even if the UI is bypassed
 * An empty list means open sign-ups.
 */
export function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  const emails = raw
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(emails)];
}

export function isEmailAllowed(email: string, allowed: readonly string[]): boolean {
  return allowed.length === 0 || allowed.includes(email.trim().toLowerCase());
}
