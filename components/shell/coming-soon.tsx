import { Card } from "@/components/ui/card";

/** Placeholder for pages whose milestone hasn't landed yet. See docs/PLAN.md §8. */
export function ComingSoon({ title, milestone, points }: { title: string; milestone: string; points: string[] }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      <Card>
        <p className="text-save text-xs font-medium tracking-[0.08em] uppercase">Coming in {milestone}</p>
        <ul className="text-muted mt-3 space-y-2 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-subtle">•</span>
              {p}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
