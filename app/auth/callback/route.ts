import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/allowlist";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands here from:
 *   • the magic-link email     → ?token_hash=…&type=email (works in any browser)
 *   • Google OAuth / PKCE flow → ?code=…
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const { error } =
    tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("missing token") };

  if (error) return NextResponse.redirect(`${origin}/login?error=link`);

  // The database trigger already blocks new sign-ups outside the allowlist; this
  // also covers existing users removed from ALLOWED_EMAILS later.
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims.email as string | undefined) ?? "";
  if (!isEmailAllowed(email, getServerEnv().allowedEmails)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=restricted`);
  }

  return NextResponse.redirect(`${origin}/`);
}
