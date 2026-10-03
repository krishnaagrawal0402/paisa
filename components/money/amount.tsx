"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatINR, type Paise } from "@/lib/money";

type AmountProps = {
  paise: Paise;
  compact?: boolean;
  sign?: boolean;
  /** Count up from zero on first render. */
  animated?: boolean;
  /** Equal-width digits, for numbers that line up in columns. Off for standalone figures. */
  tabular?: boolean;
  className?: string;
};

/** A rupee amount with an optional count-up. Blurs in privacy mode. */
export function Amount({
  paise,
  compact = false,
  sign = false,
  animated = true,
  tabular = false,
  className,
}: AmountProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const format = (value: number) =>
    compact ? formatCompactINR(Math.round(value), { sign }) : formatINR(Math.round(value), { sign });

  useEffect(() => {
    const node = ref.current;
    if (!node || !animated || reduceMotion || paise === 0) return;
    const controls = animate(0, paise, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        // Round to whole rupees mid-flight so digits don't flicker through paise.
        node.textContent = format(Math.round(value / 100) * 100);
      },
      onComplete: () => {
        node.textContent = format(paise);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format is derived from props already listed
  }, [paise, compact, sign, animated, reduceMotion]);

  return (
    <span ref={ref} className={cn("money", tabular && "tabular-nums", className)}>
      {format(paise)}
    </span>
  );
}
