import { cn } from "@/lib/cn";

const GRADE_COLOR = { A: "text-income", B: "text-save", C: "text-warn", D: "text-expense" } as const;
const GRADE_STROKE = { A: "stroke-income", B: "stroke-save", C: "stroke-warn", D: "stroke-expense" } as const;

/** Score out of 100 as a ring, grade in the middle. Colour carries the grade, the letter repeats it. */
export function ScoreRing({
  score,
  grade,
  size = 148,
}: {
  score: number;
  grade: "A" | "B" | "C" | "D";
  size?: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-glass-hover" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className={cn("transition-[stroke-dashoffset] duration-1000", GRADE_STROKE[grade])}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cn("leading-none font-semibold", GRADE_COLOR[grade])} style={{ fontSize: size * 0.3 }}>
            {grade}
          </p>
          {/* Small rings have no room for "100/100": the caller shows the number beside it. */}
          {size >= 100 && (
            <p className="text-muted mt-1 text-xs">
              <span className="text-fg font-semibold">{score}</span>/100
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
