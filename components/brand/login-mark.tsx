"use client";

import { motion } from "motion/react";

/** The logo's three bars rising in, with a soft pulse of glow behind them. */
export function LoginMark() {
  return (
    <div className="relative">
      <motion.div
        aria-hidden
        className="bg-income/40 absolute inset-0 rounded-3xl blur-2xl"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="from-income to-save relative flex size-20 items-end justify-center gap-1.5 rounded-3xl bg-linear-to-br p-4">
        {[0.35, 0.6, 0.9].map((height, i) => (
          <motion.span
            key={height}
            className="bg-bg w-[18%] origin-bottom rounded-md"
            style={{ height: `${height * 100}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 180, damping: 16 }}
          />
        ))}
      </div>
    </div>
  );
}
