import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { SiteFooter } from "@/components/shell/site-footer";
import { appConfig } from "@/config/app";
import { getServerEnv } from "@/lib/env";

export const metadata = { title: "Privacy" };

/**
 * Plain-language privacy notice for this instance. Kept true by construction:
 * every statement here describes what the open-source code does.
 */
export default function PrivacyPage() {
  const { operator, allowedEmails } = getServerEnv();
  const host = process.env.VERCEL ? "Vercel" : "its hosting provider";
  const runBy = operator.name ? (
    operator.url ? (
      <a href={operator.url} className="text-save hover:underline">
        {operator.name}
      </a>
    ) : (
      operator.name
    )
  ) : (
    "the person who set it up"
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-12">
      <div className="flex items-center justify-between">
        <Link href="/" aria-label={`${appConfig.name}, home`}>
          <LogoMark className="size-9" />
        </Link>
        <Link href="/" className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Back to {appConfig.name}
        </Link>
      </div>

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-muted mt-3">
        The short version: your money data is yours. It isn&apos;t shown to anyone else, sold, or used for ads.
      </p>

      <div className="[&_h2]:text-fg [&_p]:text-muted [&_ul]:text-muted mt-8 space-y-8 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Who runs this</h2>
          <p>
            This copy of {appConfig.name} is run by {runBy}. {appConfig.name} is open-source software: anyone can read
            the code or host their own copy.
            {allowedEmails.length > 0 && " Only people the operator has invited can create an account."}
          </p>
        </section>

        <section>
          <h2>What&apos;s stored</h2>
          <ul>
            <li>Your email address, so you can sign in.</li>
            <li>What you enter in settings, like your name and payday.</li>
            <li>
              The money details you add: accounts and balances, transactions, investments, loans, budgets and goals.
            </li>
          </ul>
        </section>

        <section>
          <h2>Where it lives, and who can see it</h2>
          <p>
            Everything is kept in this instance&apos;s own database on Supabase. Every row is locked to its owner by the
            database itself, so one account can never read another&apos;s data, even if the app had a bug. The app is
            served by {host}.
          </p>
        </section>

        <section>
          <h2>Bank statements</h2>
          <p>
            When you import a statement, the file is read inside your browser. Only the transactions you confirm are
            saved; the file itself is never uploaded or kept.
          </p>
        </section>

        <section>
          <h2>What isn&apos;t done</h2>
          <ul>
            <li>No ads, and no analytics or tracking scripts.</li>
            <li>Your data is never sold or shared for marketing.</li>
            <li>Shared report images hide amounts unless you choose to include them.</li>
          </ul>
        </section>

        <section>
          <h2>Other services involved</h2>
          <ul>
            <li>Supabase: the database, and sending sign-in emails.</li>
            <li>{host === "Vercel" ? "Vercel" : "The hosting provider"}: serving the app.</li>
            <li>mfapi.in: daily mutual fund prices. Only fund names and codes are sent, never anything about you.</li>
            <li>Google, only if you choose &ldquo;Continue with Google&rdquo; to sign in.</li>
          </ul>
        </section>

        <section>
          <h2>In your browser</h2>
          <p>
            Cookies keep you signed in. A few display preferences (hide amounts, the last account you used, dismissed
            banners) are remembered on your device only.
          </p>
        </section>

        <section>
          <h2>Your control</h2>
          <p>
            Download everything you&apos;ve entered, or delete your account and all its data, anytime from Settings →
            Your data. Deleting is permanent.
          </p>
        </section>

        {operator.email && (
          <section>
            <h2>Questions</h2>
            <p>
              Write to{" "}
              <a href={`mailto:${operator.email}`} className="text-save hover:underline">
                {operator.email}
              </a>
              .
            </p>
          </section>
        )}
      </div>

      <SiteFooter className="border-line mt-16 border-t pt-6" />
    </main>
  );
}
