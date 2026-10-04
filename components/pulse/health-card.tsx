import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScoreRing } from "@/components/report/score-ring";
import type { Health } from "@/lib/finance/health";

/** This month's score so far, linking to the full report card. */
export function HealthCard({ health, monthKey, monthLabel }: { health: Health; monthKey: string; monthLabel: string }) {
  const weakest = health.pillars
    .filter((p) => p.ratio !== null && p.ratio < 1)
    .sort((a, b) => (a.ratio! - 1) * a.weight - (b.ratio! - 1) * b.weight)[0];
  return (
    <Link
      href={`/report/${monthKey}`}
      className="glass hover:bg-glass-hover flex items-center gap-4 p-4 transition-colors"
    >
      <ScoreRing score={health.score} grade={health.grade} size={72} />
      <div className="min-w-0 flex-1">
        <p className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
          Health score · {monthLabel} · <span className="text-fg">{health.score}/100</span>
        </p>
        <p className="mt-1 text-sm">
          {weakest ? (
            <>
              Biggest lift: <span className="font-medium">{weakest.label.toLowerCase()}</span>{" "}
              <span className="text-muted">({weakest.value})</span>
            </>
          ) : (
            "Every pillar at full marks. Nice."
          )}
        </p>
      </div>
      <ChevronRight className="text-subtle size-5 shrink-0" />
    </Link>
  );
}
