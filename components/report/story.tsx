"use client";

import { Play, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Amount } from "@/components/money/amount";
import { ScoreRing } from "@/components/report/score-ring";
import { ShareButton } from "@/components/report/share-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Report } from "@/lib/report";

const SLIDE_MS = 6000;

type Slide = { key: string; glow: string; body: React.ReactNode };

function buildSlides(r: Report): Slide[] {
  const monthName = r.month.label.replace(/ \d{4}$/, "");
  const slides: Slide[] = [
    {
      key: "intro",
      glow: "from-invest/40",
      body: (
        <>
          <p className="text-muted text-sm tracking-[0.2em] uppercase">Paisa</p>
          <p className="mt-4 text-5xl leading-tight font-semibold tracking-tight">
            Your {monthName}
            <br />
            in money ✨
          </p>
        </>
      ),
    },
  ];
  if (r.totals.income > 0)
    slides.push({
      key: "earned",
      glow: "from-income/40",
      body: (
        <>
          <p className="text-muted text-lg">You earned</p>
          <p className="text-income glow-income mt-3 text-6xl font-semibold tracking-tight">
            <Amount paise={r.totals.income} />
          </p>
        </>
      ),
    });
  slides.push({
    key: "spent",
    glow: "from-expense/40",
    body: (
      <>
        <p className="text-muted text-lg">You spent</p>
        <p className="mt-3 text-6xl font-semibold tracking-tight">
          <Amount paise={r.totals.spent} />
        </p>
        {r.topCategories[0] && (
          <p className="text-muted mt-6 text-lg">
            Most of it on{" "}
            <span className="text-fg">
              {r.topCategories[0].emoji} {r.topCategories[0].name}
            </span>{" "}
            ({Math.round(r.topCategories[0].share * 100)}%)
          </p>
        )}
      </>
    ),
  });
  if (r.totals.savingsRate !== null)
    slides.push({
      key: "saved",
      glow: "from-save/40",
      body: (
        <>
          <p className="text-muted text-lg">You kept</p>
          <p className="text-save mt-3 text-8xl font-semibold tracking-tight">
            {Math.round(r.totals.savingsRate * 100)}%
          </p>
          <p className="text-muted mt-4 text-lg">
            of what you earned: <Amount paise={r.totals.saved} className="text-fg" />
          </p>
        </>
      ),
    });
  if (r.biggestExpense)
    slides.push({
      key: "biggest",
      glow: "from-warn/30",
      body: (
        <>
          <p className="text-muted text-lg">Biggest single spend</p>
          <p className="mt-4 text-6xl">{r.biggestExpense.emoji}</p>
          <p className="mt-3 text-3xl font-semibold">{r.biggestExpense.note}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            <Amount paise={r.biggestExpense.amount} />
          </p>
        </>
      ),
    });
  slides.push({
    key: "nospend",
    glow: "from-save/30",
    body: (
      <>
        <p className="text-muted text-lg">No-spend days</p>
        <p className="mt-3 text-8xl font-semibold tracking-tight">{r.noSpendDays}</p>
        <p className="text-muted mt-3 text-lg">out of {r.daysCounted}</p>
      </>
    ),
  });
  slides.push({
    key: "score",
    glow: "from-income/30",
    body: (
      <>
        <p className="text-muted mb-6 text-lg">Your health score</p>
        <ScoreRing score={r.health.score} grade={r.health.grade} size={200} />
        {r.previousScore !== null && (
          <p className={cn("mt-6 text-lg", r.health.score >= r.previousScore ? "text-income" : "text-expense")}>
            {r.health.score >= r.previousScore ? "▲" : "▼"} {Math.abs(r.health.score - r.previousScore)} from last month
          </p>
        )}
      </>
    ),
  });
  slides.push({
    key: "share",
    glow: "from-invest/40",
    body: (
      <>
        <p className="text-4xl font-semibold tracking-tight">That&apos;s your {monthName}.</p>
        <p className="text-muted mt-3">Share it: amounts stay hidden unless you choose to include them.</p>
        <div className="mt-8" onClick={(e) => e.stopPropagation()}>
          <ShareButton monthKey={r.month.key} />
        </div>
      </>
    ),
  });
  return slides;
}

export function StoryButton({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-10 px-4">
        <Play className="size-4" /> Play story
      </Button>
      {open && <Story report={report} onClose={() => setOpen(false)} />}
    </>
  );
}

function Story({ report, onClose }: { report: Report; onClose: () => void }) {
  const [slides] = useState(() => buildSlides(report));
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) =>
      setIndex((i) => {
        const next = i + delta;
        if (next >= slides.length) {
          onClose();
          return i;
        }
        return Math.max(0, next);
      }),
    [slides.length, onClose],
  );

  // Auto-advance; the last slide waits for the person.
  useEffect(() => {
    if (paused || index === slides.length - 1) return;
    const timer = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, paused, go, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  const slide = slides[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${report.month.label} story, slide ${index + 1} of ${slides.length}`}
      className="bg-bg fixed inset-0 z-[70] flex items-center justify-center overflow-hidden"
      onPointerDown={(e) => {
        touchX.current = e.clientX;
        setPaused(true);
      }}
      onPointerUp={(e) => {
        setPaused(false);
        const start = touchX.current;
        touchX.current = null;
        if (start === null) return;
        const dx = e.clientX - start;
        if (Math.abs(dx) > 50)
          go(dx < 0 ? 1 : -1); // swipe
        else go(e.clientX < window.innerWidth / 3 ? -1 : 1); // tap: left third goes back
      }}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-radial-[at_50%_30%] to-transparent to-70% transition-colors duration-700",
          slide.glow,
        )}
      />

      <div className="pt-safe absolute inset-x-0 top-0 z-10 px-4 pt-4">
        <div className="flex gap-1.5">
          {slides.map((s, i) => (
            <div key={s.key} className="bg-fg/20 h-1 flex-1 overflow-hidden rounded-full">
              <div
                className={cn(
                  "bg-fg h-full",
                  i === index && !paused && !reduceMotion && index !== slides.length - 1 && "animate-story",
                )}
                style={{
                  width:
                    i < index
                      ? "100%"
                      : i === index && (reduceMotion || index === slides.length - 1)
                        ? "100%"
                        : i === index
                          ? undefined
                          : "0%",
                  animationDuration: `${SLIDE_MS}ms`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close story"
            className="text-muted hover:text-fg grid size-10 place-items-center rounded-full"
          >
            <X className="size-6" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide.key}
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="relative z-0 flex max-w-md flex-col items-center px-8 text-center"
        >
          {slide.body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
