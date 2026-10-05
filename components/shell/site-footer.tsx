import Link from "next/link";
import { appConfig } from "@/config/app";
import { cn } from "@/lib/cn";
import { getServerEnv } from "@/lib/env";

/** "© 2026 Operator · Privacy · Source code · Contact". The operator comes from env vars; without one it's plain Paisa. */
export function SiteFooter({ className }: { className?: string }) {
  const { operator } = getServerEnv();
  const year = new Date().getFullYear();
  const link = "hover:text-fg underline-offset-4 transition-colors hover:underline";

  return (
    <footer className={cn("text-subtle text-xs", className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-between">
        <p>
          {operator.name ? (
            <>
              © {year}{" "}
              {operator.url ? (
                <a href={operator.url} className={link}>
                  {operator.name}
                </a>
              ) : (
                operator.name
              )}
            </>
          ) : (
            <>{appConfig.name} · open-source money manager</>
          )}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
          <a href={appConfig.sourceUrl} className={link} target="_blank" rel="noopener noreferrer">
            Source code
          </a>
          {operator.email && (
            <a href={`mailto:${operator.email}`} className={link}>
              Contact
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
